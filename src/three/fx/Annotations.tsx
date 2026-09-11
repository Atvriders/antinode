import { useMemo, useRef } from 'react'
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

/** A label box in viewport pixels. */
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
  const sinceLast = useRef(0)
  const probe = useRef(new Vector3())
  /** Where the camera was, and how far the model was opened, at the last pass. */
  const lastEye = useRef(new Vector3(Infinity, Infinity, Infinity))
  const lastExplode = useRef(Number.NaN)

  /*
   * Which labels are drawn is decided and applied inside one frame, on the DOM
   * rather than through React state.
   *
   * Through state it took a frame to land: measure at frame N, commit at N+1,
   * paint the answer for where things were one frame ago. At sixty frames a
   * second that is invisible; at three, on a machine with no GPU, a frame is a
   * third of a second of movement and two labels sit on top of each other for
   * all of it. Visibility here is a per-frame property of the picture, not
   * application state — nothing else reads it, and no re-render depends on it.
   *
   * Default priority, deliberately. A useFrame with a priority above zero takes
   * over the render loop in react-three-fiber and the scene stops drawing
   * altogether — which it did, silently, while the labels carried on rendering
   * over a black canvas. Ordering against drei's own transform write is not
   * worth that; a label measured one frame late is invisible at any frame rate
   * a person would sit through, and nothing is shown until it has been measured.
   */
  useFrame((_state, delta) => {
    sinceLast.current += delta
    // While anything is moving the answer moves with it, so it is recomputed on
    // the frame rather than on the clock. Both movements count: the camera
    // swings, and in the exploded view the parts slide apart underneath it.
    const moved =
      camera.position.distanceToSquared(lastEye.current) > 1e-8 || explode !== lastExplode.current
    if (!moved && sinceLast.current < DECLUTTER_INTERVAL) return
    sinceLast.current = 0
    lastEye.current.copy(camera.position)
    lastExplode.current = explode

    const boxes: LabelBox[] = []
    const elements = new Map<string, HTMLElement>()
    for (const spec of specs) {
      const el = document.querySelector<HTMLElement>(`[data-testid="callout-${spec.id}"]`)
      if (!el) continue
      elements.set(spec.id, el)
      // Behind the camera, or past the far plane: there is nothing to label, and
      // drei will have parked its element somewhere meaningless.
      const p = probe.current.set(spec.at[0], spec.at[1], spec.at[2]).project(camera)
      if (p.z > 1) continue
      // The box the browser actually laid out. Estimating it from the character
      // count was wrong by a few per cent at one type size and by enough to
      // matter at another, and every correction — letter-spacing, the dot, the
      // padding, the gap — was one more constant mirroring a stylesheet.
      const r = el.getBoundingClientRect()
      if (r.width < 1) continue
      boxes.push({ id: spec.id, left: r.left, right: r.right, top: r.top, bottom: r.bottom })
    }
    // Nothing measurable yet — drei mounts these a frame or two after the scene,
    // and a pass with no boxes would find no labels worth keeping and hide every
    // one of them. No measurement is no information, so last time's set stands.
    if (elements.size === 0) return

    const keep = new Set(withoutCollisions(boxes))
    for (const [id, el] of elements) {
      // The attribute alone; the stylesheet turns it into visibility. An element
      // that has never been through a pass carries no attribute and is hidden by
      // the same rule, so nothing is ever painted unvetted.
      const hide = String(!keep.has(id))
      if (el.dataset.hidden !== hide) el.dataset.hidden = hide
    }
  })

  return (
    <>
      {specs.map((s) => (
        <Callout key={s.id} spec={s} />
      ))}
    </>
  )
}
