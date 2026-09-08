import { useEffect, useRef } from 'react'
import styles from './charts.module.css'
import { clean, useSize } from './useSize'

/**
 * The transmitted spectrum with a waterfall under it, the way the radio's own
 * scope shows it. Canvas rather than SVG: the waterfall scrolls every frame and
 * a few thousand rectangles of SVG per frame is not a reasonable thing to ask a
 * browser to do.
 */
export function Spectrum({
  spectrum,
  centreHz,
  spanHz,
  waterfall = true,
  height = 110,
  markers = [],
}: {
  spectrum: Float32Array
  centreHz: number
  spanHz: number
  waterfall?: boolean
  height?: number
  markers?: readonly { hz: number; label: string }[]
}) {
  const [ref, width] = useSize<HTMLDivElement>(280)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fallRef = useRef<ImageData | null>(null)

  const traceH = waterfall ? Math.round(height * 0.55) : height
  const fallH = height - traceH

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      fallRef.current = null
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // Trace panel.
    ctx.fillStyle = '#0d1113'
    ctx.fillRect(0, 0, width, traceH)
    ctx.strokeStyle = '#2c3639'
    ctx.lineWidth = 1
    for (let i = 1; i < 6; i++) {
      const x = (width * i) / 6
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, traceH)
      ctx.stroke()
    }

    const n = spectrum.length
    if (n > 1) {
      ctx.beginPath()
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * width
        const v = Math.max(0, Math.min(1, clean(spectrum[i] ?? 0)))
        const y = traceH - v * (traceH - 3) - 1
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.strokeStyle = '#5fd2e8'
      ctx.lineWidth = 1.4
      ctx.stroke()
      ctx.lineTo(width, traceH)
      ctx.lineTo(0, traceH)
      ctx.closePath()
      ctx.fillStyle = 'rgba(95,210,232,0.12)'
      ctx.fill()
    }

    // Waterfall: scroll down one row and paint the newest line at the top.
    if (waterfall && fallH > 2) {
      const prev = fallRef.current
      if (prev) ctx.putImageData(prev, 0, traceH + 1)
      const row = ctx.createImageData(Math.round(width * dpr), 1)
      for (let px = 0; px < row.width; px++) {
        const i = Math.floor((px / row.width) * n)
        const v = Math.max(0, Math.min(1, clean(spectrum[i] ?? 0)))
        const [r, g, b] = ramp(v)
        row.data[px * 4] = r
        row.data[px * 4 + 1] = g
        row.data[px * 4 + 2] = b
        row.data[px * 4 + 3] = 255
      }
      ctx.putImageData(row, 0, Math.round((traceH + 1) * dpr))
      fallRef.current = ctx.getImageData(0, Math.round((traceH + 1) * dpr), Math.round(width * dpr), Math.round((fallH - 2) * dpr))
    }

    // Markers.
    ctx.font = '9px "Chivo Mono", monospace'
    for (const m of markers) {
      const t = (m.hz - (centreHz - spanHz / 2)) / Math.max(spanHz, 1)
      if (t < 0 || t > 1) continue
      const x = t * width
      ctx.strokeStyle = '#f2b441'
      ctx.setLineDash([2, 2])
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, traceH)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = '#f2b441'
      ctx.fillText(m.label, Math.min(x + 3, width - 30), 10)
    }
  }, [spectrum, width, height, traceH, fallH, waterfall, markers, centreHz, spanHz])

  const lo = (centreHz - spanHz / 2) / 1e6
  const hi = (centreHz + spanHz / 2) / 1e6

  return (
    <div className={styles.host} ref={ref}>
      <div className={styles.caption}>
        <span className={styles.captionLabel}>Transmitted spectrum</span>
        <span className={styles.captionValue}>{(spanHz / 1e3).toFixed(0)} kHz span</span>
      </div>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        style={{ height }}
        role="img"
        aria-label={`Transmitted spectrum from ${lo.toFixed(3)} to ${hi.toFixed(3)} megahertz.`}
      />
    </div>
  )
}

/** Panel through phosphor to heat: the project's own ramp, not a rainbow. */
function ramp(v: number): [number, number, number] {
  const stops: [number, [number, number, number]][] = [
    [0.0, [13, 17, 19]],
    [0.35, [46, 110, 124]],
    [0.6, [95, 210, 232]],
    [0.8, [242, 180, 65]],
    [1.0, [192, 32, 43]],
  ]
  for (let i = 1; i < stops.length; i++) {
    const [p1, c1] = stops[i - 1] as [number, [number, number, number]]
    const [p2, c2] = stops[i] as [number, [number, number, number]]
    if (v <= p2) {
      const t = (v - p1) / Math.max(p2 - p1, 1e-6)
      return [
        Math.round(c1[0] + (c2[0] - c1[0]) * t),
        Math.round(c1[1] + (c2[1] - c1[1]) * t),
        Math.round(c1[2] + (c2[2] - c1[2]) * t),
      ]
    }
  }
  return [192, 32, 43]
}
