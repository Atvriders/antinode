/**
 * Antinode — procedural surfaces.
 *
 * Every texture in this scene is computed here, in the browser, at boot.
 * Nothing is fetched: the container has to render with no network at all and
 * `e2e/offline.spec.ts` asserts it. That constraint is also what keeps the look
 * coherent, because six generators sit on one seeded noise basis and the grain
 * of the paint on the chassis is a relative of the grain of the brushing on the
 * heatsink rather than a stranger to it.
 *
 * `docs/SURFACES.md` is the contract. The exports below are written against by
 * `materials.ts`, `radio/FrontPanel.tsx` and `fx/Feedline.tsx`; do not change a
 * signature here without changing it there first.
 *
 * The rules this file keeps, and why:
 *
 * - **Seeded.** Every value comes from an integer hash of its own coordinates.
 *   Two runs produce the same picture, so a screenshot comparison means
 *   something. There is no `Math.random` in this file.
 * - **Generated once, cached by quality.** A texture built per frame leaks GPU
 *   memory and shader programs until the tab dies. `materials.ts` carries the
 *   same warning about materials for the same reason.
 * - **No lighting in a colour map.** The scene lights these surfaces. A `map`
 *   carries pigment and ink and nothing else; only an `aoMap` may darken, and
 *   only where there is a real crevice.
 * - **Seamless.** Every field wraps. The noise lattice wraps on a power-of-two
 *   period, and a shape drawn on the board that crosses an edge is drawn again
 *   at the opposite one. A tiling seam showing on the chassis is a defect.
 * - **Budget.** The whole library has under 250 ms at 1024 to work in, and
 *   almost all of the thinking below is about that. Noise is baked onto a small
 *   lattice once and read back bilinearly rather than summed per texel; the
 *   sampling schedule along each axis is computed `w + h` times rather than
 *   `w * h` times; the knurl, the jacket and the display are one-dimensional
 *   profiles held in a precomputed row or column; and the two grain maps stop
 *   growing at 512 because past that they only get a bigger patch of the same
 *   speckle — see `grainSize`, which is where most of the budget came from. Whoever runs this next owes it a measurement: `performance.now()`
 *   around the six calls, on the laptop, at 1024.
 */

import * as THREE from 'three'

/* ────────────────────────────── the API ────────────────────────────── */

/** Longest edge of a generated map, in pixels. */
export type TextureQuality = 512 | 1024 | 2048

/**
 * Each generator returns a cached, ready-to-use set. Repeat/wrap already
 * configured.
 *
 * Every texture in it is one shared instance: the same object is on every mesh
 * that asked for that generator, so mutating `repeat` on one changes it
 * everywhere. A surface that needs its own tiling — and most do, since the span
 * here runs from a shield can to a three-metre bench — should take `tex.clone()`
 * and set the repeat on that. A clone keeps the same `source`, so it is one
 * upload and one copy in GPU memory, and it carries its own transform. Dispose
 * of any clone you make: `disposeTextures()` only knows about the originals.
 */
export interface SurfaceMaps {
  map?: THREE.Texture
  normalMap?: THREE.Texture
  roughnessMap?: THREE.Texture
  aoMap?: THREE.Texture
  normalScale?: number
}

/* ──────────────────────────── the palette ──────────────────────────── */

/**
 * Surface colours, taken from the real radio rather than invented, and locked in
 * `docs/SURFACES.md`. These are not UI tokens; the interface keeps its own in
 * `tokens.css`. Only the board's are here, because the board is the one map in
 * this file that carries pigment at all: every other surface takes its colour
 * from its role in `materials.ts` and takes only a grain from here.
 */
const FR4_FOREST = '#1c5940'
/** The same colour again as bytes, because the laminate is written per texel. */
const FR4_RGB = { r: 0x1c, g: 0x59, b: 0x40 }
const HASL_TIN = '#c3ccd2'
const COPPER_TRACE = '#b4703c'

/**
 * The same tin, laid down at a little under three quarters.
 *
 * `hasl-tin` is a *metal*, and on the real thing most of what a pad returns is
 * a specular reflection rather than its own colour. This map goes onto a
 * material at 0.05 metalness — a board is a dielectric, and there is one
 * material for the whole of it — so the only place a pad's brightness can come
 * from here is its albedo, and the palette swatch put at full strength on a
 * surface under a key light at this intensity clipped to 255 on every one of
 * them. What that produced was a board whose highest-contrast element, by a
 * long way, was three hundred identical white specks: at cutaway distance the
 * laminate read as mint paper and the pads read as confetti thrown over it.
 *
 * Taken down, the pads sit where tin belongs — the brightest thing on the board
 * but not the only thing on it. The hue is the palette's, unchanged.
 */
const PAD_TIN = new THREE.Color(HASL_TIN).multiplyScalar(0.66).getStyle()

/**
 * Solder mask is translucent, so mask over a copper pour is not mask over bare
 * laminate — it takes a little of the metal's warmth with it. Mixed from the two
 * palette colours rather than eyeballed, so that if either of them moves, both
 * greens on the board move with it. three mixes in its working space, which is
 * linear, which is where a mix like this belongs anyway.
 */
function maskOverCopper(amount: number): string {
  return new THREE.Color(FR4_FOREST).lerp(new THREE.Color(COPPER_TRACE), amount).getStyle()
}

/**
 * The board's legend ink. Real silkscreen is white; drawn white here it glares
 * under the key light and pulls the eye to the least important thing in the
 * cutaway, so it sits between the interface's `--silk` and white.
 */
const SILK_INK = '#c8d0ce'

/**
 * The interface's own faces, which are also the only type in the scene. A
 * designator is data, so it is set in the mono face; a legend is a label, so it
 * is set in the condensed face. Both are self-hosted in `public/fonts` and
 * declared in `src/ui/fonts.css` — no new fonts, and nothing fetched from a
 * third party. The fallbacks matter: see `scheduleFontRedraw`.
 */
const MONO = '"Chivo Mono", ui-monospace, monospace'
const COND = '"IBM Plex Sans Condensed", "IBM Plex Sans", sans-serif'

/** One seed for the whole library, so every surface is a relative of the others. */
const SEED = 0x7300

const TAU = Math.PI * 2

/* ─────────────────────────────── quality ───────────────────────────── */

/**
 * Decided once and remembered.
 *
 * Recomputing this would be worse than useless: a viewer dragging the edge of a
 * window would cross a threshold, every generator would run again mid-flight,
 * and the maps already on the GPU would be orphaned. `disposeTextures()` clears
 * it, which is the only moment the answer is allowed to change.
 */
let quality: TextureQuality | null = null

/**
 * Filled in by `textureQuality()` from the renderer's own limit. three clamps
 * anisotropy at upload anyway, but asking for sixteen on hardware that offers
 * two is a lie in the source rather than a bug, and the real number is free.
 */
let maxAnisotropy = 4

/**
 * Chosen from the renderer's own limits and the screen, once.
 * A phone gets 512, a laptop 1024, a desktop with headroom 2048.
 *
 * The decision is made on CSS width and on `maxTextureSize`, deliberately not on
 * `devicePixelRatio`. The configuration this application exists to be shown in
 * is a projector at 1920x1080 with a device pixel ratio of exactly 1, and a rule
 * that wanted a high ratio would hand the one audience that matters the phone's
 * textures. The 900px threshold is the same one the responsive layout calls
 * `compact`, so a phone is a phone by one definition across the whole project.
 */
export function textureQuality(gl: THREE.WebGLRenderer): TextureQuality {
  if (quality !== null) return quality

  const caps = gl.capabilities
  maxAnisotropy = Math.max(1, caps.getMaxAnisotropy())
  const maxSize = caps.maxTextureSize

  // No window means a test environment, where the size decides nothing. Take the
  // middle rather than guessing.
  const w = typeof window === 'undefined' ? 1280 : window.innerWidth
  const h = typeof window === 'undefined' ? 800 : window.innerHeight

  let q: TextureQuality
  if (w < 900 || h < 520) q = 512
  else if (w < 1600) q = 1024
  else q = 2048

  // WebGL2 guarantees 2048 and nothing more, and a driver sitting on that floor
  // is not one that wants a 2048 map and its mip chain on every surface in the
  // scene. It also must not be given one: three's resize path resizes an
  // HTMLCanvasElement that is over the limit and returns anything else
  // untouched, so an oversized OffscreenCanvas fails to upload with no warning
  // at all.
  if (maxSize < 4096) q = 512

  // A renderer with no GPU behind it. SwiftShader and llvmpipe shade every
  // fragment on the CPU, so each extra texture fetch per material is paid for in
  // full across the whole viewport — measured here, the four-map surfaces took
  // the frame from 285 ms to 1057 ms, which is 0.9 fps and slow enough that
  // Playwright cannot capture a stable frame at all.
  //
  // This is not a fiction for tests: it is every CI runner, every remote desktop
  // and anyone whose driver has fallen back. They get the smallest maps.
  if (softwareRenderer(gl)) q = 512

  quality = q
  return q
}

/**
 * Whether this renderer rasterises on the CPU.
 *
 * `WEBGL_debug_renderer_info` is the only way to ask, and some browsers withhold
 * it for fingerprinting reasons — in which case assume hardware, because the
 * penalty for guessing wrong that way is a slow frame and the penalty for the
 * other is a needlessly ugly picture for everyone.
 */
