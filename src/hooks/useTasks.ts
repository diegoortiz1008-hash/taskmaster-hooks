import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { toUserMessage } from '../lib/errors'
import type { TaskRow } from '../types/database.types'
import { toTask, toTaskUpdate, type NewTask, type Task, type TaskPatch } from '../types/domain'
import { useLatest } from './useLatest'
import { useRealtimeSubscription, type RealtimeBinding, type RealtimeStatus } from './useRealtimeSubscription'
import { useSupabase } from './useSupabase'

// =============================================================================
// Estado: reducer puro (fácil de probar y sin closures obsoletas)
// =============================================================================
export type PendingOp = 'create' | 'update' | 'delete'

export interface TasksState {
  /** Proyecto al que pertenecen `tasks`. Permite ignorar respuestas tardías de otro proyecto. */
  projectId: string | null
  status: 'loading' | 'success' | 'error'
  tasks: Task[]
  error: string | null
  mutationError: string | null
  pending: Record<string, PendingOp>
}

export type TasksAction =
  | { type: 'FETCH_START' }
  | { type: 'FETCH_SUCCESS'; projectId: string; tasks: Task[] }
  | { type: 'FETCH_ERROR'; projectId: string; error: string }
  | { type: 'OPTIMISTIC_CREATE'; task: Task }
  | { type: 'CONFIRM_CREATE'; tempId: string; task: Task }
  | { type: 'ROLLBACK_CREATE'; tempId: string; error: string }
  | { type: 'OPTIMISTIC_UPDATE'; id: string; patch: TaskPatch }
  | { type: 'CONFIRM_UPDATE'; task: Task }
  | { type: 'ROLLBACK_UPDATE'; previous: Task; error: string }
  | { type: 'OPTIMISTIC_DELETE'; id: string }
  | { type: 'CONFIRM_DELETE'; id: string }
  | { type: 'ROLLBACK_DELETE'; previous: Task; error: string }
  | { type: 'REMOTE_UPSERT'; task: Task }
  | { type: 'REMOTE_DELETE'; id: string }
  | { type: 'MUTATION_ERROR'; error: string }
  | { type: 'CLEAR_MUTATION_ERROR' }

export const initialTasksState: TasksState = {
  projectId: null,
  status: 'loading',
  tasks: [],
  error: null,
  mutationError: null,
  pending: {},
}

const byNewest = (a: Task, b: Task) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id)

/**
 * Inserta o reemplaza por id. Regla de consistencia: si ya tenemos una versión
 * MÁS NUEVA (updated_at), se ignora la entrante (evento fuera de orden / eco viejo).
 */
export function upsertTask(list: Task[], incoming: Task): Task[] {
  const current = list.find((t) => t.id === incoming.id)
  if (current && current.updatedAt.getTime() > incoming.updatedAt.getTime()) return list
  const rest = list.filter((t) => t.id !== incoming.id)
  return [...rest, incoming].sort(byNewest)
}

const withoutPending = (pending: Record<string, PendingOp>, id: string) => {
  const next = { ...pending }
  delete next[id]
  return next
}

