import { BENCH } from '../scene-constants'
import { mat } from '../materials'

/**
 * The bench. A dark worktop with an engineering grid etched into it, which does
 * two jobs: it gives the eye a sense of scale, and it makes the whole scene read
 * as a drawing board rather than a floating object on a black background.
 */
export function Bench() {
  const w = BENCH.maxX - BENCH.minX
  const d = BENCH.maxZ - BENCH.minZ
  const cx = (BENCH.maxX + BENCH.minX) / 2
  const cz = (BENCH.maxZ + BENCH.minZ) / 2

  const lines: number[] = []
  for (let x = Math.ceil(BENCH.minX * 10) / 10; x < BENCH.maxX; x += 0.1) lines.push(x)

  return (
    <group>
      <mesh position={[cx, -0.001, cz]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={mat('bench')}>
        <planeGeometry args={[w, d]} />
      </mesh>

      {/* The grid: 100 mm squares, drawn as very thin plates so they take light
          from the same lamp as everything else instead of glowing on their own. */}
      {lines.map((x) => (
        <mesh key={`x${x.toFixed(2)}`} position={[x, 0.0002, cz]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.0012, d]} />
          <meshBasicMaterial color="#1e2629" toneMapped={false} />
        </mesh>
      ))}
      {lines
        .filter((v) => v >= BENCH.minZ && v <= BENCH.maxZ)
        .map((z) => (
          <mesh key={`z${z.toFixed(2)}`} position={[cx, 0.0002, z]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[w, 0.0012]} />
            <meshBasicMaterial color="#1e2629" toneMapped={false} />
          </mesh>
        ))}
    </group>
  )
}