let software: boolean | null = null
export function softwareRenderer(gl: THREE.WebGLRenderer): boolean {
  if (software !== null) return software
  software = false
  try {
    const ctx = gl.getContext()
    const ext = ctx.getExtension('WEBGL_debug_renderer_info')
    if (ext) {
      const name = String(ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? '')
      software = /swiftshader|llvmpipe|software|microsoft basic/i.test(name)
    }
  } catch {
    software = false
  }
  return software
}

/* ──────────────────────────── the noise basis ──────────────────────── */

/**
 * One integer hash underneath everything. Deterministic, allocation free, and
 * the same on every machine: this is what makes a screenshot test meaningful.
 * Thomas Wang's mix by way of xxHash's constants, on 32-bit lanes through
 * `Math.imul` so the arithmetic never leaves the integer range.
 */
function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/**
 * A seeded sequence for the parts of the board that are laid out rather than
 * sampled. Mulberry32: small, fast, and good enough for deciding where a
 * capacitor goes. Re-seeding it gives the identical board back, which is how the
 * colour pass and the roughness pass draw the same components in the same places
 * without either of them having to record what it did.
 */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Quintic fade. Smoother than a cubic at the lattice lines, where a cheaper
 *  curve leaves a grid you can see once the normal map differentiates it. */
function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10)
}

/**
 * A value-noise lattice, cached by period and seed.
 *
 * Periods are always powers of two, so wrapping is a bitwise AND — which also
 * wraps negative coordinates correctly — and so the field tiles exactly. Without
 * that the seam is a hard line down the middle of the chassis.
 */
const lattices = new Map<string, Float32Array>()

function lattice(px: number, py: number, seed: number): Float32Array {
  const key = `${px}x${py}:${seed}`
  const hit = lattices.get(key)
  if (hit) return hit
  const g = new Float32Array(px * py)
  for (let y = 0; y < py; y++) {
    for (let x = 0; x < px; x++) g[y * px + x] = hash(x, y, seed)
  }
  lattices.set(key, g)
  return g
}

/**
 * A finished noise field, ready to be read a million times.
 *
 * The first version of this evaluated every octave per texel, which is the
 * obvious way to write it and cost more than the whole library's budget on its
 * own: two octaves is two floors, two quintic fades, eight lattice reads and a
 * pile of masking, sixty-odd operations, for every one of a million texels.
 *
 * Both halves of that are avoidable. The octaves are summed once onto the finest
 * one's own lattice — which is at most a few hundred nodes square — so reading
 * the field is a single bilinear sample; and because a texture is sampled on a
 * regular grid, the lattice indices and the interpolation weights repeat along
 * each axis, so they are computed `w + h` times into a schedule rather than
 * `w * h` times in the loop. What is left in the inner loop is six array reads
 * and three lerps. The only thing given up is that the coarse octaves are
 * reconstructed bilinearly between fine nodes instead of quintically, at sixteen
 * times upsampling, which nothing can see.
 */
interface Field {
  readonly grid: Float32Array
  /** Width of the baked lattice, for indexing rows. */
  readonly px: number
  /** Per-texel sampling schedule: the two nodes either side, and the weight. */
  readonly x0: Int32Array
  readonly x1: Int32Array
  readonly xt: Float32Array
  readonly y0: Int32Array
  readonly y1: Int32Array
  readonly yt: Float32Array
}

/** The schedule for one axis: where each texel falls on a lattice of `period`. */
function schedule(n: number, period: number): { i0: Int32Array; i1: Int32Array; t: Float32Array } {
  const i0 = new Int32Array(n)
  const i1 = new Int32Array(n)
  const t = new Float32Array(n)
  const mask = period - 1
  for (let i = 0; i < n; i++) {
    const at = (i * period) / n
    const floor = Math.floor(at)
    i0[i] = floor & mask
    i1[i] = (floor + 1) & mask
    t[i] = fade(at - floor)
  }
  return { i0, i1, t }
}

/**
 * Builds a field for a texture of `w` by `h`, from `octaves` of value noise
 * starting at a lattice of `px` by `py` and doubling. Separate periods per axis
 * are what make a stretched field possible, which is the whole trick behind the
 * brushed finish.
 */
function field(w: number, h: number, px: number, py: number, octaves: number, seed: number): Field {
  const topX = px << (octaves - 1)
  const topY = py << (octaves - 1)

  // One octave is the lattice itself — there is nothing to sum and the gain is
  // one — so the cached array is used in place rather than copied. A field of a
  // node every two texels is a megabyte at 1024, and copying it would be two.
  // Nothing ever writes to a grid after this.
  let grid: Float32Array
  if (octaves === 1) {
    grid = lattice(px, py, seed)
  } else {
    grid = new Float32Array(topX * topY)
    let amp = 1
    let total = 0
    for (let o = 0; o < octaves; o++) {
      const ox = px << o
      const oy = py << o
      const g = lattice(ox, oy, seed + o * 101)
      for (let j = 0; j < topY; j++) {
        const row = j * topX
        const sy = (j * oy) / topY
        for (let i = 0; i < topX; i++) {
          grid[row + i] = (grid[row + i] ?? 0) + amp * sample(g, ox, oy, (i * ox) / topX, sy)
        }
      }
      total += amp
      amp *= 0.5
    }
    const gain = 1 / total
    for (let i = 0; i < grid.length; i++) grid[i] = (grid[i] ?? 0) * gain
  }

  const sx = schedule(w, topX)
  const sy = schedule(h, topY)
  return { grid, px: topX, x0: sx.i0, x1: sx.i1, xt: sx.t, y0: sy.i0, y1: sy.i1, yt: sy.t }
}

/** Bilinear sample of one lattice, in lattice units. Wraps, so the field tiles. */
function sample(grid: Float32Array, px: number, py: number, x: number, y: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const tx = fade(x - xi)
  const ty = fade(y - yi)
  const mx = px - 1
  const my = py - 1
  const x0 = xi & mx
  const x1 = (xi + 1) & mx
  const r0 = (yi & my) * px
  const r1 = ((yi + 1) & my) * px
  const a = grid[r0 + x0] ?? 0
  const b = grid[r0 + x1] ?? 0
  const c = grid[r1 + x0] ?? 0
  const d = grid[r1 + x1] ?? 0
  const top = a + (b - a) * tx
  const bottom = c + (d - c) * tx
  return top + (bottom - top) * ty
}

/** The field at one texel. This is the hottest function in the file. */
function fieldAt(f: Field, x: number, y: number): number {
  const px = f.px
  const r0 = (f.y0[y] ?? 0) * px
  const r1 = (f.y1[y] ?? 0) * px
  const i0 = f.x0[x] ?? 0
  const i1 = f.x1[x] ?? 0
  const tx = f.xt[x] ?? 0
  const ty = f.yt[y] ?? 0
  const a = f.grid[r0 + i0] ?? 0
  const b = f.grid[r0 + i1] ?? 0
  const c = f.grid[r1 + i0] ?? 0
  const d = f.grid[r1 + i1] ?? 0
  const top = a + (b - a) * tx
  const bottom = c + (d - c) * tx
  return top + (bottom - top) * ty
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/**
 * Linear light to an sRGB byte, through a table.
 *
 * Only the display mask needs this, but it needs it three million times, and
 * `Math.pow` at that count is a third of the library's whole budget. A thousand
 * steps quantises the transfer far below what an eight-bit texture can carry.
 */
const SRGB_STEPS = 1024
const SRGB_MAX = SRGB_STEPS - 1
let srgbLut: Uint8Array | null = null

/** The table itself, built on first use and then read inline. A call and a
 *  null check per texel would be three million of each. */
function srgbTable(): Uint8Array {
  let t = srgbLut
  if (t === null) {
    t = new Uint8Array(SRGB_STEPS)
    for (let i = 0; i < SRGB_STEPS; i++) {
      const l = i / SRGB_MAX
      const s = l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055
      t[i] = Math.round(s * 255)
    }
    srgbLut = t
  }
  return t
}

/* ─────────────────────────── canvas plumbing ───────────────────────── */

/**
 * The slice of the 2D context this file uses.
 *
 * `CanvasRenderingContext2D` and `OffscreenCanvasRenderingContext2D` are not
 * assignable to one another — the offscreen one has no `drawFocusIfNeeded` and
 * its `canvas` is a different type — so a union would need a cast at every call.
 * Both satisfy this structurally, and writing out what is used is a better
 * record of it than `as unknown as` would be.
 */
interface Ctx2D {
  // Both fills take a gradient or a pattern as well as a colour. Nothing here
  // uses either, but the property has to be declared as wide as the real one or
  // neither context is assignable to this.
  fillStyle: string | CanvasGradient | CanvasPattern
  strokeStyle: string | CanvasGradient | CanvasPattern
  lineWidth: number
  lineCap: CanvasLineCap
  lineJoin: CanvasLineJoin
  globalAlpha: number
  font: string
  textAlign: CanvasTextAlign
  textBaseline: CanvasTextBaseline
  letterSpacing: string
  save(): void
  restore(): void
  translate(x: number, y: number): void
  fillRect(x: number, y: number, w: number, h: number): void
  strokeRect(x: number, y: number, w: number, h: number): void
  beginPath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  closePath(): void
  arc(x: number, y: number, r: number, start: number, end: number): void
  fill(): void
  stroke(): void
  fillText(text: string, x: number, y: number): void
  putImageData(data: ImageData, dx: number, dy: number): void
}

type Canvas2D = HTMLCanvasElement | OffscreenCanvas

interface Surface {
  readonly canvas: Canvas2D
  readonly ctx: Ctx2D
}

/**
 * An OffscreenCanvas where there is one, a detached element otherwise.
 *
 * The `getContext('2d')` check is not defensive programming for its own sake:
 * three does exactly the same test in `WebGLTextures`, because some
 * implementations — cordova's iOS webview among them — expose `OffscreenCanvas`
 * and a WebGL context on it but no 2D context at all.
 */
function makeSurface(w: number, h: number): Surface | null {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(w, h)
    const ctx = canvas.getContext('2d')
    if (ctx) return { canvas, ctx }
  }
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (ctx) return { canvas, ctx }
  }
  // No 2D canvas at all: a unit test importing this module under Node. Every
  // generator degrades to no maps rather than throwing on import.
  return null
}

