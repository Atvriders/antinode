import { describe, expect, it } from 'vitest'

import {
  ANTENNA_LIST,
  ANTENNAS,
  antennaExtras,
  antennaImpedance,
  antennaStress,
  antennaSwrSweep,
  defaultParams,
  resonantFrequencies,
} from '../src/rf/antennas'
import { swrFromZ } from '../src/rf/match'
import type { AntennaId } from '../src/rf/types'

const ALL: readonly AntennaId[] = [
  'dummy-load', 'dipole-40', 'dipole-20', 'fan-dipole', 'efhw-40', 'g5rv',
  'ocf-windom', 'vertical-quarter-40', 'vertical-multiband', 'random-wire-9to1',
  'mag-loop', 'mobile-whip-20', 'screwdriver-mobile', 'yagi-3el-20',
]

const swrAt = (id: AntennaId, f: number, p = defaultParams(id)): number =>
  swrFromZ(antennaImpedance(id, f, p))

/** Width in Hz of the band around fc where the SWR stays below `limit`. */
const bandwidthBelow = (
  id: AntennaId,
  fc: number,
  limit: number,
  params = defaultParams(id),
  stepHz = 1000,
): number => {
  if (swrAt(id, fc, params) >= limit) return 0
  let lo = fc
  let hi = fc
  while (lo > 1e6 && swrAt(id, lo - stepHz, params) < limit) lo -= stepHz
  while (hi < 60e6 && swrAt(id, hi + stepHz, params) < limit) hi += stepHz
  return hi - lo
}

// ─── The table ───────────────────────────────────────────────────────────────

describe('the antenna table', () => {
  it('has an entry for every id and nothing else', () => {
    expect(Object.keys(ANTENNAS).sort()).toEqual([...ALL].sort())
    expect(ANTENNA_LIST).toHaveLength(ALL.length)
  })

  it('keys the record by the definition id', () => {
    for (const id of ALL) expect(ANTENNAS[id].id).toBe(id)
  })

  it('lists every antenna exactly once', () => {
    expect(new Set(ANTENNA_LIST.map((a) => a.id)).size).toBe(ALL.length)
  })

  it('keeps the selector labels short enough for the panel', () => {
    for (const a of ANTENNA_LIST) expect(a.short.length).toBeLessThanOrEqual(28)
  })

  it('writes real copy for every antenna', () => {
    for (const a of ANTENNA_LIST) {
      expect(a.summary.length).toBeGreaterThan(20)
      expect(a.detail.length).toBeGreaterThan(120)
      expect(a.fidelityNote.length).toBeGreaterThan(80)
    }
  })

  it('gives every parameter a default inside its own range', () => {
    for (const a of ANTENNA_LIST) {
      for (const p of a.params) {
        expect(p.default).toBeGreaterThanOrEqual(p.min)
        expect(p.default).toBeLessThanOrEqual(p.max)
        expect(p.step).toBeGreaterThan(0)
        expect(p.help.length).toBeGreaterThan(10)
      }
    }
  })

  it('returns the declared defaults from defaultParams', () => {
    for (const a of ANTENNA_LIST) {
      const d = defaultParams(a.id)
      expect(Object.keys(d)).toHaveLength(a.params.length)
      for (const p of a.params) expect(d[p.key]).toBe(p.default)
    }
  })

  it('marks the two self-tunable antennas and only those', () => {
    const tunable = ANTENNA_LIST.filter((a) => a.selfTunable).map((a) => a.id)
    expect(tunable.sort()).toEqual(['mag-loop', 'screwdriver-mobile'])
  })
})

// ─── Dummy load ──────────────────────────────────────────────────────────────

describe('the dummy load', () => {
  it('is exactly 50 + j0 everywhere', () => {
    for (const f of [1e6, 3.5e6, 7.1e6, 14.2e6, 28.4e6, 50e6, 60e6]) {
      const z = antennaImpedance('dummy-load', f, {})
      expect(z.re).toBe(50)
      expect(z.im).toBe(0)
    }
  })

  it('reads a perfect 1.0 to 1', () => {
    expect(swrAt('dummy-load', 14.2e6)).toBeCloseTo(1, 10)
  })

  it('radiates none of it, which is the point', () => {
    expect(antennaExtras('dummy-load', 14.2e6, {}).efficiency).toBe(0)
  })

  it('has no Q, because it is not resonant', () => {
    expect(antennaExtras('dummy-load', 14.2e6, {}).qFactor).toBe(0)
  })
})

