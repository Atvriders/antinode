import { describe, expect, it } from 'vitest'
import {
  fmtAmps, fmtDb, fmtDuration, fmtFreq, fmtFreqShort, fmtImpedance, fmtLength,
  fmtPercent, fmtPower, fmtSi, fmtSwr, fmtTemp, fmtVolts,
} from '../src/ui/format'

const DASH = '—'

describe('formatters', () => {
  it('groups the dial the way the radio does', () => {
    expect(fmtFreq(14_250_000)).toBe('14.250.000')
    expect(fmtFreq(1_800_000)).toBe('1.800.000')
    expect(fmtFreq(50_313_000)).toBe('50.313.000')
    expect(fmtFreq(7_074_123)).toBe('7.074.123')
  })

  it('picks a unit that suits the magnitude', () => {
    expect(fmtPower(100)).toBe('100 W')
    expect(fmtPower(4.5)).toBe('4.5 W')
    expect(fmtPower(0.25)).toBe('250 mW')
    expect(fmtPower(0.00004)).toBe('40 µW')
    expect(fmtVolts(0.0035)).toBe('3.5 mV')
    expect(fmtVolts(141)).toBe('141 V')
    expect(fmtAmps(0.02)).toBe('20 mA')
    expect(fmtAmps(0.0045)).toBe('4.5 mA')
    expect(fmtLength(0.4)).toBe('40 cm')
    expect(fmtSi(4.7e-6, 'H')).toBe('4.70 µH')
    expect(fmtSi(2.2e-10, 'F')).toBe('220 pF')
  })

  it('says when a reading is off the scale rather than inventing one', () => {
    expect(fmtSwr(1.234)).toBe('1.23:1')
    expect(fmtSwr(999)).toBe('> 20:1')
    expect(fmtSwr(0.4)).toBe(DASH)
  })

  it('never renders NaN, Infinity or undefined', () => {
    const fns = [fmtFreq, fmtFreqShort, fmtPower, fmtSwr, fmtTemp, fmtDb, fmtVolts, fmtAmps, fmtLength, fmtDuration]
    for (const f of fns) {
      for (const v of [NaN, Infinity, -Infinity]) {
        const out = f(v)
        expect(out).not.toMatch(/NaN|Infinity|undefined/)
      }
    }
    expect(fmtPercent(NaN)).toBe(DASH)
    expect(fmtImpedance({ re: NaN, im: 0 })).toBe(DASH)
    expect(fmtSi(Infinity, 'H')).toBe(DASH)
  })

  it('writes impedance the way an analyser prints it', () => {
    expect(fmtImpedance({ re: 34.21, im: -18.74 })).toBe('34.2 − j18.7 Ω')
    expect(fmtImpedance({ re: 50, im: 0 })).toBe('50.0 + j0.0 Ω')
    expect(fmtImpedance({ re: 3400, im: 2100 })).toBe('3.4k + j2.1k Ω')
  })

  it('does not print a negative zero', () => {
    expect(fmtDb(-0.0001)).toBe('0.00 dB')
    expect(fmtTemp(-0.001)).toBe('0.0 °C')
  })

  it('reads durations the way a presenter counts', () => {
    expect(fmtDuration(4.2)).toBe('4.2 s')
    expect(fmtDuration(90)).toBe('1m 30s')
    expect(fmtDuration(-1)).toBe(DASH)
  })
})
