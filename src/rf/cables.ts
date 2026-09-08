/**
 * Antinode — feedline catalogue and matched-loss model.
 *
 * A coaxial line loses power two ways, and they scale differently with frequency:
 *
 *   Conductor loss  — RF rides in a skin depth that thins as 1/sqrt(f), so the
 *                     effective resistance of the copper rises as sqrt(f).
 *   Dielectric loss — the polyethylene between the conductors is being flexed by
 *                     the field; that loss is proportional to f.
 *
 * Add them and you get the two-term fit every cable manufacturer publishes:
 *
 *   loss (dB per 100 ft) = k1 * sqrt(fMHz) + k2 * fMHz
 *
 * Times Microwave prints exactly this form on the LMR datasheets. For the older
 * RG types we fit k1 and k2 to the published attenuation tables; the tables and
 * the resulting errors are written out below so a reader can check the work
 * without leaving the file.
 *
 * dB per 100 ft is an awkward unit to carry around, but it is the unit every
 * published table uses, so it is the unit we fit in. Everything downstream works
 * in nepers per metre. Length is metres everywhere in this codebase.
 */

import type { CableDef, CableId } from './types'

/** 100 feet in metres, exactly. Cable tables are per 100 ft; we store metres. */
const HUNDRED_FEET_M = 30.48

/**
 * dB per neper. A neper is one e-fold of amplitude, so 20*log10(e) dB.
 * Written out rather than computed so the constant is greppable.
 */
const DB_PER_NEPER = 8.685889638

/** Speed of light in vacuum, m/s (SI definition). */
const C_M_PER_S = 299792458

/**
 * Keep vf strictly inside (0, 1]. No signal travels faster than light, and a
 * zero would divide by zero downstream. This guards against a bad slider value
 * rather than against anything in CABLES.
 */
const clampVf = (vf: number): number => {
  if (!Number.isFinite(vf)) return 1
  return Math.min(1, Math.max(1e-3, vf))
}

/*
 * ── Published matched-loss tables, dB per 100 ft ─────────────────────────────
 *
 * RG-58C/U (braid, solid polyethylene, VF 0.66)
 *   MHz      1     10     50    100    200
 *   pub   0.44   1.40   3.30   4.90   7.40      (RF Elektronik compilation of the
 *   fit   0.43   1.41   3.34   4.91   7.33       RG/U attenuation table, row
 *   err  -1.5%  +1.0%  +1.2%  +0.3%  -1.0%       "58A,58C"; agrees with W4RP)
 *
 * RG-8X "mini-8" (braid, foam polyethylene, VF 0.82)
 *   MHz      1     10     50    100    200
 *   pub   0.30   1.00   2.50   3.60   5.20      (Belden 9258 class; the same
 *   fit   0.31   1.00   2.40   3.55   5.35       10/50/100/200 MHz figures appear
 *   err  +1.9%  +0.4%  -4.1%  -1.3%  +2.8%       in the W4RP and RF Elektronik
 *                                                 charts. The 1 MHz entry in the
 *   W4RP chart, 0.5 dB, is not self-consistent: it is larger than RG-58 at the
 *   same frequency and larger than sqrt-law scaling from its own 10 MHz value.
 *   We fit the self-consistent 0.30 dB instead and flag the cable representative.)
 *
 * RG-213/U (braid, solid polyethylene, VF 0.66)
 *   MHz      1     10     50    100    200
 *   pub   0.17   0.55   1.30   1.90   2.70      (RG/U attenuation table row
 *   fit   0.17   0.55   1.29   1.87   2.74       "8,8A,10A,213"; matches the
 *   err  +0.6%  +0.5%  -1.2%  -1.7%  +1.6%       Belden 8267 datasheet)
 *
 * LMR-400 (Times Microwave). The datasheet gives the fit directly:
 *   loss dB/100 ft = 0.122290*sqrt(fMHz) + 0.000260*fMHz, VF 85%, Z0 50 ohm.
 *   MHz     30     50    150    450    900
 *   pub    0.7    0.9    1.5    2.7    3.9   (datasheet table, 1 decimal place)
 *   fit   0.68   0.88   1.54   2.71   3.90
 *
 * 450 ohm window line (Wireman #551 class, VF 0.915)
 *   Confirmed anchor: 0.095 dB per 100 ft at 1.83 MHz, R0 = 402.75 ohm, VF 0.915
 *   — N6BV's worked example, quoted by S. Stearns K6OIK, "Transmission Line Loss",
 *   ARRL Pacificon Antenna Seminar 2014. We hold that point exactly and carry a
 *   small dielectric term for the vinyl webbing, which gives roughly 0.24 dB at
 *   10 MHz and 0.60 dB at 50 MHz. Only the 1.83 MHz point is sourced; the rest of
 *   the curve is representative.
 *
 * All five entries carry an honest caveat in `note`. Real cable varies by
 * manufacturer, age, and how wet it is, easily by 10 to 20 percent.
 */

