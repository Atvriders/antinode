/**
 * Antinode — transmit audio, modes and display buffers.
 *
 * Everything here is a pure function of its arguments. There is no randomness
 * and no clock: the "speech" is a closed-form function of t so that the same
 * instant always looks the same, tests can integrate it, and the 3D layer and
 * the meters never disagree about what the operator is saying.
 *
 * The one number that matters for heating is the ratio of average power to peak
 * envelope power. For an amplitude-modulated signal the instantaneous envelope
 * is an amplitude, so average power is proportional to mean(env^2) and PEP is
 * proportional to max(env)^2. Every duty cycle in this file is that ratio.
 */

import type { Mode, ModeDef } from './types'

const TAU = Math.PI * 2

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)

const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x)

/** Finite-or-zero. Display buffers must never carry NaN into a vertex shader. */
const finite = (x: number): number => (Number.isFinite(x) ? x : 0)

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 === edge0) return x < edge0 ? 0 : 1
  const u = clamp01((x - edge0) / (edge1 - edge0))
  return u * u * (3 - 2 * u)
}

// ─── Modes ───────────────────────────────────────────────────────────────────

/**
 * Duty cycles are average-to-PEP ratios, not "percent of the time you talk".
 *
 * SSB   0.207 is the measured mean(env^2) of `speechEnvelope` with COMP off.
 *       It is the classic "SSB is about 20 % duty" figure, and it is why an
 *       SSB rig gets away with a heatsink an FM rig could not use.
 * CW    A key-down carrier is 1.0; normal sending at 20 WPM with proper spacing
 *       is roughly 40 % key-down, and the finals only see heat while the key is
 *       down. Contests with long calls run hotter than this.
 * AM    The carrier never stops. With PEP = Pc(1+m)^2 and m peaking at 1,
 *       the carrier alone is a quarter of PEP; speech sidebands add
 *       mean(m^2)/2 on top, giving (1 + 0.207/2)/4 = 0.276.
 * FM    Constant envelope, always at PEP. This is the mode that cooks radios.
 * RTTY  FSK is also a constant envelope: full power for the whole transmission.
 * DATA  FT8 and friends are constant-envelope tones sent through the SSB path,
 *       so they load the PA exactly like FM for the length of the slot.
 */
export const MODES: Readonly<Record<Mode, ModeDef>> = Object.freeze({
  LSB: {
    id: 'LSB',
    label: 'LSB',
    dutyCycle: 0.207,
    bandwidthHz: 2400,
    constantEnvelope: false,
    note: 'Lower sideband voice, the convention below 10 MHz. The carrier and the upper sideband are removed, so nothing is transmitted between syllables.',
  },
  USB: {
    id: 'USB',
    label: 'USB',
    dutyCycle: 0.207,
    bandwidthHz: 2400,
    constantEnvelope: false,
    note: 'Upper sideband voice, the convention at 10 MHz and above. Same power and duty as LSB; only the spectrum is flipped.',
  },
  CW: {
    id: 'CW',
    label: 'CW',
    dutyCycle: 0.4,
    bandwidthHz: 150,
    constantEnvelope: false,
    note: 'Keyed carrier. The rise and fall are deliberately shaped over a few milliseconds; square edges would spread key clicks across the band.',
  },
  AM: {
    id: 'AM',
    label: 'AM',
    dutyCycle: 0.276,
    bandwidthHz: 6000,
    constantEnvelope: false,
    note: 'Carrier plus two sidebands. Two thirds of the power sits in a carrier that carries no information, which is why the radio limits AM carrier power.',
  },
  FM: {
    id: 'FM',
    label: 'FM',
    dutyCycle: 1.0,
    bandwidthHz: 16000,
    constantEnvelope: true,
    note: 'Constant amplitude, information in the frequency. Full output for the whole transmission, so the finals and the heatsink see the worst case.',
  },
  RTTY: {
    id: 'RTTY',
    label: 'RTTY',
    dutyCycle: 1.0,
    bandwidthHz: 250,
    constantEnvelope: true,
    note: 'Two tones 170 Hz apart at 45.45 baud. Narrow, but key-down for the whole over, so it heats like FM.',
  },
  DATA: {
    id: 'DATA',
    label: 'DATA',
    dutyCycle: 1.0,
    bandwidthHz: 3000,
    constantEnvelope: true,
    note: 'The SSB passband driven from a soundcard. The passband is 3 kHz wide but one FT8 signal inside it occupies about 50 Hz and is constant envelope.',
  },
})

