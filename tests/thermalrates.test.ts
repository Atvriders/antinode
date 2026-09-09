import { describe, expect, it } from 'vitest'
import { solveStation, heatSources } from '../src/rf/chain'
import { initialThermalState, stepThermal } from '../src/rf/thermal'
import { defaultParams } from '../src/rf/antennas'
import { modeEnvelope } from '../src/rf/audio'
import type { Mode, StationConfig } from '../src/rf/types'

const cfg = (mode: Mode): StationConfig => ({
  freqHz: 14.1e6, mode, powerSetW: 100, micGain: 50, compression: 0,
  antennaId: 'dummy-load', antennaParams: defaultParams('dummy-load'),
  cableId: 'rg8x', cableLengthM: 5, tunerMode: 'bypass', tunerEngaged: false,
  keyed: true, envelope: 1, ambientC: 25, allowDamage: false,
})

/** Key down for `seconds`, following the mode's real envelope. */
function keyDown(mode: Mode, seconds: number) {
  let thermal = initialThermalState(25)
  let solution = solveStation(cfg(mode), thermal)
  for (let t = 0; t < seconds; t += 0.05) {
    solution = solveStation({ ...cfg(mode), envelope: modeEnvelope(mode, t, 0) }, thermal)
    thermal = stepThermal(thermal, heatSources(solution), 0.05, false)
  }
  return { thermal, solution }
}

describe('what the panel meters read', () => {
  it('shows the sensor on the PA assembly, not the die', () => {
    // The reported bug: the TEMP meter slammed to over 100 degC within a few
    // seconds of keying, because it was showing the junction — which really does
    // respond in about a tenth of a second. A radio's TEMP meter reads a
    // thermistor bolted to a few hundred grams of aluminium and moves in minutes.
    const five = keyDown('FM', 5)
    expect(five.solution.sensorTempC).toBeLessThan(30)
    expect(five.thermal.temps['pa-junction'] ?? 0).toBeGreaterThan(90)

    // And over ten minutes of continuous carrier it does climb, steadily.
    const long = keyDown('FM', 600)
    expect(long.solution.sensorTempC).toBeGreaterThan(40)
    expect(long.solution.sensorTempC).toBeLessThan(70)
  })

  it('warms gradually rather than in a step', () => {
    const at = [10, 60, 180].map((s) => keyDown('FM', s).solution.sensorTempC)
    const [a = 0, b = 0, c = 0] = at
    expect(b).toBeGreaterThan(a)
    expect(c).toBeGreaterThan(b)
    // No single interval may be most of the whole rise.
    expect(a - 25).toBeLessThan((c - 25) * 0.35)
  })

  it('reports the current the whole radio draws, not the finals alone', () => {
    // Icom publish 21 A maximum; an independent test measured 16.6 A at 100 W on
    // 20 m. The finals alone account for about 14.5 A of that.
    const { solution } = keyDown('FM', 1)
    expect(solution.pa.supplyCurrentA).toBeGreaterThan(13)
    expect(solution.pa.supplyCurrentA).toBeLessThan(16)
    expect(solution.radioSupplyCurrentA).toBeGreaterThan(15.5)
    expect(solution.radioSupplyCurrentA).toBeLessThan(18)
    expect(solution.radioSupplyCurrentA).toBeLessThan(21)
  })

  it('draws housekeeping current with the key up', () => {
    const thermal = initialThermalState(25)
    const rx = solveStation({ ...cfg('USB'), keyed: false, envelope: 0 }, thermal)
    expect(rx.radioSupplyCurrentA).toBeGreaterThan(0.5)
    expect(rx.radioSupplyCurrentA).toBeLessThan(2)
  })
})
