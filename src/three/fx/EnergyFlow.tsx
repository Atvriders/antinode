import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { PART_TRANSFORMS } from '../layout'
import { RADIO } from '../scene-constants'
import type { StageState } from '../../rf/types'

/**
 * Energy moving through the radio.
 *
 * The point of the signal-path view is that a signal goes somewhere, and a still
 * picture of a circuit board does not say that. Markers travel from stage to
 * stage along the physical route the signal takes, and — the part that has to be
 * honest — the NUMBER of markers on each leg follows the level at that stage.
 * The audio side is a trickle, the driver chain a stream, the run to the antenna
 * a flood. Where the chain loses power, fewer markers come out than went in.
 *
 * Colour follows the domain, so the change from audio to digital to RF is
 * visible as a change of substance rather than only of quantity.
 */

const DOMAIN_COLOUR: Readonly<Record<string, string>> = {
  acoustic: '#b9a3d8',
  audio: '#8fd8b4',
  digital: '#c64fa8',
  'rf-low': '#5fd2e8',
  'rf-high': '#f2b441',
  radiated: '#e2622a',
}

/** The physical route, stage by stage, in radio-local coordinates. */
const LEG_PARTS: readonly (readonly [string, string, string])[] = [
  ['mic-preamp', 'mic-capsule', 'mic-preamp-ic'],
  ['af-adc', 'mic-preamp-ic', 'af-codec'],
  ['dsp-tx', 'af-codec', 'fpga'],
  ['tx-dac', 'fpga', 'tx-dac'],
  ['tx-mixer', 'tx-dac', 'pll'],
  ['bpf', 'pll', 'bpf-bank'],
  ['predriver', 'bpf-bank', 'predriver'],
  ['driver', 'predriver', 'driver'],
  ['final-pa', 'driver', 'final-q1'],
  ['lpf-bank', 'final-q1', 'lpf-relay'],
  ['ant-relay', 'lpf-relay', 'ant-relay'],
  ['swr-bridge', 'ant-relay', 'swr-coupler'],
  ['atu', 'swr-coupler', 'atu-inductor'],
  ['so239', 'atu-inductor', 'so239'],
]

const MAX_PER_LEG = 6

interface Leg {
  stageId: string
  from: THREE.Vector3
  to: THREE.Vector3
  domain: string
}

export function EnergyFlow({
  stages,
  active,
  reducedMotion,
}: {
  stages: readonly StageState[]
  active: boolean
  reducedMotion: boolean
}) {
  const legs = useMemo<Leg[]>(() => {
    const at = (id: string) => {
      const t = PART_TRANSFORMS[id]
      return new THREE.Vector3(
        t?.pos[0] ?? 0,
        (t?.pos[1] ?? 0) + RADIO.footHeight,
        t?.pos[2] ?? 0,
      )
    }
    return LEG_PARTS.map(([stageId, a, b]) => ({
      stageId,
      from: at(a),
      to: at(b),
      domain: DOMAIN_FOR[stageId] ?? 'rf-low',
    }))
  }, [])

  const total = legs.length * MAX_PER_LEG
  const mesh = useRef<THREE.InstancedMesh>(null)
  const phase = useRef(0)
  const scratch = useMemo(() => ({ m: new THREE.Matrix4(), v: new THREE.Vector3(), c: new THREE.Color() }), [])

  const geometry = useMemo(() => new THREE.SphereGeometry(0.0022, 6, 5), [])
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 0.95 }),
    [],
  )

  useFrame((_, dt) => {
    const inst = mesh.current
    if (!inst) return
    if (!reducedMotion && active) phase.current = (phase.current + dt * 0.55) % 1

    const byId = new Map(stages.map((s) => [s.id, s]))
    let i = 0
    for (const leg of legs) {
      const state = byId.get(leg.stageId as StageState['id'])
      const level = active ? Math.max(0, Math.min(1, state?.activity ?? 0)) : 0
      // Honest quantity: the number of markers in flight IS the level here.
      const count = level <= 0.01 ? 0 : Math.max(1, Math.round(level * MAX_PER_LEG))
      scratch.c.set(DOMAIN_COLOUR[leg.domain] ?? '#5fd2e8')
      for (let k = 0; k < MAX_PER_LEG; k++) {
        if (k < count) {
          const t = ((k / MAX_PER_LEG) + phase.current) % 1
          scratch.v.lerpVectors(leg.from, leg.to, t)
          scratch.m.makeTranslation(scratch.v.x, scratch.v.y, scratch.v.z)
        } else {
          // Parked far away rather than scaled to zero: a zero-scale matrix
          // still costs a draw and can produce degenerate normals.
          scratch.m.makeTranslation(0, -99, 0)
        }
        inst.setMatrixAt(i, scratch.m)
        inst.setColorAt(i, scratch.c)
        i++
      }
    }
    inst.instanceMatrix.needsUpdate = true
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true
  })

  return (
    <instancedMesh ref={mesh} args={[geometry, material, total]} frustumCulled={false} />
  )
}

const DOMAIN_FOR: Readonly<Record<string, string>> = {
  'mic-preamp': 'audio',
  'af-adc': 'audio',
  'dsp-tx': 'digital',
  'tx-dac': 'digital',
  'tx-mixer': 'rf-low',
  bpf: 'rf-low',
  predriver: 'rf-low',
  driver: 'rf-high',
  'final-pa': 'rf-high',
  'lpf-bank': 'rf-high',
  'ant-relay': 'rf-high',
  'swr-bridge': 'rf-high',
  atu: 'rf-high',
  so239: 'radiated',
}
