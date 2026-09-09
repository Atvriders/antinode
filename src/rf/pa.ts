/**
 * Antinode — the final amplifier.
 *
 * The IC-7300's output stage is a pair of Mitsubishi RD70HVF1 RF power MOSFETs
 * (Q131 and Q132) in push-pull from the nominal 13.8 V supply, producing 2 to
 * 100 W on HF and 6 m.
 *
 * The part number is worth stating plainly, because the internet is confidently
 * wrong about it: the IC-7300 is very widely said to use RD100HHF1 devices, and
 * it does not. Icom's own service manual parts list gives RD70HVF1C-121 for both
 * finals, and the block diagram labels the pair "RD70HVF1 x2". Numbers marked
 * "confirmed" below come from the Mitsubishi RD70HVF1 data sheet (Oct 2011):
 *
 *   VDSS  30 V        ID  20 A per device
 *   Pch   150 W       Tch 175 degC absolute maximum
 *   Rth(ch-c) 1.0 degC/W per device
 *   Pout  70 W min / 75 W typical at 175 MHz, VDD 12.5 V
 *   Drain efficiency 55 % min / 60 % typical
 *   Load VSWR tolerance: no destruction at 20:1, all phase angles, at 70 W out
 *     with VDD 15.2 V -- WITH DRIVE CONTROL ("Pin control").
 *
 * Two 70 W devices making 100 W together are running well inside themselves,
 * which is the usual way a 100 W HF radio is built and part of why these finals
 * are rugged rather than fragile.
 *
 * That last line is the whole design of every modern transceiver in one clause.
 * The device survives an infinite mismatch only because something upstream pulls
 * the drive back. That something is modelled in protectionFor.
 *
 *
 * WHAT A MISMATCH ACTUALLY DOES TO THE FINALS
 *
 * The folk model is that the reflected wave travels back down the coax, arrives
 * at the PA, and is absorbed there as heat, so a 3:1 SWR "sends 25 % of your
 * power back into the finals and cooks them". That is not what happens, and
 * this whole application exists partly to say so.
 *
 * A transmitter PA is not a matched 50 ohm source. Its output network is a
 * transformer, not a terminator, so the returning wave is not absorbed: it is
 * re-reflected back toward the antenna, and in the steady state all of the power
 * that leaves the PA either radiates or is dissipated in the line and the load.
 * The steady state that gets set up is simply this: the drains are working into
 * a different impedance from the one the stage was designed for.
 *
 * What the PA sees at its load plane is 50 ohms transformed by Gamma,
 * Z = 50 (1 + Gamma) / (1 - Gamma). The load line rotates. At the load plane the
 * standing wave gives V = V+ (1 + Gamma) and I = (V+/Z0)(1 - Gamma), so the peak
 * drain voltage scales with |1 + Gamma| and the peak drain current with
 * |1 - Gamma|. Those two are opposites: the SAME 3:1 mismatch is an overvoltage
 * event at one phase angle and an overcurrent event 90 degrees of line away.
 * That is why a rig can be perfectly happy into one 3:1 load and unhappy into
 * another with the identical SWR reading, and why the data sheet has to say
 * "all phase" when it quotes a survival figure.
 *
 * Heat follows from the efficiency change, not from the returning wave: off its
 * design load line the stage converts less DC into RF, and the difference stays
 * in the silicon. Destruction, when it happens, is not the heat. It is the peak
 * voltage exceeding VDSS on a single RF cycle.
 *
 * Units: W, V, A, ohms, degC. Averages unless a name says peak.
 */

import type { Complex, PaResult, ProtectionLevel, ProtectionState } from './types'
import { cAbs } from './complex'
import { swrFromGamma } from './match'

