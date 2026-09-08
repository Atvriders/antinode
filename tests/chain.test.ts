/**
 * Antinode — tests for src/rf/chain.ts.
 *
 * The station solver is the thing the whole application draws, so the bar is
 * higher here than "it returns an object". Three properties are defended:
 *
 *   1. It is total. Across a grid of configurations it never throws, never
 *      returns NaN, and never reports an SWR outside 1..999.
 *   2. Power is conserved, exactly. Everything the PA produces is accounted for
 *      as reflection, cable heat, tuner heat, ground loss or radio waves.
 *   3. The teaching results come out right, including the uncomfortable one:
 *      a longer, lossier cable makes the SWR meter look better while delivering
 *      less power to the antenna.
 */

import { describe, expect, it } from 'vitest'
import { componentStresses, heatSources, solveStation, stageStates } from '../src/rf/chain'
import { initialThermalState, THERMAL_NODES } from '../src/rf/thermal'
import { defaultParams } from '../src/rf/antennas'
import { MODES, modeEnvelope } from '../src/rf/audio'
import { PA } from '../src/rf/pa'
import type {
  AntennaId, CableId, Mode, StageId, StationConfig, StationSolution, ThermalState, TunerMode,
} from '../src/rf/types'

const STAGE_ORDER: readonly StageId[] = [
  'voice', 'mic-element', 'mic-preamp', 'af-adc', 'dsp-tx', 'tx-dac', 'tx-mixer',
  'bpf', 'predriver', 'driver', 'final-pa', 'lpf-bank', 'ant-relay', 'swr-bridge',
  'atu', 'so239', 'feedline', 'antenna', 'space',
]

/** Defaults for an antenna id, or an empty set for one the model does not know. */
function safeDefaults(id: AntennaId): Record<string, number> {
  try {
    return { ...defaultParams(id) }
  } catch {
    return {}
  }
}

function config(over: Partial<StationConfig> = {}): StationConfig {
  const antennaId: AntennaId = over.antennaId ?? 'dipole-20'
  // Deliberately tolerant: some cases below pass an id that does not exist, to
  // prove the solver copes with it.
  const params: Record<string, number> = safeDefaults(antennaId)
  const base: StationConfig = {
    freqHz: 14_200_000,
    mode: 'FM',
    powerSetW: 100,
    micGain: 50,
    compression: 0,
    antennaId,
    antennaParams: params,
    cableId: 'rg213',
    cableLengthM: 15,
    tunerMode: 'bypass',
    tunerEngaged: true,
    keyed: true,
    envelope: 1,
    ambientC: 25,
    allowDamage: false,
  }
  return { ...base, ...over }
}

const cold = (): ThermalState => initialThermalState(25)

/** Walk the whole solution and complain about the first non-finite number. */
function findNonFinite(value: unknown, path = 'solution'): string | null {
  if (typeof value === 'number') return Number.isFinite(value) ? null : path
  if (value instanceof Float32Array) {
    for (let i = 0; i < value.length; i++) {
      if (!Number.isFinite(value[i] ?? Number.NaN)) return `${path}[${i}]`
    }
    return null
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const bad = findNonFinite(value[i], `${path}[${i}]`)
      if (bad) return bad
    }
    return null
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const bad = findNonFinite(v, `${path}.${k}`)
      if (bad) return bad
    }
    return null
  }
  return null
}

function stageValue(solution: StationSolution, id: StageId): number {
  return solution.stages.find((s) => s.id === id)?.value ?? Number.NaN
}

/**
 * The five places the PA's output can end up. Feedpoint power is read back from
 * the antenna stage, which derives it from radiatedW and the radiation
 * efficiency; the accounting below derives the same quantity by subtraction, so
 * the two have to agree or one of them is wrong.
 */
function powerTerms(solution: StationSolution): {
  forwardW: number
  reflectedW: number
  cableLossW: number
  tunerLossW: number
  antennaLossW: number
  radiatedW: number
  feedpointW: number
  sum: number
} {
  const feedpointW = stageValue(solution, 'antenna')
  const antennaLossW = feedpointW - solution.radiatedW
  return {
    forwardW: solution.pa.forwardW,
    reflectedW: solution.pa.reflectedW,
    cableLossW: solution.cableLossW,
    tunerLossW: solution.tunerLossW,
    antennaLossW,
    radiatedW: solution.radiatedW,
    feedpointW,
    sum:
      solution.pa.reflectedW +
      solution.cableLossW +
      solution.tunerLossW +
      antennaLossW +
      solution.radiatedW,
  }
}

