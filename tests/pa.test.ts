import { describe, expect, it } from 'vitest'
import type { Complex } from '../src/rf/types'
import { PA, protectionFor, solvePa, stressFromMismatch } from '../src/rf/pa'

/** Reflection coefficient of magnitude m at a given phase, radians. */
const gammaAt = (m: number, phaseRad: number): Complex => ({
  re: m * Math.cos(phaseRad),
  im: m * Math.sin(phaseRad),
})
const MATCHED: Complex = { re: 0, im: 0 }
/** 3:1 has |Gamma| = (3-1)/(3+1) = 0.5. */
const G3 = 0.5

describe('the amplifier as specified', () => {
  it('is the published IC-7300 output stage', () => {
    expect(PA.ratedW).toBe(100)
    expect(PA.supplyV).toBe(13.8)
    expect(PA.deviceCount).toBe(2)
    // Confirmed: RD100HHF1 drain efficiency, 60 % typical on HF.
    expect(PA.peakEfficiency).toBeCloseTo(0.5, 10)
  })

  it('starts folding back before 2:1 and is heavily limited by 3:1', () => {
    expect(PA.foldbackStartSwr).toBeGreaterThanOrEqual(1.5)
    expect(PA.foldbackStartSwr).toBeLessThanOrEqual(2)
    expect(PA.foldbackFullSwr).toBe(3)
  })
})

describe('stressFromMismatch', () => {
  it('is exactly 1.0 on both axes into a perfect load', () => {
    const s = stressFromMismatch(MATCHED)
    expect(s.voltageStress).toBe(1)
    expect(s.currentStress).toBe(1)
  })

  it('turns a 3:1 mismatch at 0 degrees into an overvoltage event', () => {
    // Gamma real and positive: the load has transformed to 150 ohms. Forward and
    // reflected waves add for voltage, subtract for current.
    const s = stressFromMismatch(gammaAt(G3, 0))
    expect(s.voltageStress).toBeCloseTo(1.5, 12)
    expect(s.currentStress).toBeCloseTo(0.5, 12)
    expect(s.voltageStress).toBeGreaterThan(s.currentStress)
  })

  it('turns the same 3:1 mismatch at 180 degrees into an overcurrent event', () => {
    // Gamma real and negative: the load has transformed to 16.7 ohms.
    const s = stressFromMismatch(gammaAt(G3, Math.PI))
    expect(s.voltageStress).toBeCloseTo(0.5, 12)
    expect(s.currentStress).toBeCloseTo(1.5, 12)
    expect(s.currentStress).toBeGreaterThan(s.voltageStress)
  })

  it('splits the difference at 90 degrees, where the load is purely reactive', () => {
    const s = stressFromMismatch(gammaAt(G3, Math.PI / 2))
    expect(s.voltageStress).toBeCloseTo(s.currentStress, 12)
    expect(s.voltageStress).toBeCloseTo(Math.hypot(1, 0.5), 12)
  })

  it('depends on the phase of Gamma, not only on its magnitude', () => {
    const readings = [0, 0.5, 1, 1.5, 2, 2.5, 3].map((p) => stressFromMismatch(gammaAt(G3, p)).voltageStress)
    const spread = Math.max(...readings) - Math.min(...readings)
    expect(spread).toBeGreaterThan(0.9)
  })

  it('always costs headroom somewhere: the larger stress is never below 1', () => {
    for (let i = 0; i < 24; i += 1) {
      const s = stressFromMismatch(gammaAt(0.7, (i / 24) * Math.PI * 2))
      expect(Math.max(s.voltageStress, s.currentStress)).toBeGreaterThanOrEqual(1 - 1e-12)
    }
  })

  it('does not fall over on a non-physical reflection coefficient', () => {
    const s = stressFromMismatch({ re: 4, im: Number.NaN })
    expect(Number.isFinite(s.voltageStress)).toBe(true)
    expect(Number.isFinite(s.currentStress)).toBe(true)
  })
})