export const MODE_LIST: readonly ModeDef[] = Object.freeze([
  MODES.LSB, MODES.USB, MODES.CW, MODES.AM, MODES.FM, MODES.RTTY, MODES.DATA,
])

// ─── Speech ──────────────────────────────────────────────────────────────────

/**
 * Rates chosen to be mutually incommensurate so the pattern never repeats on the
 * timescale of a demonstration. Real speech has the same property: a listener
 * cannot predict the next syllable, which is exactly why an ALC that is fast
 * enough for speech has to be fast.
 */
const PHRASE_A_HZ = 0.29 // breath groups
const PHRASE_B_HZ = 0.17 // slower drift so phrases differ in length
const SYLLABLE_HZ = 3.17 // syllable rate of unhurried speech
const WORD_HZ = 1.23 // word stress
const ONSET_HZ = 7.41 // consonant onsets riding on the vowels

/**
 * Scales the raw product so the envelope just reaches 1.0 at its highest peak
 * (found numerically over a 1600 s sweep; the maximum occurs near t = 45.5 s).
 * Without this the "peak" the ALC and the PEP figure are referenced to would
 * drift with the arbitrary amplitude of the product.
 */
const SPEECH_NORM = 1.0003

/**
 * Deterministic pseudo-speech envelope, 0..1.
 *
 * Structure, outermost first: a breath gate that produces genuine pauses, then
 * syllable, word-stress and consonant-onset terms. The floors on the inner terms
 * set the crest factor; they are tuned so mean(env^2) = 0.207, which is the
 * 20 % average-to-PEP that everybody quotes for SSB voice. That single number is
 * what makes the thermal model behave like a real radio.
 */
export function speechEnvelope(t: number): number {
  if (!Number.isFinite(t)) return 0
  const gateWave =
    0.72 * Math.sin(TAU * PHRASE_A_HZ * t) + 0.28 * Math.sin(TAU * PHRASE_B_HZ * t + 2.0)
  // Off below -0.30, fully on above +0.05: about 61 % of the time is speech and
  // the rest is the pause an SSB transmitter spends producing nothing at all.
  const gate = smoothstep(-0.3, 0.05, gateWave)
  const syllable = 0.5 + 0.5 * Math.sin(TAU * SYLLABLE_HZ * t)
  const word = 0.5 + 0.5 * Math.sin(TAU * WORD_HZ * t + 1.7)
  const onset = 0.5 + 0.5 * Math.sin(TAU * ONSET_HZ * t + 0.4)
  const shape = (0.55 + 0.45 * syllable) * (0.65 + 0.35 * word) * (0.88 + 0.12 * onset)
  return clamp01(SPEECH_NORM * gate * shape)
}

/**
 * COMP maps to a threshold and a ratio. One step of COMP lowers the threshold by
 * 0.8 dB and steepens the ratio by 0.9:1, so COMP 10 is a 12:1 limiter with its
 * threshold 8 dB below the peak.
 */
const COMP_THRESHOLD_DB_PER_STEP = 0.8
const COMP_RATIO_PER_STEP = 0.9

/**
 * Speech compressor with make-up gain, in the amplitude domain.
 *
 * The make-up gain is chosen so that a full-scale input still produces exactly
 * full scale out. That is the whole point of a speech processor: the peak, and
 * therefore the PEP the licence limits, does not move. What moves is everything
 * below the threshold, which is lifted toward the peak, so the *average* power
 * goes up. Measured on `speechEnvelope`, mean(env^2) goes 0.207 -> 0.360 -> 0.462
 * for COMP 0, 5 and 10: about 3.5 dB more talk power for the same PEP.
 *
 * Real compressors also have attack and release time constants. This one is
 * instantaneous, which flatters it slightly; it is the steady-state statistic
 * that the meters and the heatsink care about.
 */
