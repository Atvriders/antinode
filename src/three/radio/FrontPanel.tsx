import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { RADIO } from '../scene-constants'
import { heatColor, mat, ownMaterial, PHOSPHOR } from '../materials'
import { KNURL_RIBS, knurlProfile, textureQuality, tftPixels } from '../textures'
import { txAudioSpectrum } from '../../rf/audio'
import { bandForFreq } from '../../rf/bands'
import { useStation } from '../../sim/store'
import { fmtFreq } from '../../ui/format'
import type { Mode } from '../../rf/types'

/**
 * The front panel: the display, the big tuning dial, the concentric AF/RF knobs,
 * the multi-function knob and the button rows.
 *
 * Button legends are not modelled in 3D. Extruded lettering at this scale reads
 * as noise, and the HTML overlay can label things far more legibly than a mesh
 * ever will. The one piece of type that does belong on the object is the
 * frequency, because that is the thing a person looks at first on a real radio,
 * and it is drawn into the display rather than onto the panel.
 */

// ─── The display ─────────────────────────────────────────────────────────────

/**
 * The scope is drawn into a 2D canvas and uploaded as a texture.
 *
 * The alternative was a shader reading the spectrum out of a data texture, which
 * would have been cheaper per frame and would have made the frequency readout —
 * the most important thing on the panel — either impossible or a second texture
 * anyway. A canvas gives the trace, the waterfall and the type one surface, one
 * upload and one place to reason about.
 *
 * What is drawn is true. The trace is `txAudioSpectrum()` out of the physics
 * core, evaluated for the mode the radio is actually in, on the core's own fixed
 * span. Nothing here invents a shape; see NOISE_DB for the single exception and
 * why it is one.
 */

/**
 * The scope canvas, in device pixels. 16:9, which is what a 4.3 inch panel is.
 *
 * Fixed, rather than scaled by `textureQuality()` the way the generated maps
 * are. What a live canvas texture costs is not the drawing, it is the upload:
 * this is 590 kB of pixels crossing to the GPU on every redraw, and doubling the
 * edge quadruples that for a surface 95 mm wide. Sharpness close in comes from
 * the subpixel mask instead, which is tiled, static, and sampled at whatever
 * resolution the device can afford.
 */
const TFT_W = 512
const TFT_H = 288

/**
 * Bins across the span. `txAudioSpectrum` is evaluated at this resolution and
 * the waterfall stores rows this wide — two canvas pixels per bin, which is
 * finer than the scope on the real radio.
 */
const BINS = 256

/** Rows of waterfall history. At the redraw rate below, just under five seconds. */
const WF_ROWS = 96

/**
 * Where on the 0..1 display scale the waterfall's colour ramp starts.
 *
 * The receiver noise sits at `NOISE_DB`, which is 0.17 of the way up a scale
 * that runs from `FLOOR_DB` to nothing. Starting the ramp a little above that
 * means an empty band is the ramp's own first stop — slate, and dark — and
 * every colour in the thing means a signal.
 */
const WF_SIGNAL_T = 0.22

/**
 * Redraws per second.
 *
 * A per-frame visual does not have to be a per-frame redraw. Twenty hertz is
 * chosen from the waterfall rather than from the trace: a row every 50 ms puts
 * two or three rows inside a syllable, which is what makes speech legible as
 * banding, and at ten the rhythm turns into a smear. At 60 fps this draws on one
 * frame in three, and it is the only thing in this component that touches a
 * canvas at all.
 */
const TFT_PERIOD_S = 1 / 20

/**
 * The bottom of the display, dB below the mode's own peak.
 *
 * `txAudioSpectrum` returns amplitude normalised to a peak of one, so the
 * conversion is 20 log10 and not 10: the intermodulation skirt it puts at 0.02
 * lands at −34 dB, which is the "30 dB or so down" its own comment describes. A
 * linear axis would draw a CW carrier as a spike and the rest of the modes as
 * nothing, and the whole point of the span being fixed is that the widths are
 * comparable.
 */
const FLOOR_DB = -60

/** What the display shows for a radio that is not transmitting: no carrier at all. */
const SILENT_DB = -140

/**
 * The receiver noise floor, dB.
 *
 * The one invented number on this display. The physics core models what the
 * radio transmits, and no part of it produces a band noise floor — but a
 * waterfall with nothing in it is a black rectangle, and the grain is what makes
 * the scale readable and what a transmission then blooms out of. It is
 * deterministic, it sits below every trace, and it is never what the trace is
 * drawn from.
 */
const NOISE_DB = -50

/** Layout, in canvas pixels. */
const PAD = 12
const SPEC_X = PAD
const SPEC_W = TFT_W - PAD * 2
const SPEC_Y = 74
const SPEC_H = 102
const AXIS_BASE = 187
const WF_Y = 192
const WF_H = TFT_H - WF_Y
const CENTRE_X = SPEC_X + SPEC_W / 2

/**
 * How much of the subpixel mask is felt, 0 to 1.
 *
 * A pixel aperture can only cut, so the mask is also a flat dimming of the whole
 * display by whatever it averages — around 0.4, which the generator records on
 * the texture. At full strength that is most of the brightness gone. Blending
 * the mask toward white by this much keeps the structure, bounds the loss, and
 * leaves a compensation small enough to put back: see `surfaces`.
 *
 * It was 0.55 and that was half again too much. A stripe pattern under type is
 * only ever a texture; at better than half strength it stops being one and
 * starts being the thing you read, chopping every numeral of the frequency into
 * red and green bars. The pitch went finer at the same time — see `tftPixels` in
 * ../textures.ts — and the two together are what put the structure back under
 * the type instead of across it.
 */
const SUBPIXEL = 0.3

/** Key caps: depth, and the round-over that gives them their dome. */
const KEY_D = 0.004
const KEY_R = 0.0015

/**
 * How much wider than its cap the well under a key is, each side.
 *
 * A key that is simply a box standing on a flat panel has nothing to say it was
 * ever fitted into anything: no cut line, no shadow where it meets the
 * moulding, and fourteen of them in a row read as fourteen things glued on.
 * This is the dark border drawn around each one, and it is the cheapest
 * possible recess — a plate a millimetre proud of the bezel, in the colour of
 * the inside of a hole.
 */
