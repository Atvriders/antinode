import { useCallback, useMemo, useRef } from 'react'
import styles from './charts.module.css'
import { clean, useSize } from './useSize'
import { fmtSwr } from '../format'

/**
 * SWR against frequency.
 *
 * The vertical axis is compressed, not linear. On a linear SWR axis the whole
 * useful range — 1 to 3 — occupies the bottom sixth of the plot and a single
 * excursion to 20:1 flattens everything worth looking at. Mapping through
 * log(SWR) gives 1, 1.5, 2, 3, 5, 10 roughly even spacing, which is how a ham
 * actually thinks about the numbers.
 */

const SWR_TICKS = [1, 1.5, 2, 3, 5, 10, 20] as const
const SWR_MIN = 1
const SWR_MAX = 20

const toY = (swr: number, h: number): number => {
  const s = Math.min(Math.max(clean(swr, SWR_MAX), SWR_MIN), SWR_MAX)
  const t = Math.log(s / SWR_MIN) / Math.log(SWR_MAX / SWR_MIN)
  return h - t * h
}

export function SweepPlot({
  data,
  f0,
  f1,
  marker,
  band,
  limit,
  height = 96,
  onScrub,
}: {
  data: Float32Array
  f0: number
  f1: number
  marker: number
  band?: { startHz: number; endHz: number }
  limit?: number
  height?: number
  onScrub?: (hz: number) => void
}) {
  const [ref, width] = useSize<HTMLDivElement>(260)
  const dragging = useRef(false)

  const padL = 24
  const padB = 12
  const w = Math.max(60, width - padL - 4)
  const h = Math.max(30, height - padB)

  const toX = useCallback((hz: number) => ((clean(hz, f0) - f0) / Math.max(f1 - f0, 1)) * w, [f0, f1, w])

  const path = useMemo(() => {
    if (data.length < 2) return ''
    let d = ''
    for (let i = 0; i < data.length; i++) {
      const x = (i / (data.length - 1)) * w
      const y = toY(data[i] ?? SWR_MAX, h)
      d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    }
    return d
  }, [data, w, h])

  const markerSwr = useMemo(() => {
    if (data.length === 0) return NaN
    const t = (marker - f0) / Math.max(f1 - f0, 1)
    const i = Math.round(Math.min(1, Math.max(0, t)) * (data.length - 1))
    return data[i] ?? NaN
  }, [data, marker, f0, f1])

  const scrubTo = useCallback(
    (clientX: number, el: SVGSVGElement) => {
      if (!onScrub) return
      const rect = el.getBoundingClientRect()
      const t = (clientX - rect.left - padL) / Math.max(w, 1)
      onScrub(f0 + Math.min(1, Math.max(0, t)) * (f1 - f0))
    },
    [onScrub, f0, f1, w],
  )

  const step = (f1 - f0) / 200

  return (
    <div className={styles.host} ref={ref}>
      <div className={styles.caption}>
        <span className={styles.captionLabel}>SWR across the band</span>
        <span className={styles.captionValue}>{fmtSwr(markerSwr)}</span>
      </div>
      <svg
        className={`${styles.svg} ${onScrub ? styles.scrub : ''}`}
        viewBox={`0 0 ${width} ${height}`}
        height={height}
        role={onScrub ? 'slider' : 'img'}
        tabIndex={onScrub ? 0 : -1}
        aria-label="Standing wave ratio against frequency. Drag or use the arrow keys to tune."
        aria-valuemin={f0}
        aria-valuemax={f1}
        aria-valuenow={marker}
        aria-valuetext={`${(marker / 1e6).toFixed(3)} megahertz, ${fmtSwr(markerSwr)}`}
        onPointerDown={(e) => {
          if (!onScrub) return
          dragging.current = true
          e.currentTarget.setPointerCapture(e.pointerId)
          scrubTo(e.clientX, e.currentTarget)
        }}
        onPointerMove={(e) => {
          if (dragging.current) scrubTo(e.clientX, e.currentTarget)
        }}
        onPointerUp={(e) => {
          dragging.current = false
          e.currentTarget.releasePointerCapture(e.pointerId)
        }}
        onKeyDown={(e) => {
          if (!onScrub) return
          if (e.key === 'ArrowLeft') { e.preventDefault(); onScrub(marker - step) }
          if (e.key === 'ArrowRight') { e.preventDefault(); onScrub(marker + step) }
        }}
      >
        <g transform={`translate(${padL},0)`}>
          {band && (
            <rect
              className={styles.bandShade}
              x={Math.max(0, toX(band.startHz))}
              y={0}
              width={Math.max(0, Math.min(w, toX(band.endHz)) - Math.max(0, toX(band.startHz)))}
              height={h}
            />
          )}

          {SWR_TICKS.map((t) => (
            <g key={t}>
              <line className={styles.gridFaint} x1={0} y1={toY(t, h)} x2={w} y2={toY(t, h)} />
              <text className={styles.tick} x={-4} y={toY(t, h) + 3} textAnchor="end">{t}</text>
            </g>
          ))}

          {limit !== undefined && (
            <line className={styles.limit} x1={0} y1={toY(limit, h)} x2={w} y2={toY(limit, h)} />
          )}

          <path className={styles.trace} d={path} />

          <line className={styles.cursor} x1={toX(marker)} y1={0} x2={toX(marker)} y2={h} />
          <circle cx={toX(marker)} cy={toY(markerSwr, h)} r={3} fill="var(--phosphor-bright)" />

          <line className={styles.axis} x1={0} y1={h} x2={w} y2={h} />
          <text className={styles.tick} x={0} y={height - 2}>{(f0 / 1e6).toFixed(2)}</text>
          <text className={styles.tick} x={w} y={height - 2} textAnchor="end">{(f1 / 1e6).toFixed(2)} MHz</text>
        </g>
      </svg>
    </div>
  )
}
