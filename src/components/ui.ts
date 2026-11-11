import type { TaskPriority, TaskStatus } from '../types/domain'

export const STATUS_META: Record<TaskStatus, { label: string; dot: string }> = {
  todo: { label: 'Por hacer', dot: 'bg-slate-400' },
  in_progress: { label: 'En progreso', dot: 'bg-amber-500' },
  done: { label: 'Hecho', dot: 'bg-emerald-500' },
}

export const PRIORITY_META: Record<TaskPriority, { label: string; badge: string }> = {
  low: { label: 'Baja', badge: 'bg-slate-100 text-slate-700 ring-slate-500/20' },
  medium: { label: 'Media', badge: 'bg-sky-100 text-sky-800 ring-sky-600/20' },
  high: { label: 'Alta', badge: 'bg-rose-100 text-rose-800 ring-rose-600/20' },
}

export const STATUSES: TaskStatus[] = ['todo', 'in_progress', 'done']

export const field =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:opacity-60'
