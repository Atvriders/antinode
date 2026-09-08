/**
 * Antinode — the simulation step.
 *
 * Everything physical lives in src/rf. This file only decides WHEN to ask it
 * things, how to carry state forward between frames, and how to turn a stream of
 * instantaneous solutions into something a person can read: meters with
 * ballistics, a bounded history, and a log that reports changes rather than
 * repeating itself sixty times a second.
 */

import { solveStation, heatSources } from '../rf/chain'
import { stepThermal, THERMAL_NODES } from '../rf/thermal'
import { modeEnvelope } from '../rf/audio'
import { fmtPower, fmtSwr, fmtTemp } from '../ui/format'
import { microphone } from './mic'
import type { HistorySample, SimEvent, SimState, UiState } from './types'

/** History is sampled at a fixed rate so a fast machine does not get a denser chart. */
const HISTORY_HZ = 5
const HISTORY_LIMIT = 600
const EVENT_LIMIT = 60

/**
 * Meter ballistics. Real panel meters rise fast and fall slowly, which is what
 * makes a power meter readable on speech: it follows the peaks and ignores the
 * gaps. Seconds to reach 63 percent of a step, per direction.
 */
const BALLISTICS: Readonly<Record<string, { attack: number; decay: number }>> = {
  po: { attack: 0.05, decay: 0.55 },
  swr: { attack: 0.08, decay: 0.45 },
  alc: { attack: 0.02, decay: 0.35 },
  id: { attack: 0.06, decay: 0.5 },
  // Temperature is not a needle chasing an envelope; it is a slow physical
  // quantity, so the meter barely filters it at all.
  temp: { attack: 0.4, decay: 0.4 },
  s: { attack: 0.05, decay: 0.6 },
}

/** One-pole filter with a different constant each way. */
function ballistic(prev: number, target: number, dt: number, key: string): number {
  const b = BALLISTICS[key] ?? { attack: 0.1, decay: 0.4 }
  const tau = target > prev ? b.attack : b.decay
  if (tau <= 0) return target
  const k = 1 - Math.exp(-dt / tau)
  const next = prev + (target - prev) * k
  return Number.isFinite(next) ? next : target
}

/** How long the tuner clatters before it reports a result, seconds. */
const TUNE_SECONDS = 2.2

export function stepSimulation(prev: SimState, ui: UiState, dtReal: number): SimState {
  if (ui.paused) return prev

  // The caller has already broken a long frame into stable sub-steps, so this is
  // a short slice of real time. Only the demonstration time scale is applied here.
  const dt = Math.max(dtReal, 0) * Math.max(0.01, ui.timeScale)
  if (dt <= 0) return prev

  const clock = prev.clock + dt

  // ── The transmit envelope ────────────────────────────────────────────────
  // The mode's duty cycle lives here and nowhere else: modeEnvelope's mean
  // square over time IS the mode's average-to-peak ratio, so integrating the
  // instantaneous dissipation below gives the right average heat without
  // anything multiplying by a duty factor.
  const envelope = prev.config.keyed
    ? ui.useMicrophone && microphone.isLive
      ? microphone.sample().peak
      : modeEnvelope(prev.config.mode, clock, prev.config.compression)
    : 0

  const config = { ...prev.config, envelope }

  // ── Physics ──────────────────────────────────────────────────────────────
  const solution = solveStation(config, prev.thermal)
  const thermal = stepThermal(prev.thermal, heatSources(solution), dt, config.allowDamage)

  // ── Meters ───────────────────────────────────────────────────────────────
  const paTemp = thermal.temps['pa-junction'] ?? thermal.ambientC
  const meters = {
    poW: ballistic(prev.meters.poW, solution.pa.forwardW, dt, 'po'),
    swr: ballistic(prev.meters.swr, Math.min(solution.radioMatch.swr, 99), dt, 'swr'),
    alc: ballistic(prev.meters.alc, alcOf(solution), dt, 'alc'),
    idA: ballistic(prev.meters.idA, solution.pa.supplyCurrentA, dt, 'id'),
    tempC: ballistic(prev.meters.tempC, paTemp, dt, 'temp'),
    sMeter: ballistic(prev.meters.sMeter, 0, dt, 's'),
  }

  // ── The tuner's search ───────────────────────────────────────────────────
  let tunerBusy = prev.tunerBusy
  let events = prev.events
  let engaged = config.tunerEngaged
  if (tunerBusy && clock >= prev.tuneStartedAt + TUNE_SECONDS) {
    tunerBusy = false
    // Ask the tuner what it can do with this load, then engage it only if it
    // actually found a match.
    const attempt = solveStation({ ...config, tunerEngaged: true }, prev.thermal)
    engaged = attempt.tuner.matched
    events = push(
      events,
      clock,
      attempt.tuner.matched ? 'info' : 'warn',
      attempt.tuner.matched
        ? `Tuner found a match. The radio now sees ${fmtSwr(attempt.radioMatch.swr)}.`
        : attempt.tuner.failureReason || 'The tuner could not find a match at this frequency.',
    )
  }
  const tunedConfig = engaged === config.tunerEngaged ? config : { ...config, tunerEngaged: engaged }
  const tunedSolution = engaged === config.tunerEngaged ? solution : solveStation(tunedConfig, prev.thermal)

  // ── History ──────────────────────────────────────────────────────────────
  let history = prev.history
  if (clock - prev.lastSampleAt >= 1 / HISTORY_HZ) {
    const sample: HistorySample = {
      t: clock,
      swr: solution.radioMatch.swr,
      paTempC: paTemp,
      forwardW: solution.pa.forwardW,
      reflectedW: solution.pa.reflectedW,
    }
    history = [...prev.history, sample].slice(-HISTORY_LIMIT)
  }
  const lastSampleAt = history === prev.history ? prev.lastSampleAt : clock

  // ── Events, on transitions only ──────────────────────────────────────────
  events = detectEvents(prev, { solution, thermal, clock, events })

  return {
    config: tunedConfig,
    thermal,
    meters,
    solution: tunedSolution,
    history,
    clock,
    tunerBusy,
    tuneStartedAt: prev.tuneStartedAt,
    lastSampleAt,
    events,
    lastProtection: solution.pa.protection.level,
    lastWarned: warnedSet(thermal),
    lastDamaged: damagedSet(thermal),
  }
}