export const PA: {
  readonly ratedW: number
  readonly supplyV: number
  readonly peakEfficiency: number
  readonly foldbackStartSwr: number
  readonly foldbackFullSwr: number
  readonly maxDissipationW: number
  readonly deviceCount: number
} = {
  /** Confirmed: Icom's published 2-100 W HF output rating. */
  ratedW: 100,
  /** Confirmed: the IC-7300 runs from a nominal 13.8 V supply. */
  supplyV: 13.8,
  /**
   * Representative, NOT confirmed. The data sheet's 55/60 % drain efficiency is
   * measured at 175 MHz; Icom publishes no HF figure. This constant also has to
   * carry the roughly 0.2 dB of low-pass filter, relay and connector loss that
   * chain.ts folds in, so it is DC into the finals to RF at the antenna socket
   * rather than a device figure.
   *
   * 0.60 gave 12.1 A at rated output, against Icom's published 21 A maximum for
   * the whole radio and the 16.6 A measured in an independent test. 0.50 puts
   * the finals near 14.5 A, which reconciles with those once the driver chain
   * and housekeeping are allowed for.
   */
  peakEfficiency: 0.5,
  /**
   * Representative. Icom publishes no foldback curve. Real rigs hold full power
   * to roughly 1.5:1 and are heavily limited by 3:1, which is also where the
   * internal tuner's published range stops.
   */
  foldbackStartSwr: 1.5,
  foldbackFullSwr: 3,
  /**
   * Representative, derived from confirmed numbers. The data sheet's 150 W
   * The data sheet's 150 W channel dissipation is at a 25 degC case, which never
   * happens inside a radio. Working back from a 150 degC channel limit (25 degC
   * of margin under the 175 degC absolute maximum), Rth(ch-c) of 1.0 degC/W and
   * a 60 degC flange, each device can take (150-60)/1.0 = 90 W, so 180 W for the
   * pair.
   */
  maxDissipationW: 180,
  /** Confirmed: push-pull pair. */
  deviceCount: 2,
}

/**
 * Confirmed as the data sheet's efficiency test condition: IDQ 1.0 A per device.
 * While the PA is biased on but between syllables it draws this and makes no RF,
 * so all of it becomes heat.
 */
const IDQ_A_PER_DEVICE = 1.0

/** Power taken by the bias with no drive, W. */
const QUIESCENT_W = PA.supplyV * IDQ_A_PER_DEVICE * PA.deviceCount

/**
 * Output at foldbackFullSwr, as a fraction of rated, before the 1/SWR tail takes
 * over. Representative: Icom publishes no curve, but bench measurements of rigs
 * in this class typically show close to full power at 2:1 and roughly half power
 * at 3:1, which is where this lands. Deliberately not harsher than that — a
 * model that cut to a quarter at 3:1 would make the protection circuit, rather
 * than the feedline, the explanation for every result in the application.
 */
const SWR_FOLDBACK_FLOOR = 0.5

/** Never fold back to literally nothing on SWR alone; the operator needs a carrier to tune with. */
const MIN_SWR_FOLDBACK = 0.05

/**
 * Temperature thresholds for the protection circuit, degC, measured WHERE THE
 * RADIO MEASURES: on the PA board, not on the die.
 *
 * The service manual lists an NTC thermistor on the PA unit — a surface-mount
 * part near the devices, not a sensor inside them. That distinction decides the
 * whole character of the protection. The die responds in a fraction of a second
 * and runs 60 degC above the metal; the board responds in minutes. A model that
 * folds power back on the junction temperature trips almost immediately and
 * reports a radio in trouble a minute into a digital transmission, which is not
 * what these radios do: the one published instrumented test found the gauge
 * still in its normal range after several minutes of key-down at full power.
 *
 * Icom publish the mechanism and not the numbers — the manual describes two
 * steps, "power down transmission" showing LMT and then "TX inhibit", and the
 * TEMP gauge is unmarked except for a red zone. These three are therefore
 * representative, chosen so a healthy radio at continuous full output never
 * reaches them and a blocked fan does.
 */
const TEMP_WATCH = 65
const TEMP_LIMIT = 80
const TEMP_SHUTDOWN = 100

/**
 * Drain current thresholds for the pair, A. Representative: the RD70HVF1 is
 * rated 20 A each, but the radio's supply, fuse and DC wiring give up long
 * before two devices do — Icom specifies 21 A maximum for the whole radio.
 */
// Icom publishes 21 A maximum for the whole radio. With the finals drawing
// about 14.5 A at rated output these leave normal operation clear of the watch
// point, so the interface does not report a healthy radio as being in trouble.
const CURRENT_WATCH = 18
const CURRENT_LIMIT = 22
const CURRENT_SHUTDOWN = 30

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v)
const finite = (v: number, fallback: number): number => (Number.isFinite(v) ? v : fallback)
const round1 = (v: number): string => (Number.isFinite(v) ? (Math.round(v * 10) / 10).toFixed(1) : '--')
const round0 = (v: number): string => (Number.isFinite(v) ? Math.round(v).toFixed(0) : '--')

// ─── Mismatch stress ─────────────────────────────────────────────────────────

