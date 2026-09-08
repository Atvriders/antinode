import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Chassis } from './Chassis'
import { FrontPanel } from './FrontPanel'
import { Part } from './Part'
import { mat, ownMaterial } from '../materials'
import { PART_TRANSFORMS } from '../layout'
import { RADIO } from '../scene-constants'

export interface RadioProps {
  explode: number
  selectedPart: string | null
  /** Parts belonging to the selected chain stage; highlighted alongside it. */
  highlightParts?: readonly string[] | null
  hoveredPart: string | null
  heat: Readonly<Record<string, number>>
  hideShell: boolean
  screenColor: string
  fanRpm: number
  thermalView?: boolean
  onPickPart: (id: string | null) => void
}

/**
 * The radio.
 *
 * Every part in src/content/parts.ts that lives inside the case has a mesh here
 * with the same id, so clicking a row in the breakdown list and clicking the
 * object itself are the same action. The `explode` prop drives all of them at
 * once through the shared transform table.
 */
export function Radio({
  explode,
  selectedPart,
  highlightParts,
  hoveredPart,
  heat,
  hideShell,
  screenColor,
  fanRpm,
  thermalView = false,
  onPickPart,
}: RadioProps) {
  const [hover, setHover] = useState<string | null>(null)
  const hovered = hoveredPart ?? hover

  const screenMaterial = useMemo(() => {
    const m = ownMaterial('screen')
    m.emissive = new THREE.Color(screenColor)
    m.emissiveIntensity = 0.9
    m.toneMapped = false
    return m
  }, [screenColor])

  const dialMaterial = useMemo(() => ownMaterial('plastic-knob'), [])

  const common = (id: string) => ({
    id,
    explode,
    selected: selectedPart === id,
    hovered: hovered === id || (highlightParts?.includes(id) ?? false),
    heat: heat[id] ?? 0,
    thermalView,
    onPick: onPickPart,
    onHover: setHover,
  })

  return (
    <group name="radio" position={[0, RADIO.footHeight, 0]}>
      <Part {...common('chassis')} role="chassis">
        {(m) => (
          <>
            <Chassis material={m} ghost={hideShell} />
            {!hideShell && (
              <FrontPanel
                screenColor={screenColor}
                screenMaterial={screenMaterial}
                dialMaterial={dialMaterial}
                spinDial={0}
              />
            )}
          </>
        )}
      </Part>

      {/* When the shell is off, the panel still needs to be somewhere. */}
      {hideShell && (
        <Part {...common('tft-panel')} role="screen">
          {(m) => (
            <mesh material={m}>
              <boxGeometry args={[RADIO.screen.w, RADIO.screen.h, 0.003]} />
            </mesh>
          )}
        </Part>
      )}
      {!hideShell && (
        <Part {...common('tft-panel')} role="screen">
          {() => (
            <mesh visible={false}>
              <boxGeometry args={[RADIO.screen.w, RADIO.screen.h, 0.004]} />
            </mesh>
          )}
        </Part>
      )}

      <Part {...common('main-dial')} role="plastic-knob">
        {() => (
          <mesh visible={hideShell} rotation={[Math.PI / 2, 0, 0]} material={dialMaterial}>
            <cylinderGeometry args={[RADIO.dial.r, RADIO.dial.r, 0.014, 32]} />
          </mesh>
        )}
      </Part>

      <Part {...common('speaker')} role="device">
        {(m) => (
          <mesh material={m} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.032, 0.032, 0.006, 20]} />
          </mesh>
        )}
      </Part>

      {/* ── Boards ─────────────────────────────────────────────────────── */}
      <Board id="main-board" common={common} />
      <Board id="lpf-board" common={common} />
      <Board id="atu-board" common={common} />

      {/* ── Integrated circuits on the main board ──────────────────────── */}
      <Qfp id="fpga" common={common} leads={22} />
      <Qfp id="af-codec" common={common} leads={7} />
      <Qfp id="mic-preamp-ic" common={common} leads={4} />
      <Qfp id="tx-dac" common={common} leads={8} />
      <Qfp id="pll" common={common} leads={9} />

      <Part {...common('bpf-bank')} role="ferrite">
        {(m) => (
          <group>
            {/* Fifteen switched band-pass sections, drawn as a row of shielded cans. */}
            {Array.from({ length: 8 }, (_, i) => (
              <mesh key={i} material={m} position={[-0.026 + i * 0.0074, 0.003, 0]} castShadow>
                <boxGeometry args={[0.005, 0.007, 0.04]} />
              </mesh>
            ))}
          </group>
        )}
      </Part>

      {/* ── The amplifier chain ────────────────────────────────────────── */}
      <Device id="predriver" common={common} w={0.005} h={0.003} d={0.005} />
      <Device id="driver" common={common} w={0.009} h={0.006} d={0.007} />
      <Final id="final-q1" common={common} />
      <Final id="final-q2" common={common} />

      <Part {...common('pa-heatsink')} role="heatsink">
        {(m) => <Heatsink material={m} />}
      </Part>

      <Part {...common('cooling-fan')} role="device">
        {(m) => <Fan material={m} rpm={fanRpm} />}
      </Part>

      {/* ── Low-pass filters ───────────────────────────────────────────── */}
      <Part {...common('lpf-relay')} role="relay">
        {(m) => (
          <group>
            {/* Seven Chebyshev sections, two relays each. */}
            {Array.from({ length: 7 }, (_, i) => (
              <mesh key={i} material={m} position={[-0.038 + i * 0.0128, 0, 0]} castShadow>
                <boxGeometry args={[0.009, 0.008, 0.011]} />
              </mesh>
            ))}
          </group>
        )}
      </Part>

      <Part {...common('lpf-cap')} role="silver">
        {(m) => (
          <group>
            {Array.from({ length: 10 }, (_, i) => (
              <mesh key={i} material={m} position={[-0.04 + i * 0.0089, 0.001, 0]}>
                <boxGeometry args={[0.004, 0.006, 0.0022]} />
              </mesh>
            ))}
            {/* The filter inductors: air-wound coils lying between the caps. */}
            {Array.from({ length: 6 }, (_, i) => (
              <mesh key={`l${i}`} material={mat('copper')} position={[-0.034 + i * 0.014, 0.002, 0.005]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.0022, 0.0022, 0.008, 10]} />
              </mesh>
            ))}
          </group>
        )}
      </Part>

      <Part {...common('swr-coupler')} role="ferrite">
        {(m) => (
          <group>
            <mesh material={m} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <torusGeometry args={[0.006, 0.0022, 8, 18]} />
            </mesh>
            {/* The two detector diodes that make the forward and reflected volts. */}
            <mesh material={mat('device')} position={[0.008, 0, 0.004]}>
              <boxGeometry args={[0.0028, 0.0016, 0.0016]} />
            </mesh>
            <mesh material={mat('device')} position={[0.008, 0, -0.004]}>
              <boxGeometry args={[0.0028, 0.0016, 0.0016]} />
            </mesh>
          </group>
        )}
      </Part>

      <Part {...common('ant-relay')} role="relay">
        {(m) => (
          <mesh material={m} castShadow>
            <boxGeometry args={[0.014, 0.01, 0.01]} />
          </mesh>
        )}
      </Part>

      {/* ── Tuner ──────────────────────────────────────────────────────── */}
      <Part {...common('atu-relay')} role="relay">
        {(m) => (
          <group>
            {Array.from({ length: 9 }, (_, i) => (
              <mesh key={i} material={m} position={[-0.036 + i * 0.009, 0, 0]} castShadow>
                <boxGeometry args={[0.006, 0.008, 0.01]} />
              </mesh>
            ))}
          </group>
        )}
      </Part>

      <Part {...common('atu-inductor')} role="copper">
        {(m) => (
          <group>
            {/* Nine switched inductors on colour-coded iron powder cores. */}
            {Array.from({ length: 5 }, (_, i) => (
              <mesh key={i} material={m} position={[-0.018 + i * 0.009, 0.002, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                <torusGeometry args={[0.0035 + i * 0.0004, 0.0014, 6, 14]} />
              </mesh>
            ))}
          </group>
        )}
      </Part>

      <Part {...common('atu-cap')} role="silver">
        {(m) => (
          <group>
            {Array.from({ length: 5 }, (_, i) => (
              <mesh key={i} material={m} position={[-0.008 + i * 0.004, 0.001, 0]}>
                <boxGeometry args={[0.003, 0.005, 0.002]} />
              </mesh>
            ))}
          </group>
        )}
      </Part>

      {/* ── Rear connectors ────────────────────────────────────────────── */}
      <Part {...common('so239')} role="silver">
        {(m) => (
          <group rotation={[Math.PI / 2, 0, 0]}>
            <mesh material={m} castShadow>
              <cylinderGeometry args={[0.008, 0.008, 0.012, 20]} />
            </mesh>
            {/* The four-hole flange every UHF socket has. */}
            <mesh material={m} position={[0, 0.006, 0]}>
              <boxGeometry args={[0.019, 0.001, 0.019]} />
            </mesh>
            <mesh material={mat('copper')} position={[0, -0.004, 0]}>
              <cylinderGeometry args={[0.0012, 0.0012, 0.008, 10]} />
            </mesh>
          </group>
        )}
      </Part>

      <Part {...common('dc-jack')} role="device">
        {(m) => (
          <mesh material={m} castShadow>
            <boxGeometry args={[0.018, 0.012, 0.012]} />
          </mesh>
        )}
      </Part>
    </group>
  )
}

