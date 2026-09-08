/**
 * Antinode — the station solver.
 *
 * `solveStation` is the single entry point the rest of the application calls.
 * It walks the signal the way the energy actually travels: microphone, audio,
 * DSP, PA, filters, connector, feedline, antenna, space. Everything the UI
 * draws is a projection of the object it returns.
 *
 * Two rules govern this file.
 *
 *  1. It never throws and never returns NaN. A teaching tool that blanks out
 *     when the operator picks an absurd combination teaches nothing, so every
 *     division is guarded and every number that leaves here is finite.
 *
 *  2. Power is conserved, exactly. See POWER INVARIANT below.
 */

import type {
  AntennaId, Complex, ComponentStress, LineResult, MatchFigures, Mode, PaResult,
  StageId, StageState, StandingWaveProfile, StationConfig, StationSolution,
  ThermalNodeDef, ThermalState, TunerMode, TunerSolution,
} from './types'
import { ANTENNAS, antennaExtras, antennaImpedance } from './antennas'
import { CABLES } from './cables'
import { solveLine, standingWaveProfile } from './line'
import { matchFigures } from './match'
import { solveTuner } from './tuner'
import { PA, solvePa } from './pa'
import { THERMAL_NODES } from './thermal'
import { MODES, alcReading } from './audio'

// ─── Representative constants ────────────────────────────────────────────────

/**
 * Radiation efficiency: the fraction of the power crossing the feedpoint that
 * leaves as radio waves. The rest becomes heat in the ground under the antenna,
 * in loading coils, and in matching transformers.
 *
 * These are representative figures, not measurements. They are the right order
 * of magnitude and, more importantly, the right *ranking*: a full-size dipole in
 * the clear radiates nearly everything it is given, a ground-mounted vertical
 * over a thin radial field throws about half of it into the dirt, and a short
 * loaded mobile whip on 20 m radiates around a tenth. The dummy load is 0 by
 * definition — that is what makes it a dummy load.
 */
const ANTENNA_EFFICIENCY: Readonly<Record<AntennaId, number>> = Object.freeze({
  'dummy-load': 0,
  'dipole-40': 0.92,
  'dipole-20': 0.94,
  'fan-dipole': 0.9,
  'efhw-40': 0.85,
  g5rv: 0.8,
  'ocf-windom': 0.85,
  'vertical-quarter-40': 0.55,
  'vertical-multiband': 0.45,
  'random-wire-9to1': 0.35,
  'mag-loop': 0.3,
  'mobile-whip-20': 0.12,
  'screwdriver-mobile': 0.2,
  'yagi-3el-20': 0.93,
})

/**
 * Of the power an antenna loses, the fraction lost in the matching transformer
 * at the feedpoint rather than in the ground or a loading coil. Representative.
 *
 * This is the number behind the commonest field failure in modern wire antenna
 * systems: a 49:1 transformer on an end-fed half wave is handling nearly all of
 * that antenna's loss in a core the size of a walnut, and it gets hot enough to
 * crack. A ground-mounted vertical loses just as much power, but it loses it
 * into several tonnes of soil, which does not mind.
 */
const FEEDPOINT_TRANSFORMER_SHARE: Readonly<Record<AntennaId, number>> = Object.freeze({
  'dummy-load': 0,
  'dipole-40': 0.05,
  'dipole-20': 0.05,
  'fan-dipole': 0.1,
  'efhw-40': 0.7,
  g5rv: 0.25,
  'ocf-windom': 0.55,
  'vertical-quarter-40': 0.02,
  'vertical-multiband': 0.05,
  'random-wire-9to1': 0.5,
  'mag-loop': 0.15,
  'mobile-whip-20': 0.05,
  'screwdriver-mobile': 0.05,
  'yagi-3el-20': 0.2,
})

/**
 * Average-to-PEP ratio of `speechEnvelope` after `applyCompression`, indexed by
 * COMP 0..10. Obtained by integrating mean(env^2) over a 512 s window at 1 ms
 * steps. `tests/chain.test.ts` re-derives it from the audio module and reads the
 * result back out of a solved station, so the table cannot drift away from the
 * compressor it describes.
 *
 * The teaching point lives in this array: COMP does not raise your peak power,
 * and the licence limit is a peak limit, but it more than doubles the average
 * power in the finals. That is why processed audio sounds louder and why the
 * heatsink notices.
 */
export const SPEECH_DUTY_BY_COMP: readonly number[] = [
  0.2073, 0.2253, 0.2564, 0.2906, 0.3256, 0.3597, 0.3899, 0.4155, 0.4358, 0.451, 0.4621,
]

/** Electret hand-microphone sensitivity, -44 dBV/Pa. Representative. */
const MIC_SENSITIVITY_V_PER_PA = 0.0063
/** Peak sound pressure of close talking, about 88 dB SPL. Representative. */
const MIC_PEAK_PRESSURE_PA = 0.5
/** Codec full scale, Vrms. Representative. */
const ADC_FULL_SCALE_V = 1.0
/** Codec word length. Representative; the point is the headroom, not the part. */
const ADC_BITS = 24

/**
 * Representative distribution of gain along the transmit chain, as the level in
 * dBm at each stage when the radio is making its rated 100 W (+50 dBm). The
 * numbers are shifted together with output power. What matters for teaching is
 * the span: a few tens of microwatts at the DAC becomes a hundred watts, a gain
 * of about 63 dB, and every one of those decibels has to be kept under control.
 */
const DRIVE_PLAN_DBM: Readonly<Record<string, number>> = Object.freeze({
  'tx-dac': -13,
  'tx-mixer': -9,
  bpf: -11,
  predriver: 14,
  driver: 34,
})

/** Confirmed: RD70HVF1 drain-source voltage rating, V. */
const FINAL_VDS_MAX_V = 30
/**
 * Peak drain voltage in normal operation. A push-pull stage swings each drain to
 * roughly twice the supply, so 13.8 V gives about 27.6 V — already within a few
 * volts of the 30 V rating before any mismatch at all.
 *
 * That is not a design flaw, it is how every 13.8 V HF final is built, and it is
 * the single best answer to "why does my radio turn the power down?". There is
 * almost no voltage headroom left, so a mismatch that arrives at the phase which
 * ADDS to the drain swing runs out of device in a hurry. Stress is therefore
 * reported relative to normal operation, not as a fraction of the rating —
 * otherwise the finals would read "stressed" into a dummy load.
 */
const FINAL_VDS_NORMAL_V = 2 * PA.supplyV
/** Confirmed: RD70HVF1 drain current rating per device, A. */
const FINAL_ID_MAX_A = 20
/** Peak voltage the LPF capacitors are specified for, V. Representative. */
const LPF_CAP_MAX_V = 650
/** Peak voltage the ATU capacitors are specified for, V. Representative. */
const ATU_CAP_MAX_V = 1800
/** Circulating current the ATU inductor can carry before it heats, A. Representative. */
const ATU_L_MAX_A = 20
/** RF current a UHF connector carries comfortably, A. Representative. */
const CONNECTOR_MAX_A = 10
/** Peak voltage a small feedpoint balun stands off before it arcs, V. Representative. */
const BALUN_MAX_V = 2500
/** Housekeeping dissipation: display, receiver, fan and regulators, W. Representative. */
const HOUSEKEEPING_W = 3
/** Contact resistance of a relay or a connector carrying RF, ohms. Representative. */
const CONTACT_RESISTANCE_OHM = 0.01

/**
 * Reporting floor for a component stress: a part has to be at least this far
 * from comfortable toward its limit before it is worth naming. Without it the
 * stress list fills with parts that are merely doing their job.
 */
const STRESS_REPORT_FLOOR = 0.3

// ─── Numeric helpers ─────────────────────────────────────────────────────────

const num = (x: number | undefined, fallback = 0): number =>
  typeof x === 'number' && Number.isFinite(x) ? x : fallback

const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x)

const clamp01 = (x: number): number => clamp(x, 0, 1)

