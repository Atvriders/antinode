import { describe, expect, it } from 'vitest'
import { radiationOrigin } from '../src/three/station/Antennas'
import { ANTENNA_LIST, defaultParams } from '../src/rf/antennas'
import { DIORAMA } from '../src/three/scene-constants'

/**
 * The radiated wavefronts have to come out of the antenna.
 *
 * Reported from a live deployment: raising a Yagi to maximum height left the
 * waves still leaving from the original point. The origin was the `height`
 * parameter passed through Math.min(0.5, ...), which pins at the equivalent of
 * seven metres — so every antenna above that radiated from the same spot, and
 * every antenna without a `height` parameter radiated from the ground.
 */
describe('where the wavefronts leave from', () => {
  it('follows a mast all the way up', () => {
    const low = radiationOrigin('yagi-3el-20', { ...defaultParams('yagi-3el-20'), height: 8 })
    const high = radiationOrigin('yagi-3el-20', { ...defaultParams('yagi-3el-20'), height: 30 })
    expect(high[1]).toBeGreaterThan(low[1])
    // And it is not being clamped somewhere in the middle.
    expect(high[1]).toBeCloseTo(30 * DIORAMA.scale, 6)
    expect(low[1]).toBeCloseTo(8 * DIORAMA.scale, 6)
  })

  it('rises monotonically across the whole height range, with no ceiling', () => {
    for (const id of ['yagi-3el-20', 'dipole-20', 'dipole-40', 'g5rv'] as const) {
      let previous = -Infinity
      for (const height of [3, 6, 9, 12, 18, 24, 30, 40]) {
        const y = radiationOrigin(id, { ...defaultParams(id), height })[1]
        expect(y, `${id} at ${height} m`).toBeGreaterThan(previous)
        previous = y
      }
    }
  })

  it('puts every antenna somewhere on itself, not at the origin', () => {
    for (const def of ANTENNA_LIST) {
      const at = radiationOrigin(def.id, defaultParams(def.id))
      for (const v of at) expect(Number.isFinite(v), def.id).toBe(true)
      // Nothing radiates from below the plinth, and nothing is left at zero
      // height by accident.
      expect(at[1], `${def.id} radiates from ground level`).toBeGreaterThan(0.005)
      // Nor from implausibly far away: the diorama is about 1.5 m across.
      expect(Math.abs(at[0]), def.id).toBeLessThan(1.5)
      expect(at[1], def.id).toBeLessThan(4)
    }
  })

  it('keeps a ground-mounted vertical low and a high dipole high', () => {
    const vertical = radiationOrigin('vertical-quarter-40', defaultParams('vertical-quarter-40'))
    const dipole = radiationOrigin('dipole-20', { ...defaultParams('dipole-20'), height: 20 })
    expect(vertical[1]).toBeLessThan(dipole[1])
  })
})