// ─── Building blocks ─────────────────────────────────────────────────────────

type Common = (id: string) => Omit<Parameters<typeof Part>[0], 'role' | 'children'>

/** A printed circuit board: green mask with a slightly different ground pour. */
function Board({ id, common }: { id: string; common: Common }) {
  const t = PART_TRANSFORMS[id]
  if (!t) return null
  return (
    <Part {...common(id)} role="pcb">
      {(m) => (
        <group>
          <mesh material={m} receiveShadow castShadow>
            <boxGeometry args={[t.size[0], t.size[1], t.size[2]]} />
          </mesh>
          <mesh material={mat('solder-mask')} position={[0, t.size[1] / 2 + 0.0002, 0]}>
            <boxGeometry args={[t.size[0] * 0.82, 0.0002, t.size[2] * 0.72]} />
          </mesh>
        </group>
      )}
    </Part>
  )
}

/** A quad flat pack with a visible lead frame on two sides. */
function Qfp({ id, common, leads }: { id: string; common: Common; leads: number }) {
  const t = PART_TRANSFORMS[id]
  if (!t) return null
  const [w, h, d] = t.size
  return (
    <Part {...common(id)} role="device">
      {(m) => (
        <group>
          <mesh material={m} castShadow>
            <boxGeometry args={[w, h, d]} />
          </mesh>
          {Array.from({ length: leads }, (_, i) => {
            const x = -w / 2 + ((i + 0.5) / leads) * w
            return (
              <group key={i}>
                <mesh material={mat('silver')} position={[x, -h / 4, d / 2 + 0.0004]}>
                  <boxGeometry args={[w / (leads * 2.4), h / 6, 0.0008]} />
                </mesh>
                <mesh material={mat('silver')} position={[x, -h / 4, -d / 2 - 0.0004]}>
                  <boxGeometry args={[w / (leads * 2.4), h / 6, 0.0008]} />
                </mesh>
              </group>
            )
          })}
        </group>
      )}
    </Part>
  )
}