/** Thermal node carrying the final devices' channel temperature. */
const PA_NODE = 'pa-junction'
/** Thermal node carrying the extruded heatsink at the back of the radio. */
const HEATSINK_NODE = 'pa-heatsink'
/** Thermal node for the low-pass filter relay contacts. */
const LPF_NODE = 'lpf-relay'
/** Thermal node for the tuner's switched inductors. */
const ATU_NODE = 'atu-inductor'
/** Thermal node for the antenna socket and the plug in it. */
const CONNECTOR_NODE = 'coax-connector'
/** Thermal node for the matching transformer out at the feedpoint. */
const BALUN_NODE = 'balun'

/** A node's definition, or undefined if the thermal model does not carry it. */
const nodeDef = (id: string): ThermalNodeDef | undefined =>
  THERMAL_NODES.find((n) => n.id === id)

/**
 * A node's temperature, falling back to ambient. A missing node means the
 * thermal model and this file have drifted apart, which is a bug — but a
 * teaching tool must keep drawing, so it reads as "cold" rather than as NaN.
 */
const tempOf = (thermal: ThermalState, id: string): number =>
  num(thermal.temps[id], num(thermal.ambientC, 25))

/** Power in watts as a level in dBm, floored so zero does not become -Infinity. */
const dbmOf = (watts: number): number => 10 * Math.log10(Math.max(num(watts), 1e-12) * 1000)

/** A dBm level as a display string. Below -110 dBm there is nothing to report. */
const fmtDbm = (dbm: number): string =>
  !Number.isFinite(dbm) || dbm < -110 ? 'idle' : `${dbm.toFixed(1)} dBm`

/** Power ratio from a loss in dB, guarded against absurd inputs. */
const lossFraction = (db: number): number => Math.pow(10, -clamp(num(db), 0, 60) / 10)

const cAbsSafe = (z: Complex): number => {
  const r = num(z.re)
  const i = num(z.im)
  return Math.sqrt(r * r + i * i)
}

// ─── Formatting ──────────────────────────────────────────────────────────────
//
// Stage levels are strings because a level is only meaningful with its unit, and
// the unit changes character completely along the chain: millivolts of audio,
// bits of headroom, dBm of drive, watts of RF, volts and amps on a feedline.
// src/ui/format.ts owns every number the panels render; these strings are part
// of the physics readout and are kept here so src/rf stays self-contained.

function fmtW(w: number): string {
  const v = Math.max(0, num(w))
  if (v < 1e-4) return '0 W'
  if (v < 1) return `${(v * 1000).toFixed(0)} mW`
  if (v < 10) return `${v.toFixed(2)} W`
  if (v < 100) return `${v.toFixed(1)} W`
  return `${v.toFixed(0)} W`
}

function fmtV(v: number): string {
  const x = Math.max(0, num(v))
  if (x < 1) return `${(x * 1000).toFixed(0)} mV`
  if (x < 100) return `${x.toFixed(1)} V`
  return `${x.toFixed(0)} V`
}

function fmtA(a: number): string {
  const x = Math.max(0, num(a))
  return x < 10 ? `${x.toFixed(2)} A` : `${x.toFixed(1)} A`
}

function fmtSwr(swr: number): string {
  const s = clamp(num(swr, 999), 1, 999)
  return s >= 999 ? 'inf:1' : `${s.toFixed(2)}:1`
}



/** CW, RTTY and FSK do not go anywhere near the microphone. */
function usesMicrophone(mode: Mode): boolean {
  return mode === 'LSB' || mode === 'USB' || mode === 'AM' || mode === 'FM'
}

/** DATA drives the same audio chain, just from a soundcard instead of a mic. */
function usesAudioPath(mode: Mode): boolean {
  return usesMicrophone(mode) || mode === 'DATA'
}

// ─── Sanitising wrappers around the other modules ────────────────────────────

/**
 * The configuration actually solved.
 *
 * Everything out of range is brought into range here, once, and the result is
 * what the solution reports back as `config`. That matters for more than
 * tidiness: the solution must contain no NaN anywhere, and the configuration is
 * part of the solution, so a NaN frequency arriving from a half-typed input box
 * must not survive into the object the UI reads.
 */
function sanitiseConfig(config: StationConfig): StationConfig {
  const antennaId: AntennaId = ANTENNAS[config.antennaId] ? config.antennaId : 'dummy-load'
  const tunerMode: TunerMode =
    config.tunerMode === 'bypass' ||
    config.tunerMode === 'internal' ||
    config.tunerMode === 'external-radio' ||
    config.tunerMode === 'external-antenna'
      ? config.tunerMode
      : 'bypass'
  const antennaParams: Record<string, number> = {}
  for (const [key, value] of Object.entries(config.antennaParams ?? {})) {
    antennaParams[key] = num(value)
  }
  return {
    freqHz: clamp(num(config.freqHz, 14_200_000), 100_000, 100_000_000),
    mode: MODES[config.mode] ? config.mode : 'USB',
    powerSetW: clamp(num(config.powerSetW, 100), 0, PA.ratedW),
    micGain: clamp(num(config.micGain, 50), 0, 100),
    compression: clamp(num(config.compression), 0, 10),
    antennaId,
    antennaParams,
    cableId: CABLES[config.cableId] ? config.cableId : 'rg58',
    cableLengthM: clamp(num(config.cableLengthM, 10), 0, 300),
    tunerMode,
    tunerEngaged: config.tunerEngaged === true,
    keyed: config.keyed === true,
    envelope: clamp01(num(config.envelope, 1)),
    ambientC: clamp(num(config.ambientC, 25), -40, 80),
    allowDamage: config.allowDamage === true,
  }
}

function safeZ(z: Complex | undefined): Complex {
  if (!z) return { re: 50, im: 0 }
  return { re: num(z.re, 50), im: num(z.im, 0) }
}

function safeMatch(z: Complex, z0: number): MatchFigures {
  const m = matchFigures(z, z0)
  const gammaMag = clamp(num(m.gammaMag), 0, 1)
  return {
    gamma: { re: num(m.gamma.re), im: num(m.gamma.im) },
    gammaMag,
    swr: clamp(num(m.swr, 999), 1, 999),
    returnLossDb: clamp(num(m.returnLossDb), 0, 200),
    mismatchLossDb: clamp(num(m.mismatchLossDb), 0, 200),
    reflectedFraction: clamp(num(m.reflectedFraction, gammaMag * gammaMag), 0, 1),
  }
}

function bypassTuner(z: Complex): TunerSolution {
  return {
    engaged: false,
    matched: false,
    topology: 'none',
    seriesL: 0,
    shuntC: 0,
    shuntC2: 0,
    q: 0,
    lossDb: 0,
    presentedZ: z,
    failureReason: '',
  }
}

function safeTuner(t: TunerSolution, fallbackZ: Complex): TunerSolution {
  return {
    engaged: t.engaged === true,
    matched: t.matched === true,
    topology: t.topology ?? 'none',
    seriesL: Math.max(0, num(t.seriesL)),
    shuntC: Math.max(0, num(t.shuntC)),
    shuntC2: Math.max(0, num(t.shuntC2)),
    q: clamp(num(t.q), 0, 500),
    lossDb: clamp(num(t.lossDb), 0, 6),
    presentedZ: safeZ(t.presentedZ ?? fallbackZ),
    failureReason: typeof t.failureReason === 'string' ? t.failureReason : '',
  }
}

function safeLine(l: LineResult): LineResult {
  const matched = clamp(num(l.matchedLossDb), 0, 60)
  const total = clamp(num(l.totalLossDb, matched), matched, 60)
  return {
    zIn: safeZ(l.zIn),
    matchedLossDb: matched,
    totalLossDb: total,
    excessLossDb: clamp(num(l.excessLossDb, total - matched), 0, 60),
    lengthWaves: Math.max(0, num(l.lengthWaves)),
    alpha: Math.max(0, num(l.alpha)),
    beta: Math.max(0, num(l.beta)),
  }
}

