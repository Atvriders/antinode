/**
 * Antinode — reflection, SWR and the figures derived from them.
 *
 * One idea underneath all of it: a load that is not Z0 sends part of the incident
 * wave back up the line. The complex reflection coefficient
 *
 *   Gamma = (ZL - Z0) / (ZL + Z0)
 *
 * carries both how much comes back (|Gamma|) and what it does to the voltage and
 * current standing on the line (arg Gamma). Every other number on this page is a
 * restatement of |Gamma|:
 *
 *   SWR            = (1 + |G|) / (1 - |G|)      voltage max / voltage min
 *   reflected      = |G|^2                      the fraction of power turned back
 *   return loss dB = -20 log10 |G|              reported positive, bigger is better
 *   mismatch loss  = -10 log10 (1 - |G|^2)      what is lost only if the source
 *                                               cannot re-reflect the returned power
 *
 * Mismatch loss is the number people misread. In a real transmitter the power that
 * comes back is not thrown away — it is re-reflected at the PA and most of it goes
 * out on the next pass. Mismatch loss is what you would lose into a perfectly
 * absorbing source. The loss that actually costs you is the extra I^2R and E^2/R
 * heating in the feedline, which lives in line.ts.
 *
 * Contract: nothing here returns NaN or Infinity, for any input, including a dead
 * short, an open circuit and a purely reactive load. Meters read numbers.
 */

import { C, cAbs, cAdd, cDiv, cScale, cSub } from './complex'
import type { Complex, MatchFigures } from './types'

/** Full-scale reading of the SWR meter. Real bridges peg somewhere well below this. */
const SWR_MAX = 999

/**
 * |Gamma| that produces exactly SWR_MAX: (1 + g)/(1 - g) = 999 at g = 998/1000.
 * Clamping on the coefficient rather than on the quotient keeps the last decade
 * of the scale monotonic instead of running into floating-point noise near g = 1.
 */
const GAMMA_AT_SWR_MAX = (SWR_MAX - 1) / (SWR_MAX + 1)

/**
 * Ceiling for the logarithmic figures, dB. A perfect match has infinite return
 * loss and a total reflection has infinite mismatch loss; neither belongs on a
 * meter, and 60 dB is already three orders of magnitude past anything a station
 * bridge can resolve.
 */
const DB_CEILING = 60

const DEFAULT_Z0 = 50

/** Reject a nonsensical system impedance rather than propagating it. */
const safeZ0 = (z0: number): number =>
  Number.isFinite(z0) && z0 > 0 ? z0 : DEFAULT_Z0

/**
 * Gamma at the load, referred to a real system impedance.
 *
 * We treat Z0 as purely real. For coax below 30 MHz the reactive part of Z0 is a
 * fraction of an ohm on a 50 ohm line and matters only for loss calculations.
 */
export const reflectionCoefficient = (zL: Complex, z0 = DEFAULT_Z0): Complex => {
  const r0 = safeZ0(z0)
  if (Number.isNaN(zL.re) || Number.isNaN(zL.im)) {
    // A load we cannot evaluate is an upstream bug, not a fault in the antenna.
    // Report it as matched so it cannot masquerade as a protection trip; callers
    // that care should test the impedance with cIsFinite first.
    return C(0, 0)
  }
  if (!Number.isFinite(zL.re) || !Number.isFinite(zL.im)) {
    // |ZL| -> infinity from any direction is an open circuit: everything comes
    // back in phase with the incident wave.
    return C(1, 0)
  }
  const num = cSub(zL, C(r0, 0))
  const den = cAdd(zL, C(r0, 0))
  if (den.re === 0 && den.im === 0) {
    // ZL = -Z0 exactly, the pole of the bilinear map. Only a negative-resistance
    // load reaches it, and reflection there is unbounded; report unit magnitude
    // in the numerator's direction so the derived figures peg instead of blowing up.
    const m = cAbs(num)
    return m === 0 ? C(0, 0) : cScale(num, 1 / m)
  }
  return cDiv(num, den)
}

/** SWR from |Gamma|, pegged at 999 rather than returning Infinity or NaN. */
export const swrFromGamma = (gammaMag: number): number => {
  // Written as `!(x > 0)` so NaN, -0 and negative magnitudes all land on 1:1.
  if (!(gammaMag > 0)) return 1
  if (gammaMag >= GAMMA_AT_SWR_MAX) return SWR_MAX
  const s = (1 + gammaMag) / (1 - gammaMag)
  return s > SWR_MAX ? SWR_MAX : s
}

/** Return loss in dB, reported positive: 20 dB return loss is a good match. */
export const returnLossDb = (gammaMag: number): number => {
  if (!(gammaMag > 0)) return DB_CEILING
  if (gammaMag >= 1) return 0
  const db = -20 * Math.log10(gammaMag)
  return db > DB_CEILING ? DB_CEILING : db
}

/**
 * Mismatch loss in dB: the share of forward power that does not enter the load
 * on the first pass. See the header — this is not the same as feedline loss.
 */
export const mismatchLossDb = (gammaMag: number): number => {
  if (!(gammaMag > 0)) return 0
  if (gammaMag >= 1) return DB_CEILING
  const transmitted = 1 - gammaMag * gammaMag
  if (transmitted <= 0) return DB_CEILING
  const db = -10 * Math.log10(transmitted)
  return db > DB_CEILING ? DB_CEILING : db < 0 ? 0 : db
}

/** The inverse of swrFromGamma, for reading a published SWR figure back into Gamma. */
export const gammaFromSwr = (swr: number): number => {
  if (!(swr > 1)) return 0
  if (!Number.isFinite(swr)) return 1
  return (swr - 1) / (swr + 1)
}

/** Every figure derived from one load impedance, computed once. */
export const matchFigures = (zL: Complex, z0 = DEFAULT_Z0): MatchFigures => {
  const gamma = reflectionCoefficient(zL, z0)
  const raw = cAbs(gamma)
  const gammaMag = !(raw > 0) ? 0 : raw > 1 ? 1 : raw
  return {
    gamma,
    gammaMag,
    swr: swrFromGamma(gammaMag),
    returnLossDb: returnLossDb(gammaMag),
    mismatchLossDb: mismatchLossDb(gammaMag),
    reflectedFraction: gammaMag * gammaMag,
  }
}

/** SWR straight from an impedance, for the many callers that want only that. */
export const swrFromZ = (zL: Complex, z0 = DEFAULT_Z0): number =>
  swrFromGamma(cAbs(reflectionCoefficient(zL, z0)))

/**
 * Split forward power into the part that comes back and the part that goes on.
 * `netW` is what a directional wattmeter calls "forward minus reflected"; on a
 * lossless line it is the power actually delivered to the load.
 */
export const powerSplit = (
  forwardW: number,
  gammaMag: number,
): { reflectedW: number; netW: number } => {
  const p = Number.isFinite(forwardW) && forwardW > 0 ? forwardW : 0
  const g = !(gammaMag > 0) ? 0 : gammaMag > 1 ? 1 : gammaMag
  const reflectedW = p * g * g
  return { reflectedW, netW: p - reflectedW }
}
