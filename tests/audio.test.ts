/**
 * Antinode — tests for src/rf/audio.ts.
 *
 * The claims worth defending here are numeric, not structural: SSB voice runs at
 * about 20 % average-to-PEP, a speech processor raises that to nearly half
 * without moving the peak, and each mode occupies the bandwidth it is supposed
 * to. Those numbers drive the thermal model and the spectrum display, so they
 * are pinned by integration rather than by eye.
 */

import { describe, expect, it } from 'vitest'
import {
  MODE_LIST, MODES, alcReading, applyCompression, audioWaveform, rfEnvelope,
  speechEnvelope, txAudioSpectrum,
} from '../src/rf/audio'
import type { Mode } from '../src/rf/types'

/** Integration window and step used to derive the duty-cycle constants. */
const WINDOW_S = 512
const STEP_S = 0.001

/** Average-to-PEP ratio: mean(env^2) with the peak of the envelope at 1.0. */
function averageToPeak(comp: number): number {
  let sum = 0
  let n = 0
  for (let t = 0; t < WINDOW_S; t += STEP_S) {
    const e = applyCompression(speechEnvelope(t), comp)
    sum += e * e
    n++
  }
  return sum / n
}

function peakEnvelope(comp: number, window = WINDOW_S, step = 0.0005): number {
  let peak = 0
  for (let t = 0; t < window; t += step) {
    const e = applyCompression(speechEnvelope(t), comp)
    if (e > peak) peak = e
  }
  return peak
}

/** Upper envelope of a sampled RF waveform: the peak within each carrier cycle. */
function cycleMaxima(buf: Float32Array, samplesPerCycle = 8): number[] {
  const out: number[] = []
  for (let i = 0; i + samplesPerCycle <= buf.length; i += samplesPerCycle) {
    let m = 0
    for (let k = 0; k < samplesPerCycle; k++) m = Math.max(m, Math.abs(buf[i + k] ?? 0))
    out.push(m)
  }
  return out
}

/** Occupied bandwidth of a spectrum template, Hz, taken 20 dB down. */
function occupiedHz(spectrum: Float32Array, spanHz = 20_000): number {
  const n = spectrum.length
  let lo = -1
  let hi = -1
  for (let i = 0; i < n; i++) {
    if ((spectrum[i] ?? 0) > 0.1) {
      if (lo < 0) lo = i
      hi = i
    }
  }
  if (lo < 0) return 0
  return ((hi - lo) / (n - 1)) * spanHz
}

const ALL_MODES: readonly Mode[] = ['LSB', 'USB', 'CW', 'AM', 'FM', 'RTTY', 'DATA']

describe('MODES', () => {
  it('describes all seven modes exactly once', () => {
    expect(MODE_LIST).toHaveLength(7)
    expect(MODE_LIST.map((m) => m.id).sort()).toEqual([...ALL_MODES].sort())
    for (const m of ALL_MODES) expect(MODES[m].id).toBe(m)
  })

  it('gives every mode a usable duty cycle and bandwidth', () => {
    for (const m of ALL_MODES) {
      const def = MODES[m]
      expect(def.dutyCycle).toBeGreaterThan(0)
      expect(def.dutyCycle).toBeLessThanOrEqual(1)
      expect(def.bandwidthHz).toBeGreaterThan(0)
      expect(def.note.length).toBeGreaterThan(20)
    }
  })

  it('puts SSB voice at about a fifth of PEP', () => {
    expect(MODES.USB.dutyCycle).toBeGreaterThan(0.18)
    expect(MODES.USB.dutyCycle).toBeLessThan(0.26)
    expect(MODES.LSB.dutyCycle).toBe(MODES.USB.dutyCycle)
    expect(MODES.LSB.bandwidthHz).toBe(MODES.USB.bandwidthHz)
  })

  it('treats the constant-envelope modes as key-down carriers', () => {
    for (const m of ['FM', 'RTTY', 'DATA'] as const) {
      expect(MODES[m].constantEnvelope).toBe(true)
      expect(MODES[m].dutyCycle).toBe(1)
    }
    for (const m of ['LSB', 'USB', 'CW', 'AM'] as const) {
      expect(MODES[m].constantEnvelope).toBe(false)
    }
  })

  it('places CW between speech and key-down, and AM above SSB because of the carrier', () => {
    expect(MODES.CW.dutyCycle).toBeGreaterThan(MODES.USB.dutyCycle)
    expect(MODES.CW.dutyCycle).toBeLessThan(1)
    expect(MODES.AM.dutyCycle).toBeGreaterThan(MODES.USB.dutyCycle)
    expect(MODES.AM.dutyCycle).toBeLessThan(0.35)
  })

  it('orders the occupied bandwidths the way the band plan does', () => {
    expect(MODES.CW.bandwidthHz).toBeLessThan(MODES.RTTY.bandwidthHz)
    expect(MODES.RTTY.bandwidthHz).toBeLessThan(MODES.USB.bandwidthHz)
    expect(MODES.USB.bandwidthHz).toBeLessThan(MODES.AM.bandwidthHz)
    expect(MODES.AM.bandwidthHz).toBeLessThan(MODES.FM.bandwidthHz)
    expect(MODES.AM.bandwidthHz).toBe(6000)
  })
})

