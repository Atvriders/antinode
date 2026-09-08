import { describe, expect, it } from 'vitest'

import {
  C, cAbs, cAdd, cArg, cDiv, cExp, cInv, cIsFinite, cMul, cNeg, cScale, cSqrt, cSub, cTanh,
} from '../src/rf/complex'

describe('construction and basic arithmetic', () => {
  it('defaults the imaginary part to zero', () => {
    expect(C(50)).toEqual({ re: 50, im: 0 })
    expect(C(50, -25)).toEqual({ re: 50, im: -25 })
  })

  it('adds, subtracts, negates and scales', () => {
    expect(cAdd(C(1, 2), C(3, -5))).toEqual({ re: 4, im: -3 })
    expect(cSub(C(1, 2), C(3, -5))).toEqual({ re: -2, im: 7 })
    expect(cNeg(C(1, -2))).toEqual({ re: -1, im: 2 })
    expect(cScale(C(3, -4), 0.5)).toEqual({ re: 1.5, im: -2 })
  })

  it('multiplies: (1+2j)(3+4j) = -5+10j', () => {
    const p = cMul(C(1, 2), C(3, 4))
    expect(p.re).toBeCloseTo(-5, 12)
    expect(p.im).toBeCloseTo(10, 12)
  })

  it('j squared is -1', () => {
    const j2 = cMul(C(0, 1), C(0, 1))
    expect(j2.re).toBeCloseTo(-1, 12)
    expect(j2.im).toBeCloseTo(0, 12)
  })
})

describe('magnitude and argument', () => {
  it('gives the 3-4-5 triangle exactly', () => {
    expect(cAbs(C(3, 4))).toBe(5)
    expect(cAbs(C(-3, -4))).toBe(5)
  })

  it('handles a pure real or pure imaginary value without a square root', () => {
    expect(cAbs(C(-7, 0))).toBe(7)
    expect(cAbs(C(0, 7))).toBe(7)
  })

  it('does not overflow or underflow on extreme magnitudes', () => {
    // The naive sqrt(re^2 + im^2) overflows above ~1.3e154 and flushes to zero
    // below ~1e-162; both are reachable from a long lossy line off resonance.
    expect(cAbs(C(3e200, 4e200))).toBeCloseTo(5e200, -190)
    expect(cAbs(C(3e-200, 4e-200)) / 1e-200).toBeCloseTo(5, 6)
    expect(cAbs(C(Infinity, 1))).toBe(Infinity)
  })

  it('reports the argument in radians', () => {
    expect(cArg(C(1, 0))).toBeCloseTo(0, 12)
    expect(cArg(C(0, 1))).toBeCloseTo(Math.PI / 2, 12)
    expect(cArg(C(-1, 0))).toBeCloseTo(Math.PI, 12)
  })
})

describe('division', () => {
  it('divides by j', () => {
    const q = cDiv(C(1, 0), C(0, 1))
    expect(q.re).toBeCloseTo(0, 12)
    expect(q.im).toBeCloseTo(-1, 12)
  })

  it('agrees with the conjugate form on a general case', () => {
    const a = C(3, -2)
    const b = C(-1, 4)
    const q = cDiv(a, b)
    const denom = b.re * b.re + b.im * b.im
    expect(q.re).toBeCloseTo((a.re * b.re + a.im * b.im) / denom, 12)
    expect(q.im).toBeCloseTo((a.im * b.re - a.re * b.im) / denom, 12)
  })

  it('survives a denominator that would overflow if squared', () => {
    const q = cDiv(C(1e200, 1e200), C(1e200, 1e200))
    expect(q.re).toBeCloseTo(1, 12)
    expect(q.im).toBeCloseTo(0, 12)
  })

  it('reports an exact pole as infinite, never as NaN', () => {
    const q = cDiv(C(1, 0), C(0, 0))
    expect(Number.isNaN(q.re)).toBe(false)
    expect(Number.isNaN(q.im)).toBe(false)
    expect(q.re).toBe(Infinity)
    expect(cIsFinite(q)).toBe(false)
    expect(cDiv(C(0, 0), C(0, 0))).toEqual({ re: 0, im: 0 })
  })

  it('inverts', () => {
    const inv = cInv(C(0, 2))
    expect(inv.re).toBeCloseTo(0, 12)
    expect(inv.im).toBeCloseTo(-0.5, 12)
    expect(cInv(C(0, 0)).re).toBe(Infinity)
  })
})

