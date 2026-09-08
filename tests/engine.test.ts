import { describe, expect, it } from 'vitest'
import { stepSimulation } from '../src/sim/engine'
import { solveStation } from '../src/rf/chain'
import { initialThermalState } from '../src/rf/thermal'
import { defaultParams } from '../src/rf/antennas'
import type { SimState, UiState } from '../src/sim/types'
import type { StationConfig } from '../src/rf/types'

const config: StationConfig = {
  freqHz: 14_200_000,
  mode: 'FM',
  powerSetW: 100,
  micGain: 50,
  compression: 0,
  antennaId: 'dummy-load',
  antennaParams: defaultParams('dummy-load'),
  cableId: 'rg8x',
  cableLengthM: 5,
  tunerMode: 'bypass',
  tunerEngaged: false,
  keyed: true,
  envelope: 1,
  ambientC: 25,
  allowDamage: false,
}

const ui: UiState = {
  view: 'exterior',
  selectedStage: null,
  selectedPart: null,
  cardOpen: false,
  presenter: false,
  showLabels: true,
  showStandingWave: true,
  showEnergyFlow: true,
  tourIndex: null,
  reducedMotion: false,
  paused: false,
  timeScale: 1,
  useMicrophone: false,
}

const fresh = (): SimState => {
  const thermal = initialThermalState(25)
  const solution = solveStation(config, thermal)
  return {
    config,
    thermal,
    solution,
    meters: { poW: 0, swr: solution.radioMatch.swr, alc: 0, idA: 0, tempC: 25, sMeter: 0 },
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

/** Run `seconds` of real time in slices of `slice`, the way the store does. */
const run = (seconds: number, slice: number): SimState => {
  let s = fresh()
  for (let t = 0; t < seconds; t += slice) s = stepSimulation(s, ui, slice)
  return s
}

describe('the simulation keeps up with the clock', () => {
  it('advances the same amount of simulated time whatever the frame rate', () => {
    // The load-bearing property. A machine rendering at 4 fps must not run the
    // radio in slow motion: the meters would lag the controls and the thermal
    // model would be minutes behind the presenter.
    const fast = run(10, 1 / 60)
    const slow = run(10, 0.05)
    expect(fast.clock).toBeCloseTo(10, 1)
    expect(slow.clock).toBeCloseTo(10, 1)
    // And the physical state reached must agree closely, not merely in direction.
    const fastT = fast.thermal.temps['pa-junction'] ?? 0
    const slowT = slow.thermal.temps['pa-junction'] ?? 0
    expect(Math.abs(fastT - slowT)).toBeLessThan(2)
  })

  it('settles the meters within a couple of seconds at any step size', () => {
    for (const slice of [1 / 120, 1 / 60, 1 / 20, 0.05]) {
      const s = run(4, slice)
      expect(s.meters.poW, `step ${slice}`).toBeGreaterThan(90)
      expect(s.meters.tempC, `step ${slice}`).toBeGreaterThan(25)
    }
  })

  it('keeps the history bounded and sampled at a fixed rate', () => {
    const s = run(200, 0.05)
    expect(s.history.length).toBeLessThanOrEqual(600)
    expect(s.history.length).toBeGreaterThan(100)
  })

  it('does not fill the log with repeats', () => {
    const s = run(120, 0.05)
    const texts = s.events.map((e) => e.text)
    expect(new Set(texts).size).toBe(texts.length)
  })
})
