import { useCallback, useEffect, useRef } from 'react'
import styles from './Transport.module.css'

/**
 * The frequency readout, and the way you tune.
 *
 * It reads the way the radio itself groups digits — MHz.kHz.Hz — and each digit
 * group is its own hit target: drag or scroll a group and you step by that
 * group's decade, which is exactly how tuning a real dial with a step size
 * behaves. Leading zeros are dimmed rather than hidden so the digits never move
 * horizontally while you tune.
 */
export function FreqDisplay({
  hz,
  onChange,
  disabled = false,
}: {
  hz: number
  onChange: (hz: number) => void
  disabled?: boolean
}) {
  const drag = useRef<{ startY: number; startHz: number; decade: number } | null>(null)
  const groups = useRef(new Map<HTMLElement, number>())
  const stepRef = useRef<(decade: number, direction: number) => void>(() => {})

  /**
   * Attach a non-passive wheel listener per digit group.
   *
   * React registers wheel listeners passively, so calling preventDefault inside
   * an onWheel prop does nothing: the dial tunes and the page scrolls at the
   * same time. Adding the listener directly, with passive: false, is the only
   * way to own the gesture.
   */
  const registerGroup = useCallback(
    (decade: number) => (el: HTMLElement | null) => {
      if (el) groups.current.set(el, decade)
    },
    [],
  )

  useEffect(() => {
    const map = groups.current
    const onWheel = (e: WheelEvent) => {
      const el = e.currentTarget as HTMLElement
      const decade = map.get(el)
      if (decade === undefined || disabled) return
      e.preventDefault()
      stepRef.current(decade, e.deltaY < 0 ? 1 : -1)
    }
    const attached = [...map.keys()]
    for (const el of attached) el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      for (const el of attached) el.removeEventListener('wheel', onWheel)
    }
  }, [disabled])

  const digits = Math.round(hz).toString().padStart(8, '0').slice(-8)
  const mhz = digits.slice(0, 2)
  const khz = digits.slice(2, 5)
  const rest = digits.slice(5, 8)

  const step = useCallback(
    (decade: number, direction: number) => {
      onChange(hz + direction * 10 ** decade)
    },
    [hz, onChange],
  )
  // Keep the wheel listener pointing at the current step function without
  // re-attaching it on every render.
  useEffect(() => {
    stepRef.current = step
  }, [step])

  // The drag state is read only inside pointer handlers, never while rendering.
  // The rule flags it because the handlers are produced by a factory that is
  // itself called during render, which it cannot see through.
  /* eslint-disable react-hooks/refs */
  const groupProps = (decade: number, span: number) => ({
    role: 'spinbutton' as const,
    tabIndex: disabled ? -1 : 0,
    'aria-label': `Tune in steps of ${(10 ** decade).toLocaleString()} hertz`,
    'aria-valuenow': hz,
    'aria-valuetext': `${(hz / 1e6).toFixed(6)} megahertz`,
    // No onWheel here. React attaches wheel listeners passively, so
    // preventDefault inside one is a no-op: the dial would tune AND the page
    // would scroll. The non-passive listener that makes it work is attached in
    // the effect below.
    ref: registerGroup(decade),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (disabled) return
      if (e.key === 'ArrowUp') { e.preventDefault(); step(decade, 1) }
      if (e.key === 'ArrowDown') { e.preventDefault(); step(decade, -1) }
      if (e.key === 'PageUp') { e.preventDefault(); step(decade + 1, 1) }
      if (e.key === 'PageDown') { e.preventDefault(); step(decade + 1, -1) }
    },
    onPointerDown: (e: React.PointerEvent) => {
      if (disabled) return
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      drag.current = { startY: e.clientY, startHz: hz, decade }
    },
    onPointerMove: (e: React.PointerEvent) => {
      const d = drag.current
      if (!d) return
      const steps = Math.round((d.startY - e.clientY) / 6)
      onChange(d.startHz + steps * 10 ** d.decade)
    },
    onPointerUp: (e: React.PointerEvent) => {
      drag.current = null
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
    },
    'data-span': span,
    'data-testid': `freq-group-${decade}`,
  })
  /* eslint-enable react-hooks/refs */

  return (
    <div className={styles.freq} data-disabled={disabled}>
      <span className={styles.freqDigits}>
        <span className={styles.freqGroup} {...groupProps(6, 2)}>
          {mhz.split('').map((d, i) => (
            <span key={i} className={styles.freqDigit} data-lead={mhz.slice(0, i + 1) === '0'.repeat(i + 1)}>
              {d}
            </span>
          ))}
        </span>
        <span className={styles.freqDot}>.</span>
        <span className={styles.freqGroup} {...groupProps(3, 3)}>
          {khz.split('').map((d, i) => (
            <span key={i} className={styles.freqDigit}>{d}</span>
          ))}
        </span>
        <span className={styles.freqDot}>.</span>
        <span className={`${styles.freqGroup} ${styles.freqFine}`} {...groupProps(0, 3)}>
          {rest.split('').map((d, i) => (
            <span key={i} className={styles.freqDigit}>{d}</span>
          ))}
        </span>
      </span>
      <span className={`legend ${styles.freqUnit}`}>MHz</span>
    </div>
  )
}
