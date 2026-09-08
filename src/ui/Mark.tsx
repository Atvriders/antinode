/**
 * The wordmark. The glyph is the thing the app is named after: a standing wave,
 * drawn as its own envelope, with the antinode marked. It is generated from the
 * same maths the application uses, not drawn by hand.
 */
export function Mark({ size = 20 }: { size?: number }) {
  const w = size * 2.1
  const h = size
  const pts: string[] = []
  const n = 72
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * w
    // |1 + Ge^{-2jbx}| for G = 0.5: the envelope of a 3:1 standing wave.
    const env = Math.abs(1 + 0.5 * Math.cos((i / n) * Math.PI * 4))
    pts.push(`${x.toFixed(2)},${(h / 2 - (env - 0.6) * h * 0.42).toFixed(2)}`)
  }
  const mirror = pts
    .map((p) => {
      const parts = p.split(',')
      const x = parts[0] ?? '0'
      const y = Number(parts[1] ?? 0)
      return `${x},${(h - y).toFixed(2)}`
    })
    .reverse()
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" focusable="false">
      <polyline points={pts.join(' ')} fill="none" stroke="var(--phosphor)" strokeWidth="1.1" />
      <polyline points={mirror.join(' ')} fill="none" stroke="var(--phosphor-dim)" strokeWidth="1.1" />
      <circle cx={w / 2} cy={h / 2} r="1.5" fill="var(--heat-1)" />
    </svg>
  )
}
