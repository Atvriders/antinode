import { useMemo } from 'react'
import * as THREE from 'three'
import { DIORAMA } from '../scene-constants'
import { mat } from '../materials'

/**
 * The plinth the antenna model stands on, with the ground under it.
 *
 * The scale break is deliberate and it is labelled: a 20 m dipole and a 24 cm
 * radio cannot share a frame at the same size, and pretending otherwise would be
 * the dishonest way to draw this. A scale bar is etched into the plinth edge, and
 * the HTML overlay carries the words.
 */
export function Ground({ radials = 0, showEarth = true }: { radials?: number; showEarth?: boolean }) {
  const { plinth, scale } = DIORAMA

  const radialLines = useMemo(() => {
    const n = Math.max(0, Math.min(64, Math.round(radials)))
    if (n === 0) return []
    const out: THREE.Matrix4[] = []
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const p = new THREE.Vector3()
    const s = new THREE.Vector3(1, 1, 1)
    // Quarter-wave radials for 40 m are about 10 m long, drawn at diorama scale.
    const len = 10 * scale
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      p.set((Math.cos(a) * len) / 2, 0.0012, (Math.sin(a) * len) / 2)
      q.setFromEuler(new THREE.Euler(0, -a, 0))
      m.compose(p, q, s)
      out.push(m.clone())
    }
    return out
  }, [radials, scale])

  const len = 10 * scale

  return (
    <group>
      {/* Machined plinth. */}
      <mesh position={[0, plinth.h / 2, 0]} receiveShadow castShadow material={mat('plinth')}>
        <boxGeometry args={[plinth.w, plinth.h, plinth.d]} />
      </mesh>
      {/* A chamfered top surface, slightly inset, so the edge catches light. */}
      <mesh position={[0, plinth.h + 0.0005, 0]} receiveShadow material={mat('bench')}>
        <boxGeometry args={[plinth.w - 0.012, 0.001, plinth.d - 0.012]} />
      </mesh>

      {showEarth && (
        <mesh position={[0, plinth.h + 0.0012, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={mat('earth')}>
          <circleGeometry args={[Math.min(plinth.w, plinth.d) * 0.42, 40]} />
        </mesh>
      )}

      {/* Radials. More of them is the point: it is what the reader is changing. */}
      {radialLines.length > 0 && (
        <instancedMesh
          args={[undefined, undefined, radialLines.length]}
          count={radialLines.length}
          material={mat('copper')}
          position={[0, plinth.h, 0]}
          ref={(inst) => {
            if (!inst) return
            radialLines.forEach((m, i) => inst.setMatrixAt(i, m))
            inst.instanceMatrix.needsUpdate = true
          }}
        >
          <boxGeometry args={[len, 0.0006, 0.0006]} />
        </instancedMesh>
      )}

      {/* Scale bar etched into the front edge: ten model metres. */}
      <mesh position={[-plinth.w / 2 + 0.1, plinth.h / 2, plinth.d / 2 + 0.001]} material={mat('silver')}>
        <boxGeometry args={[10 * scale, 0.0015, 0.0008]} />
      </mesh>
    </group>
  )
}
