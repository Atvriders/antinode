import { describe, expect, it } from 'vitest'
import { layoutFor } from '../src/ui/useLayout'

/**
 * The layout is chosen from the space available, not from the device. These are
 * the sizes the responsive contract names, plus the awkward ones either side of
 * each boundary.
 */
describe('choosing a layout', () => {
  it('matches the contract at the named sizes', () => {
    expect(layoutFor(1920, 1080)).toBe('wide')
    expect(layoutFor(1280, 800)).toBe('wide')
    expect(layoutFor(1024, 768)).toBe('medium')
    expect(layoutFor(768, 1024)).toBe('compact')
    expect(layoutFor(430, 932)).toBe('compact')
    expect(layoutFor(390, 844)).toBe('compact')
    expect(layoutFor(320, 568)).toBe('compact')
  })

  it('treats a short window as compact however wide it is', () => {
    // A phone held sideways has room across and none down. Stacking is what
    // works there, the same as in a narrow window — an earlier version gave the
    // 3D view 100 pixels of height on a landscape phone.
    expect(layoutFor(844, 390)).toBe('compact')
    expect(layoutFor(1920, 420)).toBe('compact')
  })

  it('switches exactly at the boundaries, with no gap between modes', () => {
    expect(layoutFor(1239, 900)).toBe('medium')
    expect(layoutFor(1240, 900)).toBe('wide')
    expect(layoutFor(899, 900)).toBe('compact')
    expect(layoutFor(900, 900)).toBe('medium')
    expect(layoutFor(1000, 519)).toBe('compact')
    expect(layoutFor(1000, 520)).toBe('medium')
  })

  it('always returns one of the three modes, for any plausible window', () => {
    for (let w = 280; w <= 2560; w += 37) {
      for (let h = 300; h <= 1600; h += 53) {
        expect(['wide', 'medium', 'compact']).toContain(layoutFor(w, h))
      }
    }
  })
})
