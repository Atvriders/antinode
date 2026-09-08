import { describe, expect, it } from 'vitest'

import { BANDS, RX_RANGE_HZ, bandForFreq, clampToRadioRange, inHamBand } from '../src/rf/bands'
import type { BandId } from '../src/rf/types'

const ALL_IDS: readonly BandId[] = [
  '160m', '80m', '60m', '40m', '30m', '20m', '17m', '15m', '12m', '10m', '6m',
]

describe('the band table', () => {
  it('has the eleven bands an IC-7300 transmits on, in frequency order', () => {
    expect(BANDS.length).toBe(11)
    expect(BANDS.map((b) => b.id)).toEqual(ALL_IDS)
  })

  it('carries the US allocation edges in Hz', () => {
    const edges: Readonly<Record<string, readonly [number, number]>> = {
      '160m': [1_800_000, 2_000_000],
      '80m': [3_500_000, 4_000_000],
      '60m': [5_330_000, 5_405_000],
      '40m': [7_000_000, 7_300_000],
      '30m': [10_100_000, 10_150_000],
      '20m': [14_000_000, 14_350_000],
      '17m': [18_068_000, 18_168_000],
      '15m': [21_000_000, 21_450_000],
      '12m': [24_890_000, 24_990_000],
      '10m': [28_000_000, 29_700_000],
      '6m': [50_000_000, 54_000_000],
    }
    for (const band of BANDS) {
      const pair = edges[band.id] ?? [0, 0]
      expect([band.startHz, band.endHz]).toEqual([pair[0], pair[1]])
    }
  })

  it('stores frequencies in Hz, never MHz', () => {
    // The cheapest possible guard against someone typing 14.2 for 20 m.
    for (const band of BANDS) {
      expect(band.startHz).toBeGreaterThan(1_000_000)
      expect(Number.isInteger(band.startHz)).toBe(true)
      expect(Number.isInteger(band.endHz)).toBe(true)
    }
  })

  it('puts every default dial frequency inside its own band', () => {
    for (const band of BANDS) {
      expect(band.defaultHz).toBeGreaterThanOrEqual(band.startHz)
      expect(band.defaultHz).toBeLessThanOrEqual(band.endHz)
      expect(bandForFreq(band.defaultHz)?.id).toBe(band.id)
    }
  })

  it('never overlaps and always ascends', () => {
    for (let i = 0; i < BANDS.length; i += 1) {
      const band = BANDS[i]
      if (band === undefined) throw new Error('band table has a hole')
      expect(band.startHz).toBeLessThan(band.endHz)
      const next = BANDS[i + 1]
      if (next !== undefined) expect(next.startHz).toBeGreaterThan(band.endHz)
    }
  })

  it('uses the conventional sideband for each band', () => {
    // Below 10 MHz is LSB by convention, above it is USB. 60 m is the exception:
    // USB is required there by rule, and 30 m has no phone at all.
    const modes = new Map(BANDS.map((b) => [b.id, b.voiceMode]))
    expect(modes.get('160m')).toBe('LSB')
    expect(modes.get('80m')).toBe('LSB')
    expect(modes.get('40m')).toBe('LSB')
    expect(modes.get('60m')).toBe('USB')
    expect(modes.get('30m')).toBe('CW')
    expect(modes.get('20m')).toBe('USB')
    expect(modes.get('6m')).toBe('USB')
  })

  it('says on the label that 60 m is channelised', () => {
    const sixty = BANDS.find((b) => b.id === '60m')
    expect(sixty?.label.toLowerCase()).toContain('channel')
  })
})

describe('bandForFreq', () => {
  it('finds the band a frequency sits in', () => {
    expect(bandForFreq(14_200_000)?.id).toBe('20m')
    expect(bandForFreq(7_150_000)?.id).toBe('40m')
    expect(bandForFreq(1_850_000)?.id).toBe('160m')
    expect(bandForFreq(50_313_000)?.id).toBe('6m')
  })

  it('includes both edges', () => {
    expect(bandForFreq(14_000_000)?.id).toBe('20m')
    expect(bandForFreq(14_350_000)?.id).toBe('20m')
  })

  it('returns null between bands and outside the table', () => {
    expect(bandForFreq(13_000_000)).toBeNull()
    expect(bandForFreq(14_350_001)).toBeNull()
    expect(bandForFreq(27_185_000)).toBeNull()
    expect(bandForFreq(1_000_000)).toBeNull()
    expect(bandForFreq(60_000_000)).toBeNull()
    expect(bandForFreq(NaN)).toBeNull()
  })

  it('agrees with inHamBand', () => {
    for (const hz of [1_900_000, 13_000_000, 21_300_000, 24_000_000, 54_000_000]) {
      expect(inHamBand(hz)).toBe(bandForFreq(hz) !== null)
    }
    expect(inHamBand(10_125_000)).toBe(true)
    expect(inHamBand(11_000_000)).toBe(false)
  })
})

describe('clampToRadioRange', () => {
  it('leaves an in-range dial frequency alone', () => {
    expect(clampToRadioRange(14_200_000)).toBe(14_200_000)
    expect(clampToRadioRange(1_800_000)).toBe(1_800_000)
    expect(clampToRadioRange(54_000_000)).toBe(54_000_000)
  })

  it('clamps to the IC-7300 transmit envelope, 1.8 to 54 MHz', () => {
    expect(clampToRadioRange(30_000)).toBe(1_800_000)
    expect(clampToRadioRange(0)).toBe(1_800_000)
    expect(clampToRadioRange(-5_000_000)).toBe(1_800_000)
    expect(clampToRadioRange(74_800_000)).toBe(54_000_000)
    expect(clampToRadioRange(Infinity)).toBe(54_000_000)
    expect(clampToRadioRange(-Infinity)).toBe(1_800_000)
  })

  it('never returns NaN', () => {
    expect(clampToRadioRange(NaN)).toBe(1_800_000)
    expect(Number.isFinite(clampToRadioRange(NaN))).toBe(true)
  })
})

describe('RX_RANGE_HZ', () => {
  it('is the general-coverage receive span, 0.030 to 74.800 MHz', () => {
    expect(RX_RANGE_HZ[0]).toBe(30_000)
    expect(RX_RANGE_HZ[1]).toBe(74_800_000)
  })

  it('contains every transmit band, because the receiver hears far more than it sends', () => {
    for (const band of BANDS) {
      expect(band.startHz).toBeGreaterThanOrEqual(RX_RANGE_HZ[0])
      expect(band.endHz).toBeLessThanOrEqual(RX_RANGE_HZ[1])
    }
  })
})