export function applyCompression(env: number, comp: number): number {
  const e = clamp01(Number.isFinite(env) ? env : 0)
  const c = clamp(Number.isFinite(comp) ? comp : 0, 0, 10)
  if (c <= 0) return e
  const threshold = Math.pow(10, (-COMP_THRESHOLD_DB_PER_STEP * c) / 20)
  const ratio = 1 + COMP_RATIO_PER_STEP * c
  // Make-up gain that maps an input of 1.0 back to an output of 1.0.
  const denom = threshold + (1 - threshold) / ratio
  if (denom <= 0) return e
  const makeup = 1 / denom
  const knee = e <= threshold ? e : threshold + (e - threshold) / ratio
  return clamp01(knee * makeup)
}

/**
 * ALC meter reading, 0..1, where 0.5 is the top of the zone marked on the panel.
 *
 * The ALC is a peak-reading gain-reduction indicator, so it is driven by the
 * *compressed* envelope: turning COMP up does not raise the peak, but it holds
 * the needle up in the zone instead of letting it flick, which is exactly what
 * you see on the radio. Mic gain scales the drive directly, and 50 is the
 * setting that puts a full-amplitude syllable at the top of the zone.
 *
 * Above the zone the curve saturates rather than running away, because the ALC
 * loop is already reducing gain: the reading tells you how hard it is working,
 * not how much extra power you are getting, because there is none.
 */
export function alcReading(env: number, micGain: number, comp: number): number {
  const gain = clamp(Number.isFinite(micGain) ? micGain : 0, 0, 100)
  const drive = applyCompression(env, comp) * (gain / 50)
  if (drive <= 1) return clamp01(0.5 * drive)
  return clamp01(0.5 + 0.5 * (1 - Math.exp(-(drive - 1))))
}

// ─── Transmitted spectrum ────────────────────────────────────────────────────

/** Half-width of the spectrum display, Hz. 20 kHz total shows FM and CW at once. */
const SPECTRUM_HALF_SPAN_HZ = 10_000

/** Speech has most of its energy low; this is the tilt an unequalised mic gives. */
function speechTilt(audioHz: number): number {
  const f = Math.abs(audioHz)
  const rise = smoothstep(250, 450, f)
  const fall = 1 - 0.62 * smoothstep(700, 2600, f)
  return rise * fall
}

/** Flat-topped band between lo and hi with smooth shoulders of width `edge`. */
function slab(f: number, lo: number, hi: number, edge: number): number {
  return smoothstep(lo - edge, lo + edge, f) * (1 - smoothstep(hi - edge, hi + edge, f))
}

function gaussian(f: number, centre: number, sigma: number): number {
  const s = sigma > 0 ? sigma : 1
  const x = (f - centre) / s
  return Math.exp(-0.5 * x * x)
}

/**
 * Transmitted spectrum template for one mode, normalised to a peak of 1.
 *
 * Bin i maps to an offset from the dial frequency of
 * ((i / (bins-1)) - 0.5) * 20 kHz, so every mode is drawn on the same axis and
 * the widths are honestly comparable. It is a static shape for the mode, not a
 * live analysis of the current audio: the point of the display is to show what
 * a mode occupies, and the sideband inversion between LSB and USB.
 */
