import { describe, expect, it } from 'vitest'

import { C, cAbs } from '../src/rf/complex'
import {
  gammaFromSwr, matchFigures, mismatchLossDb, powerSplit, reflectionCoefficient,
  returnLossDb, swrFromGamma, swrFromZ,
} from '../src/rf/match'

/**
 * The table every handbook prints. Reflected power is |G|^2 and mismatch loss is
 * -10 log10(1 - |G|^2), both derived from |G| = (s-1)/(s+1). These are the
 * published figures, not values read back out of the code.
 */
const TEXTBOOK: readonly {
  swr: number
  reflectedPercent: number
  mismatchLossDb: number
  returnLossDb: number
}[] = [
  { swr: 1.0, reflectedPercent: 0.0, mismatchLossDb: 0.0, returnLossDb: 60 },
  { swr: 1.5, reflectedPercent: 4.0, mismatchLossDb: 0.177, returnLossDb: 13.979 },
  { swr: 2.0, reflectedPercent: 11.1, mismatchLossDb: 0.512, returnLossDb: 9.542 },
  { swr: 3.0, reflectedPercent: 25.0, mismatchLossDb: 1.249, returnLossDb: 6.021 },
  { swr: 5.0, reflectedPercent: 44.4, mismatchLossDb: 2.553, returnLossDb: 3.522 },
  { swr: 10.0, reflectedPercent: 66.9, mismatchLossDb: 4.807, returnLossDb: 1.743 },
]

describe('the textbook SWR table', () => {
  for (const row of TEXTBOOK) {
    it(`SWR ${row.swr.toFixed(1)} reflects ${row.reflectedPercent}% of the forward power`, () => {
      const g = gammaFromSwr(row.swr)
      expect(100 * g * g).toBeCloseTo(row.reflectedPercent, 1)
      expect(mismatchLossDb(g)).toBeCloseTo(row.mismatchLossDb, 3)
      expect(returnLossDb(g)).toBeCloseTo(row.returnLossDb, 3)
      // And the whole loop closes: SWR -> Gamma -> SWR.
      expect(swrFromGamma(g)).toBeCloseTo(row.swr, 9)
    })
  }

  it('agrees with powerSplit on 100 W forward', () => {
    for (const row of TEXTBOOK) {
      const { reflectedW, netW } = powerSplit(100, gammaFromSwr(row.swr))
      expect(reflectedW).toBeCloseTo(row.reflectedPercent, 1)
      expect(reflectedW + netW).toBeCloseTo(100, 9)
    }
  })
})

describe('reflectionCoefficient', () => {
  it('is zero into a matched load', () => {
    expect(reflectionCoefficient(C(50, 0))).toEqual({ re: 0, im: 0 })
  })

  it('is -1 into a short and +1 into an open', () => {
    const short = reflectionCoefficient(C(0, 0))
    expect(short.re).toBeCloseTo(-1, 12)
    expect(short.im).toBeCloseTo(0, 12)
    expect(reflectionCoefficient(C(Infinity, 0))).toEqual({ re: 1, im: 0 })
  })

  it('is +1/3 into 100 ohms and -1/3 into 25 ohms', () => {
    expect(reflectionCoefficient(C(100, 0)).re).toBeCloseTo(1 / 3, 12)
    expect(reflectionCoefficient(C(25, 0)).re).toBeCloseTo(-1 / 3, 12)
  })

  it('carries the phase, which is what a reactive load changes', () => {
    // 50 + j50 -> G = 0.2 + j0.4. Same |G| as 50 - j50 but the opposite angle,
    // and that angle decides whether the PA sees a voltage or a current peak.
    const up = reflectionCoefficient(C(50, 50))
    const down = reflectionCoefficient(C(50, -50))
    expect(up.re).toBeCloseTo(0.2, 12)
    expect(up.im).toBeCloseTo(0.4, 12)
    expect(down.im).toBeCloseTo(-0.4, 12)
    expect(cAbs(up)).toBeCloseTo(cAbs(down), 12)
  })

  it('honours a non-default system impedance', () => {
    expect(reflectionCoefficient(C(75, 0), 75)).toEqual({ re: 0, im: 0 })
    expect(reflectionCoefficient(C(50, 0), 75).re).toBeCloseTo(-0.2, 12)
  })

  it('has unit magnitude for any purely reactive load', () => {
    // No resistance means nowhere for the power to go: all of it comes back.
    for (const x of [1, 12.5, 50, 377, 1e6]) {
      expect(cAbs(reflectionCoefficient(C(0, x)))).toBeCloseTo(1, 12)
      expect(cAbs(reflectionCoefficient(C(0, -x)))).toBeCloseTo(1, 12)
    }
  })
})

describe('swrFromGamma', () => {
  it('reads 1.0 at a perfect match', () => {
    expect(swrFromGamma(0)).toBe(1)
  })

  it('follows (1+g)/(1-g)', () => {
    expect(swrFromGamma(0.2)).toBeCloseTo(1.5, 12)
    expect(swrFromGamma(1 / 3)).toBeCloseTo(2, 12)
    expect(swrFromGamma(0.5)).toBeCloseTo(3, 12)
  })

  it('pegs at 999 rather than returning Infinity', () => {
    expect(swrFromGamma(1)).toBe(999)
    expect(swrFromGamma(0.9999)).toBe(999)
    expect(swrFromGamma(Infinity)).toBe(999)
  })

  it('treats a negative or unusable magnitude as matched, not as a fault', () => {
    expect(swrFromGamma(-0.5)).toBe(1)
    expect(swrFromGamma(NaN)).toBe(1)
  })

  it('is monotonic across the scale', () => {
    let prev = 0
    for (let g = 0; g < 0.998; g += 0.001) {
      const s = swrFromGamma(g)
      expect(s).toBeGreaterThanOrEqual(prev)
      prev = s
    }
  })
})

