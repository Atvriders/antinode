import { useMemo } from 'react'
import * as THREE from 'three'
import { RADIO } from '../scene-constants'
import { mat } from '../materials'

/**
 * The case: a die-cast body with a chamfered front bezel, a perforated top and
 * the fold-down stand. The ventilation is real geometry rather than a texture,
 * instanced so several hundred holes cost one draw call.
 */
export function Chassis({ material, ghost = false }: { material: THREE.MeshStandardMaterial; ghost?: boolean }) {
  const { width: W, height: H, depth: D } = RADIO

  // Built once. Constructing this inside the JSX args array makes a new
  // geometry every render, and react-three-fiber tears down and rebuilds the
  // edges each time.
  const cage = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(W, H, D)), [W, H, D])

  const vents = useMemo(() => {
    const m = new THREE.Matrix4()
    const out: THREE.Matrix4[] = []
    // A grille over the right two-thirds of the lid, where the PA sits.
    for (let ix = 0; ix < 16; ix++) {
      for (let iz = 0; iz < 9; iz++) {
        const x = -0.02 + ix * 0.0072
        const z = -0.085 + iz * 0.0092
        if (x > W / 2 - 0.012) continue
        m.makeTranslation(x, H - 0.0015, z)
        out.push(m.clone())
      }
    }
    return out
  }, [W, H])

  // Opened up, the case becomes a wireframe cage. This branch sits after every
  // hook above, because the exploded view toggles it and React requires the hook
  // order to be identical on every render. Taking it away entirely would
  // leave the parts floating with nothing to say where they came from, which is
  // the difference between an exploded diagram and a pile of components.
  if (ghost) {
    return (
      <group>
        <lineSegments position={[0, H / 2, 0]}>
          <primitive object={cage} attach="geometry" />
          <lineBasicMaterial color="#4d5f65" transparent opacity={0.6} toneMapped={false} />
        </lineSegments>
      </group>
    )
  }

  const feet: [number, number][] = [
    [-W / 2 + 0.02, D / 2 - 0.02],
    [W / 2 - 0.02, D / 2 - 0.02],
    [-W / 2 + 0.02, -D / 2 + 0.02],
    [W / 2 - 0.02, -D / 2 + 0.02],
  ]

  return (
    <group>
      {/* Body. Slightly inset from the bezel so the front reads as a separate face. */}
      <mesh castShadow receiveShadow position={[0, H / 2, -0.004]} material={material}>
        <boxGeometry args={[W - 0.004, H - 0.002, D - 0.012]} />
      </mesh>

      {/* Front bezel, proud of the body and chamfered at the top. */}
      <mesh castShadow position={[0, H / 2, RADIO.frontZ - 0.004]} material={mat('anodised')}>
        <boxGeometry args={[W, H, 0.008]} />
      </mesh>

      {/* Rear panel with its recessed connector bay. */}
      <mesh castShadow position={[0, H / 2, RADIO.rearZ + 0.003]} material={mat('chassis')}>
        <boxGeometry args={[W - 0.002, H - 0.004, 0.006]} />
      </mesh>

      {/* Ventilation. */}
      <instancedMesh args={[undefined, undefined, vents.length]} material={mat('chassis')} count={vents.length}
        ref={(inst) => {
          if (!inst) return
          vents.forEach((m, i) => inst.setMatrixAt(i, m))
          inst.instanceMatrix.needsUpdate = true
        }}
      >
        <cylinderGeometry args={[0.0016, 0.0016, 0.004, 6]} />
      </instancedMesh>

      {/* Fan grille on the rear. */}
      <mesh position={[0.082, 0.042, RADIO.rearZ + 0.0005]} rotation={[Math.PI / 2, 0, 0]} material={mat('chassis')}>
        <torusGeometry args={[0.019, 0.0015, 6, 24]} />
      </mesh>

      {/* Feet. */}
      {feet.map(([x, z], i) => (
        <mesh key={i} position={[x, RADIO.footHeight / 2, z]} material={mat('rubber')}>
          <cylinderGeometry args={[0.007, 0.008, RADIO.footHeight, 12]} />
        </mesh>
      ))}

      {/* The fold-down stand under the front edge, which every operator uses. */}
      <mesh position={[0, 0.012, RADIO.frontZ - 0.03]} rotation={[0.5, 0, 0]} material={mat('chassis')}>
        <boxGeometry args={[W - 0.06, 0.028, 0.002]} />
      </mesh>
    </group>
  )
}
