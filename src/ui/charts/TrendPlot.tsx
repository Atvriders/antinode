import { useMemo } from 'react'
import styles from './charts.module.css'
import { clean, useSize } from './useSize'

/**
 * A strip chart. Temperature and SWR over time on two axes, with threshold rules
 * drawn where they matter. The current value of each trace is printed at its
 * right-hand end rather than collected into a legend box, so the eye never has
 * to travel between a colour swatch and a line.
 */

export interface Series {
  key: string
  label: string
  values: readonly number[]
  color: string
  axis?: 'left' | 'right'
}

export interface Threshold {
  value: number
  label: string
  color: string
  axis?: 'left' | 'right'
}

export function TrendPlot({
  series,
  windowSeconds,
  height = 108,
  thresholds = [],
}: {
  series: readonly Series[]
  windowSeconds: number
  height?: number
  thresholds?: readonly Threshold[]
}) {
  const [ref, width] = useSize<HTMLDivElement>(260)
  const padR = 46
  const padB = 12
  const w = Math.max(40, width - padR)
  const h = Math.max(24, height - padB)

  const ranges = useMemo(() => {
    const range = (axis: 'left' | 'right') => {
      let lo = Infinity
      let hi = -Infinity
      for (const s of series) {
        if ((s.axis ?? 'left') !== axis) continue
        for (const v of s.values) {
          const x = clean(v, 0)
          if (x < lo) lo = x
          if (x > hi) hi = x
        }
      }
      for (const t of thresholds) {
        if ((t.axis ?? 'left') !== axis) continue
        hi = Math.max(hi, t.value)
        lo = Math.min(lo, t.value)
      }
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { lo: 0, hi: 1 }
      if (hi - lo < 1e-6) return { lo: lo - 1, hi: hi + 1 }
      const pad = (hi - lo) * 0.12
      return { lo: lo - pad, hi: hi + pad }
    }
    return { left: range('left'), right: range('right') }
  }, [series, thresholds])

  const toY = (v: number, axis: 'left' | 'right') => {
    const r = ranges[axis]
    const t = (clean(v, r.lo) - r.lo) / Math.max(r.hi - r.lo, 1e-9)
    return h - Math.min(1, Math.max(0, t)) * h
  }

  const hasData = series.some((s) => s.values.length > 1)

  return (
    <div className={styles.host} ref={ref}>
      <div className={styles.caption}>
        <span className={styles.captionLabel}>Last {windowSeconds}s</span>
      </div>
      <svg className={styles.svg} viewBox={`0 0 ${width} ${height}`} height={height} role="img" aria-label="Trend over time">
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} className={styles.gridFaint} x1={0} y1={h * f} x2={w} y2={h * f} />
        ))}
        <line className={styles.axis} x1={0} y1={h} x2={w} y2={h} />

        {thresholds.map((t) => (
          <g key={t.label}>
            <line
              className={styles.limit}
              style={{ stroke: t.color }}
              x1={0}
              y1={toY(t.value, t.axis ?? 'left')}
              x2={w}
              y2={toY(t.value, t.axis ?? 'left')}
            />
            <text className={styles.tick} style={{ fill: t.color }} x={2} y={toY(t.value, t.axis ?? 'left') - 2}>
              {t.label}
            </text>
          </g>
        ))}

        {series.map((s) => {
          if (s.values.length < 2) return null
          const axis = s.axis ?? 'left'
          const d = s.values
            .map((v, i) => `${i === 0 ? 'M' : 'L'}${((i / (s.values.length - 1)) * w).toFixed(1)},${toY(v, axis).toFixed(1)}`)
            .join('')
          const last = s.values[s.values.length - 1] ?? 0
          return (
            <g key={s.key}>
              <path d={d} fill="none" stroke={s.color} strokeWidth={1.4} strokeLinejoin="round" />
              <text className={styles.tick} style={{ fill: s.color }} x={w + 3} y={toY(last, axis) + 3}>
                {formatCompact(last)}
              </text>
            </g>
          )
        })}

        {!hasData && (
          <text className={styles.legendText} x={w / 2} y={h / 2} textAnchor="middle">
            transmit to start the trace
          </text>
        )}
      </svg>
    </div>
  )
}

const formatCompact = (v: number): string => {
  if (!Number.isFinite(v)) return '—'
  if (Math.abs(v) >= 100) return v.toFixed(0)
  if (Math.abs(v) >= 10) return v.toFixed(1)
  return v.toFixed(2)
}