/**
 * The antenna models belong to another module, so rather than hard-coding a
 * magic antenna and frequency that a model change could quietly invalidate,
 * each test below states the electrical conditions it needs and searches this
 * fixed, ordered list for a station that meets them. The search is
 * deterministic; if nothing meets the conditions, that is itself a finding.
 */
const SEARCH_ANTENNAS: readonly AntennaId[] = [
  'dipole-20', 'dipole-40', 'vertical-quarter-40', 'g5rv', 'ocf-windom',
  'efhw-40', 'fan-dipole', 'vertical-multiband', 'random-wire-9to1',
  'yagi-3el-20', 'mobile-whip-20', 'screwdriver-mobile', 'mag-loop',
]
const SEARCH_FREQS: readonly number[] = [
  1_830_000, 3_700_000, 7_150_000, 10_120_000, 14_200_000, 18_100_000,
  21_300_000, 24_940_000, 28_400_000, 50_150_000,
]

function findStation(
  want: (solution: StationSolution, cfg: StationConfig) => boolean,
  over: Partial<StationConfig> = {},
): StationConfig {
  for (const antennaId of SEARCH_ANTENNAS) {
    for (const freqHz of SEARCH_FREQS) {
      const cfg = config({ ...over, antennaId, freqHz })
      if (want(solveStation(cfg, cold()), cfg)) return cfg
    }
  }
  throw new Error('No station in the search space met the conditions this test needs.')
}

// ─── The grid ────────────────────────────────────────────────────────────────

const GRID_ANTENNAS: readonly AntennaId[] = [
  'dummy-load', 'dipole-40', 'efhw-40', 'vertical-quarter-40', 'mobile-whip-20', 'g5rv',
]
const GRID_FREQS: readonly number[] = [
  1_900_000, 3_700_000, 7_150_000, 14_200_000, 21_300_000, 28_400_000, 50_150_000,
]
const GRID_LENGTHS: readonly number[] = [3, 15, 40, 90]
const GRID_TUNERS: readonly TunerMode[] = ['bypass', 'external-radio']
const GRID_CABLES: readonly CableId[] = ['rg58', 'lmr400']

describe('solveStation over a grid of stations', () => {
  const cases: StationConfig[] = []
  for (const antennaId of GRID_ANTENNAS) {
    for (const freqHz of GRID_FREQS) {
      for (const cableLengthM of GRID_LENGTHS) {
        for (const tunerMode of GRID_TUNERS) {
          const cableId = GRID_CABLES[cases.length % GRID_CABLES.length] ?? 'rg58'
          cases.push(config({ antennaId, freqHz, cableLengthM, tunerMode, cableId }))
        }
      }
    }
  }

  it('covers at least two hundred configurations', () => {
    expect(cases.length).toBeGreaterThanOrEqual(200)
  })

  it('never produces a non-finite number anywhere in the solution', () => {
    for (const cfg of cases) {
      const solution = solveStation(cfg, cold())
      const bad = findNonFinite(solution)
      expect(bad, `${cfg.antennaId} ${cfg.freqHz} Hz ${cfg.cableLengthM} m`).toBeNull()
    }
  })

  it('conserves power to within 1e-6 W in every one of them', () => {
    for (const cfg of cases) {
      const solution = solveStation(cfg, cold())
      const t = powerTerms(solution)
      const label = `${cfg.antennaId} ${cfg.freqHz} Hz ${cfg.cableLengthM} m ${cfg.tunerMode}`
      expect(Math.abs(t.forwardW - t.sum), label).toBeLessThan(1e-6)
      expect(t.reflectedW, label).toBeGreaterThanOrEqual(0)
      expect(t.cableLossW, label).toBeGreaterThanOrEqual(0)
      expect(t.tunerLossW, label).toBeGreaterThanOrEqual(0)
      expect(t.antennaLossW, label).toBeGreaterThan(-1e-9)
      expect(t.radiatedW, label).toBeGreaterThanOrEqual(0)
      expect(t.radiatedW, label).toBeLessThanOrEqual(t.feedpointW + 1e-9)
    }
  })

  it('keeps every SWR inside the readable range and never reports Infinity', () => {
    let worst = 1
    for (const cfg of cases) {
      const s = solveStation(cfg, cold())
      for (const swr of [s.antennaMatch.swr, s.lineMatch.swr, s.radioMatch.swr]) {
        expect(Number.isFinite(swr)).toBe(true)
        expect(swr).toBeGreaterThanOrEqual(1)
        expect(swr).toBeLessThanOrEqual(999)
      }
      worst = Math.max(worst, s.radioMatch.swr)
    }
    // Somewhere in that grid is a mismatch worth being frightened of.
    expect(worst).toBeGreaterThan(20)
  })

  it('never falls back to the degraded solution', () => {
    for (const cfg of cases) {
      const s = solveStation(cfg, cold())
      for (const w of s.warnings) expect(w).not.toContain('could not evaluate')
    }
  })

  it('returns a complete stage list every time', () => {
    for (const cfg of cases.slice(0, 40)) {
      const s = solveStation(cfg, cold())
      expect(s.stages.map((x) => x.id)).toEqual([...STAGE_ORDER])
      for (const st of s.stages) {
        expect(st.level.length).toBeGreaterThan(0)
        expect(st.activity).toBeGreaterThanOrEqual(0)
        expect(st.activity).toBeLessThanOrEqual(1)
      }
    }
  })
})

