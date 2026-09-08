# Antinode — locked interface contract

Every agent writes only the files listed under its own module. Do not edit another
module's files. Do not change any signature in this document. If a signature is
genuinely wrong, stop and report it rather than changing it silently.

Types live in three files and are **already written**. Import from them, never redefine:

- `src/rf/types.ts` — RF, station, stage, thermal, protection types
- `src/content/types.ts` — teaching content types
- `src/sim/types.ts` — store and simulation types

## Global rules

1. **Units**: Hz, W, ohms, metres, seconds, °C, dB, radians. No exceptions, no feet, no MHz.
2. `src/rf/**` is pure: no DOM, no `three`, no React, no `Math.random`, no `Date.now`.
   Same inputs → same outputs, always. It is the specification; the 3D layer only draws it.
3. Every exported function in `src/rf/**` has unit tests in `tests/<module>.test.ts`.
4. Anything not backed by a published source is labelled `fidelity: 'representative'`
   and says so in the UI. Never invent a part number.
5. TypeScript strict, `noUncheckedIndexedAccess` on. No `any`, no `@ts-ignore`.
6. Numbers shown to the user are formatted by `src/ui/format.ts`, never inline.
7. All copy is written in the product voice: plain verbs, sentence case, active,
   no exclamation marks, no marketing. Errors say what happened and what to do.

## Module ownership and exact exports

### A. `src/rf/complex.ts`
```ts
export const C: (re: number, im?: number) => Complex
export const cAdd: (a: Complex, b: Complex) => Complex
export const cSub: (a: Complex, b: Complex) => Complex
export const cMul: (a: Complex, b: Complex) => Complex
export const cDiv: (a: Complex, b: Complex) => Complex
export const cAbs: (a: Complex) => number
export const cArg: (a: Complex) => number
export const cNeg: (a: Complex) => Complex
export const cScale: (a: Complex, k: number) => Complex
export const cInv: (a: Complex) => Complex
export const cExp: (a: Complex) => Complex
export const cTanh: (a: Complex) => Complex
export const cSqrt: (a: Complex) => Complex
export const cIsFinite: (a: Complex) => boolean
```

### B. `src/rf/match.ts`
```ts
export const reflectionCoefficient: (zL: Complex, z0?: number) => Complex   // z0 default 50
export const swrFromGamma: (gammaMag: number) => number                     // clamps at 999
export const matchFigures: (zL: Complex, z0?: number) => MatchFigures
export const swrFromZ: (zL: Complex, z0?: number) => number
export const returnLossDb: (gammaMag: number) => number
export const mismatchLossDb: (gammaMag: number) => number
export const gammaFromSwr: (swr: number) => number
export const powerSplit: (forwardW: number, gammaMag: number) => { reflectedW: number; netW: number }
```
`swr` must be `Infinity`-safe: return 999 rather than `Infinity` or `NaN`.

### C. `src/rf/cables.ts`
```ts
export const CABLES: Readonly<Record<CableId, CableDef>>
export const CABLE_LIST: readonly CableDef[]
export const matchedLossDbPer100ft: (cable: CableDef, freqHz: number) => number
export const matchedLossDb: (cable: CableDef, freqHz: number, lengthM: number) => number
export const alphaNepersPerM: (cable: CableDef, freqHz: number) => number
export const betaRadPerM: (cable: CableDef, freqHz: number) => number
export const wavelengthM: (freqHz: number, vf: number) => number
```

### D. `src/rf/line.ts`
```ts
export const lineInputImpedance: (zL: Complex, cable: CableDef, freqHz: number, lengthM: number) => Complex
export const solveLine: (zL: Complex, cable: CableDef, freqHz: number, lengthM: number) => LineResult
export const excessLossDb: (matchedLossDb: number, swrAtLoad: number) => number
export const standingWaveProfile: (args: {
  zL: Complex; cable: CableDef; freqHz: number; lengthM: number;
  forwardW: number; samples?: number;   // samples default 256
}) => StandingWaveProfile
```
`solveLine` uses the lossy form `Zin = Z0 (ZL + Z0 tanh γl) / (Z0 + ZL tanh γl)`.
`standingWaveProfile` positions run 0 at the antenna to 1 at the radio.