/** True when anything can be drawn at all. Checked before a generator spends
 *  fifty milliseconds building a field it would then have to throw away. */
function canDraw(): boolean {
  return typeof ImageData !== 'undefined' && (typeof OffscreenCanvas !== 'undefined' || typeof document !== 'undefined')
}

interface TextureOptions {
  /** True for a map that carries colour. A normal, roughness or AO map is data. */
  srgb?: boolean
  repeat: readonly [number, number]
  anisotropy?: number
}

/** Every texture this module has handed out, so `disposeTextures()` can free it. */
const created: THREE.Texture[] = []

function toTexture(canvas: Canvas2D, opts: TextureOptions): THREE.Texture {
  const t: THREE.Texture = new THREE.CanvasTexture<Canvas2D>(canvas)
  // A colour map is sRGB; a normal, roughness or AO map is not. Getting this
  // wrong does not throw — it just bends every slope and every gloss value
  // through a gamma curve and leaves the surface looking subtly wrong.
  t.colorSpace = opts.srgb === true ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.wrapS = THREE.RepeatWrapping
  t.wrapT = THREE.RepeatWrapping
  t.repeat.set(opts.repeat[0], opts.repeat[1])
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.magFilter = THREE.LinearFilter
  t.generateMipmaps = true
  t.anisotropy = Math.min(opts.anisotropy ?? 4, maxAnisotropy)
  t.needsUpdate = true
  created.push(t)
  return t
}

/** Pixels straight to a texture, which is the cheap path: one write, no draw calls. */
function imageTexture(data: ImageData, opts: TextureOptions): THREE.Texture | null {
  const s = makeSurface(data.width, data.height)
  if (!s) return null
  s.ctx.putImageData(data, 0, 0)
  return toTexture(s.canvas, opts)
}

/* ──────────────────────────── shared helpers ───────────────────────── */

/**
 * Tangent-space normals from a height field, packed into an ImageData.
 *
 * Two things here are easy to get backwards and invisible when you do. The
 * texture is uploaded with three's default `flipY`, so increasing image y is
 * *decreasing* v, which flips the sign of the green channel; and the normal of a
 * height field is (-dh/du, -dh/dv, 1), so both gradients are negated again. The
 * result is x from left-minus-right and y from below-minus-above. Lit from
 * above-left, as this scene is, an inverted green channel reads as every bump
 * being a dent, and the picture looks merely odd rather than wrong.
 */
function normalsFrom(h: Float32Array, w: number, hh: number, strength: number): ImageData {
  const out = new ImageData(w, hh)
  const d = out.data
  const mx = w - 1
  const my = hh - 1
  for (let y = 0; y < hh; y++) {
    const row = y * w
    const up = ((y - 1) & my) * w
    const down = ((y + 1) & my) * w
    for (let x = 0; x < w; x++) {
      const left = h[row + ((x - 1) & mx)] ?? 0
      const right = h[row + ((x + 1) & mx)] ?? 0
      const above = h[up + x] ?? 0
      const below = h[down + x] ?? 0
      const nx = (left - right) * strength
      const ny = (below - above) * strength
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1)
      const i = (row + x) * 4
      d[i] = (nx * inv * 0.5 + 0.5) * 255
      d[i + 1] = (ny * inv * 0.5 + 0.5) * 255
      d[i + 2] = (inv * 0.5 + 0.5) * 255
      d[i + 3] = 255
    }
  }
  return out
}

/**
 * A greyscale map from a height field.
 *
 * three multiplies the material's own roughness by the green channel of this
 * map, so the map can only ever make a surface glossier, never rougher. Every
 * band below is therefore centred near the top of the range: the material in
 * `materials.ts` holds the rough end of the surface and this takes some of it
 * away where the finish is raised, polished or worn.
 */
function greyFrom(h: Float32Array, w: number, hh: number, low: number, high: number): ImageData {
  const out = new ImageData(w, hh)
  const d = out.data
  const span = high - low
  for (let i = 0, n = w * hh; i < n; i++) {
    const v = (low + clamp01(h[i] ?? 0) * span) * 255
    const j = i * 4
    d[j] = v
    d[j + 1] = v
    d[j + 2] = v
    d[j + 3] = 255
  }
  return out
}

/* ───────────────────────────── the cache ───────────────────────────── */

const mapSets = new Map<string, SurfaceMaps>()
const singles = new Map<string, THREE.Texture>()

/**
 * Bumped by `disposeTextures()`. A font that finishes loading after the scene
 * has been torn down must not redraw into a canvas whose texture is gone.
 */
let generation = 0

function cached(name: string, q: TextureQuality, build: () => SurfaceMaps): SurfaceMaps {
  const key = `${name}:${q}`
  const hit = mapSets.get(key)
  if (hit) return hit
  const built = canDraw() ? build() : {}
  mapSets.set(key, built)
  return built
}

/* ─────────────────────────────── castPaint ─────────────────────────── */

/**
 * The fine isotropic speckle of the textured paint on a die-cast chassis and a
 * moulded front panel.
 *
 * Three layers. A noise field with a node every two texels is the speckle
 * itself — a quarter of a millimetre at the scale this is laid on at, which is
 * about what a textured finish measures — two octaves of a much coarser field
 * underneath give it the slow clumping that separates a sprayed surface from
 * sandpaper, and a third, far slower still, varies the sheen over a patch the
 * size of a hand. That third one is the only one of the three that survives the
 * mip chain at the distance the case is actually seen from, which is why it is
 * on the roughness map and not on the normal. There is no colour map,
 * because the paint is one colour — `cast-graphite` on the casting and
 * `panel-slate` on the moulding, both held in `materials.ts`, which is where a
 * pigment belongs. All this does is break the specular.
 *
 * `normalScale` is 0.34 rather than anything more assertive because the contract
 * caps paint at 0.6, because a chassis that reads as hammered metal from across
 * the room is wrong, and because at 0.45 with the old amplitude the lid read as
 * porous close up. At exterior distance this should be invisible; what it buys
 * is that the highlight rolling across the lid is not glassy.
 */
export function castPaint(q: TextureQuality): SurfaceMaps {
  return cached('castPaint', q, () => {
    const n = grainSize(q)
    // The fine one has a lattice node every two texels, which is the speckle
    // itself; the second clumps it; the third is the slow one, and it is the
    // only part of this that the reader ever actually sees.
    const fine = field(n, n, n >> 1, n >> 1, 1, SEED + 12)
    const clumps = field(n, n, 32, 32, 2, SEED + 11)
    const slow = field(n, n, 4, 4, 2, SEED + 13)

    // Relief and gloss are no longer the same field.
    //
    // They were, and the consequence was that this generator contributed
    // nothing at any distance a reader looks from. Measured on the shipped
    // build at 390x844, a nineteen-pixel patch of lid had a standard deviation
    // of half a grey level: the speckle is pinned at two texels by the noise
    // and a quarter of a millimetre by the repeat, so by the time the case is
    // five hundred pixels wide the mip chain has averaged both maps to their
    // own means and the paint is gone. Close in it was no better — one octave
    // of even, directionless speckle over everything, which is the look of
    // bead-blasted stone rather than of a finish sprayed onto a casting.
    //
    // So the relief keeps the fine structure and loses a third of its
    // amplitude, because it was reading as porous; and the *gloss* takes the
    // slow field, which is four nodes to a tile — a patch some four centimetres
    // across, an order of magnitude above the speckle and low enough to survive
    // to any screen. Sprayed paint genuinely does vary in sheen at that scale,
    // in a way that has no relief to go with it: it is where the gun was, not
    // what the surface is.
    const relief = new Float32Array(n * n)
    const gloss = new Float32Array(n * n)
    for (let y = 0; y < n; y++) {
      const row = y * n
      for (let x = 0; x < n; x++) {
        const f = fieldAt(fine, x, y)
        const c = fieldAt(clumps, x, y)
        // The slow field is in the relief as well as the gloss, at a tenth of
        // the weight: orange peel, which is what a sprayed finish has and the
        // only part of its relief with any chance of surviving to a screen. At
        // this amplitude it is a gentle undulation that walks the room's
        // reflection about rather than a texture anybody can point at.
        relief[row + x] = 0.52 * f + 0.38 * c + 0.1 * fieldAt(slow, x, y)
        gloss[row + x] = clamp01(0.34 * f + 0.2 * c + 0.46 * fieldAt(slow, x, y))
      }
    }

    const repeat = grainRepeat(n, 2048)
    const normal = imageTexture(normalsFrom(relief, n, n, 1.6), { repeat, anisotropy: 8 })
    // Raised, sprayed texture wears smooth at the peaks and holds its micro
    // structure in the pits, so the glossier places are the higher ones. The
    // band is wider than it was because the slow field is what carries it now,
    // and a sheen that varies by two per cent over four centimetres is a sheen
    // nobody can see.
    const rough = imageTexture(greyFrom(gloss, n, n, 0.66, 1.0), { repeat, anisotropy: 8 })

    const out: SurfaceMaps = { normalScale: 0.34 }
    if (normal) out.normalMap = normal
    if (rough) out.roughnessMap = rough
    return out
  })
}

