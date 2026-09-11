/**
 * Antinode — shared materials.
 *
 * Every surface in the scene is generated in the browser. Nothing is
 * downloaded: the container renders with no network at all, and
 * `e2e/offline.spec.ts` asserts that it makes no outside request.
 *
 * This header used to say that a surface was a colour, a metalness and a
 * roughness, and that an anodised panel was only a roughness value anyway. That
 * was true of the code and wrong about the radio. Flat parameters look like
 * flat parameters: a die-casting, a moulded knob, a glass-epoxy board and a
 * painted bench all came out as the same piece of grey plastic, and which
 * material a part is made of is half of what this application is trying to
 * teach. The assets are still not fetched. They are drawn.
 *
 * So each role now also carries a grain, generated at boot by `./textures.ts`
 * from one seeded noise basis. That module draws; this one decides which grain
 * belongs to which role, how densely it sits on a surface of that size, and how
 * hard it is felt. The palette, the generator list and the rules they keep are
 * in `docs/SURFACES.md`.
 *
 * Materials are created once and reused. Creating one per frame would leak
 * shader programs until the tab died. The same is true of textures, only worse,
 * which is why every map below is a shared cached one and why nothing here is
 * built inside a frame callback.
 */

import * as THREE from 'three'
import { brushedAnodise, castPaint, fr4, jacket, knurl, textureQuality } from './textures'
import type { SurfaceMaps, TextureQuality } from './textures'

export type MaterialRole =
  | 'anodised' | 'chassis' | 'pcb' | 'copper' | 'solder-mask' | 'plastic-knob'
  | 'rubber' | 'grip' | 'screen' | 'ferrite' | 'silver' | 'heatsink' | 'wire'
  | 'bench' | 'plinth' | 'earth' | 'insulator' | 'coax' | 'device' | 'relay'

/** The heat ramp, duplicated from tokens.css because GLSL cannot read CSS. */
export const HEAT_RAMP: readonly THREE.Color[] = [
  new THREE.Color('#3a4a4e'),
  new THREE.Color('#f2b441'),
  new THREE.Color('#e2622a'),
  new THREE.Color('#c0202b'),
]

export const PHOSPHOR = new THREE.Color('#5fd2e8')
export const PANEL = new THREE.Color('#141a1c')

/**
 * The surface palette from docs/SURFACES.md, measured off the real radio rather
 * than invented. The six roles the table names take these directly; the rest are
 * mixed from them, because a scene whose colours all come from one short list is
 * what makes a procedural set of surfaces look like one object rather than
 * nineteen unrelated ones.
 */
const CAST_GRAPHITE = '#2e353a'
const PANEL_SLATE = '#39424a'
const ANODISE_STEEL = '#5a656d'
const FR4_FOREST = '#1c5940'
const HASL_TIN = '#c3ccd2'
const COPPER_TRACE = '#b4703c'

/**
 * The generators, under the names this file uses for them. `bare` is a real
 * choice and not an oversight: see `screen`.
 */
const GENERATORS = {
  paint: castPaint,
  anodise: brushedAnodise,
  fr4,
  knurl,
  jacket,
} as const satisfies Record<string, (q: TextureQuality) => SurfaceMaps>

type Grain = keyof typeof GENERATORS | 'bare'

/**
 * The grains whose `map` is a finished albedo, and the palette colour it was
 * drawn around.
 *
 * docs/SURFACES.md locks the signatures but not the convention inside them, and
 * there are two of them in this library. Most generators return no colour map at
 * all: they are grain, and the role's palette colour is the surface. `fr4()` is
 * the exception — it draws mask, copper, tinned pads and silkscreen, so its map
 * carries pigment, and several pigments at that.
 *
 * The two have to be told apart, because a role colour cannot simply multiply an
 * albedo that already has colour in it. Measuring what the board averages to and
 * dividing the role colour by that — which is what this did while the two
 * modules were being written in parallel and neither could see the other — lands
 * the board's *mean* on the palette and wrecks everything either side of it. The
 * board reads brighter than bare laminate because of the pads and the silk, and
 * it reads greener, so the per-channel correction is a heavy cut on red and
 * almost none on green: the tinned pads come out pale green and the copper comes
 * out olive. The measurement was right about the risk and wrong about the
 * remedy.
 *
 * So a pigmented grain is tinted relative to the colour it was authored in
 * instead. Both roles that carry this map are now that colour exactly, so both
 * come out at 1.0 and the map is used as drawn. A role that wanted a different
 * laminate would come out as a uniform scale, moving every ink on the board
 * together rather than pulling them apart — which is the property that matters
 * here and the one the old measured correction did not have.
 */