function safeProfile(p: StandingWaveProfile): StandingWaveProfile {
  const scrub = (a: Float32Array | undefined): Float32Array => {
    if (!a) return new Float32Array(0)
    for (let i = 0; i < a.length; i++) {
      const v = a[i] ?? 0
      a[i] = Number.isFinite(v) ? v : 0
    }
    return a
  }
  return {
    positions: scrub(p.positions),
    vMag: scrub(p.vMag),
    iMag: scrub(p.iMag),
    phase: scrub(p.phase),
    antinodes: (p.antinodes ?? []).filter((x) => Number.isFinite(x)),
    nodes: (p.nodes ?? []).filter((x) => Number.isFinite(x)),
    vPeakVolts: Math.max(0, num(p.vPeakVolts)),
    iPeakAmps: Math.max(0, num(p.iPeakAmps)),
  }
}

/**
 * Rebuild the PA result with every field sanitised and self-consistent.
 *
 * reflectedW is forced to forwardW * |gamma|^2 and netW to the difference, so
 * the power accounting below telescopes exactly against the numbers the UI is
 * shown. A PA result that reflected more than it produced would break the
 * invariant silently.
 */
function safePa(p: PaResult, gammaMag: number, requestedW: number): PaResult {
  const forwardW = clamp(num(p.forwardW), 0, PA.ratedW * 2)
  const reflectedW = clamp(forwardW * gammaMag * gammaMag, 0, forwardW)
  const prot = p.protection
  return {
    requestedW: clamp(num(p.requestedW, requestedW), 0, PA.ratedW * 2),
    forwardW,
    reflectedW,
    netW: forwardW - reflectedW,
    dcInputW: clamp(num(p.dcInputW), 0, 5000),
    supplyCurrentA: clamp(num(p.supplyCurrentA), 0, 400),
    paDissipationW: clamp(num(p.paDissipationW), 0, 5000),
    efficiency: clamp(num(p.efficiency), 0, 1),
    voltageStress: clamp(num(p.voltageStress, 1), 0, 20),
    currentStress: clamp(num(p.currentStress, 1), 0, 20),
    protection: {
      level: prot?.level ?? 'normal',
      foldback: clamp(num(prot?.foldback, 1), 0, 1),
      reasons: Array.isArray(prot?.reasons) ? prot.reasons : [],
      swrTriggered: prot?.swrTriggered === true,
      tempTriggered: prot?.tempTriggered === true,
      currentTriggered: prot?.currentTriggered === true,
    },
  }
}

// ─── Shared derived quantities ───────────────────────────────────────────────

/** The parts of a solution the power bookkeeping needs. */
type PowerView = Pick<
  StationSolution,
  'config' | 'pa' | 'radiatedW' | 'cableLossW' | 'tunerLossW' | 'antennaZ' | 'radioMatch'
>

function antennaIdOf(id: AntennaId): AntennaId {
  return ANTENNAS[id] ? id : 'dummy-load'
}

/**
 * Radiating efficiency of the antenna as it is actually set up right now.
 *
 * This has to come from the antenna model rather than from a constant per type,
 * because efficiency depends on the very parameters the reader is moving. The
 * clearest case is the ground-mounted vertical: laying down more radials pulls
 * the feedpoint resistance DOWN toward 36 ohms, which makes the SWR worse, while
 * making the antenna substantially more efficient. A fixed table cannot show
 * that, and it is one of the most useful things an operator can learn.
 *
 * ANTENNA_EFFICIENCY remains as the fallback for an antenna whose model does not
 * report a figure, and as the documented typical value for each type.
 */
function efficiencyOf(id: AntennaId, freqHz: number, params: Readonly<Record<string, number>>): number {
  const antennaId = antennaIdOf(id)
  const fallback = num(ANTENNA_EFFICIENCY[antennaId], 0.8)
  const f = Number.isFinite(freqHz) ? clamp(freqHz, 1e5, 1e8) : 14.2e6
  try {
    const extras = antennaExtras(antennaId, f, params ?? {})
    return clamp01(num(extras.efficiency, fallback))
  } catch {
    return clamp01(fallback)
  }
}

/**
 * Power crossing the antenna feedpoint, W.
 *
 * radiatedW is the efficiency times this, so normally it divides straight back
 * out. A dummy load has zero efficiency and radiates nothing, so for that case
 * fall back to the accounting: whatever left the socket and survived the cable
 * and the tuner arrived at the load and became heat.
 */
function feedpointPowerOf(solution: PowerView): number {
  const efficiency = efficiencyOf(
    solution.config.antennaId,
    solution.config.freqHz,
    solution.config.antennaParams,
  )
  if (efficiency > 0.001) return Math.max(0, solution.radiatedW / efficiency)
  return Math.max(0, solution.pa.netW - solution.cableLossW - solution.tunerLossW)
}

/** Power the antenna turns into heat rather than radio waves, W. */
function antennaLossOf(solution: PowerView): number {
  return Math.max(0, feedpointPowerOf(solution) - Math.max(0, solution.radiatedW))
}

/**
 * Root-mean-square RF current through a series element at the radio end, A.
 *
 * sqrt(P/Z0) is the current a matched line carries; standing waves raise the
 * current at a current antinode by roughly sqrt(SWR). Current, not power, is
 * what pits a relay contact and cooks a connector.
 */
function seriesCurrentA(netW: number, swr: number, z0 = 50): number {
  const p = Math.max(0, num(netW))
  return Math.sqrt(p / Math.max(1, z0)) * Math.sqrt(clamp(num(swr, 1), 1, 999))
}

// ─── The solver ──────────────────────────────────────────────────────────────

/**
 * Solve the whole station for one instant.
 *
 * POWER INVARIANT — asserted in tests across a grid of configurations, to 1e-6 W:
 *
 *     pa.forwardW  =  pa.reflectedW      power turned round at the radio
 *                  +  tunerLossW         heat in the matching network
 *                  +  cableLossW         heat in the coax
 *                  +  antennaLossW       heat in the ground and the loading coil
 *                  +  radiatedW          radio waves
 *
 * Each term is produced by subtracting from the one above it, so the sum
 * telescopes and is exact to floating point rather than merely close.
 *
 * radiatedW is the power that actually leaves as radio waves. The power crossing
 * the feedpoint is larger, and is reported separately on the 'antenna' stage,
 * because the gap between those two numbers is the entire argument about short
 * verticals and mag loops. antennaLossW is that gap; a dummy load is the limit
 * case where it is all of it.
 *
 * Insertion loss in the low-pass filter bank, the antenna relay and the SO-239
 * (about 0.2 dB in total) is folded into the PA efficiency, so forwardW is the
 * power measured at the antenna socket — which is also where the SWR bridge is.
 */
export function solveStation(config: StationConfig, thermal: ThermalState): StationSolution {
  try {
    return solveStationInner(config, thermal)
  } catch {
    // A teaching tool must keep drawing. If a model throws on some corner of the
    // input space the tests are meant to catch it, so the fallback is loud.
    return degradedSolution(config)
  }
}

