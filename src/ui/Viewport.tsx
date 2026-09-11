import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AdaptiveDpr, OrbitControls, ContactShadows, Environment, Lightformer } from '@react-three/drei'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { Radio } from '../three/radio/Radio'
import { Station } from '../three/station/Station'
import { Feedline } from '../three/fx/Feedline'
import { Annotations } from '../three/fx/Annotations'
import { EnergyFlow } from '../three/fx/EnergyFlow'
import { CAMERAS } from '../three/scene-constants'
import { STAGES } from '../content/stages'
import { ANTENNAS } from '../rf/antennas'
import { initMaterials } from '../three/materials'
import { useStation } from '../sim/store'
import { layoutFor } from './useLayout'
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
        // PCF rather than PCFSoft: three deprecated the soft variant. What
        // softens an edge in its place is `shadow-radius` on the key light,
        // which is the spread of PCF's own nine taps and the only penumbra
        // control this filter has. It is worth having now that the shadow camera
        // is drawn tight enough for a texel to be half a millimetre across
        // rather than three.
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
          // ACES stays, and so does 1.25, after weighing both against the
          // procedural surfaces.
          //
          // Exposure is the one control shared with every emissive thing in the
          // scene — the scope, the phosphor a selected part glows with, the heat
          // ramp — and those were set against this number. The complaint this
          // pass answers is that the *lit* surfaces are dim, and lit surfaces
          // answer to the lights. Raising the exposure would have dragged the
          // display up with the casting and cost the scope its authority, so the
          // lights moved instead and this did not.
          //
          // ACES over Neutral, which was the other candidate: Khronos PBR
          // Neutral is the better mapper for reading a colour back off a
          // product, but it opens by subtracting the smallest channel outright,
          // and on a palette whose casting sits near 0.03 in linear terms that
          // takes the chassis most of the way to black. ACES has a toe rather
          // than a subtraction and holds the bottom of the range together, which
          // is what a projector with a lifted black floor needs from it.
          gl.toneMapping = THREE.ACESFilmicToneMapping
          // 1.25 was set when every surface was a flat colour and the scene
          // needed the lift. With real albedo and micro-texture on everything it
          // was clipping the lid to pure white; the casting is a dark radio and
          // should read as one.
          gl.toneMappingExposure = 1.08
          scene.background = new THREE.Color('#0d1113')
          // Fog that the set can actually reach.
          //
          // At 5.5 to 14 metres nothing in this scene was ever inside it: the
          // station camera stands 2.8 m off the radio and the far edge of the
          // three-metre worktop is 3.7 m away, so the bench ended in a ruled
          // step from its own value straight into the backdrop — a slab
          // floating in a void, with a third of the frame the same six counts
          // of black as the sky behind it. Brought in to start just past the
          // radio, the worktop and the plinth now run off into the background
          // instead of stopping at it, which is the only thing standing between
          // this view and a diagram on a black card.
          //
          // The near plane is set past the subject on purpose: at 2.6 m the
          // radio itself picks up about six per cent, which is depth rather
          // than haze, and the exterior and cutaway cameras — both inside a
          // metre — are not in it at all.
          scene.fog = new THREE.Fog('#0d1113', 2.6, 7)
          // The texture library is *not* drawn here, though this is the obvious
          // place for it and is where it was first called. See <Surfaces>.
        }}
        frameloop={reducedMotion ? 'demand' : 'always'}
      >
        <Surfaces />
        <Suspense fallback={null}>
          <SceneContents />
        </Suspense>
        <AdaptiveDpr pixelated />
      </Canvas>
    </div>
  )
}

/**
 * Draws the procedural texture library, sized from this renderer, before
 * anything in the scene asks for a material.
 *
 * It has to be the first child of the `<Canvas>` and it has to happen while that
 * child renders. `onCreated` reads as the right home for it and is not:
 * react-three-fiber calls that from a layout effect on the provider around the
 * scene, and React runs layout effects children first, so by the time it fires
 * every component below has already rendered and every material it asked for has
 * already been built at whatever size `materials.ts` defaulted to. On a window
 * that wants 1024 the default happens to be the right answer and nothing shows
 * at all, which is how a mistake like this survives; on a phone or on a desktop
 * wide enough for 2048 it means drawing the whole library twice and leaving
 * every material an individual part owns pointing at the first copy for good.
 *
 * React renders siblings in order, so a component sitting above <SceneContents>
 * runs first. `initMaterials` is idempotent, which is what makes calling it from
 * a render safe under StrictMode's double invocation.
 */
function Surfaces() {
  const gl = useThree((s) => s.gl)
  useMemo(() => initMaterials(gl), [gl])
  return null
}

