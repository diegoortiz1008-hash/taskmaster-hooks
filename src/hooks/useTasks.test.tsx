// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { SupabaseProvider } from '../context/SupabaseProvider'
import { createFakeSupabase } from '../lib/fakeSupabase'
import { useComments } from './useComments'
import { useTasks } from './useTasks'

const ANA = 'user-ana'
const BETO = 'user-beto'
const P1 = 'project-1'
const P2 = 'project-2'

const taskRow = (id: string, project: string, title: string, minutesAgo: number) => {
  const ts = new Date(Date.now() - minutesAgo * 60_000).toISOString()
  return {
    id, project_id: project, title, description: null, status: 'todo', priority: 'medium',
    assignee_id: null, created_by: BETO, created_at: ts, updated_at: ts,
  }
}

function setup(options: { latency?: number } = {}) {
  const fake = createFakeSupabase({
    currentUserId: ANA,
    latency: options.latency,
    seed: {
      tasks: [
        taskRow('t1', P1, 'Definir contrato de hooks', 30),
        taskRow('t2', P1, 'Configurar RLS', 20),
        taskRow('t3', P2, 'Tarea de otro proyecto', 10),
      ],
    },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SupabaseProvider client={fake.client}>{children}</SupabaseProvider>
  )
  return { fake, wrapper }
}

async function renderTasks(wrapper: ReturnType<typeof setup>['wrapper'], projectId: string | null = P1) {
  const hook = renderHook(({ id }) => useTasks(id), { wrapper, initialProps: { id: projectId } })
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false))
  await waitFor(() => expect(hook.result.current.realtimeStatus).toBe('subscribed'))
  return hook
}

describe('useTasks · fetching', () => {
  it('carga solo las tareas del proyecto, más recientes primero', async () => {
    const { wrapper } = setup()
    const { result } = await renderTasks(wrapper)
    expect(result.current.tasks.map((t) => t.id)).toEqual(['t2', 't1'])
    expect(result.current.error).toBeNull()
  })

  it('expone el error (p. ej. RLS) y permite reintentar', async () => {
    const { fake, wrapper } = setup()
    fake.failNext('tasks', 'select', '42501')
    const { result } = renderHook(() => useTasks(P1), { wrapper })
    await waitFor(() => expect(result.current.error).toMatch(/permiso/))
    act(() => result.current.retry())
    expect(result.current.isLoading).toBe(true)
    await waitFor(() => expect(result.current.tasks).toHaveLength(2))
    expect(result.current.error).toBeNull()
  })
})

describe('useTasks · mutaciones optimistas', () => {
  it('createTask muestra la tarea al instante y luego la reemplaza por la real sin duplicar', async () => {
    const { wrapper } = setup({ latency: 30 })
    const { result } = await renderTasks(wrapper)

    let promise!: Promise<unknown>
    act(() => {
      promise = result.current.createTask({ title: 'Escribir memoria técnica' })
    })
    // Optimista: ya está en la lista con id temporal y marcada como pendiente
    const temp = result.current.tasks[0]
    expect(temp.title).toBe('Escribir memoria técnica')
    expect(temp.id).toMatch(/^temp-/)
    expect(result.current.pendingIds.has(temp.id)).toBe(true)

    await act(async () => {
      await promise
    })
    // El eco de Realtime (INSERT) y la respuesta del insert no generan duplicados
    await waitFor(() => expect(result.current.tasks.filter((t) => t.title === 'Escribir memoria técnica')).toHaveLength(1))
    expect(result.current.tasks[0].id).not.toMatch(/^temp-/)
    expect(result.current.pendingIds.size).toBe(0)
  })

  it('updateTask hace rollback si Supabase/RLS rechaza el cambio', async () => {
    const { fake, wrapper } = setup({ latency: 20 })
    const { result } = await renderTasks(wrapper)
    fake.failNext('tasks', 'update', '42501')

    let promise!: Promise<boolean>
    act(() => {
      promise = result.current.updateTask('t1', { status: 'done' })
    })
    expect(result.current.tasks.find((t) => t.id === 't1')?.status).toBe('done') // optimista

    let ok = true
    await act(async () => {
      ok = await promise
    })
    expect(ok).toBe(false)
    expect(result.current.tasks.find((t) => t.id === 't1')?.status).toBe('todo') // rollback
    expect(result.current.mutationError).toMatch(/permiso/)
  })

  it('deleteTask quita la tarea al instante y la restaura si la BD no borró nada', async () => {
    const { fake, wrapper } = setup()
    const { result } = await renderTasks(wrapper)

    await act(async () => {
      await result.current.deleteTask('t2')
    })
    expect(result.current.tasks.map((t) => t.id)).toEqual(['t1'])
    expect(fake.rows('tasks').some((r) => r.id === 't2')).toBe(false)

    fake.failNext('tasks', 'delete', 'PGRST116')
    await act(async () => {
      await result.current.deleteTask('t1')
    })
    expect(result.current.tasks.map((t) => t.id)).toEqual(['t1'])
    expect(result.current.mutationError).not.toBeNull()
  })
})

