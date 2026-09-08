/**
 * Antinode — the lossy transmission line.
 *
 * This is the module that surprises people. A feedline is not a piece of wire
 * that carries power to the antenna; it is a medium in which two waves travel in
 * opposite directions, and what the radio sees is the interference pattern
 * between them measured at one particular point.
 *
 * The whole model is three lines of algebra:
 *
 *   gamma = alpha + j*beta            propagation constant, per metre
 *   Zin   = Z0 (ZL + Z0 tanh(gamma l)) / (Z0 + ZL tanh(gamma l))
 *   G(d)  = G_load * exp(-2 gamma d)  reflection coefficient d metres back from the load
 *
 * The tanh form is the lossy generalisation of the familiar j*tan() textbook
 * result. Setting alpha to zero recovers it exactly. We never do that here,
 * because loss is precisely what makes a high SWR expensive, and it is also what
 * makes a long run of bad coax read 1.5:1 at the radio while the antenna is a
 * disaster. Both of those are teaching points.
 *
 * Sign convention: d is measured from the LOAD (the antenna) back toward the
 * source (the radio). positions[0] is the antenna, positions[n-1] is the radio.
 */

import {
  C, cAbs, cAdd, cDiv, cExp, cIsFinite, cMul, cScale, cSub, cTanh,
} from './complex'
import {
  alphaNepersPerM, betaRadPerM, matchedLossDb as matchedLossOfLine, wavelengthM,
} from './cables'
import { reflectionCoefficient } from './match'
import type { CableDef, Complex, LineResult, StandingWaveProfile } from './types'

/** 1 + j0, used often enough to be worth naming. */
const ONE: Complex = { re: 1, im: 0 }

/**
 * Cap on the real part of gamma*l before tanh. 30 nepers is 260 dB of one-way
 * loss: the line is a black hole and tanh has been 1.0 to the last bit of a
 * double for a long time already. The cap only exists so that an absurd length
 * from a slider cannot produce Infinity/Infinity.
 */
const MAX_NEPERS = 30

/** Largest load magnitude we will carry, ohms. An open circuit, near enough. */
const MAX_LOAD_OHM = 1e9

/**
 * Keep the load finite and passive. Antenna models return sane numbers, but a
 * resonance solver can hand back a huge reactance, and a negative resistance
 * would make the line generate power. Clamp rather than throw: this module is
 * called every frame.
 */
const sanitiseLoad = (zL: Complex): Complex => {
  const re = Number.isFinite(zL.re) ? Math.max(0, zL.re) : MAX_LOAD_OHM
  const im = Number.isFinite(zL.im) ? zL.im : 0
  const mag = Math.hypot(re, im)
  if (mag > MAX_LOAD_OHM) {
    const k = MAX_LOAD_OHM / mag
    return C(re * k, im * k)
  }
  return C(re, im)
}

/** gamma * l, with the real part capped so exp() cannot overflow. */
const gammaLength = (cable: CableDef, freqHz: number, lengthM: number): Complex => {
  const l = Number.isFinite(lengthM) ? Math.max(0, lengthM) : 0
  const a = alphaNepersPerM(cable, freqHz) * l
  const b = betaRadPerM(cable, freqHz) * l
  return C(Math.min(a, MAX_NEPERS), Number.isFinite(b) ? b : 0)
}

/**
 * Impedance looking into `lengthM` of `cable` terminated in `zL`.
 *
 * Two behaviours worth watching for on screen: a half wavelength repeats the
 * load (tanh of j*pi is zero), and a quarter wavelength inverts it about Z0
 * (Zin -> Z0^2 / ZL). Both are exact only on a lossless line; here the loss
 * drags every answer a little way toward Z0, which is the honest picture.
 */
export const lineInputImpedance = (
  zL: Complex,
  cable: CableDef,
  freqHz: number,
  lengthM: number,
): Complex => {
  const load = sanitiseLoad(zL)
  if (!Number.isFinite(lengthM) || lengthM <= 0) return load

  const z0 = C(Math.max(1e-6, cable.z0), 0)
  const t = cTanh(gammaLength(cable, freqHz, lengthM))
  const num = cAdd(load, cMul(z0, t))
  const den = cAdd(z0, cMul(load, t))
  const zIn = cMul(z0, cDiv(num, den))

  // A line long enough to swallow the reflection presents its own Z0. That is
  // also the only sensible answer if the arithmetic degenerated.
  return cIsFinite(zIn) ? zIn : z0
}

