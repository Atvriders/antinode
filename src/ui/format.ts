/**
 * Every number the reader sees passes through here.
 *
 * Two rules. Nothing ever renders the string "NaN", "Infinity" or "undefined" —
 * an em dash means "no reading", the way a real instrument shows a dead channel.
 * And units are chosen for the magnitude, so a milliwatt does not appear as
 * 0.001 W and 47 kHz does not appear as 0.047 MHz.
 */

import type { Complex } from '../rf/types'

/** What an instrument shows when it has nothing to show. */
const NONE = '—'

const bad = (v: number): boolean => typeof v !== 'number' || !Number.isFinite(v)

/** Fixed decimals without the "-0" that toFixed produces for small negatives. */
const fix = (v: number, d: number): string => {
  const s = v.toFixed(d)
  return s === `-${(0).toFixed(d)}` ? (0).toFixed(d) : s
}

/**
 * The dial, grouped the way the radio groups it: MHz.kHz.Hz. A ham reads
 * 14.250.000 at a glance and 14250000 not at all.
 */
export function fmtFreq(hz: number): string {
  if (bad(hz)) return NONE
  const n = Math.max(0, Math.round(hz))
  const digits = n.toString().padStart(8, '0')
  const mhz = digits.slice(0, -6).replace(/^0+(?=\d)/, '')
  return `${mhz}.${digits.slice(-6, -3)}.${digits.slice(-3)}`
}

/** The same frequency for prose: "14.250 MHz". */
export function fmtFreqShort(hz: number): string {
  if (bad(hz)) return NONE
  if (Math.abs(hz) < 1e6) return `${fix(hz / 1e3, 1)} kHz`
  return `${fix(hz / 1e6, 3)} MHz`
}

/** Power, from the microwatt a receiver hears to the hundred watts a PA makes. */
/** Decimals from the SCALED value, so 40 µW is "40 µW" and 4.5 µW is "4.5 µW". */
const dp = (scaled: number): number => (Math.abs(scaled) >= 10 ? 0 : 1)

export function fmtPower(w: number): string {
  if (bad(w)) return NONE
  const a = Math.abs(w)
  if (a < 1e-9) return '0 W'
  if (a < 1e-6) return `${fix(w * 1e9, dp(w * 1e9))} nW`
  if (a < 1e-3) return `${fix(w * 1e6, dp(w * 1e6))} µW`
  if (a < 1) return `${fix(w * 1e3, dp(w * 1e3))} mW`
  if (a < 10) return `${fix(w, 1)} W`
  return `${fix(w, 0)} W`
}

/**
 * SWR. Above about 20:1 a station bridge is only telling you that something is
 * badly wrong, so say that rather than pretending to three figures.
 */
export function fmtSwr(s: number): string {
  if (bad(s) || s < 1) return NONE
  if (s > 20) return '> 20:1'
  return `${fix(s, 2)}:1`
}

/** Impedance in the form an antenna analyser prints: 34.2 − j18.7 Ω. */
export function fmtImpedance(z: Complex): string {
  if (!z || bad(z.re) || bad(z.im)) return NONE
  const r = Math.abs(z.re) >= 1000 ? fix(z.re / 1000, 1) + 'k' : fix(z.re, 1)
  const x = Math.abs(z.im)
  const xs = x >= 1000 ? fix(x / 1000, 1) + 'k' : fix(x, 1)
  return `${r} ${z.im < 0 ? '−' : '+'} j${xs} Ω`
}

export function fmtTemp(c: number): string {
  return bad(c) ? NONE : `${fix(c, c < 100 ? 1 : 0)} °C`
}

export function fmtDb(db: number): string {
  if (bad(db)) return NONE
  if (Math.abs(db) < 0.005) return '0.00 dB'
  return `${fix(db, 2)} dB`
}

export function fmtVolts(v: number): string {
  if (bad(v)) return NONE
  const a = Math.abs(v)
  if (a < 1e-3) return `${fix(v * 1e6, dp(v * 1e6))} µV`
  if (a < 1) return `${fix(v * 1e3, dp(v * 1e3))} mV`
  if (a < 100) return `${fix(v, 1)} V`
  return `${fix(v, 0)} V`
}

export function fmtAmps(a: number): string {
  if (bad(a)) return NONE
  const m = Math.abs(a)
  if (m < 1e-3) return `${fix(a * 1e6, dp(a * 1e6))} µA`
  if (m < 1) return `${fix(a * 1e3, dp(a * 1e3))} mA`
  return `${fix(a, 2)} A`
}

/** Metres, with feet alongside once a run is long enough for that to matter. */
export function fmtLength(m: number): string {
  if (bad(m)) return NONE
  if (Math.abs(m) < 1) return `${fix(m * 100, 0)} cm`
  return `${fix(m, m < 10 ? 1 : 0)} m`
}

export function fmtPercent(frac: number, digits = 0): string {
  return bad(frac) ? NONE : `${fix(frac * 100, digits)}%`
}

export function fmtDuration(seconds: number): string {
  if (bad(seconds) || seconds < 0) return NONE
  if (seconds < 60) return `${fix(seconds, seconds < 10 ? 1 : 0)} s`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds - m * 60)
  return `${m}m ${s.toString().padStart(2, '0')}s`
}

const SI_STEPS: readonly { limit: number; scale: number; prefix: string }[] = [
  { limit: 1e-9, scale: 1e12, prefix: 'p' },
  { limit: 1e-6, scale: 1e9, prefix: 'n' },
  { limit: 1e-3, scale: 1e6, prefix: 'µ' },
  { limit: 1, scale: 1e3, prefix: 'm' },
  { limit: 1e3, scale: 1, prefix: '' },
  { limit: 1e6, scale: 1e-3, prefix: 'k' },
  { limit: 1e9, scale: 1e-6, prefix: 'M' },
]

/** General SI formatting, used for component values: 4.7 µH, 220 pF. */
export function fmtSi(value: number, unit: string, digits = 2): string {
  if (bad(value)) return NONE
  const a = Math.abs(value)
  if (a === 0) return `0 ${unit}`
  const step = SI_STEPS.find((s) => a < s.limit) ?? { scale: 1e-9, prefix: 'G' }
  const scaled = value * step.scale
  const d = Math.abs(scaled) >= 100 ? 0 : Math.abs(scaled) >= 10 ? Math.min(1, digits) : digits
  return `${fix(scaled, d)} ${step.prefix}${unit}`
}
