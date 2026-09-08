/**
 * Antinode — the HF and 6 m amateur bands as the FCC allocates them in
 * IARU Region 2, plus the IC-7300's own frequency limits.
 *
 * Edges are US allocation edges in Hz, from 47 CFR 97.301(a)/(d) as of 2024.
 * They are the whole-service edges, not licence-class or mode sub-band edges:
 * a General cannot legally transmit phone across all of 3.500-4.000 MHz, but the
 * band is 3.500-4.000 MHz and that is what a bandscope draws. Region 1 and
 * Region 3 differ on 40 m, 80 m and 160 m; this build is a Region 2 station.
 *
 * defaultHz is a place to land the dial, chosen inside the phone segment where
 * one exists, so that switching bands puts the operator somewhere sensible.
 */

import type { BandDef } from './types'

/** IC-7300 transmit range, Hz. The radio transmits only inside amateur bands. */
const TX_MIN_HZ = 1_800_000
const TX_MAX_HZ = 54_000_000

/**
 * IC-7300 general-coverage receive range, Hz: 0.030-74.800 MHz. The receiver
 * hears far outside anything it will transmit on, which is why the receive view
 * and the transmit view use different scales.
 */
export const RX_RANGE_HZ: readonly [number, number] = [30_000, 74_800_000]

export const BANDS: readonly BandDef[] = [
  {
    id: '160m',
    label: '160 m',
    startHz: 1_800_000,
    endHz: 2_000_000,
    defaultHz: 1_900_000,
    voiceMode: 'LSB',
  },
  {
    id: '80m',
    label: '80 m',
    startHz: 3_500_000,
    endHz: 4_000_000,
    // The 75 m phone end. 3.5-3.6 MHz is CW and data in the US.
    defaultHz: 3_800_000,
    voiceMode: 'LSB',
  },
  {
    // Not a band in the ordinary sense: five fixed 2.8 kHz channels, secondary to
    // federal users, 100 W ERP max. The channel centres are 5332.0, 5348.0,
    // 5358.5, 5373.0 and 5405.0 kHz; we model the span they occupy so the
    // bandscope and the antenna models have something continuous to work with,
    // and label it so nobody reads it as a free-tuning allocation.
    id: '60m',
    label: '60 m (5 fixed channels)',
    startHz: 5_330_000,
    endHz: 5_405_000,
    // Channel 3, the USB suppressed-carrier dial frequency operators actually set.
    defaultHz: 5_357_000,
    // USB is mandatory on 60 m by rule, on the low side of 10 MHz or not.
    voiceMode: 'USB',
  },
  {
    id: '40m',
    label: '40 m',
    startHz: 7_000_000,
    endHz: 7_300_000,
    defaultHz: 7_200_000,
    voiceMode: 'LSB',
  },
  {
    // CW and narrow data only in the US; no phone at all. voiceMode is required by
    // the type, so it names what you would actually transmit here.
    id: '30m',
    label: '30 m',
    startHz: 10_100_000,
    endHz: 10_150_000,
    defaultHz: 10_125_000,
    voiceMode: 'CW',
  },
  {
    id: '20m',
    label: '20 m',
    startHz: 14_000_000,
    endHz: 14_350_000,
    defaultHz: 14_200_000,
    voiceMode: 'USB',
  },
  {
    id: '17m',
    label: '17 m',
    startHz: 18_068_000,
    endHz: 18_168_000,
    defaultHz: 18_130_000,
    voiceMode: 'USB',
  },
  {
    id: '15m',
    label: '15 m',
    startHz: 21_000_000,
    endHz: 21_450_000,
    defaultHz: 21_300_000,
    voiceMode: 'USB',
  },
  {
    id: '12m',
    label: '12 m',
    startHz: 24_890_000,
    endHz: 24_990_000,
    defaultHz: 24_950_000,
    voiceMode: 'USB',
  },
  {
    id: '10m',
    label: '10 m',
    startHz: 28_000_000,
    endHz: 29_700_000,
    defaultHz: 28_400_000,
    voiceMode: 'USB',
  },
  {
    id: '6m',
    label: '6 m',
    startHz: 50_000_000,
    endHz: 54_000_000,
    // The SSB calling frequency; 50.0-50.1 MHz is CW only.
    defaultHz: 50_125_000,
    voiceMode: 'USB',
  },
]

/**
 * The band containing this frequency, or null between bands.
 * Edges are inclusive: 14.000000 MHz and 14.350000 MHz are both 20 m.
 * Eleven entries, so a linear scan is cheaper than any index.
 */
export const bandForFreq = (hz: number): BandDef | null => {
  for (const band of BANDS) {
    if (hz >= band.startHz && hz <= band.endHz) return band
  }
  return null
}

/**
 * Clamp a dial frequency to what the IC-7300 will transmit on, 1.8-54.0 MHz.
 * This is the outer envelope only; it does not push the dial into the nearest
 * band, because sliding across a band gap with the transmitter keyed is exactly
 * the behaviour the signal-path view is there to show.
 */
export const clampToRadioRange = (hz: number): number => {
  if (Number.isNaN(hz)) return TX_MIN_HZ
  return Math.min(Math.max(hz, TX_MIN_HZ), TX_MAX_HZ)
}

export const inHamBand = (hz: number): boolean => bandForFreq(hz) !== null
