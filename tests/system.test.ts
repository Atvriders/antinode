import { describe, expect, it } from 'vitest'
import { ANTENNA_LIST, defaultParams } from '../src/rf/antennas'
import { CABLE_LIST } from '../src/rf/cables'
import { BANDS } from '../src/rf/bands'
import { solveStation } from '../src/rf/chain'
import { initialThermalState } from '../src/rf/thermal'
import type { StationConfig, TunerMode } from '../src/rf/types'

/**
 * Cross-module invariants. Each RF module has its own unit tests; these check
 * the claims the application actually makes on screen, which no single module
 * owns. If one of these fails, a presenter would say something untrue.
 */

const base = (over: Partial<StationConfig> = {}): StationConfig => ({
  freqHz: 14_200_000,
  mode: 'USB',
  powerSetW: 100,
  micGain: 50,
  compression: 0,
  antennaId: 'dipole-20',
  antennaParams: defaultParams('dipole-20'),
  cableId: 'rg8x',
  cableLengthM: 20,
  tunerMode: 'bypass',
  tunerEngaged: true,
  keyed: true,
  envelope: 1,
  ambientC: 25,
  allowDamage: false,
  ...over,
})

const thermal = initialThermalState(25)

/** Walk every number in the solution and complain about any that is not finite. */
function findBadNumbers(value: unknown, path = ''): string[] {
  const bad: string[] = []
  const seen = new Set<unknown>()
  const walk = (v: unknown, p: string) => {
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) bad.push(`${p} = ${v}`)
      return
    }
    if (v instanceof Float32Array || v instanceof Float64Array) {
      for (let i = 0; i < v.length; i++) {
        if (!Number.isFinite(v[i] ?? 0)) { bad.push(`${p}[${i}]`); return }
      }
      return
    }
    if (v && typeof v === 'object') {
      if (seen.has(v)) return
      seen.add(v)
      for (const [k, child] of Object.entries(v)) walk(child, p ? `${p}.${k}` : k)
    }
  }
  walk(value, path)
  return bad
}