### E. `src/rf/antennas.ts`
```ts
export const ANTENNAS: Readonly<Record<AntennaId, AntennaDef>>
export const ANTENNA_LIST: readonly AntennaDef[]
export const antennaImpedance: (id: AntennaId, freqHz: number, params: Record<string, number>) => Complex
export const defaultParams: (id: AntennaId) => Record<string, number>
export const antennaSwrSweep: (id: AntennaId, params: Record<string, number>, f0: number, f1: number, n: number) => Float32Array
export const resonantFrequencies: (id: AntennaId, params: Record<string, number>, f0: number, f1: number) => readonly number[]
```
Models must produce believable curves: a 40 m dipole resonates near 7.1 MHz, is a
high impedance on 20 m, and is usable on 15 m. `dummy-load` returns exactly 50+j0.

### F. `src/rf/tuner.ts`
```ts
export const TUNERS: Readonly<Record<TunerMode, TunerDef>>
export const solveLNetwork: (zL: Complex, freqHz: number, z0?: number) =>
  { topology: TunerTopology; seriesL: number; shuntC: number; q: number } | null
export const solveTuner: (args: {
  mode: TunerMode; zL: Complex; freqHz: number; engaged: boolean;
}) => TunerSolution
export const tunerLossDb: (def: TunerDef, q: number) => number
```
A tuner that cannot match returns `matched: false`, `presentedZ` unchanged, and a
`failureReason` written for a human.

### G. `src/rf/pa.ts`
```ts
export const PA: {
  readonly ratedW: number; readonly supplyV: number; readonly peakEfficiency: number
  readonly foldbackStartSwr: number; readonly foldbackFullSwr: number
  readonly maxDissipationW: number; readonly deviceCount: number
}
export const solvePa: (args: {
  requestedW: number; gamma: Complex; envelope: number; duty: number;
  paTempC: number; damage: number;
}) => PaResult
export const protectionFor: (args: {
  swr: number; paTempC: number; supplyCurrentA: number;
}) => ProtectionState
export const stressFromMismatch: (gamma: Complex) => { voltageStress: number; currentStress: number }
```
`stressFromMismatch` must depend on the **phase** of Γ, not only its magnitude:
a mismatch that raises voltage is a different failure from one that raises current.

### H. `src/rf/thermal.ts`
```ts
export const THERMAL_NODES: readonly ThermalNodeDef[]
export const initialThermalState: (ambientC: number) => ThermalState
export const stepThermal: (state: ThermalState, powerIn: Record<string, number>, dt: number, allowDamage: boolean) => ThermalState
export const fanDutyFor: (heatsinkC: number) => number
export const damageRate: (tempC: number, node: ThermalNodeDef) => number
```
Integration must be stable for `dt` up to 0.25 s (sub-step internally if needed).

### I. `src/rf/audio.ts`
```ts
export const MODES: Readonly<Record<Mode, ModeDef>>
export const MODE_LIST: readonly ModeDef[]
export const speechEnvelope: (t: number) => number         // deterministic, 0..1
export const applyCompression: (env: number, comp: number) => number
export const alcReading: (env: number, micGain: number, comp: number) => number
export const txAudioSpectrum: (mode: Mode, bins: number) => Float32Array
export const rfEnvelope: (mode: Mode, t: number, envelope: number, samples: number) => Float32Array
export const audioWaveform: (t: number, gain: number, comp: number, samples: number) => Float32Array
```

### J. `src/rf/chain.ts`
```ts
export const solveStation: (config: StationConfig, thermal: ThermalState) => StationSolution
export const stageStates: (solution: Omit<StationSolution, 'stages' | 'stresses'>, thermal: ThermalState) => readonly StageState[]
export const componentStresses: (solution: Omit<StationSolution, 'stresses'>, thermal: ThermalState) => readonly ComponentStress[]
export const heatSources: (solution: StationSolution) => Record<string, number>
```
`solveStation` is the single entry point the UI calls. It must never throw and must
never return `NaN` in any numeric field, for any input in range.

