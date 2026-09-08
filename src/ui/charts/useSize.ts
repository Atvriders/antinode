import { useEffect, useRef, useState } from 'react'

/**
 * Track an element's rendered width so charts can be drawn to fit rather than to
 * a guess. Height is supplied by the caller; only the width varies with layout.
 */
export function useSize<T extends HTMLElement>(fallback = 280): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(fallback)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? fallback
      if (w > 0) setWidth(Math.round(w))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [fallback])
  return [ref, width]
}

/** Charts must never be handed a NaN by an upstream bug and draw a broken path. */
export const clean = (v: number, fallback = 0): number => (Number.isFinite(v) ? v : fallback)