function solveStationInner(raw: StationConfig, thermal: ThermalState): StationSolution {
  const warnings: string[] = []

  // ── Sanitise the request ───────────────────────────────────────────────────
  const config = sanitiseConfig(raw)
  const { freqHz, micGain, compression, cableLengthM, powerSetW, keyed, antennaId } = config
  const mode = config.mode
  const cable = CABLES[config.cableId]
  const antennaDef = ANTENNAS[antennaId]
  const params = config.antennaParams
  const constantEnvelope = MODES[mode].constantEnvelope
  const envelope = keyed ? (constantEnvelope ? 1 : config.envelope) : 0

  // ── 1. Antenna feedpoint impedance ────────────────────────────────────────
  const antennaZ = safeZ(antennaImpedance(antennaId, freqHz, params))

  // ── 2. Antenna-end match ──────────────────────────────────────────────────
  // Referenced to the feedline, not to 50 ohms: it is the ratio between the
  // antenna and the line it is attached to that sets the standing wave. On
  // ladder line a 50 ohm antenna is a 9:1 mismatch, and that is not a fault.
  const antennaMatch = safeMatch(antennaZ, cable.z0)

  // ── 3. Tuner position decides the order of operations ─────────────────────
  const tunerAtAntenna = config.tunerMode === 'external-antenna'
  const tunerAtRadio = config.tunerMode === 'internal' || config.tunerMode === 'external-radio'

  let antennaTuner = bypassTuner(antennaZ)
  if (tunerAtAntenna) {
    antennaTuner = safeTuner(
      solveTuner({ mode: 'external-antenna', zL: antennaZ, freqHz, engaged: true }),
      antennaZ,
    )
  }
  // A tuner that cannot find a match drops out of circuit rather than sitting
  // there adding loss to a mismatch it is not fixing.
  const antennaTunerActive = tunerAtAntenna && antennaTuner.matched
  const lineLoadZ = antennaTunerActive ? antennaTuner.presentedZ : antennaZ

  // ── 4. The line ───────────────────────────────────────────────────────────
  const line = safeLine(solveLine(lineLoadZ, cable, freqHz, cableLengthM))
  const lineInputZ = line.zIn
  const lineMatch = safeMatch(lineInputZ, 50)
  // Reflection referenced to the cable, which is what actually travels on it.
  const lineGammaMag = clamp(num(safeMatch(lineInputZ, cable.z0).gammaMag), 0, 0.999)

  // ── 5. Tuner at the radio end ─────────────────────────────────────────────
  let radioTuner = bypassTuner(lineInputZ)
  if (tunerAtRadio) {
    radioTuner = safeTuner(
      solveTuner({ mode: config.tunerMode, zL: lineInputZ, freqHz, engaged: true }),
      lineInputZ,
    )
  }
  const radioTunerActive = tunerAtRadio && radioTuner.matched
  const tuner = tunerAtAntenna ? antennaTuner : radioTuner

  // ── 6. What the bridge in the radio sees ──────────────────────────────────
  const radioLoadZ = radioTunerActive ? radioTuner.presentedZ : lineInputZ
  const radioMatch = safeMatch(radioLoadZ, 50)

  // ── 7. The PA ─────────────────────────────────────────────────────────────
  const requestedW = keyed ? powerSetW : 0
  const paTempC = tempOf(thermal, PA_NODE)
  const paDamage = clamp01(num(thermal.damage[PA_NODE]))
  const pa = safePa(
    solvePa({
      requestedW,
      gamma: radioMatch.gamma,
      envelope,
      // The PA model can average over a duty cycle, but this application does
      // not use that: the duty lives in the envelope, which is sampled every
      // frame, and averaging happens in the thermal network. See modeEnvelope().
      duty: 1,
      paTempC,
      damage: paDamage,
    }),
    radioMatch.gammaMag,
    requestedW,
  )

  // ── 8. Power accounting ───────────────────────────────────────────────────
  // Each line takes what arrived, removes what that element keeps, and passes on
  // the rest. Nothing appears and nothing vanishes.
  const forwardW = pa.forwardW
  // Everything that is not turned round at the antenna socket goes on down the
  // chain; pa.netW is forwardW minus pa.reflectedW by construction in safePa.
  const deliveredAtSocketW = Math.max(0, forwardW - pa.reflectedW)

  const radioTunerLossW = radioTunerActive
    ? deliveredAtSocketW * (1 - lossFraction(radioTuner.lossDb))
    : 0
  const intoLineW = Math.max(0, deliveredAtSocketW - radioTunerLossW)

  // The total-loss figure already includes the extra heating that standing waves
  // cause, so this single multiplication carries the whole story of why a
  // mismatch on a lossy cable is expensive.
  const atLineEndW = intoLineW * lossFraction(line.totalLossDb)
  const cableLossW = Math.max(0, intoLineW - atLineEndW)

  const antennaTunerLossW = antennaTunerActive
    ? atLineEndW * (1 - lossFraction(antennaTuner.lossDb))
    : 0
  const feedpointW = Math.max(0, atLineEndW - antennaTunerLossW)

  const efficiency = efficiencyOf(antennaId, freqHz, params)
  const radiatedW = feedpointW * efficiency
  const antennaLossW = Math.max(0, feedpointW - radiatedW)
  const tunerLossW = radioTunerLossW + antennaTunerLossW

  // Volts and amps on the line are set by the PEAK of the envelope, not by the
  // instant: the dielectric does not get a vote on syllables, and a stress
  // figure that collapsed between words would be useless. Scale the
  // instantaneous power back up to the envelope peak, then recover the forward
  // wave from the net power, because on a mismatched line the forward wave is
  // the larger of the two and it is the one that sets the height of the
  // antinodes.
  const envSquared = Math.max(envelope * envelope, 1e-3)
  const peakIntoLineW = keyed ? intoLineW / envSquared : 0
  const lineForwardW = peakIntoLineW / Math.max(1e-6, 1 - lineGammaMag * lineGammaMag)
  const standingWave = safeProfile(
    standingWaveProfile({
      zL: lineLoadZ,
      cable,
      freqHz,
      lengthM: cableLengthM,
      forwardW: Math.min(lineForwardW, PA.ratedW * 50),
    }),
  )

  // ── Warnings, in the order an operator would want them ────────────────────
  if (keyed && radioMatch.swr >= 999) {
    warnings.push('The load looks like an open or a short. Check the feedline and the connectors before transmitting again.')
  } else if (keyed && radioMatch.swr > 3) {
    warnings.push(`SWR at the radio is ${fmtSwr(radioMatch.swr)}. The PA is protecting itself by reducing power.`)
  }
  if (tunerAtAntenna && !antennaTuner.matched) {
    warnings.push(antennaTuner.failureReason || 'The antenna tuner could not match this load.')
  }
  if (tunerAtAntenna && Math.abs(cable.z0 - 50) > 5) {
    // A remote tuner is a 50 ohm device: it presents 50 ohms to the feedline
    // whatever the antenna is doing. Feeding one with open-wire line puts the
    // mismatch back on the feeder, in the one place it was meant to remove it.
    warnings.push(`A remote tuner matches the antenna to 50 ohms, but this feedline is ${cable.z0.toFixed(0)} ohms. Either use coax to the tuner, or put the matching at the radio end.`)
  }
  if (keyed && antennaDef?.needsTuner && !tunerAtAntenna && !radioTunerActive) {
    warnings.push(`${antennaDef.name} is not a 50 ohm antenna on its own. It needs a matching network somewhere to be usable here.`)
  }
  if (tunerAtRadio && !radioTuner.matched) {
    warnings.push(radioTuner.failureReason || 'The tuner could not match this load.')
  }
  if (keyed && cableLossW > 0.15 * Math.max(forwardW, 1e-9)) {
    const pct = (100 * cableLossW) / Math.max(forwardW, 1e-9)
    warnings.push(`${fmtW(cableLossW)} of ${fmtW(forwardW)} is heating the coax, ${pct.toFixed(0)} percent of your output. A shorter run or a lower-loss cable would get it back.`)
  }
  if (keyed && antennaLossW > 0.3 * Math.max(feedpointW, 1e-9) && antennaId !== 'dummy-load') {
    warnings.push(`Only ${fmtW(radiatedW)} of the ${fmtW(feedpointW)} reaching the antenna is radiated; the rest heats the ground and the loading coil.`)
  }
  if (keyed && usesAudioPath(mode) && alcReading(envelope, micGain, compression) > 0.8) {
    warnings.push('The ALC is well past the top of its zone. Turn the drive down until the peaks just reach the top mark.')
  }
  const paNode = nodeDef(PA_NODE)
  if (paNode && paTempC > paNode.warnC) {
    warnings.push(`The finals are at ${paTempC.toFixed(0)} C. Reduce power or let the fan catch up.`)
  }
  for (const reason of pa.protection.reasons) {
    if (typeof reason === 'string' && reason.length > 0) warnings.push(reason)
  }

  const base: Omit<StationSolution, 'stages' | 'stresses'> = {
    config,
    antennaZ,
    antennaMatch,
    lineInputZ,
    lineMatch,
    line,
    tuner,
    radioLoadZ,
    radioMatch,
    pa,
    radiatedW,
    cableLossW,
    tunerLossW,
    standingWave,
    warnings,
  }

  // ── 9. Stages and stresses ────────────────────────────────────────────────
  const stages = stageStates(base, thermal)
  const stresses = componentStresses({ ...base, stages }, thermal)

  return { ...base, stages, stresses }
}

