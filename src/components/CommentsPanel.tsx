import { useState, type FormEvent } from 'react'
import { useComments } from '../hooks/useComments'
import type { Profile, Task } from '../types/domain'
import { RealtimeBadge } from './RealtimeBadge'
import { field } from './ui'

const time = new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit' })

export function CommentsPanel({ task, profilesById, onClose }: { task: Task; profilesById: Map<string, Profile>; onClose: () => void }) {
  const { comments, isLoading, error, sendError, realtimeStatus, addComment } = useComments(task.id)
  const [text, setText] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const value = text
    setText('')
    if (!(await addComment(value))) setText(value)
  }

  return (
    <aside aria-label={`Comentarios de ${task.title}`} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Comentarios</p>
          <h2 className="font-semibold text-slate-900">{task.title}</h2>
        </div>
        <button type="button" onClick={onClose} className="text-sm text-slate-500 hover:text-slate-800" aria-label="Cerrar comentarios">✕</button>
      </div>
      <div className="mt-2"><RealtimeBadge status={realtimeStatus} /></div>

      <ul className="mt-4 max-h-72 space-y-3 overflow-y-auto" aria-live="polite">
        {isLoading && <li className="text-sm text-slate-500">Cargando…</li>}
        {error && <li role="alert" className="text-sm text-rose-600">{error}</li>}
        {!isLoading && comments.length === 0 && <li className="text-sm text-slate-500">Sin comentarios todavía.</li>}
        {comments.map((c) => (
          <li key={c.id} className={`rounded-lg bg-slate-50 px-3 py-2 ${c.id.startsWith('temp-') ? 'opacity-60' : ''}`}>
            <p className="text-xs text-slate-500">
              <span className="font-medium text-slate-700">{profilesById.get(c.authorId)?.fullName ?? 'Tú'}</span> · {time.format(c.createdAt)}
            </p>
            <p className="text-sm text-slate-800">{c.content}</p>
          </li>
        ))}
      </ul>

      <form onSubmit={submit} className="mt-3 flex gap-2">
        <label htmlFor="comment" className="sr-only">Escribe un comentario</label>
        <input id="comment" className={`${field} flex-1`} placeholder="Escribe un comentario…" value={text} onChange={(e) => setText(e.target.value)} />
        <button type="submit" disabled={!text.trim()} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Enviar</button>
      </form>
      {sendError && <p role="alert" className="mt-2 text-sm text-rose-600">{sendError}</p>}
    </aside>
  )
}