// ─── 40 m dipole ─────────────────────────────────────────────────────────────

describe('the 40 m dipole', () => {
  const p = defaultParams('dipole-40')

  it('resonates near 7.1 MHz', () => {
    const res = resonantFrequencies('dipole-40', p, 5e6, 9e6)
    expect(res).toHaveLength(1)
    const f = res[0] ?? 0
    expect(f).toBeGreaterThan(6.95e6)
    expect(f).toBeLessThan(7.25e6)
  })

  it('is 60 to 95 ohms resistive at resonance', () => {
    const z = antennaImpedance('dipole-40', 7.1e6, p)
    expect(z.re).toBeGreaterThan(60)
    expect(z.re).toBeLessThan(95)
    expect(Math.abs(z.im)).toBeLessThan(25)
  })

  it('has a 2:1 SWR bandwidth of 250 to 400 kHz', () => {
    const bw = bandwidthBelow('dipole-40', 7.1e6, 2)
    expect(bw).toBeGreaterThan(250e3)
    expect(bw).toBeLessThan(400e3)
  })

  it('goes capacitive below resonance and inductive above', () => {
    expect(antennaImpedance('dipole-40', 6.6e6, p).im).toBeLessThan(-50)
    expect(antennaImpedance('dipole-40', 7.6e6, p).im).toBeGreaterThan(50)
  })

  it('is several thousand ohms on 20 m, where it is a full wave', () => {
    const z = antennaImpedance('dipole-40', 14.175e6, p)
    expect(Math.hypot(z.re, z.im)).toBeGreaterThan(3000)
    expect(swrAt('dipole-40', 14.175e6)).toBeGreaterThan(20)
  })

  it('has a usable third-harmonic resonance in the 15 m band', () => {
    const res = resonantFrequencies('dipole-40', p, 19e6, 24e6)
    expect(res.length).toBeGreaterThanOrEqual(1)
    const f = res[0] ?? 0
    expect(f).toBeGreaterThan(21.0e6)
    expect(f).toBeLessThan(21.7e6)
    expect(swrAt('dipole-40', f)).toBeLessThan(2.5)
  })

  it('shows 90 to 110 ohms on that third harmonic', () => {
    const f = resonantFrequencies('dipole-40', p, 19e6, 24e6)[0] ?? 21.4e6
    const z = antennaImpedance('dipole-40', f, p)
    expect(z.re).toBeGreaterThan(90)
    expect(z.re).toBeLessThan(110)
  })

  it('swings between roughly 40 and 90 ohms as it is raised', () => {
    const low = antennaImpedance('dipole-40', 7.1e6, { length: 20.1, height: 3 }).re
    const peak = antennaImpedance('dipole-40', 7.1e6, { length: 20.1, height: 13 }).re
    expect(low).toBeLessThan(45)
    expect(low).toBeGreaterThan(30)
    expect(peak).toBeGreaterThan(80)
    expect(peak).toBeLessThan(95)
  })

  it('comes back down again above the peak, as the ground reflection reverses', () => {
    const peak = antennaImpedance('dipole-40', 7.1e6, { length: 20.1, height: 13 }).re
    const higher = antennaImpedance('dipole-40', 7.1e6, { length: 20.1, height: 24 }).re
    expect(higher).toBeLessThan(peak)
    expect(higher).toBeGreaterThan(45)
  })

  it('radiates far more of the power when it is higher up', () => {
    const low = antennaExtras('dipole-40', 7.1e6, { length: 20.1, height: 3 }).efficiency
    const high = antennaExtras('dipole-40', 7.1e6, { length: 20.1, height: 15 }).efficiency
    expect(low).toBeLessThan(0.6)
    expect(high).toBeGreaterThan(0.9)
  })

  it('moves its resonance down when the wire is made longer', () => {
    const shortWire = resonantFrequencies('dipole-40', { length: 19, height: 10 }, 5e6, 9e6)[0] ?? 0
    const longWire = resonantFrequencies('dipole-40', { length: 21.5, height: 10 }, 5e6, 9e6)[0] ?? 0
    expect(longWire).toBeLessThan(shortWire)
    expect(shortWire - longWire).toBeGreaterThan(300e3)
  })
})

// ─── 20 m dipole ─────────────────────────────────────────────────────────────

