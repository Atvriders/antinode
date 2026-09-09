/**
 * Antinode — RF core type contract.
 *
 * UNITS (non-negotiable, used everywhere):
 *   frequency  Hz          power       W (average, unless named ...Pep)
 *   impedance  ohms        length      metres
 *   time       seconds     temperature degrees Celsius
 *   loss/gain  dB          angle       radians
 *
 * Everything in src/rf is PURE: no DOM, no three.js, no React, no randomness,
 * no Date.now(). Given the same inputs it must return the same outputs. This
 * package is the specification; the 3D layer only draws what it returns.
 */

/** Rectangular complex number. */
export interface Complex {
  readonly re: number
  readonly im: number
}

// ─── Bands, modes, cables ────────────────────────────────────────────────────

export type BandId =
  | '160m' | '80m' | '60m' | '40m' | '30m' | '20m'
  | '17m' | '15m' | '12m' | '10m' | '6m'

export interface BandDef {
  readonly id: BandId
  readonly label: string
  /** Amateur allocation edges in Hz (IARU Region 2 / FCC general-coverage view). */
  readonly startHz: number
  readonly endHz: number
  /** Sensible default dial frequency for the band, Hz. */
  readonly defaultHz: number
  /** Conventional sideband for voice on this band. */
  readonly voiceMode: Mode
}

export type Mode = 'LSB' | 'USB' | 'CW' | 'AM' | 'FM' | 'RTTY' | 'DATA'

export interface ModeDef {
  readonly id: Mode
  readonly label: string
  /** Average-to-PEP ratio used for heating: 1.0 = key-down carrier. */
  readonly dutyCycle: number
  /** Occupied bandwidth, Hz. */
  readonly bandwidthHz: number
  /** True when the envelope is constant (FM, RTTY) rather than speech-shaped. */
  readonly constantEnvelope: boolean
  readonly note: string
}

export type CableId = 'rg58' | 'rg8x' | 'rg213' | 'lmr400' | 'ladder450'

export interface CableDef {
  readonly id: CableId
  readonly name: string
  /** Characteristic impedance, ohms (real part; we treat Z0 as real). */
  readonly z0: number
  /** Velocity factor, 0..1. */
  readonly vf: number
  /**
   * Matched loss curve fit: lossDbPer100ft(f) = k1*sqrt(fMHz) + k2*fMHz.
   * k1 models conductor (skin-effect) loss, k2 models dielectric loss.
   */
  readonly k1: number
  readonly k2: number
  /** Approximate maximum power at 30 MHz, W, for the "cable stress" readout. */
  readonly powerRatingW: number
  readonly note: string
}

// ─── Antennas ────────────────────────────────────────────────────────────────

export type AntennaId =
  | 'dummy-load'
  | 'dipole-40'
  | 'dipole-20'
  | 'fan-dipole'
  | 'efhw-40'
  | 'g5rv'
  | 'ocf-windom'
  | 'vertical-quarter-40'
  | 'vertical-multiband'
  | 'random-wire-9to1'
  | 'mag-loop'
  | 'mobile-whip-20'
  | 'screwdriver-mobile'
  | 'yagi-3el-20'

export type AntennaFamily = 'reference' | 'wire' | 'vertical' | 'loop' | 'mobile' | 'beam'

/** A continuously adjustable physical property of an antenna. */
export interface AntennaParam {
  readonly key: string
  readonly label: string
  readonly unit: string
  readonly min: number
  readonly max: number
  readonly step: number
  readonly default: number
  /** Short explanation of what turning this actually changes. */
  readonly help: string
}