// ─── Reference cases ─────────────────────────────────────────────────────────

describe('a dummy load', () => {
  const solution = solveStation(
    config({ antennaId: 'dummy-load', cableLengthM: 1, cableId: 'rg213' }),
    cold(),
  )

  it('reads 1.0 to 1 at the antenna and at the radio', () => {
    expect(solution.antennaMatch.swr).toBeCloseTo(1, 6)
    expect(solution.radioMatch.swr).toBeCloseTo(1, 3)
    expect(solution.antennaZ.re).toBeCloseTo(50, 6)
    expect(solution.antennaZ.im).toBeCloseTo(0, 6)
  })

  it('takes essentially all of the power the radio can make', () => {
    expect(solution.pa.forwardW).toBeGreaterThan(95)
    expect(solution.pa.reflectedW).toBeLessThan(0.05)
    expect(solution.pa.protection.level).toBe('normal')
    expect(solution.pa.protection.foldback).toBeCloseTo(1, 6)
    expect(solution.cableLossW).toBeLessThan(1)
  })

  it('radiates none of it, which is the entire point of a dummy load', () => {
    expect(solution.radiatedW).toBe(0)
    expect(stageValue(solution, 'antenna')).toBeGreaterThan(94)
  })

  it('stresses nothing when it is cold and matched', () => {
    expect(solution.stresses).toEqual([])
    expect(solution.warnings).toEqual([])
  })
})

describe('a load the radio cannot drive', () => {
  // The worst mismatch the antenna models can produce, on a short cable so the
  // line does not transform it back toward something civilised. A short whip
  // used far below the band it was cut for is a fraction of an ohm in series
  // with thousands of ohms of reactance: electrically it is an open circuit,
  // and the bridge cannot tell the difference.
  let worstCfg = config()
  let worstSwr = 0
  for (const antennaId of SEARCH_ANTENNAS) {
    for (const freqHz of SEARCH_FREQS) {
      const cfg = config({ antennaId, freqHz, cableLengthM: 2, cableId: 'rg213' })
      const swr = solveStation(cfg, cold()).radioMatch.swr
      if (swr > worstSwr) {
        worstSwr = swr
        worstCfg = cfg
      }
    }
  }
  const solution = solveStation(worstCfg, cold())

  it('finds a genuinely dangerous mismatch to talk about', () => {
    expect(worstSwr).toBeGreaterThan(20)
  })

  it('pins the SWR at the top of the scale rather than at Infinity', () => {
    expect(Number.isFinite(solution.radioMatch.swr)).toBe(true)
    expect(solution.radioMatch.swr).toBeLessThanOrEqual(999)
    expect(solution.radioMatch.gammaMag).toBeGreaterThan(0.9)
    expect(solution.radioMatch.gammaMag).toBeLessThanOrEqual(1)
  })

  it('folds the PA back hard and says why', () => {
    expect(solution.pa.protection.foldback).toBeLessThan(0.35)
    expect(solution.pa.forwardW).toBeLessThan(0.4 * PA.ratedW)
    expect(solution.pa.protection.swrTriggered).toBe(true)
    expect(solution.warnings.length).toBeGreaterThan(0)
  })

  it('still returns a completely populated, finite solution', () => {
    expect(findNonFinite(solution)).toBeNull()
    expect(solution.stages).toHaveLength(STAGE_ORDER.length)
    expect(solution.standingWave.positions.length).toBeGreaterThan(2)
  })
})

