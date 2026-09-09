import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AdaptiveDpr, OrbitControls, ContactShadows, Environment, Lightformer } from '@react-three/drei'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { Radio } from '../three/radio/Radio'
import { Station } from '../three/station/Station'
import { Feedline } from '../three/fx/Feedline'
import { CAMERAS } from '../three/scene-constants'
import { STAGES } from '../content/stages'
import { useStation } from '../sim/store'
import styles from './App.module.css'

/**
 * The viewport. One scene for the whole application: the radio at true size on a
 * bench, with the antenna system beside it as a labelled scale model. Views are
 * camera moves and visibility changes over that one scene, not separate scenes,
 * so the spatial relationship between the radio and the antenna is never lost.
 */
export function Viewport() {
  const reducedMotion = useStation((s) => s.reducedMotion)

  return (
    <div className={styles.viewportHost} data-testid="viewport">
      <Canvas
        // PCF rather than PCFSoft: three deprecated the soft variant, and the
        // scene is lit by one key light onto flat panels where the difference is
        // invisible anyway.
        shadows="percentage"
        dpr={[1, 2]}
        gl={{
          antialias: true,
          powerPreference: 'high-performance',
          alpha: false,
          preserveDrawingBuffer: false,
        }}
        camera={{ position: [...CAMERAS.exterior.pos], fov: CAMERAS.exterior.fov, near: 0.01, far: 60 }}
        onCreated={({ gl, scene }) => {
          gl.shadowMap.type = THREE.PCFShadowMap
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = 1.25
          scene.background = new THREE.Color('#0d1113')
          scene.fog = new THREE.Fog('#0d1113', 5.5, 14)
        }}
        frameloop={reducedMotion ? 'demand' : 'always'}
      >
        <Suspense fallback={null}>
          <SceneContents />
        </Suspense>
        <AdaptiveDpr pixelated />
      </Canvas>
    </div>
  )
}

function SceneContents() {
  const view = useStation((s) => s.view)
  const showLabels = useStation((s) => s.showLabels)
  const showStandingWave = useStation((s) => s.showStandingWave)
  const reducedMotion = useStation((s) => s.reducedMotion)
  const solution = useStation((s) => s.solution)
  const thermal = useStation((s) => s.thermal)
  const selectedPart = useStation((s) => s.selectedPart)
  const selectedStage = useStation((s) => s.selectedStage)
  const selectPart = useStation((s) => s.selectPart)
  const config = useStation((s) => s.config)
  const meters = useStation((s) => s.meters)
  const step = useStation((s) => s.step)

  // The physics clock is driven by the render loop so the simulation and the
  // picture can never disagree about what instant it is.
  // Hand the store the real elapsed time; it decides how to sub-step it. A
  // clamp here would make the whole simulation run slow on a slow renderer.
  useFrame((_, dt) => step(dt))

  const explode = view === 'exploded' ? 1 : 0
  // The signal path view opens the case as well: the point of it is to watch the
  // selected stage light up on the boards it actually lives on, and you cannot
  // see that through a lid.
  const hideShell = view === 'cutaway' || view === 'exploded' || view === 'signal-path'

  // Selecting a stage in the rail highlights the parts that stage runs on. The
  // stage list and the parts list are two views of one radio, and this is what
  // joins them.
  const stageParts = useMemo(() => {
    if (!selectedStage) return null
    return STAGES.find((s) => s.id === selectedStage)?.components ?? null
  }, [selectedStage])

  const heat = useMemo(() => heatByPart(thermal, view === 'thermal'), [thermal, view])

  return (
    <>
      <CameraRig view={view} reducedMotion={reducedMotion} />
      <BenchLighting />

      <group>
        <Radio
          explode={explode}
          selectedPart={selectedPart}
          highlightParts={stageParts}
          hoveredPart={null}
          heat={heat}
          hideShell={hideShell}
          screenColor="#0a2a33"
          fanRpm={thermal.fan * 4200}
          thermalView={view === 'thermal'}
          onPickPart={selectPart}
        />
      </group>

      <Station
        antennaId={config.antennaId}
        params={config.antennaParams}
        radiation={Math.min(1, solution.radiatedW / 100)}
        matchHeat={Math.max(0, Math.min(1, ((thermal.temps['balun'] ?? 25) - 25) / 115))}
        showLabels={showLabels}
        wavelengthM={299792458 / Math.max(config.freqHz, 1e5)}
        reducedMotion={reducedMotion}
      />

      <Feedline
        profile={solution.standingWave}
        lengthM={config.cableLengthM}
        swr={meters.swr}
        forwardW={meters.poW}
        active={config.keyed ? Math.max(0.25, Math.min(1, meters.poW / 100)) : 0}
        reducedMotion={reducedMotion}
        showEnvelope={showStandingWave}
      />

      {/*
        Rendered on demand rather than every frame. The shadow caster is a radio
        sitting still on a bench; re-running a 1024-square depth pass and two
        blur passes sixty times a second buys nothing and costs a lot on the
        integrated graphics this is likely to be shown on. `key` forces a fresh
        bake when the radio comes apart.
      */}
      <ContactShadows
        key={`shadows-${explode > 0 ? 'exploded' : 'assembled'}`}
        position={[0, 0.0005, 0]}
        opacity={0.55}
        scale={5}
        blur={2.4}
        far={0.6}
        resolution={1024}
        frames={2}
      />
    </>
  )
}

