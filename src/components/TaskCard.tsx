import { memo } from 'react'
import type { Profile, Task, TaskPatch, TaskStatus } from '../types/domain'
import { PRIORITY_META, STATUSES, STATUS_META, field } from './ui'

interface TaskCardProps {
  task: Task
  isPending: boolean
  profiles: Profile[]
  isSelected: boolean
  onUpdate: (id: string, patch: TaskPatch) => void
  onDelete: (id: string) => void
  onSelect: (id: string) => void
}

/** Presentacional: recibe datos y callbacks; no sabe nada de Supabase. */
export const TaskCard = memo(function TaskCard({ task, isPending, profiles, isSelected, onUpdate, onDelete, onSelect }: TaskCardProps) {
  const isTemp = task.id.startsWith('temp-')
  const priority = PRIORITY_META[task.priority]
  return (
    <article
      aria-busy={isPending}
      className={`rounded-xl border bg-white p-4 shadow-sm transition ${isSelected ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-200'} ${isPending ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${priority.badge}`}>{priority.label}</span>
        {isPending && <span className="text-xs text-slate-500">{isTemp ? 'Creando…' : 'Guardando…'}</span>}
      </div>
      <h3 className="mt-2 font-medium leading-snug text-slate-900">{task.title}</h3>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="text-xs text-slate-500">
          Estado
          <select
            className={`${field} mt-1 w-full py-1.5`}
            value={task.status}
            disabled={isTemp}
            onChange={(e) => onUpdate(task.id, { status: e.target.value as TaskStatus })}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_META[s].label}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-500">
          Responsable
          <select
            className={`${field} mt-1 w-full py-1.5`}
            value={task.assigneeId ?? ''}
            disabled={isTemp}
            onChange={(e) => onUpdate(task.id, { assigneeId: e.target.value || null })}
          >
            <option value="">Sin asignar</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.fullName}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <button type="button" disabled={isTemp} onClick={() => onSelect(task.id)} className="text-sm font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50">
          Comentarios
        </button>
        <button
          type="button"
          disabled={isTemp}
          onClick={() => onDelete(task.id)}
          className="text-sm text-rose-600 hover:text-rose-800 disabled:opacity-50"
          aria-label={`Eliminar ${task.title}`}
        >
          Eliminar
        </button>
      </div>
    </article>
  )
})