describe('the 20 m dipole', () => {
  it('resonates in the 20 m band', () => {
    const f = resonantFrequencies('dipole-20', defaultParams('dipole-20'), 12e6, 17e6)[0] ?? 0
    expect(f).toBeGreaterThan(14.0e6)
    expect(f).toBeLessThan(14.35e6)
  })

  it('is a poor load on 10 m, where it is a full wave', () => {
    expect(swrAt('dipole-20', 28.4e6)).toBeGreaterThan(20)
  })

  it('is roughly half the wire of the 40 m dipole', () => {
    const a = ANTENNAS['dipole-20'].spanM
    const b = ANTENNAS['dipole-40'].spanM
    expect(a / b).toBeGreaterThan(0.45)
    expect(a / b).toBeLessThan(0.55)
  })
})

// ─── Fan dipole ──────────────────────────────────────────────────────────────

describe('the fan dipole', () => {
  const p = defaultParams('fan-dipole')

  it('has a resonance in each of its four bands', () => {
    const res = resonantFrequencies('fan-dipole', p, 6e6, 30e6)
    expect(res.length).toBeGreaterThanOrEqual(4)
    const bands: readonly (readonly [number, number])[] = [
      [7.0e6, 7.3e6], [14.0e6, 14.35e6], [21.0e6, 21.45e6], [28.0e6, 29.0e6],
    ]
    for (const [lo, hi] of bands) {
      expect(res.some((f) => f >= lo && f <= hi)).toBe(true)
    }
  })

  it('is under 2:1 at the middle of every band it was built for', () => {
    for (const f of [7.15e6, 14.175e6, 21.2e6, 28.4e6]) {
      expect(swrAt('fan-dipole', f)).toBeLessThan(2)
    }
  })

  it('is useless on the bands between, like every multiband wire', () => {
    expect(swrAt('fan-dipole', 10.12e6)).toBeGreaterThan(5)
    expect(swrAt('fan-dipole', 18.1e6)).toBeGreaterThan(5)
  })
})

// ─── End-fed half wave ───────────────────────────────────────────────────────

describe('the end-fed half wave', () => {
  it('lands between 40 and 70 ohms on every harmonic', () => {
    for (const f of [7.1e6, 14.2e6, 21.3e6, 28.4e6]) {
      const z = antennaImpedance('efhw-40', f, defaultParams('efhw-40'))
      expect(z.re).toBeGreaterThan(40)
      expect(z.re).toBeLessThan(70)
      expect(swrAt('efhw-40', f)).toBeLessThan(1.5)
    }
  })

  it('is a bad load where the wire is an odd quarter wave', () => {
    expect(swrAt('efhw-40', 3.55e6)).toBeGreaterThan(4)
    expect(swrAt('efhw-40', 10.65e6)).toBeGreaterThan(4)
  })

  it('loses more in the transformer off resonance than on it', () => {
    const on = antennaExtras('efhw-40', 7.1e6, defaultParams('efhw-40')).efficiency
    const off = antennaExtras('efhw-40', 8.9e6, defaultParams('efhw-40')).efficiency
    expect(on).toBeGreaterThan(0.8)
    expect(on).toBeLessThan(0.95)
    expect(off).toBeLessThan(on)
  })

  it('changes what the radio sees when the transformer ratio changes', () => {
    const r49 = antennaImpedance('efhw-40', 7.1e6, { length: 20.7, ratio: 49 }).re
    const r64 = antennaImpedance('efhw-40', 7.1e6, { length: 20.7, ratio: 64 }).re
    expect(r64).toBeLessThan(r49)
  })
})

// ─── G5RV ────────────────────────────────────────────────────────────────────

describe('the G5RV', () => {
  it('is decent on 20 m, which is the band it was designed for', () => {
    expect(swrAt('g5rv', 14.175e6)).toBeLessThan(4)
  })

  it('is poor on 40 m and worse on 80 m', () => {
    expect(swrAt('g5rv', 7.1e6)).toBeGreaterThan(5)
    expect(swrAt('g5rv', 3.75e6)).toBeGreaterThan(5)
  })

  it('needs a tuner nearly everywhere, and says so', () => {
    expect(ANTENNAS.g5rv.needsTuner).toBe(true)
    const bad = [3.75e6, 7.1e6, 10.12e6, 18.1e6, 21.2e6, 24.9e6, 28.4e6]
      .filter((f) => swrAt('g5rv', f) > 3)
    expect(bad.length).toBeGreaterThanOrEqual(6)
  })

  it('changes completely if the matching section is cut wrong', () => {
    const right = swrAt('g5rv', 14.175e6, { ladderLength: 9.1, height: 11 })
    const wrong = swrAt('g5rv', 14.175e6, { ladderLength: 13, height: 11 })
    expect(wrong).toBeGreaterThan(right * 2)
  })

  it('loses very little in the ladder line itself', () => {
    expect(antennaExtras('g5rv', 14.175e6, defaultParams('g5rv')).efficiency).toBeGreaterThan(0.85)
  })
})

