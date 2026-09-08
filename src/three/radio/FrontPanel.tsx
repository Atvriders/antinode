import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { RADIO } from '../scene-constants'
import { mat, PHOSPHOR } from '../materials'

/**
 * The front panel: the display, the big tuning dial, the concentric AF/RF knobs,
 * the multi-function knob and the button rows.
 *
 * Button legends are not modelled in 3D. Extruded lettering at this scale reads
 * as noise, and the HTML overlay can label things far more legibly than a mesh
 * ever will.
 */
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

  // The knurled rim: a ring of small boxes, instanced.
  const knurl = useMemo(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const pos = new THREE.Vector3()
    const scale = new THREE.Vector3(1, 1, 1)
    const out: THREE.Matrix4[] = []
    const n = 48
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      pos.set(Math.cos(a) * RADIO.dial.r, Math.sin(a) * RADIO.dial.r, 0)
      q.setFromEuler(new THREE.Euler(0, 0, a))
      m.compose(pos, q, scale)
      out.push(m.clone())
    }
    return out
  }, [])

  useFrame((_, dt) => {
    if (dial.current) dial.current.rotation.z += spinDial * dt
  })

  const buttons = useMemo(() => {
    const out: [number, number, number, number][] = []
    // Two rows under the display, plus a column beside it.
    for (let i = 0; i < 6; i++) out.push([-0.094 + i * 0.019, 0.019, 0.014, 0.008])
    for (let i = 0; i < 4; i++) out.push([-0.094 + i * 0.019, 0.006, 0.014, 0.008])
    for (let i = 0; i < 4; i++) out.push([0.006, 0.076 - i * 0.014, 0.011, 0.009])
    return out
  }, [])

  return (
    <group>
      {/* Display glass, then the emissive panel just behind it. */}
      <mesh position={[RADIO.screen.x, RADIO.screen.y, z + 0.0015]}>
        <planeGeometry args={[RADIO.screen.w + 0.006, RADIO.screen.h + 0.006]} />
        <meshStandardMaterial color="#05090a" roughness={0.16} metalness={0.2} />
      </mesh>
      <mesh position={[RADIO.screen.x, RADIO.screen.y, z + 0.0022]} material={screenMaterial}>
        <planeGeometry args={[RADIO.screen.w, RADIO.screen.h]} />
      </mesh>
      {/* A suggestion of the spectrum scope: a bright band across the lower half. */}
      <mesh position={[RADIO.screen.x, RADIO.screen.y - 0.012, z + 0.0024]}>
        <planeGeometry args={[RADIO.screen.w - 0.006, 0.016]} />
        <meshStandardMaterial color={screenColor} emissive={PHOSPHOR} emissiveIntensity={0.5} toneMapped={false} />
      </mesh>

      {/* Main tuning dial. */}
      <group ref={dial} position={[RADIO.dial.x, RADIO.dial.y, z + 0.006]}>
        <mesh castShadow material={dialMaterial}>
          <cylinderGeometry args={[RADIO.dial.r, RADIO.dial.r, 0.014, 40]} />
        </mesh>
        <group rotation={[Math.PI / 2, 0, 0]}>
          <instancedMesh args={[undefined, undefined, knurl.length]} material={mat('anodised')} count={knurl.length}
            ref={(inst) => {
              if (!inst) return
              knurl.forEach((m, i) => inst.setMatrixAt(i, m))
              inst.instanceMatrix.needsUpdate = true
            }}
          >
            <boxGeometry args={[0.0018, 0.0025, 0.014]} />
          </instancedMesh>
        </group>
        {/* The finger dimple. */}
        <mesh position={[RADIO.dial.r * 0.55, 0.008, 0]} material={mat('plastic-knob')}>
          <sphereGeometry args={[0.0035, 12, 8]} />
        </mesh>
      </group>

      {/* Concentric AF / RF-SQL knobs. */}
      <mesh position={[-0.104, 0.072, z + 0.007]} rotation={[Math.PI / 2, 0, 0]} material={mat('plastic-knob')}>
        <cylinderGeometry args={[0.011, 0.011, 0.012, 24]} />
      </mesh>
      <mesh position={[-0.104, 0.072, z + 0.012]} rotation={[Math.PI / 2, 0, 0]} material={mat('plastic-knob')}>
        <cylinderGeometry args={[0.0068, 0.0068, 0.008, 24]} />
      </mesh>

      {/* Multi-function knob. */}
      <mesh position={[0.104, 0.072, z + 0.008]} rotation={[Math.PI / 2, 0, 0]} material={mat('plastic-knob')}>
        <cylinderGeometry args={[0.0095, 0.0095, 0.012, 24]} />
      </mesh>

      {/* Button rows. */}
      {buttons.map(([x, y, w, h], i) => (
        <mesh key={i} position={[x, y, z + 0.003]} material={mat('plastic-knob')}>
          <boxGeometry args={[w, h, 0.004]} />
        </mesh>
      ))}

      {/* Microphone connector and the headphone jack. */}
      <mesh position={[-0.104, 0.022, z + 0.002]} rotation={[Math.PI / 2, 0, 0]} material={mat('silver')}>
        <cylinderGeometry args={[0.0075, 0.0075, 0.005, 16]} />
      </mesh>
      <mesh position={[0.104, 0.02, z + 0.001]} rotation={[Math.PI / 2, 0, 0]} material={mat('chassis')}>
        <cylinderGeometry args={[0.0042, 0.0042, 0.004, 14]} />
      </mesh>
    </group>
  )
}
