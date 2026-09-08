/**
 * Antinode — antenna feedpoint models.
 *
 * Every antenna here is a pure function Z(f, params). Nothing in this file
 * knows about the radio, the feedline or the screen; the rest of the app asks
 * this module "what does the coax see at the far end" and builds everything
 * else from the answer.
 *
 * The wire antennas share one core: the induced-EMF solution for a centre-fed
 * dipole of arbitrary length, referred to the current maximum, then transformed
 * to the chosen feedpoint by the square of the current ratio. That single model
 * reproduces the published free-space numbers exactly — 73.1 + j42.5 ohms at
 * half a wave, 199 ohms at a full wave, 105 at three half waves, 259 at two
 * wavelengths — which is why the harmonic behaviour of a real wire falls out of
 * it instead of being typed in by hand.
 *
 * Ground is handled by image theory: a horizontal wire sees an out-of-phase
 * copy of itself 2h below, and the mutual impedance between the two is Carter's
 * formula. That is where the classic "resistance swings between about 40 and 90
 * ohms as you raise a dipole" curve comes from. It is real physics, not a
 * lookup table, so moving the height slider moves the resonance too.
 *
 * Units: Hz, ohms, metres, henries, farads, amps, volts. No MHz, no feet.
 */

import type { AntennaDef, AntennaId, AntennaParam, Complex } from './types'
import { C, cAdd, cDiv, cInv, cMul, cScale, cTanh } from './complex'
import { CABLES } from './cables'
import { swrFromZ } from './match'

// ─── Physical constants ──────────────────────────────────────────────────────

/** Speed of light in vacuum, m/s. */
const C_LIGHT = 299792458
/** Impedance of free space, ohms. */
const ETA = 376.730313668
/** Euler–Mascheroni constant, which appears in every induced-EMF integral. */
const EULER = 0.5772156649015329
/** Permeability of free space, H/m. */
const MU0 = 4e-7 * Math.PI
/** Conductivity of annealed copper at 20 C, S/m. */
const SIGMA_CU = 5.8e7

// ─── Sine and cosine integrals ───────────────────────────────────────────────
//
// Si and Ci are the whole game for wire antennas: the induced-EMF integrals and
// Carter's mutual impedance are both written entirely in terms of them. The
// power series is fine below x = 2; above that it loses precision to
// cancellation, so we switch to the continued fraction for the exponential
// integral E1(ix) and read Si and Ci off the identity
//     E1(ix) = -Ci(x) + j(Si(x) - pi/2)
// which is exact. Both branches agree to about 1e-8 at the join, so the result
// is smooth enough to differentiate numerically.

const siSeries = (x: number): number => {
  let sum = x
  let term = x
  for (let n = 1; n < 60; n++) {
    term *= (-x * x) / ((2 * n) * (2 * n + 1))
    sum += term / (2 * n + 1)
    if (Math.abs(term) < 1e-18) break
  }
  return sum
}

const ciSeries = (x: number): number => {
  let sum = EULER + Math.log(x)
  let term = 1
  for (let n = 1; n < 60; n++) {
    term *= (-x * x) / ((2 * n - 1) * (2 * n))
    sum += term / (2 * n)
    if (Math.abs(term / (2 * n)) < 1e-18) break
  }
  return sum
}

/** E1(jx) by modified Lentz continued fraction, returned as [re, im]. */
const expIntImag = (x: number): readonly [number, number] => {
  const TINY = 1e-300
  let br = 1
  const bi = x
  let cr = 1 / TINY
  let ci = 0
  let den = br * br + bi * bi
  let dr = br / den
  let di = -bi / den
  let hr = dr
  let hi = di
  for (let i = 1; i < 300; i++) {
    const a = -(i * i)
    br += 2
    const tr = a * dr + br
    const ti = a * di + bi
    den = tr * tr + ti * ti
    dr = tr / den
    di = -ti / den
    den = cr * cr + ci * ci
    cr = br + (a * cr) / den
    ci = bi - (a * ci) / den
    const delRe = cr * dr - ci * di
    const delIm = cr * di + ci * dr
    const nr = hr * delRe - hi * delIm
    const ni = hr * delIm + hi * delRe
    hr = nr
    hi = ni
    if (Math.abs(delRe - 1) + Math.abs(delIm) < 1e-14) break
  }
  // Multiply by e^-jx to finish E1(jx) = e^-jx * (continued fraction).
  const cx = Math.cos(x)
  const sx = Math.sin(x)
  return [hr * cx + hi * sx, hi * cx - hr * sx]
}

/** Cosine integral Ci(x). Diverges logarithmically at 0; floored, not infinite. */
const ci = (x: number): number => {
  const v = Math.max(x, 1e-30)
  if (v < 2) return ciSeries(v)
  return -expIntImag(v)[0]
}

/** Sine integral Si(x). */
const si = (x: number): number => {
  const v = Math.max(x, 0)
  if (v === 0) return 0
  if (v < 2) return siSeries(v)
  return Math.PI / 2 + expIntImag(v)[1]
}

// ─── The wire dipole ─────────────────────────────────────────────────────────

/** Wire radius used for every wire antenna, metres. 2 mm diameter, representative. */
const WIRE_RADIUS_M = 0.001

/**
 * End effect. A real wire is electrically longer than it measures because of
 * the capacitance of its ends, the insulators and any insulation on the wire.
 * Thin-wire theory resonates at 0.487 wavelengths; hams cut 0.477 and it works.
 * 2 percent is that difference, and it is what makes the model agree with the
 * 468/f rule of thumb rather than sitting 2 percent away from it.
 */
const END_EFFECT = 1.020

/**
 * Residual feedpoint current, squared, as a fraction of the current maximum.
 * Sinusoidal-current theory says the current at a full-wave dipole's centre is
 * exactly zero, so the feedpoint impedance would be infinite. It is not: the
 * real distribution has a small non-zero current there. This one number sets
 * every anti-resonant peak, and 0.035 puts a full-wave wire dipole at about
 * 5 kilohms, which is where measurements put it.
 */
const FEED_SHUNT = 0.035

/**
 * Mode-order correction to the electrical length. The induced-EMF reactance is
 * accurate near the first resonance but places the higher-order resonances
 * about 3 percent high compared with method-of-moments results, which would put
 * a 40 m dipole's third-harmonic resonance above the 15 m band instead of in
 * it. This term is fitted to bring them back; it is exactly 1.0 at the first
 * resonance so the fundamental is untouched. Representative, not derived.
 */
const MODE_CORRECTION = 0.006

/** Ground reflection magnitude used for the image, average ground, representative. */
const GROUND_RHO_R = 0.80
/**
 * The reactive part of the image coupling is damped harder than the resistive
 * part. Real ground reflects with a magnitude below one and a phase shift, and
 * the quadrature term is the one that suffers; using the same weight for both
 * moves the resonant length of a high dipole by 3 percent, which measurements
 * do not show.
 */
const GROUND_RHO_X = 0.45
/** Near-field ground absorption at zero height, ohms, and its decay in wavelengths. */
const GROUND_LOSS_R = 34
const GROUND_LOSS_DECAY = 0.34

/** Impedance of a centre-fed wire referred to its current maximum (Balanis 4-70/4-71). */
const currentMaxZ = (kL: number, lengthM: number, radiusM: number): readonly [number, number] => {
  const s = Math.sin(kL)
  const c = Math.cos(kL)
  const r =
    (ETA / (2 * Math.PI)) *
    (EULER +
      Math.log(kL) -
      ci(kL) +
      0.5 * s * (si(2 * kL) - 2 * si(kL)) +
      0.5 * c * (EULER + Math.log(kL / 2) + ci(2 * kL) - 2 * ci(kL)))
  // The wire radius enters only here, through Ci(2 k a^2 / L). It is what sets
  // the reactance slope, and therefore the SWR bandwidth: fat wire, wide band.
  const thin = Math.max((2 * kL * radiusM * radiusM) / (lengthM * lengthM), 1e-14)
  const x =
    (ETA / (4 * Math.PI)) *
    (2 * si(kL) + c * (2 * si(kL) - si(2 * kL)) - s * (2 * ci(kL) - ci(2 * kL) - ci(thin)))
  return [r, x]
}

/**
 * Carter's mutual impedance between two parallel side-by-side half-wave
 * dipoles spaced d metres apart. Reproduces the published table: +51.4 ohms at
 * 0.2 wavelengths, -12.5 at 0.5, -24.9 at 0.7, and 73.1 as the spacing goes to
 * zero, which is the self-impedance — a useful check that the formula is right.
 */
