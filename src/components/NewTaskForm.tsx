import { useState, type FormEvent } from 'react'
import type { NewTask, TaskPriority } from '../types/domain'
import { PRIORITY_META, field } from './ui'

export function NewTaskForm({ onCreate }: { onCreate: (input: NewTask) => Promise<unknown> }) {
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('medium')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    // Optimista: limpiamos el campo al instante; si falla, el hook hace rollback y muestra el error.
    void onCreate({ title, priority })
    setTitle('')
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
      <label htmlFor="new-task" className="sr-only">Nueva tarea</label>
      <input id="new-task" className={`${field} flex-1`} placeholder="Nueva tarea…" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
      <label htmlFor="new-priority" className="sr-only">Prioridad</label>
      <select id="new-priority" className={field} value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
        {(Object.keys(PRIORITY_META) as TaskPriority[]).map((p) => (
          <option key={p} value={p}>Prioridad {PRIORITY_META[p].label.toLowerCase()}</option>
        ))}
      </select>
      <button type="submit" disabled={!title.trim()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50">
        Agregar
      </button>
    </form>
  )
}
