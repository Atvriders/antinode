import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * Expanding wavefronts leaving the antenna.
 *
 * Two things here are quantitative on purpose. The spacing of the shells is the
 * real wavelength at the diorama's scale, so changing band visibly changes it.
 * And the brightness follows the power actually radiated, not the power leaving
 * the radio — so an antenna that is 1.1:1 and eight percent efficient looks as
 * feeble as it is. That contrast is the point of having them at all.
 */
export function Wavefronts({
  origin,
  strength,
  wavelengthM,
  reducedMotion,
  scale = 1 / 25,
  count = 5,
}: {
  origin: readonly [number, number, number]
  strength: number
  wavelengthM: number
  reducedMotion: boolean
  scale?: number
  count?: number
}) {
  const group = useRef<THREE.Group>(null)
  const phase = useRef(0)

  // One material per shell, created once. Cloning inside the JSX allocated five
  // fresh materials — and five fresh shader programs — on every render, and
  // disposed none of them.
  const materials = useMemo(
    () =>
      Array.from({ length: count }, () => new THREE.MeshBasicMaterial({
        color: new THREE.Color('#5fd2e8'),
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide,
        depthWrite: false,
        toneMapped: false,
      })),
    [count],
  )

  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials])

  // A wavelength drawn at the diorama's scale, clamped so 160 m does not fill
  // the bench and 6 m does not turn into a moiré pattern.
  const spacing = Math.max(0.05, Math.min(0.5, wavelengthM * scale * 0.5))
  const s = Math.max(0, Math.min(1, strength))

  useFrame((_, dt) => {
    const g = group.current
    if (!g) return
    if (!reducedMotion) phase.current = (phase.current + dt * 0.55) % 1
    for (let i = 0; i < g.children.length; i++) {
      const child = g.children[i]
      if (!child) continue
      const t = ((i + phase.current) % count) / count
      const r = 0.02 + t * spacing * count
      child.scale.setScalar(r)
      const mesh = child as THREE.Mesh
      const mm = mesh.material as THREE.MeshBasicMaterial
      // Fade with distance and with how little power there actually is.
      mm.opacity = s * 0.3 * (1 - t) * (1 - t)
      mesh.visible = s > 0.01
    }
  })

  return (
    <group ref={group} position={[origin[0], origin[1], origin[2]]}>
      {materials.map((m, i) => (
        <mesh key={i} material={m} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.96, 1, 48]} />
        </mesh>
      ))}
    </group>
  )
}