// ─── Stage states ────────────────────────────────────────────────────────────

const STAGE_ORDER: readonly StageId[] = [
  'voice', 'mic-element', 'mic-preamp', 'af-adc', 'dsp-tx', 'tx-dac', 'tx-mixer',
  'bpf', 'predriver', 'driver', 'final-pa', 'lpf-bank', 'ant-relay', 'swr-bridge',
  'atu', 'so239', 'feedline', 'antenna', 'space',
]

function stage(
  id: StageId,
  activity: number,
  level: string,
  value: number,
  unit: string,
  stress = 0,
  tempC: number | null = null,
  alarm = '',
): StageState {
  return {
    id,
    activity: clamp01(num(activity)),
    level,
    value: num(value),
    unit,
    stress: clamp01(num(stress)),
    tempC: tempC === null ? null : num(tempC, 25),
    alarm,
  }
}

/**
 * One entry per stage, in signal order, each carrying a level in the unit that
 * stage is actually measured in. The chain spans about 180 dB from the pressure
 * on the microphone diaphragm to the volts on the feedline, which is why no
 * single unit works for all of it.
 */
export function stageStates(
  solution: Omit<StationSolution, 'stages' | 'stresses'>,
  thermal: ThermalState,
): readonly StageState[] {
  const cfg = solution.config
  const mode: Mode = MODES[cfg.mode] ? cfg.mode : 'USB'
  const keyed = cfg.keyed === true
  const constantEnvelope = MODES[mode].constantEnvelope
  const envelope = keyed ? (constantEnvelope ? 1 : clamp01(num(cfg.envelope, 1))) : 0
  const micGain = clamp(num(cfg.micGain, 50), 0, 100)
  const compression = clamp(num(cfg.compression), 0, 10)
  const audioLive = keyed && usesAudioPath(mode)
  const micLive = keyed && usesMicrophone(mode)

  const pa = solution.pa
  // Three different powers, and confusing them is how people end up arguing
  // about wattmeters:
  //   pepW      peak envelope power, what the licence limits and what a
  //             peak-reading meter shows: the setting, less any foldback
  //   averageW  what actually heats the finals, PEP times the duty cycle
  //   instantW  the envelope power at this instant, which is what the drive
  //             levels in the low-level stages are carrying right now
  // forwardW is whatever the PA module reports and is what the power accounting
  // is built on; it is shown as the value on this stage.
  const forwardW = pa.forwardW
  const envSq = Math.max(envelope * envelope, 1e-6)
  const foldback = clamp01(num(pa.protection.foldback, 1))
  const pepW = keyed ? clamp(num(pa.requestedW), 0, PA.ratedW) * foldback : 0
  // Displayed average power. The solver works in instantaneous envelope power,
  // so the long-run average for this mode comes from its published duty cycle,
  // which is the same number modeEnvelope() is verified against.
  const averageW = pepW * clamp(num(MODES[mode].dutyCycle, 1), 0.01, 1)
  const instantW = pepW * envSq
  const driveShiftDb = dbmOf(instantW) - dbmOf(Math.max(PA.ratedW, 1))
  const rfActivity = keyed ? clamp01(Math.sqrt(clamp01(forwardW / Math.max(PA.ratedW, 1)))) : 0

  // Audio-domain levels.
  const pressurePa = micLive ? MIC_PEAK_PRESSURE_PA * envelope : 0
  const splDb = 20 * Math.log10(Math.max(pressurePa, 2e-8) / 2e-5)
  const micV = pressurePa * MIC_SENSITIVITY_V_PER_PA
  const preampGainDb = 20 + 0.3 * micGain
  const preampV = micV * Math.pow(10, preampGainDb / 20)
  const adcDbfs = 20 * Math.log10(Math.max(preampV, 1e-9) / ADC_FULL_SCALE_V)
  const alc = audioLive ? alcReading(envelope, micGain, compression) : 0
  // The DSP normalises to a target level, so its output tracks the compressor
  // rather than the microphone: this is where COMP actually happens.
  const dspRel = audioLive ? clamp01(envelope * (micGain / 50)) : 0
  const dspDbfs = 20 * Math.log10(Math.max(dspRel, 1e-6)) - 1
  // A data mode feeds the same codec from the computer instead of from the
  // microphone, so the codec is busy even though the mic amplifier is not.
  const codecDbfs = micLive
    ? adcDbfs
    : audioLive
      ? 20 * Math.log10(Math.max(dspRel, 1e-6)) - 6
      : -120
  const codecBits = clamp(ADC_BITS + codecDbfs / 6.02, 0, ADC_BITS)

  // Stages the microphone amplifier feeds, and stages the codec feeds. In CW and
  // FSK neither is in the path at all, and saying so is more useful than zero.
  const micLabel = usesMicrophone(mode) ? '' : `no microphone in ${mode}`
  const codecLabel = usesAudioPath(mode) ? '' : `no audio path in ${mode}`
  const micText = (text: string): string => (micLabel !== '' ? micLabel : keyed ? text : 'idle')
  const codecText = (text: string): string =>
    codecLabel !== '' ? codecLabel : keyed ? text : 'idle'

  const swr = solution.radioMatch.swr
  const paNode = nodeDef(PA_NODE)
  const paTempC = tempOf(thermal, PA_NODE)
  const heatsinkTempC = tempOf(thermal, HEATSINK_NODE)
  const paStress = paNode
    ? clamp01((paTempC - paNode.warnC) / Math.max(1, paNode.damageC - paNode.warnC))
    : 0

  const tuner = solution.tuner
  const tunerActive = tuner.engaged && tuner.matched
  const sw = solution.standingWave
  const vPeak = sw.vPeakVolts
  const iPeak = sw.iPeakAmps

  const cableLossW = solution.cableLossW
  const tunerLossW = solution.tunerLossW
  const radiatedW = solution.radiatedW
  const efficiency = efficiencyOf(cfg.antennaId, cfg.freqHz, cfg.antennaParams)
  const feedpointW = feedpointPowerOf(solution)

  const out: StageState[] = []
  for (const id of STAGE_ORDER) {
    switch (id) {
      case 'voice':
        out.push(stage(id, micLive ? envelope : 0, micText(`${splDb.toFixed(0)} dB SPL`), micLive ? splDb : 0, 'dB SPL'))
        break
      case 'mic-element':
        out.push(stage(id, micLive ? envelope : 0, micText(fmtV(micV)), micV, 'V'))
        break
      case 'mic-preamp':
        out.push(stage(id, micLive ? envelope : 0, micText(`${fmtV(preampV)}, +${preampGainDb.toFixed(0)} dB of gain`), preampV, 'V'))
        break
      case 'af-adc':
        out.push(stage(id, audioLive ? dspRel : 0, codecText(`${codecDbfs.toFixed(1)} dBFS, ${codecBits.toFixed(0)} of ${ADC_BITS} bits in use`), codecDbfs, 'dBFS'))
        break
      case 'dsp-tx': {
        const clipping = dspRel >= 0.999 && alc > 0.9
        out.push(stage(id, audioLive ? dspRel : 0, codecText(`${dspDbfs.toFixed(1)} dBFS, ALC at ${(alc * 100).toFixed(0)} percent`), audioLive ? dspDbfs : -120, 'dBFS', clipping ? 0.6 : 0, null, clipping ? 'ALC is limiting hard; the peaks are being flattened' : ''))
        break
      }
      case 'tx-dac':
      case 'tx-mixer':
      case 'bpf':
      case 'predriver':
      case 'driver': {
        const planDbm = num(DRIVE_PLAN_DBM[id], 0) + driveShiftDb
        const dbm = keyed ? planDbm : -120
        out.push(stage(id, rfActivity, fmtDbm(dbm), dbm, 'dBm'))
        break
      }
      case 'final-pa': {
        const alarm =
          pa.protection.level === 'shutdown'
            ? 'The PA has shut down to save itself'
            : pa.protection.level === 'foldback' || pa.protection.level === 'limit'
              ? 'The PA is folding back'
              : paStress > 0.5
                ? 'The finals are running hot'
                : ''
        out.push(stage(id, rfActivity, keyed ? `${fmtW(pepW)} PEP, ${fmtW(averageW)} average` : 'idle', forwardW, 'W', paStress, paTempC, alarm))
        break
      }
      case 'lpf-bank':
        out.push(stage(id, rfActivity, keyed ? `${fmtW(forwardW)} through the ${(num(cfg.freqHz, 0) / 1e6).toFixed(1)} MHz filter` : 'idle', forwardW, 'W', 0, heatsinkTempC))
        break
      case 'swr-bridge':
        out.push(stage(id, rfActivity, keyed ? `${fmtW(forwardW)} forward, ${fmtW(pa.reflectedW)} reflected, ${fmtSwr(swr)}` : `${fmtSwr(swr)}`, swr, ':1', clamp01((swr - 1.5) / 8)))
        break
      case 'atu':
        out.push(stage(id, tunerActive ? rfActivity : 0, tuner.engaged ? (tuner.matched ? `matched, ${tuner.lossDb.toFixed(2)} dB loss, Q ${tuner.q.toFixed(0)}` : 'no match found, bypassed') : 'bypassed', tunerLossW, 'W', 0, null, tuner.engaged && !tuner.matched ? tuner.failureReason : ''))
        break
      case 'ant-relay':
        // Before the tuner in the chain, so no tuner loss has been taken yet.
        out.push(stage(id, rfActivity, keyed ? fmtW(Math.max(0, pa.netW - tunerLossW)) : 'idle', Math.max(0, pa.netW - tunerLossW), 'W'))
        break
      case 'so239': {
        // Current through the connector, the thing that actually burns.
        const connectorA = seriesCurrentA(pa.netW - tunerLossW, solution.lineMatch.swr)
        out.push(stage(id, rfActivity, keyed ? `${fmtW(Math.max(0, pa.netW - tunerLossW))}, ${fmtA(connectorA)}` : 'idle', connectorA, 'A'))
        break
      }
      case 'feedline':
        out.push(stage(id, rfActivity, keyed ? `${fmtV(vPeak)} peak, ${fmtA(iPeak)} peak, ${fmtW(cableLossW)} lost as heat` : 'idle', vPeak, 'V', clamp01(cableLossW / Math.max(1, forwardW))))
        break
      case 'antenna': {
        const zText = `${num(solution.antennaZ.re).toFixed(0)}${num(solution.antennaZ.im) >= 0 ? '+j' : '-j'}${Math.abs(num(solution.antennaZ.im)).toFixed(0)} ohms`
        out.push(stage(id, rfActivity, keyed ? `${fmtW(feedpointW)} at the feedpoint into ${zText}` : zText, feedpointW, 'W'))
        break
      }
      case 'space':
        out.push(stage(id, keyed ? clamp01(Math.sqrt(clamp01(radiatedW / Math.max(PA.ratedW, 1)))) : 0, keyed ? `${fmtW(radiatedW)} radiated, ${(efficiency * 100).toFixed(0)} percent of the feedpoint power` : 'idle', radiatedW, 'W'))
        break
    }
  }
  return out
}

