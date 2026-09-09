/** Antinode — simulation and store type contract. */

import type {
  AntennaId, CableId, Mode, ProtectionLevel, StageId, StationConfig,
  StationSolution, ThermalState, TunerMode,
} from '../rf/types'
import type { ViewId } from '../content/types'

export interface UiState {
  readonly view: ViewId
  readonly selectedStage: StageId | null
  readonly selectedPart: string | null
  /** Handbook card open. */
  readonly cardOpen: boolean
  /** Larger type and heavier contrast for projection. */
  readonly presenter: boolean
  readonly showLabels: boolean
  readonly showStandingWave: boolean
  readonly showEnergyFlow: boolean
  readonly tourIndex: number | null
  readonly reducedMotion: boolean
  readonly paused: boolean
  /** Speed multiplier for the thermal simulation so damage is visible in a demo. */
  readonly timeScale: number
  /**
   * True when a real microphone is driving the transmit chain instead of the
   * deterministic synthetic voice. Opt-in, and the only device permission the
   * application ever asks for.
   */
  readonly useMicrophone: boolean
}

export interface MeterState {
  /** Ballistic (damped) meter readings, so needles behave like real meters. */
  readonly poW: number
  /**
   * The power split, damped the same way.
   *
   * These are instantaneous envelope powers in the solution, which on speech
   * swing to zero between syllables. Printed raw they flicker uselessly — a
   * "radiated" figure that reads 0 W every time the talker draws breath cannot
   * be compared with anything. A peak-reading wattmeter is what an operator
   * actually watches, so these follow the same ballistics as PO.
   */
  readonly radiatedW: number
  readonly cableLossW: number
  readonly tunerLossW: number
  readonly swr: number
  readonly alc: number
  readonly idA: number
  readonly tempC: number
  readonly sMeter: number
}

export interface HistorySample {
  readonly t: number
  readonly swr: number
  readonly paTempC: number
  readonly forwardW: number
  readonly reflectedW: number
}

export interface SimState {
  readonly config: StationConfig
  readonly thermal: ThermalState
  readonly meters: MeterState
  readonly solution: StationSolution
  readonly history: readonly HistorySample[]
  /** Seconds of simulated time since load. */
  readonly clock: number
  /**
   * True while the tuner is stepping through its network looking for a match.
   * A real ATU takes a second or two and clatters its relays; hiding that would
   * hide the fact that tuning is a physical search, not a setting.
   */
  readonly tunerBusy: boolean
  /** Events worth showing in the log, newest first. */
  readonly events: readonly SimEvent[]

  // ── Bookkeeping the engine carries between frames ────────────────────────
  // These exist so the log reports transitions instead of repeating itself at
  // frame rate, and so the tuner's search takes time the way a real one does.

  /** Simulated time the current tuner search began, seconds. */
  readonly tuneStartedAt: number
  /** Simulated time of the last history sample, seconds. */
  readonly lastSampleAt: number
  /** Protection level at the previous step, to detect a change. */
  readonly lastProtection: ProtectionLevel
  /** Thermal node ids already past their warning point. */
  readonly lastWarned: readonly string[]
  /** Thermal node ids already accumulating damage. */
  readonly lastDamaged: readonly string[]
}

export interface SimEvent {
  readonly t: number
  readonly severity: 'info' | 'warn' | 'fault'
  readonly text: string
}

export interface StoreActions {
  setFreq(hz: number): void
  nudgeFreq(deltaHz: number): void
  setBand(id: string): void
  setMode(m: Mode): void
  setPower(w: number): void
  setMicGain(v: number): void
  setCompression(v: number): void
  setAntenna(id: AntennaId): void
  setAntennaParam(key: string, value: number): void
  setCable(id: CableId): void
  setCableLength(m: number): void
  setTunerMode(m: TunerMode): void
  runTuner(): void
  setKeyed(on: boolean): void
  setView(v: ViewId): void
  selectStage(id: StageId | null): void
  selectPart(id: string | null): void
  toggle(key: keyof UiState): void
  setTimeScale(v: number): void
  setUseMicrophone(on: boolean): void
  applyPreset(id: string): void
  startTour(): void
  tourNext(): void
  tourPrev(): void
  endTour(): void
  reset(): void
  repair(): void
  /** Advance the physics by dt seconds. Called by the render loop. */
  step(dt: number): void
}