const KEY_WELL = 0.0013

/** The tuning dial: face radius, and the grip sleeve over it. */
const DIAL_FACE_R = 0.0248
const GRIP_H = 0.0118
/** Ribs stand this fraction of the radius proud of the valleys between them. */
const RIB_DEPTH = 0.019

/** The finger dimple: where it sits on the face, and how big the hole is. */
const DIMPLE_X = RADIO.dial.r * 0.5
const DIMPLE_R = 0.0042
/**
 * The bowl behind that hole, as a sphere cap: how far round the cap goes, and
 * the radius that puts its rim a little outside the hole so the face overhangs
 * it rather than meeting it edge to edge.
 */
const DISH_THETA = 0.7
const DISH_R = (DIMPLE_R + 0.0004) / Math.sin(DISH_THETA)

/**
 * A cylinder with the grip's ribs cut into it.
 *
 * The knurl was a normal map on a smooth tube, and the thing that gave it away
 * was the silhouette: a rim covered in ridges whose outline is a perfect circle
 * is a rim with a picture of ridges painted on it. `knurlProfile` is exported
 * from the texture library for exactly this, so the displacement here and the
 * map that shades it are the same pattern at the same pitch and the same phase.
 * Six segments to a rib is enough for a rounded crest once the normals are
 * averaged; the geometry is four hundred vertices, which is nothing.
 */
function ribbedGrip(r: number, h: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, h, KNURL_RIBS * 6, 1, true)
  const pos = g.attributes['position']
  const uv = g.attributes['uv']
  if (pos && uv) {
    for (let i = 0; i < pos.count; i++) {
      // u runs once around the cylinder and is what the map is indexed by too.
      const k = 1 - RIB_DEPTH * (1 - knurlProfile(uv.getX(i) * KNURL_RIBS))
      pos.setX(i, pos.getX(i) * k)
      pos.setZ(i, pos.getZ(i) * k)
    }
    pos.needsUpdate = true
    g.computeVertexNormals()
  }
  return g
}

/**
 * The dial's front face, with the finger dimple's hole cut out of it.
 *
 * A `CylinderGeometry` cap would be one triangle fan with nowhere to put a hole,
 * and a flat disc laid over the top is what the dimple used to be: an unshaded
 * ellipse of darker rubber, which is a painted dot. The hole is what lets the
 * bowl behind it be a real depression with a real occlusion in it.
 */
function dialFace(): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  shape.absarc(0, 0, DIAL_FACE_R, 0, Math.PI * 2, false)
  const hole = new THREE.Path()
  hole.absarc(DIMPLE_X, 0, DIMPLE_R, 0, Math.PI * 2, true)
  shape.holes.push(hole)
  const g = new THREE.ShapeGeometry(shape, 64)
  // ShapeGeometry copies the shape's own coordinates into uv, and this shape is
  // measured in metres of dial: left alone every vertex would sample the same
  // two-hundredth of the grain map and the face would be one flat colour.
  const pos = g.attributes['position']
  const uv = g.attributes['uv']
  if (pos && uv) {
    for (let i = 0; i < pos.count; i++) {
      uv.setXY(i, (pos.getX(i) / DIAL_FACE_R + 1) * 0.5, (pos.getY(i) / DIAL_FACE_R + 1) * 0.5)
    }
    uv.needsUpdate = true
  }
  return g
}

const cssRgb = (c: THREE.Color): [number, number, number] => {
  const out = { r: 0, g: 0, b: 0 }
  c.getRGB(out, THREE.SRGBColorSpace)
  return [Math.round(out.r * 255), Math.round(out.g * 255), Math.round(out.b * 255)]
}

// The display's palette is the interface's own. The phosphor comes through
// materials.ts rather than as a second copy of the hex, which means converting
// it back: THREE.Color holds a colour in linear space and a 2D canvas works in
// sRGB. The other three are tokens from tokens.css that materials.ts does not
// export — --phosphor-bright, --silk and --heat-2 — and a CSS variable is not
// readable from a canvas, so they are written out.
const [PR, PG, PB] = cssRgb(PHOSPHOR)
const cy = (a: number): string => `rgba(${PR}, ${PG}, ${PB}, ${a})`
const CY = cy(1)
const CY_BRIGHT = '#b6f0fa'
const SILK = 'rgba(169, 183, 186, 0.82)'
const SILK_DIM = 'rgba(169, 183, 186, 0.45)'
const HOT = '#e2622a'

const num = (px: number, weight = 500): string =>
  `${weight} ${px}px "Chivo Mono", ui-monospace, "DejaVu Sans Mono", monospace`
const leg = (px: number, weight = 600): string =>
  `${weight} ${px}px "IBM Plex Sans Condensed", "Arial Narrow", system-ui, sans-serif`

const clamp01 = (v: number): number => (v > 1 ? 1 : v < 0 ? 0 : Number.isFinite(v) ? v : 0)

/**
 * A deterministic value hash. The grain on the waterfall has to be the same on
 * every run, or a screenshot of this display is not evidence of anything.
 */
function hash(a: number, b: number): number {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
  return s - Math.floor(s)
}

/** What one redraw needs to know. Sampled from the store, never held in React state. */
interface Reading {
  freqHz: number
  mode: Mode
  keyed: boolean
  envelope: number
  poW: number
  swr: number
  alc: number
  /** The panel's backlight colour, from the `screenColor` prop. */
  tint: string
}

function reading(tint: string): Reading {
  const s = useStation.getState()
  return {
    freqHz: s.config.freqHz,
    mode: s.config.mode,
    keyed: s.config.keyed,
    envelope: s.config.envelope,
    poW: s.meters.poW,
    swr: s.meters.swr,
    alc: s.meters.alc,
    tint,
  }
}

const rampColour = new THREE.Color()
const rampRgb = { r: 0, g: 0, b: 0 }

/** The lit TFT. Owns its canvases and its texture, and is disposed with the panel. */
class Tft {
  readonly texture: THREE.CanvasTexture