const mutualZ = (k: number, dM: number): readonly [number, number] => {
  const lambda = (2 * Math.PI) / k
  const half = lambda / 2
  const d = Math.max(dM, 1e-3 * lambda)
  const r = Math.sqrt(d * d + half * half)
  const u0 = k * d
  const u1 = k * (r + half)
  const u2 = k * (r - half)
  return [30 * (2 * ci(u0) - ci(u1) - ci(u2)), -30 * (2 * si(u0) - si(u1) - si(u2))]
}

/** What a wire antenna solve returns: impedance split into radiation and loss. */
interface WireResult {
  readonly r: number
  readonly x: number
  /** The part of r that actually radiates. */
  readonly rRad: number
  /** The part of r that only heats the ground and the wire. */
  readonly rLoss: number
}

/**
 * Feedpoint impedance of a wire in free space, fed at `feedFraction` of its
 * length from one end. 0.5 is a centre-fed dipole; 0 is end-fed.
 */
const freeWire = (
  freqHz: number,
  lengthM: number,
  feedFraction: number,
  radiusM: number,
): WireResult => {
  const len = Math.max(lengthM, 0.05) * END_EFFECT
  const k = (2 * Math.PI * freqHz) / C_LIGHT
  // The mode correction is applied as an effective wavenumber so that both the
  // impedance integrals and the current ratio see the same electrical length.
  const kEff = k * (1 + MODE_CORRECTION * ((k * len) / Math.PI - 1))
  const kL = Math.max(kEff * len, 1e-6)
  const [rMax, xMax] = currentMaxZ(kL, len, radiusM)
  const sn = Math.sin(kL * feedFraction)
  const denom = sn * sn + FEED_SHUNT
  const rRad = Math.max(rMax, 0.01) / denom
  return { r: rRad, x: xMax / denom, rRad, rLoss: 0 }
}

/**
 * The same wire, hung horizontally h metres above ground. The image is
 * out of phase, so the mutual impedance subtracts: close to ground the antenna
 * cancels itself and the feedpoint resistance collapses; near 0.35 wavelengths
 * up the coupling is negative and the resistance peaks around 85 ohms. Ground
 * absorption in the near field is added as a loss resistance, which is why a
 * low dipole can read a comfortable 40 ohms while radiating half its power into
 * the dirt.
 */
/**
 * Self-resistance of the half-wave element Carter's mutual-impedance formula is
 * written for. Carter's R peaks at 73.13 ohms as the spacing goes to zero, so
 * expressing the coupling as a fraction of this also bounds it: a short wire can
 * never be driven negative by its own image.
 */
const MUTUAL_REFERENCE_R = 73.1

const groundedWire = (
  freqHz: number,
  lengthM: number,
  heightM: number,
  feedFraction: number,
  radiusM: number = WIRE_RADIUS_M,
): WireResult => {
  const len = Math.max(lengthM, 0.05) * END_EFFECT
  const k = (2 * Math.PI * freqHz) / C_LIGHT
  const kEff = k * (1 + MODE_CORRECTION * ((k * len) / Math.PI - 1))
  const kL = Math.max(kEff * len, 1e-6)
  const [rSelf, xSelf] = currentMaxZ(kL, len, radiusM)
  const h = Math.max(heightM, 0.5)
  const [rMut, xMut] = mutualZ(k, 2 * h)
  const lambda = C_LIGHT / freqHz
  // The image coupling has to be applied as a FRACTION, not subtracted outright.
  // Carter's mutual impedance is written for two half-wave elements, and mutualZ
  // always builds them that way, so its result is only meaningful relative to
  // the 73.1 ohm self-resistance it assumes. Subtracting it straight from the
  // self-resistance of a wire that is NOT a half wave over-cancels badly: a
  // 20.1 m dipole on 80 m has 6.3 ohms of self-resistance and would have 34 ohms
  // taken off it, pinning the result at the numerical floor and reporting a
  // usable-if-poor antenna as radiating a third of one percent of the power.
  const rRadMax = Math.max(rSelf * (1 - (GROUND_RHO_R * rMut) / MUTUAL_REFERENCE_R), 0.05)
  const rLossMax = GROUND_LOSS_R * Math.exp((-2 * h) / (GROUND_LOSS_DECAY * lambda))
  const xTotal = xSelf - GROUND_RHO_X * xMut
  const sn = Math.sin(kL * feedFraction)
  const denom = sn * sn + FEED_SHUNT
  return {
    r: (rRadMax + rLossMax) / denom,
    x: xTotal / denom,
    rRad: rRadMax / denom,
    rLoss: rLossMax / denom,
  }
}

// ─── The open-stub analogy ───────────────────────────────────────────────────
//
// End-fed wires are fed at a current minimum, where the induced-EMF model is at
// its weakest: the answer is the ratio of two small numbers. The transmission
// line analogy is better behaved there. A wire fed against a counterpoise is an
// open-circuited line of length l and average characteristic impedance Z0a, so
//     Z = Z0a * coth(alpha*l + j*beta*l)
// The loss term alpha is not copper loss; it is radiation leaving the line, and
// it is what makes the anti-resonant peaks finite. Because alpha*l is roughly
// constant across the harmonics, so is the peak impedance — which is exactly
// why one 49:1 transformer works on 40, 20, 15 and 10 metres.

/** Average characteristic impedance of a thin wire of length l, ohms. */
const wireZ0a = (lengthM: number, radiusM: number): number =>
  Math.max(120 * (Math.log(Math.max(lengthM, 0.05) / radiusM) - 1), 200)

const openStub = (
  freqHz: number,
  lengthM: number,
  z0a: number,
  alphaL: number,
  velocity: number,
): Complex => {
  const beta = (2 * Math.PI * freqHz) / (C_LIGHT * velocity)
  const gammaL = C(Math.max(alphaL, 1e-4), beta * Math.max(lengthM, 0.05))
  return cScale(cInv(cTanh(gammaL)), z0a)
}

// ─── Small helpers ───────────────────────────────────────────────────────────