describe('the whole station', () => {
  it('produces a finite solution for every antenna on every band', () => {
    const problems: string[] = []
    for (const antenna of ANTENNA_LIST) {
      for (const band of BANDS) {
        for (const tunerMode of ['bypass', 'internal', 'external-antenna'] as TunerMode[]) {
          const config = base({
            antennaId: antenna.id,
            antennaParams: defaultParams(antenna.id),
            freqHz: band.defaultHz,
            tunerMode,
          })
          const sol = solveStation(config, thermal)
          const bad = findBadNumbers(sol)
          if (bad.length > 0) {
            problems.push(`${antenna.id} @ ${band.id} ${tunerMode}: ${bad.slice(0, 3).join(', ')}`)
          }
        }
      }
    }
    expect(problems, problems.slice(0, 12).join('\n')).toEqual([])
  })

  it('conserves power for every cable and every length', () => {
    const problems: string[] = []
    for (const cable of CABLE_LIST) {
      for (const lengthM of [1, 8, 25, 60, 120]) {
        for (const antennaId of ['dipole-20', 'random-wire-9to1', 'mobile-whip-20'] as const) {
          const sol = solveStation(
            base({ cableId: cable.id, cableLengthM: lengthM, antennaId, antennaParams: defaultParams(antennaId) }),
            thermal,
          )
          const out = sol.radiatedW + sol.cableLossW + sol.tunerLossW + sol.pa.reflectedW
          const inW = sol.pa.forwardW
          // Antenna efficiency turns some feedpoint power into ground and coil
          // loss, so the balance is an upper bound, not an equality.
          if (out > inW + 1e-6) {
            problems.push(`${cable.id} ${lengthM}m ${antennaId}: out ${out.toFixed(3)} > in ${inW.toFixed(3)}`)
          }
          if (sol.radiatedW < -1e-9 || sol.cableLossW < -1e-9) {
            problems.push(`${cable.id} ${lengthM}m ${antennaId}: negative power`)
          }
        }
      }
    }
    expect(problems, problems.slice(0, 10).join('\n')).toEqual([])
  })

  it('is deterministic', () => {
    const config = base({ antennaId: 'g5rv', antennaParams: defaultParams('g5rv'), freqHz: 7_150_000 })
    const a = solveStation(config, thermal)
    const b = solveStation(config, thermal)
    expect(a.radioMatch.swr).toBe(b.radioMatch.swr)
    expect(a.radiatedW).toBe(b.radiatedW)
    expect(a.pa.paDissipationW).toBe(b.pa.paDissipationW)
  })

  it('reads a better SWR through a long lossy cable while delivering less power', () => {
    // The single most important result in the application: the SWR meter can be
    // flattered by loss, so a "good" reading can mean a worse station.
    //
    // The antenna is deliberately below the foldback threshold in both cases, so
    // the radio makes the same power either way and the ONLY difference is the
    // cable. That isolates the lesson from the protection circuit.
    const at = (lengthM: number) =>
      solveStation(
        base({
          cableId: 'rg58',
          cableLengthM: lengthM,
          freqHz: 14_200_000,
          antennaId: 'dipole-20',
          antennaParams: defaultParams('dipole-20'),
        }),
        thermal,
      )
    const shortRun = at(3)
    const longRun = at(90)

    // What matters is that no power is being taken away in either case, so the
    // only difference between the two readings is the cable.
    expect(shortRun.pa.protection.foldback).toBe(1)
    expect(longRun.pa.protection.foldback).toBe(1)
    expect(longRun.pa.forwardW).toBeCloseTo(shortRun.pa.forwardW, 1)
    expect(longRun.radioMatch.swr).toBeLessThan(shortRun.radioMatch.swr)
    expect(longRun.radiatedW).toBeLessThan(shortRun.radiatedW * 0.5)
    // Both see the same antenna, so the mismatch at the feedpoint is unchanged.
    expect(longRun.antennaMatch.swr).toBeCloseTo(shortRun.antennaMatch.swr, 3)
  })

  it('lets a lossy line rescue an impossible load, which is not the same as fixing it', () => {
    // Into a hopeless mismatch the protection circuit, not the cable, decides how
    // much power leaves. A long lossy run absorbs enough of the reflection that
    // the radio stops folding back and MORE power reaches the antenna than
    // through a short one. It is a real effect, it is why "my SWR is fine at the
    // rig" happens, and it is the opposite of an improvement: almost all of the
    // output is heating the coax.
    const at = (lengthM: number) =>
      solveStation(
        base({
          cableId: 'rg58',
          cableLengthM: lengthM,
          freqHz: 28_400_000,
          antennaId: 'dipole-40',
          antennaParams: defaultParams('dipole-40'),
        }),
        thermal,
      )
    const shortRun = at(3)
    const longRun = at(90)

    expect(shortRun.radioMatch.swr).toBeGreaterThan(8)
    expect(longRun.radioMatch.swr).toBeLessThan(3)
    expect(shortRun.pa.protection.level).not.toBe('normal')
    expect(longRun.pa.forwardW).toBeGreaterThan(shortRun.pa.forwardW * 2)
    // And nearly all of it is heating the cable rather than going anywhere.
    expect(longRun.cableLossW).toBeGreaterThan(longRun.radiatedW * 5)
  })

  it('places the tuner correctly: at the radio it does not fix the feedline', () => {
    const config = base({ antennaId: 'random-wire-9to1', antennaParams: defaultParams('random-wire-9to1'), freqHz: 14_200_000, cableLengthM: 30 })
    const bypass = solveStation({ ...config, tunerMode: 'bypass' }, thermal)
    const atRadio = solveStation({ ...config, tunerMode: 'external-radio' }, thermal)
    const atAntenna = solveStation({ ...config, tunerMode: 'external-antenna' }, thermal)

    // All three see the same antenna.
    expect(atRadio.antennaMatch.swr).toBeCloseTo(bypass.antennaMatch.swr, 3)
    expect(atAntenna.antennaMatch.swr).toBeCloseTo(bypass.antennaMatch.swr, 3)

    // A tuner at the radio makes the radio happy...
    if (atRadio.tuner.matched) {
      expect(atRadio.radioMatch.swr).toBeLessThan(1.3)
      // ...but the feedline still carries the standing wave, so the extra loss stays.
      expect(atRadio.line.excessLossDb).toBeCloseTo(bypass.line.excessLossDb, 3)
    }

    // A tuner at the feedpoint flattens the line, so the excess loss goes away.
    if (atAntenna.tuner.matched) {
      expect(atAntenna.line.excessLossDb).toBeLessThan(bypass.line.excessLossDb + 1e-6)
      expect(atAntenna.radiatedW).toBeGreaterThan(atRadio.radiatedW)
    }
  })

  it('folds power back into a bad load and does not into a good one', () => {
    const good = solveStation(base({ antennaId: 'dummy-load', antennaParams: defaultParams('dummy-load') }), thermal)
    expect(good.radioMatch.swr).toBeLessThan(1.02)
    expect(good.pa.forwardW).toBeGreaterThan(90)
    expect(good.pa.protection.level).toBe('normal')

    const bad = solveStation(base({ antennaId: 'mobile-whip-20', antennaParams: defaultParams('mobile-whip-20'), freqHz: 3_700_000 }), thermal)
    expect(bad.radioMatch.swr).toBeGreaterThan(3)
    expect(bad.pa.forwardW).toBeLessThan(good.pa.forwardW)
    expect(bad.pa.protection.reasons.length).toBeGreaterThan(0)
  })

  it('goes quiet when the key is up but still returns a complete solution', () => {
    const rx = solveStation(base({ keyed: false, envelope: 0 }), thermal)
    expect(rx.pa.forwardW).toBeLessThan(0.5)
    expect(rx.radiatedW).toBeLessThan(0.5)
    expect(findBadNumbers(rx)).toEqual([])
    expect(rx.stages.length).toBeGreaterThan(10)
  })

  it('reports a dummy load as a perfect match that radiates nothing', () => {
    // The reason "low SWR" is not the same as "good antenna".
    const sol = solveStation(base({ antennaId: 'dummy-load', antennaParams: defaultParams('dummy-load') }), thermal)
    expect(sol.radioMatch.swr).toBeLessThan(1.02)
    expect(sol.radiatedW).toBeLessThan(1)
  })
})
