/**
 * Antinode — the single store.
 *
 * One zustand store holds the station configuration, the physics state, the
 * interface state and every action. There is no second source of truth: the 3D
 * scene, the panels and the charts all read this, and the physics is recomputed
 * from the configuration rather than cached anywhere else.
 *
 * Nothing is persisted. Reloading the page gives you a clean bench, which is
 * what you want before a talk.
 */

import { create } from 'zustand'
import { solveStation } from '../rf/chain'
import { initialThermalState } from '../rf/thermal'
import { ANTENNAS, defaultParams } from '../rf/antennas'
import { CABLES } from '../rf/cables'
import { BANDS, clampToRadioRange } from '../rf/bands'
import { MODES } from '../rf/audio'
import { TUNERS } from '../rf/tuner'
import { VIEWS } from '../content/views'
import { PRESETS } from '../content/presets'
import { TOUR } from '../content/tour'
import { stepSimulation } from './engine'
import { decodeState, encodeState, pushState } from '../ui/urlState'
import { microphone } from './mic'
import type { SimState, StoreActions, UiState } from './types'
import type { AntennaId, CableId, Mode, StageId, StationConfig, TunerMode } from '../rf/types'
import type { ViewId } from '../content/types'

type Store = SimState & UiState & StoreActions

const AMBIENT_C = 25

/** Longest single integration step, seconds. Beyond this the thermal model drifts. */
const MAX_SUBSTEP_S = 0.05

/**
 * Most real time a single frame is allowed to make up, seconds. A backgrounded
 * tab can return with a gap of minutes; simulating all of it in one frame would
 * lock the interface and produce a physically meaningless jump.
 */
const MAX_CATCHUP_S = 0.5

const DEFAULT_CONFIG: StationConfig = {
  freqHz: 14_250_000,
  mode: 'USB',
  powerSetW: 100,
  micGain: 50,
  compression: 0,
  antennaId: 'dipole-20',
  antennaParams: defaultParams('dipole-20'),
  cableId: 'rg8x',
  cableLengthM: 20,
  tunerMode: 'bypass',
  tunerEngaged: false,
  keyed: false,
  envelope: 0,
  ambientC: AMBIENT_C,
  allowDamage: true,
}

const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

const VALID = {
  antennas: Object.keys(ANTENNAS),
  cables: Object.keys(CABLES),
  modes: Object.keys(MODES),
  tuners: Object.keys(TUNERS),
}

function initialConfig(): { config: StationConfig; view: ViewId; presenter: boolean } {
  const base = { ...DEFAULT_CONFIG }
  let view: ViewId = 'exterior'
  let presenter = false
  if (typeof window !== 'undefined' && window.location.hash.length > 1) {
    const shared = decodeState(window.location.hash, VALID)
    Object.assign(base, shared.config)
    // A shared link names an antenna but may not name its parameters, so fill
    // any gaps from that antenna's own defaults rather than the previous one's.
    base.antennaParams = { ...defaultParams(base.antennaId), ...(shared.config.antennaParams ?? {}) }
    if (shared.view) view = shared.view
    presenter = shared.presenter
    // Never open a shared link already transmitting.
    base.keyed = false
    base.envelope = 0
  }
  return { config: base, view, presenter }
}

function freshState(config: StationConfig): SimState {
  const thermal = initialThermalState(config.ambientC)
  const solution = solveStation(config, thermal)
  return {
    config,
    thermal,
    solution,
    meters: { poW: 0, swr: solution.radioMatch.swr, alc: 0, idA: 0, tempC: config.ambientC, sMeter: 0 },
    history: [],
    clock: 0,
    tunerBusy: false,
    tuneStartedAt: -999,
    lastSampleAt: 0,
    events: [],
    lastProtection: solution.pa.protection.level,
    lastWarned: [],
    lastDamaged: [],
  }
}

const boot = initialConfig()