/**
 * Peak drain voltage and current relative to their values into a perfect load.
 *
 * At the load plane the forward and reflected waves add for voltage and subtract
 * for current, so V ∝ |1 + Gamma| and I ∝ |1 - Gamma|. Both are exactly 1 when
 * Gamma is zero. Because |1 + Gamma|^2 + |1 - Gamma|^2 = 2 + 2|Gamma|^2, the
 * larger of the two is always at least 1: a mismatch always costs headroom
 * somewhere, and the phase decides where.
 *
 * Gamma = +0.5 (3:1, load 150 ohms, real) gives 1.5 and 0.5 -- an overvoltage
 * mismatch. Gamma = -0.5 (3:1, load 16.7 ohms) gives 0.5 and 1.5 -- an
 * overcurrent mismatch. Same SWR meter reading, different failure.
 */
export const stressFromMismatch = (gamma: Complex): { voltageStress: number; currentStress: number } => {
  const re0 = finite(gamma.re, 0)
  const im0 = finite(gamma.im, 0)
  const mag = Math.hypot(re0, im0)
  // |Gamma| > 1 is not physical for a passive load; clamp so the stresses stay
  // bounded instead of producing nonsense for a numerically ugly input.
  const k = mag > 0.999 ? 0.999 / mag : 1
  const re = re0 * k
  const im = im0 * k
  return {
    voltageStress: Math.hypot(1 + re, im),
    currentStress: Math.hypot(1 - re, im),
  }
}

// ─── Protection ──────────────────────────────────────────────────────────────

interface ProtectionCore {
  readonly swr: number
  readonly paTempC: number
  readonly supplyCurrentA: number
  readonly swrFold: number
  readonly tempFold: number
  readonly currentFold: number
  readonly foldback: number
  readonly level: ProtectionLevel
  readonly swrTriggered: boolean
  readonly tempTriggered: boolean
  readonly currentTriggered: boolean
}

const protectionCore = (args: { swr: number; paTempC: number; supplyCurrentA: number }): ProtectionCore => {
  const swr = Math.max(1, finite(args.swr, 1))
  const tempC = finite(args.paTempC, 25)
  const currentA = Math.max(0, finite(args.supplyCurrentA, 0))

  // SWR. Full power to foldbackStartSwr, then a straight taper to the floor at
  // foldbackFullSwr, then a 1/SWR tail so that a dead short still leaves a
  // usable trickle to tune with rather than a hard cut-off.
  let swrFold = 1
  if (swr > PA.foldbackStartSwr) {
    if (swr <= PA.foldbackFullSwr) {
      const t = (swr - PA.foldbackStartSwr) / (PA.foldbackFullSwr - PA.foldbackStartSwr)
      swrFold = 1 - t * (1 - SWR_FOLDBACK_FLOOR)
    } else {
      swrFold = SWR_FOLDBACK_FLOOR * (PA.foldbackFullSwr / swr)
    }
    swrFold = clamp(swrFold, MIN_SWR_FOLDBACK, 1)
  }

  // Temperature. Nothing happens until the recommended channel limit, then a
  // straight taper to zero at the absolute maximum.
  const tempFold = clamp((TEMP_SHUTDOWN - tempC) / (TEMP_SHUTDOWN - TEMP_LIMIT), 0, 1)

  // Current. Same shape.
  const currentFold = clamp((CURRENT_SHUTDOWN - currentA) / (CURRENT_SHUTDOWN - CURRENT_LIMIT), 0, 1)

  const foldback = Math.min(swrFold, tempFold, currentFold)

  const swrTriggered = swr > PA.foldbackStartSwr
  const tempTriggered = tempC > TEMP_WATCH
  const currentTriggered = currentA > CURRENT_WATCH

  const level: ProtectionLevel =
    foldback <= 0
      ? 'shutdown'
      : foldback <= 0.35
        ? 'limit'
        : foldback < 0.995
          ? 'foldback'
          : swrTriggered || tempTriggered || currentTriggered
            ? 'watch'
            : 'normal'

  return {
    swr,
    paTempC: tempC,
    supplyCurrentA: currentA,
    swrFold,
    tempFold,
    currentFold,
    foldback,
    level,
    swrTriggered,
    tempTriggered,
    currentTriggered,
  }
}

/**
 * Reasons, written for a person, most important first.
 *
 * deliveredW is null when the caller does not know the wattage: protectionFor
 * is handed only SWR, temperature and current, so it says what fraction of the
 * setting survives. solvePa knows the watts and says those instead.
 */
