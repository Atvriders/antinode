/**
 * Transmission line tests.
 *
 * These check the four classical results every operator has heard quoted, plus
 * the two that get quoted wrongly:
 *
 *   half wave repeats the load          quarter wave inverts it about Z0
 *   a matched line is invisible         a long lossy line looks like Z0
 *   reflection is not loss              but loss times reflection is
 *
 * The standing-wave checks are the ones worth reading. If antinode spacing does
 * not come out at half a wavelength IN THE CABLE, the velocity factor has been
 * dropped somewhere.
 */

import { describe, expect, it } from 'vitest'
import { C, cAbs, cSub } from '../src/rf/complex'
import { CABLES, matchedLossDb, wavelengthM } from '../src/rf/cables'
import { swrFromZ } from '../src/rf/match'
import {
  excessLossDb, lineInputImpedance, solveLine, standingWaveProfile,
} from '../src/rf/line'
import type { CableDef, Complex } from '../src/rf/types'

const MHZ = 1e6
const F20 = 14.2 * MHZ

/** Float32Array indexing under noUncheckedIndexedAccess. NaN if out of range. */
const at = (a: Float32Array, i: number): number => a[i] ?? Number.NaN

/** Distance between two impedances in the complex plane, ohms. */
const dist = (a: Complex, b: Complex): number => cAbs(cSub(a, b))

/** Fractional distance from `got` to `want`, measured against |want|. */
const relErr = (got: Complex, want: Complex): number => dist(got, want) / cAbs(want)

const halfWave = (cable: CableDef, freqHz: number): number =>
  wavelengthM(freqHz, cable.vf) / 2

describe('lineInputImpedance', () => {
  it('is invisible when the load equals Z0, at any length', () => {
    for (const lengthM of [0, 0.5, 3.7, 12, 45.3, 200]) {
      const zIn = lineInputImpedance(C(50, 0), CABLES.rg58, F20, lengthM)
      expect(zIn.re).toBeCloseTo(50, 6)
      expect(zIn.im).toBeCloseTo(0, 6)
    }
  })

  it('is invisible for window line terminated in 450 ohms', () => {
    const zIn = lineInputImpedance(C(450, 0), CABLES.ladder450, 3.7 * MHZ, 31.4)
    expect(zIn.re).toBeCloseTo(450, 6)
    expect(zIn.im).toBeCloseTo(0, 6)
  })

  it('repeats the load every half wavelength, to within the line loss', () => {
    const zL = C(25, 30)
    for (const cable of [CABLES.lmr400, CABLES.rg213]) {
      const l = halfWave(cable, F20)
      const zIn = lineInputImpedance(zL, cable, F20, l)
      // Loss over a half wave here is well under 0.2 dB, so the repeat is good
      // to a few percent. It is never exact: loss drags the answer toward Z0.
      expect(relErr(zIn, zL)).toBeLessThan(0.035)
      expect(dist(zIn, C(cable.z0, 0))).toBeLessThan(dist(zL, C(cable.z0, 0)))
    }
  })

  it('repeats the load again after a full wavelength, with twice the loss drag', () => {
    const zL = C(120, -80)
    const cable = CABLES.lmr400
    const half = lineInputImpedance(zL, cable, F20, halfWave(cable, F20))
    const full = lineInputImpedance(zL, cable, F20, 2 * halfWave(cable, F20))
    expect(relErr(half, zL)).toBeLessThan(0.05)
    expect(relErr(full, zL)).toBeLessThan(0.10)
    // Twice the loss, so the full wave sits further toward Z0 than one half.
    expect(relErr(full, zL)).toBeGreaterThan(relErr(half, zL))
    expect(dist(full, C(50, 0))).toBeLessThan(dist(half, C(50, 0)))
  })

  it('inverts the load about Z0 after a quarter wavelength', () => {
    const cable = CABLES.lmr400
    const quarter = halfWave(cable, F20) / 2
    const z0sq = cable.z0 * cable.z0
    for (const r of [200, 12.5]) {
      const zIn = lineInputImpedance(C(r, 0), cable, F20, quarter)
      expect(relErr(zIn, C(z0sq / r, 0))).toBeLessThan(0.05)
    }
    // The transformation is only exact on a lossless line, and the error grows
    // with the transformation ratio: at 12:1 the 0.07 dB of loss in this quarter
    // wave is already worth 9 percent, always in the direction of Z0.
    const extreme = lineInputImpedance(C(600, 0), cable, F20, quarter)
    expect(relErr(extreme, C(z0sq / 600, 0))).toBeLessThan(0.12)
    expect(extreme.re).toBeGreaterThan(z0sq / 600)
    // The quarter-wave transformer also flips the sign of the reactance.
    const reactive = lineInputImpedance(C(100, -40), cable, F20, quarter)
    expect(reactive.im).toBeGreaterThan(0)
    expect(relErr(reactive, C(21.55, 8.62))).toBeLessThan(0.05)
  })

  it('turns a short into an open a quarter wave away', () => {
    const cable = CABLES.ladder450
    const quarter = halfWave(cable, F20) / 2
    const zIn = lineInputImpedance(C(0, 0), cable, F20, quarter)
    expect(cAbs(zIn)).toBeGreaterThan(20 * cable.z0)
  })

  it('pulls any load toward Z0 once the line is long and lossy', () => {
    // 300 m of RG-58 on 10 m is 24 dB of matched loss. Whatever is on the far
    // end, the radio sees a comfortable 50 ohms and a happy SWR meter. This is
    // the single most misread reading in amateur radio.
    const loads = [C(5, -300), C(2000, 900), C(1, 0), C(0, 0), C(1e6, 0)]
    for (const zL of loads) {
      const zIn = lineInputImpedance(zL, CABLES.rg58, 28 * MHZ, 300)
      expect(dist(zIn, C(50, 0))).toBeLessThan(1)
      expect(swrFromZ(zIn, 50)).toBeLessThan(1.05)
    }
  })

  it('never returns NaN, however silly the inputs', () => {
    const cable = CABLES.rg213
    const nasty: Complex[] = [
      C(0, 0), C(1e12, 1e12), C(-30, 0), C(Number.NaN, 5), C(0, -1e9),
    ]
    for (const zL of nasty) {
      for (const l of [0, 1e-6, 1e4]) {
        const zIn = lineInputImpedance(zL, cable, F20, l)
        expect(Number.isFinite(zIn.re)).toBe(true)
        expect(Number.isFinite(zIn.im)).toBe(true)
      }
    }
  })
})

