import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { COAX_ROUTE } from '../scene-constants'
import { heatColor } from '../materials'
import type { StandingWaveProfile } from '../../rf/types'

export interface FeedlineProps {
  profile: StandingWaveProfile
  /** Real cable length in metres; the drawn run is a compressed representation. */
  lengthM: number
  swr: number
  forwardW: number
  /** 0 = idle, 1 = transmitting. */
  active: number
  reducedMotion: boolean
  showEnvelope: boolean
}

/** Below this working level the line is drawn on the phosphor scale, not the heat ramp. */
const COOL_LIMIT = 0.45

const SEGMENTS = 220
const RADIAL = 10
// Coax drawn a little over scale so the envelope is legible at a distance, but
// not so far over that it reads as a garden hose next to a 24 cm radio.
const BASE_RADIUS = 0.0036

/**
 * The feedline, and the standing wave on it. This is the signature of the whole
 * application.
 *
 * The tube's radius is modulated by the voltage envelope the physics computed,
 * so a voltage antinode is visibly fat and a node is visibly pinched, and the
 * colour walks the heat ramp with LOCAL stress rather than with a single global
 * SWR number — so you can see where on the line the trouble is, which a meter
 * reading can never show you.
 *
 * At 1:1 the tube is perfectly smooth and the flow runs one way. Everything the
 * app is trying to teach is in the difference between those two pictures.
 *
 * Geometry is built once and the vertex positions are rewritten in place each
 * time the profile changes. Nothing is allocated in the frame loop.
 */
