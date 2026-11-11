/**
 * Cliente de Supabase EN MEMORIA para el modo demo y los tests.
 *
 * Implementa el subconjunto de supabase-js que usan los hooks:
 *   from(t).select().eq().order()  ·  insert().select().single()
 *   update().eq().select().single() ·  delete().eq()
 *   channel(n).on('postgres_changes', {...}, cb).subscribe(cb) · removeChannel(ch)
 *
 * Los hooks NO saben si hablan con este cliente o con el real: reciben un
 * `SupabaseClient<Database>` por contexto.
 */
import type { TypedSupabaseClient } from './supabase'

type Row = Record<string, unknown> & { id: string }
type TableName = 'tasks' | 'comments' | 'profiles' | 'projects'
type Op = 'select' | 'insert' | 'update' | 'delete'
type ChangeEvent = 'INSERT' | 'UPDATE' | 'DELETE'

interface PgError {
  code: string
  message: string
  details: string | null
  hint: string | null
}

interface Listener {
  event: ChangeEvent | '*'
  table: string
  filter?: string
  callback: (payload: unknown) => void
}

export interface FakeChannel {
  name: string
  listeners: Listener[]
  on: (type: 'postgres_changes', opts: { event: ChangeEvent | '*'; schema: string; table: string; filter?: string }, cb: (payload: unknown) => void) => FakeChannel
  subscribe: (cb?: (status: string, err?: Error) => void) => FakeChannel
  unsubscribe: () => Promise<'ok'>
  /** Solo test/demo: simula una caída y reconexión del socket. */
  simulateReconnect: () => void
}

export interface FakeSupabaseOptions {
  currentUserId: string
  seed?: Partial<Record<TableName, Row[]>>
  /** Latencia simulada de red (ms). */
  latency?: number
}

const pgError = (code: string, message: string): PgError => ({ code, message, details: null, hint: null })

/** Evalúa filtros de Realtime tipo "project_id=eq.123". */
const matchesFilter = (row: Row | undefined, filter?: string): boolean => {
  if (!filter) return true
  if (!row) return false
  const [column, rest] = filter.split('=')
  const [operator, value] = [rest.slice(0, rest.indexOf('.')), rest.slice(rest.indexOf('.') + 1)]
  return operator === 'eq' && String(row[column]) === value
}

