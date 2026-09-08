/**
 * Feedline catalogue tests.
 *
 * The point of these is not that the code runs, it is that the curve fit still
 * agrees with the manufacturers' published attenuation tables. If someone
 * retunes k1 or k2 to make a demo look better, these fail.
 *
 * Published figures and their sources are documented in src/rf/cables.ts.
 */

import { describe, expect, it } from 'vitest'
import {
  CABLES, CABLE_LIST, alphaNepersPerM, betaRadPerM, matchedLossDb,
  matchedLossDbPer100ft, wavelengthM,
} from '../src/rf/cables'
import type { CableDef, CableId } from '../src/rf/types'

const MHZ = 1e6
const HUNDRED_FEET_M = 30.48
const DB_PER_NEPER = 8.685889638
const C_M_PER_S = 299792458

/** Fractional error of a model value against a published one. */
const relErr = (model: number, published: number): number =>
  Math.abs(model - published) / published

/**
 * Published matched loss, dB per 100 ft, keyed by frequency in MHz.
 * Tolerance is 5 percent, which is inside the spread between sources and well
 * inside the spread between two drums of real cable.
 */
const PUBLISHED: Readonly<Record<CableId, ReadonlyArray<readonly [number, number]>>> = {
  // RG-58C/U, RG/U attenuation table (row "58A,58C"), corroborated by W4RP.
  rg58: [[1, 0.44], [10, 1.40], [50, 3.30], [100, 4.90], [200, 7.40]],
  // RG-8X foam, Belden 9258 class. See the note in cables.ts about the 1 MHz entry.
  rg8x: [[1, 0.30], [10, 1.00], [50, 2.50], [100, 3.60], [200, 5.20]],
  // RG-213/U, RG/U attenuation table (row "8,8A,10A,213"), matches Belden 8267.
  rg213: [[1, 0.17], [10, 0.55], [50, 1.30], [100, 1.90], [200, 2.70]],
  // Times Microwave LMR-400 datasheet table (printed to one decimal place).
  lmr400: [[30, 0.7], [50, 0.9], [150, 1.5], [450, 2.7], [900, 3.9]],
  // Wireman #551 450 ohm window line, N6BV worked example via K6OIK.
  ladder450: [[1.83, 0.095]],
}

const HAM_FREQS_MHZ = [1.8, 3.5, 7, 14, 21, 28, 50] as const

describe('cable catalogue', () => {
  it('lists every cable exactly once', () => {
    expect(CABLE_LIST).toHaveLength(5)
    const ids = CABLE_LIST.map((c) => c.id)
    expect(new Set(ids).size).toBe(5)
    expect(ids).toEqual(['rg58', 'rg8x', 'rg213', 'lmr400', 'ladder450'])
  })

  it('keys the record by the cable id it contains', () => {
    for (const cable of CABLE_LIST) {
      expect(CABLES[cable.id]).toBe(cable)
      expect(CABLES[cable.id].id).toBe(cable.id)
    }
  })

  it('carries the published characteristic impedances', () => {
    expect(CABLES.rg58.z0).toBe(50)
    expect(CABLES.rg8x.z0).toBe(50)
    expect(CABLES.rg213.z0).toBe(50)
    expect(CABLES.lmr400.z0).toBe(50)
    expect(CABLES.ladder450.z0).toBe(450)
  })

  it('carries the published velocity factors', () => {
    expect(CABLES.rg58.vf).toBeCloseTo(0.66, 3)
    expect(CABLES.rg8x.vf).toBeCloseTo(0.82, 3)
    expect(CABLES.rg213.vf).toBeCloseTo(0.66, 3)
    expect(CABLES.lmr400.vf).toBeCloseTo(0.85, 3)
    expect(CABLES.ladder450.vf).toBeCloseTo(0.91, 3)
    for (const cable of CABLE_LIST) {
      expect(cable.vf).toBeGreaterThan(0)
      expect(cable.vf).toBeLessThanOrEqual(1)
    }
  })

  it('quotes a positive power rating and a note for every cable', () => {
    for (const cable of CABLE_LIST) {
      expect(cable.powerRatingW).toBeGreaterThan(0)
      expect(cable.note.length).toBeGreaterThan(20)
    }
  })
})

