import { describe, expect, it } from 'vitest'
import type { Complex } from '../src/rf/types'
import { TUNERS, solveLNetwork, solveTuner, tunerLossDb } from '../src/rf/tuner'

const F = 14.2e6
const TAU = Math.PI * 2

// Local complex arithmetic so these tests check the tuner and nothing else.
const add = (a: Complex, b: Complex): Complex => ({ re: a.re + b.re, im: a.im + b.im })
const div = (a: Complex, b: Complex): Complex => {
  const d = b.re * b.re + b.im * b.im
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d }
}
const inv = (a: Complex): Complex => div({ re: 1, im: 0 }, a)
const swrOf = (z: Complex): number => {
  const g = div({ re: z.re - 50, im: z.im }, { re: z.re + 50, im: z.im })
  const m = Math.hypot(g.re, g.im)
  return (1 + m) / (1 - m)
}

/** Input impedance of the solved L network, looking in from the 50 ohm port. */
const lNetworkZin = (
  sol: { topology: string; seriesL: number; shuntC: number },
  zL: Complex,
  freqHz: number,
): Complex => {
  const w = TAU * freqHz
  if (sol.topology === 'lowpass-l-shunt-in') {
    // load -> series L -> node -> shunt C -> 50 ohm port
    const z1 = add(zL, { re: 0, im: w * sol.seriesL })
    return inv(add(inv(z1), { re: 0, im: w * sol.shuntC }))
  }
  // load -> shunt C -> series L -> 50 ohm port
  const y = add(inv(zL), { re: 0, im: w * sol.shuntC })
  return add(inv(y), { re: 0, im: w * sol.seriesL })
}

describe('published tuner specifications', () => {
  it('carries the Icom IC-7300 internal tuner range', () => {
    // Confirmed from the IC-7300 specification: 16.7 to 150 ohms, SWR below 3:1.
    expect(TUNERS.internal.rMinOhm).toBe(16.7)
    expect(TUNERS.internal.rMaxOhm).toBe(150)
    expect(TUNERS.internal.maxSwr).toBe(3)
  })

  it('gives the external tuners a much wider range than the internal one', () => {
    expect(TUNERS['external-radio'].rMinOhm).toBeLessThan(TUNERS.internal.rMinOhm)
    expect(TUNERS['external-radio'].rMaxOhm).toBeGreaterThan(TUNERS.internal.rMaxOhm)
    expect(TUNERS['external-radio'].maxSwr).toBeGreaterThan(TUNERS.internal.maxSwr)
  })

  it('gives the remote tuner the same electrical spec as the one at the radio', () => {
    // The only difference between them is where they are bolted, which is a
    // matter for chain.ts, not for the network.
    expect(TUNERS['external-antenna'].rMinOhm).toBe(TUNERS['external-radio'].rMinOhm)
    expect(TUNERS['external-antenna'].rMaxOhm).toBe(TUNERS['external-radio'].rMaxOhm)
    expect(TUNERS['external-antenna'].maxSwr).toBe(TUNERS['external-radio'].maxSwr)
  })
})

