import { createContext } from 'react'
import type { TypedSupabaseClient } from '../lib/supabase'

/** El cliente se inyecta por contexto: real en producción, simulado en demo/tests. */
export const SupabaseContext = createContext<TypedSupabaseClient | null>(null)