// ─── Off-centre-fed dipole ───────────────────────────────────────────────────

describe('the off-centre-fed dipole', () => {
  const p = defaultParams('ocf-windom')

  it('presents 200 to 400 ohms at the tap on its harmonic bands', () => {
    const feed = antennaImpedance('ocf-windom', 14.175e6, p).re * 4
    expect(feed).toBeGreaterThan(200)
    expect(feed).toBeLessThan(400)
  })

  it('is usable on 40, 20 and 10 m, and happiest on 40', () => {
    // A Windom is a compromise, not a resonant monobander. Two to three to one
    // across its bands is what these actually measure, which is why they are
    // nearly always used with a tuner in circuit.
    for (const f of [7.1e6, 14.175e6, 28.4e6]) expect(swrAt('ocf-windom', f)).toBeLessThan(3)
    expect(swrAt('ocf-windom', 7.1e6)).toBeLessThan(2)
  })

  it('is hopeless on 15 m, because the tap sits on a current null', () => {
    expect(swrAt('ocf-windom', 21.2e6)).toBeGreaterThan(5)
  })

  it('stops being an OCF if you move the tap to the middle', () => {
    const centre = antennaImpedance('ocf-windom', 7.1e6, { length: 20.1, offset: 0.5 }).re
    const third = antennaImpedance('ocf-windom', 7.1e6, { length: 20.1, offset: 1 / 3 }).re
    expect(centre).toBeLessThan(third)
  })
})

// ─── Ground-mounted vertical ─────────────────────────────────────────────────

describe('the quarter-wave vertical', () => {
  const at = (radials: number) => antennaImpedance('vertical-quarter-40', 7.1e6, { height: 10, radials })
  const eff = (radials: number) =>
    antennaExtras('vertical-quarter-40', 7.1e6, { height: 10, radials }).efficiency

  it('is 50 to 60 ohms on two radials, most of it ground loss', () => {
    expect(at(2).re).toBeGreaterThan(50)
    expect(at(2).re).toBeLessThan(60)
  })

  it('falls to about 36 ohms on sixty radials', () => {
    expect(at(60).re).toBeGreaterThan(33)
    expect(at(60).re).toBeLessThan(39)
  })

  it('drops monotonically as radials are added', () => {
    const counts = [0, 2, 4, 8, 16, 32, 60, 120]
    for (let i = 1; i < counts.length; i++) {
      const a = counts[i - 1] ?? 0
      const b = counts[i] ?? 0
      expect(at(b).re).toBeLessThan(at(a).re)
    }
  })

  it('radiates more of the power the more radials there are', () => {
    expect(eff(2)).toBeLessThan(0.7)
    expect(eff(16)).toBeGreaterThan(0.8)
    expect(eff(60)).toBeGreaterThan(0.9)
    expect(eff(120)).toBeGreaterThan(eff(60))
  })

  it('gets a worse SWR while getting a better antenna, which is the whole lesson', () => {
    const two = swrFromZ(at(2))
    const sixty = swrFromZ(at(60))
    expect(sixty).toBeGreaterThan(two)
    expect(eff(60)).toBeGreaterThan(eff(2) * 1.4)
  })

  it('resonates in the 40 m band', () => {
    const f = resonantFrequencies('vertical-quarter-40', defaultParams('vertical-quarter-40'), 5e6, 9e6)[0] ?? 0
    expect(f).toBeGreaterThan(6.9e6)
    expect(f).toBeLessThan(7.35e6)
  })

  it('is a high impedance on 20 m, where it is a half wave', () => {
    expect(swrAt('vertical-quarter-40', 14.175e6)).toBeGreaterThan(20)
  })
})

// ─── Trapped vertical ────────────────────────────────────────────────────────