describe('solveLNetwork', () => {
  it('uses series L then shunt C when the load resistance is below 50 ohms', () => {
    const sol = solveLNetwork({ re: 25, im: 0 }, F)
    expect(sol).not.toBeNull()
    if (sol === null) return
    expect(sol.topology).toBe('lowpass-l-shunt-in')
    // Q = sqrt(Rhigh/Rlow - 1) = sqrt(50/25 - 1) = 1
    expect(sol.q).toBeCloseTo(1, 10)
    expect(sol.seriesL).toBeGreaterThan(0)
    expect(sol.shuntC).toBeGreaterThan(0)
  })

  it('uses shunt C at the load then series L when the load resistance is above 50 ohms', () => {
    const sol = solveLNetwork({ re: 100, im: 0 }, F)
    expect(sol).not.toBeNull()
    if (sol === null) return
    expect(sol.topology).toBe('lowpass-l-shunt-out')
    // Q = sqrt(100/50 - 1) = 1, the mirror of the case above
    expect(sol.q).toBeCloseTo(1, 10)
  })

  it('actually presents 50 + j0 for every load it claims to solve', () => {
    const loads: Complex[] = [
      { re: 25, im: 0 },
      { re: 100, im: 0 },
      { re: 16.7, im: 0 },
      { re: 150, im: 0 },
      { re: 20, im: -40 },
      { re: 20, im: 40 },
      { re: 50, im: -30 },
      { re: 12, im: -250 },
      { re: 1500, im: 600 },
    ]
    for (const zL of loads) {
      const sol = solveLNetwork(zL, F)
      expect(sol).not.toBeNull()
      if (sol === null) continue
      const zin = lNetworkZin(sol, zL, F)
      expect(zin.re).toBeCloseTo(50, 6)
      expect(zin.im).toBeCloseTo(0, 6)
    }
  })

  it('reports the same Q at the two ends of the 3:1 window', () => {
    // 16.7 and 150 ohms are 50/3 and 50*3, so both are 3:1 and both need the
    // same loaded Q. That symmetry is why the published range reads as it does.
    const low = solveLNetwork({ re: 50 / 3, im: 0 }, F)
    const high = solveLNetwork({ re: 150, im: 0 }, F)
    expect(low).not.toBeNull()
    expect(high).not.toBeNull()
    if (low === null || high === null) return
    expect(low.q).toBeCloseTo(high.q, 8)
    expect(low.q).toBeCloseTo(Math.sqrt(2), 8)
  })

  it('raises Q when the load is reactive, because the inductor has more to do', () => {
    const resistive = solveLNetwork({ re: 20, im: 0 }, F)
    const reactive = solveLNetwork({ re: 20, im: -80 }, F)
    expect(resistive).not.toBeNull()
    expect(reactive).not.toBeNull()
    if (resistive === null || reactive === null) return
    expect(reactive.q).toBeGreaterThan(resistive.q)
    expect(reactive.seriesL).toBeGreaterThan(resistive.seriesL)
  })

  it('needs no components at all for a 50 ohm load', () => {
    const sol = solveLNetwork({ re: 50, im: 0 }, F)
    expect(sol).not.toBeNull()
    if (sol === null) return
    expect(sol.q).toBeCloseTo(0, 12)
    expect(sol.seriesL).toBeCloseTo(0, 15)
    expect(sol.shuntC).toBeCloseTo(0, 15)
  })

  it('returns null for loads and frequencies that are not physical', () => {
    expect(solveLNetwork({ re: 0, im: 10 }, F)).toBeNull()
    expect(solveLNetwork({ re: -10, im: 0 }, F)).toBeNull()
    expect(solveLNetwork({ re: 50, im: Number.NaN }, F)).toBeNull()
    expect(solveLNetwork({ re: 50, im: 0 }, 0)).toBeNull()
    expect(solveLNetwork({ re: 50, im: 0 }, F, 0)).toBeNull()
  })
})

describe('tunerLossDb', () => {
  it('is the base loss at zero Q and rises with Q', () => {
    const def = TUNERS.internal
    expect(tunerLossDb(def, 0)).toBe(def.baseLossDb)
    let previous = tunerLossDb(def, 0)
    for (const q of [1, 2, 5, 10, 30, 80]) {
      const loss = tunerLossDb(def, q)
      expect(loss).toBeGreaterThan(previous)
      previous = loss
    }
  })

  it('makes a wide-range match of a reactive load genuinely lossy', () => {
    const def = TUNERS['external-radio']
    const easy = tunerLossDb(def, 2)
    const nasty = tunerLossDb(def, 30)
    expect(nasty - easy).toBeGreaterThan(0.5)
  })
})

describe('the internal tuner honours its published limits', () => {
  it('matches a load inside the range', () => {
    const sol = solveTuner({ mode: 'internal', zL: { re: 25, im: 0 }, freqHz: F, engaged: true })
    expect(sol.matched).toBe(true)
    expect(sol.engaged).toBe(true)
    expect(sol.failureReason).toBe('')
    expect(sol.presentedZ.re).toBeCloseTo(50, 9)
    expect(sol.presentedZ.im).toBeCloseTo(0, 9)
    expect(sol.lossDb).toBeGreaterThan(0)
  })

  it('refuses a resistance above 150 ohms and says so in words a person can act on', () => {
    const zL: Complex = { re: 400, im: 0 }
    const sol = solveTuner({ mode: 'internal', zL, freqHz: F, engaged: true })
    expect(sol.matched).toBe(false)
    expect(sol.topology).toBe('none')
    expect(sol.failureReason.length).toBeGreaterThan(0)
    expect(sol.failureReason).toContain('150')
    // The radio is left looking at the unmatched load, which is the honest answer.
    expect(sol.presentedZ.re).toBe(zL.re)
    expect(sol.presentedZ.im).toBe(zL.im)
  })

  it('refuses a resistance below 16.7 ohms', () => {
    const sol = solveTuner({ mode: 'internal', zL: { re: 8, im: 0 }, freqHz: F, engaged: true })
    expect(sol.matched).toBe(false)
    expect(sol.failureReason).toContain('16.7')
  })

  it('refuses a load whose resistance is in range but whose SWR is not', () => {
    // 50 - j120 is 50 ohms resistive, and about 7.6:1.
    const sol = solveTuner({ mode: 'internal', zL: { re: 50, im: -120 }, freqHz: F, engaged: true })
    expect(sol.matched).toBe(false)
    expect(sol.failureReason).toContain(':1')
  })

  it('refuses a frequency it does not cover', () => {
    const sol = solveTuner({ mode: 'internal', zL: { re: 25, im: 0 }, freqHz: 500e3, engaged: true })
    expect(sol.matched).toBe(false)
    expect(sol.failureReason).toContain('MHz')
  })
})

