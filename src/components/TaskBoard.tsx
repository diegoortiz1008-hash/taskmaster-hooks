import { useMemo, useState } from 'react'
import { useProfiles } from '../hooks/useProfiles'
import { useTasks } from '../hooks/useTasks'
import type { Task, TaskStatus } from '../types/domain'
import { CommentsPanel } from './CommentsPanel'
import { NewTaskForm } from './NewTaskForm'
import { RealtimeBadge } from './RealtimeBadge'
import { TaskCard } from './TaskCard'
import { STATUSES, STATUS_META } from './ui'

/**
 * EJEMPLO DE CONSUMO: el componente solo lee estado y llama funciones del hook.
 * No hay ni una línea de supabase-js aquí.
 */
export function TaskBoard({ projectId }: { projectId: string }) {
  const { tasks, isLoading, error, mutationError, pendingIds, realtimeStatus, createTask, updateTask, deleteTask, retry, clearMutationError } =
    useTasks(projectId)
  const { profiles, byId } = useProfiles()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const columns = useMemo(() => {
    const groups: Record<TaskStatus, Task[]> = { todo: [], in_progress: [], done: [] }
    for (const t of tasks) groups[t.status].push(t)
    return groups
  }, [tasks])

  const selected = tasks.find((t) => t.id === selectedId) ?? null

  if (error) {
    return (
      <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center">
        <p className="font-semibold text-rose-900">{error}</p>
        <button type="button" onClick={retry} className="mt-3 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700">Reintentar</button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1"><NewTaskForm onCreate={createTask} /></div>
        <RealtimeBadge status={realtimeStatus} />
      </div>

      {mutationError && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-800">
          <span>{mutationError} Se restauró el estado anterior.</span>
          <button type="button" onClick={clearMutationError} className="font-medium underline">Cerrar</button>
        </div>
      )}

      <div className={`grid gap-4 ${selected ? 'xl:grid-cols-[1fr_20rem]' : ''}`}>
        <div className="grid gap-4 md:grid-cols-3" aria-busy={isLoading}>
          {STATUSES.map((status) => (
            <section key={status} aria-labelledby={`col-${status}`} className="rounded-xl bg-slate-100/70 p-3">
              <h2 id={`col-${status}`} className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <span className={`size-2 rounded-full ${STATUS_META[status].dot}`} />
                {STATUS_META[status].label}
                <span className="ml-auto rounded-full bg-white px-2 text-xs text-slate-500">{isLoading ? '…' : columns[status].length}</span>
              </h2>
              <div className="space-y-3">
                {isLoading
                  ? Array.from({ length: 2 }, (_, i) => <div key={i} className="h-36 animate-pulse rounded-xl bg-white/80" />)
                  : columns[status].map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        isPending={pendingIds.has(task.id)}
                        profiles={profiles}
                        isSelected={task.id === selectedId}
                        onUpdate={updateTask}
                        onDelete={deleteTask}
                        onSelect={setSelectedId}
                      />
                    ))}
                {!isLoading && columns[status].length === 0 && <p className="py-6 text-center text-xs text-slate-400">Sin tareas</p>}
              </div>
            </section>
          ))}
        </div>
        {selected && <CommentsPanel task={selected} profilesById={byId} onClose={() => setSelectedId(null)} />}
      </div>
    </div>
  )
}