  /** Displayed level per bin, dB. Smoothed, so it behaves like a video filter. */
  private readonly level = new Float32Array(BINS).fill(FLOOR_DB)

  private readonly fill: CanvasGradient
  private readonly vignette: CanvasGradient
  private readonly strip: ImageData
  private row = 0

  constructor(
    canvas: HTMLCanvasElement,
    private readonly c: CanvasRenderingContext2D,
    private readonly wfCanvas: HTMLCanvasElement,
    private readonly wf: CanvasRenderingContext2D,
  ) {
    this.strip = wf.createImageData(BINS, WF_ROWS)
    // Primed with the floor, not left black.
    //
    // This scrolls one row per redraw and never writes anything but the top
    // one, so for the first five seconds of the application's life the bottom
    // of the display is whatever this array was initialised to. Zeroed, that is
    // pure black under a band of history, with a ruled horizontal edge between
    // them that creeps down the screen — which reads as a strip of tape laid on
    // the glass rather than as a display. Filled with the level the band will
    // settle at, there is no edge to see at any moment.
    const d = this.strip.data
    this.shade(NOISE_DB)
    for (let i = 0; i < d.length; i += 4) {
      d[i] = rampRgb.r * 255
      d[i + 1] = rampRgb.g * 255
      d[i + 2] = rampRgb.b * 255
      d[i + 3] = 255
    }

    this.fill = c.createLinearGradient(0, SPEC_Y, 0, SPEC_Y + SPEC_H)
    this.fill.addColorStop(0, cy(0.4))
    this.fill.addColorStop(1, cy(0.04))

    // The backlight is a panel behind a diffuser and it is dimmer at the edges.
    this.vignette = c.createRadialGradient(
      TFT_W / 2, TFT_H / 2, TFT_H * 0.25,
      TFT_W / 2, TFT_H / 2, TFT_W * 0.62,
    )
    this.vignette.addColorStop(0, 'rgba(0, 0, 0, 0)')
    this.vignette.addColorStop(1, 'rgba(0, 0, 0, 0.34)')

    this.texture = new THREE.CanvasTexture(canvas)
    // A canvas holds sRGB bytes; without this three would treat them as linear
    // and the whole display would come out bleached.
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.texture.anisotropy = 4
  }

  draw(spectrum: Float32Array, r: Reading): void {
    this.ground(r.tint)
    this.levels(spectrum, r)
    this.fall()
    this.grid()
    this.trace(spectrum)
    this.axis()
    this.head(r)
    this.edge()
    this.texture.needsUpdate = true
  }

  dispose(): void {
    this.texture.dispose()
    // Shrinking the backing stores tells the browser it may release them now
    // rather than when the elements are collected.
    this.wfCanvas.width = 1
    this.wfCanvas.height = 1
  }

  /** The unlit panel: backlight leaking through pixels that are switched off. */
  private ground(tint: string): void {
    const c = this.c
    c.globalAlpha = 1
    c.fillStyle = '#01060a'
    c.fillRect(0, 0, TFT_W, TFT_H)
    c.globalAlpha = 0.3
    c.fillStyle = tint
    c.fillRect(0, 0, TFT_W, TFT_H)
    c.globalAlpha = 1
  }

  /**
   * What the radio is putting out, bin by bin, in dB.
   *
   * The mode's spectrum is a shape; the transmit envelope is the level. Keyed,
   * the whole trace rides up and down with the syllables, which is why the
   * waterfall bands the way speech does. Unkeyed there is no transmission at
   * all, and the trace falls to the noise — the display is a transmit monitor
   * and the honest thing for it to show is nothing.
   */
  private levels(spectrum: Float32Array, r: Reading): void {
    const drive = r.keyed ? 20 * Math.log10(Math.max(r.envelope, 1e-3)) : SILENT_DB
    this.row++
    for (let i = 0; i < BINS; i++) {
      const signal = 20 * Math.log10(Math.max(spectrum[i] ?? 0, 1e-6)) + drive
      // Two octaves of grain: fine per bin, and a slower drift across a group of
      // them, which is what a real floor looks like.
      const n = hash(i, this.row) * 0.6 + hash(i >> 3, this.row >> 2) * 0.4
      const noise = NOISE_DB + (n - 0.5) * 9
      // The larger of the two rather than a power sum. At the crossover the two
      // differ by 3 dB, which is a twentieth of the height of the display.
      const target = Math.max(signal, noise)
      const was = this.level[i] ?? FLOOR_DB
      // Fast attack, slower release: a spectrum analyser's video filter, and the
      // reason a peak is legible at twenty redraws a second.
      this.level[i] = was + (target - was) * (target > was ? 0.7 : 0.28)
    }
  }

  /**
   * The colour of one waterfall cell, left in `rampRgb`.
   *
   * The project's own ramp, with the brightness taken off it separately so that
   * the floor is a dark grain rather than a slab of slate. Both happen in the
   * linear space THREE.Color works in, and the conversion to the sRGB bytes a
   * canvas wants is the last step.
   *
   * Two numbers here were wrong and between them they painted the band of amber
   * that ran edge to edge across the bottom of this display whether the radio
   * was transmitting or not. The ramp was entered at the *bottom* of the scale,
   * so the receiver's own noise — which is a good ten decibels up from the
   * floor and is the same in every bin — already sat a third of the way into
   * the amber; and the brightness curve was a gentle 0.8 power, which lifted it
   * rather than putting it away. The result contradicted the trace drawn
   * directly above it out of the same numbers.
   *
   * So the hue ramp now starts *above* the noise, at `WF_SIGNAL_T`, and
   * everything below that is the ramp's first stop, which is slate; and the
   * brightness is a 2.4 power, which takes the floor to about one part in
   * seventy. What is left down there is a dark grain that the eye reads as an
   * empty band and a transmission blooms out of, which is what a waterfall is
   * for.
   *
   * Stopping at 0.72 leaves the last stop of the ramp out. That colour is what a
   * part turns when it is being damaged, and a hundred watts of perfectly
   * healthy SSB must not be painted in it: the top of this scale means a strong
   * signal, not a hot one.
   */
  private shade(db: number): void {
    const t = clamp01((db - FLOOR_DB) / -FLOOR_DB)
    const signal = clamp01((t - WF_SIGNAL_T) / (1 - WF_SIGNAL_T))
    heatColor(signal * 0.72, rampColour).multiplyScalar(Math.pow(t, 2.4))
    rampColour.getRGB(rampRgb, THREE.SRGBColorSpace)
  }

