import { describe, expect, it } from 'vitest'
import { MODES, MODE_LIST, modeEnvelope } from '../src/rf/audio'

/**
 * The load-bearing invariant of the transmit model: for every mode, the mean
 * square of the envelope over time equals that mode's published average-to-peak
 * ratio. Nothing else in the application multiplies by a duty cycle, so if this
 * drifts, every heating figure in the app is wrong.
 */
describe('transmit envelopes carry the duty cycle', () => {
  const meanSquare = (mode: (typeof MODE_LIST)[number]['id'], comp = 0) => {
    const N = 400_000
    const dt = 0.0005 // 200 seconds, long enough to cover the CW pattern and syllables
    let sum = 0
    for (let i = 0; i < N; i++) {
      const e = modeEnvelope(mode, i * dt, comp)
      sum += e * e
    }
    return sum / N
  }

  for (const def of MODE_LIST) {
    it(`${def.id} averages ${(def.dutyCycle * 100).toFixed(0)} percent of peak power`, () => {
      const measured = meanSquare(def.id)
      expect(measured).toBeGreaterThan(def.dutyCycle * 0.9)
      expect(measured).toBeLessThan(def.dutyCycle * 1.1)
    })
  }

  it('never leaves 0..1', () => {
    for (const def of MODE_LIST) {
      for (let i = 0; i < 4_000; i++) {
        const e = modeEnvelope(def.id, i * 0.0007, 5)
        expect(Number.isFinite(e)).toBe(true)
        expect(e).toBeGreaterThanOrEqual(0)
        expect(e).toBeLessThanOrEqual(1)
      }
    }
  })

  it('is deterministic', () => {
    expect(modeEnvelope('USB', 3.14159, 4)).toBe(modeEnvelope('USB', 3.14159, 4))
    expect(modeEnvelope('CW', 1.5, 0)).toBe(modeEnvelope('CW', 1.5, 0))
  })

  it('raises the average without raising the peak when compression is applied', () => {
    const off = meanSquare('USB', 0)
    const hard = meanSquare('USB', 10)
    expect(hard).toBeGreaterThan(off * 1.8)
    let peak = 0
    for (let i = 0; i < 100_000; i++) peak = Math.max(peak, modeEnvelope('USB', i * 0.0005, 10))
    expect(peak).toBeLessThanOrEqual(1.0001)
  })

  it('keys CW rather than modulating it', () => {
    // A keyed envelope spends most of its time at exactly 0 or exactly 1.
    let extremes = 0
    const N = 50_000
    for (let i = 0; i < N; i++) {
      const e = modeEnvelope('CW', i * 0.0005, 0)
      if (e < 1e-6 || e > 1 - 1e-6) extremes++
    }
    expect(extremes / N).toBeGreaterThan(0.9)
  })

  it('holds FM and data modes at full output', () => {
    expect(MODES.FM.constantEnvelope).toBe(true)
    expect(modeEnvelope('FM', 12.3, 0)).toBe(1)
    expect(modeEnvelope('RTTY', 0.7, 9)).toBe(1)
  })
})
