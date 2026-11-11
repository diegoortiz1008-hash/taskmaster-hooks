import type { RealtimeStatus } from '../hooks/useRealtimeSubscription'

const META: Record<RealtimeStatus, { label: string; dot: string }> = {
  connecting: { label: 'Conectando…', dot: 'bg-amber-400' },
  subscribed: { label: 'En vivo', dot: 'bg-emerald-500' },
  error: { label: 'Reconectando…', dot: 'bg-rose-500' },
  closed: { label: 'Desconectado', dot: 'bg-slate-400' },
}

export function RealtimeBadge({ status }: { status: RealtimeStatus }) {
  const meta = META[status]
  return (
    <span role="status" className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200">
      <span className={`size-2 rounded-full ${meta.dot} ${status === 'subscribed' ? 'animate-pulse' : ''}`} />
      Realtime: {meta.label}
    </span>
  )
}