export const CABLES: Readonly<Record<CableId, CableDef>> = Object.freeze({
  rg58: {
    id: 'rg58',
    name: 'RG-58C/U',
    z0: 50,
    vf: 0.66,
    k1: 0.42682,
    k2: 0.006443,
    powerRatingW: 500,
    note:
      'Thin, cheap, and lossy. Fine for a patch lead on the bench, expensive on a '
      + 'long run. Loss fit to the published RG-58C/U table; power rating representative.',
  },
  rg8x: {
    id: 'rg8x',
    name: 'RG-8X (foam)',
    z0: 50,
    vf: 0.82,
    k1: 0.30014,
    k2: 0.005508,
    powerRatingW: 800,
    note:
      'The usual compromise: half the loss of RG-58 in a cable you can still coil. '
      + 'Foam dielectric, so it deforms if you crush it. Loss fit representative.',
  },
  rg213: {
    id: 'rg213',
    name: 'RG-213/U',
    z0: 50,
    vf: 0.66,
    k1: 0.16932,
    k2: 0.001747,
    powerRatingW: 1800,
    note:
      'The default HF feedline. Solid polyethylene, so it survives being stepped on. '
      + 'Loss fit to the published RG-213 table; power rating representative.',
  },
  lmr400: {
    id: 'lmr400',
    name: 'LMR-400',
    z0: 50,
    vf: 0.85,
    k1: 0.12229,
    k2: 0.00026,
    powerRatingW: 3330,
    note:
      'Foil-and-braid shield over foam, about a third the loss of RG-213. Loss '
      + 'coefficients and 30 MHz power rating are from the Times Microwave datasheet.',
  },
  ladder450: {
    id: 'ladder450',
    name: '450 ohm window line',
    z0: 450,
    vf: 0.91,
    k1: 0.0668,
    k2: 0.0025,
    powerRatingW: 3000,
    note:
      'Two wires in air. Almost no loss, and because Z0 is 450 ohm a 4:1 mismatch '
      + 'costs almost nothing. Needs a tuner and a balun. Loss above 2 MHz is representative.',
  },
})

export const CABLE_LIST: readonly CableDef[] = Object.freeze([
  CABLES.rg58,
  CABLES.rg8x,
  CABLES.rg213,
  CABLES.lmr400,
  CABLES.ladder450,
])

/**
 * Matched loss of the cable, dB per 100 ft, at one frequency.
 *
 * "Matched" means terminated in its own Z0, so there is no reflected wave and
 * this is the least loss the cable can ever have. Everything else adds to it.
 */
export const matchedLossDbPer100ft = (cable: CableDef, freqHz: number): number => {
  if (!Number.isFinite(freqHz) || freqHz <= 0) return 0
  const fMhz = freqHz / 1e6
  return cable.k1 * Math.sqrt(fMhz) + cable.k2 * fMhz
}

/** Matched loss of a real length of that cable, dB. */
export const matchedLossDb = (cable: CableDef, freqHz: number, lengthM: number): number => {
  if (!Number.isFinite(lengthM) || lengthM <= 0) return 0
  return matchedLossDbPer100ft(cable, freqHz) * (lengthM / HUNDRED_FEET_M)
}

/**
 * Attenuation constant, nepers per metre.
 *
 * The exponential in the line equations is written in nepers, so the published
 * dB figure has to be divided by 20*log10(e). Do this once, here.
 */
export const alphaNepersPerM = (cable: CableDef, freqHz: number): number =>
  matchedLossDbPer100ft(cable, freqHz) / HUNDRED_FEET_M / DB_PER_NEPER

/**
 * Phase constant, radians per metre.
 *
 * The wave travels at vf times the speed of light, so a metre of cable is
 * electrically longer than a metre of free space by 1/vf. This is why a
 * half-wave of RG-213 is 6.97 m at 14.2 MHz and not 10.56 m.
 */
export const betaRadPerM = (cable: CableDef, freqHz: number): number => {
  if (!Number.isFinite(freqHz) || freqHz <= 0) return 0
  const vf = clampVf(cable.vf)
  return (2 * Math.PI * freqHz) / (vf * C_M_PER_S)
}

/** Wavelength in a medium of velocity factor vf, metres. Infinite at DC. */
export const wavelengthM = (freqHz: number, vf: number): number => {
  if (!Number.isFinite(freqHz) || freqHz <= 0) return Number.POSITIVE_INFINITY
  return (clampVf(vf) * C_M_PER_S) / freqHz
}
