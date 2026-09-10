import { describe, expect, it } from 'vitest'
import { withoutCollisions } from '../src/three/fx/Annotations'
import type { LabelBox } from '../src/three/fx/Annotations'

/**
 * A callout is a fixed number of pixels wide whatever the scene is. Two parts a
 * comfortable distance apart on a desk are the same box on a phone, and the same
 * two collide again on any screen once the camera swings so one sits behind the
 * other — so which labels are drawn is decided in screen space, every frame,
 * rather than by counting them.
 */
const box = (id: string, left: number, top: number, width = 100, height = 20): LabelBox => ({
  id,
  left,
  right: left + width,
  top,
  bottom: top + height,
})

describe('placing labels over the picture', () => {
  it('keeps every label when none of them touch', () => {
    expect(
      withoutCollisions([box('a', 0, 0), box('b', 200, 0), box('c', 0, 60)]),
    ).toEqual(['a', 'b', 'c'])
  })

  it('drops the later of two that overlap', () => {
    // The socket and the fan sit within a few centimetres of each other on the
    // back of the radio; on a phone their labels are the same box.
    expect(withoutCollisions([box('socket', 100, 100), box('fan', 160, 108)])).toEqual(['socket'])
  })

  it('takes them in order, so the important one wins', () => {
    const forward = withoutCollisions([box('first', 0, 0), box('second', 40, 4)])
    const reversed = withoutCollisions([box('second', 40, 4), box('first', 0, 0)])
    expect(forward).toEqual(['first'])
    expect(reversed).toEqual(['second'])
  })

  it('lets a third through when it is clear of both survivors', () => {
    expect(
      withoutCollisions([box('a', 0, 0), box('b', 30, 5), box('c', 0, 400)]),
    ).toEqual(['a', 'c'])
  })

  it('counts touching edges as clear, not as a collision', () => {
    // Exactly abutting is the boundary case, and two labels that share an edge
    // are both readable.
    expect(withoutCollisions([box('a', 0, 0, 100), box('b', 100, 0, 100)])).toEqual(['a', 'b'])
  })

  it('never returns a set that still contains an overlap', () => {
    // Forty boxes scattered across a phone-sized canvas, deterministically.
    const boxes: LabelBox[] = []
    for (let i = 0; i < 40; i++) {
      boxes.push(box(`n${i}`, (i * 61) % 380, (i * 37) % 320, 90 + (i % 5) * 20))
    }
    const kept = withoutCollisions(boxes)
    const keptBoxes = boxes.filter((b) => kept.includes(b.id))
    for (const [i, a] of keptBoxes.entries()) {
      for (const b of keptBoxes.slice(i + 1)) {
        const overlaps =
          a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
        expect(overlaps, `${a.id} and ${b.id} were both kept but overlap`).toBe(false)
      }
    }
    expect(kept.length).toBeGreaterThan(0)
  })

  it('returns nothing when there is nothing to place', () => {
    expect(withoutCollisions([])).toEqual([])
  })
})