describe('cExp', () => {
  it('gives Euler: e^(j*pi) = -1', () => {
    const e = cExp(C(0, Math.PI))
    expect(e.re).toBeCloseTo(-1, 12)
    expect(e.im).toBeCloseTo(0, 12)
  })

  it('scales by e^re', () => {
    const e = cExp(C(2, 0))
    expect(e.re).toBeCloseTo(Math.E * Math.E, 10)
    expect(e.im).toBeCloseTo(0, 12)
  })

  it('does not produce NaN when the exponential overflows', () => {
    const e = cExp(C(10000, 1))
    expect(Number.isNaN(e.re)).toBe(false)
    expect(Number.isNaN(e.im)).toBe(false)
  })
})

describe('cTanh — the transmission-line kernel', () => {
  it('matches the real hyperbolic tangent on the real axis', () => {
    expect(cTanh(C(0, 0))).toEqual({ re: 0, im: 0 })
    expect(cTanh(C(1, 0)).re).toBeCloseTo(Math.tanh(1), 12)
    expect(cTanh(C(1, 0)).im).toBeCloseTo(0, 12)
    expect(cTanh(C(-0.35, 0)).re).toBeCloseTo(Math.tanh(-0.35), 12)
  })

  it('is j*tan(b) on the imaginary axis, the lossless line', () => {
    // A lossless eighth-wave line: beta*l = pi/4, tanh(j pi/4) = j.
    const t = cTanh(C(0, Math.PI / 4))
    expect(t.re).toBe(0)
    expect(t.im).toBeCloseTo(1, 12)
  })

  it('stays finite at the quarter-wave pole instead of dividing 0 by 0', () => {
    const t = cTanh(C(0, Math.PI / 2))
    expect(Number.isNaN(t.im)).toBe(false)
    expect(Math.abs(t.im)).toBeGreaterThan(1e15)
  })

  it('agrees with the exponential definition where that definition is usable', () => {
    // tanh(z) = (e^2z - 1)/(e^2z + 1), safe to evaluate only for small Re(z).
    const z = C(0.8, 1.3)
    const e2z = cExp(cScale(z, 2))
    const ref = cDiv(cSub(e2z, C(1, 0)), cAdd(e2z, C(1, 0)))
    const t = cTanh(z)
    expect(t.re).toBeCloseTo(ref.re, 10)
    expect(t.im).toBeCloseTo(ref.im, 10)
  })

  it('is numerically stable for a very lossy line', () => {
    // 12 nepers one way is ~104 dB of matched loss: absurd, but the sampler will
    // evaluate it while the user drags the length slider, and it must not go NaN.
    const t = cTanh(C(12, 0.3))
    expect(cIsFinite(t)).toBe(true)
    expect(t.re).toBeCloseTo(1, 9)
    expect(Math.abs(t.im)).toBeLessThan(1e-9)
  })

  it('saturates instead of overflowing cosh', () => {
    // cosh(2 * 400) is Infinity in double precision; the naive identity would
    // return Infinity/Infinity = NaN here.
    expect(cTanh(C(400, 1))).toEqual({ re: 1, im: 0 })
    expect(cTanh(C(-400, 1))).toEqual({ re: -1, im: 0 })
    expect(cTanh(C(25, -2))).toEqual({ re: 1, im: 0 })
  })
})

describe('cSqrt', () => {
  it('takes the principal root of a negative real', () => {
    const r = cSqrt(C(-1, 0))
    expect(r.re).toBeCloseTo(0, 12)
    expect(r.im).toBeCloseTo(1, 12)
  })

  it('reproduces the exact roots 4 -> 2 and 3+4j -> 2+j', () => {
    expect(cSqrt(C(4, 0))).toEqual({ re: 2, im: 0 })
    const r = cSqrt(C(3, 4))
    expect(r.re).toBeCloseTo(2, 12)
    expect(r.im).toBeCloseTo(1, 12)
  })

  it('squares back to the original', () => {
    for (const z of [C(-9, 2), C(0.001, -4000), C(0, 2), C(-1e-8, -1e-8)]) {
      const back = cMul(cSqrt(z), cSqrt(z))
      expect(back.re).toBeCloseTo(z.re, 8)
      expect(back.im).toBeCloseTo(z.im, 8)
    }
  })

  it('roots zero to zero', () => {
    expect(cSqrt(C(0, 0))).toEqual({ re: 0, im: 0 })
  })
})

describe('cIsFinite', () => {
  it('separates usable results from poles', () => {
    expect(cIsFinite(C(1, -1))).toBe(true)
    expect(cIsFinite(C(Infinity, 0))).toBe(false)
    expect(cIsFinite(C(0, NaN))).toBe(false)
  })
})