describe('returnLossDb and mismatchLossDb', () => {
  it('caps a perfect match at the 60 dB ceiling instead of showing infinity', () => {
    expect(returnLossDb(0)).toBe(60)
    expect(Number.isFinite(returnLossDb(1e-12))).toBe(true)
    expect(returnLossDb(1e-12)).toBe(60)
  })

  it('reports zero return loss for total reflection', () => {
    expect(returnLossDb(1)).toBe(0)
    expect(returnLossDb(1.4)).toBe(0)
  })

  it('caps mismatch loss at 60 dB when nothing gets in', () => {
    expect(mismatchLossDb(1)).toBe(60)
    expect(mismatchLossDb(0.99999999999)).toBe(60)
    expect(mismatchLossDb(0)).toBe(0)
  })

  it('holds the identity mismatch loss = -10 log10(1 - 10^(-RL/10))', () => {
    const g = 0.4
    expect(mismatchLossDb(g)).toBeCloseTo(
      -10 * Math.log10(1 - Math.pow(10, -returnLossDb(g) / 10)),
      9,
    )
  })
})

describe('gammaFromSwr', () => {
  it('inverts the SWR formula', () => {
    expect(gammaFromSwr(1)).toBe(0)
    expect(gammaFromSwr(2)).toBeCloseTo(1 / 3, 12)
    expect(gammaFromSwr(999)).toBeCloseTo(0.998, 12)
  })

  it('never leaves the unit circle, whatever it is handed', () => {
    for (const s of [-5, 0, 0.5, NaN, Infinity, 1e9]) {
      const g = gammaFromSwr(s)
      expect(Number.isNaN(g)).toBe(false)
      expect(g).toBeGreaterThanOrEqual(0)
      expect(g).toBeLessThanOrEqual(1)
    }
  })
})

describe('matchFigures', () => {
  it('describes a 100 ohm load on a 50 ohm line', () => {
    const f = matchFigures(C(100, 0))
    expect(f.swr).toBeCloseTo(2, 12)
    expect(f.gammaMag).toBeCloseTo(1 / 3, 12)
    expect(f.reflectedFraction).toBeCloseTo(0.1111, 4)
    expect(f.mismatchLossDb).toBeCloseTo(0.512, 3)
    expect(f.returnLossDb).toBeCloseTo(9.542, 3)
  })

  it('describes 50 + j50, the classic 2.6:1', () => {
    const f = matchFigures(C(50, 50))
    expect(f.gammaMag).toBeCloseTo(Math.sqrt(0.2), 12)
    expect(f.swr).toBeCloseTo(2.618034, 6)
  })

  it('pegs a short, an open and a pure reactance identically', () => {
    for (const zL of [C(0, 0), C(Infinity, 0), C(0, Infinity), C(0, 300), C(0, -1200)]) {
      const f = matchFigures(zL)
      expect(f.swr).toBe(999)
      expect(f.mismatchLossDb).toBe(60)
      // Not toBe(0): a reactive load's |G| lands within an ulp of 1, not on it.
      expect(f.returnLossDb).toBeCloseTo(0, 9)
      expect(f.reflectedFraction).toBeCloseTo(1, 9)
    }
  })

  it('never returns NaN, for any load the rest of the app can hand it', () => {
    const loads = [
      C(0, 0), C(50, 0), C(1e-12, 0), C(1e12, 0), C(Infinity, Infinity),
      C(-50, 0), C(-50, 1e-9), C(0, 0.0001), C(NaN, NaN), C(2500, -4000),
    ]
    for (const zL of loads) {
      const f = matchFigures(zL)
      for (const v of [f.gammaMag, f.swr, f.returnLossDb, f.mismatchLossDb, f.reflectedFraction]) {
        expect(Number.isFinite(v)).toBe(true)
      }
      expect(Number.isNaN(f.gamma.re)).toBe(false)
      expect(Number.isNaN(f.gamma.im)).toBe(false)
      expect(f.swr).toBeGreaterThanOrEqual(1)
      expect(f.swr).toBeLessThanOrEqual(999)
    }
  })

  it('agrees with swrFromZ', () => {
    for (const zL of [C(35, 12), C(200, -90), C(12.5, 0)]) {
      expect(swrFromZ(zL)).toBeCloseTo(matchFigures(zL).swr, 12)
    }
    expect(swrFromZ(C(75, 0), 75)).toBeCloseTo(1, 12)
  })
})

describe('powerSplit', () => {
  it('splits 100 W at SWR 3:1 into 25 W back and 75 W on', () => {
    const { reflectedW, netW } = powerSplit(100, 0.5)
    expect(reflectedW).toBeCloseTo(25, 9)
    expect(netW).toBeCloseTo(75, 9)
  })

  it('sends nothing back into a matched load', () => {
    expect(powerSplit(100, 0)).toEqual({ reflectedW: 0, netW: 100 })
  })

  it('never returns more reflected power than forward power', () => {
    const { reflectedW, netW } = powerSplit(100, 5)
    expect(reflectedW).toBe(100)
    expect(netW).toBe(0)
  })

  it('is safe with nonsense forward power', () => {
    for (const p of [-10, NaN, Infinity]) {
      const s = powerSplit(p, 0.5)
      expect(Number.isFinite(s.reflectedW)).toBe(true)
      expect(Number.isFinite(s.netW)).toBe(true)
    }
  })
})
