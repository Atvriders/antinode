import { useMemo } from 'react'
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
 */
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

  return (
    <>
      {specs.map((s) => (
        <Callout key={s.id} spec={s} />
      ))}
    </>
  )
}