describe('bypass and disengaged', () => {
  it('passes the load through untouched when bypassed', () => {
    const zL: Complex = { re: 20, im: -40 }
    const sol = solveTuner({ mode: 'bypass', zL, freqHz: F, engaged: true })
    expect(sol.engaged).toBe(false)
    expect(sol.matched).toBe(false)
    expect(sol.lossDb).toBe(0)
    expect(sol.presentedZ.re).toBe(zL.re)
    expect(sol.presentedZ.im).toBe(zL.im)
    expect(sol.failureReason).toBe('')
  })

  it('passes the load through when a fitted tuner is not engaged', () => {
    const zL: Complex = { re: 20, im: -40 }
    const sol = solveTuner({ mode: 'internal', zL, freqHz: F, engaged: false })
    expect(sol.engaged).toBe(false)
    expect(sol.presentedZ.re).toBe(zL.re)
  })
})

describe('external T network', () => {
  it('matches loads the internal tuner refuses', () => {
    const zL: Complex = { re: 400, im: 0 }
    expect(solveTuner({ mode: 'internal', zL, freqHz: F, engaged: true }).matched).toBe(false)
    const t = solveTuner({ mode: 'external-radio', zL, freqHz: F, engaged: true })
    expect(t.matched).toBe(true)
    expect(t.topology).toBe('t-network')
    expect(t.seriesL).toBeGreaterThan(0)
    expect(t.shuntC).toBeGreaterThan(0)
    expect(t.shuntC2).toBeGreaterThan(0)
  })

  it('costs more than an L network on the same load, because a T runs a higher Q', () => {
    const zL: Complex = { re: 25, im: 0 }
    const l = solveTuner({ mode: 'internal', zL, freqHz: F, engaged: true })
    const t = solveTuner({ mode: 'external-radio', zL, freqHz: F, engaged: true })
    expect(l.matched).toBe(true)
    expect(t.matched).toBe(true)
    expect(t.q).toBeGreaterThan(l.q)
    expect(t.lossDb).toBeGreaterThan(l.lossDb)
  })

  it('still refuses a load past its own published range', () => {
    const sol = solveTuner({ mode: 'external-radio', zL: { re: 4000, im: 0 }, freqHz: F, engaged: true })
    expect(sol.matched).toBe(false)
    expect(sol.failureReason.length).toBeGreaterThan(0)
  })
})

describe('where the tuner sits is the whole point', () => {
  // A 40 m dipole worked on 20 m: a badly mismatched antenna at the far end of
  // a length of coax, which transforms it into something else at the radio.
  const antennaZ: Complex = { re: 20, im: -40 }
  const lineInputZ: Complex = { re: 120, im: 60 }

  it('a tuner at the radio matches the radio and leaves the feedline exactly as it was', () => {
    const swrAtAntennaBefore = swrOf(antennaZ)
    const swrOnLineBefore = swrOf(lineInputZ)

    const sol = solveTuner({ mode: 'external-radio', zL: lineInputZ, freqHz: F, engaged: true })

    // The radio now sees 50 ohms.
    expect(sol.matched).toBe(true)
    expect(sol.presentedZ.re).toBeCloseTo(50, 9)
    expect(sol.presentedZ.im).toBeCloseTo(0, 9)
    expect(swrOf(sol.presentedZ)).toBeCloseTo(1, 9)

    // Nothing on the antenna side of the tuner has moved. The solution says
    // nothing about the antenna, because the tuner cannot see past itself: the
    // coax still runs at 4.3:1 and still pays the excess loss that goes with it.
    expect(swrOf(antennaZ)).toBe(swrAtAntennaBefore)
    expect(swrAtAntennaBefore).toBeGreaterThan(4)
    expect(swrOf(lineInputZ)).toBe(swrOnLineBefore)
    expect(swrOnLineBefore).toBeGreaterThan(1.5)
  })

  it('a tuner at the antenna presents 50 ohms to the coax, so the coax runs flat', () => {
    const sol = solveTuner({ mode: 'external-antenna', zL: antennaZ, freqHz: F, engaged: true })
    expect(sol.matched).toBe(true)
    // This impedance is what the FEEDLINE sees at its far end, not what the
    // radio sees, and that is the whole difference between the two modes.
    expect(swrOf(sol.presentedZ)).toBeCloseTo(1, 9)
    expect(swrOf(antennaZ)).toBeGreaterThan(4)
  })

  it('solves the identical network in both places, so any difference is placement alone', () => {
    const atRadio = solveTuner({ mode: 'external-radio', zL: antennaZ, freqHz: F, engaged: true })
    const atAntenna = solveTuner({ mode: 'external-antenna', zL: antennaZ, freqHz: F, engaged: true })
    expect(atAntenna.seriesL).toBeCloseTo(atRadio.seriesL, 15)
    expect(atAntenna.q).toBeCloseTo(atRadio.q, 12)
    expect(atAntenna.lossDb).toBeCloseTo(atRadio.lossDb, 12)
  })
})