export function txAudioSpectrum(mode: Mode, bins: number): Float32Array {
  const n = Math.max(0, Math.floor(Number.isFinite(bins) ? bins : 0))
  const out = new Float32Array(n)
  if (n === 0) return out
  let peak = 0
  for (let i = 0; i < n; i++) {
    const u = n > 1 ? i / (n - 1) : 0.5
    const f = (u - 0.5) * 2 * SPECTRUM_HALF_SPAN_HZ
    let v = 0
    switch (mode) {
      case 'USB':
      case 'LSB': {
        // The transmit filter passes 300–2700 Hz of audio; the balanced
        // modulator puts it on one side of a carrier that is not there.
        const a = mode === 'USB' ? f : -f
        v = slab(a, 300, 2700, 90) * speechTilt(a)
        // Intermodulation skirts. A clean radio is 30 dB or so down here; this
        // is what widens when the operator overdrives the ALC.
        v += 0.02 * slab(a, 100, 3400, 300) * speechTilt(a * 0.6)
        break
      }
      case 'CW': {
        // A keyed carrier is a carrier plus the spectrum of the keying envelope.
        // Shaped rise and fall keep the skirts close in; this is the difference
        // between a clean signal and key clicks two kilohertz away.
        v = gaussian(f, 0, 55) + 0.012 * Math.exp(-Math.abs(f) / 420)
        break
      }
      case 'AM': {
        // Carrier plus a mirrored pair of sidebands. The carrier spike is the
        // two thirds of the power that carries nothing.
        v = gaussian(f, 0, 60)
        const side = slab(Math.abs(f), 250, 3000, 110) * speechTilt(Math.abs(f)) * 0.5
        v += side
        break
      }
      case 'FM': {
        // Carson's rule for 5 kHz deviation and 3 kHz audio gives 16 kHz.
        // The ripple stands in for the Bessel structure of a real FM spectrum.
        const plateau = slab(Math.abs(f), 0, 8000, 900)
        v = plateau * (0.72 + 0.28 * Math.abs(Math.cos((TAU * f) / 5200)))
        v += 0.03 * Math.exp(-Math.abs(Math.abs(f) - 8000) / 1400)
        break
      }
      case 'RTTY': {
        // Mark and space, 170 Hz apart, plus the sidebands the 45.45 baud
        // keying puts either side of each tone.
        v = gaussian(f, -85, 22) + gaussian(f, 85, 22)
        v += 0.05 * (gaussian(f, -85, 90) + gaussian(f, 85, 90))
        break
      }
      case 'DATA': {
        // The whole 3 kHz passband is available, and the radio will transmit
        // whatever the computer sends. The spike is one FT8 signal, about 50 Hz
        // wide, sitting inside it.
        v = 0.45 * slab(f, 300, 3000, 90)
        v += 0.55 * gaussian(f, 1500, 25)
        break
      }
    }
    const s = finite(v)
    out[i] = s
    if (s > peak) peak = s
  }
  if (peak > 0) {
    for (let i = 0; i < n; i++) out[i] = (out[i] ?? 0) / peak
  }
  return out
}

// ─── Keying ──────────────────────────────────────────────────────────────────

/** 20 WPM. The standard word PARIS is 50 dit lengths, so dit = 1.2 / WPM. */
const CW_DIT_S = 1.2 / 20
/** Envelope rise and fall time. The IC-7300 offers 2–8 ms; 4 ms is the default. */
const CW_EDGE_S = 0.004

/** "CQ" in dit lengths: key-down runs and the gaps between them. */
const CW_PATTERN: readonly (readonly [down: boolean, units: number])[] = [
  [true, 3], [false, 1], [true, 1], [false, 1], [true, 3], [false, 1], [true, 1], // C
  [false, 3],
  [true, 3], [false, 1], [true, 3], [false, 1], [true, 1], [false, 1], [true, 3], // Q
  // A pause before calling again. Continuous key-down sending would be about
  // 53 percent; the published typical figure for CW includes the operator
  // stopping to listen, and this gap is what makes the envelope's mean square
  // land on it. Asserted in tests/envelope.test.ts.
  [false, 18],
]

const CW_PERIOD_S = CW_PATTERN.reduce((sum, seg) => sum + seg[1], 0) * CW_DIT_S

/**
 * Keying envelope, 0..1, at absolute time t. Edges are raised-cosine shaped: a
 * square edge would be a step, and the transform of a step is energy everywhere.
 */
function cwEnvelope(t: number): number {
  const period = CW_PERIOD_S
  let phase = t % period
  if (phase < 0) phase += period
  let cursor = 0
  for (const seg of CW_PATTERN) {
    const len = seg[1] * CW_DIT_S
    if (phase < cursor + len) {
      if (!seg[0]) return 0
      const intoSegment = phase - cursor
      const rise = clamp01(intoSegment / CW_EDGE_S)
      const fall = clamp01((len - intoSegment) / CW_EDGE_S)
      const shape = Math.min(rise, fall)
      return 0.5 - 0.5 * Math.cos(Math.PI * shape)
    }
    cursor += len
  }
  return 0
}