describe('excessLossDb', () => {
  it('matches the additional-loss chart in the Antenna Book', () => {
    // 1 dB matched loss, 3:1 SWR at the load -> about half a dB extra.
    expect(excessLossDb(1, 3)).toBeCloseTo(0.504, 2)
    // 3 dB matched loss, same 3:1 SWR -> 3.97 dB total, not 3.6.
    expect(3 + excessLossDb(3, 3)).toBeCloseTo(3.968, 2)
    expect(excessLossDb(3, 3)).toBeCloseTo(0.968, 2)
  })

  it('charges nothing for a perfect match', () => {
    for (const ml of [0.1, 1, 3, 12]) {
      expect(excessLossDb(ml, 1)).toBeCloseTo(0, 9)
    }
  })

  it('charges nothing on a lossless line at any SWR', () => {
    // Reflection is not loss. The reflected power comes back to the source.
    for (const swr of [1, 2, 5, 20, 999]) {
      expect(excessLossDb(0, swr)).toBe(0)
    }
  })

  it('rises with SWR and with matched loss, and never goes negative', () => {
    let previous = -1
    for (const swr of [1, 1.5, 2, 3, 5, 10, 50]) {
      const extra = excessLossDb(1.5, swr)
      expect(extra).toBeGreaterThan(previous)
      expect(extra).toBeGreaterThanOrEqual(0)
      previous = extra
    }
    expect(excessLossDb(0.5, 4)).toBeLessThan(excessLossDb(1.5, 4))
    expect(excessLossDb(1.5, 4)).toBeLessThan(excessLossDb(4, 4))
  })

  it('stays finite for absurd arguments', () => {
    for (const ml of [-1, 0, 1e-9, 400, Number.NaN, Number.POSITIVE_INFINITY]) {
      for (const swr of [0, 1, 999, Number.NaN, Number.POSITIVE_INFINITY]) {
        const extra = excessLossDb(ml, swr)
        expect(Number.isFinite(extra)).toBe(true)
        expect(extra).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('shows why window line survives a mismatch that ruins coax', () => {
    // 30 m of each on 80 m, feeding a 10:1 load.
    const l = 30
    const f = 3.6 * MHZ
    const coax = matchedLossDb(CABLES.rg58, f, l)
    const window = matchedLossDb(CABLES.ladder450, f, l)
    const coaxExcess = excessLossDb(coax, 10)
    const windowExcess = excessLossDb(window, 10)
    const coaxTotal = coax + coaxExcess
    const windowTotal = window + windowExcess
    expect(windowTotal).toBeLessThan(0.7)
    expect(coaxTotal).toBeGreaterThan(4 * windowTotal)
    // The extra loss the coax pays for the mismatch alone is larger than the
    // entire loss of the window-line run, matched loss included.
    expect(coaxExcess).toBeGreaterThan(windowTotal)
  })
})

describe('solveLine', () => {
  it('adds the two losses consistently', () => {
    const r = solveLine(C(12, -75), CABLES.rg8x, 7.1 * MHZ, 24)
    expect(r.totalLossDb).toBeCloseTo(r.matchedLossDb + r.excessLossDb, 12)
    expect(r.excessLossDb).toBeGreaterThan(0)
    expect(r.matchedLossDb).toBeGreaterThan(0)
  })

  it('reports no excess loss into a matched load', () => {
    const r = solveLine(C(50, 0), CABLES.rg213, F20, 30)
    expect(r.excessLossDb).toBeCloseTo(0, 9)
    expect(r.totalLossDb).toBeCloseTo(r.matchedLossDb, 9)
    expect(r.zIn.re).toBeCloseTo(50, 6)
  })

  it('counts electrical length in wavelengths, not metres', () => {
    const cable = CABLES.rg213
    const r = solveLine(C(50, 0), cable, F20, 2 * wavelengthM(F20, cable.vf))
    expect(r.lengthWaves).toBeCloseTo(2, 9)
    // 2 electrical wavelengths of RG-213 on 20 m is 27.87 m of cable, not 42.2 m.
    expect(2 * wavelengthM(F20, cable.vf)).toBeCloseTo(27.868, 2)
  })

  it('reports alpha and beta in per-metre units that agree with the loss', () => {
    const cable = CABLES.rg58
    const l = 30.48
    const r = solveLine(C(50, 0), cable, F20, l)
    expect(r.alpha * l * 8.685889638).toBeCloseTo(r.matchedLossDb, 9)
    expect(r.beta * wavelengthM(F20, cable.vf)).toBeCloseTo(2 * Math.PI, 9)
  })

  it('returns finite fields for a zero-length line and a dead short', () => {
    const r = solveLine(C(0, 0), CABLES.rg58, F20, 0)
    for (const v of [r.zIn.re, r.zIn.im, r.matchedLossDb, r.totalLossDb,
      r.excessLossDb, r.lengthWaves, r.alpha, r.beta]) {
      expect(Number.isFinite(v)).toBe(true)
    }
    expect(r.matchedLossDb).toBe(0)
    expect(r.lengthWaves).toBe(0)
  })
})

describe('standingWaveProfile', () => {
  const openish = C(4000, 0)

  it('samples from the antenna end to the radio end', () => {
    const p = standingWaveProfile({
      zL: openish, cable: CABLES.ladder450, freqHz: F20, lengthM: 20, forwardW: 100,
    })
    expect(p.positions).toHaveLength(256)
    expect(p.vMag).toHaveLength(256)
    expect(p.iMag).toHaveLength(256)
    expect(p.phase).toHaveLength(256)
    expect(at(p.positions, 0)).toBe(0)
    expect(at(p.positions, 255)).toBe(1)
    for (let i = 1; i < 256; i += 1) {
      expect(at(p.positions, i)).toBeGreaterThan(at(p.positions, i - 1))
    }
    // The forward wave is referenced to the radio end, so its phase is zero
    // there and lags by beta*l out at the antenna.
    expect(at(p.phase, 255)).toBeCloseTo(0, 6)
    expect(at(p.phase, 0)).toBeLessThan(0)
  })

  it('honours the sample count', () => {
    const p = standingWaveProfile({
      zL: openish, cable: CABLES.rg213, freqHz: F20, lengthM: 10,
      forwardW: 100, samples: 64,
    })
    expect(p.positions).toHaveLength(64)
    expect(p.vMag).toHaveLength(64)
  })

  it('is flat into a matched load, with only the cable loss showing', () => {
    const cable = CABLES.rg213
    const lengthM = 1
    const p = standingWaveProfile({
      zL: C(50, 0), cable, freqHz: F20, lengthM, forwardW: 100,
    })
    // No reflection, so no standing wave: nothing to find.
    expect(p.antinodes).toHaveLength(0)
    expect(p.nodes).toHaveLength(0)
    // Amplitude falls smoothly from the radio end to the antenna end by half the
    // matched loss in dB, because loss in dB is a power ratio and this is volts.
    const expected = Math.pow(10, -matchedLossDb(cable, F20, lengthM) / 20)
    expect(at(p.vMag, 255)).toBeCloseTo(1, 6)
    expect(at(p.vMag, 0)).toBeCloseTo(expected, 6)
  })

  it('anchors the forward wave to the power entering the cable', () => {
    // 100 W into 50 ohms is 100 V peak and 2 A peak. Short line, so no loss.
    const p = standingWaveProfile({
      zL: C(50, 0), cable: CABLES.rg213, freqHz: F20, lengthM: 0.001, forwardW: 100,
    })
    expect(p.vPeakVolts).toBeCloseTo(100, 2)
    expect(p.iPeakAmps).toBeCloseTo(2, 3)
    // Volts go as the square root of power.
    const q = standingWaveProfile({
      zL: C(50, 0), cable: CABLES.rg213, freqHz: F20, lengthM: 0.001, forwardW: 200,
    })
    expect(q.vPeakVolts / p.vPeakVolts).toBeCloseTo(Math.SQRT2, 4)
  })

  it('normalises each envelope to its own maximum', () => {
    const p = standingWaveProfile({
      zL: openish, cable: CABLES.ladder450, freqHz: F20, lengthM: 40,
      forwardW: 100, samples: 1024,
    })
    let vMax = 0
    let iMax = 0
    for (let i = 0; i < 1024; i += 1) {
      vMax = Math.max(vMax, at(p.vMag, i))
      iMax = Math.max(iMax, at(p.iMag, i))
      expect(at(p.vMag, i)).toBeGreaterThanOrEqual(0)
      expect(at(p.vMag, i)).toBeLessThanOrEqual(1.0000001)
    }
    expect(vMax).toBeCloseTo(1, 5)
    expect(iMax).toBeCloseTo(1, 5)
  })

  it('spaces voltage antinodes half a wavelength apart in the cable', () => {
    // The half wavelength that matters is the one inside the dielectric, so this
    // is the test that fails if anyone drops the velocity factor.
    const cases: ReadonlyArray<readonly [CableDef, Complex, number]> = [
      [CABLES.ladder450, C(4000, 0), 3],
      [CABLES.rg213, C(300, 0), 2],
      [CABLES.rg58, C(300, 0), 2],
    ]
    for (const row of cases) {
      const cable = row[0]
      const lambda = wavelengthM(F20, cable.vf)
      const lengthM = row[2] * lambda
      const p = standingWaveProfile({
        zL: row[1], cable, freqHz: F20, lengthM, forwardW: 100, samples: 2048,
      })
      // A run of N wavelengths has N maxima strictly inside it; the ones at the
      // ends sit on the load and on the input and are not turning points here.
      expect(p.antinodes).toHaveLength(2 * row[2] - 1)
      for (let k = 1; k < p.antinodes.length; k += 1) {
        const a0 = p.antinodes[k - 1] ?? 0
        const a1 = p.antinodes[k] ?? 0
        expect((a1 - a0) * lengthM).toBeCloseTo(lambda / 2, 2)
      }
      // Nodes fall midway between antinodes, a quarter wavelength from each.
      const firstNodeAfter = p.nodes.find((n) => n > (p.antinodes[0] ?? 0))
      expect(firstNodeAfter).toBeDefined()
      expect(((firstNodeAfter ?? 0) - (p.antinodes[0] ?? 0)) * lengthM)
        .toBeCloseTo(lambda / 4, 1)
    }
  })

  it('puts a current minimum where the voltage peaks', () => {
    const cable = CABLES.lmr400
    const lambda = wavelengthM(F20, cable.vf)
    const samples = 2048
    const lengthM = 3 * lambda
    const p = standingWaveProfile({
      zL: C(500, 0), cable, freqHz: F20, lengthM, forwardW: 100, samples,
    })
    const target = p.antinodes[0] ?? 0
    const i = Math.round(target * (samples - 1))
    expect(at(p.vMag, i)).toBeGreaterThan(0.9)
    expect(at(p.iMag, i)).toBeLessThan(0.25)
  })

  it('raises the peak voltage on the line when the load is mismatched', () => {
    const cable = CABLES.rg213
    const matched = standingWaveProfile({
      zL: C(50, 0), cable, freqHz: F20, lengthM: 20, forwardW: 100,
    })
    const mismatched = standingWaveProfile({
      zL: C(500, 0), cable, freqHz: F20, lengthM: 20, forwardW: 100, samples: 1024,
    })
    expect(mismatched.vPeakVolts).toBeGreaterThan(1.5 * matched.vPeakVolts)
    // Voltage up, current down: they trade places, they do not both rise.
    expect(mismatched.iPeakAmps).toBeLessThan(2 * matched.iPeakAmps)
  })

  it('returns a valid all-zero profile with no drive', () => {
    const p = standingWaveProfile({
      zL: C(4, -300), cable: CABLES.rg58, freqHz: F20, lengthM: 18, forwardW: 0,
    })
    expect(p.vPeakVolts).toBe(0)
    expect(p.iPeakAmps).toBe(0)
    expect(p.antinodes).toHaveLength(0)
    expect(p.nodes).toHaveLength(0)
    for (let i = 0; i < p.vMag.length; i += 1) {
      expect(at(p.vMag, i)).toBe(0)
      expect(at(p.iMag, i)).toBe(0)
      expect(Number.isFinite(at(p.phase, i))).toBe(true)
      expect(Number.isFinite(at(p.positions, i))).toBe(true)
    }
  })

  it('produces no NaN for degenerate loads, lengths or sample counts', () => {
    const cases = [
      { zL: C(0, 0), lengthM: 12, samples: 256 },
      { zL: C(1e12, -1e12), lengthM: 12, samples: 256 },
      { zL: C(Number.NaN, Number.NaN), lengthM: 12, samples: 256 },
      { zL: C(50, 0), lengthM: 0, samples: 256 },
      { zL: C(75, 20), lengthM: 5, samples: 1 },
      { zL: C(75, 20), lengthM: 5, samples: Number.NaN },
    ]
    for (const c of cases) {
      const p = standingWaveProfile({
        zL: c.zL, cable: CABLES.rg58, freqHz: F20,
        lengthM: c.lengthM, forwardW: 100, samples: c.samples,
      })
      expect(p.positions.length).toBeGreaterThanOrEqual(2)
      expect(Number.isFinite(p.vPeakVolts)).toBe(true)
      expect(Number.isFinite(p.iPeakAmps)).toBe(true)
      for (let i = 0; i < p.positions.length; i += 1) {
        expect(Number.isFinite(at(p.vMag, i))).toBe(true)
        expect(Number.isFinite(at(p.iMag, i))).toBe(true)
        expect(Number.isFinite(at(p.phase, i))).toBe(true)
      }
    }
  })

  it('washes the standing wave out on a long lossy line', () => {
    // Same 10:1 load, two cables. On the lossy one the pattern is nearly gone by
    // the time it reaches the radio, which is exactly why the shack SWR meter
    // reads low on a bad feedline.
    const args = { freqHz: 28 * MHZ, lengthM: 90, forwardW: 100, samples: 2048 }
    // Same 10:1 SWR at the load on both, so only the loss differs.
    const bad = standingWaveProfile({ ...args, cable: CABLES.rg58, zL: C(500, 0) })
    const good = standingWaveProfile({ ...args, cable: CABLES.ladder450, zL: C(4500, 0) })
    const ripple = (v: Float32Array, from: number, to: number): number => {
      let lo = Number.POSITIVE_INFINITY
      let hi = 0
      for (let i = from; i < to; i += 1) {
        lo = Math.min(lo, v[i] ?? 0)
        hi = Math.max(hi, v[i] ?? 0)
      }
      return hi / Math.max(lo, 1e-9)
    }
    // Down at the antenna both lines show the full 10:1 pattern.
    expect(ripple(bad.vMag, 0, 512)).toBeGreaterThan(8)
    expect(ripple(good.vMag, 0, 512)).toBeGreaterThan(8)
    // Up at the radio the RG-58 pattern has been flattened by 7 dB of loss.
    expect(ripple(bad.vMag, 1536, 2048)).toBeLessThan(2.2)
    expect(ripple(bad.vMag, 1536, 2048)).toBeLessThan(ripple(good.vMag, 1536, 2048))
  })
})
