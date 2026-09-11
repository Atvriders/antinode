import { useMemo } from 'react'
import { Html } from '@react-three/drei'
import styles from './callout.module.css'

export interface CalloutSpec {
  id: string
  /** World position the leader line points at. */
  at: readonly [number, number, number]
  label: string
  /** Live value, when the thing being pointed at has one. */
  value?: string
  tone?: 'normal' | 'signal' | 'hot'
}

/**
 * An annotation pointing at something in the scene.
 *
 * Drawn as HTML rather than as 3D text: at a projector's viewing distance,
 * extruded lettering is a smear and a DOM label is crisp at any zoom, picks up
 * the same typography as the rest of the interface, and can be read by a screen
 * reader.
 *
 * Deliberately NOT occluded. drei's blending occlusion composites a
 * full-viewport element over the canvas, which paints over every other overlay
 * in the application — the meters, the tools and the view note all disappeared.
 * Labels that stay visible through the case are also the more useful behaviour
 * here: the point of naming the finals is to find them, and hiding the name
 * because the lid is in the way defeats it.
 */
export function Callout({ spec }: { spec: CalloutSpec }) {
  const pos = useMemo(() => [spec.at[0], spec.at[1], spec.at[2]] as [number, number, number], [spec.at])
  return (
    <Html
      position={pos}
      center={false}
      distanceFactor={undefined}
      zIndexRange={[4, 0]}
      wrapperClass={styles.wrapper}
    >
      {/* `data-hidden` and `visibility` are written here by the declutter in
          Annotations, inside the frame it measures — deliberately not React
          state, which would apply them a frame late. Suppressed labels are
          hidden rather than unmounted so their boxes stay measurable. */}
      <div
        className={styles.callout}
        data-testid={`callout-${spec.id}`}
        data-tone={spec.tone ?? 'normal'}
      >
        <span className={styles.dot} aria-hidden="true" />
        <span className={styles.text}>
          <span className={styles.label}>{spec.label}</span>
          {spec.value && <span className={styles.value}>{spec.value}</span>}
        </span>
      </div>
    </Html>
  )
}