export function Feedline({ profile, lengthM, swr, forwardW, active, reducedMotion, showEnvelope }: FeedlineProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const flow = useRef(0)

  const curve = useMemo(
    () => new THREE.CatmullRomCurve3(COAX_ROUTE.map((p) => new THREE.Vector3(p[0], p[1], p[2]))),
    [],
  )

  /** Frames along the curve, computed once: position, tangent, normal, binormal. */
  const frames = useMemo(() => curve.computeFrenetFrames(SEGMENTS, false), [curve])
  const points = useMemo(() => curve.getSpacedPoints(SEGMENTS), [curve])

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const vertexCount = (SEGMENTS + 1) * (RADIAL + 1)
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3))
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3))
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3))
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(vertexCount * 2), 2))

    const index: number[] = []
    for (let i = 0; i < SEGMENTS; i++) {
      for (let j = 0; j < RADIAL; j++) {
        const a = i * (RADIAL + 1) + j
        const b = (i + 1) * (RADIAL + 1) + j
        index.push(a, b, a + 1, b, b + 1, a + 1)
      }
    }
    g.setIndex(index)
    return g
  }, [])

  useEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.55,
        metalness: 0.15,
        emissiveIntensity: 1,
        emissive: new THREE.Color(0x000000),
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])

  const scratch = useMemo(
    () => ({
      v: new THREE.Vector3(),
      n: new THREE.Vector3(),
      colour: new THREE.Color(),
      idle: new THREE.Color('#101314'),
      cool: new THREE.Color('#2e6e7c'),
      live: new THREE.Color('#5fd2e8'),
    }),
    [],
  )

  /** Rebuild the tube whenever the envelope, the drive or the flow phase moves. */
  const rebuild = (flowPhase: number) => {
    const mesh = meshRef.current
    if (!mesh) return
    const pos = geometry.getAttribute('position') as THREE.BufferAttribute
    const nrm = geometry.getAttribute('normal') as THREE.BufferAttribute
    const col = geometry.getAttribute('color') as THREE.BufferAttribute

    const n = profile.vMag.length
    const hasWave = n > 1 && showEnvelope && active > 0.01

    for (let i = 0; i <= SEGMENTS; i++) {
      const t = i / SEGMENTS
      const p = points[i]
      const normal = frames.normals[i]
      const binormal = frames.binormals[i]
      if (!p || !normal || !binormal) continue

      // The drawn run is a compressed representation of the real cable, so map
      // the tube parameter onto the profile by fraction of the REAL length. The
      // radio is at t = 0 here and the antenna at t = 1; the profile runs the
      // other way, hence the flip.
      let env = 0
      let iMag = 0
      if (hasWave) {
        const k = Math.min(n - 1, Math.max(0, Math.round((1 - t) * (n - 1))))
        env = profile.vMag[k] ?? 0
        iMag = profile.iMag[k] ?? 0
      }

      const drive = Math.max(0, Math.min(1, active))
      // A travelling component so the standing wave reads as the sum of two
      // waves rather than a frozen bulge.
      const travel = hasWave ? 0.12 * Math.sin((1 - t) * 40 + flowPhase * Math.PI * 2) * drive : 0
      const radius = BASE_RADIUS * (1 + (hasWave ? env * 0.85 + travel * 0.25 : 0))

      // Local stress: voltage stresses the dielectric, current stresses the
      // conductors, and the larger of the two is what the cable feels here.
      // How hard this point on the line is working, 0..1.
      //
      // A well-matched line is not "slightly hot", it is fine, and colouring it
      // amber at 1.4:1 tells the reader that a perfectly ordinary station is in
      // trouble. Nothing enters the heat ramp until the SWR is past about 2:1;
      // below that the line runs along the phosphor scale like every other
      // healthy signal in the application.
      const swrDrive = Math.max(0, Math.log10(Math.max(swr, 1)) / Math.log10(6))
      const local = hasWave ? Math.max(env, iMag) * Math.min(1, swrDrive) : 0
      if (!hasWave) {
        scratch.colour.copy(scratch.idle)
      } else if (local < COOL_LIMIT) {
        // Cool, and brighter where the standing wave piles up, so the shape of
        // the envelope is still readable on a line that is behaving.
        scratch.colour.copy(scratch.cool).lerp(scratch.live, Math.min(1, local / COOL_LIMIT))
      } else {
        heatColor(Math.min(1, (local - COOL_LIMIT) / (1 - COOL_LIMIT)), scratch.colour)
      }

      for (let j = 0; j <= RADIAL; j++) {
        const a = (j / RADIAL) * Math.PI * 2
        const sin = Math.sin(a)
        const cos = -Math.cos(a)
        scratch.n.set(
          cos * normal.x + sin * binormal.x,
          cos * normal.y + sin * binormal.y,
          cos * normal.z + sin * binormal.z,
        )
        scratch.v.copy(p).addScaledVector(scratch.n, radius)
        const idx = i * (RADIAL + 1) + j
        pos.setXYZ(idx, scratch.v.x, scratch.v.y, scratch.v.z)
        nrm.setXYZ(idx, scratch.n.x, scratch.n.y, scratch.n.z)
        col.setXYZ(idx, scratch.colour.r, scratch.colour.g, scratch.colour.b)
      }
    }

    pos.needsUpdate = true
    nrm.needsUpdate = true
    col.needsUpdate = true
    geometry.computeBoundingSphere()
  }

  useFrame((_, dt) => {
    if (!reducedMotion) {
      // Net power flows toward the antenna; the speed says how much.
      flow.current = (flow.current + dt * (0.25 + 0.9 * Math.max(0, Math.min(1, active)))) % 1
    }
    rebuild(flow.current)
  })

  // Voltage antinodes: where the insulation is working hardest. Marked, because
  // "the highest voltage is not at the radio" surprises people.
  const antinodes = profile.antinodes.slice(0, 12)

  return (
    <group name="feedline">
      <mesh ref={meshRef} geometry={geometry} material={material} castShadow />
      {showEnvelope &&
        active > 0.01 &&
        antinodes.map((a, i) => {
          const t = 1 - Math.max(0, Math.min(1, a))
          const p = curve.getPointAt(t)
          return (
            <mesh key={i} position={[p.x, p.y + 0.014, p.z]}>
              <sphereGeometry args={[0.0022, 8, 6]} />
              <meshBasicMaterial color="#f2b441" toneMapped={false} />
            </mesh>
          )
        })}
      <FeedlineEnds forwardW={forwardW} lengthM={lengthM} curve={curve} />
    </group>
  )
}

/** The connectors at each end. A run of coax is two connectors and some cable. */
function FeedlineEnds({ curve }: { forwardW: number; lengthM: number; curve: THREE.CatmullRomCurve3 }) {
  const a = curve.getPointAt(0)
  const b = curve.getPointAt(1)
  return (
    <group>
      <mesh position={[a.x, a.y, a.z]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.0075, 0.0075, 0.014, 14]} />
        <meshStandardMaterial color="#c9d2d6" metalness={0.95} roughness={0.28} />
      </mesh>
      <mesh position={[b.x, b.y, b.z]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.0065, 0.0065, 0.012, 14]} />
        <meshStandardMaterial color="#c9d2d6" metalness={0.95} roughness={0.28} />
      </mesh>
    </group>
  )
}