export function createFakeSupabase({ currentUserId, seed = {}, latency = 0 }: FakeSupabaseOptions) {
  const db: Record<TableName, Row[]> = {
    tasks: [...(seed.tasks ?? [])],
    comments: [...(seed.comments ?? [])],
    profiles: [...(seed.profiles ?? [])],
    projects: [...(seed.projects ?? [])],
  }
  const channels = new Set<FakeChannel>()
  const failures: { table: TableName; op: Op; error: PgError }[] = []
  let actingUserId = currentUserId
  let clock = Date.now()

  const now = () => new Date(++clock).toISOString()
  const wait = () => (latency > 0 ? new Promise((r) => setTimeout(r, latency)) : Promise.resolve())

  const emit = (table: TableName, eventType: ChangeEvent, newRow: Row | null, oldRow: Row | null) => {
    const payload = {
      schema: 'public',
      table,
      commit_timestamp: new Date().toISOString(),
      eventType,
      new: newRow ? { ...newRow } : {},
      old: oldRow ? { ...oldRow } : {},
      errors: null,
    }
    for (const channel of channels) {
      for (const l of channel.listeners) {
        if (l.table !== table || (l.event !== '*' && l.event !== eventType)) continue
        const target = eventType === 'DELETE' ? oldRow ?? undefined : newRow ?? undefined
        // Realtime real NO permite filtrar DELETE; aquí se emula igual: sin filtro.
        if (eventType !== 'DELETE' && !matchesFilter(target, l.filter)) continue
        queueMicrotask(() => l.callback(payload))
      }
    }
  }

  const takeFailure = (table: TableName, op: Op) => {
    const i = failures.findIndex((f) => f.table === table && f.op === op)
    return i === -1 ? null : failures.splice(i, 1)[0].error
  }

  // ---------------- Query builder ----------------
  function from(table: TableName) {
    let op: Op = 'select'
    let payload: Record<string, unknown> | Record<string, unknown>[] | null = null
    const filters: [string, unknown][] = []
    let orderBy: { column: string; ascending: boolean } | null = null
    let single = false
    let returning = false

    const run = async (): Promise<{ data: unknown; error: PgError | null }> => {
      await wait()
      const failure = takeFailure(table, op)
      if (failure) return { data: null, error: failure }

      const matches = (r: Row) => filters.every(([c, v]) => r[c] === v)
      let result: Row[] = []

      if (op === 'select') {
        result = db[table].filter(matches)
        if (orderBy) {
          const { column, ascending } = orderBy
          result = [...result].sort((a, b) => (String(a[column]) < String(b[column]) ? -1 : 1) * (ascending ? 1 : -1))
        }
      } else if (op === 'insert') {
        const rows = (Array.isArray(payload) ? payload : [payload]) as Record<string, unknown>[]
        for (const values of rows) {
          const ts = now()
          const row: Row =
            table === 'tasks'
              ? { id: crypto.randomUUID(), description: null, status: 'todo', priority: 'medium', assignee_id: null, created_by: actingUserId, created_at: ts, updated_at: ts, ...values }
              : table === 'comments'
                ? { id: crypto.randomUUID(), author_id: actingUserId, created_at: ts, ...values }
                : ({ ...values } as Row)
          if (table === 'tasks' && String(row.title ?? '').trim() === '') return { data: null, error: pgError('23514', 'el título no puede estar vacío') }
          db[table].push(row)
          result.push(row)
          emit(table, 'INSERT', row, null)
        }
      } else if (op === 'update') {
        db[table] = db[table].map((r) => {
          if (!matches(r)) return r
          const updated: Row = { ...r, ...(payload as object), ...(table === 'tasks' && { updated_at: now() }) }
          result.push(updated)
          emit(table, 'UPDATE', updated, r)
          return updated
        })
      } else {
        const removed = db[table].filter(matches)
        db[table] = db[table].filter((r) => !matches(r))
        removed.forEach((r) => emit(table, 'DELETE', null, r))
        result = removed
      }

      if (single) {
        if (result.length !== 1) return { data: null, error: pgError('PGRST116', 'JSON object requested, multiple (or no) rows returned') }
        return { data: { ...result[0] }, error: null }
      }
      return { data: op === 'select' || returning ? result.map((r) => ({ ...r })) : null, error: null }
    }

    const builder = {
      select(_columns?: string) {
        if (op !== 'select') returning = true
        return builder
      },
      insert(values: Record<string, unknown> | Record<string, unknown>[]) {
        op = 'insert'
        payload = values
        return builder
      },
      update(values: Record<string, unknown>) {
        op = 'update'
        payload = values
        return builder
      },
      delete() {
        op = 'delete'
        return builder
      },
      eq(column: string, value: unknown) {
        filters.push([column, value])
        return builder
      },
      order(column: string, opts?: { ascending?: boolean }) {
        orderBy = { column, ascending: opts?.ascending ?? true }
        return builder
      },
      single() {
        single = true
        return builder
      },
      then<T1, T2 = never>(
        onFulfilled?: (value: { data: unknown; error: PgError | null }) => T1 | PromiseLike<T1>,
        onRejected?: (reason: unknown) => T2 | PromiseLike<T2>,
      ) {
        return run().then(onFulfilled, onRejected)
      },
    }
    return builder
  }

  // ---------------- Realtime ----------------
  function channel(name: string): FakeChannel {
    let statusCb: ((status: string, err?: Error) => void) | undefined
    const ch: FakeChannel = {
      name,
      listeners: [],
      on(_type, opts, cb) {
        ch.listeners.push({ event: opts.event, table: opts.table, filter: opts.filter, callback: cb })
        return ch
      },
      subscribe(cb) {
        statusCb = cb
        channels.add(ch)
        queueMicrotask(() => statusCb?.('SUBSCRIBED'))
        return ch
      },
      async unsubscribe() {
        channels.delete(ch)
        return 'ok'
      },
      simulateReconnect() {
        statusCb?.('CHANNEL_ERROR', new Error('socket cerrado (simulado)'))
        queueMicrotask(() => statusCb?.('SUBSCRIBED'))
      },
    }
    return ch
  }

  const client = {
    from,
    channel,
    async removeChannel(ch: FakeChannel) {
      return ch.unsubscribe()
    },
    getChannels: () => [...channels],
  }

  /** Herramientas de demo/test (no existen en supabase-js). */
  const control = {
    client: client as unknown as TypedSupabaseClient,
    activeChannels: () => channels.size,
    channels: () => [...channels],
    /** La próxima operación `op` sobre `table` fallará con este código. */
    failNext(table: TableName, op: Op, code = '42501', message = 'new row violates row-level security policy') {
      failures.push({ table, op, error: pgError(code, message) })
    },
    /** Ejecuta mutaciones como si fuera OTRO usuario (dispara Realtime). */
    async asUser<T>(userId: string, fn: (c: TypedSupabaseClient) => PromiseLike<T>): Promise<T> {
      const previous = actingUserId
      actingUserId = userId
      try {
        return await fn(client as unknown as TypedSupabaseClient)
      } finally {
        actingUserId = previous
      }
    },
    /** Muta la "BD" SIN emitir eventos (simula cambios perdidos durante una desconexión). */
    silentUpdate(table: TableName, id: string, patch: Record<string, unknown>) {
      db[table] = db[table].map((r) => (r.id === id ? { ...r, ...patch, updated_at: now() } : r))
    },
    /** Emite un evento Realtime arbitrario (p. ej. uno viejo o fuera de orden). */
    emitRaw: emit,
    rows: (table: TableName) => db[table].map((r) => ({ ...r })),
  }
  return control
}

export type FakeSupabase = ReturnType<typeof createFakeSupabase>