describe('useTasks · tiempo real', () => {
  it('refleja INSERT, UPDATE y DELETE hechos por otro usuario sin recargar', async () => {
    const { fake, wrapper } = setup()
    const { result } = await renderTasks(wrapper)

    await act(async () => {
      await fake.asUser(BETO, (c) => c.from('tasks').insert({ project_id: P1, title: 'Creada por Beto' }).select().single())
    })
    await waitFor(() => expect(result.current.tasks[0].title).toBe('Creada por Beto'))

    await act(async () => {
      await fake.asUser(BETO, (c) => c.from('tasks').update({ status: 'in_progress' }).eq('id', 't1').select().single())
    })
    await waitFor(() => expect(result.current.tasks.find((t) => t.id === 't1')?.status).toBe('in_progress'))

    await act(async () => {
      await fake.asUser(BETO, (c) => c.from('tasks').delete().eq('id', 't2').select())
    })
    await waitFor(() => expect(result.current.tasks.some((t) => t.id === 't2')).toBe(false))
  })

  it('ignora inserciones de OTROS proyectos (filtro project_id=eq)', async () => {
    const { fake, wrapper } = setup()
    const { result } = await renderTasks(wrapper)
    await act(async () => {
      await fake.asUser(BETO, (c) => c.from('tasks').insert({ project_id: P2, title: 'No debe aparecer' }).select().single())
    })
    expect(result.current.tasks.some((t) => t.title === 'No debe aparecer')).toBe(false)
  })

  it('descarta eventos fuera de orden (una versión vieja no pisa una nueva)', async () => {
    const { fake, wrapper } = setup()
    const { result } = await renderTasks(wrapper)
    const stale = { ...taskRow('t1', P1, 'Título VIEJO', 60) } // updated_at anterior al actual
    await act(async () => {
      fake.emitRaw('tasks', 'UPDATE', stale, stale)
      await Promise.resolve()
    })
    expect(result.current.tasks.find((t) => t.id === 't1')?.title).toBe('Definir contrato de hooks')
  })

  it('tras una reconexión re-sincroniza los cambios perdidos', async () => {
    const { fake, wrapper } = setup()
    const { result } = await renderTasks(wrapper)
    fake.silentUpdate('tasks', 't1', { title: 'Cambiado mientras estaba desconectado' }) // sin evento
    await act(async () => {
      fake.channels()[0].simulateReconnect()
    })
    await waitFor(() =>
      expect(result.current.tasks.find((t) => t.id === 't1')?.title).toBe('Cambiado mientras estaba desconectado'),
    )
  })
})

describe('useTasks · ciclo de vida (sin fugas de memoria)', () => {
  it('elimina el canal de Realtime al desmontar', async () => {
    const { fake, wrapper } = setup()
    const { unmount } = await renderTasks(wrapper)
    expect(fake.activeChannels()).toBe(1)
    unmount()
    expect(fake.activeChannels()).toBe(0)
  })

  it('al cambiar de proyecto cierra el canal anterior y no mezcla datos', async () => {
    const { fake, wrapper } = setup({ latency: 20 })
    const hook = await renderTasks(wrapper)
    hook.rerender({ id: P2 })
    expect(hook.result.current.isLoading).toBe(true)
    expect(hook.result.current.tasks).toEqual([]) // nunca muestra tareas de P1 bajo P2
    await waitFor(() => expect(hook.result.current.tasks.map((t) => t.id)).toEqual(['t3']))
    await waitFor(() => expect(fake.activeChannels()).toBe(1))
    expect(fake.channels()[0].name).toContain(`tasks:${P2}`)
  })

  it('una respuesta tardía de un proyecto anterior se descarta', async () => {
    const { wrapper } = setup({ latency: 40 })
    const hook = renderHook(({ id }) => useTasks(id), { wrapper, initialProps: { id: P1 as string | null } })
    hook.rerender({ id: P2 }) // cambia antes de que P1 responda
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false))
    expect(hook.result.current.tasks.map((t) => t.projectId)).toEqual([P2])
  })

  it('projectId = null desactiva fetching y Realtime', async () => {
    const { fake, wrapper } = setup()
    const { result } = renderHook(() => useTasks(null), { wrapper })
    expect(result.current.isLoading).toBe(false)
    expect(result.current.tasks).toEqual([])
    expect(fake.activeChannels()).toBe(0)
  })
})

describe('useComments', () => {
  it('envía comentarios con optimismo y recibe los de otros usuarios en tiempo real', async () => {
    const { fake, wrapper } = setup()
    const { result, unmount } = renderHook(() => useComments('t1'), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await waitFor(() => expect(result.current.realtimeStatus).toBe('subscribed'))

    await act(async () => {
      await result.current.addComment('Revisado ✅')
    })
    await act(async () => {
      await fake.asUser(BETO, (c) => c.from('comments').insert({ task_id: 't1', content: 'Gracias!' }).select().single())
    })
    await waitFor(() => expect(result.current.comments.map((c) => c.content)).toEqual(['Revisado ✅', 'Gracias!']))
    unmount()
    expect(fake.activeChannels()).toBe(0)
  })
})