describe('a tuner at the radio', () => {
  // A mismatch big enough to be worth fixing and inside the range of a
  // wide-range transmatch, on low-loss cable so the line is not the story.
  const base = findStation(
    (s, cfg) =>
      s.radioMatch.swr > 2.5 &&
      s.radioMatch.swr < 15 &&
      solveStation({ ...cfg, tunerMode: 'external-radio' }, cold()).tuner.matched,
    { cableId: 'lmr400', cableLengthM: 20, tunerMode: 'bypass' },
  )
  const without = solveStation(base, cold())
  const with_ = solveStation({ ...base, tunerMode: 'external-radio' }, cold())

  it('does nothing whatever to the SWR on the far side of it', () => {
    // This is the myth the whole application exists to kill: the tuner is at
    // the radio, so the standing wave on the coax is exactly as it was.
    expect(with_.antennaMatch.swr).toBeCloseTo(without.antennaMatch.swr, 9)
    expect(with_.lineMatch.swr).toBeCloseTo(without.lineMatch.swr, 9)
    expect(with_.antennaZ.re).toBeCloseTo(without.antennaZ.re, 9)
    expect(with_.lineInputZ.re).toBeCloseTo(without.lineInputZ.re, 9)
    expect(with_.line.excessLossDb).toBeCloseTo(without.line.excessLossDb, 9)
  })

  it('makes the radio see fifty ohms', () => {
    expect(with_.tuner.matched).toBe(true)
    expect(with_.tuner.engaged).toBe(true)
    expect(with_.radioMatch.swr).toBeLessThan(1.05)
    expect(with_.radioLoadZ.re).toBeCloseTo(50, 1)
    expect(with_.radioLoadZ.im).toBeCloseTo(0, 1)
    expect(without.radioMatch.swr).toBeGreaterThan(2.5)
  })

  it('gets more power to the antenna, because the PA stops folding back', () => {
    expect(with_.pa.forwardW).toBeGreaterThan(without.pa.forwardW)
    expect(with_.radiatedW).toBeGreaterThan(without.radiatedW)
    expect(with_.tunerLossW).toBeGreaterThan(0)
  })
})

describe('a tuner at the antenna instead of at the radio', () => {
  // Lossy cable, so the difference between matching at the two ends is visible.
  const base = findStation(
    (s, cfg) =>
      s.antennaMatch.swr > 2.5 &&
      solveStation({ ...cfg, tunerMode: 'external-antenna' }, cold()).tuner.matched &&
      solveStation({ ...cfg, tunerMode: 'external-radio' }, cold()).tuner.matched,
    { cableId: 'rg58', cableLengthM: 30, tunerMode: 'bypass' },
  )
  const atRadio = solveStation({ ...base, tunerMode: 'external-radio' }, cold())
  const atAntenna = solveStation({ ...base, tunerMode: 'external-antenna' }, cold())

  it('flattens the line itself, so the coax stops paying for the mismatch', () => {
    expect(atAntenna.tuner.matched).toBe(true)
    expect(atAntenna.lineMatch.swr).toBeLessThan(atRadio.lineMatch.swr)
    expect(atAntenna.line.excessLossDb).toBeLessThan(atRadio.line.excessLossDb)
    expect(atAntenna.cableLossW).toBeLessThan(atRadio.cableLossW)
  })

  it('and therefore radiates more of the same hundred watts', () => {
    expect(atAntenna.radiatedW).toBeGreaterThan(atRadio.radiatedW)
    expect(Math.abs(atAntenna.pa.forwardW - atRadio.pa.forwardW)).toBeLessThan(2)
  })
})