const PIGMENT: Partial<Record<Grain, string>> = {
  fr4: FR4_FOREST,
}

interface Spec {
  color: string
  metalness: number
  roughness: number
  grain: Grain
  /**
   * Multiplies the generator's own repeat.
   *
   * A generator has no idea how big the thing it is about to cover is, and the
   * span here is enormous: the bench is 3.4 m across and a shield can is 20 mm.
   * Left alone, one repeat setting is either a smear on the worktop or an
   * aliasing mess on the capacitors. The baseline of 1 is a surface about the
   * size of the radio's case, 0.24 m, which is what the generators are tuned
   * for, and everything else is scaled from its own real size so the grain
   * stays roughly constant in world terms. That is what makes two parts read as
   * the same material rather than as the same picture.
   */
  density?: number
  /** Weight on the generator's own suggested normalScale. */
  normal?: number
}

const SPECS: Record<MaterialRole, Spec> = {
  // The case. Both are the same die-casting with the same finish on it; the
  // bezel is lighter because it is a separate moulding and catches the front
  // rim light, which is the only thing separating the panel from the lid.
  //
  // Both were metals here — 0.62 and 0.5 — which they are not. This is paint on
  // a casting and a moulding beside it, and paint is a dielectric whatever it is
  // painted on. It did not show while the rig was a flat ambient, because
  // ambient light has no direction to reflect. Under a key and a room it did:
  // metalness halves the diffuse term, which is the part carrying the palette
  // colour, and leaves the specular sheen alone, so the lid read as bare
  // aluminium and the shadowed flank went black. Measured on the exterior view,
  // dropping them took the right flank from sRGB 15 to 23 before the lights were
  // touched at all. What is left is the little that a metallic flake finish
  // genuinely does.
  //
  // Both are rougher than they were as well, the casting by a good deal. These
  // are the two faces the exterior camera sees almost edge on, where a smooth
  // finish returns a sheen instead of a colour; the number that reads as
  // textured paint under a lamp is nearer three quarters than a half.
  anodised: { color: PANEL_SLATE, metalness: 0.15, roughness: 0.5, grain: 'paint', normal: 0.9 },
  /*
    Painted die-cast aluminium. The paint is what you see, and paint is a
    dielectric — the casting under it never reaches the surface.

    Measured with the albedo forced to black, the lid still rendered at 48 of its
    eventual 84: three fifths of a dark grey casting's brightness was sheen off
    five light shapes, which is why #2e353a was reading as bare metal. Metalness
    down to a dielectric's, roughness up to a matte finish's, and the diffuse
    term — the part that carries the colour — is what is left.
  */
  chassis: { color: CAST_GRAPHITE, metalness: 0.04, roughness: 0.88, grain: 'paint' },

  // Extruded aluminium, which has the drawing direction in it. The whole point
  // of the heatsink in this model is that the reader can see it is metal and
  // understand where the heat goes, so it gets the anodised brushing at close
  // to full strength.
  //
  // The grain is up and the gloss is down. At 0.35 roughness and half density
  // the extrusion read as grey card: a smooth mid-grey with no direction in it,
  // which is the one thing a drawn aluminium section always has. Anodising is a
  // matte oxide, not a polish, and the marks run along the draw.
  heatsink: { color: ANODISE_STEEL, metalness: 0.7, roughness: 0.5, grain: 'anodise', density: 1.4, normal: 1.8 },
  // Tin-plated stampings: shield cans, connector bodies, the scale bar. Small
  // parts, so a fine density, and a light touch on the normal because on a
  // surface this metallic the grain shows in the reflection long before it
  // shows in the relief.
  // Rougher than it was: at 0.22 a tin-plated stamping is a mirror, and the
  // smallest of them — a connector shell, a pad — returned the room whole and
  // clipped to white. Plating is a matte metal.
  silver: { color: HASL_TIN, metalness: 0.95, roughness: 0.34, grain: 'anodise', density: 0.4, normal: 0.7 },
  // The diorama base is machined stock, and it is a metre wide.
  // The diorama base is machined stock, and it is a metre wide. Taken down in
  // value and up in roughness: it was brighter than the radio's own front panel
  // and the brightest thing in the station view, which put the eye on a blank
  // slab instead of on the thing standing on it. A plinth is furniture.
  plinth: { color: '#2a3237', metalness: 0.16, roughness: 0.72, grain: 'anodise', density: 6, normal: 0.85 },

  // Glass-epoxy. `pcb` is the board and `solder-mask` is the mask layer sitting
  // a fifth of a millimetre proud of it in Radio.tsx; they are the same laminate
  // seen through different amounts of coating, so they share the grain and
  // differ only in how wet the mask looks.
  //
  // Rougher than they were, both of them. Solder mask is semi-gloss, not gloss,
  // and at 0.68 the board picked up so much neutral specular from the room that
  // a laminate measured at 68 per cent saturation rendered at 36: pale sage,
  // the colour of painted card. Roughness is the only control that takes a
  // white sheen off a coloured surface without touching the pigment.
  //
  // And they are now the *same* colour. They were '#1c5940' and '#23624b', two
  // greens a stop apart carrying the same map, on two meshes a fifth of a
  // millimetre apart — so every place the upper one ended drew a hard-edged
  // rectangle of a different green across the board, cutting through pads and
  // traces with no relation to anything on it. That was read, reasonably, as a
  // tiling seam. They are one laminate under different amounts of coating, so
  // what should differ between them is the gloss and nothing else.
  pcb: { color: FR4_FOREST, metalness: 0.05, roughness: 0.8, grain: 'fr4' },
  'solder-mask': { color: FR4_FOREST, metalness: 0.06, roughness: 0.72, grain: 'fr4', normal: 0.8 },

  // Moulded ABS: knob bodies, knob faces, key caps.
  //
  // This carried the knurl, on the argument that a grip pattern shrunk onto a
  // key top reads as the moulded texture of a key top. It does not, and the
  // reason is not the scale but the shape of the map: `knurl()` is a relief
  // that varies along u and is constant along v, which is a *ridge*, and a
  // ridge only means anything wrapped around something. A cylinder's end cap
  // takes a planar UV projection, so every flat face in this radio that used
  // this role — both knob faces, the dial's own face, fourteen key tops — came
  // out combed with parallel stripes. The main tuning dial looked upholstered.
  //
  // A moulded face is the casting grain at a fine density, which is what a
  // spark-eroded mould tool leaves, and the knurl has moved to the one surface
  // that is genuinely knurled. See 'grip'.
  'plastic-knob': { color: '#23292c', metalness: 0.12, roughness: 0.52, grain: 'paint', density: 0.3, normal: 0.85 },
  // The rubber sleeve over the tuning dial, and the only knurled thing in the
  // scene. The normal is held well down because the ribs are now real geometry
  // — FrontPanel.tsx builds the cylinder from the same profile at the same
  // pitch — and this map is only there to round their crests and break the
  // gloss along them. Two reliefs of the same pattern at the same phase add;
  // at different pitches they would beat, which is what the moiré on the rim
  // was.
  grip: { color: '#151a1c', metalness: 0, roughness: 0.92, grain: 'knurl', normal: 0.45 },
  // The feet. Rubber, but not a grip: a moulded part, so it takes the casting
  // grain at a fine density rather than the knurl. The grip ring on the dial is
  // the role above.
  rubber: { color: '#0e1112', metalness: 0, roughness: 0.95, grain: 'paint', density: 0.3, normal: 0.9 },

  // Extruded PVC over braid, and the wire the aerial is actually made of. Both
  // are drawn down a die and both show it along their length.
  coax: { color: '#101314', metalness: 0.15, roughness: 0.72, grain: 'jacket' },
  wire: { color: '#c08a55', metalness: 0.8, roughness: 0.38, grain: 'jacket', density: 0.6, normal: 0.8 },

  // Etched foil and drawn copper: traces, the ATU roller inductor, the ground
  // radials. Drawn wire carries the same longitudinal grain the anodising does,
  // at a fraction of the depth.
  // Rougher than it was for the same reason as the plating: at 0.36 the toroids
  // and the ATU roller came back with one broad blown highlight each and read
  // as varnished sweets. Enamelled winding wire is a soft sheen.
  copper: { color: COPPER_TRACE, metalness: 0.9, roughness: 0.52, grain: 'anodise', density: 0.5, normal: 0.6 },

  // The display belongs to FrontPanel.tsx, which builds it from tftPixels() with
  // a glass layer over the top. This is only the dark glass it shows through
  // when the radio is off. Two authors dressing one material is how a surface
  // ends up with neither treatment, so this one takes no grain on purpose.
  screen: { color: '#08222a', metalness: 0.1, roughness: 0.22, grain: 'bare' },

  // Sintered ferrite is a gritty matte ceramic and nothing else in the scene
  // looks like it, which is exactly why the cores are worth texturing: a reader
  // who can tell the toroids from the capacitors can follow the filter. The
  // hue was warm enough that the filter bank read as a chocolate-brown
  // extrusion and was taken for the PA heatsink; ferrite is neutral and nearly
  // black.
  ferrite: { color: '#1f2122', metalness: 0.2, roughness: 0.82, grain: 'paint', density: 0.35, normal: 1.1 },
  // Moulded black plastic: IC packages, the fan, the speaker, the DC jack.
  device: { color: '#14181a', metalness: 0.25, roughness: 0.55, grain: 'paint', density: 0.4, normal: 0.6 },
  // Sealed relay cans. Glossier than a device package and the same moulding.
  relay: { color: '#0f1416', metalness: 0.1, roughness: 0.6, grain: 'paint', density: 0.35, normal: 0.6 },
  // Glazed ceramic egg insulators and the ladder-line spacers: a mould finish
  // under a glaze, so the grain is there but almost flat.
  insulator: { color: '#e4e0d4', metalness: 0, roughness: 0.55, grain: 'paint', density: 0.35, normal: 0.5 },

  // The worktop, and soil under the antenna. Neither is paint, but the casting
  // grain is the right vocabulary for both — a matte surface with structure in
  // it — and the density is what makes one read as a bench and the other as
  // ground.
  bench: { color: '#262d30', metalness: 0.1, roughness: 0.85, grain: 'paint', density: 12, normal: 0.7 },
  earth: { color: '#403d2e', metalness: 0.02, roughness: 0.95, grain: 'paint', density: 2.5, normal: 1.15 },
}