// ─── Component stresses ──────────────────────────────────────────────────────

interface StressInput {
  readonly componentId: string
  readonly kind: ComponentStress['kind']
  readonly value: number
  /** Comfortable: severity 0. */
  readonly onset: number
  /** The manufacturer limit: severity 1. */
  readonly limit: number
  readonly measured: string
  readonly limitLabel: string
  readonly failureMode: string
  readonly timescale: ComponentStress['timescale']
}

function stressOf(input: StressInput): ComponentStress | null {
  const value = num(input.value)
  const span = input.limit - input.onset
  const severity = span > 0 ? (value - input.onset) / span : value > input.onset ? 1 : 0
  if (!(severity >= STRESS_REPORT_FLOOR)) return null
  return {
    componentId: input.componentId,
    kind: input.kind,
    severity: clamp(severity, 0, 4),
    measured: input.measured,
    limit: input.limitLabel,
    failureMode: input.failureMode,
    timescale: input.timescale,
  }
}

/**
 * The parts outside the PA that thermal.ts models. Each of them fails the same
 * way: it gets hot, its loss rises with temperature, and so it gets hotter. The
 * measurement that matters for all three is the temperature, not the volts.
 */
const SECONDARY_THERMAL: readonly {
  readonly node: string
  readonly componentId: string
  readonly kind: ComponentStress['kind']
  readonly failureMode: string
}[] = [
  {
    node: LPF_NODE,
    componentId: 'lpf-relay',
    kind: 'relay-arcing',
    failureMode: 'The contacts oxidise, their resistance climbs, and they heat themselves until they weld.',
  },
  {
    node: ATU_NODE,
    componentId: 'atu-inductor',
    kind: 'circulating-current',
    failureMode: 'The core loses permeability as it heats, the match drifts off, and the current rises again.',
  },
  {
    node: CONNECTOR_NODE,
    componentId: 'coax-connector',
    kind: 'connector-heating',
    failureMode: 'The polyethylene behind the connector softens and the centre conductor works its way out of centre.',
  },
  {
    node: BALUN_NODE,
    componentId: 'balun',
    kind: 'core-saturation',
    failureMode: 'Ferrite loss rises with temperature, so a core that is already hot takes more of the power.',
  },
]

/**
 * What is actually being hurt right now, and by what.
 *
 * A mismatch does not stress a radio uniformly: it raises the voltage at some
 * phases of gamma and the current at others, and those are different failure
 * modes in different parts. An idle radio returns an empty list, and a matched
 * hundred watts should return one too.
 */