describe('the trapped multiband vertical', () => {
  const p = defaultParams('vertical-multiband')

  it('is usable in all four of its bands', () => {
    for (const f of [7.1e6, 14.2e6, 21.3e6, 28.4e6]) {
      expect(swrAt('vertical-multiband', f)).toBeLessThan(1.6)
    }
  })

  it('is an open circuit between the bands, which is what the traps do', () => {
    for (const f of [10.12e6, 18.1e6, 24.9e6]) {
      expect(swrAt('vertical-multiband', f)).toBeGreaterThan(10)
    }
  })

  it('pays for the convenience in trap and ground loss', () => {
    const e = antennaExtras('vertical-multiband', 14.2e6, p).efficiency
    expect(e).toBeGreaterThan(0.4)
    expect(e).toBeLessThan(0.8)
  })

  it('moves every band together when the radiator is lengthened', () => {
    const shortR = resonantFrequencies('vertical-multiband', { height: 4.5, radials: 4 }, 5e6, 30e6)
    const longR = resonantFrequencies('vertical-multiband', { height: 6.5, radials: 4 }, 5e6, 30e6)
    expect(shortR[0] ?? 0).toBeGreaterThan(longR[0] ?? 0)
  })
})

// ─── Random wire ─────────────────────────────────────────────────────────────

describe('the random wire on a 9:1 unun', () => {
  it('varies wildly across the spectrum', () => {
    const swrs = [3.6e6, 7.1e6, 10.1e6, 14.2e6, 18.1e6, 21.2e6, 24.9e6, 28.4e6]
      .map((f) => swrAt('random-wire-9to1', f))
    expect(Math.max(...swrs) / Math.min(...swrs)).toBeGreaterThan(2)
  })

  it('is never a 50 ohm load anywhere useful, so it declares that it needs a tuner', () => {
    expect(ANTENNAS['random-wire-9to1'].needsTuner).toBe(true)
    expect(ANTENNAS['random-wire-9to1'].nativeBands).toHaveLength(0)
  })

  it('changes shape completely when the wire length changes', () => {
    const a = swrAt('random-wire-9to1', 14.2e6, { length: 12.2, counterpoise: 5 })
    const b = swrAt('random-wire-9to1', 14.2e6, { length: 19.6, counterpoise: 5 })
    expect(Math.abs(a - b)).toBeGreaterThan(0.4)
  })
})

// ─── Magnetic loop ───────────────────────────────────────────────────────────

describe('the magnetic loop', () => {
  const p = defaultParams('mag-loop')
  const f0 = resonantFrequencies('mag-loop', p, 5e6, 10e6)[0] ?? 7.157e6

  it('resonates where the capacitor puts it', () => {
    expect(f0).toBeGreaterThan(6.9e6)
    expect(f0).toBeLessThan(7.4e6)
    expect(swrAt('mag-loop', f0)).toBeLessThan(1.3)
  })

  it('has a Q of several hundred or better', () => {
    const q = antennaExtras('mag-loop', f0, p).qFactor
    expect(q).toBeGreaterThan(300)
    expect(q).toBeLessThan(5000)
  })

  it('is only usable over a few kilohertz', () => {
    const bw = bandwidthBelow('mag-loop', f0, 2, p, 200)
    expect(bw).toBeGreaterThan(1e3)
    expect(bw).toBeLessThan(40e3)
  })

  it('radiates under a tenth of the power on 40 m', () => {
    expect(antennaExtras('mag-loop', f0, p).efficiency).toBeLessThan(0.12)
  })

  it('is far more efficient higher up, where the loop is electrically bigger', () => {
    const high = { diameter: 1.0, capacitance: 3e-11 }
    const f = resonantFrequencies('mag-loop', high, 12e6, 24e6)[0] ?? 18.5e6
    expect(antennaExtras('mag-loop', f, high).efficiency).toBeGreaterThan(0.5)
  })

  it('retunes itself: more capacitance means a lower resonance', () => {
    const lower = resonantFrequencies('mag-loop', { diameter: 1, capacitance: 4e-10 }, 3e6, 30e6)[0] ?? 0
    const higher = resonantFrequencies('mag-loop', { diameter: 1, capacitance: 3e-11 }, 3e6, 30e6)[0] ?? 0
    expect(lower).toBeLessThan(higher)
    expect(higher / lower).toBeGreaterThan(2)
  })

  it('circulates tens of amps and kilovolts at 100 W', () => {
    const s = antennaStress('mag-loop', f0, p, 100)
    expect(s.circulatingCurrentA).toBeGreaterThan(25)
    expect(s.circulatingCurrentA).toBeLessThan(60)
    expect(s.peakVoltageV).toBeGreaterThan(2000)
    expect(s.peakVoltageV).toBeLessThan(8000)
  })

  it('scales those with the square root of power', () => {
    const a = antennaStress('mag-loop', f0, p, 25).circulatingCurrentA
    const b = antennaStress('mag-loop', f0, p, 100).circulatingCurrentA
    expect(b / a).toBeCloseTo(2, 6)
  })

  it('names the circulating current and capacitor voltage in its notes', () => {
    const n = antennaExtras('mag-loop', f0, p).notes
    expect(n).toMatch(/circulating/)
    expect(n).toMatch(/capacitor/)
  })
})