/**
 * Extra loss caused by standing waves, dB. Add it to the matched loss to get the
 * real loss of the run.
 *
 * Derivation, with a = 10^(matchedLossDb/10), the one-way matched power ratio,
 * and G the reflection coefficient magnitude at the load:
 *
 *   forward wave reaches the load attenuated by 1/sqrt(a)
 *   the reflected wave comes back attenuated by 1/sqrt(a) again
 *   power into the line  = |Vf|^2 (1 - G^2/a^2) / Z0
 *   power into the load  = |Vf|^2 (1 - G^2) / (a Z0)
 *   total loss           = (a^2 - G^2) / (a (1 - G^2))
 *
 * Two sanity points. With 1 dB of matched loss and a 3:1 load SWR the extra loss
 * is 0.50 dB, which is what the additional-loss chart in the ARRL Antenna Book
 * reads. With 3 dB of matched loss and the same 3:1 SWR the total is 3.97 dB.
 *
 * Note that a truly lossless line has no extra loss at any SWR: the reflected
 * power goes back to the source, it is not burned in the cable. Reflection is
 * not loss. Loss times reflection is loss.
 */
export const excessLossDb = (matchedLossDb: number, swrAtLoad: number): number => {
  if (!Number.isFinite(matchedLossDb) || matchedLossDb <= 0) return 0
  const swr = Number.isFinite(swrAtLoad) ? Math.max(1, swrAtLoad) : 1
  const g = (swr - 1) / (swr + 1)
  const g2 = g * g
  const a = Math.pow(10, matchedLossDb / 10)
  const denom = a * (1 - g2)
  if (!(denom > 0)) return 0
  const totalDb = 10 * Math.log10((a * a - g2) / denom)
  if (!Number.isFinite(totalDb)) return 0
  return Math.max(0, totalDb - matchedLossDb)
}

/** Everything the UI needs to know about one length of feedline at one frequency. */
export const solveLine = (
  zL: Complex,
  cable: CableDef,
  freqHz: number,
  lengthM: number,
): LineResult => {
  const load = sanitiseLoad(zL)
  const l = Number.isFinite(lengthM) ? Math.max(0, lengthM) : 0

  const matched = matchedLossOfLine(cable, freqHz, l)
  // The reflection is converted to an SWR here rather than through
  // swrFromGamma, which is a METER function and pegs at 999. Feeding a pegged
  // reading into the loss formula caps the reported feedline loss and makes a
  // catastrophic mismatch look merely bad: an open feedline reported 5.1 dB of
  // excess loss where the exact solution is 12.3 dB.
  const gAtLoad = Math.min(1 - 1e-12, cAbs(reflectionCoefficient(load, cable.z0)))
  const excess = excessLossDb(matched, (1 + gAtLoad) / (1 - gAtLoad))

  const lambda = wavelengthM(freqHz, cable.vf)
  const lengthWaves = Number.isFinite(lambda) && lambda > 0 ? l / lambda : 0

  return {
    zIn: lineInputImpedance(load, cable, freqHz, l),
    matchedLossDb: matched,
    totalLossDb: matched + excess,
    excessLossDb: excess,
    lengthWaves,
    alpha: alphaNepersPerM(cable, freqHz),
    beta: betaRadPerM(cable, freqHz),
  }
}

/** At least 2 samples, and a sane ceiling so a bad caller cannot allocate a GB. */
const clampSamples = (n: number): number => {
  if (!Number.isFinite(n)) return 256
  return Math.min(8192, Math.max(2, Math.floor(n)))
}

/**
 * Interior local extrema of a sampled curve, refined to sub-sample resolution by
 * fitting a parabola through the three points around each turning point.
 *
 * Without the refinement an antinode can only ever land on a sample, and with
 * 256 samples over a 30 m line that is a 12 cm quantisation — enough to make a
 * half-wavelength spacing check look wrong when the physics is right.
 *
 * Endpoints are deliberately excluded. The maximum at an open-circuit load sits
 * exactly at d = 0, and we have no sample on the far side of it to confirm it is
 * a turning point rather than the end of the data.
 */
const findExtrema = (
  values: readonly number[],
  positions: readonly number[],
  wantMaxima: boolean,
): number[] => {
  const out: number[] = []
  if (values.length < 3) return out
  const step = (positions[1] ?? 0) - (positions[0] ?? 0)

  for (let i = 1; i < values.length - 1; i += 1) {
    const y0 = values[i - 1] ?? 0
    const y1 = values[i] ?? 0
    const y2 = values[i + 1] ?? 0
    // Strict on one side, loose on the other, so a flat top is reported once.
    const isTurning = wantMaxima ? y1 > y0 && y1 >= y2 : y1 < y0 && y1 <= y2
    if (!isTurning) continue

    const curvature = y0 - 2 * y1 + y2
    let offset = curvature === 0 ? 0 : (0.5 * (y0 - y2)) / curvature
    if (!Number.isFinite(offset) || Math.abs(offset) > 0.5) offset = 0
    const p = (positions[i] ?? 0) + offset * step
    out.push(Math.min(1, Math.max(0, p)))
  }
  return out
}

