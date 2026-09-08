/**
 * Antinode — complex arithmetic for the RF core.
 *
 * Impedances, reflection coefficients and propagation constants are all complex,
 * and every one of them is re-evaluated inside an animation frame, so this module
 * is deliberately plain: bare object literals, no classes, no closures, no
 * temporaries beyond the single result. `Complex` is `{ re, im }` and nothing else.
 *
 * This file has no opinion about units — it is handed ohms, nepers per metre or
 * radians and does arithmetic on them. The physics lives in the callers.
 *
 * Numerical policy: at an exact pole (division by zero, tanh at j*pi/2) we return
 * an infinite component rather than NaN. An infinity can be tested with
 * `cIsFinite` and clamped by the caller; a NaN silently poisons every downstream
 * number in the station solution and shows up on screen as a blank meter.
 */

import type { Complex } from './types'

/** Construct. `im` defaults to 0 so real values read as `C(50)`. */
export const C = (re: number, im = 0): Complex => ({ re, im })

export const cAdd = (a: Complex, b: Complex): Complex => ({ re: a.re + b.re, im: a.im + b.im })

export const cSub = (a: Complex, b: Complex): Complex => ({ re: a.re - b.re, im: a.im - b.im })

export const cMul = (a: Complex, b: Complex): Complex => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
})

export const cNeg = (a: Complex): Complex => ({ re: -a.re, im: -a.im })

export const cScale = (a: Complex, k: number): Complex => ({ re: a.re * k, im: a.im * k })

/**
 * Magnitude, computed by scaling out the larger component first.
 *
 * The naive sqrt(re*re + im*im) overflows for |z| above ~1.3e154 and loses the
 * small component entirely below ~1e-162. Both bounds are reachable: a lossy line
 * a long way from resonance produces enormous intermediate impedances. Math.hypot
 * is equally safe but roughly an order of magnitude slower in V8, and cAbs is
 * called a few hundred times per frame by the standing-wave sampler.
 */
export const cAbs = (a: Complex): number => {
  const x = a.re < 0 ? -a.re : a.re
  const y = a.im < 0 ? -a.im : a.im
  if (x === 0) return y
  if (y === 0) return x
  const hi = x > y ? x : y
  const lo = x > y ? y : x
  // An infinite component dominates whatever the other one is; taking the ratio
  // first would give Infinity/Infinity = NaN.
  if (hi === Number.POSITIVE_INFINITY) return Number.POSITIVE_INFINITY
  const r = lo / hi
  return hi * Math.sqrt(1 + r * r)
}

/** Argument (phase) in radians, -pi..pi. */
export const cArg = (a: Complex): number => Math.atan2(a.im, a.re)

/**
 * Division by Smith's algorithm: factor the larger denominator component out
 * before squaring, so a denominator of 1e200 or 1e-200 divides cleanly instead
 * of overflowing |b|^2.
 */
export const cDiv = (a: Complex, b: Complex): Complex => {
  const br = b.re
  const bi = b.im
  if (br === 0 && bi === 0) {
    // An exact pole. 0/0 has no direction at all, so we call it zero; anything
    // else keeps the numerator's direction and goes infinite in that quadrant.
    if (a.re === 0 && a.im === 0) return { re: 0, im: 0 }
    return {
      re: a.re === 0 ? 0 : a.re > 0 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY,
      im: a.im === 0 ? 0 : a.im > 0 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY,
    }
  }
  const absBr = br < 0 ? -br : br
  const absBi = bi < 0 ? -bi : bi
  if (absBr >= absBi) {
    const r = bi / br
    const d = br + bi * r
    return { re: (a.re + a.im * r) / d, im: (a.im - a.re * r) / d }
  }
  const r = br / bi
  const d = br * r + bi
  return { re: (a.re * r + a.im) / d, im: (a.im * r - a.re) / d }
}

/** Reciprocal. 1/0 is reported as (+Infinity, 0), never NaN. */
export const cInv = (a: Complex): Complex => cDiv({ re: 1, im: 0 }, a)

/** e^(a+jb) = e^a (cos b + j sin b). */
export const cExp = (a: Complex): Complex => {
  const m = Math.exp(a.re)
  const c = Math.cos(a.im)
  const s = Math.sin(a.im)
  if (m === Number.POSITIVE_INFINITY) {
    // exp() overflowed. Keep the direction and avoid Infinity * 0 = NaN.
    return {
      re: c === 0 ? 0 : c > 0 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY,
      im: s === 0 ? 0 : s > 0 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY,
    }
  }
  return { re: m * c, im: m * s }
}

/**
 * tanh(a) saturates to +/-1 well before this, but sinh and cosh overflow at
 * an argument of about 710. 1 - tanh(x) is 2e^(-2x), which drops below half an
 * ulp of 1.0 at x ~ 19, so from |Re| = 20 upward the saturated answer is not an
 * approximation — it is the correctly rounded double.
 */
const TANH_SATURATION = 20

/**
 * Hyperbolic tangent, the kernel of the lossy transmission-line equation
 * Zin = Z0 (ZL + Z0 tanh(gamma*l)) / (Z0 + ZL tanh(gamma*l)).
 *
 * Written as the real identity
 *   tanh(a + jb) = (sinh 2a + j sin 2b) / (cosh 2a + cos 2b)
 * rather than as (e^z - e^-z)/(e^z + e^-z). The exponential form loses all
 * precision once e^(2a) overflows, and 100 m of RG-58 on 6 m is about 1.3 nepers
 * of one-way loss, so |Re(gamma*l)| well past 10 is an ordinary operating point,
 * not a pathological one.
 */
export const cTanh = (a: Complex): Complex => {
  const re = a.re
  if (re >= TANH_SATURATION) return { re: 1, im: 0 }
  if (re <= -TANH_SATURATION) return { re: -1, im: 0 }
  if (re === 0) {
    // Lossless line: tanh(jb) = j tan(b). Taking this branch directly keeps the
    // quarter-wave pole (b = pi/2) as a very large finite number instead of 0/0.
    return { re: 0, im: Math.tan(a.im) }
  }
  const twoA = 2 * re
  const twoB = 2 * a.im
  // With Re != 0, cosh(2a) > 1 strictly, so the denominator cannot reach zero
  // even where cos(2b) = -1.
  const d = Math.cosh(twoA) + Math.cos(twoB)
  return { re: Math.sinh(twoA) / d, im: Math.sin(twoB) / d }
}

/**
 * Principal square root, used for the characteristic impedance sqrt(Z/Y).
 *
 * The textbook form sqrt((|z| + re)/2) + j*sign(im)*sqrt((|z| - re)/2) cancels
 * catastrophically in one of its two terms depending on the sign of re, so we
 * compute the well-conditioned term and divide for the other.
 */
export const cSqrt = (a: Complex): Complex => {
  if (a.re === 0 && a.im === 0) return { re: 0, im: 0 }
  const m = cAbs(a)
  const absRe = a.re < 0 ? -a.re : a.re
  const t = Math.sqrt((m + absRe) / 2)
  if (t === 0) return { re: 0, im: 0 }
  if (a.re >= 0) return { re: t, im: a.im / (2 * t) }
  const absIm = a.im < 0 ? -a.im : a.im
  return { re: absIm / (2 * t), im: a.im < 0 ? -t : t }
}

export const cIsFinite = (a: Complex): boolean => Number.isFinite(a.re) && Number.isFinite(a.im)
