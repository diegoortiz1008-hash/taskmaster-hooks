import type { ReactNode } from 'react'
import type { TypedSupabaseClient } from '../lib/supabase'
import { SupabaseContext } from './supabaseContext'

export function SupabaseProvider({ client, children }: { client: TypedSupabaseClient; children: ReactNode }) {
  return <SupabaseContext.Provider value={client}>{children}</SupabaseContext.Provider>
}