function SceneContents() {
  const view = useStation((s) => s.view)
  const showLabels = useStation((s) => s.showLabels)
  const showStandingWave = useStation((s) => s.showStandingWave)
  const showEnergyFlow = useStation((s) => s.showEnergyFlow)
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

  /**
   * The contact shadow's render target, which is the largest single allocation
   * in the scene on a phone and was the only one left that never asked what it
   * was running on.
   *
   * Measured at 390x844: every generated map is 512 or smaller and the key
   * light's depth map takes its own compact branch at 1024, while this sat at
   * 1024 x 1024 regardless. It is a soft blob under a radio, blurred by 2.4 and
   * baked twice; half the edge loses nothing that survives the blur. Read once,
   * like the shadow map size, because reallocating a render target mid-session
   * to change how soft a shadow is would be a bad trade in either direction.
   */
  const contactRes = useMemo(() => (layoutFor(window.innerWidth, window.innerHeight) === 'compact' ? 512 : 1024), [])

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

      {/* The LABELS switch. Annotations are view-aware: the outside of the radio
          wants its connectors named, the inside wants its boards named, and the
          station wants the parts the numbers refer to. */}
      {showLabels && (
        <Annotations
          view={view}
          explode={explode}
          dieTempC={thermal.temps['pa-junction'] ?? thermal.ambientC}
          radiatedW={solution.radiatedW}
          swr={solution.radioMatch.swr}
          keyed={config.keyed}
          antennaLabel={ANTENNAS[config.antennaId]?.short ?? 'Antenna'}
        />
      )}

      {/* The FLOW switch, and the reason the signal-path view is called that. */}
      {showEnergyFlow && view !== 'station' && (
        <EnergyFlow stages={solution.stages} active={config.keyed} reducedMotion={reducedMotion} />
      )}

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
        resolution={contactRes}
        frames={2}
      />
    </>
  )
}

/**
 * The width of the key light's shadow frustum in metres, used to express the
 * normal bias in texels. Kept beside the frustum itself so the two cannot drift.
 */
const SHADOW_SPAN_M = 1.17

/**
 * Bench lighting: a workshop lamp over the left shoulder, the cool of the room
 * down the right side, and a hard strip behind that lifts the edge of the case
 * off the background.
 *
 * The rebalance is mostly about where the light arrives from rather than how
 * much of it there is. The previous rig put a third of its total into an
 * `ambientLight`, which arrives from every direction at once and therefore
 * shades nothing: lit that way a die-casting comes out as a flat polygon of its
 * own colour, which is exactly how the chassis was reading. That light has
 * moved into the three directionals and the environment, both of which have a
 * direction in them, and what is left of it is a hemisphere rather than a
 * constant so that at least the top of a surface differs from the bottom.
 *
 * The angles are chosen against the geometry rather than by eye. The radio is a
 * box showing three faces at once — the lid, the front panel and one flank — so
 * the key sits on the corner between them, at the elevation that lands N·L
 * within a few per cent of 0.58 on all three. That is the angle the new
 * micro-textured normal maps need to be seen at all: the contrast a perturbed
 * normal produces goes as the sine of the angle between the surface and the
 * light, so a lamp square on to a face hides that face's texture completely,
 * while one about 55 degrees off it shows four fifths of what is there and
 * still lights the face properly. The old head-on kicker from the front was
 * removed for that reason alone — it was filling the bezel by erasing it.
 *
 * The intensities look large beside the numbers they replace, and are. The
 * palette in docs/SURFACES.md is a set of genuinely dark greys measured off the
 * real radio: `cast-graphite` works out at about 0.03 albedo once sRGB is
 * undone, and a surface that dark needs a great deal of light on it before it
 * reads as the colour the swatch says it is rather than as a silhouette.
 * Exposure would have been the cheaper lever and is the wrong one; the note in
 * `onCreated` says why.
 *
 * **Every number below was then set by measuring the picture, not by computing
 * the irradiance.** The first version of this rig was sized from the diffuse
 * arithmetic above, and it predicted a lid a little lighter than the swatch.
 * What it produced was a lid at sRGB 143 against a right flank at 17 — the case
 * read as bare aluminium with a black side, and eight to one in these units is a
 * hundred to one in light. The arithmetic was not wrong, it was incomplete: the
 * exterior camera sits 19 degrees above the lid, and at that angle every
 * specular term on a near-flat face is Fresnel-boosted toward one, so the top of
 * the case is a mirror of whatever is behind and above it and hardly notices its
 * own albedo. A diffuse estimate cannot see that, and the fix for it is not a
 * diffuse fix.
 *
 * **The second correction was a colour, and value had been hiding it.** The
 * table below used to carry one number per face, and one number per face cannot
 * see what was actually wrong with this rig: the flank was *navy*. Three parts
 * blue to one of red, on a face of the same die-casting whose lid was within
 * fifteen per cent of neutral, so the radio read as a grey top bolted to a blue
 * box — one object, two materials. The cause is in the palette rather than in
 * the lights: `cast-graphite` is about 0.03 albedo, and a surface that dark has
 * almost no colour of its own to assert. It is whatever is pointed at it. What
 * was pointed at that face was a `#86b6d2` fill and a `#7fb4cf` card in the
 * environment, and nothing else at all, so that is what the paint became. Both
 * are near-neutral now, and the value came up with the saturation, which is the
 * usual way round for this: a cool white is brighter than a blue of the same
 * intensity.
 *
 * What the pixels do, sampled off the exterior view at 1280x820:
 *
 * | surface | first rig | previous | now | blue:red, now |
 * |---|---|---|---|---|
 * | lid | 143 | 91 | 96 | 1.11 |
 * | front panel | 51 | 79 | 79 | 1.17 |
 * | right flank | 17 | 38 | 44 | 1.47 |
 * | bench behind it | — | 41 | 42 | — |
 * | rear panel, thermal view | — | 24 | 32 | 1.65 |
 *
 * (Green channel, sRGB bytes; the last row is sampled off the thermal view,
 * which looks at the radio from behind and is the only place the rear panel can
 * be measured at all. The front panel reproduces the previous reading exactly
 * and the lid is within five counts, which is what says the method is sound;
 * the flank moved because the light on it changed colour, and the rear panel
 * moved because the rim was raised to reach it. The row this table
 * used to carry for the flank said 36 and could not be reproduced anywhere on
 * that face — 18 to 22 was typical, and only a chamfer band under the lid edge
 * reached the thirties — so the flank was still the failure the note beside it
 * claims to have fixed: darker than the bench behind it, which is the
 * definition of a silhouette. It now sits just above the bench.
 *
 * A lit surface sits above its swatch; the point is that it is the same order as
 * it, that the three faces of one box read as three values of one material, and
 * that all three are the same *hue*. A shadow side may be cooler than a lit one
 * — that is a room — but not by a factor of three.)
 */