const num = (params: Record<string, number>, key: string, fallback: number): number => {
  const v = params[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v)

/** Parallel combination of two impedances, safe when either is zero or huge. */
const parallelZ = (a: Complex, b: Complex): Complex => {
  const sum = cAdd(a, b)
  if (Math.abs(sum.re) + Math.abs(sum.im) < 1e-12) return C(1e-9, 0)
  return cDiv(cMul(a, b), sum)
}

/**
 * Last line of defence. Nothing downstream — the tuner solver, the line
 * transform, the Smith chart — is allowed to see a NaN or a negative
 * resistance, so every model exits through here.
 */
const finite = (re: number, im: number): Complex => {
  const r = Number.isFinite(re) ? clamp(re, 0.05, 1e6) : 0.05
  const x = Number.isFinite(im) ? clamp(im, -1e6, 1e6) : 0
  return C(r, x)
}

// ─── Loss models shared by several antennas ──────────────────────────────────

/**
 * Ground-system loss resistance of a ground-mounted vertical against radial
 * count, ohms. This is the single most useful number in the whole file: two
 * radials give about 22 ohms of loss, sixteen give about 6, sixty give about 2.
 * Adding radials therefore *lowers* the feedpoint resistance toward the 35 ohm
 * radiation resistance, so the SWR gets worse while the antenna gets better.
 * Fitted to the shape of the Brown, Lewis and Epstein measurements.
 */
const radialLossOhm = (radials: number): number =>
  52 / (1 + Math.pow(Math.max(radials, 0) / 1.35, 0.8))

/** Surface resistivity of copper at a frequency, ohms per square. */
const copperRs = (freqHz: number): number =>
  Math.sqrt((Math.PI * Math.max(freqHz, 1) * MU0) / SIGMA_CU)

// ─── The models ──────────────────────────────────────────────────────────────

/** Everything a model knows about itself at one frequency. */
interface Solved {
  readonly z: Complex
  /** Fraction of the power crossing the feedpoint that leaves as radiation. */
  readonly efficiency: number
  /** One sentence about what is happening here, for the Handbook card. */
  readonly notes: string
  /** Peak circulating current per watt delivered, A/sqrt(W). */
  readonly currentPerRootWatt: number
  /** Peak element voltage per watt delivered, V/sqrt(W). */
  readonly voltsPerRootWatt: number
}

const plain = (z: Complex, efficiency: number, notes: string): Solved => {
  const r = Math.max(z.re, 0.05)
  const i = 1 / Math.sqrt(r)
  return {
    z,
    efficiency: clamp(efficiency, 0, 1),
    notes,
    currentPerRootWatt: i,
    voltsPerRootWatt: Math.sqrt(r),
  }
}

const solveWire = (w: WireResult, extraLoss: number, notes: string): Solved => {
  const total = Math.max(w.rRad + w.rLoss + extraLoss, 0.05)
  return plain(finite(w.r + extraLoss, w.x), w.rRad / total, notes)
}

// dummy-load ------------------------------------------------------------------

const solveDummy = (): Solved =>
  plain(
    C(50, 0),
    0,
    'Fifty ohms, no reactance, no radiation. A perfect SWR reading and nothing on the air.',
  )

// dipole-40 / dipole-20 -------------------------------------------------------

const solveDipole = (freqHz: number, params: Record<string, number>, dl: number, dh: number): Solved => {
  const length = num(params, 'length', dl)
  const height = num(params, 'height', dh)
  const w = groundedWire(freqHz, length, height, 0.5)
  const lambda = C_LIGHT / freqHz
  return solveWire(
    w,
    0,
    `${(length / lambda).toFixed(2)} wavelengths of wire, ${(height / lambda).toFixed(2)} wavelengths up.`,
  )
}

// fan-dipole ------------------------------------------------------------------

/**
 * Leg lengths as a fraction of the longest leg. Nominally 1, 1/2, 1/3, 1/4, but
 * each leg is trimmed a little because they load each other: the 10 m leg hangs
 * inside the field of the 40 m leg and reads long, so it is cut short. That is
 * exactly what happens on the lawn with a pair of side cutters.
 */
const FAN_LEGS = [0.9956, 0.5046, 0.3333, 0.2459] as const

const solveFan = (freqHz: number, params: Record<string, number>): Solved => {
  const length = num(params, 'length', 20.3)
  const height = num(params, 'height', 10)
  // The legs hang from one feedpoint, so their admittances add. Off the design
  // bands the nearest resonant leg has the lowest impedance and takes the
  // current; the others are steeply reactive and only detune it a little.
  let gRe = 0
  let gIm = 0
  let rRad = 0
  let rLoss = 0
  for (const leg of FAN_LEGS) {
    const w = groundedWire(freqHz, length * leg, height, 0.5)
    const mag = w.r * w.r + w.x * w.x
    if (mag < 1e-12) continue
    const g = w.r / mag
    gRe += g
    gIm += -w.x / mag
    // Weight each leg's loss share by how much current it is actually taking.
    rRad += w.rRad * g
    rLoss += w.rLoss * g
  }
  const z = cInv(C(gRe, gIm))
  const share = rRad + rLoss
  const eff = share > 0 ? rRad / share : 0.9
  return plain(finite(z.re, z.im), eff, 'Four legs on one feedpoint; the resonant one takes the current.')
}

// efhw-40 ---------------------------------------------------------------------

/** Peak end impedance at the first resonance, ohms. Representative. */
const EFHW_PEAK = 2900
/** Equivalent parallel core-loss resistance of the 49:1 transformer, ohms. */
const EFHW_CORE_R = 30000
/** Winding resistance referred to the 50 ohm side, ohms. */
const EFHW_WINDING_R = 0.5

const solveEfhw = (freqHz: number, params: Record<string, number>): Solved => {
  const length = num(params, 'length', 20.7)
  const ratio = clamp(num(params, 'ratio', 49), 4, 100)
  const z0a = wireZ0a(length, WIRE_RADIUS_M)
  // alpha*l falls slowly with frequency, which lifts the anti-resonant peak from
  // about 2.9 k on 40 m to about 3.3 k on 10 m. Real end-fed halfwaves behave
  // the same way, which is why their SWR creeps up on the higher bands.
  const alphaL = (z0a / EFHW_PEAK) * Math.pow(Math.max(freqHz, 1e5) / 7.1e6, -0.1)
  const zWire = openStub(freqHz, length * END_EFFECT, z0a, alphaL, 1)
  const zHigh = parallelZ(zWire, C(EFHW_CORE_R, 0))
  const zLow = cAdd(cScale(zHigh, 1 / ratio), C(EFHW_WINDING_R, 0))
  // Power split between the wire and the core is the split between their
  // conductances, because they sit in parallel across the same voltage.
  const gWire = zWire.re / Math.max(zWire.re * zWire.re + zWire.im * zWire.im, 1e-12)

  // Core loss is not a fixed shunt resistance. The core carries the whole
  // magnetising flux, and a reactive load makes current circulate that delivers
  // no power to the wire at all, so the flux swing — and the loss that goes with
  // it — rises with the reactive-to-resistive ratio of what the transformer is
  // looking at. This is why an end-fed's unun runs cool on its resonant bands
  // and gets hot between them, which every EFHW owner has felt with a thumb.
  // Representative first-order model; the direction and the reason are the
  // physics, the coefficient is a fit.
  const reactiveRatio = Math.abs(zWire.im) / Math.max(zWire.re, 1e-9)
  const fluxPenalty = 1 + 1.6 * Math.min(reactiveRatio, 6)
  const gCore = fluxPenalty / EFHW_CORE_R
  const transformerEff = gWire / Math.max(gWire + gCore, 1e-12)
  const windingEff = zLow.re / Math.max(zLow.re + EFHW_WINDING_R, 1e-9)
  const eff = transformerEff * windingEff * 0.95
  return plain(
    finite(zLow.re, zLow.im),
    eff,
    `Wire end sees ${Math.round(Math.hypot(zWire.re, zWire.im))} ohms; the transformer divides it by ${Math.round(ratio)}.`,
  )
}

// g5rv ------------------------------------------------------------------------

/** The G5RV flat top is 31.1 m by definition; that is what makes it a G5RV. */
const G5RV_TOP_M = 31.1

/**
 * Short lossy-line transform, written out here rather than imported from
 * line.ts so the antenna models stay a leaf of the dependency graph.
 * Zin = Z0 (ZL + Z0 tanh gamma*l) / (Z0 + ZL tanh gamma*l).
 */
const throughLadder = (zL: Complex, freqHz: number, lengthM: number): Complex => {
  const cable = CABLES.ladder450
  const fMHz = Math.max(freqHz, 1e5) / 1e6
  const dbPerM = (cable.k1 * Math.sqrt(fMHz) + cable.k2 * fMHz) / 30.48
  const alpha = dbPerM / 8.685889638
  const beta = (2 * Math.PI * freqHz) / (C_LIGHT * cable.vf)
  const t = cTanh(C(alpha * lengthM, beta * lengthM))
  const z0 = C(cable.z0, 0)
  return cDiv(cMul(z0, cAdd(zL, cMul(z0, t))), cAdd(z0, cMul(zL, t)))
}

const solveG5rv = (freqHz: number, params: Record<string, number>): Solved => {
  const ladder = num(params, 'ladderLength', 9.1)
  const height = num(params, 'height', 11)
  const top = groundedWire(freqHz, G5RV_TOP_M, height, 0.5)
  const zTop = finite(top.r, top.x)
  const zIn = throughLadder(zTop, freqHz, ladder)
  // Loss on the ladder section: matched loss inflated by the standing wave.
  const fMHz = Math.max(freqHz, 1e5) / 1e6
  const cable = CABLES.ladder450
  const matched = ((cable.k1 * Math.sqrt(fMHz) + cable.k2 * fMHz) / 30.48) * ladder
  const s = clamp(swrFromZ(zTop, cable.z0), 1, 200)
  const totalDb = matched * ((1 + s * s) / (2 * s))
  const ladderEff = Math.pow(10, -totalDb / 10)
  const wireEff = top.rRad / Math.max(top.rRad + top.rLoss, 0.05)
  return plain(
    finite(zIn.re, zIn.im),
    wireEff * ladderEff,
    `${s.toFixed(1)}:1 on the ladder line, ${totalDb.toFixed(2)} dB lost in it.`,
  )
}

// ocf-windom ------------------------------------------------------------------

const OCF_BALUN_CORE_R = 8000
const OCF_BALUN_SERIES_R = 0.3

const solveOcf = (freqHz: number, params: Record<string, number>): Solved => {
  const length = num(params, 'length', 20.1)
  const offset = clamp(num(params, 'offset', 1 / 3), 0.1, 0.5)
  const height = num(params, 'height', 10)
  const w = groundedWire(freqHz, length, height, offset)
  const zFeed = finite(w.r, w.x)
  const zHigh = parallelZ(zFeed, C(OCF_BALUN_CORE_R, 0))
  const zOut = cAdd(cScale(zHigh, 0.25), C(OCF_BALUN_SERIES_R, 0))
  const gWire = zFeed.re / Math.max(zFeed.re * zFeed.re + zFeed.im * zFeed.im, 1e-12)
  const balunEff = gWire / Math.max(gWire + 1 / OCF_BALUN_CORE_R, 1e-12)
  const wireEff = w.rRad / Math.max(w.rRad + w.rLoss, 0.05)
  return plain(
    finite(zOut.re, zOut.im),
    wireEff * balunEff,
    `Feedpoint ${Math.round(zFeed.re)} ohms at ${(offset * 100).toFixed(0)}% along, divided by four.`,
  )
}

// vertical-quarter-40 ---------------------------------------------------------

const solveVerticalQuarter = (freqHz: number, params: Record<string, number>): Solved => {
  const height = num(params, 'height', 10.0)
  const radials = num(params, 'radials', 16)
  // A monopole over ground is half a dipole: same current distribution, half the
  // voltage, half the impedance. The image is the other half of the antenna,
  // which is why this one is not corrected for ground reflection the way a
  // horizontal wire is.
  const w = freeWire(freqHz, 2 * height, 0.5, 0.004)
  const rRad = w.r / 2
  const rLoss = radialLossOhm(radials)
  const total = rRad + rLoss
  return plain(
    finite(total, w.x / 2),
    rRad / Math.max(total, 0.05),
    `${Math.round(radials)} radials: ${rLoss.toFixed(1)} ohms of loss on top of ${rRad.toFixed(1)} ohms of radiation.`,
  )
}

// vertical-multiband ----------------------------------------------------------

/** Characteristic impedance of the equivalent stub for a trapped vertical, ohms. */
const TRAP_Z0 = 300
/** Radiation resistance the traps present in each band, ohms. */
const TRAP_R_BAND = 35
/** Traps make the radiator electrically about 1.9 times its physical height. */
const TRAP_LOADING = 0.521

const solveVerticalMultiband = (freqHz: number, params: Record<string, number>): Solved => {
  const height = num(params, 'height', 5.5)
  const radials = num(params, 'radials', 4)
  const f0 = (TRAP_LOADING * C_LIGHT) / (4 * Math.max(height, 1))
  // Electrical length that passes through a quarter wave in every band: pi/2 at
  // f0, 3pi/2 at 2*f0, and so on. Between the bands it passes through a half
  // wave, where the traps look like an open circuit and the SWR goes to the
  // moon. That is a trapped vertical in one line.
  const theta = (Math.PI * freqHz) / f0 - Math.PI / 2
  const a = Math.atanh(TRAP_R_BAND / TRAP_Z0)
  const z = cScale(cInv(cTanh(C(a, theta))), TRAP_Z0)
  const rTrap = 6 * Math.sqrt(Math.max(freqHz, 1e5) / f0)
  const rGround = radialLossOhm(radials)
  const rRad = Math.max(z.re, 0.05)
  const total = rRad + rTrap + rGround
  return plain(
    finite(total, z.im),
    rRad / total,
    `Traps resonate this as a quarter wave in each band; ${rTrap.toFixed(1)} ohms of trap loss.`,
  )
}

// random-wire-9to1 ------------------------------------------------------------

const UNUN_CORE_R = 15000
const UNUN_SERIES_R = 0.4

const solveRandomWire = (freqHz: number, params: Record<string, number>): Solved => {
  const length = num(params, 'length', 12.2)
  const counterpoise = num(params, 'counterpoise', 5)
  // The unun feeds between two open wires. Both are open stubs, both are part of
  // the antenna, and their impedances add. Nothing about that is resonant on
  // purpose, which is the point of the exercise.
  const z0Wire = wireZ0a(length, WIRE_RADIUS_M)
  const z0Cp = wireZ0a(counterpoise, WIRE_RADIUS_M)
  const zWire = openStub(freqHz, length * END_EFFECT, z0Wire, z0Wire / 2600, 1)
  const zCp = openStub(freqHz, counterpoise * END_EFFECT, z0Cp, z0Cp / 2600, 1)
  const zHigh = parallelZ(cAdd(zWire, zCp), C(UNUN_CORE_R, 0))
  const zOut = cAdd(cScale(zHigh, 1 / 9), C(UNUN_SERIES_R, 0))
  const zSum = cAdd(zWire, zCp)
  const gWire = zSum.re / Math.max(zSum.re * zSum.re + zSum.im * zSum.im, 1e-12)
  const eff = (gWire / Math.max(gWire + 1 / UNUN_CORE_R, 1e-12)) * 0.9
  return plain(
    finite(zOut.re, zOut.im),
    eff,
    `Wire and counterpoise together present ${Math.round(Math.hypot(zSum.re, zSum.im))} ohms; the unun divides by nine.`,
  )
}

// mag-loop --------------------------------------------------------------------

/** Loop conductor radius, metres. 22 mm copper tube, representative. */
const LOOP_TUBE_R = 0.011
/** Mutual inductance of the coupling loop, henries. Representative, fixed. */
const LOOP_COUPLING_M = 4.4e-8
/** Self-inductance of the coupling loop itself, henries. Representative. */
const LOOP_COUPLING_L = 3e-8
/** Joint and capacitor contact resistance at 7.1 MHz, ohms. Representative. */
const LOOP_JOINT_R = 0.04

interface LoopParts {
  readonly inductance: number
  readonly rTotal: number
  readonly rRad: number
  readonly reactance: number
}

const loopParts = (freqHz: number, params: Record<string, number>): LoopParts => {
  const diameter = clamp(num(params, 'diameter', 1.0), 0.3, 3)
  const capF = Math.max(num(params, 'capacitance', 2.02e-10), 1e-12)
  const a = diameter / 2
  // Single-turn circular loop inductance, the standard log form.
  const inductance = MU0 * a * (Math.log((8 * a) / LOOP_TUBE_R) - 2)
  const area = Math.PI * a * a
  const lambda = C_LIGHT / Math.max(freqHz, 1e5)
  const rRad = 31171 * Math.pow(area / (lambda * lambda), 2)
  const rCond = (copperRs(freqHz) * a) / LOOP_TUBE_R
  const rJoint = LOOP_JOINT_R * Math.sqrt(Math.max(freqHz, 1e5) / 7.1e6)
  const w = 2 * Math.PI * Math.max(freqHz, 1e5)
  return {
    inductance,
    rTotal: rRad + rCond + rJoint,
    rRad,
    reactance: w * inductance - 1 / (w * capF),
  }
}

const solveMagLoop = (freqHz: number, params: Record<string, number>): Solved => {
  const p = loopParts(freqHz, params)
  const w = 2 * Math.PI * Math.max(freqHz, 1e5)
  // A coupling loop is a transformer with a very loose coupling: the feedpoint
  // sees (wM)^2 divided by the loop impedance. Detune the capacitor and the loop
  // impedance rises, so the feedpoint impedance collapses toward zero.
  const zLoop = C(p.rTotal, p.reactance)
  const zIn = cAdd(
    cScale(cInv(zLoop), Math.pow(w * LOOP_COUPLING_M, 2)),
    C(0, w * LOOP_COUPLING_L),
  )
  const eff = p.rRad / Math.max(p.rTotal, 1e-9)
  // At resonance all the delivered power circulates through rTotal, so the loop
  // current is sqrt(P/rTotal) and the capacitor sees that current times its
  // reactance. Both numbers are why loops use vacuum capacitors and welded joints.
  const iPerRootW = 1 / Math.sqrt(Math.max(p.rTotal, 1e-9))
  const vPerRootW = iPerRootW * w * p.inductance
  return {
    z: finite(zIn.re, zIn.im),
    efficiency: clamp(eff, 0, 1),
    notes:
      `Loop Q about ${Math.round((w * p.inductance) / Math.max(p.rTotal, 1e-9))} unloaded. ` +
      `At 100 W: ${(iPerRootW * 10).toFixed(0)} A circulating, ` +
      `${Math.round(vPerRootW * 10)} V across the capacitor.`,
    currentPerRootWatt: iPerRootW,
    voltsPerRootWatt: vPerRootW,
  }
}

// mobile-whip-20 / screwdriver-mobile ----------------------------------------

/** Whip conductor radius, metres. Representative. */
const WHIP_RADIUS_M = 0.005
/** Effective height as a fraction of physical height for a centre-loaded whip. */
const WHIP_TAPER = 0.68
/** Radiation resistance a quarter-wave monopole saturates at, ohms. */
const WHIP_R_SAT = 36
/** Vehicle ground-return loss at 14.175 MHz, ohms. Representative. */
const WHIP_GROUND_R = 10
/** Fixed loading inductance of the 20 m whip, henries, cut for 14.175 MHz. */
const WHIP20_L = 4.104e-6

interface WhipParts {
  readonly rRad: number
  readonly rLoss: number
  readonly xAnt: number
  readonly xCoil: number
}

const whipParts = (freqHz: number, heightM: number, inductance: number, coilQ: number): WhipParts => {
  const h = clamp(heightM, 0.5, 6)
  const lambda = C_LIGHT / Math.max(freqHz, 1e5)
  const k = (2 * Math.PI) / lambda
  const z0 = Math.max(60 * (Math.log((2 * h) / WHIP_RADIUS_M) - 1), 100)
  // Soft-limited cotangent: cos*sin/(sin^2 + eps^2). Identical to -Z0*cot(kh)
  // away from the poles, but finite and smooth through them, so a sweep never
  // jumps. eps = 0.03 caps the reactance near 6 kilohms.
  const s = Math.sin(k * h)
  const c = Math.cos(k * h)
  const xAnt = -z0 * ((c * s) / (s * s + 0.0009))
  const hEff = WHIP_TAPER * h
  // Radiation resistance of a short monopole over a ground plane:
  // Rr = 40 pi^2 (heff/lambda)^2, with heff the effective height that the
  // loading coil's flattened current distribution buys you. A centre-loaded
  // 2.6 m whip on 20 m lands near 5 ohms, which is what these actually measure
  // and why they are such poor radiators. (An earlier version of this model used
  // 160 pi^2, the DIPOLE coefficient, and reported a Hamstick as 48 percent
  // efficient. It is not.)
  const linear = 40 * Math.PI * Math.PI * Math.pow(hEff / lambda, 2)
  const u = linear / WHIP_R_SAT
  // Saturating knee so a tall whip at 28 MHz stops at a quarter wave's 36 ohms
  // instead of running away, without a discontinuity at the knee.
  const rRad = (WHIP_R_SAT * u) / Math.pow(1 + Math.pow(u, 4), 0.25)
  const xCoil = 2 * Math.PI * Math.max(freqHz, 1e5) * inductance
  const rCoil = xCoil / clamp(coilQ, 20, 600)
  const rGround = WHIP_GROUND_R * Math.sqrt(14.175e6 / Math.max(freqHz, 1e5))
  return { rRad, rLoss: rCoil + rGround, xAnt, xCoil }
}

const solveMobileWhip = (freqHz: number, params: Record<string, number>): Solved => {
  const height = num(params, 'height', 2.6)
  const coilQ = num(params, 'coilQ', 200)
  const p = whipParts(freqHz, height, WHIP20_L, coilQ)
  const total = p.rRad + p.rLoss
  return plain(
    finite(total, p.xAnt + p.xCoil),
    p.rRad / Math.max(total, 0.05),
    `${p.rRad.toFixed(1)} ohms radiating against ${p.rLoss.toFixed(1)} ohms of coil and vehicle loss.`,
  )
}

/** Largest loading inductance the screwdriver motor can wind in, henries. */
const SCREWDRIVER_L_MAX = 9e-5

const screwdriverL = (position: number): number =>
  SCREWDRIVER_L_MAX * Math.pow(clamp(position, 0, 1), 3) + 1e-8

const solveScrewdriver = (freqHz: number, params: Record<string, number>): Solved => {
  const height = num(params, 'height', 2.6)
  const position = num(params, 'coilPosition', 0.356)
  const coilQ = num(params, 'coilQ', 250)
  const p = whipParts(freqHz, height, screwdriverL(position), coilQ)
  const total = p.rRad + p.rLoss
  return plain(
    finite(total, p.xAnt + p.xCoil),
    p.rRad / Math.max(total, 0.05),
    `Coil at ${(position * 100).toFixed(0)}% travel, ${(screwdriverL(position) * 1e6).toFixed(1)} microhenries in circuit.`,
  )
}

// yagi-3el-20 -----------------------------------------------------------------

/** Driven-element resistance as a fraction of a free dipole's, from the parasitics. */
const YAGI_COUPLING = 0.50
/** Hairpin inductance, henries, sized for 25 ohms up to 50 at 14.175 MHz. */
const YAGI_HAIRPIN_L = 5.79e-7

const solveYagi = (freqHz: number, params: Record<string, number>): Solved => {
  const driven = num(params, 'driven', 9.5)
  const height = num(params, 'height', 15)
  const w = groundedWire(freqHz, driven, height, 0.5, 0.006)
  // The reflector and director load the driven element down to about a quarter
  // of its free resistance. Scaling by a real number does not move the
  // reactance zero, which is what lets the hairpin do its job.
  const zDe = finite(w.r * YAGI_COUPLING, w.x * YAGI_COUPLING)
  const xHairpin = 2 * Math.PI * Math.max(freqHz, 1e5) * YAGI_HAIRPIN_L
  const zOut = parallelZ(zDe, C(0.5, xHairpin))
  const wireEff = w.rRad / Math.max(w.rRad + w.rLoss, 0.05)
  return plain(
    finite(zOut.re, zOut.im),
    wireEff * 0.96,
    `Driven element ${Math.round(zDe.re)} ohms, hairpin brings it to fifty.`,
  )
}

// ─── Dispatch ────────────────────────────────────────────────────────────────

const solve = (id: AntennaId, freqHz: number, params: Record<string, number>): Solved => {
  const f = clamp(Number.isFinite(freqHz) ? freqHz : 1e6, 1e5, 3e8)
  switch (id) {
    case 'dummy-load':
      return solveDummy()
    case 'dipole-40':
      return solveDipole(f, params, 20.1, 10)
    case 'dipole-20':
      return solveDipole(f, params, 10.15, 10)
    case 'fan-dipole':
      return solveFan(f, params)
    case 'efhw-40':
      return solveEfhw(f, params)
    case 'g5rv':
      return solveG5rv(f, params)
    case 'ocf-windom':
      return solveOcf(f, params)
    case 'vertical-quarter-40':
      return solveVerticalQuarter(f, params)
    case 'vertical-multiband':
      return solveVerticalMultiband(f, params)
    case 'random-wire-9to1':
      return solveRandomWire(f, params)
    case 'mag-loop':
      return solveMagLoop(f, params)
    case 'mobile-whip-20':
      return solveMobileWhip(f, params)
    case 'screwdriver-mobile':
      return solveScrewdriver(f, params)
    case 'yagi-3el-20':
      return solveYagi(f, params)
  }
}

// ─── Parameter definitions ───────────────────────────────────────────────────

const P = (
  key: string,
  label: string,
  unit: string,
  min: number,
  max: number,
  step: number,
  def: number,
  help: string,
): AntennaParam => ({ key, label, unit, min, max, step, default: def, help })

const HEIGHT_HELP =
  'Height above ground. The ground reflects, so the feedpoint resistance swings ' +
  'from about 35 ohms near the dirt to about 85 ohms at a third of a wavelength up.'

// ─── The table ───────────────────────────────────────────────────────────────

export const ANTENNAS: Readonly<Record<AntennaId, AntennaDef>> = Object.freeze({
  'dummy-load': {
    id: 'dummy-load',
    name: 'Fifty ohm dummy load',
    short: 'Dummy load',
    family: 'reference',
    selfTunable: false,
    needsTuner: false,
    params: [],
    nativeBands: ['160m', '80m', '60m', '40m', '30m', '20m', '17m', '15m', '12m', '10m', '6m'],
    heightM: 0.1,
    spanM: 0.2,
    summary: 'A 50 ohm resistor in a can. Perfect match, nothing radiated.',
    detail:
      'The dummy load is here as the control experiment. It presents exactly 50 ohms with no ' +
      'reactance at every frequency, so the radio is perfectly happy and the SWR meter reads ' +
      '1.0 to 1. It also turns every watt into heat inside the can. Whenever someone says an ' +
      'antenna "tunes up beautifully on all bands", this is the antenna they have described.',
    fidelityNote:
      'Exactly 50 + j0 ohms at all frequencies, which is an idealisation: a real load drifts ' +
      'with temperature and goes inductive above 100 MHz or so. Its power rating and thermal ' +
      'time constant are not modelled.',
  },
  'dipole-40': {
    id: 'dipole-40',
    name: '40 m half-wave dipole',
    short: '40 m dipole',
    family: 'wire',
    selfTunable: false,
    needsTuner: false,
    params: [
      P('length', 'Wire length', 'm', 15, 26, 0.05, 20.1,
        'Total tip to tip. Longer wire, lower resonance, roughly 7.1 MHz at 20 metres.'),
      P('height', 'Feedpoint height', 'm', 3, 30, 0.25, 10, HEIGHT_HELP),
    ],
    nativeBands: ['40m', '15m'],
    heightM: 10,
    spanM: 20.1,
    summary: 'Two quarter waves of wire fed in the middle. The reference wire antenna.',
    detail:
      'At resonance the current is maximum at the centre and zero at the ends, which puts a ' +
      'low resistance across the feedpoint: 65 to 85 ohms depending on how high it is. Move ' +
      'off resonance and the wire looks like an open-ended stub, going capacitive below and ' +
      'inductive above. On 20 m it is a full wave, the feedpoint sits at a current null, and ' +
      'the impedance rises to several thousand ohms. On 15 m it is three half waves and works ' +
      'again, at around 95 ohms.',
    fidelityNote:
      'Induced-EMF model with an image in the ground, calibrated to the published free-space ' +
      'figures. The wire is 2 mm and perfectly straight and level; sag, insulators, feedline ' +
      'common-mode current and real soil constants are not modelled. Ground is one average ' +
      'reflecting surface, not a layered dielectric, and the reactance of the higher-order ' +
      'resonances carries a fitted correction. Pattern and take-off angle are not modelled at all.',
  },
  'dipole-20': {
    id: 'dipole-20',
    name: '20 m half-wave dipole',
    short: '20 m dipole',
    family: 'wire',
    selfTunable: false,
    needsTuner: false,
    params: [
      P('length', 'Wire length', 'm', 7, 14, 0.05, 10.15,
        'Total tip to tip. About 10.1 metres puts resonance in the middle of 20 m.'),
      P('height', 'Feedpoint height', 'm', 3, 30, 0.25, 10, HEIGHT_HELP),
    ],
    nativeBands: ['20m', '10m'],
    heightM: 10,
    spanM: 10.15,
    summary: 'The same wire antenna cut for 20 m, and half as long.',
    detail:
      'Identical physics to the 40 m dipole with every length halved, which makes it a useful ' +
      'comparison: at the same 10 metre height it is nearly half a wavelength up instead of a ' +
      'quarter, so the ground reflection lands differently and the feedpoint resistance and ' +
      'bandwidth both change. Its second harmonic falls in 10 m, where it is a full wave and a ' +
      'poor load.',
    fidelityNote:
      'Same model and same limits as the 40 m dipole. Straight, level, 2 mm wire over one ' +
      'average ground; no sag, no insulator loading, no pattern.',
  },
  'fan-dipole': {
    id: 'fan-dipole',
    name: 'Fan dipole, 40/20/15/10 m',
    short: 'Fan dipole',
    family: 'wire',
    selfTunable: false,
    needsTuner: false,
    params: [
      P('length', 'Longest leg', 'm', 16, 24, 0.05, 20.3,
        'The 40 m leg. The others are half, a third and a quarter of it and follow it up and down.'),
      P('height', 'Feedpoint height', 'm', 3, 30, 0.25, 10, HEIGHT_HELP),
    ],
    nativeBands: ['40m', '20m', '15m', '10m'],
    heightM: 10,
    spanM: 20.3,
    summary: 'Four dipoles on one feedpoint. Each band picks its own wire.',
    detail:
      'Because the legs share a feedpoint their admittances add, and the leg that is resonant ' +
      'has by far the lowest impedance, so it takes almost all the current. The others are ' +
      'steeply reactive and mostly just detune it a little, which is why a fan dipole has to be ' +
      'trimmed band by band and from the shortest leg upward. Off the design bands it behaves ' +
      'like whichever leg is nearest.',
    fidelityNote:
      'The legs are modelled as independent dipoles combined in parallel at the feedpoint. ' +
      'Real legs are also coupled through their radiated fields, which shifts resonances by a ' +
      'few tens of kilohertz and is not modelled. The legs are held at fixed ratios rather than ' +
      'trimmed individually.',
  },
  'efhw-40': {
    id: 'efhw-40',
    name: 'End-fed half wave with 49:1',
    short: 'End-fed half wave',
    family: 'wire',
    selfTunable: false,
    needsTuner: false,
    params: [
      P('length', 'Wire length', 'm', 12, 30, 0.05, 20.7,
        'A half wave on the lowest band. Every harmonic of that is also a usable point.'),
      P('ratio', 'Transformer ratio', ':1', 16, 81, 1, 49,
        'Impedance ratio of the transformer. 49:1 divides 2450 ohms down to 50.'),
    ],
    nativeBands: ['40m', '20m', '15m', '10m'],
    heightM: 9,
    spanM: 20.7,
    summary: 'Fed at the end, where the impedance is thousands of ohms, through a 49:1 transformer.',
    detail:
      'The end of a half-wave wire is a voltage maximum and a current minimum, so it presents a ' +
      'high impedance: about 2900 ohms here. Divide that by 49 and you get close enough to 50 ' +
      'ohms to key up. The trick is that every harmonic of the wire is also a high-impedance ' +
      'point of roughly the same value, which is why one wire and one transformer cover 40, 20, ' +
      '15 and 10 m. Between the bands the impedance runs away and the transformer starts eating ' +
      'the power it cannot pass.',
    fidelityNote:
      'The wire is modelled as an open-ended transmission line whose loss term represents ' +
      'radiation, calibrated so the anti-resonant peak lands near 2900 ohms. The transformer is ' +
      'an ideal ratio with a parallel core-loss resistance and a series winding resistance, both ' +
      'representative. Counterpoise length, coax common-mode current and core saturation are not ' +
      'modelled, and they matter on a real one.',
  },
  g5rv: {
    id: 'g5rv',
    name: 'G5RV',
    short: 'G5RV',
    family: 'wire',
    selfTunable: false,
    needsTuner: true,
    params: [
      P('ladderLength', 'Ladder line', 'm', 6, 16, 0.05, 9.1,
        'The 450 ohm matching section. It is a transformer, and its length is the ratio.'),
      P('height', 'Flat top height', 'm', 4, 30, 0.25, 11, HEIGHT_HELP),
    ],
    nativeBands: ['20m'],
    heightM: 11,
    spanM: 31.1,
    summary: '31.1 m of wire with a 9.1 m 450 ohm matching section. Designed for 20 m.',
    detail:
      'Louis Varney designed it as a 20 m antenna: the top is three half waves on 20 m, the ' +
      'ladder line transforms that to something a radio will accept, and it happens to be usable ' +
      'elsewhere with a tuner. On 40 m and 80 m the top is the wrong length and the ladder ' +
      'section is the wrong transformer, so what arrives at the coax is a long way from 50 ohms. ' +
      'It is a good antenna that has spent fifty years being sold as an all-band antenna.',
    fidelityNote:
      'The flat top is the dipole model and the ladder section is a lossy line transform using ' +
      'the 450 ohm window line data in cables.ts. The coax run below it is the feedline, not part ' +
      'of the antenna model. Common-mode current on that coax, which is the usual reason a real ' +
      'G5RV misbehaves, is not modelled.',
  },
  'ocf-windom': {
    id: 'ocf-windom',
    name: 'Off-centre-fed dipole',
    short: 'OCF Windom',
    family: 'wire',
    selfTunable: false,
    needsTuner: false,
    params: [
      P('length', 'Wire length', 'm', 16, 26, 0.05, 20.1,
        'Total tip to tip, a half wave on the lowest band.'),
      P('offset', 'Feedpoint offset', 'fraction', 0.15, 0.5, 0.005, 1 / 3,
        'How far along the wire the balun hangs. A third is the classic choice, and it is the ' +
        'reason 15 m does not work.'),
    ],
    nativeBands: ['40m', '20m', '10m'],
    heightM: 10,
    spanM: 20.1,
    summary: 'A dipole fed a third of the way along, through a 4:1 balun.',
    detail:
      'Move the feedpoint away from the centre and you feed the wire at a lower current point, ' +
      'so the impedance rises. At a third of the way along it is around 100 ohms on the ' +
      'fundamental and 250 to 350 ohms on the even harmonics, which a 4:1 balun brings into ' +
      'range. The same geometry that makes 40, 20 and 10 m work puts the feedpoint at a dead ' +
      'current null on 15 m, where the impedance goes to the ceiling.',
    fidelityNote:
      'Sinusoidal-current theory: the feedpoint impedance is the current-maximum impedance ' +
      'divided by the square of the current ratio at the tap. That is exact only at resonance, ' +
      'so the shape between bands is approximate. The 4:1 balun is an ideal ratio with ' +
      'representative core and winding loss; the common-mode current an off-centre feed pushes ' +
      'onto the coax is real and is not modelled.',
  },
  'vertical-quarter-40': {
    id: 'vertical-quarter-40',
    name: 'Ground-mounted quarter wave, 40 m',
    short: 'Quarter-wave vertical',
    family: 'vertical',
    selfTunable: false,
    needsTuner: false,
    params: [
      P('height', 'Radiator height', 'm', 6, 14, 0.05, 10.0,
        'A quarter wave is about 10.1 metres on 40 m.'),
      P('radials', 'Radials', 'count', 0, 120, 1, 16,
        'Ground radials. More radials means less loss, lower feedpoint resistance and a worse ' +
        'looking SWR.'),
    ],
    nativeBands: ['40m'],
    heightM: 0,
    spanM: 10.0,
    summary: 'A quarter wave of vertical wire working against a radial field.',
    detail:
      'The ground is the other half of this antenna, and it is a resistor. A quarter-wave ' +
      'radiator over a perfect ground plane is about 35 ohms; the radial field decides how much ' +
      'loss resistance sits in series with that. Two radials add about 22 ohms of loss, which ' +
      'lands the feedpoint near 54 ohms and gives a flattering 1.1 to 1. Sixty radials cut the ' +
      'loss to about 2 ohms, so the feedpoint falls to 37 ohms and the SWR rises to 1.4 to 1 — ' +
      'while the antenna goes from radiating 60 percent of your power to radiating 93 percent. ' +
      'Adding radials makes the meter look worse and the antenna work better.',
    fidelityNote:
      'The radiator is half a dipole by image theory. The radial loss curve is fitted to the ' +
      'shape of the Brown, Lewis and Epstein ground-system measurements, not calculated from ' +
      'soil constants, so it is representative: real loss depends on radial length, soil ' +
      'conductivity and whether the radials are buried. Far-field ground loss and take-off angle ' +
      'are not modelled.',
  },
  'vertical-multiband': {
    id: 'vertical-multiband',
    name: 'Trapped multiband vertical',
    short: 'Multiband vertical',
    family: 'vertical',
    selfTunable: false,
    needsTuner: false,
    params: [
      P('height', 'Radiator height', 'm', 3.5, 8, 0.05, 5.5,
        'Physical height. The traps make it electrically about twice this on the lowest band, ' +
        'so raising it moves every band down together.'),
      P('radials', 'Radials', 'count', 0, 60, 1, 4,
        'Ground radials. Trap verticals are usually installed with very few, and it costs.'),
    ],
    nativeBands: ['40m', '20m', '15m', '10m'],
    heightM: 0,
    spanM: 5.5,
    summary: 'A short vertical with traps, resonant in four bands and reactive between them.',
    detail:
      'Each trap is a parallel tuned circuit. Above its resonance it is capacitive and isolates ' +
      'the section above it; below, it is inductive and loads the section in. The result is a ' +
      'radiator that is electrically a quarter wave in every band it was built for and an open ' +
      'circuit between them. It is convenient, it is short, and the traps and the thin radial ' +
      'field between them take a real bite out of the power.',
    fidelityNote:
      'Representative. The trap network is modelled as an equivalent open stub whose electrical ' +
      'length passes through a quarter wave in each design band, rather than as individual ' +
      'inductors and capacitors, so trap Q, trap voltage breakdown and the exact resonant ' +
      'frequencies of a specific commercial vertical are not reproduced. Trap loss is a fitted ' +
      'resistance that rises with frequency.',
  },
  'random-wire-9to1': {
    id: 'random-wire-9to1',
    name: 'Random wire with 9:1 unun',
    short: 'Random wire, 9:1',
    family: 'wire',
    selfTunable: false,
    needsTuner: true,
    params: [
      P('length', 'Wire length', 'm', 5, 40, 0.1, 12.2,
        'Whatever length reached the tree. Avoid half waves on the bands you use.'),
      P('counterpoise', 'Counterpoise', 'm', 1, 25, 0.1, 5,
        'The other half of the antenna, whether you admit it or not.'),
    ],
    nativeBands: [],
    heightM: 8,
    spanM: 12.2,
    summary: 'An arbitrary length of wire fed against a counterpoise through a 9:1 unun.',
    detail:
      'There is no resonance here on purpose. The impedance swings between a few ohms and ' +
      'several thousand as the frequency moves, the unun divides it by nine to bring it into ' +
      'the range a tuner can reach, and then the tuner does all the real work. That is the ' +
      'honest description: this is a tuner-fed antenna, and the loss you care about is in the ' +
      'tuner and the coax, not the wire.',
    fidelityNote:
      'Both the wire and the counterpoise are modelled as open-ended lines in series, which is ' +
      'the right topology but treats each as a uniform line rather than a radiating structure. ' +
      'The unun is an ideal 9:1 with representative core and winding loss. Coax common-mode ' +
      'current, which on a real random wire is most of the story, is not modelled.',
  },
  'mag-loop': {
    id: 'mag-loop',
    name: 'Small transmitting loop',
    short: 'Magnetic loop',
    family: 'loop',
    selfTunable: true,
    needsTuner: false,
    params: [
      P('diameter', 'Loop diameter', 'm', 0.6, 2, 0.01, 1.0,
        'Radiation resistance goes as the square of the area, so diameter is everything.'),
      P('capacitance', 'Tuning capacitor', 'F', 1e-11, 5e-10, 1e-12, 2.02e-10,
        'Resonates the loop. This is the tuning control: a few picofarads moves the antenna a ' +
        'whole band.'),
    ],
    nativeBands: ['40m', '30m', '20m', '17m', '15m'],
    heightM: 1.5,
    spanM: 1.0,
    summary: 'A metre of copper tube tuned by a capacitor. Very sharp, very inefficient low down.',
    detail:
      'The loop is a single-turn inductor of a couple of microhenries with a capacitor across ' +
      'it, and it is a series resonant circuit with a Q in the thousands. Its radiation ' +
      'resistance on 40 m is about six milliohms, against thirty to seventy milliohms of ' +
      'conductor and joint loss, so it radiates under ten percent of what you feed it. All the ' +
      'power that does not radiate circulates: 100 watts puts around 35 amps through the tube ' +
      'and several kilovolts across the capacitor, which is why the joints are welded and the ' +
      'capacitor is a vacuum or butterfly type with no rubbing contacts.',
    fidelityNote:
      'Standard small-loop formulas: inductance from the log form, radiation resistance from ' +
      'the area-squared law, conductor loss from copper surface resistivity. The joint and ' +
      'capacitor contact resistance is a representative 40 milliohms at 7 MHz and dominates the ' +
      'efficiency on the low bands. The coupling loop is a fixed mutual inductance with its own ' +
      'reactance assumed tuned out, so the model does not show the retuning of the coupling that ' +
      'a real loop needs band to band. Capacitor voltage breakdown is reported, not enforced.',
  },
  'mobile-whip-20': {
    id: 'mobile-whip-20',
    name: 'Loaded mobile whip, 20 m',
    short: 'Mobile whip, 20 m',
    family: 'mobile',
    selfTunable: false,
    needsTuner: true,
    params: [
      P('height', 'Whip height', 'm', 1.2, 3.5, 0.05, 2.6,
        'Total height above the mount. The coil is fixed, so changing this detunes it.'),
      P('coilQ', 'Coil Q', '', 60, 500, 5, 200,
        'Unloaded Q of the loading coil. A thin coil on a fibreglass rod is nearer 100; a big ' +
        'air-wound coil is nearer 400.'),
    ],
    nativeBands: ['20m'],
    heightM: 1.4,
    spanM: 2.6,
    summary: 'A short whip with a fixed loading coil. Low resistance, narrow, lossy.',
    detail:
      'A 2.6 metre whip is an eighth of a wavelength on 20 m, so it is strongly capacitive and ' +
      'the loading coil has to cancel about 365 ohms of that. Its radiation resistance is around ' +
      '11 ohms, and it sits in series with the coil loss and the vehicle ground return, which ' +
      'together are usually larger. The feedpoint lands near 20 ohms, so it does not present a ' +
      'flat SWR without help, and the bandwidth is a few hundred kilohertz.',
    fidelityNote:
      'The whip is a short monopole: reactance from an open stub, radiation resistance from the ' +
      'effective-height law with a saturating knee at a quarter wave. Effective height is taken ' +
      'as 0.68 of the physical height for a centre-loaded whip, which is representative. The ' +
      'vehicle ground return is a fitted 10 ohms at 14 MHz; a real one depends entirely on ' +
      'bonding and mount position. Capacity hats, coil position along the whip and the body ' +
      'pattern are not modelled.',
  },
  'screwdriver-mobile': {
    id: 'screwdriver-mobile',
    name: 'Screwdriver mobile antenna',
    short: 'Screwdriver mobile',
    family: 'mobile',
    selfTunable: true,
    needsTuner: false,
    params: [
      P('coilPosition', 'Coil travel', 'fraction', 0, 1, 0.001, 0.356,
        'Motor position. Winding the coil in adds inductance and drops the resonance: about 0.08 ' +
        'for 10 m, 0.36 for 20 m, 0.60 for 40 m, 0.94 for 80 m.'),
      P('height', 'Whip height', 'm', 1.5, 3.5, 0.05, 2.6,
        'Total height above the mount. Taller is better on every band and worse in car parks.'),
    ],
    nativeBands: ['80m', '40m', '30m', '20m', '17m', '15m', '12m', '10m'],
    heightM: 1.4,
    spanM: 2.6,
    summary: 'A mobile whip with a motor-driven loading coil. The antenna retunes itself.',
    detail:
      'A small motor moves a contact along a coil, changing the loading inductance and sliding ' +
      'the resonance from 80 m to 10 m. Nothing else changes: the same short radiator, the same ' +
      'vehicle ground. That is why it is such a good demonstration of where mobile power goes. ' +
      'On 10 m the whip is nearly a quarter wave and it radiates most of what you feed it; on ' +
      '80 m the radiation resistance is under an ohm against twenty-odd ohms of coil and ground ' +
      'loss, and you are heating the coil with 97 percent of your power.',
    fidelityNote:
      'Same short-monopole model as the fixed whip, with the loading inductance driven by the ' +
      'travel parameter through a fitted cubic law that spans 0.01 to 90 microhenries. Coil Q is ' +
      'a fixed 250 and does not vary with how much of the coil is shorted out, which on a real ' +
      'screwdriver it does. Capacity hat, whip taper and body pattern are not modelled.',
  },
  'yagi-3el-20': {
    id: 'yagi-3el-20',
    name: 'Three-element Yagi, 20 m',
    short: '3-el Yagi, 20 m',
    family: 'beam',
    selfTunable: false,
    needsTuner: false,
    params: [
      P('driven', 'Driven element', 'm', 8.8, 10.2, 0.01, 9.5,
        'Length of the driven element. It is deliberately short so it is capacitive, which is ' +
        'half of the hairpin match.'),
      P('height', 'Boom height', 'm', 6, 30, 0.25, 15, HEIGHT_HELP),
    ],
    nativeBands: ['20m'],
    heightM: 15,
    spanM: 10.4,
    summary: 'A monoband beam. Around 25 ohms at the driven element, matched up to 50.',
    detail:
      'The reflector and director are not fed; they are coupled to the driven element and they ' +
      'load it down. A three-element 20 m Yagi typically shows 20 to 30 ohms at the driven ' +
      'element, so it needs a matching device — here a hairpin, which works by leaving the ' +
      'element short enough to be capacitive and then hanging a shunt inductance across the ' +
      'feedpoint. The match is a narrow-band arrangement by design: a couple of hundred ' +
      'kilohertz either side of the design frequency and the SWR climbs quickly.',
    fidelityNote:
      'Representative. The driven element is the dipole model scaled down by a fixed coupling ' +
      'factor to stand in for the parasitics, rather than a solved three-element array, so the ' +
      'exact resistance and the way it changes with element spacing are approximate. Gain, ' +
      'front-to-back ratio and pattern are not modelled at all — this app is about impedance ' +
      'and power, and a beam is the one antenna where that is only half the story.',
  },
})

export const ANTENNA_LIST: readonly AntennaDef[] = Object.freeze([
  ANTENNAS['dummy-load'],
  ANTENNAS['dipole-40'],
  ANTENNAS['dipole-20'],
  ANTENNAS['fan-dipole'],
  ANTENNAS['efhw-40'],
  ANTENNAS.g5rv,
  ANTENNAS['ocf-windom'],
  ANTENNAS['vertical-quarter-40'],
  ANTENNAS['vertical-multiband'],
  ANTENNAS['random-wire-9to1'],
  ANTENNAS['mag-loop'],
  ANTENNAS['mobile-whip-20'],
  ANTENNAS['screwdriver-mobile'],
  ANTENNAS['yagi-3el-20'],
])

// ─── Public API ──────────────────────────────────────────────────────────────

/** Feedpoint impedance at one frequency. Never NaN, never a negative resistance. */
export const antennaImpedance = (
  id: AntennaId,
  freqHz: number,
  params: Record<string, number>,
): Complex => solve(id, freqHz, params).z

/** The default value of every parameter this antenna has. */
export const defaultParams = (id: AntennaId): Record<string, number> => {
  const out: Record<string, number> = {}
  for (const p of ANTENNAS[id].params) out[p.key] = p.default
  return out
}

/**
 * SWR against 50 ohms at `n` points from f0 to f1 inclusive. This is the plot
 * behind the sweep display, so it has to be cheap and it has to be smooth.
 */
export const antennaSwrSweep = (
  id: AntennaId,
  params: Record<string, number>,
  f0: number,
  f1: number,
  n: number,
): Float32Array => {
  const count = Math.max(1, Math.floor(n))
  const out = new Float32Array(count)
  if (count === 1) {
    out[0] = swrFromZ(antennaImpedance(id, f0, params))
    return out
  }
  const step = (f1 - f0) / (count - 1)
  for (let i = 0; i < count; i++) {
    out[i] = swrFromZ(antennaImpedance(id, f0 + step * i, params))
  }
  return out
}

/**
 * Frequencies between f0 and f1 where the antenna is resonant and usable: the
 * reactance passes through zero and the SWR is a local minimum there. The
 * second test matters, because a wire crosses zero reactance at its
 * anti-resonances too, and those are the worst places on the band.
 */
export const resonantFrequencies = (
  id: AntennaId,
  params: Record<string, number>,
  f0: number,
  f1: number,
): readonly number[] => {
  const lo = Math.max(Math.min(f0, f1), 1e5)
  const hi = Math.max(f0, f1)
  if (!(hi > lo)) return []
  const samples = 1200
  const step = (hi - lo) / samples
  const found: number[] = []
  let prevF = lo
  let prevX = antennaImpedance(id, lo, params).im
  for (let i = 1; i <= samples; i++) {
    const f = lo + step * i
    const x = antennaImpedance(id, f, params).im
    if ((prevX < 0 && x >= 0) || (prevX > 0 && x <= 0)) {
      // Bisect onto the crossing. 40 halvings takes a 25 kHz bracket below a
      // millihertz, which is far finer than anything downstream can show.
      let a = prevF
      let b = f
      const sign = prevX < 0 ? 1 : -1
      for (let j = 0; j < 40; j++) {
        const m = (a + b) / 2
        if (sign * antennaImpedance(id, m, params).im < 0) a = m
        else b = m
      }
      const fr = (a + b) / 2
      // Series resonance goes capacitive to inductive. A crossing the other way
      // is an anti-resonance, which is the worst place on the band, not the
      // best — unless it is already close to 50 ohms, which is how an
      // inductively coupled loop and an off-centre-fed wire present themselves.
      const s = swrFromZ(antennaImpedance(id, fr, params))
      if ((s < 3 || (sign > 0 && s < 10)) && found.length < 24) found.push(fr)
    }
    prevF = f
    prevX = x
  }
  return found
}

// ─── Extras ──────────────────────────────────────────────────────────────────

/**
 * What the impedance alone does not tell you. An antenna can read 1.1 to 1 and
 * still be throwing most of your power away as heat, and the app has to be able
 * to say so out loud.
 */
export interface AntennaExtras {
  /** Fraction of the power crossing the feedpoint that actually radiates, 0..1. */
  readonly efficiency: number
  /** Loaded Q at this frequency, from the reactance slope. Sharpness, not quality. */
  readonly qFactor: number
  /** One sentence naming the number that matters here. */
  readonly notes: string
}

export const antennaExtras = (
  id: AntennaId,
  freqHz: number,
  params: Record<string, number>,
): AntennaExtras => {
  const s = solve(id, freqHz, params)
  // Q from the reactance slope: Q = (f / 2R) |dX/df|. It is the general
  // definition and it works for a loop, a whip and a dipole without knowing
  // which one it is looking at.
  const df = Math.max(freqHz * 1e-5, 0.5)
  const xUp = antennaImpedance(id, freqHz + df, params).im
  const xDown = antennaImpedance(id, freqHz - df, params).im
  const slope = (xUp - xDown) / (2 * df)
  const r = Math.max(s.z.re, 1e-6)
  const q = (freqHz / (2 * r)) * Math.abs(slope)
  return {
    efficiency: s.efficiency,
    qFactor: Number.isFinite(q) ? clamp(q, 0, 1e6) : 0,
    notes: s.notes,
  }
}

/**
 * Peak current and voltage inside the antenna itself at a given delivered
 * power. For most antennas these are unremarkable; for a magnetic loop they are
 * the whole safety case, which is why they are exposed separately rather than
 * buried in a string.
 */
export const antennaStress = (
  id: AntennaId,
  freqHz: number,
  params: Record<string, number>,
  netW: number,
): { readonly circulatingCurrentA: number; readonly peakVoltageV: number } => {
  const s = solve(id, freqHz, params)
  const root = Math.sqrt(Math.max(netW, 0))
  return {
    circulatingCurrentA: s.currentPerRootWatt * root,
    peakVoltageV: s.voltsPerRootWatt * root,
  }
}