describe('speechEnvelope', () => {
  it('is a pure function of t', () => {
    for (const t of [0, 0.37, 12.5, 101.25]) {
      expect(speechEnvelope(t)).toBe(speechEnvelope(t))
    }
  })

  it('stays inside 0..1 and never returns NaN, even for nonsense input', () => {
    for (let t = 0; t < 40; t += 0.017) {
      const e = speechEnvelope(t)
      expect(Number.isFinite(e)).toBe(true)
      expect(e).toBeGreaterThanOrEqual(0)
      expect(e).toBeLessThanOrEqual(1)
    }
    expect(speechEnvelope(Number.NaN)).toBe(0)
    expect(speechEnvelope(Number.POSITIVE_INFINITY)).toBe(0)
  })

  it('reaches full scale and falls silent between phrases', () => {
    let peak = 0
    let quiet = 0
    let n = 0
    for (let t = 0; t < 120; t += 0.001) {
      const e = speechEnvelope(t)
      peak = Math.max(peak, e)
      if (e < 0.01) quiet++
      n++
    }
    expect(peak).toBeGreaterThan(0.99)
    // Real speech is silent a third of the time; an SSB transmitter makes no
    // power at all in those gaps, which is most of why its duty cycle is low.
    expect(quiet / n).toBeGreaterThan(0.2)
    expect(quiet / n).toBeLessThan(0.55)
  })

  it('has an average power about a fifth of its peak', () => {
    const ratio = averageToPeak(0)
    expect(ratio).toBeGreaterThan(0.19)
    expect(ratio).toBeLessThan(0.23)
    expect(ratio).toBeCloseTo(MODES.USB.dutyCycle, 2)
  })

  it('does not repeat itself on the timescale of a demonstration', () => {
    // Incommensurate rates: the envelope 30 s later is unrelated to now.
    let sameCount = 0
    for (let t = 0; t < 30; t += 0.01) {
      if (Math.abs(speechEnvelope(t) - speechEnvelope(t + 30)) < 0.005) sameCount++
    }
    expect(sameCount / 3000).toBeLessThan(0.5)
  })
})

