import { useMemo } from 'react'
import * as THREE from 'three'
import { DIORAMA } from '../scene-constants'
import { mat } from '../materials'
import type { AntennaId } from '../../rf/types'

export interface AntennaModelProps {
  id: AntennaId
  params: Readonly<Record<string, number>>
  /** 0..1 radiated-power indicator, drives the radiation glow. */
  radiation: number
  /** 0..1 heating of the matching device. */
  matchHeat: number
}

const S = DIORAMA.scale
const p = (params: Readonly<Record<string, number>>, key: string, fallback: number): number => {
  const v = params[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

/**
 * A procedural model for every antenna.
 *
 * These have to respond to the reader's own parameters — pulling a dipole
 * shorter must visibly shorten the wire, adding radials must draw more radials,
 * turning a loop's capacitor must turn the vernier. If the picture does not move
 * when the number does, the reader learns that the number is decoration.
 */
export function AntennaModel({ id, params, matchHeat }: AntennaModelProps) {
  switch (id) {
    case 'dummy-load':
      return <DummyLoad heat={matchHeat} />
    case 'dipole-40':
    case 'dipole-20':
      return <Dipole length={p(params, 'length', 20)} height={p(params, 'height', 10)} />
    case 'fan-dipole':
      return <FanDipole length={p(params, 'length', 20)} height={p(params, 'height', 10)} />
    case 'efhw-40':
      return <EndFed length={p(params, 'length', 20.7)} heat={matchHeat} />
    case 'g5rv':
      return <G5rv height={p(params, 'height', 11)} ladder={p(params, 'ladderLength', 9.1)} />
    case 'ocf-windom':
      return <Ocf length={p(params, 'length', 20.1)} offset={p(params, 'offset', 1 / 3)} heat={matchHeat} />
    case 'vertical-quarter-40':
    case 'vertical-multiband':
      return <Vertical height={p(params, 'height', 10)} />
    case 'random-wire-9to1':
      return <RandomWire length={p(params, 'length', 18)} heat={matchHeat} />
    case 'mag-loop':
      return <MagLoop diameter={p(params, 'diameter', 1)} tune={p(params, 'capacitance', 100)} />
    case 'mobile-whip-20':
      return <Whip height={p(params, 'height', 2.6)} coil={0.55} />
    case 'screwdriver-mobile':
      return <Whip height={p(params, 'height', 2.6)} coil={p(params, 'coilPosition', 0.36)} screwdriver />
    case 'yagi-3el-20':
      return <Yagi driven={p(params, 'driven', 9.5)} height={p(params, 'height', 15)} />
    default:
      return null
  }
}

// ─── Shared pieces ───────────────────────────────────────────────────────────

function Mast({ height, guys = true }: { height: number; guys?: boolean }) {
  const h = height * S
  return (
    <group>
      <mesh position={[0, h / 2, 0]} castShadow material={mat('anodised')}>
        <cylinderGeometry args={[0.004, 0.006, h, 10]} />
      </mesh>
      {guys &&
        [0, 2.09, 4.19].map((a, i) => (
          <mesh
            key={i}
            position={[(Math.cos(a) * h * 0.35) / 2, h * 0.35, (Math.sin(a) * h * 0.35) / 2]}
            rotation={[0, -a, Math.atan2(h * 0.35, h * 0.7)]}
            material={mat('wire')}
          >
            <cylinderGeometry args={[0.0011, 0.0011, h * 0.8, 5]} />
          </mesh>
        ))}
    </group>
  )
}

function Wire({ from, to, sag = 0.35 }: { from: [number, number, number]; to: [number, number, number]; sag?: number }) {
  const curve = useMemo(() => {
    const a = new THREE.Vector3(...from)
    const b = new THREE.Vector3(...to)
    const mid = a.clone().lerp(b, 0.5)
    mid.y -= a.distanceTo(b) * sag * 0.08
    return new THREE.CatmullRomCurve3([a, mid, b])
  }, [from, to, sag])
  return (
    <mesh material={mat('wire')} castShadow>
      <tubeGeometry args={[curve, 28, 0.0022, 6, false]} />
    </mesh>
  )
}

function Insulator({ at }: { at: [number, number, number] }) {
  return (
    <mesh position={at} material={mat('insulator')}>
      <cylinderGeometry args={[0.0022, 0.0022, 0.008, 8]} />
    </mesh>
  )
}

/** A matching transformer in a box, with its toroid showing through. */
function MatchBox({ at, heat }: { at: [number, number, number]; heat: number }) {
  const hot = Math.max(0, Math.min(1, heat))
  return (
    <group position={at}>
      <mesh castShadow material={mat('device')}>
        <boxGeometry args={[0.02, 0.026, 0.014]} />
      </mesh>
      <mesh position={[0, 0, 0.008]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.005, 0.002, 8, 16]} />
        <meshStandardMaterial
          color="#241f22"
          emissive={new THREE.Color(0.9, 0.25, 0.1)}
          emissiveIntensity={hot * 1.8}
          roughness={0.8}
        />
      </mesh>
    </group>
  )
}

// ─── The antennas ────────────────────────────────────────────────────────────

function DummyLoad({ heat }: { heat: number }) {
  return (
    <group position={[0, 0.03, 0]}>
      {/* A finned can on the bench. It is a perfect match and radiates nothing,
          which is the entire reason it is in the list. */}
      <mesh castShadow material={mat('heatsink')}>
        <cylinderGeometry args={[0.028, 0.032, 0.05, 20]} />
      </mesh>
      {Array.from({ length: 16 }, (_, i) => (
        <mesh key={i} rotation={[0, (i / 16) * Math.PI * 2, 0]} position={[0, 0, 0]}>
          <boxGeometry args={[0.072, 0.046, 0.0015]} />
          <meshStandardMaterial
            color="#39434a"
            metalness={0.7}
            roughness={0.4}
            emissive={new THREE.Color(0.9, 0.3, 0.1)}
            emissiveIntensity={Math.max(0, Math.min(1, heat)) * 0.9}
          />
        </mesh>
      ))}
      <mesh position={[0, -0.03, 0]} material={mat('silver')}>
        <cylinderGeometry args={[0.008, 0.008, 0.012, 16]} />
      </mesh>
    </group>
  )
}

function Dipole({ length, height }: { length: number; height: number }) {
  const half = (length * S) / 2
  const h = height * S
  return (
    <group>
      <Mast height={height} />
      <Wire from={[-half, h, 0]} to={[0, h, 0]} />
      <Wire from={[0, h, 0]} to={[half, h, 0]} />
      <Insulator at={[-half, h, 0]} />
      <Insulator at={[half, h, 0]} />
      <Insulator at={[0, h, 0]} />
      {/* Support poles at the ends, because a dipole has to hang off something. */}
      <mesh position={[-half, (h * 0.82) / 2, 0]} material={mat('anodised')}>
        <cylinderGeometry args={[0.002, 0.003, h * 0.82, 8]} />
      </mesh>
      <mesh position={[half, (h * 0.82) / 2, 0]} material={mat('anodised')}>
        <cylinderGeometry args={[0.002, 0.003, h * 0.82, 8]} />
      </mesh>
    </group>
  )
}

function FanDipole({ length, height }: { length: number; height: number }) {
  const h = height * S
  const bands = [1, 0.5, 0.34, 0.25]
  return (
    <group>
      <Mast height={height} />
      {bands.map((f, i) => {
        const half = (length * S * f) / 2
        const spread = (i - 1.5) * 0.012
        return (
          <group key={f}>
            <Wire from={[-half, h + spread, spread]} to={[0, h, 0]} />
            <Wire from={[0, h, 0]} to={[half, h + spread, spread]} />
            <Insulator at={[-half, h + spread, spread]} />
            <Insulator at={[half, h + spread, spread]} />
          </group>
        )
      })}
    </group>
  )
}

function EndFed({ length, heat }: { length: number; heat: number }) {
  const l = length * S
  return (
    <group>
      <Mast height={11} />
      <MatchBox at={[0, 0.05, 0]} heat={heat} />
      <Wire from={[0, 0.07, 0]} to={[l, 11 * S, 0]} sag={0.6} />
      <Insulator at={[l, 11 * S, 0]} />
      <mesh position={[l, (11 * S * 0.9) / 2, 0]} material={mat('anodised')}>
        <cylinderGeometry args={[0.002, 0.003, 11 * S * 0.9, 8]} />
      </mesh>
    </group>
  )
}

function G5rv({ height, ladder: ladderM }: { height: number; ladder: number }) {
  const half = (31.1 * S) / 2
  const h = height * S
  const ladder = ladderM * S
  return (
    <group>
      <Mast height={height} />
      <Wire from={[-half, h, 0]} to={[half, h, 0]} sag={0.5} />
      <Insulator at={[-half, h, 0]} />
      <Insulator at={[half, h, 0]} />
      {/* The ladder line: two conductors with visible spacers, which is what
          makes a G5RV a G5RV rather than a dipole. */}
      {[-0.004, 0.004].map((dx) => (
        <mesh key={dx} position={[dx, h - ladder / 2, 0]} material={mat('wire')}>
          <cylinderGeometry args={[0.0014, 0.0014, ladder, 6]} />
        </mesh>
      ))}
      {Array.from({ length: 6 }, (_, i) => (
        <mesh key={i} position={[0, h - (ladder * (i + 0.5)) / 6, 0]} rotation={[0, 0, Math.PI / 2]} material={mat('insulator')}>
          <boxGeometry args={[0.0015, 0.009, 0.0015]} />
        </mesh>
      ))}
    </group>
  )
}

function Ocf({ length, offset, heat }: { length: number; offset: number; heat: number }) {
  const l = length * S
  const h = 11 * S
  const feed = -l / 2 + l * Math.max(0.05, Math.min(0.95, offset))
  return (
    <group>
      <Mast height={11} />
      <Wire from={[-l / 2, h, 0]} to={[feed, h, 0]} />
      <Wire from={[feed, h, 0]} to={[l / 2, h, 0]} />
      <Insulator at={[-l / 2, h, 0]} />
      <Insulator at={[l / 2, h, 0]} />
      <MatchBox at={[feed, h - 0.014, 0]} heat={heat} />
    </group>
  )
}

function Vertical({ height }: { height: number }) {
  const h = height * S
  return (
    <group>
      <mesh position={[0, h / 2, 0]} castShadow material={mat('anodised')}>
        <cylinderGeometry args={[0.0022, 0.0045, h, 12]} />
      </mesh>
      {/* Base insulator: the radiator must not be bonded to the ground system. */}
      <mesh position={[0, 0.006, 0]} material={mat('insulator')}>
        <cylinderGeometry args={[0.006, 0.006, 0.012, 12]} />
      </mesh>
    </group>
  )
}

function RandomWire({ length, heat }: { length: number; heat: number }) {
  const l = length * S
  return (
    <group>
      <MatchBox at={[0, 0.03, 0]} heat={heat} />
      <Wire from={[0, 0.05, 0]} to={[l * 0.8, 9 * S, l * 0.2]} sag={0.8} />
      <mesh position={[l * 0.8, (9 * S) / 2, l * 0.2]} material={mat('anodised')}>
        <cylinderGeometry args={[0.002, 0.003, 9 * S, 8]} />
      </mesh>
      {/* The counterpoise, which is doing at least as much work as the wire. */}
      <Wire from={[0, 0.02, 0]} to={[-l * 0.4, 0.004, l * 0.3]} sag={0.2} />
    </group>
  )
}

function MagLoop({ diameter, tune }: { diameter: number; tune: number }) {
  const r = (diameter * S) / 2
  // The vernier turns as the capacitor is tuned: the reader is moving a real
  // shaft, and a loop's whole character is that a few degrees changes everything.
  const angle = (Math.max(10, Math.min(400, tune)) / 400) * Math.PI * 4
  return (
    <group position={[0, r + 0.03, 0]}>
      <mesh rotation={[0, Math.PI / 2, 0]} castShadow material={mat('copper')}>
        <torusGeometry args={[r, 0.0035, 10, 44, Math.PI * 1.86]} />
      </mesh>
      {/* Vacuum capacitor across the gap at the top. */}
      <group position={[0, r, 0]}>
        <mesh material={mat('silver')}>
          <cylinderGeometry args={[0.008, 0.008, 0.02, 16]} />
        </mesh>
        <mesh position={[0, 0.014, 0]} rotation={[0, angle, 0]} material={mat('plastic-knob')}>
          <boxGeometry args={[0.016, 0.003, 0.003]} />
        </mesh>
      </group>
      {/* Coupling loop: one fifth the diameter, at the bottom. */}
      <mesh position={[0, -r + r * 0.2, 0]} rotation={[0, Math.PI / 2, 0]} material={mat('copper')}>
        <torusGeometry args={[r * 0.2, 0.0015, 8, 24]} />
      </mesh>
      <mesh position={[0, -r - 0.015, 0]} material={mat('anodised')}>
        <cylinderGeometry args={[0.004, 0.006, 0.03, 8]} />
      </mesh>
    </group>
  )
}

function Whip({ height, coil, screwdriver = false }: { height: number; coil: number; screwdriver?: boolean }) {
  const h = height * S
  const coilY = h * Math.max(0.05, Math.min(0.95, screwdriver ? 0.2 + coil * 0.5 : 0.5))
  return (
    <group>
      {/* A suggestion of a vehicle: the ground plane the whip works against, and
          the reason its efficiency is what it is. */}
      <mesh position={[0, 0.012, 0]} material={mat('anodised')}>
        <boxGeometry args={[0.16, 0.024, 0.075]} />
      </mesh>
      <mesh position={[0, 0.03, 0]} material={mat('screen')}>
        <boxGeometry args={[0.09, 0.018, 0.07]} />
      </mesh>
      <mesh position={[0.07, 0.03, 0]} castShadow material={mat('anodised')}>
        <cylinderGeometry args={[0.0018, 0.0022, h * 0.5, 8]} />
      </mesh>
      <group position={[0.07, 0.03 + coilY * 0.5, 0]}>
        <mesh castShadow material={mat('copper')}>
          <cylinderGeometry args={[0.006, 0.006, 0.018, 14]} />
        </mesh>
        {screwdriver && (
          <mesh position={[0, -0.014, 0]} material={mat('device')}>
            <cylinderGeometry args={[0.007, 0.007, 0.012, 12]} />
          </mesh>
        )}
      </group>
      <mesh position={[0.07, 0.03 + coilY * 0.5 + h * 0.28, 0]} castShadow material={mat('anodised')}>
        <cylinderGeometry args={[0.0008, 0.0015, h * 0.5, 6]} />
      </mesh>
    </group>
  )
}

function Yagi({ driven, height }: { driven: number; height: number }) {
  const h = height * S
  const boom = 7 * S
  const elements: [number, number][] = [
    [-boom * 0.4, driven * 1.05],
    [0, driven],
    [boom * 0.45, driven * 0.94],
  ]
  return (
    <group>
      <Mast height={height} guys />
      <group position={[0, h, 0]}>
        <mesh rotation={[0, 0, 0]} castShadow material={mat('anodised')}>
          <cylinderGeometry args={[0.0035, 0.0035, boom, 10]} />
        </mesh>
      </group>
      <group position={[0, h, 0]} rotation={[0, Math.PI / 2, 0]}>
        {elements.map(([z, len], i) => (
          <mesh key={`e${i}`} position={[z, 0, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow material={mat('anodised')}>
            <cylinderGeometry args={[0.0022, 0.0022, len * S, 10]} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

/**
 * Where each antenna actually radiates from, in plinth-local metres.
 *
 * The wavefronts have to leave the antenna, not a fixed point above the plinth.
 * An earlier version took the `height` parameter and clamped it, which pinned
 * the origin at the equivalent of seven metres: raising a Yagi past that left
 * the waves coming out of the empty air where the antenna used to be, and every
 * antenna without a `height` parameter — the mag loop, the mobile whips, the
 * dummy load — radiated from the ground.
 *
 * This lives beside the models rather than in Station so the two cannot drift:
 * if a model's geometry moves, this is in the same file and moves with it.
 */
export function radiationOrigin(
  id: AntennaId,
  params: Readonly<Record<string, number>>,
): [number, number, number] {
  const height = p(params, 'height', 10)
  const h = height * S

  switch (id) {
    case 'dummy-load':
      // It does not radiate. The origin only has to be somewhere sensible.
      return [0, 0.03, 0]

    case 'dipole-40':
    case 'dipole-20':
    case 'fan-dipole':
    case 'g5rv':
      // Fed at the centre of the flat top.
      return [0, h, 0]

    case 'ocf-windom': {
      const l = p(params, 'length', 20.1) * S
      const offset = Math.max(0.05, Math.min(0.95, p(params, 'offset', 1 / 3)))
      return [-l / 2 + l * offset, 11 * S, 0]
    }

    case 'efhw-40': {
      // A sloping wire radiates along its length; the middle is the fair point.
      const l = p(params, 'length', 20.7) * S
      return [l / 2, (0.07 + 11 * S) / 2, 0]
    }

    case 'random-wire-9to1': {
      const l = p(params, 'length', 18) * S
      return [(l * 0.8) / 2, (0.05 + 9 * S) / 2, (l * 0.2) / 2]
    }

    case 'vertical-quarter-40':
    case 'vertical-multiband':
      // A quarter-wave vertical's current maximum is at its base; the radiating
      // centre of the whole radiator sits around a third of the way up.
      return [0, h * 0.35, 0]

    case 'mag-loop': {
      const r = (p(params, 'diameter', 1) * S) / 2
      return [0, r + 0.03, 0]
    }

    case 'mobile-whip-20':
    case 'screwdriver-mobile':
      // Above the vehicle, around the loading coil where the current is highest.
      return [0.07, 0.03 + h * 0.3, 0]

    case 'yagi-3el-20':
      return [0, h, 0]

    default:
      return [0, h, 0]
  }
}