/**
 * Sample |V| and |I| along the line so the 3D layer can draw the standing wave.
 *
 * The forward wave amplitude is anchored at the radio end, where forwardW watts
 * are entering the cable, so Vf = sqrt(2 * P * Z0): 100 W into 50 ohm is 100 V
 * peak and 2 A peak. Everything else follows from
 *
 *   V(d) = Vf(d) (1 + G(d))      I(d) = (Vf(d)/Z0) (1 - G(d))
 *
 * with the plus and the minus being the whole point. Voltage and current peak in
 * different places, a quarter wavelength apart. A voltage antinode is a current
 * node. That is what melts a tuner capacitor in one spot and a coil in another.
 *
 * vMag and iMag are each normalised to their own maximum so a shader can use
 * them directly; the real numbers are reported as vPeakVolts and iPeakAmps.
 */
export const standingWaveProfile = (args: {
  zL: Complex
  cable: CableDef
  freqHz: number
  lengthM: number
  forwardW: number
  samples?: number
}): StandingWaveProfile => {
  const samples = clampSamples(args.samples ?? 256)
  const cable = args.cable
  const z0 = Math.max(1e-6, cable.z0)
  const lengthM = Number.isFinite(args.lengthM) ? Math.max(0, args.lengthM) : 0
  const forwardW = Number.isFinite(args.forwardW) ? Math.max(0, args.forwardW) : 0
  const alpha = alphaNepersPerM(cable, args.freqHz)
  const beta = betaRadPerM(cable, args.freqHz)

  const positions = new Float32Array(samples)
  const vMag = new Float32Array(samples)
  const iMag = new Float32Array(samples)
  const phase = new Float32Array(samples)

  const pos: number[] = new Array<number>(samples)
  for (let i = 0; i < samples; i += 1) {
    const p = i / (samples - 1)
    pos[i] = p
    positions[i] = p
    // Phase of the forward wave relative to the radio end. It lags as the wave
    // travels out to the antenna, so this runs from -beta*l up to 0. Left
    // unwrapped on purpose: adjacent samples can then be interpolated linearly.
    phase[i] = -beta * lengthM * (1 - p)
  }

  // No drive, no wave. Return zeros rather than 0/0.
  if (forwardW <= 0) {
    return {
      positions, vMag, iMag, phase,
      antinodes: Object.freeze([]),
      nodes: Object.freeze([]),
      vPeakVolts: 0,
      iPeakAmps: 0,
    }
  }

  // A passive load cannot send back more than it received, so |G| <= 1. The
  // clamp matters: the reflected wave grows as exp(+alpha*d) going back toward
  // the source, and |G| > 1 would make it grow without bound.
  let gLoad = reflectionCoefficient(sanitiseLoad(args.zL), z0)
  if (!cIsFinite(gLoad)) {
    gLoad = C(1, 0)
  } else {
    const mag = cAbs(gLoad)
    if (mag > 1) gLoad = cScale(gLoad, 1 / mag)
  }

  const vfInput = Math.sqrt(2 * forwardW * z0)

  const vAbs: number[] = new Array<number>(samples)
  const iAbs: number[] = new Array<number>(samples)
  let vMax = 0
  let iMax = 0

  for (let i = 0; i < samples; i += 1) {
    const d = (pos[i] ?? 0) * lengthM
    const travelled = lengthM - d

    // Forward wave at this point, referenced to the radio end.
    const vf = cScale(cExp(C(-alpha * travelled, -beta * travelled)), vfInput)
    // Reflection coefficient seen d metres back from the load: two trips of loss
    // and two trips of phase, which is why the pattern washes out on bad coax.
    const gd = cMul(gLoad, cExp(C(-2 * alpha * d, -2 * beta * d)))

    const v = cAbs(cMul(vf, cAdd(ONE, gd)))
    const iA = cAbs(cMul(vf, cSub(ONE, gd))) / z0
    const vSafe = Number.isFinite(v) ? v : 0
    const iSafe = Number.isFinite(iA) ? iA : 0

    vAbs[i] = vSafe
    iAbs[i] = iSafe
    if (vSafe > vMax) vMax = vSafe
    if (iSafe > iMax) iMax = iSafe
  }

  const vScale = vMax > 0 ? 1 / vMax : 0
  const iScale = iMax > 0 ? 1 / iMax : 0
  for (let i = 0; i < samples; i += 1) {
    vMag[i] = (vAbs[i] ?? 0) * vScale
    iMag[i] = (iAbs[i] ?? 0) * iScale
  }

  return {
    positions,
    vMag,
    iMag,
    phase,
    antinodes: Object.freeze(findExtrema(vAbs, pos, true)),
    nodes: Object.freeze(findExtrema(vAbs, pos, false)),
    vPeakVolts: vMax,
    iPeakAmps: iMax,
  }
}
