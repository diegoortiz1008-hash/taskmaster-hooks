import { useState } from 'react'
import type { FakeSupabase } from '../lib/fakeSupabase'
import { OTHER_USER } from './demoData'

/** Simula a OTRO usuario trabajando en el mismo proyecto (dispara Realtime). */
export function DemoPanel({ fake, projectId }: { fake: FakeSupabase; projectId: string }) {
  const [log, setLog] = useState<string[]>([])
  const push = (msg: string) => setLog((l) => [`${new Date().toLocaleTimeString('es-CO')} · ${msg}`, ...l].slice(0, 6))
  const projectTasks = () => fake.rows('tasks').filter((t) => t.project_id === projectId)

  const actions = [
    {
      label: `${OTHER_USER.name} crea una tarea`,
      run: async () => {
        await fake.asUser(OTHER_USER.id, (c) => c.from('tasks').insert({ project_id: projectId, title: `Revisar PR #${Math.floor(Math.random() * 90 + 10)}`, priority: 'high' }).select().single())
        push(`${OTHER_USER.name} creó una tarea`)
      },
    },
    {
      label: `${OTHER_USER.name} avanza una tarea`,
      run: async () => {
        const t = projectTasks().find((x) => x.status !== 'done')
        if (!t) return push('No hay tareas por avanzar')
        const next = t.status === 'todo' ? 'in_progress' : 'done'
        await fake.asUser(OTHER_USER.id, (c) => c.from('tasks').update({ status: next }).eq('id', t.id).select().single())
        push(`${OTHER_USER.name} movió "${String(t.title)}"`)
      },
    },
    {
      label: `${OTHER_USER.name} elimina una tarea`,
      run: async () => {
        const t = projectTasks().at(-1)
        if (!t) return push('No hay tareas')
        await fake.asUser(OTHER_USER.id, (c) => c.from('tasks').delete().eq('id', t.id).select())
        push(`${OTHER_USER.name} eliminó "${String(t.title)}"`)
      },
    },
    {
      label: 'Rechazar mi próximo cambio (RLS)',
      run: async () => {
        fake.failNext('tasks', 'update')
        push('Tu próxima actualización será rechazada por RLS → rollback')
      },
    },
    {
      label: 'Simular caída y reconexión',
      run: async () => {
        const t = projectTasks()[0]
        if (t) fake.silentUpdate('tasks', t.id, { title: `${String(t.title)} (editada sin conexión)` })
        fake.channels().forEach((ch) => ch.simulateReconnect())
        push('Reconexión: el hook re-sincronizó los cambios perdidos')
      },
    },
  ]

  return (
    <section aria-label="Simulador de otros usuarios" className="rounded-xl border border-dashed border-indigo-300 bg-indigo-50/60 p-4">
      <p className="text-sm font-semibold text-indigo-900">🧪 Simulador de colaboración (modo demo)</p>
      <p className="text-xs text-indigo-800/80">Actúa como otro miembro del equipo: los cambios llegan a tu tablero por Realtime.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {actions.map((a) => (
          <button key={a.label} type="button" onClick={() => void a.run()} className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-indigo-700 shadow-sm ring-1 ring-indigo-200 hover:bg-indigo-100">
            {a.label}
          </button>
        ))}
      </div>
      {log.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-indigo-900/80" aria-live="polite">
          {log.map((l, i) => <li key={i}>{l}</li>)}
        </ul>
      )}
    </section>
  )
}