describe('a longer, lossier cable', () => {
  // The single most important result in the application. Same antenna, same
  // radio, same power setting; the only change is 70 more metres of cheap coax.
  //
  // The comparison is made two ways on purpose. With the tuner bypassed the
  // radio folds power back differently in the two cases, so the honest measure
  // is the FRACTION of what leaves the socket that reaches the antenna. With a
  // tuner at the radio in both cases the PA is happy either way, so the
  // absolute radiated power can be compared directly.
  const base = findStation((s) => s.antennaMatch.swr > 2 && s.antennaMatch.swr < 12, {
    cableId: 'rg58',
    cableLengthM: 10,
    tunerMode: 'bypass',
  })
  const short = solveStation({ ...base, cableLengthM: 10 }, cold())
  const long = solveStation({ ...base, cableLengthM: 80 }, cold())
  const shortTuned = solveStation(
    { ...base, cableLengthM: 10, tunerMode: 'external-radio' },
    cold(),
  )
  const longTuned = solveStation(
    { ...base, cableLengthM: 80, tunerMode: 'external-radio' },
    cold(),
  )

  it('leaves the antenna exactly as mismatched as it was', () => {
    expect(long.antennaMatch.swr).toBeCloseTo(short.antennaMatch.swr, 9)
    expect(long.antennaZ.re).toBeCloseTo(short.antennaZ.re, 9)
  })

  it('makes the SWR meter in the radio look better', () => {
    expect(long.radioMatch.swr).toBeLessThan(short.radioMatch.swr)
    expect(longTuned.lineMatch.swr).toBeLessThan(shortTuned.lineMatch.swr)
  })

  it('while delivering a smaller fraction of the power to the antenna', () => {
    const reaching = (s: StationSolution): number =>
      s.radiatedW / Math.max(s.pa.netW, 1e-9)
    expect(reaching(long)).toBeLessThan(reaching(short))
    expect(long.line.matchedLossDb).toBeGreaterThan(short.line.matchedLossDb)
    // Most of the transmitter output is now warming a length of coax.
    expect(long.cableLossW / Math.max(long.pa.forwardW, 1e-9)).toBeGreaterThan(0.4)
  })

  it('and less power in absolute terms once the PA is kept happy in both', () => {
    expect(shortTuned.tuner.matched).toBe(true)
    expect(longTuned.tuner.matched).toBe(true)
    expect(longTuned.radiatedW).toBeLessThan(shortTuned.radiatedW)
    expect(longTuned.cableLossW).toBeGreaterThan(shortTuned.cableLossW)
  })

  it('and the loss shows up as heat, not as a better antenna', () => {
    const t = powerTerms(long)
    expect(Math.abs(t.forwardW - t.sum)).toBeLessThan(1e-6)
    expect(t.cableLossW).toBeGreaterThan(t.radiatedW)
  })
})

describe('excess loss on a mismatched line', () => {
  it('costs more than the matched loss alone', () => {
    const matched = solveStation(
      config({ antennaId: 'dummy-load', cableId: 'rg58', cableLengthM: 40 }),
      cold(),
    )
    const mismatched = solveStation(
      config({
        antennaId: 'dipole-40', freqHz: 14_200_000, cableId: 'rg58', cableLengthM: 40,
      }),
      cold(),
    )
    expect(matched.line.excessLossDb).toBeLessThan(0.05)
    expect(mismatched.line.excessLossDb).toBeGreaterThan(matched.line.excessLossDb)
    expect(mismatched.line.totalLossDb).toBeGreaterThan(mismatched.line.matchedLossDb)
  })
})

// ─── Modes, duty and heating ─────────────────────────────────────────────────