function BenchLighting() {
  /**
   * The depth pass runs every frame, so a shadow map is fill rate rather than
   * memory, and this is the one lighting decision worth making per device.
   *
   * Read once from the same function the layout uses, and deliberately not
   * subscribed to: changing the size later reallocates the depth texture
   * mid-session, and all that is at stake is how crisp a shadow edge is.
   */
  const shadowMapSize = useMemo(() => (layoutFor(window.innerWidth, window.innerHeight) === 'compact' ? 1024 : 2048), [])
  // One texel of that map in metres, from the frustum below. The normal bias is
  // the nudge that stops a surface shadowing itself and it is only meaningful
  // in those units — a fixed number is right at one map size and acne or a
  // floating radio at the other.
  const texel = SHADOW_SPAN_M / shadowMapSize

  return (
    <>
      {/*
        A sky and a bench rather than a flat ambient. A hemisphere costs the same
        and has a direction in it: up-facing surfaces take the cool of the room,
        down-facing ones take what the dark worktop bounces back, and the sides
        sit between. It is deliberately weak. Its job is to keep the underside of
        the chassis and the bottom of a knob bevel off pure black; the
        environment below is what actually fills.
      */}
      <hemisphereLight intensity={0.78} color="#b3c0c4" groundColor="#2b3338" />

      {/*
        Key. Upper front left, 37 degrees up, warm — a bench lamp, and the corner
        the camera is not on: the exterior view comes in over the right shoulder,
        so a key crossing from the left is what gives the lid, the panel and the
        flank three different values instead of one.
      */}
      <directionalLight
        /*
          Lowered from y 1.55 and brought forward, keeping the same intensity.

          Measured by switching each light off in turn and sampling the lid: the
          key is 39 of its 85, the rim 14, the fill 6, the hemisphere 1 and the
          environment nothing at all. So the lid is the key's picture, and from
          up there the beam struck it nearly square-on — a #2e353a casting
          rendering as light silver, brighter than the front panel, which is
          backwards for a radio you are looking at from the front. It also hid
          the paint grain completely, since a normal map is only visible in light
          that grazes it.

          From here the same beam rakes the lid and faces the panel, and at 4.4
          rather than 6 the lid sits at 70 instead of 85 — a dark instrument
          rather than a silver box, with the front panel, the face you read,
          slightly the brighter of the two. The grain is visible on both.
        */
        position={[-1.52, 1.02, 1.98]}
        intensity={4.4}
        color="#ffeedc"
        castShadow
        shadow-mapSize={[shadowMapSize, shadowMapSize]}
        /*
          The shadow camera, drawn around the radio and the patch of bench its
          own shadow falls on, and nothing else.

          It used to span six metres by four, which put nearly three millimetres
          of world between neighbouring texels. A knob is fifteen millimetres
          across, so every feature small enough to be worth a shadow was a smear
          five texels wide. These bounds are the caster's bounding box from
          layout.ts — exploded, which is the widest it ever gets — projected into
          light space, plus the ground footprint the shadow lands on and a
          centimetre of margin.

          The depth range mattered more than the width. `shadow.bias` is in
          normalised depth, so against the default near 0.5 / far 500 a bias of
          0.0004 was worth two hundred millimetres of world offset: every shadow
          the radio's details cast was pushed clean out from under them, which is
          most of why the contact read as mush. Near and far now bracket the
          object and the bias is back to being a fraction of a millimetre.

          Anything outside this frustum is simply lit — three's shadow lookup
          returns 1.0 for a fragment that falls off the map — so the diorama a
          metre and a half to the right loses nothing it had, and its contact
          with the plinth is drawn by <ContactShadows> in any case.

          Worth knowing before editing these: three only calls
          updateProjectionMatrix() on a shadow camera when it first allocates the
          map. They are read once, at startup. Changing one of them from a
          console or an animation will appear to do nothing at all.
        */
        shadow-camera-left={-0.55}
        shadow-camera-right={0.62}
        shadow-camera-top={0.5}
        shadow-camera-bottom={-0.4}
        shadow-camera-near={1.9}
        shadow-camera-far={3.5}
        shadow-bias={-0.0002}
        shadow-normalBias={texel * 1.2}
        /*
          PCF spreads its nine taps by this many texels, and it is the only
          penumbra control the filter has. At half a millimetre to the texel the
          default 1 is a razor edge; 1.6 is about the softness a lamp the size of
          the one overhead actually casts at this distance.
        */
        shadow-radius={1.6}
      />

      {/*
        Cool fill from the right and low down, no shadow. Low because the right
        flank and the rear panel are both vertical, and a fill that comes in
        nearly level with them rakes their grain instead of flattening it.

        It is the only light that reaches the right flank at all — the key is
        over the opposite shoulder and the rim is behind — so this one number is
        the whole of that face, and its *colour* is the whole of that face's
        colour. At `#86b6d2` it was: the flank came out at sRGB 17,38,52, three
        parts blue to one of red, against a lid at 81,89,93 that is very nearly
        neutral, and one die-casting read as a grey top bolted to a navy box. A
        surface at 0.03 albedo has almost nothing of its own to say and takes
        the hue of whatever reaches it, so on this radio the fill is not a
        lighting choice, it is the paint.

        Neutral and a little stronger, then. The value is what a fill is for and
        the tint was never doing any work: a cool *white* still separates this
        side from the warm key without dyeing it.
      */}
      <directionalLight position={[2.5, 0.95, -1.75]} intensity={3.2} color="#b8c6cc" />

      {/*
        Rim, and an actual one this time. The light it replaces sat at +Z, in
        front, where it could only fill; a rim has to come from behind the
        subject relative to the viewer or it separates nothing. This one sits
        almost exactly opposite the exterior camera, so it catches the top rear
        chamfer, the tops of the knobs and the edges of the heatsink fins and
        draws them against a background that is very nearly black. Cool against
        the warm key, because a rim that matches the key reads as a second lamp
        rather than as an edge.

        It is under a third of the intensity it was first given, and lower, and
        that is the single biggest correction in this rig. Sitting opposite a
        camera that looks down on the lid at 19 degrees puts this light's
        half-vector almost exactly on the lid's normal, which is not a rim at all
        — it is a softbox aimed at the top of the case. Turning it off and
        changing nothing else took 45 per cent off the lid and flattened its
        gradient to a single value, which is how it was found: at 2.4 it was
        supplying half the brightness of the largest surface in the picture while
        claiming to be drawing its edges.
        Edges are grazing to any light that reaches them, so they still catch at
        this level; faces do not.

        It is 0.7 rather than the 0.35 that correction first landed on, because
        this is not only a rim. The thermal view stands *behind* the radio, where
        this is the one light with the rear panel in front of it: at 0.35 that
        panel sat at sRGB 24 against a bench of 41 — the same silhouette the
        fill was raised to cure on the other side of the case — and the whole
        back of the radio, which is where the reader is being asked to look at
        the heatsink, was a dark shape. Doubling it costs the exterior lid five
        counts and buys eight on the face that view exists for. Its colour came
        off the blue at the same time as the fill's did, for the same reason:
        that panel has no colour of its own either.
      */}
      <directionalLight position={[-0.55, 0.62, -2.15]} intensity={0.7} color="#ccd8dd" />

      {/*
        The environment: the room, built from light shapes on the GPU. A drei
        `preset` would download an HDRI, which the container must not do — it is
        in docs/AUDIT.md as a defect already found once.

        This is what puts highlights in the anodising and the metal. Nothing here
        is a general glow; each shape is aimed, and the two strips are aimed at
        the mirror of a camera preset. Rendered once — `frames={1}` — so five
        shapes cost no more at runtime than one did. The resolution is up from
        128 because a strip only stays a strip if it survives the cube map: at
        128 the back strip is five texels tall before three's prefiltering gets
        to it, and what comes out the other side is a smudge.
      */}
      <Environment resolution={256} frames={1}>
        {/* The room's own panel, up and to the left. The broadest source here
            and the one carrying the ambient occlusion maps, since three applies
            an aoMap to indirect light only. It reflects in the knobs and the
            dial rather than in the flat faces, which is what a soft box is for. */}
        <Lightformer
          form="rect"
          /*
            The room's ceiling panel, and the thing a horizontal lid mirrors. At
            1.6 it was most of why a #2e353a casting rendered as light silver —
            the lid was brighter than the front panel, which is backwards for a
            radio you are looking at from the front. The panel is vertical and
            barely sees this, so bringing it down separates the two faces instead
            of dimming the whole case.
          */
          intensity={0.72}
          color="#fff3e4"
          position={[-1.6, 2.5, 1.5]}
          scale={[4.5, 2.6, 1]}
          target={[0, 0.05, 0]}
        />
        {/* A strip light behind the bench, long and thin and bright. Placed on
            the mirror of the exterior camera through the lid, which is where a
            reflection in a horizontal face has to come from, so the top of the
            case gets a streak down it instead of an even sheen. That streak is
            the whole difference between brushed aluminium and grey paint.

            It is the one shape here that kept most of its intensity, because a
            streak is what it is for. The other four were roughly halved: at a 19
            degree view the lid's Fresnel is near one, so the room's average
            radiance lands on the top of the case almost undimmed by its albedo,
            and five bright shapes is a bright room. */}
        <Lightformer
          form="rect"
          intensity={3}
          color="#e6f2ff"
          position={[-0.8, 1.35, -2.4]}
          scale={[9, 0.16, 1]}
          target={[0, 0.05, 0]}
        />
        {/* Its opposite number in front, dimmer. Kept well above the front
            panel's own mirror angle so it does not lie across the scope.

            This used to claim it was what kept the lid from going matte in the
            thermal view, which looks at the radio from behind. Measured: taking
            it from 1.6 to 0.8 moved the lid in that view by nothing at all,
            because what the lid mirrors from behind is the room's big panel
            above and in front, not this strip. It is at 1.0 as a fill on the
            front of the knobs and it is worth that much; the claim is gone. */}
        <Lightformer
          form="rect"
          intensity={1.0}
          color="#dfeafa"
          position={[0.3, 1.15, 2.6]}
          scale={[6, 0.12, 1]}
          target={[0, 0.04, 0]}
        />
        {/* Daylight from the right, low and cold. It is the only thing lighting
            the far side of the antenna model in the station view, and on the
            radio it is what stops the right flank going the same value as the
            shadow under it.

            Desaturated along with the fill beside it. These two were the whole
            of the light arriving on the right flank, both of them were blue,
            and between them they were the reason the case read as two
            materials. Cold here now means a touch above neutral, not cyan. */}
        <Lightformer
          form="rect"
          intensity={0.85}
          color="#a8bcc6"
          position={[3.0, 0.75, -1.2]}
          scale={[2.6, 1.8, 1]}
          target={[0, 0.05, 0]}
        />
        {/* The worktop in front of the radio, below the horizon. The front panel
            is the face the reader spends the most time on and it is nearly
            vertical, so what reflects in it is not the ceiling but the bench —
            this sits on that mirror angle and gives the panel a sheen that falls
            off down its height. Dim and grey on purpose: it is bounced light off
            a dark surface, and anything brighter reads as a second lamp on the
            floor. */}
        <Lightformer
          form="rect"
          intensity={1.2}
          color="#5f6c74"
          position={[-1.3, -1.0, 1.7]}
          scale={[4, 3, 1]}
          target={[0, 0.05, 0]}
        />
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