export function componentStresses(
  solution: Omit<StationSolution, 'stresses'>,
  thermal: ThermalState,
): readonly ComponentStress[] {
  const out: ComponentStress[] = []
  const cfg = solution.config
  const keyed = cfg.keyed === true
  const pa = solution.pa
  const tuner = solution.tuner
  const sw = solution.standingWave
  const swr = solution.radioMatch.swr
  const gammaMag = solution.radioMatch.gammaMag

  // Junction temperature. Both devices in the pair share the heatsink and share
  // the fate, so both are reported.
  const paNode = nodeDef(PA_NODE)
  const paTempC = tempOf(thermal, PA_NODE)
  if (paNode) {
    for (const deviceId of ['final-q1', 'final-q2']) {
      const s = stressOf({
        componentId: deviceId,
        kind: 'junction-temperature',
        value: paTempC,
        onset: paNode.warnC,
        limit: paNode.damageC,
        measured: `${paTempC.toFixed(0)} C junction`,
        limitLabel: `${paNode.damageC.toFixed(0)} C`,
        failureMode: 'The die runs away thermally and the device shorts drain to source.',
        timescale: paTempC > paNode.criticalC ? 'seconds' : 'minutes',
      })
      if (s) out.push(s)
    }
  }
  const heatsinkNode = nodeDef(HEATSINK_NODE)
  const heatsinkTempC = tempOf(thermal, HEATSINK_NODE)
  if (heatsinkNode) {
    const s = stressOf({
      componentId: 'pa-heatsink',
      kind: 'junction-temperature',
      value: heatsinkTempC,
      onset: heatsinkNode.warnC,
      limit: heatsinkNode.damageC,
      measured: `${heatsinkTempC.toFixed(0)} C`,
      limitLabel: `${heatsinkNode.damageC.toFixed(0)} C`,
      failureMode: 'The heatsink stops being a heatsink and the finals have nowhere to send their heat.',
      timescale: 'minutes',
    })
    if (s) out.push(s)
  }

  // Voltage and current are peak quantities, so they are referred to the top of
  // the envelope at this instant, not to the duty-weighted average. A device
  // does not survive a 100 W peak by being told the average was only 20 W.
  const mode: Mode = MODES[cfg.mode] ? cfg.mode : 'USB'
  const envelope = keyed
    ? MODES[mode].constantEnvelope
      ? 1
      : clamp01(num(cfg.envelope, 1))
    : 0
  const foldback = clamp01(num(pa.protection.foldback, 1))
  const peakForwardW =
    clamp(num(pa.requestedW), 0, PA.ratedW) * foldback * envelope * envelope

  if (keyed && peakForwardW > 0.5) {
    // Drain voltage. At full drive into a matched load the drain swings from
    // near zero to twice the supply; a mismatch that presents a high impedance
    // at the right phase of gamma adds to the top of that swing.
    const drainPeakV =
      PA.supplyV * (1 + Math.sqrt(clamp01(peakForwardW / PA.ratedW)) * pa.voltageStress)
    for (const deviceId of ['final-q1', 'final-q2']) {
      const s = stressOf({
        componentId: deviceId,
        kind: 'peak-voltage',
        value: drainPeakV,
        onset: FINAL_VDS_NORMAL_V * 1.04,
        limit: FINAL_VDS_MAX_V,
        measured: `${drainPeakV.toFixed(0)} V peak on the drain`,
        limitLabel: `${FINAL_VDS_MAX_V} V (representative)`,
        failureMode: 'Avalanche breakdown punches through the drain-source junction; the device fails short, instantly.',
        timescale: 'instant',
      })
      if (s) out.push(s)
    }
    // Peak drain current per device.
    //
    // Each device of a push-pull pair conducts on alternate half cycles, so its
    // current is a half sine whose average over the WHOLE cycle is Ipeak/pi.
    // The pair's DC therefore implies a peak of pi times the per-device average,
    // not twice it — the earlier factor of 2 was a guess and understated it.
    //
    // Like the drain-voltage stress, this is reported relative to what a matched
    // load already demands rather than as a fraction of the rating. A pair of
    // 70 W devices making 100 W from 13.8 V is close to its current rating at
    // the design point, so a fraction-of-rating threshold would light up into a
    // dummy load and tell the reader that normal operation is a fault.
    const devices = Math.max(1, PA.deviceCount)
    const peakDcA = peakForwardW / Math.max(0.05, pa.efficiency) / PA.supplyV
    const drainPeakA = (Math.PI * peakDcA * pa.currentStress) / devices
    const matchedPeakA = (Math.PI * (PA.ratedW / PA.peakEfficiency / PA.supplyV)) / devices
    for (const deviceId of ['final-q1', 'final-q2']) {
      const s = stressOf({
        componentId: deviceId,
        kind: 'peak-current',
        value: drainPeakA,
        onset: matchedPeakA * 1.04,
        limit: Math.max(FINAL_ID_MAX_A, matchedPeakA * 1.05),
        measured: `${drainPeakA.toFixed(1)} A peak in each device`,
        limitLabel: `${Math.max(FINAL_ID_MAX_A, matchedPeakA * 1.05).toFixed(0)} A per device (representative)`,
        failureMode: 'The bond wires fuse, or the die overheats in one carrier cycle.',
        timescale: 'instant',
      })
      if (s) out.push(s)
    }

    // Low-pass filter. The filter sees the PA output voltage raised by whatever
    // the mismatch adds to it.
    const lpfPeakV = Math.sqrt(2 * peakForwardW * 50) * (1 + gammaMag)
    const lpfCap = stressOf({
      componentId: 'lpf-cap',
      kind: 'peak-voltage',
      value: lpfPeakV,
      onset: 0.4 * LPF_CAP_MAX_V,
      limit: LPF_CAP_MAX_V,
      measured: `${lpfPeakV.toFixed(0)} V peak`,
      limitLabel: `${LPF_CAP_MAX_V} V (representative)`,
      failureMode: 'The capacitor arcs internally and the filter loses its shape, putting harmonics on the air.',
      timescale: 'instant',
    })
    if (lpfCap) out.push(lpfCap)

    const relayA = seriesCurrentA(pa.netW, swr)
    const lpfRelay = stressOf({
      componentId: 'lpf-relay',
      kind: 'relay-arcing',
      value: relayA,
      onset: 0.5 * CONNECTOR_MAX_A,
      limit: CONNECTOR_MAX_A,
      measured: `${fmtA(relayA)} through the contacts`,
      limitLabel: `${CONNECTOR_MAX_A} A (representative)`,
      failureMode: 'The contacts pit and weld; the filter for that band stops switching in.',
      timescale: 'cumulative',
    })
    if (lpfRelay) out.push(lpfRelay)

    // Connectors. Current, not power, is what heats a connector.
    const connectorA = seriesCurrentA(pa.netW, solution.lineMatch.swr)
    const so239 = stressOf({
      componentId: 'so239',
      kind: 'connector-heating',
      value: connectorA,
      onset: 0.45 * CONNECTOR_MAX_A,
      limit: CONNECTOR_MAX_A,
      measured: `${fmtA(connectorA)} through the joint`,
      limitLabel: `${CONNECTOR_MAX_A} A (representative)`,
      failureMode: 'The centre pin loses its grip, resistance rises, and the joint cooks itself.',
      timescale: 'minutes',
    })
    if (so239) out.push(so239)

    // Feedline. Voltage rating is derived from the cable's matched power rating:
    // sqrt(2 * P * Z0) is the peak voltage it carries when it is doing its rated
    // job, and standing waves push the peaks well above that for the same power.
    const cable = CABLES[cfg.cableId] ?? CABLES.rg58
    const cableRatedPeakV = Math.sqrt(2 * Math.max(1, cable.powerRatingW) * cable.z0)
    const coaxV = stressOf({
      componentId: 'coax',
      kind: 'peak-voltage',
      value: sw.vPeakVolts,
      onset: 0.5 * cableRatedPeakV,
      limit: cableRatedPeakV,
      measured: `${fmtV(sw.vPeakVolts)} at the voltage antinode`,
      limitLabel: `${fmtV(cableRatedPeakV)} (representative)`,
      failureMode: 'The dielectric punctures at the antinode and the cable shorts, usually at the same spot every time.',
      timescale: 'instant',
    })
    if (coaxV) out.push(coaxV)

    const lengthM = Math.max(0.5, num(cfg.cableLengthM, 10))
    const heatPerM = solution.cableLossW / lengthM
    const coaxHeat = stressOf({
      componentId: 'coax',
      kind: 'dielectric-heating',
      value: heatPerM,
      onset: 1.5,
      limit: 5,
      measured: `${heatPerM.toFixed(2)} W per metre`,
      limitLabel: '5 W per metre (representative)',
      failureMode: 'The polyethylene softens, the centre conductor migrates, and the impedance changes permanently.',
      timescale: 'minutes',
    })
    if (coaxHeat) out.push(coaxHeat)

    // Tuner. Q is the multiplier: a network with a Q of 20 has twenty times the
    // circulating current and voltage inside it that appear at its terminals.
    if (tuner.engaged && tuner.matched) {
      const q = Math.max(1, tuner.q)
      const terminalA = Math.sqrt(Math.max(0, pa.netW) / 50)
      const terminalV = Math.sqrt(2 * Math.max(0, pa.netW) * 50)
      const inductorA = terminalA * Math.sqrt(q)
      const capV = terminalV * Math.sqrt(q)
      const sL = stressOf({
        componentId: 'atu-inductor',
        kind: 'circulating-current',
        value: inductorA,
        onset: 0.4 * ATU_L_MAX_A,
        limit: ATU_L_MAX_A,
        measured: `${fmtA(inductorA)} circulating at Q ${q.toFixed(0)}`,
        limitLabel: `${ATU_L_MAX_A} A (representative)`,
        failureMode: 'The coil former chars and the inductance drifts, so the match walks off while you transmit.',
        timescale: 'minutes',
      })
      if (sL) out.push(sL)
      const sC = stressOf({
        componentId: 'atu-cap',
        kind: 'peak-voltage',
        value: capV,
        onset: 0.4 * ATU_CAP_MAX_V,
        limit: ATU_CAP_MAX_V,
        measured: `${fmtV(capV)} across the plates at Q ${q.toFixed(0)}`,
        limitLabel: `${fmtV(ATU_CAP_MAX_V)} (representative)`,
        failureMode: 'The capacitor flashes over; you hear it before you see the SWR jump.',
        timescale: 'instant',
      })
      if (sC) out.push(sC)
    }
    if (tuner.engaged && !tuner.matched) {
      const s = stressOf({
        componentId: 'atu-relay',
        kind: 'relay-arcing',
        value: pa.forwardW,
        onset: 0.1 * PA.ratedW,
        limit: PA.ratedW,
        measured: `${fmtW(pa.forwardW)} while the network is still searching`,
        limitLabel: `${fmtW(PA.ratedW)} (representative)`,
        failureMode: 'The relays switch under power and the contacts arc; that is what tuning at low power avoids.',
        timescale: 'seconds',
      })
      if (s) out.push(s)
    }

    // Feedpoint. A high-impedance feedpoint means high voltage, which is what
    // breaks down the transformer in an end-fed or an off-centre-fed antenna.
    const antennaId: AntennaId = ANTENNAS[cfg.antennaId] ? cfg.antennaId : 'dummy-load'
    if (antennaId !== 'dummy-load') {
      const zMag = Math.max(1, cAbsSafe(solution.antennaZ))
      const feedpointW = feedpointPowerOf(solution)
      const feedV = Math.sqrt(2 * feedpointW * zMag)
      const s = stressOf({
        componentId: 'balun',
        kind: 'core-saturation',
        value: feedV,
        onset: 0.36 * BALUN_MAX_V,
        limit: BALUN_MAX_V,
        measured: `${fmtV(feedV)} across the winding into ${zMag.toFixed(0)} ohms`,
        limitLabel: `${fmtV(BALUN_MAX_V)} (representative)`,
        failureMode: 'The core saturates and then the winding flashes over to it; the antenna goes deaf and the SWR climbs.',
        timescale: 'seconds',
      })
      if (s) out.push(s)
    }
  }

  for (const entry of SECONDARY_THERMAL) {
    const def = nodeDef(entry.node)
    if (!def) continue
    const tempC = tempOf(thermal, entry.node)
    const s = stressOf({
      componentId: entry.componentId,
      kind: entry.kind,
      value: tempC,
      onset: def.warnC,
      limit: def.damageC,
      measured: `${tempC.toFixed(0)} C`,
      limitLabel: `${def.damageC.toFixed(0)} C`,
      failureMode: entry.failureMode,
      timescale: tempC > def.criticalC ? 'seconds' : 'minutes',
    })
    if (s) out.push(s)
  }

  // One entry per part and failure mode, keeping the worst route to it: a coil
  // can be reported as over-current or as over-temperature, but saying both
  // about the same coil in the same breath tells the reader nothing extra.
  const worst = new Map<string, ComponentStress>()
  for (const s of out) {
    const key = `${s.componentId}|${s.kind}`
    const previous = worst.get(key)
    if (!previous || s.severity > previous.severity) worst.set(key, s)
  }
  return [...worst.values()].sort((a, b) => b.severity - a.severity)
}