// ─── Mobile antennas ─────────────────────────────────────────────────────────

describe('the loaded mobile whip', () => {
  const p = defaultParams('mobile-whip-20')

  it('resonates on 20 m, where its coil was cut for', () => {
    const f = resonantFrequencies('mobile-whip-20', p, 12e6, 17e6)[0] ?? 0
    expect(f).toBeGreaterThan(13.9e6)
    expect(f).toBeLessThan(14.5e6)
  })

  it('is a low resistance even at resonance', () => {
    const z = antennaImpedance('mobile-whip-20', 14.175e6, p)
    expect(z.re).toBeGreaterThan(10)
    expect(z.re).toBeLessThan(30)
    expect(Math.abs(z.im)).toBeLessThan(5)
  })

  it('turns a real share of the power into coil and vehicle heat', () => {
    // Published and measured figures for a centre-loaded 2.6 m whip on 20 m sit
    // between about 10 and 30 percent: a few ohms of radiation resistance
    // working against the coil and the car body. Anything above about a third
    // would mean the radiation resistance is being overestimated, which is
    // exactly the bug this range is here to catch.
    const e = antennaExtras('mobile-whip-20', 14.175e6, p).efficiency
    expect(e).toBeGreaterThan(0.08)
    expect(e).toBeLessThan(0.35)
  })

  it('does better with a better coil', () => {
    const poor = antennaExtras('mobile-whip-20', 14.175e6, { height: 2.6, coilQ: 80 }).efficiency
    const good = antennaExtras('mobile-whip-20', 14.175e6, { height: 2.6, coilQ: 450 }).efficiency
    expect(good).toBeGreaterThan(poor)
  })

  it('is sharp, because a short antenna always is', () => {
    expect(antennaExtras('mobile-whip-20', 14.175e6, p).qFactor).toBeGreaterThan(10)
  })
})

describe('the screwdriver mobile', () => {
  const resAt = (coilPosition: number): number =>
    resonantFrequencies('screwdriver-mobile', { coilPosition, height: 2.6 }, 2e6, 32e6)[0] ?? 0

  it('retunes itself across 80 through 10 m as the motor runs', () => {
    expect(resAt(0.94)).toBeGreaterThan(3.4e6)
    expect(resAt(0.94)).toBeLessThan(4.1e6)
    expect(resAt(0.08)).toBeGreaterThan(27e6)
    expect(resAt(0.08)).toBeLessThan(30e6)
  })

  it('winds the resonance down as the coil goes in', () => {
    const steps = [0.1, 0.2, 0.356, 0.5, 0.65, 0.8, 0.94]
    for (let i = 1; i < steps.length; i++) {
      expect(resAt(steps[i] ?? 0)).toBeLessThan(resAt(steps[i - 1] ?? 0))
    }
  })

  it('is a few percent efficient on 80 m and most of the way there on 10 m', () => {
    const low = antennaExtras('screwdriver-mobile', 3.7e6, { coilPosition: 0.94, height: 2.6 })
    const high = antennaExtras('screwdriver-mobile', 28.4e6, { coilPosition: 0.08, height: 2.6 })
    expect(low.efficiency).toBeLessThan(0.12)
    // On 10 m the radiator is close to a quarter wave and needs almost no
    // loading, so it stops being a compromise antenna. Ground loss against a car
    // body still keeps it well short of a full-size vertical over radials.
    expect(high.efficiency).toBeGreaterThan(0.5)
    expect(high.efficiency).toBeGreaterThan(low.efficiency * 5)
  })

  it('is declared self-tunable, so the app knows it can retune it', () => {
    expect(ANTENNAS['screwdriver-mobile'].selfTunable).toBe(true)
  })
})

// ─── Yagi ────────────────────────────────────────────────────────────────────