export function tasksReducer(state: TasksState, action: TasksAction): TasksState {
  switch (action.type) {
    case 'FETCH_START':
      return { ...state, status: 'loading', error: null }

    case 'FETCH_SUCCESS': {
      // Refetch del MISMO proyecto (p. ej. tras reconexión): se fusiona para no
      // perder optimistas pendientes ni versiones más nuevas recibidas por Realtime.
      if (state.projectId === action.projectId) {
        const temps = state.tasks.filter((t) => state.pending[t.id] === 'create')
        // Las tareas con mutación pendiente conservan su versión local (optimista).
        const merged = action.tasks.reduce(
          (acc, t) => (state.pending[t.id] ? acc : upsertTask(acc, t)),
          state.tasks.filter((t) => action.tasks.some((s) => s.id === t.id) && state.pending[t.id] !== 'delete'),
        )
        return { ...state, status: 'success', error: null, tasks: [...temps, ...merged].sort(byNewest) }
      }
      return { ...initialTasksState, projectId: action.projectId, status: 'success', tasks: [...action.tasks].sort(byNewest) }
    }

    case 'FETCH_ERROR':
      return { ...state, projectId: action.projectId, status: 'error', error: action.error }

    case 'OPTIMISTIC_CREATE':
      return {
        ...state,
        tasks: [action.task, ...state.tasks],
        pending: { ...state.pending, [action.task.id]: 'create' },
        mutationError: null,
      }

    case 'CONFIRM_CREATE':
      return {
        ...state,
        // Quita la temporal; si Realtime ya trajo la real, upsert evita duplicarla.
        tasks: upsertTask(state.tasks.filter((t) => t.id !== action.tempId), action.task),
        pending: withoutPending(state.pending, action.tempId),
      }

    case 'ROLLBACK_CREATE':
      return {
        ...state,
        tasks: state.tasks.filter((t) => t.id !== action.tempId),
        pending: withoutPending(state.pending, action.tempId),
        mutationError: action.error,
      }

    case 'OPTIMISTIC_UPDATE':
      return {
        ...state,
        tasks: state.tasks.map((t) => (t.id === action.id ? { ...t, ...action.patch } : t)),
        pending: { ...state.pending, [action.id]: 'update' },
        mutationError: null,
      }

    case 'CONFIRM_UPDATE':
      return { ...state, tasks: upsertTask(state.tasks, action.task), pending: withoutPending(state.pending, action.task.id) }

    case 'ROLLBACK_UPDATE': {
      const current = state.tasks.find((t) => t.id === action.previous.id)
      // Si mientras tanto llegó un cambio remoto más nuevo, se respeta ese.
      const remoteWon = current && current.updatedAt.getTime() > action.previous.updatedAt.getTime()
      return {
        ...state,
        tasks: remoteWon || !current ? state.tasks : state.tasks.map((t) => (t.id === action.previous.id ? action.previous : t)),
        pending: withoutPending(state.pending, action.previous.id),
        mutationError: action.error,
      }
    }

    case 'OPTIMISTIC_DELETE':
      return {
        ...state,
        tasks: state.tasks.filter((t) => t.id !== action.id),
        pending: { ...state.pending, [action.id]: 'delete' },
        mutationError: null,
      }

    case 'CONFIRM_DELETE':
      return { ...state, pending: withoutPending(state.pending, action.id) }

    case 'ROLLBACK_DELETE':
      return {
        ...state,
        tasks: upsertTask(state.tasks, action.previous),
        pending: withoutPending(state.pending, action.previous.id),
        mutationError: action.error,
      }

    case 'REMOTE_UPSERT':
      if (action.task.projectId !== state.projectId || state.pending[action.task.id] === 'delete') return state
      return { ...state, tasks: upsertTask(state.tasks, action.task) }

    case 'REMOTE_DELETE':
      if (!state.tasks.some((t) => t.id === action.id)) return state
      return { ...state, tasks: state.tasks.filter((t) => t.id !== action.id), pending: withoutPending(state.pending, action.id) }

    case 'MUTATION_ERROR':
      return { ...state, mutationError: action.error }

    case 'CLEAR_MUTATION_ERROR':
      return { ...state, mutationError: null }
  }
}

// =============================================================================
// Hook público
// =============================================================================
export interface UseTasksResult {
  tasks: Task[]
  isLoading: boolean
  error: string | null
  mutationError: string | null
  /** Tareas con una mutación en curso (para mostrar spinners/opacidad). */
  pendingIds: ReadonlySet<string>
  realtimeStatus: RealtimeStatus
  createTask: (input: NewTask) => Promise<Task | null>
  updateTask: (id: string, patch: TaskPatch) => Promise<boolean>
  deleteTask: (id: string) => Promise<boolean>
  retry: () => void
  clearMutationError: () => void
}

/**
 * Gestiona las tareas de UN proyecto: lectura filtrada, mutaciones optimistas
 * con rollback y sincronización en tiempo real vía Supabase Realtime.
 *
 * @param projectId proyecto activo; `null` desactiva el hook.
 */