export const useStation = create<Store>((set, get) => {
  /** Recompute the solution whenever the configuration changes. */
  /**
   * Anything that changes what the tuner is looking at un-tunes it. A real ATU
   * holds its match until you move, and then it does not: pretending otherwise
   * would let the reader believe a tuner tracks the dial.
   */
  const INVALIDATES_TUNE: readonly (keyof StationConfig)[] = [
    'freqHz', 'antennaId', 'antennaParams', 'cableId', 'cableLengthM', 'tunerMode',
  ]

  const reconfigure = (patch: Partial<StationConfig>) => {
    const s = get()
    const retune = INVALIDATES_TUNE.some((k) => k in patch)
    const config = { ...s.config, ...patch, ...(retune ? { tunerEngaged: false } : {}) }
    set({ config, solution: solveStation(config, s.thermal) })
    syncUrl()
  }

  let urlTimer: number | undefined
  const syncUrl = () => {
    if (typeof window === 'undefined') return
    window.clearTimeout(urlTimer)
    // Debounced: dragging the dial should not write history sixty times a second.
    urlTimer = window.setTimeout(() => {
      const s = get()
      pushState(encodeState(s.config, s.view, s.presenter))
    }, 350)
  }

  const applyTourStep = (index: number) => {
    const step = TOUR[index]
    if (!step) return
    const s = get()
    const set$ = step.set
    const config: StationConfig = {
      ...s.config,
      ...(set$.freqHz !== undefined ? { freqHz: clampToRadioRange(set$.freqHz) } : {}),
      ...(set$.tunerMode !== undefined ? { tunerMode: set$.tunerMode } : {}),
      ...(set$.cableLengthM !== undefined ? { cableLengthM: set$.cableLengthM } : {}),
      ...(set$.powerSetW !== undefined ? { powerSetW: set$.powerSetW } : {}),
      ...(set$.keyed !== undefined ? { keyed: set$.keyed } : {}),
      ...(set$.antennaId !== undefined
        ? { antennaId: set$.antennaId, antennaParams: defaultParams(set$.antennaId) }
        : {}),
    }
    set({
      config,
      solution: solveStation(config, s.thermal),
      tourIndex: index,
      view: step.view,
      selectedStage: step.focusStage,
      selectedPart: step.focusPart,
      cardOpen: step.focusStage !== null || step.focusPart !== null,
    })
    syncUrl()
  }

  return {
    ...freshState(boot.config),

    // ── Interface state ────────────────────────────────────────────────────
    view: boot.view,
    selectedStage: null,
    selectedPart: null,
    cardOpen: false,
    presenter: boot.presenter,
    showLabels: true,
    showStandingWave: true,
    showEnergyFlow: true,
    tourIndex: null,
    reducedMotion: prefersReducedMotion(),
    paused: false,
    timeScale: 1,
    useMicrophone: false,

    // ── Actions ────────────────────────────────────────────────────────────
    setFreq: (hz) => reconfigure({ freqHz: clampToRadioRange(hz) }),
    nudgeFreq: (delta) => reconfigure({ freqHz: clampToRadioRange(get().config.freqHz + delta) }),

    setBand: (id) => {
      const band = BANDS.find((b) => b.id === id)
      if (!band) return
      reconfigure({ freqHz: band.defaultHz, mode: band.voiceMode })
    },

    setMode: (m: Mode) => reconfigure({ mode: m }),
    setPower: (w) => reconfigure({ powerSetW: Math.max(0, Math.min(100, w)) }),
    setMicGain: (v) => reconfigure({ micGain: Math.max(0, Math.min(100, v)) }),
    setCompression: (v) => reconfigure({ compression: Math.max(0, Math.min(10, v)) }),

    setAntenna: (id: AntennaId) => {
      if (!ANTENNAS[id]) return
      reconfigure({ antennaId: id, antennaParams: defaultParams(id) })
    },

    setAntennaParam: (key, value) => {
      const s = get()
      reconfigure({ antennaParams: { ...s.config.antennaParams, [key]: value } })
    },

    setCable: (id: CableId) => {
      if (!CABLES[id]) return
      reconfigure({ cableId: id })
    },

    setCableLength: (m) => reconfigure({ cableLengthM: Math.max(0.5, Math.min(120, m)) }),

    setTunerMode: (m: TunerMode) => {
      // Putting a tuner in circuit does not tune it. The operator has to press
      // TUNE, and that is the point.
      reconfigure({ tunerMode: m })
      set({ tunerBusy: false })
    },

    runTuner: () => {
      const s = get()
      if (s.config.tunerMode === 'bypass' || s.tunerBusy) return
      set({ tunerBusy: true, tuneStartedAt: s.clock })
    },

    setKeyed: (on) => reconfigure({ keyed: on }),

    setView: (v: ViewId) => {
      if (!VIEWS.some((x) => x.id === v)) return
      set({ view: v })
      syncUrl()
    },

    selectStage: (id: StageId | null) => set({ selectedStage: id, selectedPart: null, cardOpen: id !== null }),
    selectPart: (id) => set({ selectedPart: id, selectedStage: null, cardOpen: id !== null }),

    toggle: (key) => {
      const s = get()
      const current = s[key]
      if (typeof current !== 'boolean') return
      set({ [key]: !current } as unknown as Partial<Store>)
      if (key === 'presenter') syncUrl()
    },

    setTimeScale: (v) => set({ timeScale: Math.max(0.1, Math.min(120, v)) }),
    setUseMicrophone: (on) => set({ useMicrophone: on }),

    applyPreset: (id) => {
      const preset = PRESETS.find((p) => p.id === id)
      if (!preset) return
      const s = get()
      const antennaId = (preset.set.antennaId ?? s.config.antennaId)
      const config: StationConfig = {
        ...s.config,
        ...(preset.set.freqHz !== undefined ? { freqHz: clampToRadioRange(preset.set.freqHz) } : {}),
        ...(preset.set.mode !== undefined ? { mode: preset.set.mode as Mode } : {}),
        ...(preset.set.cableId !== undefined ? { cableId: preset.set.cableId as CableId } : {}),
        ...(preset.set.cableLengthM !== undefined ? { cableLengthM: preset.set.cableLengthM } : {}),
        ...(preset.set.tunerMode !== undefined ? { tunerMode: preset.set.tunerMode } : {}),
        ...(preset.set.powerSetW !== undefined ? { powerSetW: preset.set.powerSetW } : {}),
        antennaId,
        antennaParams: { ...defaultParams(antennaId), ...(preset.set.antennaParams ?? {}) },
        // A preset sets the bench up; it does not press TUNE for you.
        tunerEngaged: false,
      }
      set({ config, solution: solveStation(config, s.thermal), tunerBusy: false })
      syncUrl()
    },

    startTour: () => applyTourStep(0),
    tourNext: () => {
      const i = get().tourIndex
      if (i === null) return
      if (i + 1 >= TOUR.length) set({ tourIndex: null })
      else applyTourStep(i + 1)
    },
    tourPrev: () => {
      const i = get().tourIndex
      if (i !== null && i > 0) applyTourStep(i - 1)
    },
    endTour: () => set({ tourIndex: null }),

    reset: () => {
      microphone.stop()
      set({ ...freshState({ ...DEFAULT_CONFIG }), useMicrophone: false, tourIndex: null })
      syncUrl()
    },

    /** Replace the damaged parts. Temperatures stay where they are. */
    repair: () => {
      const s = get()
      const damage: Record<string, number> = {}
      for (const id of Object.keys(s.thermal.damage)) damage[id] = 0
      const thermal = { ...s.thermal, damage }
      set({
        thermal,
        solution: solveStation(s.config, thermal),
        lastDamaged: [],
        events: [{ t: s.clock, severity: 'info' as const, text: 'Damaged parts replaced. The bench is as new.' }, ...s.events].slice(0, 60),
      })
    },

    /**
     * Advance the physics by dt seconds of REAL time.
     *
     * The engine's integrator is only stable for short steps, so a long frame is
     * broken into fixed sub-steps rather than clamped. Clamping is what a first
     * version does, and it means the simulation runs in slow motion on any
     * machine that cannot hit 60 fps: on a laptop rendering the scene in
     * software at 4 fps the radio would respond four times too slowly and the
     * meters would lag the controls visibly. Catch-up is bounded so a tab that
     * was backgrounded for a minute does not try to simulate a minute at once.
     */
    step: (dtReal) => {
      if (!Number.isFinite(dtReal) || dtReal <= 0) return
      const ui = get()
      let state: SimState = ui
      let remaining = Math.min(dtReal, MAX_CATCHUP_S)
      let changed = false
      while (remaining > 1e-6) {
        const slice = Math.min(remaining, MAX_SUBSTEP_S)
        const next = stepSimulation(state, ui, slice)
        if (next !== state) {
          state = next
          changed = true
        }
        remaining -= slice
      }
      if (changed) set(state)
    },
  }
})
