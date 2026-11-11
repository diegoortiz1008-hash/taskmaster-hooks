interface SupabaseLikeError {
  code?: string
  message?: string
}

/**
 * Traduce errores de PostgREST/Postgres a mensajes útiles para el usuario.
 * - 42501: violación de RLS (sin permiso en ese proyecto)
 * - PGRST116: `.single()` sin filas -> RLS filtró la fila o ya no existe
 * - 23514 / 23502: CHECK o NOT NULL
 */
export function toUserMessage(error: unknown, action: string): string {
  const e = (typeof error === 'object' && error !== null ? error : {}) as SupabaseLikeError
  switch (e.code) {
    case '42501':
      return `No tienes permiso para ${action} en este proyecto.`
    case 'PGRST116':
      return `No se pudo ${action}: la tarea no existe o no tienes acceso a ella.`
    case '23514':
    case '23502':
      return `No se pudo ${action}: hay datos inválidos.`
    default:
      return `No se pudo ${action}${e.message ? `: ${e.message}` : '.'}`
  }
}
