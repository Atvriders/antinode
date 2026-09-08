/**
 * Antinode — the six views, and what each one is for.
 *
 * Camera positions and targets are taken from CAMERAS in
 * src/three/scene-constants.ts rather than restated here, so the panel and the
 * 3D layer cannot drift apart. Units are world metres.
 */

import { CAMERAS } from '../three/scene-constants'
import type { ViewDef } from './types'

export const VIEWS: readonly ViewDef[] = [
  {
    id: 'exterior',
    label: 'Exterior',
    blurb: 'Work the radio from the front: set frequency, mode and power, key it, and read what the meters say.',
    camera: CAMERAS.exterior.pos,
    target: CAMERAS.exterior.target,
  },
  {
    id: 'signal-path',
    label: 'Signal path',
    blurb: 'Follow one syllable from the microphone element to the antenna and see what it has become at each stage.',
    camera: CAMERAS['signal-path'].pos,
    target: CAMERAS['signal-path'].target,
  },
  {
    id: 'exploded',
    label: 'Exploded',
    blurb: 'Find out which board a stage lives on, and what Icom put next to it.',
    camera: CAMERAS.exploded.pos,
    target: CAMERAS.exploded.target,
  },
  {
    id: 'cutaway',
    label: 'Cutaway',
    blurb: 'See where the parts sit while the radio runs, with the covers taken off and the RF still flowing.',
    camera: CAMERAS.cutaway.pos,
    target: CAMERAS.cutaway.target,
  },
  {
    id: 'thermal',
    label: 'Thermal',
    blurb: 'Watch heat build in the finals and the heatsink, and find the point where protection folds power back.',
    camera: CAMERAS.thermal.pos,
    target: CAMERAS.thermal.target,
  },
  {
    id: 'station',
    label: 'Station',
    blurb: 'Change the antenna, the feedline and where the tuner sits, then compare SWR at the radio with SWR at the feedpoint.',
    camera: CAMERAS.station.pos,
    target: CAMERAS.station.target,
  },
]
