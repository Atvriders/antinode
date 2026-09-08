import { useId } from 'react'
import styles from './kit.module.css'

/** A labelled slider. Value is always shown as a number — no naked sliders. */
export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  format,
  onChange,
  help,
  disabled = false,
  testId,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  format?: (v: number) => string
  onChange: (v: number) => void
  help?: string
  disabled?: boolean
  testId?: string
}) {
  const id = useId()
  const shown = format ? format(value) : String(value)
  return (
    <div className={styles.control} data-disabled={disabled}>
      <div className={styles.controlHead}>
        <label className="label" htmlFor={id}>{label}</label>
        <span className={`num ${styles.controlValue}`}>
          {shown}
          {unit && <span className={styles.controlUnit}>{unit}</span>}
        </span>
      </div>
      <input
        id={id}
        className={styles.range}
        data-testid={testId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-describedby={help ? `${id}-help` : undefined}
      />
      {help && <p id={`${id}-help`} className={styles.controlHelp}>{help}</p>}
    </div>
  )
}

/** A row of mutually exclusive panel buttons. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  columns,
  testIdPrefix,
}: {
  label?: string
  value: T
  options: readonly { value: T; label: string; title?: string; disabled?: boolean }[]
  onChange: (v: T) => void
  columns?: number
  /** Gives every option a `data-testid` of `${testIdPrefix}-${value}`. */
  testIdPrefix?: string
}) {
  return (
    <div className={styles.segmentedWrap}>
      {label && <span className="label">{label}</span>}
      <div
        className={styles.segmented}
        role="radiogroup"
        aria-label={label}
        style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
      >
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            disabled={o.disabled}
            title={o.title}
            className={styles.segment}
            data-testid={testIdPrefix ? `${testIdPrefix}-${o.value}` : undefined}
            data-on={value === o.value}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/** A latching panel switch. */
export function Switch({
  label,
  on,
  onChange,
  tone = 'normal',
  title,
}: {
  label: string
  on: boolean
  onChange: (v: boolean) => void
  tone?: 'normal' | 'warn'
  title?: string
}) {
  return (
    <button
      type="button"
      className={styles.switch}
      role="switch"
      aria-checked={on}
      data-on={on}
      data-tone={tone}
      title={title}
      onClick={() => onChange(!on)}
    >
      <span className={styles.switchLamp} aria-hidden="true" />
      <span className={styles.switchLabel}>{label}</span>
    </button>
  )
}
