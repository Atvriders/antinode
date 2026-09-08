import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { applyState, ownMaterial } from '../materials'
import type { MaterialRole } from '../materials'
import { transformOf } from '../layout'
import type { ReactNode } from 'react'

/**
 * One selectable component.
 *
 * Everything the reader can click on in the radio goes through here, so
 * selection, hover, heat and the explosion all behave identically no matter
 * which part it is. The group interpolates between its assembled and exploded
 * transform every frame; nothing is allocated inside the loop.
 */
export function Part({
  id,
  role,
  children,
  explode,
  selected,
  hovered,
  heat,
  thermalView,
  onPick,
  onHover,
  visible = true,
}: {
  id: string
  role: MaterialRole
  children: (material: THREE.MeshStandardMaterial) => ReactNode
  explode: number
  selected: boolean
  hovered: boolean
  heat: number
  thermalView: boolean
  onPick: (id: string | null) => void
  onHover?: (id: string | null) => void
  visible?: boolean
}) {
  const group = useRef<THREE.Group>(null)
  const material = useMemo(() => ownMaterial(role), [role])
  const t = transformOf(id)

  useEffect(() => () => material.dispose(), [material])

  useFrame(() => {
    const g = group.current
    if (!g || !t) return
    g.position.set(
      t.pos[0] + t.explode[0] * explode,
      t.pos[1] + t.explode[1] * explode,
      t.pos[2] + t.explode[2] * explode,
    )
    applyState(material, { selected, hovered, heat, thermalView })
  })

  if (!t) return null

  return (
    <group
      ref={group}
      name={id}
      userData={{ partId: id }}
      visible={visible}
      onClick={(e) => {
        e.stopPropagation()
        onPick(selected ? null : id)
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        onHover?.(id)
      }}
      onPointerOut={() => onHover?.(null)}
    >
      {children(material)}
    </group>
  )
}