/** Lighting: a workshop, lit from above-left, with a cool fill from the window. */
function BenchLighting() {
  return (
    <>
      <ambientLight intensity={0.75} color="#9fb4bb" />
      <directionalLight
        position={[-1.4, 2.2, 1.6]}
        intensity={3.1}
        color="#fff4e2"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-2}
        shadow-camera-right={4}
        shadow-camera-top={2}
        shadow-camera-bottom={-2}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[2.6, 1.2, -1.8]} intensity={1.1} color="#8fc6d8" />
      {/* A low rim from the front so the bezel and the knobs separate from the
          case instead of merging into one dark mass. */}
      <directionalLight position={[0.2, 0.35, 2.2]} intensity={0.7} color="#cfe4ea" />
      {/*
        The environment is built from light shapes on the GPU. A drei `preset`
        would download an HDRI from the network, which the container must not do.
      */}
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={4.2} color="#ffffff" position={[-1.2, 2, 1.4]} scale={[3, 1.6, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={1.6} color="#6fb6cc" position={[2.4, 1.4, -1.6]} scale={[3, 2, 1]} target={[0, 0, 0]} />
        <Lightformer form="ring" intensity={0.5} color="#ffd9a8" position={[0, 2.6, -1]} scale={2} target={[0, 0, 0]} />
      </Environment>
    </>
  )
}

/** Eases the camera between view presets rather than cutting, so the viewer keeps their bearings. */
function CameraRig({ view, reducedMotion }: { view: keyof typeof CAMERAS; reducedMotion: boolean }) {
  const controls = useRef<OrbitControlsImpl>(null)
  const { camera } = useThree()
  // Where the camera is heading. Derived from the view rather than mutated in an
  // effect, so there is no render-phase write to reason about.
  const goal = useMemo(() => {
    const preset = CAMERAS[view]
    return {
      pos: new THREE.Vector3(...preset.pos),
      target: new THREE.Vector3(...preset.target),
      fov: preset.fov,
    }
  }, [view])

  // Writing to the camera is how react-three-fiber is driven: the renderer owns
  // a mutable three.js object graph and React only decides when to touch it. The
  // immutability rule cannot see that distinction, so it is switched off for
  // exactly this effect.
  /* eslint-disable react-hooks/immutability */
  useEffect(() => {
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = goal.fov
      camera.updateProjectionMatrix()
    }
    // With motion reduced there is no travel: put the camera where it belongs.
    if (reducedMotion) {
      camera.position.copy(goal.pos)
      controls.current?.target.copy(goal.target)
      controls.current?.update()
    }
  }, [goal, camera, reducedMotion])
  /* eslint-enable react-hooks/immutability */

  /**
   * A camera move is a one-off, not a force.
   *
   * The first version lerped toward the view's preset on every frame, for ever.
   * That is fine until someone drags to orbit: the rig immediately pulls the
   * camera back, so the model springs to its starting angle the moment you let
   * go and the scene cannot be looked at from anywhere else. A view change now
   * arms a single flight, and the flight ends when it arrives or when the
   * viewer takes hold of the controls — whichever happens first.
   */
  const flying = useRef(false)

  useEffect(() => {
    flying.current = !reducedMotion
  }, [goal, reducedMotion])

  useEffect(() => {
    const c = controls.current
    if (!c) return
    const stop = () => {
      flying.current = false
    }
    c.addEventListener('start', stop)
    return () => c.removeEventListener('start', stop)
  }, [])

  useFrame((_, dt) => {
    if (!flying.current || reducedMotion) return
    const c = controls.current
    const k = 1 - Math.exp(-dt * 3.4)
    camera.position.lerp(goal.pos, k)
    if (c) {
      c.target.lerp(goal.target, k)
      c.update()
    }
    // Close enough. Stopping here matters as much as starting: a rig that never
    // finishes keeps overriding the viewer for as long as the page is open.
    const arrived =
      camera.position.distanceTo(goal.pos) < 0.004 &&
      (!c || c.target.distanceTo(goal.target) < 0.004)
    if (arrived) {
      camera.position.copy(goal.pos)
      c?.target.copy(goal.target)
      c?.update()
      flying.current = false
    }
  })

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan
      enableDamping
      dampingFactor={0.08}
      minDistance={0.16}
      maxDistance={7}
      maxPolarAngle={Math.PI * 0.495}
      target={[...CAMERAS.exterior.target]}
    />
  )
}

/**
 * Which 3D parts each thermal node heats.
 *
 * The thermal model and the parts list use different vocabularies on purpose:
 * the model has a junction and a flange, the model of the radio has two physical
 * transistors. Without this map the finals would never glow, because no part is
 * called 'pa-junction'.
 */
const NODE_TO_PARTS: Readonly<Record<string, readonly string[]>> = {
  'pa-junction': ['final-q1', 'final-q2'],
  'pa-flange': ['final-q1', 'final-q2'],
  'pa-heatsink': ['pa-heatsink', 'cooling-fan'],
  'lpf-relay': ['lpf-relay', 'lpf-cap', 'lpf-board'],
  'atu-inductor': ['atu-inductor', 'atu-relay', 'atu-cap', 'atu-board'],
  'coax-connector': ['so239', 'coax-connector'],
  balun: ['balun'],
}

/** Maps thermal node temperatures onto the part ids the 3D model knows about. */
function heatByPart(thermal: { temps: Readonly<Record<string, number>> }, emphasise: boolean): Record<string, number> {
  const out: Record<string, number> = {}
  // In the thermal view the scale is compressed so a warm radio is legible;
  // elsewhere only something genuinely hot is allowed to draw the eye.
  const hot = emphasise ? 90 : 130
  const norm = (c: number) => Math.max(0, Math.min(1, (c - 25) / (hot - 25)))
  for (const [node, c] of Object.entries(thermal.temps)) {
    const parts = NODE_TO_PARTS[node] ?? [node]
    const v = norm(c)
    for (const part of parts) {
      out[part] = Math.max(out[part] ?? 0, v)
    }
  }
  return out
}