/**
 * How big a grain map is actually drawn, which is not always `q`.
 *
 * Past this a speckle map buys nothing but a larger patch of unique speckle, and
 * it costs four times the pixels to generate. The grain itself cannot get any
 * finer without becoming finer than the paint: it is pinned at two texels by the
 * noise and at a quarter of a millimetre by the repeat below, which is about
 * right for a textured finish and already past what a projector can resolve. The
 * board and the display do scale all the way up, because there the extra texels
 * go into things that have a shape.
 *
 * The cap was 1024 and is now 512, which is where the library's whole budget
 * came from. `grainRepeat` holds the grain's size in millimetres constant across
 * tiers, so halving the map does not coarsen anything: it tiles a 60 mm patch
 * four times across the lid instead of a 120 mm patch twice. Measured before and
 * after on the same machine, the library went from 382 ms to 207 ms — paint and
 * anodising are a million texels each of normal and roughness, and they were
 * seventy per cent of everything — and nothing in the picture moved. A
 * nineteen-pixel patch of lid measured a standard deviation of 0.68 grey levels
 * at 1024 and 0.68 at 512, and the bench, which tiles this forty-eight times,
 * shows no period a reader can find.
 */
function grainSize(q: TextureQuality): number {
  return Math.min(q, 512)
}

/**
 * Tiles across a surface the size of the radio's case, chosen so that the grain
 * stays the same size in millimetres at every quality. A bigger map is not a
 * finer grain, it is fewer repeats of it: 512 shows one 60 mm patch of paint
 * four times across the 240 mm lid, 1024 shows a 120 mm patch twice. Less to
 * recognise, and that much less chance of the seam showing. `materials.ts`
 * multiplies this by a density per role, because a bench is not a shield can.
 */
function grainRepeat(n: number, span: number): readonly [number, number] {
  const r = span / n
  return [r, r]
}

/* ──────────────────────────── brushedAnodise ───────────────────────── */

/**
 * Anisotropic streaks along one axis, for extruded heatsink fins and the dial rim.
 *
 * The grain runs along **u**. On a box that is the horizontal axis of each face;
 * on a cylinder u goes around the circumference, which is why the same generator
 * serves both the fins and the dial rim — a turned rim is brushed around, an
 * extruded fin is brushed along, and both are streaks parallel to u.
 *
 * The streaks are white noise box-blurred along x at two window lengths, which
 * is the cheap way to do this: a sliding sum makes a fifty-seven tap blur cost
 * the same as a three tap one, and it is the only reason this generator is a few
 * tens of milliseconds rather than a few hundred. Averaging flattens the
 * contrast, so each pass is stretched back out afterwards by a factor tied to
 * its own window.
 */
export function brushedAnodise(q: TextureQuality): SurfaceMaps {
  return cached('brushedAnodise', q, () => {
    const n = grainSize(q)
    const white = new Float32Array(n * n)
    for (let y = 0; y < n; y++) {
      const row = y * n
      for (let x = 0; x < n; x++) white[row + x] = hash(x, y, SEED + 21)
    }

    const fine = new Float32Array(n * n)
    const long = new Float32Array(n * n)
    streakBlur(white, fine, n, n, Math.max(2, n >> 8))
    streakBlur(white, long, n, n, Math.max(8, n >> 5))

    // A stretched field on top of the sanding marks: the drag of the extrusion
    // die, which is a much longer wave than anything a brush leaves.
    const drag = field(n, n, 4, 128, 2, SEED + 22)

    const h = new Float32Array(n * n)
    for (let y = 0; y < n; y++) {
      const row = y * n
      for (let x = 0; x < n; x++) {
        const i = row + x
        h[i] = clamp01(
          0.34 * (long[i] ?? 0) + 0.3 * (fine[i] ?? 0) + 0.28 * fieldAt(drag, x, y) + 0.08 * (white[i] ?? 0),
        )
      }
    }

    // Fewer tiles than the paint gets. Brushing is a longer-scale mark and the
    // eye finds a repeated streak much faster than it finds a repeated speckle.
    const repeat = grainRepeat(n, 1536)
    const normal = imageTexture(normalsFrom(h, n, n, 1.9), { repeat, anisotropy: 16 })
    // Brushed metal is mostly a roughness effect: the highlight smears along the
    // grain because the gloss varies across it. This band is wider than the
    // paint's for that reason.
    const rough = imageTexture(greyFrom(h, n, n, 0.7, 1.0), { repeat, anisotropy: 16 })

    const out: SurfaceMaps = { normalScale: 0.35 }
    if (normal) out.normalMap = normal
    if (rough) out.roughnessMap = rough
    return out
  })
}

/**
 * Box blur along x with a sliding sum, wrapping at the edges so the result
 * tiles. The gain restores the contrast the averaging took out: the standard
 * deviation of a mean of N uniform samples falls as the square root of N, and
 * 0.6 of that back is the most that can be put in before the tails clip.
 */
function streakBlur(src: Float32Array, out: Float32Array, w: number, h: number, radius: number): void {
  const win = radius * 2 + 1
  const inv = 1 / win
  const gain = 0.6 * Math.sqrt(win)
  const mask = w - 1
  for (let y = 0; y < h; y++) {
    const row = y * w
    let sum = 0
    for (let i = -radius; i <= radius; i++) sum += src[row + (i & mask)] ?? 0
    for (let x = 0; x < w; x++) {
      out[row + x] = clamp01(0.5 + (sum * inv - 0.5) * gain)
      sum += (src[row + ((x + radius + 1) & mask)] ?? 0) - (src[row + ((x - radius) & mask)] ?? 0)
    }
  }
}

/* ─────────────────────────────────  fr4  ───────────────────────────── */

/**
 * Woven glass showing faintly through green solder mask, plus the silkscreen.
 *
 * This is the map the contract spends its risk on, so it is worth saying what it
 * is made of. Four layers, in order: the mask itself, tinted by the weave of the
 * glass cloth beneath it; the copper — pours, traces, pads and vias, all of them
 * seen *through* the mask except the tinned pads, which are not covered by it;
 * the component footprints; and the legends.
 *
 * Two decisions in it are departures from the object, both deliberate:
 *
 * The weave is drawn at about a third over life size. A 2116 cloth is around
 * 0.6 mm between bundles, which at the size this map is laid on at is under two
 * texels, and at cutaway distance it is a fraction of a screen pixel. Drawn true
 * it is mud that costs 30 ms; drawn at 0.9 mm it reads as fabric when you push
 * in and averages away to nothing when you do not, which is what it does in
 * life.
 *
 * Every legend on the board is a designator Icom's service manual actually uses,
 * taken from the sources recorded in `src/content/parts.ts` rather than invented
 * — the contract forbids inventing a part number, and a board that says Q131
 * beside two large devices is telling the truth about the radio. The small
 * passives carry no designator at all, which is also true of a dense board: at
 * that size the reference is on the assembly drawing, not on the silk.
 *
 * Colour and roughness only, which is what the contract asks for. A normal map
 * here would cost a third of the library's budget on the surface that is always
 * seen close to face-on, where a 1.6 mm flat board has nothing for it to say
 * that the gloss break does not already say.
 */
export function fr4(q: TextureQuality): SurfaceMaps {
  return cached('fr4', q, () => {
    const n = q
    const colour = makeSurface(n, n)
    const rough = makeSurface(n, n)
    if (!colour || !rough) return {}

    paintLaminate(colour.ctx, rough.ctx, n)
    drawBoard(colour.ctx, n, COLOUR_INK)
    drawBoard(rough.ctx, n, ROUGH_INK)

    const map = toTexture(colour.canvas, { srgb: true, repeat: FR4_REPEAT, anisotropy: 8 })
    const roughness = toTexture(rough.canvas, { repeat: FR4_REPEAT, anisotropy: 8 })

    // The silkscreen needs the interface's own faces, and they may not have
    // arrived when this runs. Redrawing beats blocking: the generators are
    // synchronous because materials.ts wants maps at mount, and a board that
    // carries its legends in the fallback face for one frame is a better failure
    // than a board that is not there yet. See `scheduleFontRedraw`.
    scheduleFontRedraw(() => {
      paintLaminate(colour.ctx, rough.ctx, n)
      drawBoard(colour.ctx, n, COLOUR_INK)
      drawBoard(rough.ctx, n, ROUGH_INK)
      map.needsUpdate = true
      roughness.needsUpdate = true
    })

    return { map, roughnessMap: roughness }
  })
}

/**
 * One tile over a board. The main board is 206 x 182 mm, so at 1024 there are
 * about five texels to the millimetre — enough for a 0603 footprint to be a
 * footprint rather than a smudge, and it means the only seam is at the board's
 * own edge.
 */
const FR4_REPEAT = [1, 1] as const

/**
 * Bundles of glass cloth across the width of one tile. See the note above.
 *
 * Up from 144, and the amplitude below is down with it. At 144 a bundle was
 * seven texels across at 1024, which is a basket weave you can count from
 * across the room — the board read as burlap rather than as laminate. The
 * point of drawing the weave at all is that it is *there* when you push in and
 * gone when you do not.
 */