describe('mode and compression set the heating', () => {
  const at = (mode: Mode, compression = 0, envelope = 1): StationSolution =>
    solveStation(
      config({ antennaId: 'dummy-load', cableLengthM: 1, mode, compression, envelope }),
      cold(),
    )

  /**
   * Average a quantity over a long stretch of real transmit envelope. This is
   * how averaging happens in the application: the engine feeds modeEnvelope into
   * solveStation frame by frame and the thermal network integrates the result.
   * Nothing multiplies by a duty cycle, so the only way to ask "what does this
   * mode cost in heat" is to actually average it.
   */
  const averaged = (mode: Mode, comp: number, pick: (s: StationSolution) => number): number => {
    let sum = 0
    let n = 0
    for (let t = 0; t < 60; t += 0.02) {
      sum += pick(at(mode, comp, modeEnvelope(mode, t, comp)))
      n++
    }
    return sum / n
  }

  it('reports instantaneous envelope power, not a duty-weighted average', () => {
    // A peak-reading meter shows 100 W on an SSB peak into a dummy load, and so
    // does this. The mode's duty cycle lives in the envelope, and it is applied
    // exactly once. Applying it here too would read 21 W, which is the bug this
    // test exists to prevent.
    expect(at('USB', 0, 1).pa.forwardW).toBeCloseTo(PA.ratedW, 0)
    expect(at('FM').pa.forwardW).toBeCloseTo(PA.ratedW, 0)
    expect(at('CW', 0, 1).pa.forwardW).toBeCloseTo(PA.ratedW, 0)
  })

  it('runs SSB at about a fifth of a constant carrier once averaged over time', () => {
    const ssb = averaged('USB', 0, (s) => s.pa.forwardW)
    const fm = averaged('FM', 0, (s) => s.pa.forwardW)
    expect(ssb / fm).toBeGreaterThan(0.15)
    expect(ssb / fm).toBeLessThan(0.28)
    expect(ssb / fm).toBeCloseTo(MODES.USB.dutyCycle, 1)
  })

  it('makes COMP raise the average power and the heat, but not the peak', () => {
    const plainAvg = averaged('USB', 0, (s) => s.pa.forwardW)
    const compAvg = averaged('USB', 10, (s) => s.pa.forwardW)
    expect(compAvg).toBeGreaterThan(1.8 * plainAvg)
    expect(averaged('USB', 10, (s) => s.pa.paDissipationW)).toBeGreaterThan(
      averaged('USB', 0, (s) => s.pa.paDissipationW),
    )
    // The peak is identical either way — that is the whole point of a compressor.
    expect(at('USB', 10, 1).pa.forwardW).toBeCloseTo(at('USB', 0, 1).pa.forwardW, 3)
    expect(at('USB', 10, 1).stages.find((s) => s.id === 'final-pa')?.level).toContain('100 W')
  })

  it('matches the audio model exactly, so the duty cycle is counted once', () => {
    const reference = (comp: number): number => {
      let sum = 0
      let n = 0
      for (let t = 0; t < 60; t += 0.02) {
        const e = modeEnvelope('USB', t, comp)
        sum += e * e
        n++
      }
      return sum / n
    }
    const keyDown = at('FM').pa.forwardW
    for (const comp of [0, 5, 10]) {
      expect(averaged('USB', comp, (s) => s.pa.forwardW) / keyDown).toBeCloseTo(reference(comp), 2)
    }
  })

  it('heats hardest on the modes that never stop', () => {
    expect(averaged('FM', 0, (s) => s.pa.paDissipationW)).toBeGreaterThan(
      averaged('USB', 0, (s) => s.pa.paDissipationW),
    )
    expect(averaged('RTTY', 0, (s) => s.pa.paDissipationW)).toBeGreaterThan(
      averaged('CW', 0, (s) => s.pa.paDissipationW),
    )
  })
})

// ─── Receive ─────────────────────────────────────────────────────────────────

describe('with the key up', () => {
  const solution = solveStation(config({ keyed: false }), cold())

  it('makes no power at all', () => {
    expect(solution.pa.forwardW).toBe(0)
    expect(solution.pa.reflectedW).toBe(0)
    expect(solution.radiatedW).toBe(0)
    expect(solution.cableLossW).toBe(0)
    expect(solution.tunerLossW).toBe(0)
    expect(solution.standingWave.vPeakVolts).toBe(0)
  })

  it('still returns everything the UI needs to draw', () => {
    expect(findNonFinite(solution)).toBeNull()
    expect(solution.stages).toHaveLength(STAGE_ORDER.length)
    expect(solution.standingWave.positions.length).toBeGreaterThan(2)
    expect(Number.isFinite(solution.antennaZ.re)).toBe(true)
    expect(solution.radioMatch.swr).toBeGreaterThanOrEqual(1)
    for (const st of solution.stages) expect(st.activity).toBe(0)
  })

  it('is not stressing anything', () => {
    expect(solution.stresses).toEqual([])
    expect(heatSources(solution)['pa-junction']).toBe(0)
  })
})

// ─── Stage levels ────────────────────────────────────────────────────────────

