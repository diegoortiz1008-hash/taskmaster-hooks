import { useContext } from 'react'
import { SupabaseContext } from '../context/supabaseContext'
import type { TypedSupabaseClient } from '../lib/supabase'

export function useSupabase(): TypedSupabaseClient {
  const client = useContext(SupabaseContext)
  if (!client) throw new Error('useSupabase debe usarse dentro de <SupabaseProvider>')
  return client
}