const WEAVE_CYCLES = 232

/** The laminate itself: mask colour over the weave, written as pixels. */
function paintLaminate(colour: Ctx2D, rough: Ctx2D, n: number): void {
  const c = new ImageData(n, n)
  const r = new ImageData(n, n)
  const cd = c.data
  const rd = r.data

  // u and v separate: the weave is two one-dimensional functions crossed, so the
  // sines and the bundle indices are computed n times rather than n squared.
  const wave = new Float32Array(n)
  const bundle = new Int32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / n
    wave[i] = Math.sin(t * TAU * WEAVE_CYCLES)
    bundle[i] = Math.floor(t * WEAVE_CYCLES)
  }

  const mottle = field(n, n, 16, 16, 2, SEED + 31)

  for (let y = 0; y < n; y++) {
    const row = y * n
    const wy = wave[y] ?? 0
    const by = bundle[y] ?? 0
    for (let x = 0; x < n; x++) {
      // Basket weave: warp is over weft in every other cell, so whichever bundle
      // is on top is the one whose profile you see.
      const over = ((bundle[x] ?? 0) + by) & 1
      const w = over === 1 ? (wave[x] ?? 0) : wy
      const m = fieldAt(mottle, x, y) - 0.5
      const grain = hash(x, y, SEED + 32) - 0.5

      const tint = 1 + 0.03 * w + 0.07 * m + 0.03 * grain
      const i = (row + x) * 4
      cd[i] = FR4_RGB.r * tint
      cd[i + 1] = FR4_RGB.g * tint
      cd[i + 2] = FR4_RGB.b * tint
      cd[i + 3] = 255

      // Solder mask is semi-gloss and the weave under it moves that gloss about
      // more than it moves the colour, which is most of why a bare board reads
      // as fabric under a raking light.
      const g = (0.93 + 0.03 * w + 0.03 * m) * 255
      rd[i] = g
      rd[i + 1] = g
      rd[i + 2] = g
      rd[i + 3] = 255
    }
  }

  colour.putImageData(c, 0, 0)
  rough.putImageData(r, 0, 0)
}

/**
 * What the two passes over the board differ by.
 *
 * The layout is not recorded between them. Both passes re-seed the same
 * generator and walk the same code, so they lay the same board down twice in
 * different inks — which is cheaper than keeping the geometry and impossible to
 * get out of step.
 */
interface BoardInk {
  /** Solder mask over a copper pour: mask on copper is not mask on laminate. */
  pour: string
  trace: string
  /** Bare tinned copper, which the mask is opened over. */
  pad: string
  /** The drill through a via. */
  hole: string
  /** Moulded package plastic, which is the one thing on a board that is not flat. */
  body: string
  silk: string
}

const COLOUR_INK: BoardInk = {
  pour: maskOverCopper(0.035),
  trace: maskOverCopper(0.1),
  pad: PAD_TIN,
  hole: '#101f1b',
  body: '#14191b',
  silk: SILK_INK,
}

/**
 * The same board in gloss rather than pigment. Tin is the smoothest thing on a
 * board, silkscreen ink is the roughest, and the mask over a pour sits between.
 * Remember that these multiply the material's own roughness, so 1.0 means
 * "leave it alone" and there is no way up from there.
 */
const ROUGH_INK: BoardInk = {
  pour: '#ebebeb',
  trace: '#f0f0f0',
  pad: '#6e6e6e',
  hole: '#ffffff',
  body: '#f2f2f2',
  silk: '#ffffff',
}

/**
 * Offsets a shape has to be drawn at so that it wraps across the seam instead of
 * being cut off at it. Almost every shape returns one offset; only the few that
 * straddle an edge cost a second draw. It assumes no shape is wider than the
 * tile, which holds here: the largest pour is a little over half of it.
 */
const NO_WRAP: readonly number[] = [0]

function wrapOffsets(lo: number, hi: number, size: number): readonly number[] {
  if (lo < 0) return [0, size]
  if (hi > size) return [0, -size]
  return NO_WRAP
}

/** Draws one shape, and again at the opposite edge if it crosses one. */
function tiled(
  ctx: Ctx2D,
  n: number,
  box: readonly [number, number, number, number],
  draw: () => void,
): void {
  for (const dx of wrapOffsets(box[0], box[2], n)) {
    for (const dy of wrapOffsets(box[1], box[3], n)) {
      if (dx === 0 && dy === 0) {
        draw()
      } else {
        ctx.save()
        ctx.translate(dx, dy)
        draw()
        ctx.restore()
      }
    }
  }
}

/**
 * Reference designators, every one of them from the IC-7300 service manual by
 * way of `src/content/parts.ts`, where each is cited. They are not imported from
 * there: the content module is teaching copy with its own shape, and a texture
 * generator reaching into it to parse part strings would tie two things together
 * that have no reason to move together. If a designator here is ever found to be
 * wrong, `src/content/parts.ts` is the source that decides it.
 */
const DESIGNATORS = {
  ic: ['IC1001', 'IC1002', 'IC1003', 'IC1031', 'IC1261', 'IC1301', 'IC1331', 'IC1351', 'IC901', 'IC301', 'IC211', 'IC661'],
  q: ['Q101', 'Q111', 'Q121', 'Q131', 'Q132', 'Q221'],
  rl: ['RL801', 'RL820', 'RL821', 'RL840', 'RL841', 'RL860', 'RL861', 'RL880', 'RL881', 'RL940', 'RL941'],
  d: ['D202', 'D1051', 'D1052'],
  r: ['R351'],
} as const

/** Unit names Icom's own parts list uses for the three boards drawn in this scene. */
const UNIT_LEGENDS = ['MAIN UNIT', 'PA UNIT', 'RF UNIT'] as const

/**
 * Where a shape may go, so that two of them do not land on top of each other.
 *
 * The board was laid out by putting every feature at `rand() * n` and drawing
 * it, which puts a chip resistor across the U of MAIN UNIT about as often as
 * not — and it did: three of the assembly legends had components sitting on
 * them, which is the one thing on a board that never happens, because the
 * legend is printed in the space the placement left. Twenty tries and then give
 * up: a board that is one capacitor short is not something anybody can see, and
 * an unbounded search on a crowded board does not terminate.
 */
class Occupancy {
  private readonly boxes: number[] = []

  free(x0: number, y0: number, x1: number, y1: number): boolean {
    for (let i = 0; i < this.boxes.length; i += 4) {
      if (x0 < (this.boxes[i + 2] ?? 0) && x1 > (this.boxes[i] ?? 0) &&
          y0 < (this.boxes[i + 3] ?? 0) && y1 > (this.boxes[i + 1] ?? 0)) return false
    }
    return true
  }

  take(x0: number, y0: number, x1: number, y1: number): void {
    this.boxes.push(x0, y0, x1, y1)
  }

  /** A free spot for a `w` by `h` shape, or null. Returns the centre. */
  place(rand: () => number, n: number, w: number, h: number): [number, number] | null {
    for (let tries = 0; tries < 20; tries++) {
      const x = rand() * n
      const y = rand() * n
      if (this.free(x - w * 0.5, y - h * 0.5, x + w * 0.5, y + h * 0.5)) {
        this.take(x - w * 0.5, y - h * 0.5, x + w * 0.5, y + h * 0.5)
        return [x, y]
      }
    }
    return null
  }
}

/**
 * Nodes across the tile that copper is allowed to start and stop on.
 *
 * A board is a set of nets, and a net is copper joining two points that are
 * there. What was drawn before was a random walk from a random place in a
 * random one of eight directions, which produced long straight runs at
 * arbitrary angles that crossed the legends, passed under pads without
 * connecting to them and stopped in mid air — five of them converged on an
 * empty point with no via under it, which is the sort of thing a reader who has
 * ever seen a board notices before they notice anything else. Every run now
 * starts on a via and ends on one.
 */
const NET_GRID = 24

/** Draws a run between two points on 0, 45 and 90 degrees and nothing else. */
function routeTo(ctx: Ctx2D, x0: number, y0: number, x1: number, y1: number): void {
  const dx = x1 - x0
  const dy = y1 - y0
  const d = Math.min(Math.abs(dx), Math.abs(dy))
  // One diagonal leg taking up the shorter axis, then a straight one. Which
  // comes first is what makes a board look routed rather than fanned.
  const mx = x0 + Math.sign(dx) * d
  const my = y0 + Math.sign(dy) * d
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(mx, my)
  ctx.lineTo(x1, y1)
  ctx.stroke()
}

