import { useEffect, useRef } from 'react'

/**
 * Guarda el último valor en una ref. Permite que callbacks de larga vida
 * (suscripciones Realtime) lean props/estado actuales SIN re-suscribirse.
 */
export function useLatest<T>(value: T) {
  const ref = useRef(value)
  useEffect(() => {
    ref.current = value
  })
  return ref
}