  /** One new row at the top, everything else a row further down. */
  private fall(): void {
    const d = this.strip.data
    const stride = BINS * 4
    // copyWithin is a memmove, so the overlap with itself is defined behaviour.
    d.copyWithin(stride, 0, stride * (WF_ROWS - 1))
    for (let i = 0; i < BINS; i++) {
      this.shade(this.level[i] ?? FLOOR_DB)
      const o = i * 4
      d[o] = rampRgb.r * 255
      d[o + 1] = rampRgb.g * 255
      d[o + 2] = rampRgb.b * 255
    }
    this.wf.putImageData(this.strip, 0, 0)
    // Rows land one for one; only the bins are stretched across the width.
    this.c.imageSmoothingEnabled = true
    this.c.drawImage(this.wfCanvas, SPEC_X, WF_Y, SPEC_W, WF_H)
  }

  /**
   * The graticule, in two weights.
   *
   * Every line was drawn at one value, which is a grid rather than a graticule:
   * there is nothing in it to count by, so the eye gets no scale from it and the
   * whole thing reads as a printed background. The divisions that carry a number
   * — the 5 kHz ticks the axis labels sit under, and the half-scale line — are
   * now drawn at twice the weight of the ones between them, so the display can
   * be read at a glance from the back of a room.
   */
  private grid(): void {
    const c = this.c
    c.lineWidth = 1

    c.strokeStyle = cy(0.055)
    c.beginPath()
    for (let i = 1; i < 10; i++) {
      // The middle one is the dial frequency and `axis` draws it brighter still.
      if (i === 5) continue
      const x = Math.round(SPEC_X + (i / 10) * SPEC_W) + 0.5
      c.moveTo(x, SPEC_Y)
      c.lineTo(x, SPEC_Y + SPEC_H)
    }
    for (let i = 1; i < 6; i++) {
      if (i === 3) continue
      const y = Math.round(SPEC_Y + (i / 6) * SPEC_H) + 0.5
      c.moveTo(SPEC_X, y)
      c.lineTo(SPEC_X + SPEC_W, y)
    }
    c.stroke()

    // The two the axis puts a number under, at plus and minus 5 kHz.
    c.strokeStyle = cy(0.13)
    c.beginPath()
    for (const i of [2.5, 7.5]) {
      const x = Math.round(SPEC_X + (i / 10) * SPEC_W) + 0.5
      c.moveTo(x, SPEC_Y)
      c.lineTo(x, SPEC_Y + SPEC_H)
    }
    const mid = Math.round(SPEC_Y + 0.5 * SPEC_H) + 0.5
    c.moveTo(SPEC_X, mid)
    c.lineTo(SPEC_X + SPEC_W, mid)
    c.stroke()
  }

  private dbY(db: number): number {
    const t = clamp01((db - FLOOR_DB) / -FLOOR_DB)
    return SPEC_Y + SPEC_H * (1 - t)
  }

  private trace(spectrum: Float32Array): void {
    const c = this.c
    const step = SPEC_W / (BINS - 1)

    // What the mode occupies at full output: a marker, not a measurement, and
    // drawn as an outline for exactly that reason. The filled trace below rises
    // to meet it when the operator is at full envelope and sits under it the
    // rest of the time, which is the whole lesson in one picture.
    c.beginPath()
    for (let i = 0; i < BINS; i++) {
      const y = this.dbY(20 * Math.log10(Math.max(spectrum[i] ?? 0, 1e-6)))
      if (i === 0) c.moveTo(SPEC_X, y)
      else c.lineTo(SPEC_X + i * step, y)
    }
    c.lineWidth = 1
    c.strokeStyle = cy(0.26)
    c.stroke()

    // The live trace, built once and used twice: the area is the same curve
    // closed down to the baseline, and filling before stroking keeps the
    // translucent fill from washing over the bottom half of its own line.
    const curve = new Path2D()
    for (let i = 0; i < BINS; i++) {
      const y = this.dbY(this.level[i] ?? FLOOR_DB)
      if (i === 0) curve.moveTo(SPEC_X, y)
      else curve.lineTo(SPEC_X + i * step, y)
    }
    const area = new Path2D(curve)
    area.lineTo(SPEC_X + SPEC_W, SPEC_Y + SPEC_H)
    area.lineTo(SPEC_X, SPEC_Y + SPEC_H)
    area.closePath()
    c.fillStyle = this.fill
    c.fill(area)
    c.lineWidth = 1.6
    c.lineJoin = 'round'
    c.strokeStyle = CY_BRIGHT
    c.stroke(curve)
  }

  /**
   * The span, which is the core's and not this component's: `txAudioSpectrum`
   * maps its bins onto 20 kHz centred on the dial, so the ticks are at 5 kHz.
   */
  private axis(): void {
    const c = this.c
    c.font = leg(9)
    c.letterSpacing = '0.06em'
    c.textBaseline = 'alphabetic'
    c.textAlign = 'center'
    c.fillStyle = SILK_DIM
    for (let i = 0; i <= 4; i++) {
      const khz = -10 + i * 5
      // The two end ticks are aligned inward rather than centred, or half of
      // each would be drawn off the edge of the panel. The unit rides on the
      // last of them, which is the only one with room for it.
      c.textAlign = i === 0 ? 'left' : i === 4 ? 'right' : 'center'
      const label = khz === 0 ? '0' : `${khz > 0 ? '+' : '−'}${Math.abs(khz)}`
      c.fillText(i === 4 ? `${label} kHz` : label, SPEC_X + (i / 4) * SPEC_W, AXIS_BASE)
    }
    c.letterSpacing = '0px'

    // The dial frequency itself: the only line on the display that means a
    // frequency rather than a distance from one, so it runs through both halves.
    c.strokeStyle = cy(0.34)
    c.lineWidth = 1
    c.beginPath()
    c.moveTo(CENTRE_X + 0.5, SPEC_Y)
    c.lineTo(CENTRE_X + 0.5, SPEC_Y + SPEC_H)
    c.moveTo(CENTRE_X + 0.5, WF_Y)
    c.lineTo(CENTRE_X + 0.5, WF_Y + WF_H)
    c.stroke()
  }