describe('applyCompression', () => {
  it('is a pass-through with COMP off', () => {
    for (const e of [0, 0.13, 0.5, 0.87, 1]) {
      expect(applyCompression(e, 0)).toBeCloseTo(e, 10)
    }
  })

  it('never moves the peak, at any COMP setting', () => {
    for (let c = 0; c <= 10; c++) {
      expect(applyCompression(1, c)).toBeCloseTo(1, 10)
      expect(applyCompression(0, c)).toBe(0)
    }
  })

  it('is monotonic in level and in COMP', () => {
    for (let c = 0; c <= 10; c += 2) {
      let previous = -1
      for (let e = 0; e <= 1.0001; e += 0.05) {
        const v = applyCompression(e, c)
        expect(v).toBeGreaterThanOrEqual(previous)
        previous = v
      }
    }
    // A mid-level syllable is lifted further with every step of COMP.
    let previousMid = -1
    for (let c = 0; c <= 10; c++) {
      const v = applyCompression(0.25, c)
      expect(v).toBeGreaterThanOrEqual(previousMid)
      previousMid = v
    }
    expect(applyCompression(0.25, 10)).toBeGreaterThan(2 * applyCompression(0.25, 0))
  })

  it('clamps out-of-range and non-numeric input', () => {
    expect(applyCompression(5, 5)).toBeCloseTo(1, 10)
    expect(applyCompression(-3, 5)).toBe(0)
    expect(applyCompression(Number.NaN, 5)).toBe(0)
    expect(applyCompression(0.4, Number.NaN)).toBeCloseTo(0.4, 10)
    expect(applyCompression(0.4, 99)).toBeCloseTo(applyCompression(0.4, 10), 10)
  })

  it('raises average power without raising peak power', () => {
    const off = averageToPeak(0)
    const mid = averageToPeak(5)
    const full = averageToPeak(10)

    // The headline numbers the UI shows as "average to PEP".
    expect(off).toBeCloseTo(0.207, 2)
    expect(mid).toBeGreaterThan(0.32)
    expect(mid).toBeLessThan(0.39)
    expect(full).toBeGreaterThan(0.44)
    expect(full).toBeLessThan(0.51)
    expect(full).toBeGreaterThan(mid)
    expect(mid).toBeGreaterThan(off)

    // About 3.5 dB more talk power for the same licence-limited peak.
    const gainDb = 10 * Math.log10(full / off)
    expect(gainDb).toBeGreaterThan(3)
    expect(gainDb).toBeLessThan(4)

    // And the peak really has not moved.
    expect(peakEnvelope(0)).toBeCloseTo(peakEnvelope(10), 3)
    expect(peakEnvelope(10)).toBeLessThanOrEqual(1)
  })
})

describe('alcReading', () => {
  it('reads nothing with no audio', () => {
    expect(alcReading(0, 50, 0)).toBe(0)
    expect(alcReading(0, 100, 10)).toBe(0)
  })

  it('puts a full syllable at the top of the zone with mic gain at half', () => {
    expect(alcReading(1, 50, 0)).toBeCloseTo(0.5, 6)
  })

  it('rises with mic gain and saturates instead of running away', () => {
    expect(alcReading(1, 25, 0)).toBeCloseTo(0.25, 6)
    expect(alcReading(1, 100, 0)).toBeGreaterThan(0.5)
    expect(alcReading(1, 100, 0)).toBeLessThan(1)
    for (const gain of [0, 20, 50, 80, 100]) {
      const v = alcReading(0.8, gain, 4)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
    expect(alcReading(1, 400, 0)).toBeLessThanOrEqual(1)
  })

  it('holds the needle higher on quiet passages when COMP is up', () => {
    // The peak reading is unchanged; the mid-level reading is not.
    expect(alcReading(1, 50, 10)).toBeCloseTo(alcReading(1, 50, 0), 6)
    expect(alcReading(0.2, 50, 10)).toBeGreaterThan(alcReading(0.2, 50, 0))
  })
})

describe('txAudioSpectrum', () => {
  it('returns a normalised, finite buffer of the requested size', () => {
    for (const m of ALL_MODES) {
      const s = txAudioSpectrum(m, 257)
      expect(s).toHaveLength(257)
      let peak = 0
      for (const v of s) {
        expect(Number.isFinite(v)).toBe(true)
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1.000001)
        peak = Math.max(peak, v)
      }
      expect(peak).toBeCloseTo(1, 6)
    }
  })

  it('handles degenerate bin counts without throwing', () => {
    expect(txAudioSpectrum('USB', 0)).toHaveLength(0)
    expect(txAudioSpectrum('USB', 1)).toHaveLength(1)
    expect(txAudioSpectrum('USB', -5)).toHaveLength(0)
  })

  it('puts USB above the carrier and LSB below it', () => {
    const n = 513
    const usb = txAudioSpectrum('USB', n)
    const lsb = txAudioSpectrum('LSB', n)
    const half = (n - 1) / 2
    let usbHigh = 0
    let usbLow = 0
    for (let i = 0; i < n; i++) {
      if (i > half) usbHigh += usb[i] ?? 0
      if (i < half) usbLow += usb[i] ?? 0
    }
    expect(usbHigh).toBeGreaterThan(20 * usbLow)
    // LSB is the same signal with the spectrum turned over.
    for (let i = 0; i < n; i++) {
      expect(lsb[i] ?? 0).toBeCloseTo(usb[n - 1 - i] ?? 0, 5)
    }
  })

  it('draws each mode at roughly its published occupied bandwidth', () => {
    const n = 2049
    const cw = occupiedHz(txAudioSpectrum('CW', n))
    const rtty = occupiedHz(txAudioSpectrum('RTTY', n))
    const ssb = occupiedHz(txAudioSpectrum('USB', n))
    const am = occupiedHz(txAudioSpectrum('AM', n))
    const fm = occupiedHz(txAudioSpectrum('FM', n))
    expect(cw).toBeLessThan(500)
    expect(rtty).toBeLessThan(600)
    expect(ssb).toBeGreaterThan(1800)
    expect(ssb).toBeLessThan(3200)
    expect(am).toBeGreaterThan(ssb)
    expect(fm).toBeGreaterThan(12_000)
  })

  it('shows the AM carrier as a symmetric spike between two sidebands', () => {
    const n = 1025
    const am = txAudioSpectrum('AM', n)
    const centre = (n - 1) / 2
    expect(am[centre] ?? 0).toBeCloseTo(1, 3)
    for (let d = 20; d < 300; d += 20) {
      expect(am[centre - d] ?? 0).toBeCloseTo(am[centre + d] ?? 0, 4)
    }
    // The sidebands are well below the carrier: that is the AM power argument.
    expect(am[centre + 120] ?? 0).toBeLessThan(0.7)
  })

  it('shows RTTY as two tones either side of centre', () => {
    const n = 4097
    const rtty = txAudioSpectrum('RTTY', n)
    const centre = (n - 1) / 2
    let above = 0
    let below = 0
    for (let i = 0; i < n; i++) {
      if ((rtty[i] ?? 0) > 0.5) {
        if (i > centre) above++
        else if (i < centre) below++
      }
    }
    expect(above).toBeGreaterThan(0)
    expect(below).toBeGreaterThan(0)
    // Nothing at the centre frequency itself: the carrier is never there.
    expect(rtty[centre] ?? 1).toBeLessThan(0.2)
  })
})