describe('stageStates', () => {
  const cfg = config({ mode: 'USB', envelope: 0.9, antennaId: 'dipole-20' })
  const solution = solveStation(cfg, cold())
  const byId = (id: StageId) => solution.stages.find((s) => s.id === id)

  it('reports each stage in the unit that stage is measured in', () => {
    expect(byId('voice')?.unit).toBe('dB SPL')
    expect(byId('mic-element')?.unit).toBe('V')
    expect(byId('af-adc')?.unit).toBe('dBFS')
    expect(byId('predriver')?.unit).toBe('dBm')
    expect(byId('final-pa')?.unit).toBe('W')
    expect(byId('feedline')?.unit).toBe('V')
    expect(byId('space')?.unit).toBe('W')
  })

  it('puts believable numbers on the audio end of the chain', () => {
    const mic = byId('mic-element')
    expect(mic?.value).toBeGreaterThan(0.0001)
    expect(mic?.value).toBeLessThan(0.05)
    expect(mic?.level).toContain('mV')
    expect(byId('af-adc')?.level).toContain('bits')
    expect(byId('af-adc')?.value).toBeLessThan(0)
    expect(byId('voice')?.value).toBeGreaterThan(60)
    expect(byId('voice')?.value).toBeLessThan(100)
  })

  it('climbs monotonically through the low-level RF stages', () => {
    const dac = byId('tx-dac')?.value ?? 0
    const predriver = byId('predriver')?.value ?? 0
    const driver = byId('driver')?.value ?? 0
    expect(predriver).toBeGreaterThan(dac)
    expect(driver).toBeGreaterThan(predriver)
    expect(driver).toBeLessThan(50)
  })

  it('shows volts and amps on the feedline and watts in space', () => {
    expect(byId('feedline')?.level).toMatch(/V .*peak/)
    expect(byId('feedline')?.level).toContain('A')
    expect(byId('space')?.level).toContain('radiated')
    expect(byId('antenna')?.level).toContain('feedpoint')
    expect(byId('swr-bridge')?.level).toContain(':1')
  })

  it('can be called on its own with the same result', () => {
    const { stages: _stages, stresses: _stresses, ...base } = solution
    const again = stageStates(base, cold())
    expect(again.map((s) => s.level)).toEqual(solution.stages.map((s) => s.level))
  })

  it('says so plainly when a stage is not in the path', () => {
    const cw = solveStation(config({ mode: 'CW' }), cold())
    expect(cw.stages.find((s) => s.id === 'mic-element')?.level).toContain('no microphone')
    expect(cw.stages.find((s) => s.id === 'mic-element')?.activity).toBe(0)
  })
})

// ─── Stresses and heat ───────────────────────────────────────────────────────

describe('componentStresses', () => {
  it('is empty for a cold, matched, idle radio', () => {
    expect(componentStresses(
      { ...solveStation(config({ keyed: false }), cold()) },
      cold(),
    )).toEqual([])
  })

  it('reports the finals when the junction is over temperature', () => {
    const base = cold()
    const hot: ThermalState = {
      ...base,
      temps: { ...base.temps, 'pa-junction': 145, 'pa-heatsink': 88 },
    }
    const solution = solveStation(config({ antennaId: 'dummy-load' }), hot)
    const stresses = solution.stresses
    expect(stresses.length).toBeGreaterThan(0)
    const junction = stresses.find(
      (s) => s.componentId === 'final-q1' && s.kind === 'junction-temperature',
    )
    expect(junction).toBeDefined()
    expect(junction?.severity).toBeGreaterThan(0.5)
    expect(junction?.measured).toContain('C')
    expect(junction?.failureMode.length).toBeGreaterThan(10)
    expect(['instant', 'seconds', 'minutes', 'hours', 'cumulative']).toContain(junction?.timescale)
  })

  it('is sorted worst first and never repeats a part and failure mode', () => {
    const base = cold()
    const hot: ThermalState = {
      ...base,
      temps: { ...base.temps, 'pa-junction': 148, 'pa-heatsink': 92, 'atu-inductor': 140 },
    }
    const solution = solveStation(
      config({ antennaId: 'efhw-40', freqHz: 7_150_000, tunerMode: 'internal' }),
      hot,
    )
    const seen = new Set<string>()
    let previous = Number.POSITIVE_INFINITY
    for (const s of solution.stresses) {
      const key = `${s.componentId}|${s.kind}`
      expect(seen.has(key)).toBe(false)
      seen.add(key)
      expect(s.severity).toBeLessThanOrEqual(previous)
      previous = s.severity
      expect(s.severity).toBeGreaterThan(0)
      expect(Number.isFinite(s.severity)).toBe(true)
    }
  })
})