describe('protectionFor', () => {
  const quiet = { swr: 1, paTempC: 30, supplyCurrentA: 5 }

  it('does nothing at all when everything is comfortable', () => {
    const p = protectionFor(quiet)
    expect(p.foldback).toBe(1)
    expect(p.level).toBe('normal')
    expect(p.reasons).toHaveLength(0)
    expect(p.swrTriggered).toBe(false)
    expect(p.tempTriggered).toBe(false)
    expect(p.currentTriggered).toBe(false)
  })

  it('reduces power progressively between the two SWR thresholds', () => {
    const mid = protectionFor({ ...quiet, swr: 2.25 })
    expect(mid.level).toBe('foldback')
    expect(mid.foldback).toBeLessThan(1)
    expect(mid.foldback).toBeGreaterThan(0.5)
    expect(mid.swrTriggered).toBe(true)
  })

  it('is limiting hard by 3:1 and harder beyond it', () => {
    const at3 = protectionFor({ ...quiet, swr: 3 })
    const at10 = protectionFor({ ...quiet, swr: 10 })
    expect(at3.foldback).toBeCloseTo(0.5, 6)
    expect(at10.foldback).toBeLessThan(at3.foldback)
    expect(at10.foldback).toBeGreaterThan(0)
  })

  it('never increases power as the SWR gets worse', () => {
    let previous = 1
    for (const swr of [1, 1.5, 1.8, 2, 2.5, 3, 4, 6, 10, 50]) {
      const f = protectionFor({ ...quiet, swr }).foldback
      expect(f).toBeLessThanOrEqual(previous + 1e-12)
      previous = f
    }
  })

  it('shuts down at the absolute maximum channel temperature', () => {
    // Confirmed: Tch maximum is 175 degC for the RD100HHF1.
    const hot = protectionFor({ ...quiet, paTempC: 180 })
    expect(hot.foldback).toBe(0)
    expect(hot.level).toBe('shutdown')
    expect(hot.tempTriggered).toBe(true)
    expect(hot.reasons[0] ?? '').toContain('175')
  })

  it('starts reducing power above the recommended channel temperature', () => {
    const warm = protectionFor({ ...quiet, paTempC: 150 })
    expect(warm.foldback).toBeLessThan(1)
    expect(warm.foldback).toBeGreaterThan(0)
    expect(warm.tempTriggered).toBe(true)
  })

  it('reduces power on drain current too', () => {
    const heavy = protectionFor({ ...quiet, supplyCurrentA: 26 })
    expect(heavy.currentTriggered).toBe(true)
    expect(heavy.foldback).toBeLessThan(1)
  })

  it('gives reasons a person can act on', () => {
    const p = protectionFor({ ...quiet, swr: 3.4 })
    expect(p.reasons.length).toBeGreaterThan(0)
    const first = p.reasons[0] ?? ''
    expect(first).toContain('Power reduced')
    expect(first).toContain('3.4:1')
    expect(first).toContain('antenna socket')
  })
})