describe('rfEnvelope', () => {
  const N = 256

  it('returns a finite, bounded, repeatable buffer for every mode', () => {
    for (const m of ALL_MODES) {
      const a = rfEnvelope(m, 3.5, 1, N)
      const b = rfEnvelope(m, 3.5, 1, N)
      expect(a).toHaveLength(N)
      for (let i = 0; i < N; i++) {
        const v = a[i] ?? 0
        expect(Number.isFinite(v)).toBe(true)
        expect(Math.abs(v)).toBeLessThanOrEqual(1)
        expect(v).toBe(b[i])
      }
    }
    expect(rfEnvelope('USB', 0, 1, 0)).toHaveLength(0)
  })

  it('swings through zero on SSB', () => {
    const buf = rfEnvelope('USB', 12.0, 1, N)
    let min = 1
    let max = -1
    for (const v of buf) {
      min = Math.min(min, v)
      max = Math.max(max, v)
    }
    expect(max).toBeGreaterThan(0.1)
    expect(min).toBeLessThan(-0.1)
  })

  it('holds a constant amplitude on FM, RTTY and DATA', () => {
    for (const m of ['FM', 'RTTY', 'DATA'] as const) {
      const maxima = cycleMaxima(rfEnvelope(m, 7.25, 1, N))
      const lo = Math.min(...maxima)
      const hi = Math.max(...maxima)
      // Eight samples per cycle cannot land exactly on every crest, so the
      // measured peak varies a little; the modulation does not.
      expect(lo).toBeGreaterThan(0.85)
      expect(hi).toBeLessThanOrEqual(1)
    }
  })

  it('varies far more on SSB than on FM', () => {
    const ssb = cycleMaxima(rfEnvelope('USB', 12.0, 1, N))
    const fm = cycleMaxima(rfEnvelope('FM', 12.0, 1, N))
    const spread = (a: number[]): number => Math.max(...a) - Math.min(...a)
    expect(spread(ssb)).toBeGreaterThan(4 * spread(fm))
  })

  it('keys CW off completely between elements, with shaped edges', () => {
    const buf = rfEnvelope('CW', 0, 1, 1024)
    let silent = 0
    let loud = 0
    for (const v of buf) {
      if (Math.abs(v) < 1e-9) silent++
      if (Math.abs(v) > 0.9) loud++
    }
    expect(silent).toBeGreaterThan(20)
    expect(loud).toBeGreaterThan(5)
    // Shaped rise: the envelope passes through intermediate values on the way
    // up rather than stepping. A step here is what makes key clicks.
    const maxima = cycleMaxima(buf)
    const partial = maxima.filter((m) => m > 0.05 && m < 0.85).length
    expect(partial).toBeGreaterThan(2)
  })

  it('never lets the AM carrier disappear', () => {
    // Averaged over the same window, AM carries more than SSB because the
    // carrier is transmitted whether or not anybody is speaking.
    for (const t of [2.0, 12.0, 30.0]) {
      const am = rfEnvelope('AM', t, 1, N)
      const ssb = rfEnvelope('USB', t, 1, N)
      const mean = (b: Float32Array): number =>
        b.reduce((s, v) => s + Math.abs(v), 0) / Math.max(1, b.length)
      expect(mean(am)).toBeGreaterThan(mean(ssb))
    }
  })

  it('scales with the drive level and goes silent at zero', () => {
    const full = cycleMaxima(rfEnvelope('FM', 5, 1, N))
    const half = cycleMaxima(rfEnvelope('FM', 5, 0.5, N))
    expect(Math.max(...half)).toBeCloseTo(Math.max(...full) * 0.5, 2)
    for (const v of rfEnvelope('FM', 5, 0, N)) expect(Math.abs(v)).toBe(0)
  })
})

