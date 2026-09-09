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
    expect(five.solution.sensorTempC).toBeLessThan(28)
    expect(five.thermal.temps['pa-junction'] ?? 0).toBeGreaterThan(70)

    // And over ten minutes of continuous carrier it does climb, steadily.
    const long = keyDown('FM', 600)
    expect(long.solution.sensorTempC).toBeGreaterThan(35)
    expect(long.solution.sensorTempC).toBeLessThan(55)
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

describe('continuous duty at full power', () => {
  /** Key down in DATA — 100 percent duty — and report the state at intervals. */
  const soak = (seconds: number, powerSetW = 100) => {
    const config: StationConfig = {
      freqHz: 14.074e6, mode: 'DATA', powerSetW, micGain: 50, compression: 0,
      antennaId: 'dipole-20', antennaParams: defaultParams('dipole-20'),
      cableId: 'rg8x', cableLengthM: 20, tunerMode: 'bypass', tunerEngaged: false,
      keyed: true, envelope: 1, ambientC: 25, allowDamage: true,
    }
    let thermal = initialThermalState(25)
    let solution = solveStation(config, thermal)
    // Half-second outer steps: stepThermal sub-steps internally to stay stable,
    // and half an hour of simulated soak at frame rate is 36,000 solver calls
    // for no extra fidelity.
    const dt = 0.5
    for (let t = 0; t < seconds; t += dt) {
      solution = solveStation(config, thermal)
      thermal = stepThermal(thermal, heatSources(solution), dt, true)
    }
    return { thermal, solution }
  }

  it('does not put the finals in trouble in the first minute', () => {
    // The reported fault. A radio that passed its warning point ten seconds into
    // an FT8 transmission and had cut its own power to 73 W inside two minutes
    // was modelling a heatsink floating in space with a thermostatic fan. The
    // real thing has a 4.2 kg chassis bolted to it and runs the fan on transmit.
    const minute = soak(60)
    expect(minute.solution.pa.protection.level).toBe('normal')
    expect(minute.solution.pa.forwardW).toBeGreaterThan(95)
    expect(minute.thermal.temps['pa-heatsink'] ?? 0).toBeLessThan(40)
  })

  it('holds full output indefinitely, hot but not folding back', { timeout: 30_000 }, () => {
    // Running 100 W of digital is hard on this radio and the fan says so, but it
    // is something people do; it must not shut itself down doing it.
    const half = soak(1800)
    expect(half.solution.pa.forwardW).toBeGreaterThan(95)
    expect(half.thermal.damage['pa-junction'] ?? 0).toBe(0)
    expect(half.thermal.fan).toBeGreaterThan(0.4)
    // And it is genuinely warm, which is the reason for the usual advice to
    // turn the power down for digital modes.
    expect(half.thermal.temps['pa-heatsink'] ?? 0).toBeGreaterThan(38)
  })

  it('warms over minutes, not seconds', { timeout: 30_000 }, () => {
    const at = [10, 60, 300, 900].map((s) => soak(s).thermal.temps['pa-heatsink'] ?? 0)
    const [a = 0, b = 0, c = 0, d = 0] = at
    expect(b).toBeGreaterThan(a)
    expect(c).toBeGreaterThan(b)
    expect(d).toBeGreaterThan(c)
    // The first ten seconds must be a small fraction of the whole rise.
    expect(a - 25).toBeLessThan((d - 25) * 0.1)
  })

  it('is easier on itself at half power — but by less than half', { timeout: 30_000 }, () => {
    const full = soak(900, 100)
    const half = soak(900, 50)

    expect(half.thermal.temps['pa-heatsink'] ?? 0).toBeLessThan(full.thermal.temps['pa-heatsink'] ?? 0)
    expect(half.thermal.temps['pa-junction'] ?? 0).toBeLessThan(full.thermal.temps['pa-junction'] ?? 0)

    // The point worth making, and the reason "just turn it down" helps less than
    // people expect: a class-AB stage is less efficient at lower drive, so
    // halving the output does not halve the heat. Dissipation falls from about
    // 118 W to about 91 W — a quarter, not a half — and the temperature rise
    // above ambient follows it.
    const fullRise = (full.thermal.temps['pa-junction'] ?? 0) - 25
    const halfRise = (half.thermal.temps['pa-junction'] ?? 0) - 25
    expect(halfRise).toBeGreaterThan(fullRise * 0.6)
    expect(halfRise).toBeLessThan(fullRise * 0.95)
    expect(half.solution.pa.paDissipationW).toBeGreaterThan(full.solution.pa.paDissipationW * 0.6)
  })
})

/**
 * The calibration anchor.
 *
 * Almost nothing about this radio's thermal behaviour is published. Icom give no
 * duty-cycle derating, no protection thresholds and an unmarked TEMP gauge, and
 * the ARRL lab review contains no thermal test at all. The one instrumented
 * measurement in public is Adam Farson's (VA7OJ/AB4OJ) evaluation report, and
 * these are its numbers. If a change to the thermal model breaks this test, the
 * model has drifted away from the only evidence there is.
 */
describe('agrees with the one published measurement', () => {
  const keyDownAt = (seconds: number) => {
    const config: StationConfig = {
      freqHz: 14.1e6, mode: 'FM', powerSetW: 100, micGain: 50, compression: 0,
      antennaId: 'dummy-load', antennaParams: defaultParams('dummy-load'),
      cableId: 'rg8x', cableLengthM: 5, tunerMode: 'bypass', tunerEngaged: false,
      keyed: true, envelope: 1, ambientC: 25, allowDamage: false,
    }
    let thermal = initialThermalState(25)
    let solution = solveStation(config, thermal)
    for (let t = 0; t < seconds; t += 0.5) {
      solution = solveStation(config, thermal)
      thermal = stepThermal(thermal, heatSources(solution), 0.5, false)
    }
    return { thermal, solution }
  }

  it('draws 16.6 A at 100 W on 20 m', () => {
    // Measured: 16.6 A from 13.8 V for 100.5 W out at 14.1 MHz.
    const { solution } = keyDownAt(1)
    expect(solution.radioSupplyCurrentA).toBeGreaterThan(16.0)
    expect(solution.radioSupplyCurrentA).toBeLessThan(17.2)
  })

  it("reaches about 35 degC after several minutes' key-down at 100 W", () => {
    // Measured: "Average case temperature was 33 degC, rising to 35 degC at the
    // hottest point after several minutes' key-down transmit at 100 W
    // (temperature indicator blue)."
    const { solution } = keyDownAt(180)
    expect(solution.sensorTempC).toBeGreaterThan(31)
    expect(solution.sensorTempC).toBeLessThan(39)
  })

  it('never shows the protection acting, at any point in an hour', () => {
    // No first-hand report exists of an IC-7300 showing LMT during ordinary
    // full-power operation into a good load, and the manual attaches no
    // duty-cycle limit to the radio at all — unlike Icom's fanless sets, where
    // they state one explicitly.
    for (const seconds of [30, 300, 1800, 3600]) {
      const { solution } = keyDownAt(seconds)
      expect(solution.pa.protection.level, `at ${seconds}s`).toBe('normal')
      expect(solution.pa.forwardW, `at ${seconds}s`).toBeGreaterThan(95)
    }
  })

  it('keeps the die well inside the devices own rating', () => {
    // Two RD70HVF1 making 100 W between them are at about 71 percent of their
    // combined rating, and the channel maximum is 175 degC.
    const { thermal } = keyDownAt(3600)
    expect(thermal.temps['pa-junction'] ?? 0).toBeLessThan(130)
    expect(thermal.damage['pa-junction'] ?? 0).toBe(0)
  })
})
