import { useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import { Callout } from './Callout'
import type { CalloutSpec } from './Callout'
import { PART_TRANSFORMS } from '../layout'
import { RADIO, DIORAMA, COAX_ROUTE } from '../scene-constants'
import type { ViewId } from '../../content/types'

/**
 * What the LABELS switch turns on.
 *
 * Different views want different labels: on the outside of the radio the useful
 * annotations are the connectors and the panel, inside they are the boards and
 * the finals, and on the station they are the parts of the antenna system that
 * the numbers refer to. Labelling everything everywhere would be a thicket.
 *
 * Which of them fit is a different question, and it is answered in screen space
 * rather than by counting. A label is a fixed number of pixels wide whatever the
 * scene is, so two parts that are a comfortable distance apart on a desk are the
 * same box on a phone, and the same two collide again on any screen once the
 * camera swings so that one sits behind the other. Each frame the anchors are
 * projected, and a label is drawn only if its box is clear of the ones already
 * placed. Earlier in the list wins, so the specs are written most important
 * first.
 */

/*
 * How wide a label will be, measured rather than guessed.
 *
 * A character count times a constant was close enough at one type size and
 * wrong at the other: presenter mode multiplies `--ui-scale` to 1.28 for a
 * projector, and a label that is 27% wider than the box reserved for it goes
 * back to sitting on top of its neighbour — in exactly the configuration this
 * application exists to be shown in. A 2D canvas measures the real string in
 * the real font without touching the DOM or forcing layout, and the answers are
 * cached, so the cost is one measurement per distinct string.
 *
 * These constants mirror callout.module.css. If the box's padding, its gaps or
 * the dot change there, they change here.
 */
const CALLOUT_MARGIN = 8
const CALLOUT_DOT = 5
const CALLOUT_GAP = 6
const TEXT_PADDING = 7
const TEXT_BORDER = 1
const VALUE_GAP = 6
/** `--track-label`, in ems. measureText does not account for letter-spacing. */
const TRACKING_EM = 0.08

type Metrics = { scale: number; panel: string; num: string }

const gauge: CanvasRenderingContext2D | null =
  typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d')
const widths = new Map<string, number>()

function measure(text: string, font: string, size: number): number {
  if (!gauge) return text.length * size * 0.62
  const key = `${font}|${text}`
  const cached = widths.get(key)
  if (cached !== undefined) return cached
  gauge.font = font
  const w = gauge.measureText(text).width + text.length * size * TRACKING_EM
  widths.set(key, w)
  return w
}

/** The type the labels are actually set in, read from the same tokens the CSS uses. */
function metrics(): Metrics {
  if (typeof document === 'undefined') return { scale: 1, panel: '600 10px sans-serif', num: '10px monospace' }
  const root = getComputedStyle(document.documentElement)
  const raw = Number.parseFloat(root.getPropertyValue('--ui-scale'))
  const scale = Number.isFinite(raw) && raw > 0 ? raw : 1
  const size = 10 * scale
  return {
    scale,
    panel: `600 ${size}px ${root.getPropertyValue('--f-panel') || 'sans-serif'}`,
    num: `${size}px ${root.getPropertyValue('--f-num') || 'monospace'}`,
  }
}

function labelWidth(label: string, value: string | undefined, m: Metrics): number {
  const size = 10 * m.scale
  // The label is set in small caps by `text-transform`, so that is what is measured.
  let text = measure(label.toUpperCase(), m.panel, size)
  if (value) text += VALUE_GAP + measure(value, m.num, size)
  return (
    CALLOUT_MARGIN + CALLOUT_DOT + CALLOUT_GAP + (TEXT_BORDER + TEXT_PADDING) * 2 + text
  )
}

/** Label height at that same scale: the line box, its padding and its border. */
const labelHeight = (scale: number) => 10 * scale * 1.35 + 4 + 2

/** A label box in canvas pixels. */
export type LabelBox = { id: string; left: number; right: number; top: number; bottom: number }

/**
 * Which labels can be drawn without any two touching: taken in order, each is
 * kept only if it is clear of everything already kept. Earlier wins, so the
 * specs for each view are written most important first.
 *
 * Pure, so the rule can be checked without a canvas.
 */
export function withoutCollisions(boxes: readonly LabelBox[]): string[] {
  const placed: LabelBox[] = []
  for (const box of boxes) {
    const clashes = placed.some(
      (o) => box.left < o.right && box.right > o.left && box.top < o.bottom && box.bottom > o.top,
    )
    if (clashes) continue
    placed.push(box)
  }
  return placed.map((b) => b.id)
}
/** Recomputed five times a second: the camera moves smoothly, and labels that
 *  appear and disappear at frame rate flicker. */
const DECLUTTER_INTERVAL = 0.2
export function Annotations({
  view,
  explode,
  dieTempC,
  radiatedW,
  swr,
  keyed,
  antennaLabel,
}: {
  view: ViewId
  explode: number
  dieTempC: number
  radiatedW: number
  swr: number
  keyed: boolean
  antennaLabel: string
}) {
  const specs = useMemo<CalloutSpec[]>(() => {
    const at = (id: string): [number, number, number] => {
      const t = PART_TRANSFORMS[id]
      if (!t) return [0, 0, 0]
      return [
        t.pos[0] + t.explode[0] * explode,
        t.pos[1] + t.explode[1] * explode + RADIO.footHeight,
        t.pos[2] + t.explode[2] * explode,
      ]
    }
    const hot = dieTempC > 90

    if (view === 'station') {
      const feed = COAX_ROUTE[COAX_ROUTE.length - 1] ?? [0, 0, 0]
      const mid = COAX_ROUTE[Math.floor(COAX_ROUTE.length / 2)] ?? [0, 0, 0]
      return [
        { id: 'radio', at: [0, RADIO.height + 0.03, 0], label: 'Radio', value: keyed ? 'on air' : 'receiving' },
        { id: 'coax', at: [mid[0], mid[1] + 0.05, mid[2]], label: 'Feedline', value: `${swr.toFixed(2)}:1 at the rig` },
        { id: 'feed', at: [feed[0], feed[1] + 0.06, feed[2]], label: 'Feedpoint' },
        {
          id: 'ant',
          at: [DIORAMA.centre[0], DIORAMA.centre[1] + 0.62, DIORAMA.centre[2]],
          label: antennaLabel,
          value: keyed ? `${radiatedW.toFixed(0)} W radiated` : undefined,
          tone: 'signal',
        },
        {
          id: 'scale',
          at: [DIORAMA.centre[0] - DIORAMA.plinth.w / 2 + 0.1, DIORAMA.centre[1] + 0.03, DIORAMA.centre[2] + DIORAMA.plinth.d / 2],
          label: `Antenna shown at 1:${Math.round(1 / DIORAMA.scale)}`,
        },
      ]
    }

    if (view === 'exterior') {
      return [
        { id: 'screen', at: [RADIO.screen.x, RADIO.screen.y + 0.03, RADIO.frontZ], label: 'Scope and meters' },
        { id: 'dial', at: [RADIO.dial.x, RADIO.dial.y + 0.03, RADIO.frontZ], label: 'Tuning dial' },
        { id: 'so239', at: at('so239'), label: 'Antenna socket', value: 'SO-239' },
        { id: 'fan', at: at('cooling-fan'), label: 'Fan', tone: hot ? 'hot' : 'normal' },
      ]
    }

    // Inside the radio: the boards, the amplifier chain and the parts a mismatch
    // actually reaches.
    return [
      { id: 'fpga', at: at('fpga'), label: 'FPGA', value: 'EP4CE55' },
      { id: 'bpf', at: at('bpf-bank'), label: 'Band-pass filters' },
      { id: 'driver', at: at('driver'), label: 'Driver', value: 'RD15HVF1' },
      {
        id: 'finals',
        at: at('final-q1'),
        label: 'Finals',
        value: `${dieTempC.toFixed(0)} °C die`,
        tone: hot ? 'hot' : 'signal',
      },
      { id: 'heatsink', at: at('pa-heatsink'), label: 'Heatsink', tone: hot ? 'hot' : 'normal' },
      { id: 'lpf', at: at('lpf-relay'), label: 'Low-pass filters' },
      { id: 'coupler', at: at('swr-coupler'), label: 'SWR bridge', value: `${swr.toFixed(2)}:1` },
      { id: 'atu', at: at('atu-inductor'), label: 'Tuner' },
    ]
  }, [view, explode, dieTempC, radiatedW, swr, keyed, antennaLabel])

  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)
  // Keyed by which labels there are, not by the array holding them: the specs
  // carry live figures, so the array is rebuilt whenever the temperature moves,
  // while the set of labels only changes when the view does. A new view shows
  // everything until this frame's pass has run against it — a set that is
  // briefly too crowded reads better than a frame with nothing on it.
  const key = specs.map((s) => s.id).join('|')
  const [placed, setPlaced] = useState<{ of: string; ids: string[] }>(() => ({
    of: key,
    ids: specs.map((s) => s.id),
  }))
  const sinceLast = useRef(0)
  const probe = useRef(new Vector3())

  // The seconds since the last pass, accumulated from the delta the render loop
  // already computed. `clock.getElapsedTime()` would read the same number, but
  // it advances the Clock's own `oldTime` as a side effect, which leaves a
  // near-zero delta for anything else that asks the Clock later in the frame.
  useFrame((_state, delta) => {
    const stale = placed.of !== key
    sinceLast.current += delta
    if (!stale && sinceLast.current < DECLUTTER_INTERVAL) return
    sinceLast.current = 0

    // Read once per pass, not per label: it is a computed-style read.
    const m = metrics()
    const half = labelHeight(m.scale) / 2
    const boxes: LabelBox[] = []
    for (const spec of specs) {
      const p = probe.current.set(spec.at[0], spec.at[1], spec.at[2]).project(camera)
      // Behind the camera, or past the far plane: there is nothing to label.
      if (p.z > 1) continue
      const x = (p.x * 0.5 + 0.5) * size.width
      const y = (-p.y * 0.5 + 0.5) * size.height
      boxes.push({
        id: spec.id,
        left: x,
        right: x + labelWidth(spec.label, spec.value, m),
        top: y - half,
        bottom: y + half,
      })
    }
    const keep = withoutCollisions(boxes)

    setPlaced((prev) =>
      prev.of === key && prev.ids.length === keep.length && prev.ids.every((id, i) => id === keep[i])
        ? prev
        : { of: key, ids: keep },
    )
  })

  const shown = placed.of === key ? specs.filter((s) => placed.ids.includes(s.id)) : specs

  return (
    <>
      {shown.map((s) => (
        <Callout key={s.id} spec={s} />
      ))}
    </>
  )
}