function alcOf(solution: ReturnType<typeof solveStation>): number {
  const stage = solution.stages.find((s) => s.id === 'dsp-tx')
  if (!stage) return 0
  // The DSP stage reports its level in dBFS; the ALC zone is the top few dB.
  return Math.max(0, Math.min(1, stage.activity))
}

const push = (events: readonly SimEvent[], t: number, severity: SimEvent['severity'], text: string): readonly SimEvent[] =>
  [{ t, severity, text }, ...events].slice(0, EVENT_LIMIT)

function warnedSet(thermal: SimState['thermal']): readonly string[] {
  const out: string[] = []
  for (const node of THERMAL_NODES) {
    const t = thermal.temps[node.id]
    if (t !== undefined && t > node.warnC) out.push(node.id)
  }
  return out
}

function damagedSet(thermal: SimState['thermal']): readonly string[] {
  return Object.entries(thermal.damage)
    .filter(([, d]) => d > 0.001)
    .map(([id]) => id)
}

/**
 * Log a line only when something actually changed state. A log that repeats
 * every frame is not a log, it is a wall, and the one line that mattered is
 * already off the top of it.
 */
function detectEvents(
  prev: SimState,
  now: { solution: SimState['solution']; thermal: SimState['thermal']; clock: number; events: readonly SimEvent[] },
): readonly SimEvent[] {
  let events = now.events
  const { solution, thermal, clock } = now

  const level = solution.pa.protection.level
  if (level !== prev.lastProtection) {
    if (level === 'normal') {
      events = push(events, clock, 'info', 'Protection released. The radio is back to full output.')
    } else {
      const reason = solution.pa.protection.reasons[0]
      events = push(
        events,
        clock,
        level === 'shutdown' ? 'fault' : 'warn',
        reason ?? `Protection engaged: ${level}.`,
      )
    }
  }

  const warned = warnedSet(thermal)
  for (const id of warned) {
    if (!prev.lastWarned.includes(id)) {
      const node = THERMAL_NODES.find((n) => n.id === id)
      const t = thermal.temps[id]
      events = push(
        events,
        clock,
        'warn',
        `${node?.label ?? id} reached ${fmtTemp(t ?? 0)}, past its ${fmtTemp(node?.warnC ?? 0)} warning point.`,
      )
    }
  }

  const damaged = damagedSet(thermal)
  for (const id of damaged) {
    if (!prev.lastDamaged.includes(id)) {
      const node = THERMAL_NODES.find((n) => n.id === id)
      events = push(
        events,
        clock,
        'fault',
        `${node?.label ?? id} has started to take permanent damage. This does not heal; use Repair to reset the bench.`,
      )
    }
  }

  // A cable that is eating a serious fraction of the output is worth saying once.
  const eating = solution.cableLossW > 0.25 * Math.max(solution.pa.forwardW, 1e-9) && solution.pa.forwardW > 5
  const wasEating = prev.solution.cableLossW > 0.25 * Math.max(prev.solution.pa.forwardW, 1e-9) && prev.solution.pa.forwardW > 5
  if (eating && !wasEating) {
    events = push(
      events,
      clock,
      'warn',
      `${fmtPower(solution.cableLossW)} of the output is heating the feedline rather than leaving the antenna.`,
    )
  }

  return events
}
