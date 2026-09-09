/**
 * Antinode — shared materials.
 *
 * Every surface in the scene is described by material parameters only: no image
 * textures, no downloaded assets. The container has to render with no network,
 * and an anodised panel is a roughness value and a colour anyway.
 *
 * Materials are created once and reused. Creating one per frame would leak
 * shader programs until the tab died.
 */

import * as THREE from 'three'

export type MaterialRole =
  | 'anodised' | 'chassis' | 'pcb' | 'copper' | 'solder-mask' | 'plastic-knob'
  | 'rubber' | 'screen' | 'ferrite' | 'silver' | 'heatsink' | 'wire'
  | 'bench' | 'plinth' | 'earth' | 'insulator' | 'coax' | 'device' | 'relay'

/** The heat ramp, duplicated from tokens.css because GLSL cannot read CSS. */
export const HEAT_RAMP: readonly THREE.Color[] = [
  new THREE.Color('#3a4a4e'),
  new THREE.Color('#f2b441'),
  new THREE.Color('#e2622a'),
  new THREE.Color('#c0202b'),
]

export const PHOSPHOR = new THREE.Color('#5fd2e8')
export const PANEL = new THREE.Color('#141a1c')

const SPECS: Record<MaterialRole, THREE.MeshStandardMaterialParameters> = {
  anodised: { color: '#454f55', metalness: 0.62, roughness: 0.42 },
  chassis: { color: '#333c41', metalness: 0.5, roughness: 0.55 },
  pcb: { color: '#215a3f', metalness: 0.05, roughness: 0.68 },
  copper: { color: '#b06a3a', metalness: 0.9, roughness: 0.36 },
  'solder-mask': { color: '#2a6047', metalness: 0.06, roughness: 0.66 },
  'plastic-knob': { color: '#23292c', metalness: 0.12, roughness: 0.5 },
  rubber: { color: '#0e1112', metalness: 0, roughness: 0.95 },
  screen: { color: '#08222a', metalness: 0.1, roughness: 0.22 },
  ferrite: { color: '#241f22', metalness: 0.2, roughness: 0.82 },
  silver: { color: '#c9d2d6', metalness: 0.95, roughness: 0.22 },
  heatsink: { color: '#59646c', metalness: 0.7, roughness: 0.35 },
  wire: { color: '#c08a55', metalness: 0.8, roughness: 0.38 },
  bench: { color: '#262d30', metalness: 0.1, roughness: 0.85 },
  plinth: { color: '#3a4449', metalness: 0.28, roughness: 0.55 },
  earth: { color: '#403d2e', metalness: 0.02, roughness: 0.95 },
  insulator: { color: '#e4e0d4', metalness: 0, roughness: 0.55 },
  coax: { color: '#101314', metalness: 0.15, roughness: 0.72 },
  device: { color: '#14181a', metalness: 0.25, roughness: 0.55 },
  relay: { color: '#0f1416', metalness: 0.1, roughness: 0.6 },
}

const cache = new Map<MaterialRole, THREE.MeshStandardMaterial>()

export function mat(role: MaterialRole): THREE.MeshStandardMaterial {
  const hit = cache.get(role)
  if (hit) return hit
  const m = new THREE.MeshStandardMaterial(SPECS[role])
  cache.set(role, m)
  return m
}

/**
 * A material a single part owns, so it can glow when selected or shift along the
 * heat ramp without dragging every other part of the same role with it.
 */
export function ownMaterial(role: MaterialRole): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial(SPECS[role])
}

const scratch = new THREE.Color()

/** 0..1 to a colour on the project's heat ramp. Allocation free. */
export function heatColor(v: number, out = scratch): THREE.Color {
  const t = Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0)) * (HEAT_RAMP.length - 1)
  const i = Math.min(HEAT_RAMP.length - 2, Math.floor(t))
  const a = HEAT_RAMP[i] ?? HEAT_RAMP[0]
  const b = HEAT_RAMP[i + 1] ?? HEAT_RAMP[HEAT_RAMP.length - 1]
  if (!a || !b) return out.set('#3a4a4e')
  return out.copy(a).lerp(b, t - i)
}

/**
 * Apply selection and heat to a part's own material. Safe to call every frame:
 * it mutates in place and allocates nothing.
 */
export function applyState(
  material: THREE.MeshStandardMaterial,
  opts: {
    selected: boolean
    hovered: boolean
    heat: number
    thermalView: boolean
    /**
     * True for the case: a part big enough that lighting it up says nothing.
     *
     * Emissive is a flood, not an outline. On a small component it reads as
     * "this is the one you would pick"; on the whole chassis it reads as "the
     * radio has turned cyan", and since the case is what the pointer is over
     * most of the time, the model spent most of its life glowing.
     */
    subtle?: boolean
  },
): void {
  const { selected, hovered, heat, thermalView, subtle = false } = opts
  if (thermalView && heat > 0.01) {
    heatColor(heat, material.emissive)
    material.emissiveIntensity = 0.25 + heat * 1.5
  } else if (selected) {
    material.emissive.set(PHOSPHOR)
    material.emissiveIntensity = subtle ? 0.05 : 0.34
  } else if (hovered && !subtle) {
    material.emissive.set(PHOSPHOR)
    material.emissiveIntensity = 0.14
  } else if (heat > 0.35) {
    // Even outside the thermal view, something genuinely hot should show it.
    heatColor(heat, material.emissive)
    material.emissiveIntensity = (heat - 0.35) * 1.1
  } else {
    material.emissiveIntensity = 0
  }
}

/** Release everything. Called when the scene unmounts. */
export function disposeMaterials(): void {
  for (const m of cache.values()) m.dispose()
  cache.clear()
}