/**
 * Which size of map the generators are asked for.
 *
 * Texture quality comes from the renderer's own limits, and `mat()` has no
 * renderer: it is called from the middle of a component tree, by a module that
 * has no business knowing a canvas exists. So the renderer is handed in once,
 * by the first child inside the `<Canvas>` — see `initMaterials`, which says why
 * it is not the `onCreated` callback it looks as though it should be.
 *
 * The default covers the case where it never arrives at all. 1024 is the middle
 * of the three: a phone that missed the call pays for a map with four times the
 * texels it needed, a desktop loses some fineness, and neither of them gets a
 * black screen, which is what depending on the renderer would risk.
 */
let quality: TextureQuality = 1024

/**
 * Hand the materials the renderer, once, and draw the whole texture library.
 *
 * Generating lazily, on the first `mat()` that wants a board, would put a few
 * hundred milliseconds of canvas work in the frame where the reader opens the
 * cutaway — a stall exactly where the application is asking them to look. Doing
 * it up front costs the same time during the opening camera move, before there
 * is anything to stutter.
 *
 * **Not from `onCreated`, which is where it was first called and is too late.**
 * react-three-fiber fires that from a layout effect on the provider *wrapping*
 * the scene, and layout effects run children first: by the time it arrives every
 * component in the tree has already rendered and every material it asked for
 * exists. On a laptop nothing shows, because the default below happens to be the
 * answer; on a phone or a large desktop the library is generated twice, once at
 * 1024 for the tree and again at the real size, and the materials a part owns
 * keep the first set for ever. It has to be called during the render of the
 * first child inside the `<Canvas>` instead, which is the earliest moment a
 * renderer exists and the latest one that still precedes every `mat()`.
 *
 * Safe to call twice: React's StrictMode mounts everything twice in
 * development, and a second call at the same quality is a no-op.
 */