// ─── Voiced audio waveform ───────────────────────────────────────────────────

/** Harmonic amplitudes of a glottal pulse with the first two formants weighted. */
const VOICE_HARMONICS: readonly number[] = [1.0, 0.72, 0.48, 0.55, 0.3, 0.18, 0.1]
const VOICE_PHASES: readonly number[] = [0, 0.6, 1.9, 2.7, 0.4, 1.2, 2.2]
/** Male speaking pitch, Hz. */
const VOICE_F0_HZ = 118
/** 1 / peak of the harmonic sum, so the waveform just touches +/-1. */
const VOICE_NORM = 0.40859

/**
 * Unit-amplitude voiced waveform, -1..1. Peaky by construction: the harmonics
 * of a glottal pulse are nearly phase-aligned, giving a crest factor of about
 * 7.4 dB. That crest factor is why a speech processor is worth having.
 */
function voicedWave(t: number): number {
  // Pitch wobble as a phase modulation so the phase stays continuous.
  const phase = TAU * VOICE_F0_HZ * t + 0.35 * Math.sin(TAU * 0.7 * t)
  let sum = 0
  for (let k = 0; k < VOICE_HARMONICS.length; k++) {
    const a = VOICE_HARMONICS[k] ?? 0
    const p = VOICE_PHASES[k] ?? 0
    sum += a * Math.sin((k + 1) * phase + p)
  }
  return clamp(sum * VOICE_NORM, -1, 1)
}

/** Soft limiter standing in for the ALC: linear below 0.8, asymptotic to 1. */
function softLimit(x: number): number {
  const a = Math.abs(x)
  if (a <= 0.8) return x
  const over = (a - 0.8) / 0.25
  const y = 0.8 + 0.2 * Math.tanh(over)
  return x < 0 ? -y : y
}

// ─── Display buffers ─────────────────────────────────────────────────────────

/** Window shown by `rfEnvelope`, seconds. Long enough for two syllables. */
const RF_WINDOW_S = 0.5
/** Window shown by `audioWaveform`, seconds. Three pitch periods. */
const AF_WINDOW_S = 0.025

/**
 * RF voltage across a 0.5 s window starting at t, normalised to -1..1.
 *
 * This is the actual RF waveform, not its outline, because the outline is the
 * thing being taught: SSB swings through zero and dies away in the gaps, CW is
 * a keyed carrier with soft edges, FM never changes amplitude at all, and AM is
 * a carrier that is always there with the speech riding on it.
 *
 * The drawn carrier is eight samples per cycle regardless of buffer size, so the
 * trace never aliases; the real carrier is millions of cycles per second and
 * could not be drawn. `envelope` is the drive level, 0..1: pass the live speech
 * envelope for a level-driven trace, or 1.0 for a full-scale scope view.
 */
