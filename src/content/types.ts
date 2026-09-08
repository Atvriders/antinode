/** Antinode — teaching content type contract. All copy lives in src/content. */

import type { AntennaId, BandId, StageId, StressKind, TunerMode } from '../rf/types'

/** A physical part of the radio, used by the exploded view and the damage map. */
export interface PartDef {
  readonly id: string
  readonly name: string
  /** Board or assembly it belongs to. */
  readonly assembly: 'front-panel' | 'main-board' | 'pa-board' | 'lpf-board' | 'tuner-board' | 'chassis' | 'rear-panel' | 'station'
  /** Publicly documented designation, or '' when not published. */
  readonly part: string
  readonly purpose: string
  /** Longer Handbook-card body, 2–5 sentences. */
  readonly detail: string
  /** Stage ids this part participates in. */
  readonly stages: readonly StageId[]
  /** How high SWR reaches this part. Empty when it is not affected. */
  readonly stressKinds: readonly StressKind[]
  /** What actually fails here, one sentence. Empty when nothing does. */
  readonly failureMode: string
  readonly fidelity: 'confirmed' | 'representative'
  /** Where the part sits in the exploded view, metres, radio-local coordinates. */
  readonly explodeOffset: readonly [number, number, number]
}

export type ViewId = 'exterior' | 'signal-path' | 'exploded' | 'cutaway' | 'thermal' | 'station'

export interface ViewDef {
  readonly id: ViewId
  readonly label: string
  /** One line telling the user what this view is for. */
  readonly blurb: string
  /** Camera position and target in world metres. */
  readonly camera: readonly [number, number, number]
  readonly target: readonly [number, number, number]
}

/** One step of the guided tour. */
export interface TourStep {
  readonly id: string
  readonly title: string
  /** Handbook-voice body copy. Markdown-lite: **bold** and `code` only. */
  readonly body: string
  readonly view: ViewId
  readonly focusStage: StageId | null
  readonly focusPart: string | null
  /** Config overrides applied when the step is entered. */
  readonly set: Partial<{
    freqHz: number
    antennaId: AntennaId
    tunerMode: TunerMode
    cableLengthM: number
    powerSetW: number
    keyed: boolean
  }>
  /** The single number the reader should walk away with. */
  readonly takeaway: string
}

/** A misconception card. These are the load-bearing teaching content. */
export interface MythCard {
  readonly id: string
  readonly myth: string
  readonly reality: string
  /** The demonstrable number that settles it. */
  readonly evidence: string
  /** Optional scenario that makes the point on screen. */
  readonly demo: string | null
}

export interface GlossaryEntry {
  readonly term: string
  readonly definition: string
  readonly seeAlso: readonly string[]
}

export interface ScenarioPreset {
  readonly id: string
  readonly name: string
  readonly blurb: string
  readonly band: BandId
  readonly set: Partial<{
    freqHz: number
    antennaId: AntennaId
    antennaParams: Record<string, number>
    cableId: string
    cableLengthM: number
    tunerMode: TunerMode
    powerSetW: number
    mode: string
  }>
  /** What the presenter should point at. */
  readonly expect: string
}
