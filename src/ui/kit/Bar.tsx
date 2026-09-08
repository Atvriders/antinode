import styles from './kit.module.css'

/**
 * A horizontal bargraph meter, drawn as discrete segments the way a real panel
 * meter is, so a reader can count segments instead of estimating a length.
 */
export function Bar({
  value,
  max,
  segments = 28,
  ramp = 'phosphor',
  breakpoint,
  label,
}: {
  value: number
  max: number
  segments?: number
  /** 'phosphor' for signal, 'heat' for anything that can hurt the radio. */
  ramp?: 'phosphor' | 'heat' | 'smith'
  /** Fraction 0..1 above which segments switch to the warning colour. */
  breakpoint?: number
  label?: string
}) {
  const frac = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0
  const lit = Math.round(frac * segments)
  return (
    <div className={styles.bar} data-ramp={ramp} role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
      {Array.from({ length: segments }, (_, i) => {
        const at = (i + 1) / segments
        const on = i < lit
        const over = breakpoint !== undefined && at > breakpoint
        return <span key={i} className={styles.barSeg} data-on={on} data-over={over} />
      })}
    </div>
  )
}