export function initMaterials(gl: THREE.WebGLRenderer): void {
  const q = textureQuality(gl)
  if (q === quality && grains.size > 0) return
  quality = q
  grains.clear()
  // Rule 5 of docs/SURFACES.md: the library has 250 ms at 1024 and the number is
  // to be measured rather than assumed. A mark and a measure cost nothing, do
  // not depend on a build flag, and mean the figure is readable off a real
  // device — `performance.getEntriesByName('antinode:surfaces')` — instead of
  // being a claim in a comment.
  const t0 = now()
  for (const grain of Object.keys(GENERATORS) as (keyof typeof GENERATORS)[]) grainOf(grain)
  record(t0)
  // Anything already handed out is re-dressed in place, because other modules
  // are holding these exact objects. The old maps are deliberately not disposed
  // here: a material built before this ran may still be pointing at them, and a
  // disposed texture reads back as black. They are released with the rest at
  // unmount, and this only ever happens once.
  for (const [role, material] of cache) {
    material.setValues(paramsFor(role))
    // A material that gains a map it did not have before needs its shader
    // rebuilt, and three only notices that when the version moves.
    material.needsUpdate = true
  }
}

function now(): number {
  return typeof performance === 'undefined' ? 0 : performance.now()
}

/** Leaves the generation time where a browser's own tooling will show it. */
function record(t0: number): void {
  if (typeof performance === 'undefined' || typeof performance.measure !== 'function') return
  try {
    performance.measure('antinode:surfaces', { start: t0, end: performance.now() })
  } catch {
    // An implementation without the options form of measure(). The library is
    // built either way; only the timing is lost.
  }
}