// ─── Heat sources ────────────────────────────────────────────────────────────

/**
 * Watts into each thermal node, for `stepThermal` to integrate.
 *
 * Only heat that is actually inside the cabinet counts. An external tuner and
 * the coax get warm too, but they are not sharing the radio's heatsink, so
 * putting their losses on the radio's thermal nodes would be a lie the fan
 * cannot fix. Every published node gets an entry, zero included, so the caller
 * never has to guess.
 */
export function heatSources(solution: StationSolution): Record<string, number> {
  const out: Record<string, number> = {}
  for (const node of THERMAL_NODES) out[node.id] = 0

  const add = (id: string, w: number): void => {
    if (!nodeDef(id)) return
    out[id] = num(out[id] ?? 0) + Math.max(0, num(w))
  }

  add(PA_NODE, solution.pa.paDissipationW)
  // On this radio the PA heatsink is the chassis casting, and the receiver, the
  // display and the regulators are all bolted to it. That standing few watts is
  // why a radio left switched on all day is warm before you ever transmit.
  add(HEATSINK_NODE, HOUSEKEEPING_W)

  // I squared R in the series contacts. These are small numbers until the SWR
  // raises the current, and then they are not.
  const netW = Math.max(0, solution.pa.netW)
  const relayA = seriesCurrentA(netW, solution.radioMatch.swr)
  const connectorA = seriesCurrentA(netW, solution.lineMatch.swr)
  add(LPF_NODE, relayA * relayA * CONTACT_RESISTANCE_OHM)
  add(CONNECTOR_NODE, connectorA * connectorA * CONTACT_RESISTANCE_OHM)

  // Only the internal tuner is inside the cabinet. An external one gets just as
  // hot, but it is not sharing this heatsink, so it does not belong here.
  if (solution.config.tunerMode === 'internal' && solution.tuner.matched) {
    add(ATU_NODE, solution.tunerLossW)
  }

  // The feedpoint transformer takes its share of whatever the antenna wastes.
  const antennaId = antennaIdOf(solution.config.antennaId)
  const share = clamp01(num(FEEDPOINT_TRANSFORMER_SHARE[antennaId], 0.1))
  add(BALUN_NODE, antennaLossOf(solution) * share)

  return out
}

// ─── Degraded fallback ───────────────────────────────────────────────────────

function emptyProfile(): StandingWaveProfile {
  const n = 2
  const positions = new Float32Array(n)
  const vMag = new Float32Array(n)
  const iMag = new Float32Array(n)
  const phase = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    positions[i] = i / (n - 1)
    vMag[i] = 1
    iMag[i] = 1
  }
  return { positions, vMag, iMag, phase, antinodes: [], nodes: [], vPeakVolts: 0, iPeakAmps: 0 }
}

const MATCHED: MatchFigures = {
  gamma: { re: 0, im: 0 },
  gammaMag: 0,
  swr: 1,
  returnLossDb: 99,
  mismatchLossDb: 0,
  reflectedFraction: 0,
}

/**
 * A complete, inert, entirely finite solution. Used only when a model throws,
 * which the test grid is there to prevent. It carries a warning rather than
 * pretending everything is fine.
 */
function degradedSolution(raw: StationConfig): StationSolution {
  const config = sanitiseConfig(raw)
  const z: Complex = { re: 50, im: 0 }
  const line: LineResult = {
    zIn: z,
    matchedLossDb: 0,
    totalLossDb: 0,
    excessLossDb: 0,
    lengthWaves: 0,
    alpha: 0,
    beta: 0,
  }
  const pa: PaResult = {
    requestedW: 0,
    forwardW: 0,
    reflectedW: 0,
    netW: 0,
    dcInputW: 0,
    supplyCurrentA: 0,
    paDissipationW: 0,
    efficiency: 0,
    voltageStress: 1,
    currentStress: 1,
    protection: {
      level: 'normal',
      foldback: 1,
      reasons: [],
      swrTriggered: false,
      tempTriggered: false,
      currentTriggered: false,
    },
  }
  const base: Omit<StationSolution, 'stages' | 'stresses'> = {
    config,
    antennaZ: z,
    antennaMatch: MATCHED,
    lineInputZ: z,
    lineMatch: MATCHED,
    line,
    tuner: bypassTuner(z),
    radioLoadZ: z,
    radioMatch: MATCHED,
    pa,
    radiatedW: 0,
    cableLossW: 0,
    tunerLossW: 0,
    standingWave: emptyProfile(),
    warnings: ['The solver could not evaluate this configuration. Change one setting and try again.'],
  }
  const stages = STAGE_ORDER.map((id) => stage(id, 0, 'idle', 0, ''))
  return { ...base, stages, stresses: [] }
}