export interface AntennaDef {
  readonly id: AntennaId
  readonly name: string
  /** <= 28 chars, used on the panel selector. */
  readonly short: string
  readonly family: AntennaFamily
  /** True when the antenna itself can be retuned (screwdriver coil, loop cap). */
  readonly selfTunable: boolean
  /** True when it needs a matching device to be usable across bands. */
  readonly needsTuner: boolean
  readonly params: readonly AntennaParam[]
  /** Bands where this antenna is genuinely usable without a tuner. */
  readonly nativeBands: readonly BandId[]
  /** Feedpoint height above ground for the 3D scene, metres. */
  readonly heightM: number
  /** Physical span for the 3D scene, metres (wire length, radiator height, boom). */
  readonly spanM: number
  /** One line, plain English, what it is. */
  readonly summary: string
  /** Two to four sentences for the Handbook card. */
  readonly detail: string
  /** Honest statement of what this simulation does and does not model. */
  readonly fidelityNote: string
}

/** Feedpoint impedance model. Pure function of frequency and the user's params. */
export type AntennaImpedanceFn = (
  freqHz: number,
  params: Readonly<Record<string, number>>,
) => Complex

// ─── Matching / tuner ────────────────────────────────────────────────────────

export type TunerMode = 'bypass' | 'internal' | 'external-radio' | 'external-antenna'

export interface TunerDef {
  readonly id: TunerMode
  readonly name: string
  /** Lowest and highest purely-resistive load it can bring to 50 ohms. */
  readonly rMinOhm: number
  readonly rMaxOhm: number
  /** Highest SWR it will attempt to match. */
  readonly maxSwr: number
  /** Fixed insertion loss when engaged and matched, dB. */
  readonly baseLossDb: number
  /** Extra loss per unit of network Q, dB. */
  readonly lossPerQDb: number
  readonly minFreqHz: number
  readonly maxFreqHz: number
  readonly note: string
}

export type TunerTopology = 'lowpass-l-shunt-in' | 'lowpass-l-shunt-out' | 't-network' | 'none'

/** The solved state of a matching network. */
export interface TunerSolution {
  readonly engaged: boolean
  readonly matched: boolean
  readonly topology: TunerTopology
  /** Series inductance, henries. 0 when unused. */
  readonly seriesL: number
  /** Shunt capacitance, farads. 0 when unused. */
  readonly shuntC: number
  /** Second reactive element for the T network, farads. */
  readonly shuntC2: number
  /** Loaded Q of the network. */
  readonly q: number
  readonly lossDb: number
  /** Impedance presented to the radio after matching. */
  readonly presentedZ: Complex
  /** Why a match failed, empty when matched. */
  readonly failureReason: string
}

// ─── Transmission line ───────────────────────────────────────────────────────

export interface LineResult {
  /** Impedance seen at the input (radio) end of the line. */
  readonly zIn: Complex
  /** Loss of the line if it were perfectly matched, dB. */
  readonly matchedLossDb: number
  /** Actual loss including the extra loss caused by standing waves, dB. */
  readonly totalLossDb: number
  /** totalLossDb - matchedLossDb, dB. This is the number that surprises people. */
  readonly excessLossDb: number
  /** Electrical length in wavelengths. */
  readonly lengthWaves: number
  /** Nepers per metre. */
  readonly alpha: number
  /** Radians per metre. */
  readonly beta: number
}

/** Sampled |V| and |I| envelopes along the feedline, for the 3D standing wave. */
export interface StandingWaveProfile {
  /** Normalised positions, 0 at the antenna, 1 at the radio. */
  readonly positions: Float32Array
  /** |V| normalised so the maximum anywhere on the line is 1. */
  readonly vMag: Float32Array
  /** |I| normalised the same way. */
  readonly iMag: Float32Array
  /** Phase of the forward wave at each position, radians, for animation. */
  readonly phase: Float32Array
  /** Voltage maxima positions in normalised units. */
  readonly antinodes: readonly number[]
  /** Voltage minima positions in normalised units. */
  readonly nodes: readonly number[]
  /** Peak RF voltage on the line, volts. */
  readonly vPeakVolts: number
  /** Peak RF current on the line, amps. */
  readonly iPeakAmps: number
}

// ─── Match figures ───────────────────────────────────────────────────────────