describe('audioWaveform', () => {
  const N = 512
  const rms = (b: Float32Array): number =>
    Math.sqrt(b.reduce((s, v) => s + v * v, 0) / Math.max(1, b.length))

  it('returns a finite, bounded, repeatable buffer', () => {
    const a = audioWaveform(9.0, 50, 0, N)
    const b = audioWaveform(9.0, 50, 0, N)
    expect(a).toHaveLength(N)
    for (let i = 0; i < N; i++) {
      const v = a[i] ?? 0
      expect(Number.isFinite(v)).toBe(true)
      expect(Math.abs(v)).toBeLessThanOrEqual(1)
      expect(v).toBe(b[i])
    }
    expect(audioWaveform(0, 50, 0, 0)).toHaveLength(0)
  })

  it('gets louder with mic gain but stops short of the rails', () => {
    // t chosen inside a phrase; in a gap there is nothing to make louder.
    const quiet = rms(audioWaveform(12.0, 20, 0, N))
    const normal = rms(audioWaveform(12.0, 50, 0, N))
    const loud = rms(audioWaveform(12.0, 100, 0, N))
    expect(normal).toBeGreaterThan(quiet)
    expect(loud).toBeGreaterThan(normal)
    // Soft limiting: doubling the gain does not double the output once the
    // limiter is working. That flattening is what listeners hear as distortion.
    expect(loud).toBeLessThan(2 * normal)
    for (const v of audioWaveform(12.0, 100, 10, N)) expect(Math.abs(v)).toBeLessThanOrEqual(1)
  })

  it('fills in the quiet parts when COMP is turned up', () => {
    let plain = 0
    let processed = 0
    for (let t = 0; t < 40; t += 0.5) {
      plain += rms(audioWaveform(t, 50, 0, 128))
      processed += rms(audioWaveform(t, 50, 8, 128))
    }
    expect(processed).toBeGreaterThan(plain)
  })

  it('is peaky, the way a voice is', () => {
    // Crest factor of the raw voiced waveform, measured where the envelope is
    // high enough for the measurement to mean anything.
    const buf = audioWaveform(12.0, 50, 0, 4096)
    const peak = Math.max(...Array.from(buf, Math.abs))
    const crestDb = 20 * Math.log10(peak / Math.max(rms(buf), 1e-9))
    expect(crestDb).toBeGreaterThan(4)
  })
})