  private head(r: Reading): void {
    const c = this.c
    const parts = fmtFreq(r.freqHz).split('.')
    const mhz = `${parts[0] ?? '0'}.${parts[1] ?? '000'}`
    const hz = `.${parts[2] ?? '000'}`

    c.textBaseline = 'alphabetic'
    c.textAlign = 'left'
    c.letterSpacing = '0px'
    c.font = num(34)
    c.fillStyle = CY_BRIGHT
    c.fillText(mhz, PAD, 45)
    let x = PAD + c.measureText(mhz).width
    // The last three digits smaller, the way the radio itself steps them down:
    // nobody reads a 1 Hz digit at the same size as the megahertz.
    c.font = num(19)
    c.fillStyle = cy(0.7)
    c.fillText(hz, x + 1, 45)
    x += 1 + c.measureText(hz).width
    c.font = leg(10)
    c.letterSpacing = '0.1em'
    c.fillStyle = cy(0.4)
    c.fillText('MHz', x + 7, 45)

    const band = bandForFreq(r.freqHz)
    c.font = leg(13)
    c.letterSpacing = '0.12em'
    c.fillStyle = SILK
    c.fillText(r.mode, PAD, 63)
    c.fillStyle = SILK_DIM
    // The 60 m entry carries its channel caveat in the label, which belongs in
    // the reference text and not across the top of a 95 mm display.
    c.fillText(band ? (band.label.split(' (')[0] ?? band.label) : 'OUT OF BAND', PAD + 52, 63)
    c.letterSpacing = '0px'

    this.meter('PO', clamp01(r.poW / 100), CY, 10)
    this.meter('SWR', clamp01((r.swr - 1) / 2), r.swr > 2 ? HOT : CY, 26)
    this.meter('ALC', clamp01(r.alc), CY, 42)

    // Transmit. Lit is the radio keyed, not the operator speaking: the envelope
    // is in the trace and this is the relay.
    c.beginPath()
    c.roundRect(452, 52, 48, 14, 3)
    if (r.keyed) {
      c.fillStyle = HOT
      c.fill()
    } else {
      c.strokeStyle = 'rgba(169, 183, 186, 0.22)'
      c.lineWidth = 1
      c.stroke()
    }
    c.font = leg(10, 700)
    c.letterSpacing = '0.14em'
    c.textAlign = 'center'
    c.fillStyle = r.keyed ? '#140a06' : SILK_DIM
    c.fillText('TX', 477, 63)
    c.letterSpacing = '0px'
    c.textAlign = 'left'
  }

  /** One bar of the multi-function meter, segmented the way the panel ones are. */
  private meter(label: string, v: number, colour: string, y: number): void {
    const c = this.c
    c.font = leg(9)
    c.letterSpacing = '0.08em'
    c.textAlign = 'right'
    c.fillStyle = SILK_DIM
    c.fillText(label, 356, y + 7)
    c.textAlign = 'left'
    c.letterSpacing = '0px'
    const x0 = 362
    const seg = 6
    const gap = 1.6
    const n = Math.floor((TFT_W - PAD - x0 + gap) / (seg + gap))
    const lit = Math.round(clamp01(v) * n)
    for (let i = 0; i < n; i++) {
      c.fillStyle = i < lit ? colour : cy(0.08)
      c.fillRect(x0 + i * (seg + gap), y, seg, 7)
    }
  }

  /**
   * The backlight falling off toward the edge of the panel, and nothing else.
   *
   * There used to be a cyan rectangle stroked around the whole active area as
   * well. A lit border is not a thing any TFT has: what bounds a panel is the
   * bezel it is set into, which is real geometry here and a millimetre in front,
   * and a glowing line drawn just inside it reads as a sticker applied to the
   * front of the radio. The vignette alone is what a diffuser does.
   */
  private edge(): void {
    const c = this.c
    c.fillStyle = this.vignette
    c.fillRect(0, 0, TFT_W, TFT_H)
  }
}

function createTft(): Tft | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = TFT_W
  canvas.height = TFT_H
  const wfCanvas = document.createElement('canvas')
  wfCanvas.width = BINS
  wfCanvas.height = WF_ROWS
  const c = canvas.getContext('2d')
  const wf = wfCanvas.getContext('2d')
  // Without a 2D context there is no scope, and the panel falls back to the
  // emissive plane behind it rather than to a black rectangle.
  if (!c || !wf) return null
  return new Tft(canvas, c, wfCanvas, wf)
}

/** The lit area, inset inside the bezel and holding the canvas's own aspect. */
const ACTIVE_W = 0.092
const ACTIVE_H = (ACTIVE_W * TFT_H) / TFT_W

// ─── The panel ───────────────────────────────────────────────────────────────