/**
 * The generated set for one grain, memoised.
 *
 * This used to hold two measurements alongside the maps — the mean of the colour
 * map and the mean of the roughness map — taken by drawing each one down to
 * eight squares and reading it back. They were insurance written while this file
 * and `./textures.ts` were being built in parallel and neither author could see
 * what convention the other had chosen inside the locked signatures.
 *
 * Both are gone, because measuring them cost far more than either was worth. On
 * the machine this was profiled on, generating the entire library took 299 ms
 * and measuring it took 1,667 ms: a 1024-square canvas resampled to 8x8 is a
 * multi-pass filter, and the first one also pays for bringing up the 2D
 * rasteriser. Eighty-five per cent of the application's whole surface budget was
 * being spent on two numbers, one of which was actively wrong — see `PIGMENT`
 * for what dividing by a measured mean did to the board — and the other of which
 * the generator that produced the map had already stated in prose: the grey maps
 * in `textures.ts` are written to sit near the top of the range so that the
 * table's roughness is the *rough* end of the surface and the map only ever
 * takes gloss away where the finish is raised or worn. Re-centring a surface on
 * the mean of its own map contradicts that by about a tenth, in the direction of
 * making everything glossier than it was specified to be.
 *
 * The conventions are now known rather than measured, and both live in one place
 * each: `PIGMENT` for which maps carry colour, and this comment for what the
 * roughness table means. A generator that changes either has to say so here.
 */
const grains = new Map<Grain, SurfaceMaps>()

function grainOf(grain: Grain): SurfaceMaps | null {
  if (grain === 'bare') return null
  const hit = grains.get(grain)
  if (hit) return hit
  const maps = GENERATORS[grain](quality)
  grains.set(grain, maps)
  return maps
}

/**
 * Textures cloned to sit at a different density. A clone shares its `Source`
 * with the original, so the pixels are uploaded to the GPU once however many
 * roles ask for them; only the repeat is its own. Keyed so that two roles at the
 * same density share one clone as well.
 */
const derived = new Map<string, THREE.Texture>()

function atDensity(tex: THREE.Texture, k: number): THREE.Texture {
  if (k === 1) return tex
  const key = `${tex.uuid}@${k}`
  const hit = derived.get(key)
  if (hit) return hit
  const clone = tex.clone()
  clone.repeat.set(tex.repeat.x * k, tex.repeat.y * k)
  clone.needsUpdate = true
  derived.set(key, clone)
  return clone
}

function paramsFor(role: MaterialRole): THREE.MeshStandardMaterialParameters {
  const spec = SPECS[role]
  const colour = new THREE.Color(spec.color)
  const params: THREE.MeshStandardMaterialParameters = {
    color: colour,
    metalness: spec.metalness,
    roughness: spec.roughness,
  }

  const maps = grainOf(spec.grain)
  if (!maps) return params

  const k = spec.density ?? 1
  if (maps.map) params.map = atDensity(maps.map, k)
  if (maps.roughnessMap) params.roughnessMap = atDensity(maps.roughnessMap, k)
  if (maps.aoMap) {
    // Since three moved to per-texture UV channels an aoMap reads the first UV
    // set by default, so the plain box and cylinder geometries this scene is
    // built from work without a second set. The old uv2 requirement is the trap
    // a reader will expect here; it is gone.
    params.aoMap = atDensity(maps.aoMap, k)
    params.aoMapIntensity = 0.85
  }
  if (maps.normalMap) {
    params.normalMap = atDensity(maps.normalMap, k)
    let n = (maps.normalScale ?? 0.45) * (spec.normal ?? 1)
    // Rule 4 of the contract: paint and anodising stay at or under 0.6. A panel
    // that reads as hammered metal from across the room is worse than a flat
    // one, and this is the side of the boundary that can enforce it.
    if (spec.grain === 'paint' || spec.grain === 'anodise') n = Math.min(0.6, n)
    params.normalScale = new THREE.Vector2(n, n)
  }

  const pigment = PIGMENT[spec.grain]
  if (pigment) {
    // A finished albedo: the role colour becomes a scale on the colour the map
    // was drawn in, so every ink on it keeps its own hue.
    const base = new THREE.Color(pigment)
    colour.setRGB(tint(colour.r, base.r), tint(colour.g, base.g), tint(colour.b, base.b))
  }
  return params
}