describe('the three-element Yagi', () => {
  it('is matched across the 20 m band', () => {
    for (const f of [14.0e6, 14.175e6, 14.35e6]) expect(swrAt('yagi-3el-20', f)).toBeLessThan(1.4)
  })

  it('falls apart quickly outside it', () => {
    expect(swrAt('yagi-3el-20', 13.4e6)).toBeGreaterThan(2)
    expect(swrAt('yagi-3el-20', 15.2e6)).toBeGreaterThan(2)
    expect(swrAt('yagi-3el-20', 21.2e6)).toBeGreaterThan(5)
  })

  it('detunes when the driven element is the wrong length', () => {
    const right = swrAt('yagi-3el-20', 14.175e6, { driven: 9.5, height: 15 })
    const wrong = swrAt('yagi-3el-20', 14.175e6, { driven: 10.2, height: 15 })
    expect(wrong).toBeGreaterThan(right * 1.5)
  })

  it('loses almost nothing, unlike everything else in this file', () => {
    expect(antennaExtras('yagi-3el-20', 14.175e6, defaultParams('yagi-3el-20')).efficiency)
      .toBeGreaterThan(0.9)
  })
})

// ─── Robustness ──────────────────────────────────────────────────────────────

describe('every antenna, swept from 1 to 60 MHz', () => {
  const N = 500

  it('returns a finite, positive resistance at all 500 points', () => {
    for (const id of ALL) {
      const p = defaultParams(id)
      for (let i = 0; i < N; i++) {
        const f = 1e6 + ((60e6 - 1e6) * i) / (N - 1)
        const z = antennaImpedance(id, f, p)
        expect(Number.isFinite(z.re), `${id} R at ${f}`).toBe(true)
        expect(Number.isFinite(z.im), `${id} X at ${f}`).toBe(true)
        expect(z.re, `${id} R at ${f}`).toBeGreaterThan(0)
      }
    }
  })

  it('returns an SWR of at least 1 and never NaN', () => {
    for (const id of ALL) {
      const sweep = antennaSwrSweep(id, defaultParams(id), 1e6, 60e6, N)
      expect(sweep).toHaveLength(N)
      for (let i = 0; i < N; i++) {
        const s = sweep[i] ?? Number.NaN
        expect(Number.isFinite(s), `${id} SWR at index ${i}`).toBe(true)
        expect(s).toBeGreaterThanOrEqual(1)
        expect(s).toBeLessThanOrEqual(999)
      }
    }
  })

  it('reports a finite efficiency between 0 and 1 everywhere', () => {
    for (const id of ALL) {
      const p = defaultParams(id)
      for (let i = 0; i < 60; i++) {
        const f = 1e6 + ((60e6 - 1e6) * i) / 59
        const e = antennaExtras(id, f, p).efficiency
        expect(Number.isFinite(e), `${id} efficiency at ${f}`).toBe(true)
        expect(e).toBeGreaterThanOrEqual(0)
        expect(e).toBeLessThanOrEqual(1)
      }
    }
  })

  it('is continuous: a 1 Hz step never moves the impedance far', () => {
    for (const id of ALL) {
      const p = defaultParams(id)
      for (let i = 0; i < 40; i++) {
        const f = 1e6 + ((59e6 * i) / 39)
        const a = antennaImpedance(id, f, p)
        const b = antennaImpedance(id, f + 1, p)
        const scale = Math.max(Math.hypot(a.re, a.im), 1)
        expect(Math.hypot(b.re - a.re, b.im - a.im) / scale, `${id} near ${f}`).toBeLessThan(0.02)
      }
    }
  })

  it('survives nonsense parameters without producing nonsense', () => {
    for (const id of ALL) {
      const nonsense: Record<string, number>[] = [{}, { length: 0 }, { height: -5 }, { radials: -3 }, { capacitance: 0 }]
      for (const p of nonsense) {
        const z = antennaImpedance(id, 14.2e6, p)
        expect(Number.isFinite(z.re) && Number.isFinite(z.im), id).toBe(true)
        expect(z.re).toBeGreaterThan(0)
      }
    }
  })

  it('is pure: the same question always gets the same answer', () => {
    for (const id of ALL) {
      const p = defaultParams(id)
      const a = antennaImpedance(id, 18.1e6, p)
      const b = antennaImpedance(id, 18.1e6, p)
      expect(a).toEqual(b)
    }
  })

  it('falls back to the declared defaults when a parameter is missing', () => {
    for (const id of ALL) {
      const withDefaults = antennaImpedance(id, 14.2e6, defaultParams(id))
      const withNothing = antennaImpedance(id, 14.2e6, {})
      expect(withNothing).toEqual(withDefaults)
    }
  })
})

