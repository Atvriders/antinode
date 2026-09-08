/**
 * Antinode — the RF core.
 *
 * This package is the specification for the whole application. Everything in it
 * is pure: no DOM, no three.js, no React, no randomness, no clock. Given the
 * same station configuration it returns the same solution, every time, which is
 * what makes the 3D scene, the meters and the Handbook cards agree with each
 * other rather than each telling its own story.
 *
 * The entry point is `solveStation`. Everything else here is either a piece it
 * is built from or a table it reads.
 */

// Types. Every unit in this package is SI-adjacent and named in src/rf/types.ts:
// Hz, W, ohms, metres, seconds, degrees Celsius, dB, radians.
export type * from './types'

// Complex arithmetic. Transmission lines are complex-valued or they are wrong.
export {
  C, cAbs, cAdd, cArg, cDiv, cExp, cInv, cIsFinite, cMul, cNeg, cScale, cSqrt,
  cSub, cTanh,
} from './complex'

// Reflection, SWR and the figures derived from them.
export {
  gammaFromSwr, matchFigures, mismatchLossDb, powerSplit, reflectionCoefficient,
  returnLossDb, swrFromGamma, swrFromZ,
} from './match'

// Coaxial and open-wire feedline properties.
export {
  alphaNepersPerM, betaRadPerM, CABLE_LIST, CABLES, matchedLossDb,
  matchedLossDbPer100ft, wavelengthM,
} from './cables'

// The lossy transmission line, and the standing wave it carries.
export { excessLossDb, lineInputImpedance, solveLine, standingWaveProfile } from './line'

// Antenna feedpoint models.
export {
  ANTENNA_LIST, ANTENNAS, antennaImpedance, antennaSwrSweep, defaultParams,
  resonantFrequencies,
} from './antennas'

// Matching networks.
export { solveLNetwork, solveTuner, tunerLossDb, TUNERS } from './tuner'

// The power amplifier and its self-preservation.
export { PA, protectionFor, solvePa, stressFromMismatch } from './pa'

// The thermal network the PA heats.
export {
  damageRate, fanDutyFor, initialThermalState, stepThermal, THERMAL_NODES,
} from './thermal'

// Modes, speech, compression and the display buffers.
export {
  alcReading, applyCompression, audioWaveform, MODE_LIST, MODES, rfEnvelope,
  speechEnvelope, txAudioSpectrum,
} from './audio'

// Band plan.
export { bandForFreq, BANDS, clampToRadioRange, inHamBand, RX_RANGE_HZ } from './bands'

// The single entry point: microphone to space, in one call.
export { componentStresses, heatSources, solveStation, stageStates } from './chain'
