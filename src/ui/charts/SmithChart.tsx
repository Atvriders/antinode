import { useCallback, useMemo } from 'react'
import styles from './charts.module.css'
import { clean, useSize } from './useSize'
import { fmtImpedance, fmtSwr } from '../format'
import { swrFromZ } from '../../rf/match'
import type { Complex } from '../../rf/types'

/**
 * A Smith chart, drawn properly.
 *
 * The chart is the reflection-coefficient plane with the normalised impedance
 * grid mapped onto it. Constant-resistance loci are circles centred at
 * r/(1+r) with radius 1/(1+r); constant-reactance loci are circles centred at
 * 1 + j/x with radius 1/|x|, clipped to the unit circle. Constant-SWR loci are
 * circles about the origin of radius |Gamma|.
 *
 * It earns its place here because it is the only picture that shows resonance
 * and match as two different things: crossing the horizontal axis is resonance,
 * arriving at the centre is a match, and an antenna can do either without the
 * other.
 */

interface Marker {
  z: Complex
  label: string
  tone?: string
}

export function SmithChart({
  z,
  z0 = 50,
  locus,
  markers = [],
  swrCircles = [1.5, 2, 3],
  size,
  label,
}: {
  z: Complex
  z0?: number
  locus?: readonly Complex[]
  markers?: readonly Marker[]
  swrCircles?: readonly number[]
  size?: number
  label?: string
}) {
  const [ref, measured] = useSize<HTMLDivElement>(240)
  const px = size ?? Math.min(measured, 320)
  const r = px / 2 - 10
  const cx = px / 2
  const cy = px / 2

  /** Reflection coefficient to screen coordinates. Imaginary axis points up. */
  const toXY = useCallback((g: Complex): [number, number] => [cx + g.re * r, cy - g.im * r], [cx, cy, r])

  const gamma = useCallback((zl: Complex): Complex => {
    const a = clean(zl.re) / z0 - 1
    const b = clean(zl.im) / z0
    const c = clean(zl.re) / z0 + 1
    const den = c * c + b * b
    if (den < 1e-12) return { re: 1, im: 0 }
    const g = { re: (a * c + b * b) / den, im: (b * c - a * b) / den }
    const mag = Math.hypot(g.re, g.im)
    // A passive load cannot reflect more than it received; clamp so a numerical
    // excursion cannot draw outside the chart.
    return mag > 1 ? { re: g.re / mag, im: g.im / mag } : g
  }, [z0])

  const grid = useMemo(() => {
    const rCircles = [0.2, 0.5, 1, 2, 5].map((rr) => ({
      cx: rr / (1 + rr),
      cy: 0,
      rad: 1 / (1 + rr),
      label: rr,
    }))
    const xArcs = [0.2, 0.5, 1, 2, 5].flatMap((xx) => [xx, -xx].map((sx) => ({
      cx: 1,
      cy: 1 / sx,
      rad: Math.abs(1 / sx),
      label: sx,
    })))
    return { rCircles, xArcs }
  }, [])

  const g = gamma(z)
  const [mx, my] = toXY(g)
  const swr = swrFromZ(z, z0)

  const locusPath = useMemo(() => {
    if (!locus || locus.length < 2) return ''
    return locus
      .map((p, i) => {
        const [x, y] = toXY(gamma(p))
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(' ')
  }, [locus, toXY, gamma])

  const clipId = `smith-clip-${Math.round(px)}`

  return (
    <div className={styles.host} ref={ref}>
      {label && (
        <div className={styles.caption}>
          <span className={styles.captionLabel}>{label}</span>
          <span className={styles.captionValue}>{fmtSwr(swr)}</span>
        </div>
      )}
      <svg
        className={styles.svg}
        viewBox={`0 0 ${px} ${px}`}
        width={px}
        height={px}
        role="img"
        aria-label={`Smith chart. Impedance ${fmtImpedance(z)}, standing wave ratio ${fmtSwr(swr)}.`}
      >
        <defs>
          <clipPath id={clipId}>
            <circle cx={cx} cy={cy} r={r} />
          </clipPath>
        </defs>

        <g clipPath={`url(#${clipId})`}>
          {grid.rCircles.map((c) => (
            <circle key={`r${c.label}`} className={styles.gridFaint} cx={cx + c.cx * r} cy={cy} r={c.rad * r} />
          ))}
          {grid.xArcs.map((c, i) => (
            <circle key={`x${i}`} className={styles.gridFaint} cx={cx + c.cx * r} cy={cy - c.cy * r} r={c.rad * r} />
          ))}
          {/* The resistive axis: every point on it is resonant. */}
          <line className={styles.grid} x1={cx - r} y1={cy} x2={cx + r} y2={cy} />

          {swrCircles.map((s) => {
            const mag = (s - 1) / (s + 1)
            return (
              <g key={`s${s}`}>
                <circle className={styles.limit} cx={cx} cy={cy} r={mag * r} />
                <text className={styles.tick} x={cx + mag * r + 2} y={cy - 3}>{s}</text>
              </g>
            )
          })}

          {locusPath && <path className={styles.traceSmith} d={locusPath} opacity={0.75} />}
        </g>

        <circle className={styles.grid} cx={cx} cy={cy} r={r} />
        {/* The centre is a perfect match. Everything else is not. */}
        <circle cx={cx} cy={cy} r={2} fill="var(--phosphor)" />

        {placeMarkers(markers.map((m) => ({ ...m, xy: toXY(gamma(m.z)) })), px).map((m, i) => (
          <g key={`${m.label}-${i}`}>
            <circle className={styles.marker} cx={m.xy[0]} cy={m.xy[1]} r={3.5} style={{ fill: m.tone ?? 'var(--smith)' }} />
            <line
              className={styles.gridFaint}
              x1={m.xy[0]}
              y1={m.xy[1]}
              x2={m.labelAt[0] + (m.anchor === 'end' ? 3 : -3)}
              y2={m.labelAt[1] - 3}
            />
            <text className={styles.markerLabel} x={m.labelAt[0]} y={m.labelAt[1]} textAnchor={m.anchor}>
              {m.label}
            </text>
          </g>
        ))}

        {markers.length === 0 && <circle className={styles.marker} cx={mx} cy={my} r={4} />}

        <text className={styles.legendText} x={4} y={px - 2}>short</text>
        <text className={styles.legendText} x={px - 4} y={px - 2} textAnchor="end">open</text>
      </svg>
      <div className={styles.caption}>
        <span className={styles.captionLabel}>at the feedpoint</span>
        <span className={styles.captionValue}>{fmtImpedance(z)}</span>
      </div>
    </div>
  )
}

interface Placed extends Marker {
  xy: [number, number]
  labelAt: [number, number]
  anchor: 'start' | 'end'
}

/**
 * Keep marker labels apart.
 *
 * Two markers land on top of each other exactly when they matter most — a tuner
 * has brought the radio to the centre while the antenna sits somewhere else, or
 * both are matched and both are at the origin. Overlapping text at that moment
 * hides the very comparison the chart is there to make, so labels are pushed
 * apart vertically and joined to their marker with a leader line.
 */
function placeMarkers(
  markers: readonly (Marker & { xy: [number, number] })[],
  width: number,
): Placed[] {
  const out: Placed[] = []
  for (const m of markers) {
    const [x, y] = m.xy
    // A marker near the right edge — which is where an open circuit and every
    // badly mismatched antenna ends up — would otherwise push its label off the
    // chart and out of the panel. Flip it to the inside instead.
    const flip = x + 8 + m.label.length * 5.2 > width
    const lx = flip ? x - 7 : x + 7
    let ly = y + 3
    for (let guard = 0; guard < 8; guard++) {
      const clash = out.some((p) => Math.abs(p.labelAt[1] - ly) < 11 && Math.abs(p.labelAt[0] - lx) < 70)
      if (!clash) break
      ly += 12
    }
    out.push({ ...m, labelAt: [lx, ly], anchor: flip ? 'end' : 'start' })
  }
  return out
}