const protectionReasons = (core: ProtectionCore, deliveredW: number | null): string[] => {
  const reasons: string[] = []
  const action =
    deliveredW === null
      ? `Power reduced to ${round0(core.foldback * 100)}% of the setting`
      : `Power reduced to ${round0(deliveredW)} W`

  // The dominant cause is whichever limiter is pulling hardest.
  const swrCause = {
    fold: core.swrFold,
    triggered: core.swrTriggered,
    cause: `SWR ${round1(core.swr)}:1 at the antenna socket`,
    watch: `SWR is ${round1(core.swr)}:1 at the antenna socket. Full power is still available.`,
  }
  const tempCause = {
    fold: core.tempFold,
    triggered: core.tempTriggered,
    cause: `finals at ${round0(core.paTempC)} degC`,
    watch: `The finals are at ${round0(core.paTempC)} degC. Keep transmissions short.`,
  }
  const currentCause = {
    fold: core.currentFold,
    triggered: core.currentTriggered,
    cause: `${round1(core.supplyCurrentA)} A of drain current`,
    watch: `The finals are drawing ${round1(core.supplyCurrentA)} A. Full power is still available.`,
  }
  const sorted = [swrCause, tempCause, currentCause].sort((a, b) => a.fold - b.fold)
  const worst = sorted[0]
  const folding = core.foldback < 0.995

  if (core.level === 'shutdown') {
    if (core.tempFold <= 0) {
      reasons.push(
        `Transmit stopped: the finals reached ${round0(core.paTempC)} degC, the ${TEMP_SHUTDOWN} degC limit for these devices. Let the radio cool before transmitting again.`,
      )
    } else if (core.currentFold <= 0) {
      reasons.push(
        `Transmit stopped: the finals drew ${round1(core.supplyCurrentA)} A. Check the antenna before transmitting again.`,
      )
    } else {
      reasons.push('Transmit stopped by the protection circuit. Check the antenna and the feedline.')
    }
  } else if (worst !== undefined && folding) {
    reasons.push(`${action}: ${worst.cause}.`)
  }

  // Anything else that is contributing, then anything merely worth watching.
  for (const c of sorted) {
    if (c === worst && folding) continue
    if (c.fold < 0.995) reasons.push(`Also reducing power: ${c.cause}.`)
    else if (c.triggered) reasons.push(c.watch)
  }

  if ((core.level === 'foldback' || core.level === 'limit') && core.swrFold < 0.995) {
    reasons.push(
      'The reflected power is not what heats the finals. The mismatch moves the stage off its load line, and the radio pulls the drive back to keep the peak drain voltage inside its rating.',
    )
  }

  return reasons.filter((r) => r.length > 0)
}

/**
 * What the protection circuit does at this operating point.
 *
 * paTempC is the channel (junction) temperature of the final devices, not the
 * heatsink: the heatsink is minutes behind and would let a key-down carrier
 * destroy the silicon before the reading moved.
 */
export const protectionFor = (args: {
  swr: number
  paTempC: number
  supplyCurrentA: number
}): ProtectionState => {
  const core = protectionCore(args)
  return {
    level: core.level,
    foldback: core.foldback,
    reasons: protectionReasons(core, null),
    swrTriggered: core.swrTriggered,
    tempTriggered: core.tempTriggered,
    currentTriggered: core.currentTriggered,
  }
}

// ─── Operating point ─────────────────────────────────────────────────────────

interface OperatingPoint {
  readonly forwardW: number
  readonly dcInputW: number
  readonly dissipationW: number
  readonly efficiency: number
  readonly supplyCurrentA: number
}

/**
 * Work out the DC input and the heat for a stage making peakW while keyed, for a
 * fraction `duty` of the time.
 *
 * Efficiency falls as the drive comes down. In a class AB stage the drain swing
 * is proportional to the square root of the output power while the bias current
 * stays put, so drain efficiency follows sqrt(Pout/Prated): 60 % at 100 W, but
 * only about 19 % at 10 W. This is why a rig set to low power still gets warm.
 *
 * The mismatch term divides that by the CURRENT stress, and only by the current
 * stress. This asymmetry is real and it matters. A load that transforms high
 * (voltage stress up, current stress down) leaves the stage running at low
 * current into a high resistance: it runs out of drain voltage headroom and
 * clips, but it stays efficient, and what kills it is a single RF peak above
 * VDSS. A load that transforms low (current stress up) makes the stage push more
 * current through less voltage swing, which is the definition of poor
 * efficiency, and it cooks. Same SWR, one destroys, the other bakes.
 * Representative first-order model; the asymmetry is the part that is physics.
 *
 * Everything returned is a time average over the on/off duty, which keeps the
 * energy books exact: dcInput = forward + dissipation, term by term.
 */