### K. `src/rf/bands.ts`
```ts
export const BANDS: readonly BandDef[]
export const bandForFreq: (hz: number) => BandDef | null
export const clampToRadioRange: (hz: number) => number    // IC-7300 TX: 1.8–54 MHz
export const inHamBand: (hz: number) => boolean
```

### L. `src/content/*.ts`
- `stages.ts` → `export const STAGES: readonly StageDef[]`, `export const stageById: (id: StageId) => StageDef`
- `parts.ts` → `export const PARTS: readonly PartDef[]`, `export const partById: (id: string) => PartDef | undefined`, `export const PARTS_BY_ASSEMBLY: Record<string, readonly PartDef[]>`
- `views.ts` → `export const VIEWS: readonly ViewDef[]`
- `tour.ts` → `export const TOUR: readonly TourStep[]`
- `myths.ts` → `export const MYTHS: readonly MythCard[]`
- `presets.ts` → `export const PRESETS: readonly ScenarioPreset[]`
- `glossary.ts` → `export const GLOSSARY: readonly GlossaryEntry[]`

Part ids are **fixed** and referenced by the 3D layer and the stress map:
`mic-capsule, mic-preamp-ic, af-codec, fpga, tx-dac, pll, bpf-bank, predriver,
driver, final-q1, final-q2, pa-heatsink, cooling-fan, lpf-board, lpf-relay,
lpf-cap, swr-coupler, atu-board, atu-relay, atu-inductor, atu-cap, ant-relay,
so239, main-board, tft-panel, main-dial, speaker, chassis, dc-jack, coax,
coax-connector, balun, antenna-element`

### M. `src/sim/*`
- `store.ts` → `export const useStation: UseBoundStore<...>` — a single zustand store
  holding `SimState & UiState` and all of `StoreActions`.
- `engine.ts` → `export const stepSimulation: (prev: SimState, ui: UiState, dt: number) => SimState`
- `selectors.ts` → memoised selectors used by the UI.

### N. `src/three/*`
Every mesh is procedural. No downloaded models, textures, or fonts — the container
must work with no network. Exports:
- `scene/Stage.tsx` → `export function Stage(): JSX.Element` (canvas contents)
- `radio/Radio.tsx` → `export function Radio(props: { explode: number }): JSX.Element`
- `station/Station.tsx` → `export function Station(): JSX.Element`
- `fx/Feedline.tsx` → `export function Feedline(): JSX.Element`
- `materials.ts` → shared `MeshStandardMaterial` factories keyed by role
- `layout.ts` → `export const PART_TRANSFORMS: Record<string, { pos: Vec3; size: Vec3; explode: Vec3 }>`

### O. `src/ui/*`
- `tokens.css` — the only place colours and type scales are defined
- `App.tsx` — layout shell
- `panels/*.tsx`, `charts/*.tsx` — one component per file, CSS Modules alongside

## Design tokens (locked)

```
--panel:        #141A1C   anodised charcoal, the dominant surface
--panel-raise:  #1E2629   machined face
--panel-line:   #2C3639   engraved rule
--phosphor:     #5FD2E8   live signal, the "good" state
--phosphor-dim: #2E6E7C
--heat-1:       #F2B441   warm
--heat-2:       #E2622A   hot
--heat-3:       #C0202B   damage
--smith:        #C64FA8   impedance locus
--bone:         #E8E2D4   Handbook paper
--ink:          #232A2C   text on bone
--silk:         #A9B7BA   silkscreen legend text on panel
```

Type: `IBM Plex Sans Condensed` (panel legends, uppercase, 0.12em tracking),
`Chivo Mono` (every number, tabular), `Source Serif 4` (Handbook prose only).
Fonts load from Google Fonts with local fallbacks; the app must remain legible if
the font request fails.

## Quality floor