/**
 * The wanted value over the one the map was drawn in, within reason. A tint above
 * one is legitimate — it is an albedo scale, not a colour — but a nearly black
 * reference must not be allowed to blow the surface out to compensate.
 */
function tint(want: number, mean: number): number {
  return Math.min(4, want / Math.max(mean, 0.02))
}

const cache = new Map<MaterialRole, THREE.MeshStandardMaterial>()

export function mat(role: MaterialRole): THREE.MeshStandardMaterial {
  const hit = cache.get(role)
  if (hit) return hit
  const m = new THREE.MeshStandardMaterial(paramsFor(role))
  cache.set(role, m)
  return m
}

/**
 * A material a single part owns, so it can glow when selected or shift along the
 * heat ramp without dragging every other part of the same role with it.
 *
 * It shares the maps with its siblings on purpose. A generated texture is
 * immutable here and uploaded once; what a part needs its own copy of is the
 * colour and the emissive, which are material state, not surface state.
 */
export function ownMaterial(role: MaterialRole): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial(paramsFor(role))
}

const scratch = new THREE.Color()

/** 0..1 to a colour on the project's heat ramp. Allocation free. */
export function heatColor(v: number, out = scratch): THREE.Color {
  const t = Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0)) * (HEAT_RAMP.length - 1)
  const i = Math.min(HEAT_RAMP.length - 2, Math.floor(t))
  const a = HEAT_RAMP[i] ?? HEAT_RAMP[0]
  const b = HEAT_RAMP[i + 1] ?? HEAT_RAMP[HEAT_RAMP.length - 1]
  if (!a || !b) return out.set('#3a4a4e')
  return out.copy(a).lerp(b, t - i)
}

/**
 * Apply selection and heat to a part's own material. Safe to call every frame:
 * it mutates in place and allocates nothing.
 */
export function applyState(
  material: THREE.MeshStandardMaterial,
  opts: {
    selected: boolean
    hovered: boolean
    heat: number
    thermalView: boolean
    /**
     * True for the case: a part big enough that lighting it up says nothing.
     *
     * Emissive is a flood, not an outline. On a small component it reads as
     * "this is the one you would pick"; on the whole chassis it reads as "the
     * radio has turned cyan", and since the case is what the pointer is over
     * most of the time, the model spent most of its life glowing.
     */
    subtle?: boolean
  },
): void {
  const { selected, hovered, heat, thermalView, subtle = false } = opts
  if (thermalView && heat > 0.01) {
    heatColor(heat, material.emissive)
    material.emissiveIntensity = 0.25 + heat * 1.5
  } else if (selected) {
    material.emissive.set(PHOSPHOR)
    material.emissiveIntensity = subtle ? 0.05 : 0.34
  } else if (hovered && !subtle) {
    material.emissive.set(PHOSPHOR)
    material.emissiveIntensity = 0.14
  } else if (heat > 0.35) {
    // Even outside the thermal view, something genuinely hot should show it.
    heatColor(heat, material.emissive)
    material.emissiveIntensity = (heat - 0.35) * 1.1
  } else {
    material.emissiveIntensity = 0
  }
}

/**
 * Release everything. Called when the scene unmounts.
 *
 * The generated maps themselves belong to textures.ts and are released by its
 * own `disposeTextures()`. What is disposed here is the clones made for density,
 * which hold a reference on the shared source: three counts those, so letting
 * one go does not take the pixels away from a sibling still using them.
 */
export function disposeMaterials(): void {
  for (const m of cache.values()) m.dispose()
  cache.clear()
  for (const t of derived.values()) t.dispose()
  derived.clear()
  grains.clear()
}