const operatingPoint = (peakW: number, duty: number, currentStress: number): OperatingPoint => {
  const onW = Math.max(0, peakW)
  const d = clamp(duty, 0, 1)

  const driveFraction = clamp(onW / PA.ratedW, 0, 1)
  const etaIdeal = PA.peakEfficiency * Math.sqrt(driveFraction)
  const etaLoad = etaIdeal / Math.max(1, currentStress)

  // At very small drive the bias current, not the RF, sets the DC input.
  const dcOn = onW > 0 && etaLoad > 0 ? Math.max(onW / etaLoad, QUIESCENT_W) : QUIESCENT_W
  const dissOn = dcOn - onW

  const forwardW = d * onW
  const dcInputW = d * dcOn + (1 - d) * QUIESCENT_W
  const dissipationW = d * dissOn + (1 - d) * QUIESCENT_W

  return {
    forwardW,
    dcInputW,
    dissipationW,
    efficiency: dcOn > 0 ? onW / dcOn : 0,
    supplyCurrentA: dcInputW / PA.supplyV,
  }
}

/**
 * Solve the final amplifier for one instant.
 *
 * `envelope` is the instantaneous speech amplitude, 0..1; power goes as its
 * square. `duty` is the fraction of the time the stage is actually producing RF
 * rather than sitting on its bias between syllables. `damage` derates the pair:
 * a device that has been cooked cannot make its rated power any more.
 *
 * The protection loop is evaluated against the current the stage WOULD draw,
 * not the reduced current after foldback. A real automatic power control loop is
 * an integrator that settles where the demand meets the limit; evaluating the
 * limit against the already-reduced current would make the model hunt.
 */
export const solvePa = (args: {
  requestedW: number
  gamma: Complex
  envelope: number
  duty: number
  paTempC: number
  damage: number
}): PaResult => {
  const requestedW = clamp(finite(args.requestedW, 0), 0, PA.ratedW)
  const envelope = clamp(finite(args.envelope, 0), 0, 1)
  const duty = clamp(finite(args.duty, 1), 0, 1)
  const damage = clamp(finite(args.damage, 0), 0, 1)
  const paTempC = finite(args.paTempC, 25)

  const stress = stressFromMismatch(args.gamma)
  const gammaMag = clamp(finite(cAbs(args.gamma), 0), 0, 0.999)
  const swr = swrFromGamma(gammaMag)

  // Power the stage is being asked for right now, before any protection acts.
  const demandW = requestedW * envelope * envelope * (1 - damage)

  if (demandW <= 0) {
    const core = protectionCore({ swr, paTempC, supplyCurrentA: 0 })
    return {
      requestedW,
      forwardW: 0,
      reflectedW: 0,
      netW: 0,
      dcInputW: 0,
      supplyCurrentA: 0,
      paDissipationW: 0,
      efficiency: 0,
      voltageStress: stress.voltageStress,
      currentStress: stress.currentStress,
      protection: {
        level: core.level,
        foldback: core.foldback,
        reasons: protectionReasons(core, null),
        swrTriggered: core.swrTriggered,
        tempTriggered: core.tempTriggered,
        currentTriggered: core.currentTriggered,
      },
    }
  }

  const demand = operatingPoint(demandW, duty, stress.currentStress)
  const core = protectionCore({ swr, paTempC, supplyCurrentA: demand.supplyCurrentA })
  const op = operatingPoint(demandW * core.foldback, duty, stress.currentStress)

  // The reflected power is reported because the meter shows it and because it
  // sets the standing wave on the line. It is deliberately NOT added to
  // paDissipationW: see the note at the top of this file. The heat is already
  // accounted for through the efficiency term.
  const reflectedW = op.forwardW * gammaMag * gammaMag

  return {
    requestedW,
    forwardW: op.forwardW,
    reflectedW,
    netW: op.forwardW - reflectedW,
    dcInputW: op.dcInputW,
    supplyCurrentA: op.supplyCurrentA,
    paDissipationW: op.dissipationW,
    efficiency: op.efficiency,
    voltageStress: stress.voltageStress,
    currentStress: stress.currentStress,
    protection: {
      level: core.level,
      foldback: core.foldback,
      reasons: protectionReasons(core, op.forwardW),
      swrTriggered: core.swrTriggered,
      tempTriggered: core.tempTriggered,
      currentTriggered: core.currentTriggered,
    },
  }
}
