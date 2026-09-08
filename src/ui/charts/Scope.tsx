import { useCallback, useMemo } from 'react'
import styles from './charts.module.css'
import { clean, useSize } from './useSize'

/**
 * A phosphor trace on a graticule. Used for the transmit envelope, where the
 * whole point is comparing two traces: the same speech with and without
 * compression, so you can see the peak stay put while the average rises.
 */
export function Scope({
  data,
  label,
  height = 74,
  tone = 'phosphor',
  overlay,
  overlayLabel,
  bipolar = true,
}: {
  data: Float32Array
  label: string
  height?: number
  tone?: 'phosphor' | 'heat'
  overlay?: Float32Array
  overlayLabel?: string
  bipolar?: boolean
}) {
  const [ref, width] = useSize<HTMLDivElement>(240)
  const h = height - 12
  const mid = bipolar ? h / 2 : h

  const trace = useCallback((d: Float32Array | undefined): string => {
    if (!d || d.length < 2) return ''
    const scale = bipolar ? h / 2 : h
    let out = ''
    for (let i = 0; i < d.length; i++) {
      const x = (i / (d.length - 1)) * width
      const v = Math.max(-1, Math.min(1, clean(d[i] ?? 0)))
      out += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${(mid - v * scale).toFixed(1)}`
    }
    return out
  }, [width, h, mid, bipolar])

  const main = useMemo(() => trace(data), [data, trace])
  const over = useMemo(() => trace(overlay), [overlay, trace])

  return (
    <div className={styles.host} ref={ref}>
      <div className={styles.caption}>
        <span className={styles.captionLabel}>{label}</span>
        {overlayLabel && <span className={styles.captionValue}>{overlayLabel}</span>}
      </div>
      <svg className={styles.svg} viewBox={`0 0 ${width} ${height}`} height={height} role="img" aria-label={label}>
        {/* Graticule: five divisions across, four down, as on a bench scope. */}
        {Array.from({ length: 5 }, (_, i) => (
          <line key={`v${i}`} className={styles.gridFaint} x1={(width * (i + 1)) / 6} y1={0} x2={(width * (i + 1)) / 6} y2={h} />
        ))}
        {Array.from({ length: 3 }, (_, i) => (
          <line key={`h${i}`} className={styles.gridFaint} x1={0} y1={(h * (i + 1)) / 4} x2={width} y2={(h * (i + 1)) / 4} />
        ))}
        <line className={styles.axis} x1={0} y1={mid} x2={width} y2={mid} />
        {over && <path className={styles.traceDim} d={over} />}
        <path className={tone === 'heat' ? styles.traceHeat : styles.trace} d={main} />
      </svg>
    </div>
  )
}
