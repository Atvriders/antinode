# Surfaces — the material contract

The locked contract for the texture and material work. Written before any of it,
so three people can build against it at once and the pieces meet.

## The brief, pinned

The subject is one specific object: an Icom IC-7300 sitting on a bench. The
audience is a ham radio club, and the picture is going on a projector. The job of
every surface is to **read as the material it actually is**, because material
identity is part of what this application teaches — that the chassis is the
casting carrying the heat away from the finals, that the board is FR-4, that the
grip on the dial is rubber.

## The constraint that shapes all of it

**No network assets, ever.** The container renders with nothing to fetch, and
`e2e/offline.spec.ts` asserts it. Every texture here is generated in the browser
at boot from code. That is not a limitation to route around — it is what makes
the look coherent, because every surface comes out of the same noise vocabulary.

## Palette

Surface colours, taken from the real radio rather than invented. These are not UI
tokens; the interface keeps its own.

| Name | Hex | Where |
|---|---|---|
| `cast-graphite` | `#2E353A` | die-cast chassis, painted |
| `panel-slate` | `#39424A` | front panel moulding |
| `anodise-steel` | `#5A656D` | heatsink fins, dial rim |
| `fr4-forest` | `#1C5940` | solder mask |
| `hasl-tin` | `#C3CCD2` | pads, shield cans, connector bodies |
| `copper-trace` | `#B4703C` | traces, wire, chokes |

The existing project tokens keep their meaning and are not re-specified here:
`--phosphor` `#5FD2E8` for anything lit, and the heat ramp
`#3A4A4E → #F2B441 → #E2622A → #C0202B`.

## Typography, which here means silkscreen

The legends printed on the board and the panel are the only type in the scene.
They use **the interface's own faces** — IBM Plex Sans Condensed for legends,
Chivo Mono for reference designators — because a designator is data and because
using the same faces ties the object to the instrument drawn around it. Both are
already self-hosted; no new fonts.

Silkscreen is drawn at a size that resolves at cutaway distance and disappears at
exterior distance. It is never the thing you notice; it is the thing that stops
you noticing that the board is blank.

## The signature

**The display is a real scope.** It is currently a cyan rectangle with a lighter
band across it, and it is the most characteristic thing in this subject's world —
the IC-7300 is the radio that put a real-time spectrum scope on every desk. It
becomes a lit TFT: the live trace from `txAudioSpectrum()` in the physics core, a
waterfall building under it, subpixel structure that resolves when you push in,
and a glass layer over the top with a specular sheen.

Driven from the real function, not drawn to look plausible. The scope is true or
it is not worth having.

## What is deliberately not done

**No bloom, no post-processing pass.** It is the obvious move for making a 3D
scene look expensive, it would wash out the instrument readings the application
exists to be read from, and every glow here should come from emissive surfaces
and tone mapping instead. If a surface looks bright it is because it is emitting,
not because a filter smeared it.

## Module ownership

Nobody edits a file they do not own.

| Path | Owns | Exports it must provide |
|---|---|---|
| `src/three/textures.ts` (NEW) | every procedural generator, the noise basis, the cache, disposal | `TextureQuality`, `textureQuality()`, `castPaint()`, `brushedAnodise()`, `fr4()`, `knurl()`, `tftPixels()`, `jacket()`, `disposeTextures()` |
| `src/three/materials.ts` | applying maps to roles; the role list; heat ramp | unchanged public API: `mat()`, `ownMaterial()`, `heatColor()`, `MaterialRole`, `HEAT_RAMP`, `PHOSPHOR`, `PANEL` |
| `src/three/radio/FrontPanel.tsx` | the display, the dial, the knobs, the buttons | unchanged props |
| `src/ui/Viewport.tsx` | lighting and renderer settings only | no API change |

## Texture API, locked

```ts
/** Longest edge of a generated map, in pixels. */
export type TextureQuality = 512 | 1024 | 2048

/**
 * Chosen from the renderer's own limits and the screen, once.
 * A phone gets 512, a laptop 1024, a desktop with headroom 2048.
 */
export function textureQuality(gl: THREE.WebGLRenderer): TextureQuality

/** Each returns a cached, ready-to-use set. Repeat/wrap already configured. */
export interface SurfaceMaps {
  map?: THREE.Texture
  normalMap?: THREE.Texture
  roughnessMap?: THREE.Texture
  aoMap?: THREE.Texture
  normalScale?: number
}

export function castPaint(q: TextureQuality): SurfaceMaps
export function brushedAnodise(q: TextureQuality): SurfaceMaps
export function fr4(q: TextureQuality): SurfaceMaps
export function knurl(q: TextureQuality): SurfaceMaps
export function tftPixels(q: TextureQuality): THREE.Texture
export function jacket(q: TextureQuality): SurfaceMaps

/** Frees every generated texture. Called when the canvas unmounts. */
export function disposeTextures(): void
```

Rules the generators must keep:

1. **One noise basis.** A single seeded value-noise function underlies every
   generator, so the grain of the paint and the grain of the anodising are
   relatives rather than strangers. Seeded, so two runs produce the same picture
   and a screenshot test means something.
2. **Generated once, cached by quality.** Creating a texture per frame leaks
   shader programs until the tab dies; this codebase has the same warning in
   `materials.ts` about materials, for the same reason.
3. **Colour maps carry no lighting.** No baked highlights or shadows in a `map` —
   the scene lights it. Only `aoMap` may darken, and only in crevices.
4. **Normals are subtle.** `normalScale` at or under 0.6 for paint and anodising.
   A surface that reads as hammered metal at exterior distance is wrong.
5. **Budget.** The whole library generates in under 250 ms at 1024 on a laptop.
   Measure it; do not assume it.

## Performance, which is not negotiable

The responsive work shipped two days ago; none of this may undo it.

- Texture size scales with the device, per `textureQuality()`.
- Generation happens once, at boot, off the render loop.
- **Never give a `useFrame` a priority above zero** — it takes over the render
  loop and the scene stops drawing. See `docs/AUDIT.md`.
- `e2e/offline.spec.ts` and `e2e/render-loop.spec.ts` must stay green. So must
  every responsive test.

## How this gets judged

By looking at it. Screenshots at exterior, cutaway, exploded and station, at
1280×820 and at 390×844, before and after. A roughness value that reads better in
a diff and worse on screen is a regression.
