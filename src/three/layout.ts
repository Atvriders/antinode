/**
 * Antinode — where every part sits, and where it goes when the radio comes apart.
 *
 * Coordinates are radio-local metres: the chassis is centred on the origin, the
 * front panel faces +Z, the rear panel is at -Z, and the bench is at y = 0.
 *
 * The exploded offsets are laid out the way a service manual lays out an
 * exploded diagram: the shell opens outward, the boards lift and fan apart in
 * the order you would actually remove them, and small components rise above
 * their own board so you can still see which board they came off. Nothing
 * overlaps at full explosion.
 */

import { RADIO } from './scene-constants'
import type { Vec3 } from './scene-constants'

export interface PartTransform {
  /** Assembled position, radio-local metres. */
  pos: Vec3
  /** Bounding size, metres. Used for the picking proxy and for labels. */
  size: Vec3
  /** Added to pos at explode = 1. */
  explode: Vec3
}

const W = RADIO.width
const H = RADIO.height
const D = RADIO.depth

/** Board heights inside the case, measured from the bench. */
const Y_MAIN = 0.022
const Y_PA = 0.03
const Y_LPF = 0.055
const Y_TUNER = 0.014

export const PART_TRANSFORMS: Record<string, PartTransform> = {
  // ── Shell ────────────────────────────────────────────────────────────────
  chassis: {
    // The origin, not the centre: Chassis.tsx and FrontPanel.tsx are both written
    // in radio-local coordinates measured up from the bench, so this group must
    // not add a second offset of its own. Doing that once floated the whole case
    // 47 mm above the bench and left the boards showing underneath it.
    pos: [0, 0, 0],
    size: [W, H, D],
    explode: [0.0, 0.0832, 0.0],
  },

  // ── Front panel ──────────────────────────────────────────────────────────
  'tft-panel': {
    pos: [RADIO.screen.x, RADIO.screen.y, RADIO.frontZ + 0.001],
    size: [RADIO.screen.w, RADIO.screen.h, 0.002],
    explode: [-0.0468, 0.0208, 0.0676],
  },
  'main-dial': {
    pos: [RADIO.dial.x, RADIO.dial.y, RADIO.frontZ + 0.012],
    size: [RADIO.dial.r * 2, RADIO.dial.r * 2, 0.024],
    explode: [0.052, 0.026, 0.0676],
  },
  speaker: {
    // Just under the lid, not through it: the grille is in the case, the driver
    // is behind it.
    pos: [0.02, H - 0.016, -0.02],
    size: [0.07, 0.006, 0.07],
    explode: [0.0104, 0.1248, -0.0104],
  },

  // ── Main board and what lives on it ──────────────────────────────────────
  'main-board': {
    // Comfortably inside the case. An earlier version was 0.22 x 0.208 at
    // z = 0.005, which put its front edge exactly coplanar with the case's front
    // face and left a green sliver poking through the bezel.
    pos: [0, Y_MAIN, -0.004],
    size: [W - 0.034, 0.0016, D - 0.056],
    explode: [0.0, -0.0104, 0.104],
  },
  fpga: {
    pos: [-0.03, Y_MAIN + 0.004, 0.02],
    size: [0.023, 0.004, 0.023],
    explode: [-0.0312, 0.026, 0.1456],
  },
  'af-codec': {
    pos: [-0.072, Y_MAIN + 0.003, 0.03],
    size: [0.009, 0.003, 0.009],
    explode: [-0.0728, 0.0234, 0.1404],
  },
  'mic-preamp-ic': {
    pos: [-0.086, Y_MAIN + 0.003, 0.052],
    size: [0.006, 0.0025, 0.006],
    explode: [-0.0988, 0.0208, 0.1404],
  },
  'tx-dac': {
    pos: [0.006, Y_MAIN + 0.003, 0.028],
    size: [0.01, 0.003, 0.01],
    explode: [0.0104, 0.026, 0.1456],
  },
  pll: {
    pos: [0.03, Y_MAIN + 0.003, 0.036],
    size: [0.012, 0.004, 0.012],
    explode: [0.0416, 0.0234, 0.1456],
  },
  'bpf-bank': {
    pos: [0.055, Y_MAIN + 0.005, 0.0],
    size: [0.06, 0.008, 0.05],
    explode: [0.0884, 0.0208, 0.1144],
  },

  // ── PA board ─────────────────────────────────────────────────────────────
  predriver: {
    pos: [-0.05, Y_PA + 0.002, -0.055],
    size: [0.006, 0.003, 0.006],
    explode: [-0.0832, 0.052, -0.0624],
  },
  driver: {
    pos: [-0.03, Y_PA + 0.003, -0.062],
    size: [0.01, 0.005, 0.008],
    explode: [-0.052, 0.0572, -0.078],
  },
  'final-q1': {
    pos: [-0.004, Y_PA + 0.006, -0.086],
    size: [0.016, 0.018, 0.006],
    explode: [-0.0156, 0.0728, -0.104],
  },
  'final-q2': {
    pos: [0.02, Y_PA + 0.006, -0.086],
    size: [0.016, 0.018, 0.006],
    explode: [0.0156, 0.0728, -0.104],
  },
  'pa-heatsink': {
    pos: [0.008, 0.042, -0.104],
    size: [0.12, 0.07, 0.022],
    explode: [0.0104, 0.0312, -0.156],
  },
  'cooling-fan': {
    pos: [0.082, 0.042, -0.112],
    size: [0.04, 0.04, 0.012],
    explode: [0.104, 0.026, -0.1456],
  },

  // ── Low-pass filter board ────────────────────────────────────────────────
  'lpf-board': {
    pos: [-0.045, Y_LPF, -0.045],
    size: [0.11, 0.0016, 0.085],
    explode: [-0.1248, 0.0676, -0.0312],
  },
  'lpf-relay': {
    pos: [-0.045, Y_LPF + 0.005, -0.028],
    size: [0.09, 0.009, 0.012],
    explode: [-0.1352, 0.0988, -0.0104],
  },
  'lpf-cap': {
    pos: [-0.045, Y_LPF + 0.004, -0.06],
    size: [0.09, 0.007, 0.014],
    explode: [-0.1352, 0.0988, -0.0572],
  },
  'swr-coupler': {
    pos: [0.052, Y_LPF - 0.004, -0.07],
    size: [0.024, 0.012, 0.018],
    explode: [0.1144, 0.0884, -0.0728],
  },
  'ant-relay': {
    pos: [0.052, Y_LPF - 0.006, -0.045],
    size: [0.016, 0.011, 0.012],
    explode: [0.1248, 0.0676, -0.026],
  },

  // ── Tuner board ──────────────────────────────────────────────────────────
  'atu-board': {
    pos: [0.05, Y_TUNER, 0.045],
    size: [0.1, 0.0016, 0.08],
    explode: [0.1352, -0.0468, 0.052],
  },
  'atu-relay': {
    pos: [0.05, Y_TUNER + 0.005, 0.062],
    size: [0.085, 0.009, 0.012],
    explode: [0.1456, -0.0676, 0.0832],
  },
  'atu-inductor': {
    pos: [0.03, Y_TUNER + 0.007, 0.03],
    size: [0.05, 0.013, 0.02],
    explode: [0.1248, -0.078, 0.026],
  },
  'atu-cap': {
    pos: [0.078, Y_TUNER + 0.005, 0.03],
    size: [0.022, 0.009, 0.016],
    explode: [0.1664, -0.0676, 0.0156],
  },

  // ── Rear panel ───────────────────────────────────────────────────────────
  so239: {
    pos: [RADIO.so239[0], RADIO.so239[1], RADIO.so239[2] - 0.006],
    size: [0.018, 0.018, 0.016],
    explode: [-0.0832, -0.0104, -0.1248],
  },
  'dc-jack': {
    pos: [0.052, 0.026, RADIO.rearZ - 0.005],
    size: [0.02, 0.014, 0.014],
    explode: [0.0936, -0.0104, -0.1248],
  },

  // ── Outside the radio ────────────────────────────────────────────────────
  // These live in the station scene rather than in the radio, so they do not
  // move when the radio is exploded; the transforms exist so the parts list and
  // the stress map can still point at something.
  coax: { pos: [0, 0.01, -0.35], size: [0.01, 0.01, 0.4], explode: [0.0, 0.0, 0.0] },
  'coax-connector': { pos: [RADIO.so239[0], RADIO.so239[1], RADIO.rearZ - 0.02], size: [0.02, 0.02, 0.03], explode: [-0.0832, -0.0104, -0.156] },
  balun: { pos: [0, 0, 0], size: [0.05, 0.05, 0.05], explode: [0.0, 0.0, 0.0] },
  'antenna-element': { pos: [0, 0, 0], size: [0.02, 0.02, 0.02], explode: [0.0, 0.0, 0.0] },
  'mic-capsule': { pos: [0, 0.02, 0.24], size: [0.02, 0.02, 0.02], explode: [0.0, 0.0312, 0.0936] },
}

/** Parts that belong to the radio itself and therefore take part in the explosion. */
export const RADIO_PART_IDS: readonly string[] = Object.keys(PART_TRANSFORMS).filter(
  (id) => !['coax', 'balun', 'antenna-element', 'mic-capsule'].includes(id),
)

/** Parts hidden when the shell is opened, so you can see inside. */
export const SHELL_PART_IDS: readonly string[] = ['chassis']

export const transformOf = (id: string): PartTransform | undefined => PART_TRANSFORMS[id]