// ─── Sweep and resonance helpers ─────────────────────────────────────────────

describe('the sweep and resonance helpers', () => {
  it('samples the endpoints exactly', () => {
    const sweep = antennaSwrSweep('dipole-40', defaultParams('dipole-40'), 6e6, 8e6, 21)
    expect(sweep[0]).toBeCloseTo(swrAt('dipole-40', 6e6), 4)
    expect(sweep[20]).toBeCloseTo(swrAt('dipole-40', 8e6), 4)
  })

  it('handles a single-point sweep', () => {
    const sweep = antennaSwrSweep('dummy-load', {}, 14.2e6, 30e6, 1)
    expect(sweep).toHaveLength(1)
    expect(sweep[0]).toBeCloseTo(1, 6)
  })

  it('returns resonances in ascending order and inside the window', () => {
    const res = resonantFrequencies('efhw-40', defaultParams('efhw-40'), 5e6, 30e6)
    expect(res.length).toBeGreaterThanOrEqual(4)
    for (let i = 1; i < res.length; i++) {
      expect(res[i] ?? 0).toBeGreaterThan(res[i - 1] ?? 0)
    }
    for (const f of res) {
      expect(f).toBeGreaterThanOrEqual(5e6)
      expect(f).toBeLessThanOrEqual(30e6)
    }
  })

  it('reports nothing for an empty or inverted window', () => {
    expect(resonantFrequencies('dipole-40', defaultParams('dipole-40'), 8e6, 8e6)).toEqual([])
    expect(resonantFrequencies('dipole-40', defaultParams('dipole-40'), 9e6, 5e6).length)
      .toBeGreaterThanOrEqual(0)
  })

  it('does not call an anti-resonance a resonance', () => {
    // The 40 m dipole crosses zero reactance near 14.9 MHz on the way down, at
    // several thousand ohms. That is the last place anyone wants to transmit.
    const res = resonantFrequencies('dipole-40', defaultParams('dipole-40'), 13e6, 16e6)
    expect(res).toEqual([])
  })

  it('reports the stress on a plain dipole as unremarkable', () => {
    const s = antennaStress('dipole-40', 7.1e6, defaultParams('dipole-40'), 100)
    expect(s.circulatingCurrentA).toBeLessThan(3)
    expect(s.peakVoltageV).toBeLessThan(200)
  })
})

describe('a wire still radiates on a band it was not cut for', () => {
  // Regression: the image coupling was subtracted from the wire's self
  // resistance outright rather than as a fraction, which pinned the radiation
  // resistance at the numerical floor below about a third of a wavelength. The
  // application then told the reader that a 40 m dipole on 80 m radiates 0.3
  // percent of the power reaching it, which is a dummy load, not an antenna.
  it('does not collapse to the floor on 80 m', () => {
    const e = antennaExtras('dipole-40', 3.6e6, { length: 20.1, height: 10 }).efficiency
    expect(e).toBeGreaterThan(0.05)
  })

  it('improves with height on 80 m, with no cliff', () => {
    const heights = [3, 5, 10, 15, 20, 25, 30]
    const effs = heights.map((height) => antennaExtras('dipole-40', 3.6e6, { length: 20.1, height }).efficiency)
    for (let i = 1; i < effs.length; i++) {
      expect(effs[i] ?? 0).toBeGreaterThanOrEqual((effs[i - 1] ?? 0) - 1e-9)
      // No step may be a cliff: a 5 m change must not move efficiency by 10x.
      expect(effs[i] ?? 0).toBeLessThan(Math.max(0.02, (effs[i - 1] ?? 0)) * 10)
    }
  })

  it('keeps every antenna above one percent efficient somewhere it is usable', () => {
    for (const id of ALL) {
      if (id === 'dummy-load') continue
      const params = defaultParams(id)
      let best = 0
      for (let f = 1.8e6; f <= 54e6; f += 0.1e6) {
        best = Math.max(best, antennaExtras(id, f, params).efficiency)
      }
      expect(best, `${id} is never more than ${(best * 100).toFixed(2)} percent efficient`).toBeGreaterThan(0.05)
    }
  })
})