export interface MatchFigures {
  readonly gamma: Complex
  readonly gammaMag: number
  readonly swr: number
  readonly returnLossDb: number
  readonly mismatchLossDb: number
  readonly reflectedFraction: number
}

// ─── PA, protection, thermal ─────────────────────────────────────────────────

export type ProtectionLevel = 'normal' | 'watch' | 'foldback' | 'limit' | 'shutdown'

export interface ProtectionState {
  readonly level: ProtectionLevel
  /** Multiplier applied to requested power, 0..1. */
  readonly foldback: number
  /** Human-readable reasons, most important first. */
  readonly reasons: readonly string[]
  readonly swrTriggered: boolean
  readonly tempTriggered: boolean
  readonly currentTriggered: boolean
}

export interface PaResult {
  /** Power the radio would produce into a perfect 50 ohm load, W. */
  readonly requestedW: number
  /** Power actually leaving the PA after foldback, W. */
  readonly forwardW: number
  readonly reflectedW: number
  /** forwardW - reflectedW. */
  readonly netW: number
  /** DC input power drawn from the 13.8 V supply, W. */
  readonly dcInputW: number
  readonly supplyCurrentA: number
  /** Heat dissipated in the final devices, W. */
  readonly paDissipationW: number
  /** Drain efficiency at this operating point, 0..1. */
  readonly efficiency: number
  /** Peak drain voltage stress relative to nominal, 1.0 = matched load. */
  readonly voltageStress: number
  /** Peak drain current stress relative to nominal. */
  readonly currentStress: number
  readonly protection: ProtectionState
}

/** One thermal node in the simplified RC network. */
export interface ThermalNodeDef {
  readonly id: string
  readonly label: string
  /** Thermal capacitance, J/degC. */
  readonly capacityJPerK: number
  /** Thermal resistance to the next node toward ambient, degC/W. */
  readonly resistanceKPerW: number
  /** Node this one conducts into; null means ambient air. */
  readonly parent: string | null
  readonly warnC: number
  readonly criticalC: number
  /** Temperature at which permanent damage starts to accumulate. */
  readonly damageC: number
}

export interface ThermalState {
  /** Node id -> temperature in degC. */
  readonly temps: Readonly<Record<string, number>>
  /** Node id -> accumulated damage, 0 (perfect) .. 1 (failed). */
  readonly damage: Readonly<Record<string, number>>
  readonly ambientC: number
  /** Fan duty 0..1. */
  readonly fan: number
}

// ─── Component stress map ────────────────────────────────────────────────────

export type StressKind =
  | 'junction-temperature'
  | 'peak-voltage'
  | 'peak-current'
  | 'circulating-current'
  | 'relay-arcing'
  | 'core-saturation'
  | 'dielectric-heating'
  | 'connector-heating'

export interface ComponentStress {
  readonly componentId: string
  readonly kind: StressKind
  /** 0 = comfortable, 1 = at the manufacturer limit, >1 = beyond it. */
  readonly severity: number
  /** The measured quantity behind the severity, formatted with units. */
  readonly measured: string
  readonly limit: string
  /** What breaks, in one sentence. */
  readonly failureMode: string
  /** Order of magnitude of how long it takes at this severity. */
  readonly timescale: 'instant' | 'seconds' | 'minutes' | 'hours' | 'cumulative'
}

// ─── Signal chain ────────────────────────────────────────────────────────────

export type StageId =
  | 'voice' | 'mic-element' | 'mic-preamp' | 'af-adc' | 'dsp-tx' | 'tx-dac'
  | 'tx-mixer' | 'bpf' | 'predriver' | 'driver' | 'final-pa' | 'lpf-bank'
  | 'swr-bridge' | 'atu' | 'ant-relay' | 'so239' | 'feedline' | 'antenna' | 'space'

export type SignalDomain = 'acoustic' | 'audio' | 'digital' | 'rf-low' | 'rf-high' | 'radiated'

