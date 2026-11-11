import { useEffect, useId, useState } from 'react'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { useLatest } from './useLatest'
import { useSupabase } from './useSupabase'

export type RealtimeStatus = 'connecting' | 'subscribed' | 'error' | 'closed'

export interface RealtimeBinding {
  event: 'INSERT' | 'UPDATE' | 'DELETE' | '*'
  table: string
  /** Filtro de Realtime, p. ej. `project_id=eq.123`. No aplica a DELETE. */
  filter?: string
}

interface Options<Row extends Record<string, unknown>> {
  /** Prefijo del canal; se le añade un id único por instancia del hook. */
  channel: string
  bindings: RealtimeBinding[]
  onChange: (payload: RealtimePostgresChangesPayload<Row>) => void
  /** Se llama cuando el canal vuelve a SUBSCRIBED tras una caída (para re-sincronizar). */
  onReconnect?: () => void
  enabled?: boolean
}

/**
 * Hook genérico de Realtime: crea el canal, registra los `postgres_changes`
 * y lo ELIMINA en el cleanup (sin fugas de memoria ni sockets huérfanos).
 * Los handlers se leen por ref, así que cambiarlos no re-suscribe.
 */
export function useRealtimeSubscription<Row extends Record<string, unknown>>({
  channel: channelPrefix,
  bindings,
  onChange,
  onReconnect,
  enabled = true,
}: Options<Row>): RealtimeStatus {
  const client = useSupabase()
  const instanceId = useId()
  const onChangeRef = useLatest(onChange)
  const onReconnectRef = useLatest(onReconnect)
  const [state, setState] = useState<{ key: string; status: RealtimeStatus }>({ key: '', status: 'connecting' })

  // Clave estable: el array `bindings` cambia de identidad en cada render.
  const bindingsKey = JSON.stringify(bindings)
  const key = `${channelPrefix}:${instanceId}:${bindingsKey}`

  useEffect(() => {
    if (!enabled) return
    let active = true
    let subscribedOnce = false

    const channel = client.channel(`${channelPrefix}:${instanceId}`)
    for (const binding of JSON.parse(bindingsKey) as RealtimeBinding[]) {
      channel.on<Row>(
        'postgres_changes',
        {
          event: binding.event as '*',
          schema: 'public',
          table: binding.table,
          ...(binding.filter && { filter: binding.filter }),
        },
        (payload) => {
          if (active) onChangeRef.current(payload)
        },
      )
    }

    channel.subscribe((status) => {
      if (!active) return
      if (status === 'SUBSCRIBED') {
        if (subscribedOnce) onReconnectRef.current?.()
        subscribedOnce = true
        setState({ key, status: 'subscribed' })
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setState({ key, status: 'error' })
      } else if (status === 'CLOSED') {
        setState({ key, status: 'closed' })
      }
    })

    // CLEANUP: se ejecuta al desmontar o al cambiar canal/filtros.
    return () => {
      active = false
      void client.removeChannel(channel)
    }
  }, [client, channelPrefix, instanceId, bindingsKey, enabled, key, onChangeRef, onReconnectRef])

  if (!enabled) return 'closed'
  return state.key === key ? state.status : 'connecting'
}