- Responsive to 380 px wide; the 3D canvas never causes horizontal page scroll.
- Visible keyboard focus on every control; the whole app is operable from the keyboard.
- `prefers-reduced-motion` respected: no ambient motion, transitions become instant.
- No console errors or React warnings at any time.
- 60 fps target on integrated graphics at 1920×1080; degrade quality, never block.

## Offline rules (verified, not theoretical)

The container must render with no network at all. Two traps were found by testing:

1. **`<Environment preset="...">` from drei fetches an HDRI from
   raw.githubusercontent.com.** Banned. Build the environment locally instead —
   `RoomEnvironment` from `three/examples/jsm/environments/RoomEnvironment.js`
   through a `PMREMGenerator`, or drei's `<Environment>` with `<Lightformer>`
   children, both of which are generated on the GPU.
2. **drei's `<Text>` loads Roboto from fonts.gstatic.com unless given a font.**
   Always pass `font="/fonts/plex-cond-600.ttf"`, which is committed in `public/`.
   troika cannot read woff2, so use the `.ttf`, not the `.woff2`.

Webfonts are self-hosted in `public/fonts` and declared in `src/ui/fonts.css`.
`index.html` must never link to fonts.googleapis.com. An end-to-end test asserts
that the running app makes zero requests to any external host.

## Required test hooks

The end-to-end suite drives the app through these. Every one is mandatory; put
`data-testid` on the element that a user would actually click.

| testid | element |
|---|---|
| `view-tab-<viewId>` | each view tab in the header |
| `viewport` | the element containing the WebGL canvas |
| `freq-display` | the frequency readout |
| `freq-group-<decade>` | each draggable digit group (`6`, `3`, `0`) |
| `band-<bandId>` | each band key |
| `mode-<mode>` | each mode key |
| `ptt` | the transmit key |
| `tune` | the tuner key |
| `power-set` | the RF power control |
| `antenna-<antennaId>` | each antenna choice |
| `antenna-param-<key>` | each antenna parameter control |
| `cable-<cableId>` | each cable choice |
| `cable-length` | the cable length control |
| `tuner-<tunerMode>` | each tuner placement choice |
| `readout-swr` | the SWR readout value |
| `readout-forward` | forward power |
| `readout-reflected` | reflected power |
| `readout-radiated` | radiated power |
| `readout-patemp` | PA temperature |
| `stage-<stageId>` | each row of the chain rail |
| `part-<partId>` | each part row in the breakdown list |
| `handbook` | the Handbook card |
| `handbook-close` | its close control |
| `event-log` | the event list |
| `preset-<presetId>` | each scenario button |
| `tour-next`, `tour-prev`, `tour-step` | tour controls and the current step |
| `presenter-toggle` | presenter mode switch |
| `damage-<partId>` | the damage indicator for a part in the thermal view |
| `fidelity-<value>` | the honesty stamp on a Handbook card |

Readout elements must contain the formatted number as their text content so a
test can assert on it.

Additional hooks used by the physics suite:

| testid | element |
|---|---|
| `readout-antenna-swr` | SWR measured at the antenna feedpoint, shown separately from the SWR at the radio — the two being different is a core lesson |
| `timescale-1`, `timescale-10`, `timescale-60` | the thermal clock speeds, so heating is demonstrable in a talk |
| `preset-open-feedline` | a preset that disconnects the antenna, the worst case |

`cable-length` must be an `<input type="range">` so it can be set directly.

### Addendum: `tunerBusy`

`SimState` carries `tunerBusy: boolean`. `runTuner()` sets it true, and the engine
clears it after the tuner's search time has elapsed in simulated seconds. The
transport's Tune key and the 3D tuner relays both read it. A real ATU takes a
second or two and clatters; the interface should not pretend the match is instant.

### Addendum: microphone

`UiState` carries `useMicrophone: boolean` and `StoreActions` carries
`setUseMicrophone(on)`. When true, `engine.ts` takes the transmit envelope from
`microphone.sample().peak` (see `src/sim/mic.ts`) instead of `speechEnvelope(t)`.
Everything downstream is unchanged. Unit tests must keep using the synthetic
voice so the physics stays reproducible.
