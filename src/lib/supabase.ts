import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.types'

export type TypedSupabaseClient = SupabaseClient<Database>

const url = import.meta.env.VITE_SUPABASE_URL ?? ''
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

export const isSupabaseConfigured = url.length > 0 && anonKey.length > 0

/**
 * Cliente ÚNICO con la anon key: todas las consultas viajan con el JWT del
 * usuario, así que Postgres aplica las políticas RLS. Nunca usar service_role
 * en el frontend.
 */
export const createSupabaseClient = (): TypedSupabaseClient =>
  createClient<Database>(url, anonKey, {
    realtime: { params: { eventsPerSecond: 10 } },
  })