describe('matched loss against published tables', () => {
  for (const cable of CABLE_LIST) {
    const rows = PUBLISHED[cable.id]
    it(`${cable.name} is within 5 percent of the published table`, () => {
      for (const row of rows) {
        const fMhz = row[0]
        const published = row[1]
        const model = matchedLossDbPer100ft(cable, fMhz * MHZ)
        expect(relErr(model, published)).toBeLessThan(0.05)
      }
    })
  }

  it('rises monotonically with frequency across the HF and 6 m bands', () => {
    for (const cable of CABLE_LIST) {
      let previous = 0
      for (const fMhz of HAM_FREQS_MHZ) {
        const loss = matchedLossDbPer100ft(cable, fMhz * MHZ)
        expect(loss).toBeGreaterThan(previous)
        previous = loss
      }
    }
  })

  it('ranks the cables the way the catalogue does at 14.2 MHz', () => {
    const f = 14.2 * MHZ
    const loss = (c: CableDef): number => matchedLossDbPer100ft(c, f)
    expect(loss(CABLES.ladder450)).toBeLessThan(loss(CABLES.lmr400))
    expect(loss(CABLES.lmr400)).toBeLessThan(loss(CABLES.rg213))
    expect(loss(CABLES.rg213)).toBeLessThan(loss(CABLES.rg8x))
    expect(loss(CABLES.rg8x)).toBeLessThan(loss(CABLES.rg58))
  })

  it('puts RG-58 at roughly 1.7 dB and RG-213 at roughly 0.66 dB per 100 ft on 20 m', () => {
    const f = 14.2 * MHZ
    expect(matchedLossDbPer100ft(CABLES.rg58, f)).toBeCloseTo(1.70, 1)
    expect(matchedLossDbPer100ft(CABLES.rg213, f)).toBeCloseTo(0.66, 1)
  })
})

describe('length and unit conversion', () => {
  it('makes 100 ft of cable lose exactly the per-100-ft figure', () => {
    for (const cable of CABLE_LIST) {
      const f = 7.15 * MHZ
      expect(matchedLossDb(cable, f, HUNDRED_FEET_M))
        .toBeCloseTo(matchedLossDbPer100ft(cable, f), 10)
    }
  })

  it('scales loss linearly with length', () => {
    const f = 21.2 * MHZ
    const single = matchedLossDb(CABLES.rg213, f, 12)
    expect(matchedLossDb(CABLES.rg213, f, 24)).toBeCloseTo(2 * single, 10)
    expect(matchedLossDb(CABLES.rg213, f, 120)).toBeCloseTo(10 * single, 10)
    expect(matchedLossDb(CABLES.rg213, f, 0)).toBe(0)
    expect(matchedLossDb(CABLES.rg213, f, -5)).toBe(0)
  })

  it('converts dB per 100 ft into nepers per metre consistently', () => {
    const f = 28.4 * MHZ
    for (const cable of CABLE_LIST) {
      const fromAlpha = alphaNepersPerM(cable, f) * HUNDRED_FEET_M * DB_PER_NEPER
      expect(fromAlpha).toBeCloseTo(matchedLossDbPer100ft(cable, f), 10)
    }
  })

  it('gives one full turn of phase per wavelength', () => {
    const f = 14.2 * MHZ
    for (const cable of CABLE_LIST) {
      const lambda = wavelengthM(f, cable.vf)
      expect(betaRadPerM(cable, f) * lambda).toBeCloseTo(2 * Math.PI, 9)
    }
  })

  it('shortens the wavelength by the velocity factor', () => {
    const f = 14.2 * MHZ
    const free = C_M_PER_S / f
    expect(wavelengthM(f, 1)).toBeCloseTo(free, 6)
    expect(wavelengthM(f, CABLES.rg213.vf)).toBeCloseTo(free * 0.66, 6)
    // The half wave of RG-213 that every ham has cut at least once.
    expect(wavelengthM(f, CABLES.rg213.vf) / 2).toBeCloseTo(6.967, 2)
    expect(wavelengthM(f, CABLES.ladder450.vf)).toBeGreaterThan(
      wavelengthM(f, CABLES.rg58.vf),
    )
  })
})

describe('degenerate inputs', () => {
  it('returns zero loss and zero phase constant at DC', () => {
    for (const cable of CABLE_LIST) {
      expect(matchedLossDbPer100ft(cable, 0)).toBe(0)
      expect(betaRadPerM(cable, 0)).toBe(0)
      expect(matchedLossDb(cable, 0, 30)).toBe(0)
    }
  })

  it('does not return NaN for negative or non-finite frequency', () => {
    for (const cable of CABLE_LIST) {
      expect(matchedLossDbPer100ft(cable, -1e6)).toBe(0)
      expect(matchedLossDbPer100ft(cable, Number.NaN)).toBe(0)
      expect(alphaNepersPerM(cable, Number.NaN)).toBe(0)
      expect(Number.isFinite(betaRadPerM(cable, Number.NaN))).toBe(true)
    }
  })

  it('treats DC as an infinitely long wave rather than a division by zero', () => {
    expect(wavelengthM(0, 0.66)).toBe(Number.POSITIVE_INFINITY)
    expect(wavelengthM(-1, 0.66)).toBe(Number.POSITIVE_INFINITY)
    expect(Number.isFinite(wavelengthM(14e6, 0))).toBe(true)
  })
})