export function FrontPanel({
  screenColor,
  screenMaterial,
  dialMaterial,
  spinDial,
}: {
  screenColor: string
  screenMaterial: THREE.MeshStandardMaterial
  dialMaterial: THREE.MeshStandardMaterial
  spinDial: number
}) {
  const z = RADIO.frontZ
  const dial = useRef<THREE.Group>(null)
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)

  /**
   * The only thing this component subscribes to.
   *
   * Everything else the display shows — the dial frequency, the meters, whether
   * the radio is keyed — is sampled inside the redraw with `getState()`, because
   * subscribing to values that move at simulation rate would re-render a React
   * tree twenty times a second to change pixels that are not React's. The mode
   * is different: it changes when a person presses a key, and the spectrum has
   * to be recomputed when it does.
   */
  const mode = useStation((s) => s.config.mode)
  const spectrum = useMemo(() => txAudioSpectrum(mode, BINS), [mode])

  const tft = useMemo(() => createTft(), [])

  /**
   * The subpixel structure, at the repeat the generator chose.
   *
   * `tftPixels` exists for this one surface and there is exactly one display in
   * the scene, so the pitch is its author's decision and docs/SURFACES.md says
   * the maps come back ready to use. If the grid ever lands too coarse or fine,
   * the fix belongs where the pitch is chosen and not in a second opinion here.
   */
  const pixels = useMemo(() => tftPixels(textureQuality(gl)), [gl])

  const surfaces = useMemo(() => {
    /**
     * What the mask will take away, so it can be put back.
     *
     * The generator records the mean of its own stripes, and says to divide the
     * intensity driving the display by it. Blended toward white by `SUBPIXEL`
     * the loss is smaller than that, so the compensation is too. The top of the
     * trace clips against the framebuffer on the way past — the destination is
     * eight bits and the multiply happens after it is written — which is the
     * right thing anyway: a stripe drawn at full drive on a real panel is at
     * full drive, and there is nothing above it either.
     */
    const meta: unknown = pixels.userData['meanLinear']
    const through = 1 - SUBPIXEL + SUBPIXEL * (typeof meta === 'number' ? meta : 1)

    // The lit pixels. Basic rather than standard: a TFT emits, and nothing in
    // the room should be able to shade it. What the room does to it happens on
    // the glass in front instead.
    const scope = new THREE.MeshBasicMaterial({
      map: tft?.texture ?? null,
      color: new THREE.Color().setScalar(Math.min(1.6, 1 / Math.max(through, 0.2))),
      toneMapped: false,
    })

    /**
     * The pixel grid over the top.
     *
     * The blend is `dst * (1 - k + k * mask)`: the destination scaled by the
     * mask, lerped back toward one by k. GL gets there as
     * `DST_COLOR * src + (1 - constant alpha) * dst` with the material colour
     * carrying k, which is the only way to hold a strength dial on a multiply
     * without writing a shader.
     *
     * Plain MultiplyBlending is the same thing with k pinned at one, and it
     * takes the whole 0.4: putting that back needs the display driven two and a
     * half times over, and everything above four tenths of full scale then clips
     * flat before the mask ever reaches it. This way the compensation is 1.5 and
     * only the top of the trace clips, which is where clipping belongs.
     */
    const mask = new THREE.MeshBasicMaterial({
      map: pixels,
      color: new THREE.Color().setScalar(SUBPIXEL),
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.DstColorFactor,
      blendDst: THREE.OneMinusConstantAlphaFactor,
      blendAlpha: SUBPIXEL,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    })

    /**
     * The cover glass.
     *
     * Black, smooth and not metal, blended additively: a dielectric reflects
     * about four per cent straight on and far more at a grazing angle, and
     * adding only that reflection is both what glass does and the only way to
     * put a sheen over an emissive surface without dimming it. There is no map
     * and no baked highlight; the lights and the local environment make it, so
     * it slides across the display as the camera moves.
     */
    const glass = new THREE.MeshStandardMaterial({
      color: '#000000',
      // Rougher and far stronger than it was. At 0.06 and unity the sheen this
      // adds is four per cent of a dim room reflected in a mirror, which is to
      // say a sharp image of whatever single light shape happens to lie on the
      // mirror angle and nothing at all from anywhere else — so from most
      // camera positions the display had no glass on it whatever and went back
      // to reading as artwork printed on the panel. A little roughness widens
      // the lobe enough that the room is always in it somewhere, and the
      // intensity is what makes that visible against an emissive surface.
      roughness: 0.13,
      metalness: 0,
      envMapIntensity: 2.6,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    })

    /**
     * The dial's rubber grip. materials.ts has a role for it now, and that role
     * is the only thing in the scene the knurl is laid on.
     *
     * The tiling is left exactly as it comes. `knurl()` is written for this one
     * surface: its ridges run along v and repeat around u, and its repeat puts a
     * ridge every 3.4 mm around a 163 mm circumference — which is this sleeve,
     * unwrapped, and which is the pitch `ribbedGrip` displaces the cylinder at.
     */
    const grip = ownMaterial('grip')

    /**
     * The inside of the finger dimple.
     *
     * `BackSide`, because the bowl is a sphere cap turned away from the viewer:
     * what is wanted is its inner surface, and three flips the normal for a back
     * face so a concave surface shades as one. Darker than the face around it
     * for the same reason a hole is darker — less of the room can reach into it
     * — which is the part of an occlusion a scene with no ray tracing in it can
     * still afford.
     */
    const dimple = ownMaterial('plastic-knob')
    dimple.side = THREE.BackSide
    dimple.color.multiplyScalar(0.6)
    // Matte, and not a metal at all. A concave surface gathers a specular lobe
    // the way a dish gathers anything else, so at the moulding's own 0.5 the
    // bowl came back with a blown white spot in the bottom of it that read as a
    // bulb in a socket rather than as a dent in a knob.
    dimple.roughness = 0.88
    dimple.metalness = 0

    /**
     * Key caps. Matter than the knob mouldings beside them, which is what a key
     * top is, and enough to stop fourteen identical fillets returning fourteen
     * identical highlights along their top edges.
     */
    const keycap = ownMaterial('plastic-knob')
    keycap.roughness = Math.min(1, keycap.roughness * 1.22)

    /** The inside of the wells the keys sit in. */
    const well = ownMaterial('chassis')
    well.color.multiplyScalar(0.34)
    well.roughness = 0.95

    /** The insulator in the microphone connector, behind its plated shell. */
    const insert = ownMaterial('device')

    return {
      scope, mask, glass, grip, dimple, keycap, well, insert,
      all: [scope, mask, glass, grip, dimple, keycap, well, insert],
    }
  }, [tft, pixels])

  /**
   * The dial's own geometry: a face with a hole in it, the bowl behind the
   * hole, and the ribbed sleeve. Built once and disposed with the panel.
   */
  const dialGeo = useMemo(() => {
    const face = dialFace()
    const grip = ribbedGrip(RADIO.dial.r, GRIP_H)
    const dish = new THREE.SphereGeometry(DISH_R, 24, 8, 0, Math.PI * 2, 0, DISH_THETA)
    return { face, grip, dish, all: [face, grip, dish] }
  }, [])

  /**
   * Key caps.
   *
   * A real key is domed and has no sharp edge anywhere on it. The dome here is
   * the round-over doing double duty rather than a displaced cap: BoxGeometry
   * does not share vertices between faces, so pushing the front face out and
   * recomputing normals leaves a faceted seam around the whole plateau, and a
   * seam down the middle of fourteen keys is worse than a slightly flat one. At
   * 1.5 mm on a 4 mm cap the fillet is most of the depth and reads as the dome.
   * One geometry per distinct size, shared by every key of that size.
   */
  const keys = useMemo(() => {
    const shapes = new Map<string, THREE.BufferGeometry>()
    const shape = (w: number, h: number): THREE.BufferGeometry => {
      const key = `${w}x${h}`
      const hit = shapes.get(key)
      if (hit) return hit
      const made = new RoundedBoxGeometry(w, h, KEY_D, 4, KEY_R)
      shapes.set(key, made)
      return made
    }
    const placed: { x: number; y: number; w: number; h: number; geometry: THREE.BufferGeometry }[] = []
    const put = (x: number, y: number, w: number, h: number) => placed.push({ x, y, w, h, geometry: shape(w, h) })
    // Two rows under the display, plus a column beside it.
    for (let i = 0; i < 6; i++) put(-0.094 + i * 0.019, 0.019, 0.014, 0.008)
    for (let i = 0; i < 4; i++) put(-0.094 + i * 0.019, 0.006, 0.014, 0.008)
    for (let i = 0; i < 4; i++) put(0.006, 0.076 - i * 0.014, 0.011, 0.009)
    return { placed, shapes: [...shapes.values()] }
  }, [])

  // Three separate cleanups, each releasing only what its own dependency owns.
  // Rolled into one they would share a dependency list, and the effect re-running
  // for the sake of one of them would dispose the other two out from under a
  // scene that is still drawing with them.
  useEffect(() => () => tft?.dispose(), [tft])
  useEffect(
    () => () => {
      for (const m of surfaces.all) m.dispose()
    },
    [surfaces],
  )
  useEffect(
    () => () => {
      for (const g of keys.shapes) g.dispose()
    },
    [keys],
  )
  useEffect(
    () => () => {
      for (const g of dialGeo.all) g.dispose()
    },
    [dialGeo],
  )

  /**
   * First paint, off the render loop.
   *
   * A canvas asks for a font face and is given whatever is loaded at that
   * instant — there is no swap and no second chance — and the display can easily
   * be drawn before the panel faces have arrived, in which case the frequency
   * comes out in whatever the fallback is. So it is drawn again once they have.
   * `invalidate` is what makes that visible when the scene is running on demand,
   * which it is whenever motion is reduced.
   */
  useEffect(() => {
    if (!tft) return
    const paint = () => {
      tft.draw(spectrum, reading(screenColor))
      invalidate()
    }
    paint()
    const fonts = typeof document === 'undefined' ? null : document.fonts
    if (!fonts) return
    let live = true
    void fonts.ready.then(() => {
      if (live) paint()
    })
    return () => {
      live = false
    }
  }, [tft, spectrum, screenColor, invalidate])

  const since = useRef(0)

  /**
   * No priority. Ever.
   *
   * A `useFrame` with a priority above zero takes over the render loop in
   * react-three-fiber and the automatic render stops: the scene goes black and
   * every test that reads the DOM carries on passing. It has happened once in
   * this project already; see docs/AUDIT.md and e2e/render-loop.spec.ts.
   */
  useFrame((_, dt) => {
    const g = dial.current
    if (g) g.rotation.z += spinDial * dt
    if (!tft) return
    since.current += dt
    if (since.current < TFT_PERIOD_S) return
    // Reset rather than subtract the period. A tab that comes back from the
    // background arrives with one enormous dt, and carrying the overshoot would
    // spend that frame drawing a row of waterfall for every 50 ms it was away.
    since.current = 0
    tft.draw(spectrum, reading(screenColor))
  })

  return (
    <group>
      {/*
        The display, in the order light leaves it: the bezel it is set into, the
        panel's own backlight, the lit pixels, the grid those pixels are on, and
        the glass over the lot. The separations are real millimetres rather than
        a polygon offset, which is where the parallax comes from — look at the
        radio from the side and the trace sits behind the cover glass, because
        it does.
      */}
      <mesh position={[RADIO.screen.x, RADIO.screen.y, z + 0.001]}>
        <planeGeometry args={[RADIO.screen.w + 0.007, RADIO.screen.h + 0.007]} />
        <meshStandardMaterial color="#05090a" roughness={0.46} metalness={0.1} />
      </mesh>
      <mesh position={[RADIO.screen.x, RADIO.screen.y, z + 0.0016]} material={screenMaterial}>
        <planeGeometry args={[RADIO.screen.w, RADIO.screen.h]} />
      </mesh>
      {tft && (
        <mesh position={[RADIO.screen.x, RADIO.screen.y, z + 0.002]} material={surfaces.scope}>
          <planeGeometry args={[ACTIVE_W, ACTIVE_H]} />
        </mesh>
      )}
      {/* Exactly the panel, because the generator's repeat is written for a plane
          whose UVs run across `RADIO.screen`: the cell pitch is only right at
          that size, and the unlit border is part of the same glass anyway. */}
      <mesh position={[RADIO.screen.x, RADIO.screen.y, z + 0.0022]} material={surfaces.mask}>
        <planeGeometry args={[RADIO.screen.w, RADIO.screen.h]} />
      </mesh>
      <mesh position={[RADIO.screen.x, RADIO.screen.y, z + 0.0029]} material={surfaces.glass}>
        <planeGeometry args={[RADIO.screen.w + 0.004, RADIO.screen.h + 0.004]} />
      </mesh>

      {/*
        Main tuning dial. Its axis points at the operator and `spinDial` turns it
        about that axis, which is the one thing the rotation in the frame
        callback only makes sense as.
      */}
      <group ref={dial} position={[RADIO.dial.x, RADIO.dial.y, z + 0.006]}>
        {/*
          The moulded body, drawn slightly for release, which is where the
          highlight around the edge comes from. Open ended, and its front face
          is the separate piece below.

          It used to be a closed cylinder, and its cap is what put corduroy
          across the front of the main tuning dial. A cylinder's end cap takes a
          planar UV projection, so the knurl — which is a relief that varies
          along u and is constant along v, and therefore only means anything
          wrapped around something — came out as parallel stripes combed across
          a flat disc. The grain that belongs on a moulded face is in
          materials.ts under 'plastic-knob'; the knurl is on the sleeve, where it
          is wrapped.
        */}
        <mesh castShadow material={dialMaterial} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[DIAL_FACE_R, 0.0256, 0.014, 48, 1, true]} />
        </mesh>
        <mesh position={[0, 0, 0.007]} geometry={dialGeo.face} material={dialMaterial} />
        {/*
          The rubber grip over it, open at both ends so the body shows as a
          shoulder at each edge rather than as a hole. The ribs are geometry and
          the knurl map shades them: see `ribbedGrip`.
        */}
        <mesh castShadow geometry={dialGeo.grip} material={surfaces.grip} rotation={[Math.PI / 2, 0, 0]} />
        {/*
          The finger dimple: a bowl behind the hole in the face, turned so its
          pole points into the dial. The face overhangs its rim by a fifth of a
          millimetre, which is what draws the lip.
        */}
        <mesh
          position={[DIMPLE_X, 0, 0.0068 + DISH_R * Math.cos(DISH_THETA)]}
          rotation={[-Math.PI / 2, 0, 0]}
          geometry={dialGeo.dish}
          material={surfaces.dimple}
        />
      </group>

      {/*
        Concentric AF and RF/SQL knobs, and the multi-function knob.

        The concentric pair used to sit at x = -0.104, which is 22 mm of knob in
        the 20 mm of panel to the left of the display — so it lay across the
        display's top left corner and took the leading digit of the frequency
        and the U of USB with it. `RADIO.screen` is in scene-constants and is
        not this component's to move, so the knobs moved instead, into the gap
        between the display and the dial. That is also where they are on the
        radio: the strip left of the display carries the jacks and nothing else.
      */}
      <Knob x={0.028} y={0.075} z={z + 0.007} r={0.0105} h={0.012} mark />
      <Knob x={0.028} y={0.075} z={z + 0.0125} r={0.0065} h={0.009} mark />
      <Knob x={0.104} y={0.072} z={z + 0.008} r={0.0095} h={0.012} />

      {/* Button rows, each in its own well. */}
      {keys.placed.map(({ x, y, w, h, geometry }, i) => (
        <group key={i}>
          <mesh position={[x, y, z + 0.0004]} material={surfaces.well}>
            <planeGeometry args={[w + KEY_WELL * 2, h + KEY_WELL * 2]} />
          </mesh>
          {/* No castShadow: the bezel these sit on does not receive one, so a
              shadow pass over fourteen key caps would cost a depth draw each
              and land nowhere. */}
          <mesh position={[x, y, z + 0.003]} geometry={geometry} material={surfaces.keycap} />
        </group>
      ))}

      {/*
        Microphone connector and the headphone jack.

        The shell used to be the whole of it: a 15 mm disc of tin plate at 0.22
        roughness, face on to the room, which came back as an unshaded white
        circle and was the brightest thing on the front of the radio. A
        connector is a shell with an insulator in it — that is what makes it
        read as a socket rather than as a hole cut in the panel — so the plating
        is now a rim around a dark insert, and `silver` is a good deal matter
        than it was.
      */}
      <mesh position={[-0.104, 0.022, z + 0.002]} rotation={[Math.PI / 2, 0, 0]} material={mat('silver')}>
        <cylinderGeometry args={[0.0075, 0.0075, 0.005, 20]} />
      </mesh>
      <mesh position={[-0.104, 0.022, z + 0.0046]} material={surfaces.insert}>
        <circleGeometry args={[0.0058, 20]} />
      </mesh>
      {/* The keyway, which is the one mark that says which way round it goes. */}
      <mesh position={[-0.104, 0.0285, z + 0.0047]} material={surfaces.insert}>
        <boxGeometry args={[0.0022, 0.0016, 0.0006]} />
      </mesh>
      <mesh position={[0.104, 0.02, z + 0.001]} rotation={[Math.PI / 2, 0, 0]} material={mat('chassis')}>
        <cylinderGeometry args={[0.0042, 0.0042, 0.004, 14]} />
      </mesh>
    </group>
  )
}

/**
 * A moulded knob: a slightly tapered skirt, a separate face, and on the two that
 * are potentiometers the index line that tells you where they are set.
 *
 * The skirt is open ended and the face is its own disc so that the moulding
 * grain on the side, which wants to run around the knob, is not also wrapped
 * across the front of it.
 */
function Knob({
  x, y, z, r, h, mark = false,
}: {
  x: number
  y: number
  z: number
  r: number
  h: number
  mark?: boolean
}) {
  const face = r * 0.94
  return (
    <group position={[x, y, z]}>
      <mesh rotation={[Math.PI / 2, 0, 0]} material={mat('plastic-knob')}>
        <cylinderGeometry args={[face, r, h, 28, 1, true]} />
      </mesh>
      <mesh position={[0, 0, h / 2]} material={mat('plastic-knob')}>
        <circleGeometry args={[face, 28]} />
      </mesh>
      {mark && (
        // Bone white matte is what that mark is on the real knob, and `insulator`
        // is the only role in the palette that is that colour.
        <mesh position={[0, face * 0.55, h / 2 + 0.0003]} material={mat('insulator')}>
          <boxGeometry args={[0.0011, face * 0.6, 0.0006]} />
        </mesh>
      )}
    </group>
  )
}