describe('heatSources', () => {
  it('names every thermal node, whether or not it is being heated', () => {
    const solution = solveStation(config(), cold())
    const heat = heatSources(solution)
    for (const node of THERMAL_NODES) {
      expect(heat[node.id]).toBeDefined()
      expect(Number.isFinite(heat[node.id] ?? Number.NaN)).toBe(true)
      expect(heat[node.id] ?? -1).toBeGreaterThanOrEqual(0)
    }
  })

  it('puts the PA dissipation on the PA junction', () => {
    const solution = solveStation(config({ antennaId: 'dummy-load' }), cold())
    const heat = heatSources(solution)
    expect(heat['pa-junction']).toBeCloseTo(solution.pa.paDissipationW, 9)
    expect(solution.pa.paDissipationW).toBeGreaterThan(10)
  })

  it('leaves a little housekeeping heat behind on receive', () => {
    const heat = heatSources(solveStation(config({ keyed: false }), cold()))
    const total = Object.values(heat).reduce((a, b) => a + b, 0)
    expect(total).toBeGreaterThan(0)
    expect(total).toBeLessThan(10)
  })

  it('does not put an external tuner inside the radio', () => {
    const internal = heatSources(
      solveStation(config({ antennaId: 'dipole-40', freqHz: 7_100_000, tunerMode: 'internal' }), cold()),
    )
    const external = heatSources(
      solveStation(config({ antennaId: 'dipole-40', freqHz: 7_100_000, tunerMode: 'external-radio' }), cold()),
    )
    expect(external['atu-inductor']).toBe(0)
    expect(internal['atu-inductor'] ?? 0).toBeGreaterThanOrEqual(0)
  })
})

// ─── Robustness ──────────────────────────────────────────────────────────────

describe('solveStation is total', () => {
  it('survives nonsense without throwing', () => {
    const nonsense: StationConfig[] = [
      config({ freqHz: Number.NaN }),
      config({ freqHz: 0 }),
      config({ freqHz: Number.POSITIVE_INFINITY }),
      config({ cableLengthM: -50 }),
      config({ cableLengthM: Number.NaN }),
      config({ powerSetW: -10 }),
      config({ powerSetW: 100_000 }),
      config({ envelope: Number.NaN }),
      config({ envelope: 5 }),
      config({ compression: -3 }),
      config({ micGain: 1e9 }),
      config({ antennaId: 'not-an-antenna' as AntennaId }),
      config({ cableId: 'not-a-cable' as CableId }),
      config({ mode: 'not-a-mode' as Mode }),
      config({ tunerMode: 'not-a-tuner' as TunerMode }),
    ]
    for (const cfg of nonsense) {
      const solution = solveStation(cfg, cold())
      expect(findNonFinite(solution)).toBeNull()
      expect(solution.stages).toHaveLength(STAGE_ORDER.length)
      const t = powerTerms(solution)
      expect(Math.abs(t.forwardW - t.sum)).toBeLessThan(1e-6)
    }
  })

  it('survives a broken thermal state', () => {
    const broken: ThermalState = {
      temps: {},
      damage: {},
      ambientC: Number.NaN,
      fan: Number.NaN,
    }
    const solution = solveStation(config(), broken)
    expect(findNonFinite(solution)).toBeNull()
  })

  it('is deterministic', () => {
    const cfg = config({ antennaId: 'g5rv', freqHz: 10_120_000, cableLengthM: 23.5 })
    const a = solveStation(cfg, cold())
    const b = solveStation(cfg, cold())
    expect(a.radiatedW).toBe(b.radiatedW)
    expect(a.radioMatch.swr).toBe(b.radioMatch.swr)
    expect(a.stages.map((s) => s.level)).toEqual(b.stages.map((s) => s.level))
  })
})

describe('antenna efficiency', () => {
  it('separates what reaches the antenna from what leaves it', () => {
    const whip = solveStation(
      config({ antennaId: 'mobile-whip-20', freqHz: 14_200_000, tunerMode: 'external-radio' }),
      cold(),
    )
    const dipole = solveStation(
      config({ antennaId: 'dipole-20', freqHz: 14_200_000, tunerMode: 'external-radio' }),
      cold(),
    )
    const whipFeed = stageValue(whip, 'antenna')
    const dipoleFeed = stageValue(dipole, 'antenna')
    expect(whipFeed).toBeGreaterThan(0)
    // Both are given a comparable amount of power at the feedpoint...
    expect(whipFeed / dipoleFeed).toBeGreaterThan(0.3)
    // ...and one of them turns nearly all of it into heat.
    expect(whip.radiatedW / whipFeed).toBeLessThan(0.25)
    expect(dipole.radiatedW / dipoleFeed).toBeGreaterThan(0.85)
    expect(whip.radiatedW).toBeLessThan(dipole.radiatedW)
  })
})