function drawBoard(ctx: Ctx2D, n: number, ink: BoardInk): void {
  const k = n / 1024 // every dimension below is in texels at 1024
  const rand = rng(0x1c5940)
  const busy = new Occupancy()
  ctx.lineCap = 'square'
  ctx.lineJoin = 'miter'

  // ── Copper pours. Most of a board of this kind is ground, and these are the
  // only features on it large enough to survive to a screen once the reader
  // steps back — at the distance the cutaway is actually presented from, the
  // board is four hundred pixels across and nothing finer than this is left.
  //
  // Their step down onto bare laminate is a third of what it was. Mask over
  // copper is mask over copper, not a different board: at 0.09 of the way to
  // the copper the edge of a pour was a 47-count jump in red alone, drawn as a
  // hard axis-aligned rectangle straight through whatever was under it, and it
  // was reported as a tiling seam by someone looking at a picture of it. The
  // corners are cut off as well, because a pour follows the board's features
  // and a rectangle follows nothing.
  ctx.fillStyle = ink.pour
  for (let i = 0; i < 5; i++) {
    const w = (260 + rand() * 420) * k
    const h = (200 + rand() * 330) * k
    const x = rand() * n
    const y = rand() * n
    const c = Math.min(w, h) * 0.18
    tiled(ctx, n, [x, y, x + w, y + h], () => {
      ctx.beginPath()
      ctx.moveTo(x + c, y)
      ctx.lineTo(x + w - c, y)
      ctx.lineTo(x + w, y + c)
      ctx.lineTo(x + w, y + h - c)
      ctx.lineTo(x + w - c, y + h)
      ctx.lineTo(x + c, y + h)
      ctx.lineTo(x, y + h - c)
      ctx.lineTo(x, y + c)
      ctx.closePath()
      ctx.fill()
    })
  }

  // ── The nets. Anchors on a jittered grid, each run between two of them, and
  // a via laid on every anchor a run actually used.
  const step = n / NET_GRID
  const ax = new Float32Array(NET_GRID * NET_GRID)
  const ay = new Float32Array(NET_GRID * NET_GRID)
  for (let j = 0; j < NET_GRID; j++) {
    for (let i = 0; i < NET_GRID; i++) {
      ax[j * NET_GRID + i] = (i + 0.2 + rand() * 0.6) * step
      ay[j * NET_GRID + i] = (j + 0.2 + rand() * 0.6) * step
    }
  }
  const used = new Uint8Array(NET_GRID * NET_GRID)

  ctx.strokeStyle = ink.trace
  for (let i = 0; i < 130; i++) {
    const c0 = (rand() * NET_GRID) | 0
    const r0 = (rand() * NET_GRID) | 0
    // Somewhere within a few nodes, which is how far a signal actually runs on
    // a board this dense. A trace the width of the whole unit is a bus bar.
    const c1 = c0 + ((rand() * 7) | 0) - 3
    const r1 = r0 + ((rand() * 7) | 0) - 3
    if (c1 < 0 || c1 >= NET_GRID || r1 < 0 || r1 >= NET_GRID) continue
    const a = r0 * NET_GRID + c0
    const b = r1 * NET_GRID + c1
    if (a === b) continue
    const x0 = ax[a] ?? 0
    const y0 = ay[a] ?? 0
    const x1 = ax[b] ?? 0
    const y1 = ay[b] ?? 0
    used[a] = 1
    used[b] = 1
    // Two widths: signal, and the wider runs that carry supply.
    const lw = Math.max(1, (rand() < 0.16 ? 4.4 : 1.9) * k)
    ctx.lineWidth = lw
    tiled(ctx, n, [
      Math.min(x0, x1) - lw, Math.min(y0, y1) - lw,
      Math.max(x0, x1) + lw, Math.max(y0, y1) + lw,
    ], () => routeTo(ctx, x0, y0, x1, y1))
  }

  // ── The named parts. Bodies, pads, and a designator in the mono face.
  //
  // Placed before the vias so that a via never lands under a package, and with
  // the occupancy map so that two of them never land on each other.
  const designatorPx = silkPx(9.5 * k)
  ctx.font = `${designatorPx}px ${MONO}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.letterSpacing = '0px'

  for (const kind of ['ic', 'q', 'rl', 'd', 'r'] as const) {
    for (const label of DESIGNATORS[kind]) {
      const size = FOOTPRINTS[kind]
      const w = size.w * k
      const h = size.h * k
      const spot = busy.place(rand, n, w * 1.5, h * 2.6)
      if (!spot) continue
      const x = spot[0]
      const y = spot[1]
      tiled(ctx, n, [x - w, y - h * 1.4, x + w, y + h * 1.4], () => {
        // Pads first, then the body over them, then the outline: the order a
        // board is actually built in, and it keeps the pads tucked under the
        // package the way they are on the real thing.
        ctx.fillStyle = ink.pad
        const pins = size.pins
        if (pins === 2) {
          // End-terminated, which is what a two-lead part is: the pads are at
          // the ends of the body, not above and below it.
          ctx.fillRect(x - w * 0.62, y - h * 0.3, w * 0.22, h * 0.6)
          ctx.fillRect(x + w * 0.4, y - h * 0.3, w * 0.22, h * 0.6)
        } else if (pins === 3) {
          // Three leads out of one edge: a transistor, and the two finals on
          // this radio are exactly that.
          for (let p = 0; p < 3; p++) {
            ctx.fillRect(x - w * 0.42 + p * w * 0.42 - 1.8 * k, y + h * 0.38, 3.6 * k, h * 0.3)
          }
        } else {
          for (let p = 0; p < pins; p++) {
            const px = x - w * 0.5 + (p / (pins - 1)) * w
            ctx.fillRect(px - 1.6 * k, y - h * 0.62, 3.2 * k, h * 0.22)
            ctx.fillRect(px - 1.6 * k, y + h * 0.4, 3.2 * k, h * 0.22)
          }
        }
        ctx.fillStyle = ink.body
        ctx.fillRect(x - w * 0.5, y - h * 0.44, w, h * 0.88)
        ctx.strokeStyle = ink.silk
        ctx.lineWidth = Math.max(1, 1.2 * k)
        ctx.globalAlpha = 0.72 * silkAlpha(k)
        ctx.strokeRect(x - w * 0.54, y - h * 0.5, w * 1.08, h)
        // Pin one, which is the only mark on a package that means anything.
        ctx.fillStyle = ink.silk
        ctx.beginPath()
        ctx.arc(x - w * 0.42, y - h * 0.34, 1.8 * k, 0, TAU)
        ctx.fill()
        ctx.globalAlpha = silkAlpha(k)
        ctx.fillText(label, x, y + h * 0.78)
        ctx.globalAlpha = 1
      })
    }
  }

  // ── Small passives, unnamed. Two pads and an outline, the size of an 0603.
  ctx.lineWidth = Math.max(1, 1.2 * k)
  for (let i = 0; i < 120; i++) {
    const upright = rand() < 0.5
    const w = (upright ? 7 : 16) * k
    const h = (upright ? 16 : 7) * k
    const spot = busy.place(rand, n, w * 1.6, h * 1.6)
    if (!spot) continue
    const x = spot[0]
    const y = spot[1]
    tiled(ctx, n, [x - w, y - h, x + w, y + h], () => {
      ctx.fillStyle = ink.pad
      if (upright) {
        ctx.fillRect(x - w * 0.5, y - h * 0.5, w, h * 0.34)
        ctx.fillRect(x - w * 0.5, y + h * 0.16, w, h * 0.34)
      } else {
        ctx.fillRect(x - w * 0.5, y - h * 0.5, w * 0.34, h)
        ctx.fillRect(x + w * 0.16, y - h * 0.5, w * 0.34, h)
      }
      ctx.strokeStyle = ink.silk
      ctx.globalAlpha = 0.5 * silkAlpha(k)
      ctx.strokeRect(x - w * 0.62, y - h * 0.62, w * 1.24, h * 1.24)
      ctx.globalAlpha = 1
    })
  }

  // ── Vias, on the anchors the routing actually used, so every run ends on
  // copper. A ring and the drill through the middle of it.
  for (let a = 0; a < used.length; a++) {
    if (used[a] !== 1) continue
    const x = ax[a] ?? 0
    const y = ay[a] ?? 0
    // Not all the same size: a via for a signal and a via stitching a ground
    // plane are different holes, and a field of identical white rings was the
    // highest-contrast thing on the board.
    const r = (1.8 + hash(a, 7, SEED + 33) * 1.4) * k
    tiled(ctx, n, [x - r, y - r, x + r, y + r], () => {
      ctx.fillStyle = ink.pad
      ctx.beginPath()
      ctx.arc(x, y, r, 0, TAU)
      ctx.fill()
      ctx.fillStyle = ink.hole
      ctx.beginPath()
      ctx.arc(x, y, r * 0.44, 0, TAU)
      ctx.fill()
    })
  }

  // ── The unit names, in the panel face, uppercase and tracked as the interface
  // sets its own legends. These are the names Icom's parts list uses.
  const legendPx = silkPx(17 * k)
  ctx.font = `600 ${legendPx}px ${COND}`
  ctx.letterSpacing = '0.12em'
  ctx.textAlign = 'left'
  ctx.fillStyle = ink.silk
  for (const legend of UNIT_LEGENDS) {
    const w = legend.length * legendPx * 0.66
    const spot = busy.place(rand, n, w * 1.1, legendPx * 2.4)
    if (!spot) continue
    const x = spot[0] - w * 0.5
    const y = spot[1]
    ctx.globalAlpha = 0.8 * silkAlpha(k)
    tiled(ctx, n, [x, y - legendPx, x + w, y + legendPx], () => ctx.fillText(legend, x, y))
    ctx.globalAlpha = 1
  }

  // Test points. A board is covered in them and they are always labelled.
  ctx.font = `${designatorPx}px ${MONO}`
  ctx.letterSpacing = '0px'
  ctx.textAlign = 'center'
  for (let i = 0; i < 14; i++) {
    const r = 4.2 * k
    const spot = busy.place(rand, n, r * 4, r * 6)
    if (!spot) continue
    const x = spot[0]
    const y = spot[1]
    tiled(ctx, n, [x - r * 3, y - r * 3, x + r * 3, y + r * 3], () => {
      ctx.globalAlpha = 1
      ctx.fillStyle = ink.pad
      ctx.beginPath()
      ctx.arc(x, y, r, 0, TAU)
      ctx.fill()
      ctx.fillStyle = ink.silk
      ctx.globalAlpha = 0.8 * silkAlpha(k)
      ctx.fillText('TP', x, y + r * 2.4)
      ctx.globalAlpha = 1
    })
  }
  ctx.globalAlpha = 1
}

/**
 * Silkscreen, sized and faded for the map it is being drawn into.
 *
 * The size used to carry a floor — `Math.max(6, ...)` — which did the opposite
 * of what a floor is for. At 512 the proportional size is five texels and the
 * floor forced six, so the ink came out *twenty per cent larger* than it should
 * have been on the one tier where it had already stopped resolving: measured on
 * a phone, a designator was four and a half rendered pixels tall, drawn at full
 * opacity in near-white on a dark green board, and what a reader saw was not
 * type but bright speckle.
 *
 * A legend that cannot be read should get quieter, not louder. The size is now
 * proportional all the way down and the ink fades with it, so the board at 512
 * carries the *suggestion* of printing — which is all the contract ever asked
 * silkscreen for at a distance — instead of a rash of white dots.
 */
function silkPx(px: number): number {
  return Math.max(3, Math.round(px))
}

/** How strongly the ink is laid down, against the tier it is drawn at. */
function silkAlpha(k: number): number {
  return clamp01(0.34 + 0.66 * k)
}

/** Package outlines, in texels at 1024. Sizes are of a kind, not of a part. */
const FOOTPRINTS: Readonly<Record<keyof typeof DESIGNATORS, { w: number; h: number; pins: number }>> = {
  ic: { w: 44, h: 44, pins: 8 },
  q: { w: 24, h: 30, pins: 3 },
  rl: { w: 58, h: 32, pins: 4 },
  d: { w: 18, h: 12, pins: 2 },
  r: { w: 22, h: 12, pins: 2 },
}

/**
 * Silkscreen needs the self-hosted faces, and a generator that runs at mount may
 * beat them to it.
 *
 * The choice made here is to draw immediately in whatever face is available and
 * redraw once the real ones arrive, rather than to await `document.fonts.ready`
 * and hand back a board later. Two reasons. `materials.ts` wants its maps
 * synchronously, so an await would mean either a promise in the texture API or a
 * board that pops in; and `fonts.ready` only waits for faces that something has
 * already asked for, so a weight the interface has not used yet would not be
 * covered by it at all. `load()` asks for the exact faces by name, which is the
 * only way to be sure. The cost is one extra pass over the board, once, and only
 * when the faces were not already resident — which they usually are, because the
 * interface has been drawing numbers in Chivo Mono since before the canvas
 * mounted.
 */
function scheduleFontRedraw(redraw: () => void): void {
  if (typeof document === 'undefined' || !document.fonts) return
  const wanted = [`12px ${MONO}`, `600 12px ${COND}`]
  let resident: boolean
  try {
    resident = wanted.every((f) => document.fonts.check(f))
  } catch {
    // An implementation that will not parse the shorthand tells us nothing, so
    // take the slow path rather than the fast one.
    resident = false
  }
  if (resident) return
  const at = generation
  void Promise.all(wanted.map((f) => document.fonts.load(f)))
    .then(() => {
      // The scene may have gone away while the face was in flight. Redrawing
      // into a canvas whose texture has been disposed would be harmless and
      // pointless, which is exactly the kind of thing that survives for years.
      if (at !== generation) return
      redraw()
    })
    .catch(() => undefined)
}

/* ─────────────────────────────── knurl ─────────────────────────────── */

/**
 * Fine vertical ridges for the rubber grip on the tuning dial.
 *
 * The ridges vary along u and are constant along v, which on a cylinder means
 * they run up the side and repeat around the circumference — the way a knurled
 * grip is. Because the profile depends only on x it is computed once into a row
 * of `w` values and then read; the map costs almost nothing.
 *
 * The dial is 52 mm across, so its circumference is 163 mm, and twenty-four
 * ridges to a tile at a repeat of two puts a ridge every 3.4 mm. That is a good
 * deal coarser than the knurl the radio has, and it is deliberate: see
 * `KNURL_REPEAT` for what a true pitch does at the distance this is seen from.
 *
 * `normalScale` is 0.85 here, well above the 0.6 the contract sets for paint and
 * anodising, because this is not a finish. It is moulded relief, a third of a
 * millimetre deep, and the grip is the one part of this radio a viewer has
 * probably had their hand on.
 */
export function knurl(q: TextureQuality): SurfaceMaps {
  return cached('knurl', q, () => {
    const w = q
    const h = Math.max(64, q >> 3)
    const ridges = RIDGES_PER_TILE

    // The ridge profile, once, from the same function the geometry uses.
    const profile = new Float32Array(w)
    for (let x = 0; x < w; x++) profile[x] = knurlProfile((x / w) * ridges)

    // Slow across the ridges — a node every texel and a half of ridge pitch, so
    // neighbours differ from each other rather than one ridge being bent — and
    // moderate along them, because a moulded ridge is not the same height all
    // the way up.
    const wobble = field(w, h, 16, 8, 2, SEED + 42)
    const relief = new Float32Array(w * h)
    for (let y = 0; y < h; y++) {
      const row = y * w
      for (let x = 0; x < w; x++) {
        const grain = hash(x, y, SEED + 43) - 0.5
        relief[row + x] = clamp01((profile[x] ?? 0) * (0.9 + 0.2 * fieldAt(wobble, x, y)) + 0.05 * grain)
      }
    }

    const normal = imageTexture(normalsFrom(relief, w, h, 3.2), { repeat: KNURL_REPEAT, anisotropy: 8 })
    // Rubber is almost entirely diffuse. What gloss there is sits on the crests,
    // where a thumb has been.
    const rough = imageTexture(greyFrom(relief, w, h, 1.0, 0.84), { repeat: KNURL_REPEAT, anisotropy: 8 })
    // The one place in this library where an AO map is honest: the valleys
    // between the ridges genuinely occlude, and nothing else here has a crevice.
    const ao = imageTexture(greyFrom(relief, w, h, 0.62, 1.0), { repeat: KNURL_REPEAT, anisotropy: 4 })

    const out: SurfaceMaps = { normalScale: 0.85 }
    if (normal) out.normalMap = normal
    if (rough) out.roughnessMap = rough
    if (ao) out.aoMap = ao
    return out
  })
}

/**
 * Ridges in one tile of the map, and tiles around one wrap of u.
 *
 * Four tiles put ninety-six ridges around the dial's 163 mm circumference, a
 * ridge every 1.7 mm — and at the distance the exterior camera stands off, that
 * is a ridge every *seven tenths of a screen pixel*. A relief at less than one
 * sample per feature is not a relief, it is a moiré pattern, and that is what
 * the rim of the dial was: a buzzing plaid that would crawl the moment the model
 * turned. Two tiles is forty-eight ridges at 3.4 mm, which is coarser than the
 * real grip and is the pitch at which this can be drawn honestly.
 */
const RIDGES_PER_TILE = 24
const KNURL_REPEAT = [2, 1] as const

/** Ridges around a full wrap of u, which is what a cylinder needs to match. */
export const KNURL_RIBS = RIDGES_PER_TILE * KNURL_REPEAT[0]

/**
 * The height of the grip's relief at `t` ridges along, 0 at the valley floor and
 * 1 at a crest.
 *
 * Exported because the ribs are geometry as well as texture. A normal map alone
 * leaves the silhouette of the dial perfectly smooth, which is what gives away
 * that the knurl is painted on; `FrontPanel.tsx` builds the grip cylinder by
 * displacing it with this, at `KNURL_RIBS` around, so the two are the same
 * pattern at the same phase and add. Two reliefs of one pattern at different
 * pitches would beat instead, which is the failure this is written to avoid.
 *
 * A smoothed triangle rather than a sine: a moulded ridge has a rounded crest
 * and a tighter valley, and a sine has neither. No two ridges off a mould are
 * the same height either, and the eye finds a perfectly regular one immediately.
 */
export function knurlProfile(t: number): number {
  const index = Math.floor(t)
  const f = t - index
  const tri = 1 - Math.abs(f * 2 - 1)
  const rounded = tri * tri * (3 - 2 * tri)
  return rounded * (0.86 + 0.14 * hash(index, 0, SEED + 41))
}

/* ───────────────────────────── tftPixels ───────────────────────────── */

/**
 * Cells across the 4.3 inch panel, and cells held in one tile of the map.
 *
 * The IC-7300's display is 95 x 53 mm. A panel of that size and vintage is
 * around 480 x 272, and this draws half of that, which needs saying plainly
 * because it is a departure from the object. The camera stops at 0.16 m, where
 * the panel spans about 830 screen pixels; a true 480-wide grid would put each
 * display pixel under 1.7 screen pixels and each of its three subpixel stripes
 * under 0.6 of one, so the structure this generator exists to show could never
 * be seen at all. At 240 cells across, a cell is three and a half screen pixels
 * at the stop and a stripe is over one, which still resolves. At exterior
 * distance the panel is eighty pixels wide, the mip chain has long since
 * averaged the stripes away, and it is a flat cyan glow — which is the other
 * half of the requirement.
 *
 * It was 160, and 160 was too coarse to live under the type drawn on the same
 * surface. The frequency is set in a 34-pixel face on a 512-pixel canvas, so a
 * numeral's stroke is a little under a millimetre of panel; at 160 cells a
 * stripe was a third of that, and every digit came out chopped into red and
 * green bars with hard fringes down their edges. A subpixel is supposed to be
 * *under* the smallest thing drawn on it. The other half of that fix is the
 * strength the mask is felt at, which belongs to whoever mounts it: see
 * `SUBPIXEL` in `radio/FrontPanel.tsx`.
 *
 * The repeat below is written for a plane whose UVs run 0..1 across
 * `RADIO.screen`. The cell grid divides the map exactly, so the pattern is
 * continuous across the wrap and a fractional repeat has no seam in it.
 */
const PANEL_CELLS_X = 240
const PANEL_CELLS_Y = 135
const CELLS_PER_TILE = 32

/**
 * RGB subpixel stripes for the display, meant to be multiplied over an emissive
 * colour.
 *
 * Authored in linear light and encoded to sRGB on the way out, because the
 * multiply this mask exists for happens in linear space and because the GPU's
 * own filtering of an sRGB texture is done there too. That is what lets the
 * stripes average into an honest flat glow instead of a dark one as the mip
 * levels go by.
 *
 * The mask cannot brighten, only cut, so it darkens the panel. The exact mean is
 * measured while it is generated and left on `texture.userData.meanLinear` so
 * that nobody has to guess it: divide the emissive intensity by that number and
 * the panel comes out at the brightness it was set to. It lands near 0.35, which
 * is not a defect — a screen under a loupe is mostly black matrix, and a cyan
 * trace lights one stripe in three hard and leaves the others nearly out. That
 * is exactly why it reads as a display when you push in.
 */
export function tftPixels(q: TextureQuality): THREE.Texture {
  const key = `tftPixels:${q}`
  const hit = singles.get(key)
  if (hit) return hit

  const built = buildTftPixels(q) ?? fallbackWhite()
  singles.set(key, built)
  return built
}

function buildTftPixels(q: TextureQuality): THREE.Texture | null {
  if (!canDraw()) return null
  // Capped, like the grain maps and for the same kind of reason: at 1024 a cell
  // is 32 texels, which is ten to a subpixel stripe, and a stripe that is three
  // flat values and two short ramps has no use for ten.
  const n = Math.min(q, 1024)
  const cell = Math.max(4, n / CELLS_PER_TILE)
  const mask = cell - 1

  // Both gaps are counted at each end of their own span, so the black between
  // two neighbours is twice the figure: a fifth of a stripe across, and a
  // seventh of a cell down. Wider than that and the panel loses more light than
  // a panel does; narrower and the structure stops reading as pixels at all.
  const stripeGap = 0.1
  const rowGap = 0.07
  /**
   * How much of a subpixel's light leaks into the other two channels.
   *
   * Up from 0.14. Colour fringing on the edge of a stroke is the thing that
   * reads as a broken panel rather than as a display, and a real one leaks a
   * good deal more than a quarter between neighbouring stripes once the
   * diffuser and the cover glass have had their turn. This keeps the stripe
   * structure and takes most of the red-and-green off the type.
   */
  const bleed = 0.26

  // The profile across one cell, once. Everything below is a table read.
  const stripeOf = new Uint8Array(cell)
  const acrossCell = new Float32Array(cell)
  const downCell = new Float32Array(cell)
  for (let i = 0; i < cell; i++) {
    const u = (i + 0.5) / cell
    const s = Math.min(2, Math.floor(u * 3))
    stripeOf[i] = s
    acrossCell[i] = edgeRamp(u * 3 - s, stripeGap)
    downCell[i] = edgeRamp((i + 0.5) / cell, rowGap)
  }

  // Real panels are not perfectly even. Two per cent of slow variation is below
  // the threshold of noticing on its own and above the threshold of the screen
  // looking like a rectangle of paint.
  const mura = field(n, n, 8, 8, 1, SEED + 51)

  const srgb = srgbTable()
  const img = new ImageData(n, n)
  const d = img.data
  let sum = 0
  for (let y = 0; y < n; y++) {
    const rowLevel = downCell[y & mask] ?? 0
    const row = y * n
    for (let x = 0; x < n; x++) {
      // The mura factor stays at or below one so that every value below is
      // already in range and the table can be indexed without a clamp.
      const level = rowLevel * (acrossCell[x & mask] ?? 0) * (0.96 + 0.04 * fieldAt(mura, x, y))
      const lit = stripeOf[x & mask] ?? 0
      const i = (row + x) * 4
      const r = lit === 0 ? level : level * bleed
      const g = lit === 1 ? level : level * bleed
      const b = lit === 2 ? level : level * bleed
      d[i] = srgb[(r * SRGB_MAX) | 0] ?? 0
      d[i + 1] = srgb[(g * SRGB_MAX) | 0] ?? 0
      d[i + 2] = srgb[(b * SRGB_MAX) | 0] ?? 0
      d[i + 3] = 255
      sum += r + g + b
    }
  }

  const t = imageTexture(img, {
    srgb: true,
    repeat: [PANEL_CELLS_X / CELLS_PER_TILE, PANEL_CELLS_Y / CELLS_PER_TILE],
    // The panel is seen from the side more often than face on, and a stripe
    // pattern at a grazing angle is the worst case there is for a mip chain.
    anisotropy: 16,
  })
  if (!t) return null
  t.userData.meanLinear = sum / (n * n * 3)
  return t
}

/** A trapezoid across 0..1 with a soft edge of width `gap` at each end. */
function edgeRamp(t: number, gap: number): number {
  if (gap <= 0) return 1
  const a = clamp01(t / gap)
  const b = clamp01((1 - t) / gap)
  const e = Math.min(a, b)
  return e * e * (3 - 2 * e)
}

/**
 * What the display falls back to with no 2D canvas: a white texel, which
 * multiplies to nothing and leaves the emissive colour exactly as it was. The
 * screen then looks the way it does from across the room, which is the right
 * thing for it to degrade to.
 */
function fallbackWhite(): THREE.Texture {
  const t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
  t.colorSpace = THREE.SRGBColorSpace
  t.needsUpdate = true
  t.userData.meanLinear = 1
  created.push(t)
  return t
}

/* ─────────────────────────────── jacket ────────────────────────────── */

/**
 * The extrusion ripples that run along a PVC coax jacket.
 *
 * Ripples on a jacket run the length of the cable, so in texture space the
 * profile varies along **v** and is all but constant along **u** — the
 * `TubeGeometry` convention, where u follows the path and v goes around the
 * circumference. That is why the map is narrow and tall: there is nothing along
 * u worth spending texels on but the slow drag of the die, and the repeat puts
 * sixteen of those along the run.
 *
 * Note for whoever fits this: `fx/Feedline.tsx` builds its own tube and
 * allocates a `uv` attribute it never writes, so every vertex currently samples
 * the same texel. The UVs have to be filled — u from the segment index, v from
 * the radial index — before any of this shows up on the coax.
 */
export function jacket(q: TextureQuality): SurfaceMaps {
  return cached('jacket', q, () => {
    const w = Math.max(64, q >> 3)
    const h = q
    const ripples = 26

    const profile = new Float32Array(h)
    for (let y = 0; y < h; y++) {
      const t = (y / h) * ripples
      const f = t - Math.floor(t)
      // A rolled ripple, not a machined one: sinusoidal, with each one a little
      // shallower or deeper than the last.
      const depth = 0.82 + 0.18 * hash(Math.floor(t), 3, SEED + 61)
      profile[y] = (0.5 - 0.5 * Math.cos(f * TAU)) * depth
    }

    // Slow along the run and quicker around the circumference: this is the drag
    // of the die, which varies over tens of millimetres of cable and over a few
    // ripples at a time, not the other way round.
    const drag = field(w, h, 4, 32, 2, SEED + 62)
    const relief = new Float32Array(w * h)
    for (let y = 0; y < h; y++) {
      const row = y * w
      const p = profile[y] ?? 0
      for (let x = 0; x < w; x++) {
        const grain = hash(x, y, SEED + 63) - 0.5
        relief[row + x] = clamp01(p * (0.78 + 0.22 * fieldAt(drag, x, y)) + 0.05 * grain)
      }
    }

    const normal = imageTexture(normalsFrom(relief, w, h, 2.2), { repeat: JACKET_REPEAT, anisotropy: 8 })
    // PVC is matte, with a little more sheen on the crests where the die
    // polished it and the cable has been dragged across a bench.
    const rough = imageTexture(greyFrom(relief, w, h, 1.0, 0.86), { repeat: JACKET_REPEAT, anisotropy: 8 })

    const out: SurfaceMaps = { normalScale: 0.5 }
    if (normal) out.normalMap = normal
    if (rough) out.roughnessMap = rough
    return out
  })
}

const JACKET_REPEAT = [16, 1] as const

/* ────────────────────────────── disposal ───────────────────────────── */

/**
 * Frees every generated texture. Called when the canvas unmounts.
 *
 * Also drops the noise lattices, which are a megabyte or so of Float32Array that
 * nothing will ask for again, resets the quality so a new renderer gets to
 * choose for itself, and moves the generation on so that a font still in flight
 * cannot redraw into a canvas whose texture has gone.
 */
export function disposeTextures(): void {
  generation++
  for (const t of created) t.dispose()
  created.length = 0
  mapSets.clear()
  singles.clear()
  lattices.clear()
  quality = null
}