export function useTasks(projectId: string | null): UseTasksResult {
  const client = useSupabase()
  const [state, dispatch] = useReducer(tasksReducer, initialTasksState)
  const [reloadToken, setReloadToken] = useState(0)
  const stateRef = useLatest(state)

  // ---------------- Fetching ----------------
  useEffect(() => {
    if (!projectId) return
    let active = true // evita aplicar respuestas de un proyecto anterior o tras desmontar
    client
      .from('tasks')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!active) return
        if (error) dispatch({ type: 'FETCH_ERROR', projectId, error: toUserMessage(error, 'cargar las tareas') })
        else dispatch({ type: 'FETCH_SUCCESS', projectId, tasks: (data ?? []).map(toTask) })
      })
    return () => {
      active = false
    }
  }, [client, projectId, reloadToken])

  // ---------------- Realtime ----------------
  const bindings = useMemo<RealtimeBinding[]>(
    () =>
      projectId
        ? [
            { event: 'INSERT', table: 'tasks', filter: `project_id=eq.${projectId}` },
            { event: 'UPDATE', table: 'tasks', filter: `project_id=eq.${projectId}` },
            // Realtime no permite filtrar DELETE: se recibe todo y se descarta por id.
            { event: 'DELETE', table: 'tasks' },
          ]
        : [],
    [projectId],
  )

  const handleChange = useCallback((payload: RealtimePostgresChangesPayload<TaskRow>) => {
    if (payload.eventType === 'DELETE') {
      const id = (payload.old as Partial<TaskRow>).id
      if (id) dispatch({ type: 'REMOTE_DELETE', id })
    } else {
      dispatch({ type: 'REMOTE_UPSERT', task: toTask(payload.new) })
    }
  }, [])

  const realtimeStatus = useRealtimeSubscription<TaskRow>({
    channel: `tasks:${projectId ?? 'none'}`,
    bindings,
    onChange: handleChange,
    // Tras una reconexión pudimos perder eventos: re-sincronizamos con la BD.
    onReconnect: () => setReloadToken((t) => t + 1),
    enabled: projectId !== null,
  })

  // ---------------- Mutaciones (optimistas) ----------------
  const createTask = useCallback(
    async (input: NewTask): Promise<Task | null> => {
      if (!projectId) return null
      const title = input.title.trim()
      if (!title) {
        dispatch({ type: 'MUTATION_ERROR', error: 'El título es obligatorio.' })
        return null
      }
      const now = new Date()
      const tempId = `temp-${crypto.randomUUID()}`
      dispatch({
        type: 'OPTIMISTIC_CREATE',
        task: {
          id: tempId,
          projectId,
          title,
          description: input.description ?? null,
          status: 'todo',
          priority: input.priority ?? 'medium',
          assigneeId: input.assigneeId ?? null,
          createdBy: '',
          createdAt: now,
          updatedAt: new Date(0),
        },
      })

      const { data, error } = await client
        .from('tasks')
        .insert({
          project_id: projectId,
          title,
          description: input.description ?? null,
          priority: input.priority ?? 'medium',
          assignee_id: input.assigneeId ?? null,
        })
        .select()
        .single()

      if (error || !data) {
        dispatch({ type: 'ROLLBACK_CREATE', tempId, error: toUserMessage(error, 'crear la tarea') })
        return null
      }
      const task = toTask(data)
      dispatch({ type: 'CONFIRM_CREATE', tempId, task })
      return task
    },
    [client, projectId],
  )

  const updateTask = useCallback(
    async (id: string, patch: TaskPatch): Promise<boolean> => {
      const previous = stateRef.current.tasks.find((t) => t.id === id)
      if (!previous || id.startsWith('temp-')) return false
      dispatch({ type: 'OPTIMISTIC_UPDATE', id, patch })

      const { data, error } = await client.from('tasks').update(toTaskUpdate(patch)).eq('id', id).select().single()

      if (error || !data) {
        dispatch({ type: 'ROLLBACK_UPDATE', previous, error: toUserMessage(error, 'actualizar la tarea') })
        return false
      }
      dispatch({ type: 'CONFIRM_UPDATE', task: toTask(data) })
      return true
    },
    [client, stateRef],
  )

  const deleteTask = useCallback(
    async (id: string): Promise<boolean> => {
      const previous = stateRef.current.tasks.find((t) => t.id === id)
      if (!previous || id.startsWith('temp-')) return false
      dispatch({ type: 'OPTIMISTIC_DELETE', id })

      // `.select()` devuelve las filas borradas: si RLS lo impidió, vuelve vacío SIN error.
      const { data, error } = await client.from('tasks').delete().eq('id', id).select()

      if (error || !data || data.length === 0) {
        dispatch({
          type: 'ROLLBACK_DELETE',
          previous,
          error: error ? toUserMessage(error, 'eliminar la tarea') : 'No tienes permiso para eliminar esta tarea.',
        })
        return false
      }
      dispatch({ type: 'CONFIRM_DELETE', id })
      return true
    },
    [client, stateRef],
  )

  const retry = useCallback(() => {
    dispatch({ type: 'FETCH_START' })
    setReloadToken((t) => t + 1)
  }, [])

  const clearMutationError = useCallback(() => dispatch({ type: 'CLEAR_MUTATION_ERROR' }), [])

  // ---------------- Estado derivado ----------------
  const isCurrent = projectId !== null && state.projectId === projectId
  const pendingIds = useMemo(() => new Set(Object.keys(state.pending)), [state.pending])

  return {
    tasks: isCurrent ? state.tasks : [],
    isLoading: projectId !== null && (!isCurrent || state.status === 'loading'),
    error: isCurrent ? state.error : null,
    mutationError: state.mutationError,
    pendingIds,
    realtimeStatus,
    createTask,
    updateTask,
    deleteTask,
    retry,
    clearMutationError,
  }
}