export interface StageDef {
  readonly id: StageId
  readonly index: number
  readonly label: string
  /** Real part designation where publicly documented, else ''. */
  readonly part: string
  readonly domain: SignalDomain
  /** One sentence, plain English, what this stage does. */
  readonly purpose: string
  /** What the signal physically is here, e.g. "0.5 mV audio on a 2-wire line". */
  readonly representation: string
  /** The thing beginners get wrong about this stage. */
  readonly misconception: string
  /** 'confirmed' = backed by a published source; 'representative' = plausible model. */
  readonly fidelity: 'confirmed' | 'representative'
  /** Physical component ids highlighted when this stage is selected. */
  readonly components: readonly string[]
}

/** Live per-stage state produced by evaluating the chain. */
export interface StageState {
  readonly id: StageId
  /** Normalised activity 0..1 used for glow and flow speed. */
  readonly activity: number
  /** Human-formatted primary level, e.g. "12 mVpp" or "98 W PEP". */
  readonly level: string
  /** Numeric level in the stage's natural unit, for plots. */
  readonly value: number
  readonly unit: string
  /** 0 = healthy, 1 = destroyed. */
  readonly stress: number
  readonly tempC: number | null
  /** Non-empty when this stage is being harmed right now. */
  readonly alarm: string
}

// ─── Top-level station model ─────────────────────────────────────────────────

export interface StationConfig {
  readonly freqHz: number
  readonly mode: Mode
  /** Front-panel RF POWER setting, W (0..100). */
  readonly powerSetW: number
  /** MIC GAIN, 0..100. */
  readonly micGain: number
  /** COMP level, 0 = off, 1..10. */
  readonly compression: number
  readonly antennaId: AntennaId
  readonly antennaParams: Readonly<Record<string, number>>
  readonly cableId: CableId
  readonly cableLengthM: number
  readonly tunerMode: TunerMode
  /**
   * True only once the tuner has actually found a match at this frequency.
   *
   * Selecting a tuner puts it in circuit; it does not tune it. A real ATU
   * searches when you press TUNE, takes a second or two about it, and loses the
   * match when you move far enough. Modelling that matters, because "I selected
   * the tuner and the SWR went to 1:1 by itself" is not what happens and is not
   * what the reader should learn.
   */
  readonly tunerEngaged: boolean
  readonly keyed: boolean
  /** Instantaneous speech envelope 0..1; 1.0 for constant-envelope modes. */
  readonly envelope: number
  readonly ambientC: number
  /** Set true to let damage accumulate; false clamps at "warned". */
  readonly allowDamage: boolean
}

/** The complete steady-state solution for one instant. */
export interface StationSolution {
  readonly config: StationConfig
  readonly antennaZ: Complex
  readonly antennaMatch: MatchFigures
  /** Impedance at the radio end of the coax, before any tuner. */
  readonly lineInputZ: Complex
  readonly lineMatch: MatchFigures
  readonly line: LineResult
  readonly tuner: TunerSolution
  /** What the radio's SWR bridge actually sees. */
  readonly radioLoadZ: Complex
  readonly radioMatch: MatchFigures
  readonly pa: PaResult
  /** Power crossing the antenna feedpoint, W. */
  readonly radiatedW: number
  /** Power turned into heat in the coax, W. */
  readonly cableLossW: number
  /** Power turned into heat in the tuner, W. */
  readonly tunerLossW: number
  /**
   * Current drawn from the 13.8 V supply by the WHOLE radio: the finals, the
   * driver chain ahead of them, and the display, receiver and fan that run
   * whatever the transmitter is doing.
   *
   * pa.supplyCurrentA is the finals alone. The number on a station ammeter, and
   * the one Icom publishes a maximum for, is this one.
   */
  readonly radioSupplyCurrentA: number
  /** Temperature the radio's own TEMP sensor reads, degC. See the note in chain.ts. */
  readonly sensorTempC: number
  readonly standingWave: StandingWaveProfile
  readonly stages: readonly StageState[]
  readonly stresses: readonly ComponentStress[]
  readonly warnings: readonly string[]
}
