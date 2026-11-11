import { useEffect, useMemo, useState } from 'react'
import { toUserMessage } from '../lib/errors'
import { toProfile, type Profile } from '../types/domain'
import { useSupabase } from './useSupabase'

/** Usuarios (perfiles) para mostrar responsables y autores. Se cargan una vez. */
export function useProfiles() {
  const client = useSupabase()
  const [state, setState] = useState<{ loaded: boolean; profiles: Profile[]; error: string | null }>({
    loaded: false,
    profiles: [],
    error: null,
  })

  useEffect(() => {
    let active = true
    client
      .from('profiles')
      .select('id, full_name, avatar_url, created_at')
      .order('full_name', { ascending: true })
      .then(({ data, error }) => {
        if (!active) return
        setState({
          loaded: true,
          profiles: (data ?? []).map(toProfile),
          error: error ? toUserMessage(error, 'cargar los usuarios') : null,
        })
      })
    return () => {
      active = false
    }
  }, [client])

  const byId = useMemo(() => new Map(state.profiles.map((p) => [p.id, p])), [state.profiles])

  return { profiles: state.profiles, byId, isLoading: !state.loaded, error: state.error }
}
