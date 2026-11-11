import { useEffect, useState } from 'react'
import { toUserMessage } from '../lib/errors'
import { toProject, type Project } from '../types/domain'
import { useSupabase } from './useSupabase'

/** Proyectos visibles para el usuario (RLS filtra a los que es miembro). */
export function useProjects() {
  const client = useSupabase()
  const [state, setState] = useState<{ loaded: boolean; projects: Project[]; error: string | null }>({
    loaded: false,
    projects: [],
    error: null,
  })

  useEffect(() => {
    let active = true
    client
      .from('projects')
      .select('id, name')
      .order('name', { ascending: true })
      .then(({ data, error }) => {
        if (!active) return
        setState({
          loaded: true,
          projects: (data ?? []).map(toProject),
          error: error ? toUserMessage(error, 'cargar los proyectos') : null,
        })
      })
    return () => {
      active = false
    }
  }, [client])

  return { projects: state.projects, isLoading: !state.loaded, error: state.error }
}
