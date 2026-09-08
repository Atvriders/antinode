import styles from './kit.module.css'

export type ReadoutTone = 'normal' | 'good' | 'warn' | 'hot' | 'fault' | 'idle'

/**
 * A numeric readout. The number is always the loudest thing; the unit and the
 * legend stay quiet so a row of these scans as a column of figures.
 */
export function Readout({
  legend,
  value,
  unit,
  tone = 'normal',
  size = 'md',
  hint,
}: {
  legend: string
  value: string
  unit?: string
  tone?: ReadoutTone
  size?: 'sm' | 'md' | 'lg'
  hint?: string
}) {
  return (
    <div className={styles.readout} data-tone={tone} data-size={size} title={hint}>
      <span className={`legend ${styles.readoutLegend}`}>{legend}</span>
      <span className={styles.readoutValueRow}>
        <span className={`num ${styles.readoutValue}`}>{value}</span>
        {unit && <span className={styles.readoutUnit}>{unit}</span>}
      </span>
    </div>
  )
}
