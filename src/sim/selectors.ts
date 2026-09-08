/**
 * Narrow selectors.
 *
 * The store changes sixty times a second while transmitting. A component that
 * subscribes to the whole state re-renders sixty times a second with it, and the
 * interface starts dropping frames on the machine at the front of the room.
 * Every panel should subscribe through one of these instead.
 */

import { useStation } from './store'
import type { StageId } from '../rf/types'

export const useFreq = () => useStation((s) => s.config.freqHz)
export const useKeyed = () => useStation((s) => s.config.keyed)
export const useView = () => useStation((s) => s.view)
export const useMeters = () => useStation((s) => s.meters)
export const useProtectionLevel = () => useStation((s) => s.solution.pa.protection.level)

/** The SWR the radio's own bridge reads, damped by the meter's ballistics. */
export const useRadioSwr = () => useStation((s) => s.meters.swr)

/** The SWR at the feedpoint. The gap between this and the one above is the lesson. */
export const useAntennaSwr = () => useStation((s) => s.solution.antennaMatch.swr)

export const useStage = (id: StageId) =>
  useStation((s) => s.solution.stages.find((stage) => stage.id === id))

/** Heat per part id, 0..1, for the thermal view and the 3D materials. */
export const usePartHeat = () => useStation((s) => s.thermal.temps)

export const useDamage = () => useStation((s) => s.thermal.damage)

export const useTourStep = () => useStation((s) => s.tourIndex)

/** True when anything in the station is being harmed right now. */
export const useIsHarmful = () =>
  useStation((s) => s.solution.stresses.some((stress) => stress.severity > 1))