describe('solvePa', () => {
  const base = { gamma: MATCHED, envelope: 1, duty: 1, paTempC: 30, damage: 0 }

  it('makes its rated power at its rated efficiency into a perfect load', () => {
    const r = solvePa({ ...base, requestedW: 100 })
    expect(r.forwardW).toBeCloseTo(100, 9)
    expect(r.reflectedW).toBeCloseTo(0, 9)
    expect(r.netW).toBeCloseTo(100, 9)
    expect(r.efficiency).toBeCloseTo(0.5, 9)
    expect(r.dcInputW).toBeCloseTo(100 / PA.peakEfficiency, 6)
    expect(r.supplyCurrentA).toBeCloseTo(100 / PA.peakEfficiency / 13.8, 6)
    expect(r.protection.level).toBe('normal')
  })

  it('conserves energy for every operating point', () => {
    for (const requestedW of [0, 1, 5, 25, 60, 100]) {
      for (const duty of [0.2, 0.5, 1]) {
        for (const phase of [0, 1.2, Math.PI, 4.5]) {
          for (const mag of [0, 0.2, 0.5, 0.8]) {
            const r = solvePa({
              requestedW,
              gamma: gammaAt(mag, phase),
              envelope: 0.8,
              duty,
              paTempC: 40,
              damage: 0,
            })
            expect(r.dcInputW).toBeGreaterThanOrEqual(r.forwardW + r.paDissipationW - 1e-9)
            expect(Number.isFinite(r.dcInputW)).toBe(true)
            expect(Number.isFinite(r.paDissipationW)).toBe(true)
            expect(r.paDissipationW).toBeGreaterThanOrEqual(0)
          }
        }
      }
    }
  })

  it('is much less efficient at low drive', () => {
    const full = solvePa({ ...base, requestedW: 100 })
    const quarter = solvePa({ ...base, requestedW: 25 })
    const trickle = solvePa({ ...base, requestedW: 5 })
    expect(quarter.efficiency).toBeLessThan(full.efficiency)
    expect(trickle.efficiency).toBeLessThan(quarter.efficiency)
    // Class AB drain swing goes as the square root of output power.
    expect(quarter.efficiency).toBeCloseTo(0.5 * Math.sqrt(0.25), 6)
  })

  it('reports the reflected power without pouring it into the finals', () => {
    // The naive model says a 3:1 mismatch dumps 25 % of the output back into the
    // devices as heat. It does not. Dissipation moves because the load line has
    // rotated, and at this phase angle it barely moves at all.
    const matched = solvePa({ ...base, requestedW: 40 })
    const mismatched = solvePa({ ...base, requestedW: 40, gamma: gammaAt(G3, 0) })
    expect(mismatched.reflectedW).toBeGreaterThan(0)
    expect(mismatched.reflectedW / mismatched.forwardW).toBeCloseTo(0.25, 6)
    expect(mismatched.paDissipationW).toBeLessThan(matched.paDissipationW + 0.25 * matched.forwardW)
  })

  it('cooks the finals on an overcurrent mismatch and not on an overvoltage one', () => {
    // Same SWR, same foldback, opposite phase. The overcurrent case pushes more
    // current through less voltage swing, which is the definition of poor
    // efficiency; the overvoltage case is efficient right up until it fails.
    const overVolt = solvePa({ ...base, requestedW: 100, gamma: gammaAt(G3, 0) })
    const overCurrent = solvePa({ ...base, requestedW: 100, gamma: gammaAt(G3, Math.PI) })
    expect(overVolt.forwardW).toBeCloseTo(overCurrent.forwardW, 9)
    expect(overCurrent.paDissipationW).toBeGreaterThan(overVolt.paDissipationW)
    expect(overVolt.voltageStress).toBeGreaterThan(overCurrent.voltageStress)
    expect(overCurrent.currentStress).toBeGreaterThan(overVolt.currentStress)
  })

  it('folds back on SWR and says so in watts', () => {
    const r = solvePa({ ...base, requestedW: 100, gamma: gammaAt(G3, Math.PI) })
    // Roughly half power at 3:1, which is where the foldback floor sits.
    expect(r.forwardW).toBeLessThan(60)
    expect(r.forwardW).toBeGreaterThan(30)
    expect(r.forwardW).toBeGreaterThan(0)
    expect(r.protection.swrTriggered).toBe(true)
    const first = r.protection.reasons[0] ?? ''
    expect(first).toContain('W:')
    expect(first).toContain('SWR')
  })

  it('scales with the speech envelope and the duty cycle', () => {
    const loud = solvePa({ ...base, requestedW: 100, envelope: 1, duty: 0.4 })
    const soft = solvePa({ ...base, requestedW: 100, envelope: 0.5, duty: 0.4 })
    expect(loud.forwardW).toBeCloseTo(40, 6)
    // Power goes as the square of the envelope amplitude.
    expect(soft.forwardW).toBeCloseTo(10, 6)
    // Between syllables the bias current still flows and still makes heat.
    expect(soft.paDissipationW).toBeGreaterThan(0)
  })

  it('makes no power from a destroyed device', () => {
    const dead = solvePa({ ...base, requestedW: 100, damage: 1 })
    expect(dead.forwardW).toBe(0)
    expect(dead.dcInputW).toBe(0)
    expect(dead.paDissipationW).toBe(0)
  })

  it('returns clean zeros when the radio is not transmitting', () => {
    const idle = solvePa({ ...base, requestedW: 0 })
    expect(idle.forwardW).toBe(0)
    expect(idle.reflectedW).toBe(0)
    expect(idle.supplyCurrentA).toBe(0)
    expect(idle.efficiency).toBe(0)
    expect(Number.isNaN(idle.netW)).toBe(false)
  })

  it('survives nonsense inputs without producing NaN', () => {
    const r = solvePa({
      requestedW: Number.NaN,
      gamma: { re: Number.NaN, im: Number.NaN },
      envelope: -5,
      duty: 99,
      paTempC: Number.NaN,
      damage: -1,
    })
    for (const v of [r.forwardW, r.reflectedW, r.netW, r.dcInputW, r.supplyCurrentA, r.paDissipationW, r.efficiency, r.voltageStress, r.currentStress]) {
      expect(Number.isFinite(v)).toBe(true)
    }
  })

  it('cuts the drive to nothing once the channel reaches its absolute maximum', () => {
    const r = solvePa({ ...base, requestedW: 100, paTempC: 200 })
    expect(r.forwardW).toBe(0)
    expect(r.protection.level).toBe('shutdown')
  })
})
