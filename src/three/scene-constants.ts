/**
 * Antinode — world layout. Shared by every 3D module. Do not redefine these
 * numbers anywhere else.
 *
 * Concept: the whole thing is a bench. The radio sits on it at true size, and
 * the antenna system sits beside it as a scale model on a plinth, with real
 * coax running between them. That keeps a 0.24 m radio and a 20 m dipole in the
 * same frame without pretending they are the same size — the scale break is
 * labelled on the plinth.
 *
 * Units: metres. +X right, +Y up, +Z toward the viewer. The radio faces +Z.
 */

export type Vec3 = readonly [number, number, number]

/** IC-7300 published external dimensions, metres (240 x 94 x 238 mm). */
export const RADIO = {
  width: 0.24,
  height: 0.094,
  depth: 0.238,
  /** Centre of the chassis; the bench top is y = 0. */
  origin: [0, 0, 0] as Vec3,
  /** Rubber feet raise the chassis slightly. */
  footHeight: 0.006,
  /** Front panel is at +Z, rear panel at -Z. */
  frontZ: 0.119,
  rearZ: -0.119,
  /** 4.3 inch display, 109 mm diagonal at 16:9 -> 95 x 53 mm. */
  screen: { w: 0.095, h: 0.053, x: -0.052, y: 0.052 },
  /** Main tuning dial. */
  dial: { r: 0.026, x: 0.072, y: 0.047 },
  /** Rear SO-239 antenna connector position on the rear panel. */
  so239: [-0.082, 0.03, -0.119] as Vec3,
} as const

export const BENCH = {
  minX: -0.75,
  maxX: 2.65,
  minZ: -0.95,
  maxZ: 0.95,
  y: 0,
} as const

/** The antenna diorama: a scale model on a plinth to the right of the radio. */
export const DIORAMA = {
  centre: [1.7, 0, -0.05] as Vec3,
  plinth: { w: 1.45, d: 1.0, h: 0.018 },
  /**
   * One metre of real antenna is this many world metres. Chosen so a 20 m dipole
   * spans most of the plinth and a 10 m mast stands about 0.7 m tall — big
   * enough to read as an antenna rather than as a detail on a base.
   */
  scale: 1 / 14,
  /** Where the coax meets the model, in plinth-local (unscaled) coordinates. */
  feedAnchor: [-0.55, 0.018, 0.34] as Vec3,
} as const

/** Route of the coax from the radio's SO-239 to the diorama feed anchor. */
export const COAX_ROUTE: readonly Vec3[] = [
  [-0.082, 0.03, -0.119],
  [-0.14, 0.012, -0.24],
  [-0.06, 0.008, -0.42],
  [0.35, 0.008, -0.5],
  [0.85, 0.008, -0.36],
  [1.1, 0.008, -0.05],
  [1.15, 0.022, 0.29],
  [1.15, 0.026, 0.29],
]

/** Camera presets, one per view. Position and look-at target, world metres. */
export const CAMERAS = {
  exterior: { pos: [0.34, 0.29, 0.62] as Vec3, target: [0, 0.05, 0] as Vec3, fov: 32 },
  'signal-path': { pos: [0.16, 0.38, 0.5] as Vec3, target: [0.0, 0.04, -0.02] as Vec3, fov: 38 },
  exploded: { pos: [0.5, 0.42, 0.58] as Vec3, target: [0, 0.08, -0.01] as Vec3, fov: 42 },
  cutaway: { pos: [-0.44, 0.34, 0.5] as Vec3, target: [0, 0.045, -0.01] as Vec3, fov: 34 },
  thermal: { pos: [0.1, 0.44, -0.62] as Vec3, target: [0, 0.05, -0.06] as Vec3, fov: 36 },
  station: { pos: [0.55, 1.15, 2.55] as Vec3, target: [0.82, 0.22, -0.05] as Vec3, fov: 46 },
} as const

/** How far parts travel in the exploded view at explode = 1. */
export const EXPLODE_GAIN = 1

/** Render layer used for parts that should be hidden in cutaway view. */
export const LAYER_SHELL = 1

/**
 * Distance in world metres that one wavelength of the standing wave occupies on
 * screen is derived from the real coax length, not the drawn length: the drawn
 * run is a compressed representation, so the shader maps normalised position
 * 0..1 along the drawn tube onto 0..lengthM of real cable.
 */
export const COAX_DRAWN_LENGTH = 2.35