/** A small surface-mount power device. */
function Device({ id, common, w, h, d }: { id: string; common: Common; w: number; h: number; d: number }) {
  return (
    <Part {...common(id)} role="device">
      {(m) => (
        <group>
          <mesh material={m} castShadow>
            <boxGeometry args={[w, h, d]} />
          </mesh>
          <mesh material={mat('copper')} position={[0, -h / 2 + 0.0003, 0]}>
            <boxGeometry args={[w * 0.9, 0.0006, d * 1.3]} />
          </mesh>
        </group>
      )}
    </Part>
  )
}

/** A final: a flanged RF power MOSFET bolted to the heatsink, tab and all. */
function Final({ id, common }: { id: string; common: Common }) {
  return (
    <Part {...common(id)} role="device">
      {(m) => (
        <group>
          <mesh material={m} castShadow>
            <boxGeometry args={[0.014, 0.011, 0.005]} />
          </mesh>
          {/* Mounting tab with its screw hole toward the heatsink. */}
          <mesh material={mat('silver')} position={[0, 0.008, 0]}>
            <boxGeometry args={[0.014, 0.005, 0.0012]} />
          </mesh>
          {/* Wide flat leads, because this device carries amps. */}
          {[-0.004, 0.004].map((x) => (
            <mesh key={x} material={mat('copper')} position={[x, -0.007, 0]}>
              <boxGeometry args={[0.004, 0.004, 0.0008]} />
            </mesh>
          ))}
        </group>
      )}
    </Part>
  )
}

/** Extruded finned heatsink across the back of the radio. */
function Heatsink({ material }: { material: THREE.MeshStandardMaterial }) {
  const fins = 26
  return (
    <group>
      <mesh material={material} castShadow receiveShadow>
        <boxGeometry args={[0.12, 0.07, 0.006]} />
      </mesh>
      {Array.from({ length: fins }, (_, i) => (
        <mesh key={i} material={material} position={[-0.058 + (i / (fins - 1)) * 0.116, 0, -0.009]} castShadow>
          <boxGeometry args={[0.0018, 0.068, 0.014]} />
        </mesh>
      ))}
    </group>
  )
}

/** A real bladed fan. Its speed is the fan duty the thermal model computed. */
function Fan({ material, rpm }: { material: THREE.MeshStandardMaterial; rpm: number }) {
  const blades = useRef<THREE.Group>(null)
  useFrame((_, dt) => {
    if (blades.current) blades.current.rotation.z += (rpm / 60) * Math.PI * 2 * dt
  })
  return (
    <group>
      <mesh material={material}>
        <boxGeometry args={[0.04, 0.04, 0.01]} />
      </mesh>
      <group ref={blades} position={[0, 0, 0.006]}>
        {Array.from({ length: 7 }, (_, i) => (
          <mesh key={i} material={mat('plastic-knob')} rotation={[0, 0, (i / 7) * Math.PI * 2]} position={[0, 0, 0]}>
            <boxGeometry args={[0.016, 0.004, 0.002]} />
          </mesh>
        ))}
        <mesh material={mat('plastic-knob')}>
          <cylinderGeometry args={[0.005, 0.005, 0.005, 12]} />
        </mesh>
      </group>
    </group>
  )
}