export function rfEnvelope(mode: Mode, t: number, envelope: number, samples: number): Float32Array {
  const n = Math.max(0, Math.floor(Number.isFinite(samples) ? samples : 0))
  const out = new Float32Array(n)
  if (n === 0) return out
  const t0 = Number.isFinite(t) ? t : 0
  const drive = clamp01(Number.isFinite(envelope) ? envelope : 0)
  const cycles = Math.max(4, Math.round(n / 8))
  const carrierHz = cycles / RF_WINDOW_S
  const dt = n > 1 ? RF_WINDOW_S / (n - 1) : 0

  // Frequency-modulated modes accumulate phase sample by sample so that the
  // instantaneous frequency can move without the waveform jumping.
  let phase = 0
  for (let i = 0; i < n; i++) {
    const tau = i * dt
    const now = t0 + tau
    let amplitude: number
    let freqScale = 1

    switch (mode) {
      case 'LSB':
      case 'USB':
        amplitude = drive * speechEnvelope(now)
        break
      case 'CW':
        amplitude = drive * cwEnvelope(now)
        break
      case 'AM': {
        // Carrier at half scale, so 100 % modulation just reaches full scale and
        // just touches zero. The clamp is the negative peak limiter: modulate
        // past 100 % and the envelope would try to go through zero, which is a
        // carrier interruption, which is splatter right across the band.
        const m = clamp(1.4 * voicedWave(now) * speechEnvelope(now), -1, 1)
        amplitude = drive * 0.5 * (1 + m)
        break
      }
      case 'FM':
        // Constant amplitude; the information is entirely in the zero crossings.
        amplitude = drive
        freqScale = 1 + 0.1 * Math.sin(TAU * 8 * now)
        break
      case 'RTTY': {
        // Mark and space from a fixed bit pattern at 45.45 baud.
        const bit = Math.floor(now * 45.45)
        const pattern = 0b1011001110100101
        const mark = ((pattern >> (((bit % 16) + 16) % 16)) & 1) === 1
        amplitude = drive
        freqScale = mark ? 1.06 : 0.94
        break
      }
      case 'DATA': {
        // Eight-tone FSK at 6.25 baud, the shape of one FT8 symbol stream.
        const symbols = [3, 1, 4, 1, 5, 2, 6, 5]
        const idx = ((Math.floor(now * 6.25) % 8) + 8) % 8
        const tone = symbols[idx] ?? 0
        amplitude = drive
        freqScale = 1 + ((tone - 3.5) / 3.5) * 0.06
        break
      }
    }

    phase += TAU * carrierHz * freqScale * dt
    out[i] = finite(clamp(amplitude * Math.sin(phase), -1, 1))
  }
  return out
}

/**
 * Microphone audio after mic gain and compression, -1..1, over a 25 ms window.
 *
 * `gain` is the front-panel MIC GAIN, 0..100, where 50 is unity. Above that the
 * soft limiter starts flattening the peaks: that flattening is the ALC doing its
 * job, and the flat tops are what a listener hears as distortion.
 */
export function audioWaveform(t: number, gain: number, comp: number, samples: number): Float32Array {
  const n = Math.max(0, Math.floor(Number.isFinite(samples) ? samples : 0))
  const out = new Float32Array(n)
  if (n === 0) return out
  const t0 = Number.isFinite(t) ? t : 0
  const drive = clamp(Number.isFinite(gain) ? gain : 0, 0, 100) / 50
  const dt = n > 1 ? AF_WINDOW_S / (n - 1) : 0
  for (let i = 0; i < n; i++) {
    const now = t0 + i * dt
    const level = applyCompression(speechEnvelope(now), comp)
    out[i] = finite(clamp(softLimit(level * drive * voicedWave(now)), -1, 1))
  }
  return out
}

// ─── Transmit envelope per mode ──────────────────────────────────────────────

/**
 * The transmit envelope for a mode, 0..1, as a pure function of time.
 *
 * This is the ONLY place a mode's duty cycle enters the physics. The mean square
 * of this envelope over time equals the mode's published average-to-peak ratio,
 * so integrating the instantaneous dissipation through the thermal network
 * produces the right average heating without anything multiplying by a duty
 * factor a second time. `MODES[mode].dutyCycle` exists to be shown to the reader
 * and to be checked against this function in a test; it is not applied anywhere.
 *
 * Consequently every power figure in the application is instantaneous envelope
 * power — what a peak-reading meter shows, and what sets the voltage standing on
 * the feedline. Average power is what the heatsink feels, and it emerges from
 * integrating this over time rather than from a constant.
 */
export function modeEnvelope(mode: Mode, t: number, comp: number): number {
  const def = MODES[mode]
  if (def.constantEnvelope) return 1
  if (mode === 'CW') return cwEnvelope(t)
  if (mode === 'AM') {
    // Cycle-averaged envelope of a carrier modulated to depth m. Average power
    // is Pc(1 + m^2/2) and PEP is Pc(1 + m)^2 = 4Pc, so the cycle-averaged
    // envelope amplitude is sqrt((1 + m^2/2)/4). Note where that starts: a
    // quarter of PEP with the operator saying nothing at all.
    const m = applyCompression(speechEnvelope(t), comp)
    return Math.sqrt((1 + (m * m) / 2) / 4)
  }
  return applyCompression(speechEnvelope(t), comp)
}
