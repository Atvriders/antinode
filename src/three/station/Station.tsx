import { useMemo } from 'react'
import { Bench } from './Bench'
import { Ground } from './Ground'
import { AntennaModel, radiationOrigin } from './Antennas'
import { Wavefronts } from '../fx/Wavefronts'
import { DIORAMA } from '../scene-constants'
import type { AntennaId } from '../../rf/types'

export interface StationProps {
  antennaId: AntennaId
  params: Readonly<Record<string, number>>
  radiation: number
  matchHeat: number
  showLabels: boolean
  wavelengthM: number
  reducedMotion: boolean
}

const GROUND_MOUNTED: readonly AntennaId[] = ['vertical-quarter-40', 'vertical-multiband', 'random-wire-9to1']

/**
 * The station: the bench, the plinth, the antenna, and the field leaving it.
 *
 * The whole diorama is one scaled group. Its `scale` is the honest statement
 * that a 20 m wire and a 24 cm radio are not the same size, made once and in one
 * place rather than fudged per model.
 */
export function Station({ antennaId, params, radiation, matchHeat, wavelengthM, reducedMotion }: StationProps) {
  const radials = useMemo(() => {
    if (!GROUND_MOUNTED.includes(antennaId)) return 0
    const n = params['radials']
    return typeof n === 'number' && Number.isFinite(n) ? n : 0
  }, [antennaId, params])

  // Where the waves leave from. Per antenna, and never clamped: a Yagi raised to
  // the top of its range must radiate from the top of its mast.
  const origin = useMemo(() => radiationOrigin(antennaId, params), [antennaId, params])

  return (
    <group>
      <Bench />
      <group position={[...DIORAMA.centre]}>
        <Ground radials={radials} showEarth={GROUND_MOUNTED.includes(antennaId)} />
        <group position={[0, DIORAMA.plinth.h, 0]}>
          <AntennaModel id={antennaId} params={params} radiation={radiation} matchHeat={matchHeat} />
          <Wavefronts
            origin={origin}
            strength={radiation}
            wavelengthM={wavelengthM}
            reducedMotion={reducedMotion}
          />
        </group>
      </group>
    </group>
  )
}
