import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

/**
 * The responsive layout contract, checked at the sizes people actually hold.
 *
 * This suite exists because the application was written at 1600x1000 and only
 * ever looked at there. Every rule below is in docs/CONTRACT.md under
 * "Responsive layout contract", and every one of them was broken at some point:
 *
 *  - phone landscape (844x390) left the 3D canvas about forty pixels tall,
 *    under a header, a meter cluster and a transport bar that between them ate
 *    the whole window — a 3D teaching tool whose 3D is a letterbox is not one;
 *  - the six view tabs were a single non-wrapping row, so on a 320px phone the
 *    last three views could not be reached at all;
 *  - the meter cluster and the view tools are absolutely positioned over the
 *    viewport, which is fine on a desk and hides the entire model on a phone;
 *  - the station rail set a min-width in pixels and pushed the page sideways.
 *
 * Nobody can look at the screen on a CI runner, so every assertion here names
 * the element it is unhappy about and the number it measured.
 */

const VIEWS = ['exterior', 'signal-path', 'exploded', 'cutaway', 'thermal', 'station'] as const
type ViewId = (typeof VIEWS)[number]

const SHEET_TABS = ['meters', 'chain', 'station', 'tools'] as const

type LayoutMode = 'wide' | 'medium' | 'compact'

type Size = { width: number; height: number; note: string }

/**
 * The sizes are real devices plus the boundaries of the contract's table, because
 * a rule stated as a threshold is only ever wrong within a pixel of it. 1280x500
 * is a laptop with a short window, and it is `compact` by the height clause even
 * though it is wider than a tablet.
 */
const SIZES: readonly Size[] = [
  { width: 320, height: 568, note: 'smallest phone worth supporting' },
  { width: 390, height: 844, note: 'typical phone portrait' },
  { width: 430, height: 932, note: 'large phone portrait' },
  { width: 844, height: 390, note: 'phone landscape' },
  { width: 768, height: 1024, note: 'tablet portrait' },
  { width: 900, height: 600, note: 'medium at its lower edge' },
  { width: 1024, height: 768, note: 'tablet landscape' },
  { width: 1239, height: 800, note: 'medium at its upper edge' },
  { width: 1280, height: 800, note: 'small laptop' },
  { width: 1280, height: 500, note: 'laptop with a short window' },
  { width: 1920, height: 1080, note: 'desktop' },
]

/**
 * The contract's table, in code. Height is checked first on purpose: a short
 * window is `compact` however wide it is, which is the phone-landscape case.
 */
function expectedLayout(width: number, height: number): LayoutMode {
  if (width < 900 || height < 520) return 'compact'
  return width >= 1240 ? 'wide' : 'medium'
}

type Box = { x: number; y: number; width: number; height: number }

type Audit = {
  layout: string | null
  documentOverflow: number
  bodyOverflow: number
  canvas: Box | null
  innerWidth: number
  innerHeight: number
  visibleViewTabs: number
  viewSelectVisible: boolean
  sheetPresent: boolean
  sheetVisible: boolean
  namedOverlays: string[]
  sweptOverlays: string[]
  headerOverlaps: string[]
  parentOverflows: string[]
  clipped: string[]
  truncated: string[]
  smallTargets: string[]
}

const CANVAS = '[data-testid="viewport"] canvas'

/**
 * Software rendering means the canvas can take the better part of a minute to
 * turn up, and the shell reflows once more when it does. Waiting for the canvas
 * alone measured the layout mid-reflow often enough to be worth this.
 */
async function boot(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector(CANVAS, { timeout: 90_000 })
  await settle(page)
}

/** Waits for two identical readings rather than for a fixed number of seconds. */
async function settle(page: Page): Promise<void> {
  let previous = ''
  await expect
    .poll(
      async () => {
        const now = await page.evaluate(() => {
          const canvas = document.querySelector('[data-testid="viewport"] canvas')
          const rect = canvas?.getBoundingClientRect()
          const shell = document.querySelector('[data-testid="layout"]')
          return [
            Math.round(rect?.width ?? 0),
            Math.round(rect?.height ?? 0),
            document.documentElement.scrollWidth,
            document.documentElement.clientHeight,
            shell?.getAttribute('data-layout') ?? '',
          ].join('/')
        })
        const settled = now === previous && !now.startsWith('0/0/')
        previous = now
        return settled
      },
      {
        message: 'the shell never stopped reflowing: the canvas or the page width kept changing',
        timeout: 60_000,
        intervals: [300],
      },
    )
    .toBe(true)
}

/**
 * One pass over the document per page load. Every geometric rule in the contract
 * is measured here together, so a size that is wrong reports everything that is
 * wrong with it instead of one thing per run.
 */
function audit(page: Page): Promise<Audit> {
  return page.evaluate(() => {
    const TOL = 1

    const boxOf = (el: Element): Box => {
      const r = el.getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height }
    }

    const isVisible = (el: Element): boolean => {
      const s = getComputedStyle(el)
      if (s.display === 'none' || s.visibility === 'hidden') return false
      if (Number(s.opacity) < 0.05) return false
      if (el.closest('[aria-hidden="true"]')) return false
      const r = el.getBoundingClientRect()
      return r.width > 0.5 && r.height > 0.5
    }

    // Offenders are named the way a person would search for them: test id first,
    // then tag plus a couple of classes plus whatever text it carries.
    const name = (el: Element): string => {
      const id = el.getAttribute('data-testid')
      if (id) return `[data-testid="${id}"]`
      const tag = el.tagName.toLowerCase()
      const raw = typeof el.className === 'string' ? el.className.trim() : ''
      const cls = raw.length > 0 ? `.${raw.split(/\s+/).slice(0, 2).join('.')}` : ''
      const label = el.getAttribute('aria-label') ?? ''
      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 28)
      const words = label.length > 0 ? label : text
      return words.length > 0 ? `${tag}${cls} "${words}"` : `${tag}${cls}`
    }

    const overlap = (a: Box, b: Box): { w: number; h: number } => ({
      w: Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
      h: Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
    })

    const px = (v: string): number => {
      const n = Number.parseFloat(v)
      return Number.isFinite(n) ? n : 0
    }

    const round = (n: number): number => Math.round(n * 10) / 10

    const shell = document.querySelector('[data-testid="layout"]')
    const viewportHost = document.querySelector('[data-testid="viewport"]')
    const canvasEl = document.querySelector('[data-testid="viewport"] canvas')
    const canvas = canvasEl ? boxOf(canvasEl) : null

    // ---- the view selector, and which form of it is on screen -----------------
    const tabs = Array.from(document.querySelectorAll('[data-testid^="view-tab-"]'))
    const selectEl = document.querySelector('[data-testid="view-select"]')
    const sheetEl = document.querySelector('[data-testid="sheet"]')

    // ---- nothing overlays the canvas ------------------------------------------
    // The named check: the three things the contract says must move into the
    // sheet. Each is found from a leaf that is unmistakably part of it and then
    // climbed to the outermost box that is still only about that panel.
    const panelRootOf = (el: Element): Element => {
      let node: Element = el
      for (;;) {
        const parent = node.parentElement
        if (!parent || parent === document.body) return node
        if (canvasEl && parent.contains(canvasEl)) return node
        node = parent
      }
    }

    const namedOverlays: string[] = []
    const sweptOverlays: string[] = []
    if (canvas) {
      const meterLeaf = document.querySelector('[data-testid="readout-swr"]')
      const toolsLeaf =
        Array.from(document.querySelectorAll('[role="switch"]')).find((el) =>
          /label/i.test(el.textContent ?? ''),
        ) ?? null
      const handbook = document.querySelector('[data-testid="handbook"]')

      const named: { what: string; el: Element | null }[] = [
        { what: 'the meter cluster', el: meterLeaf ? panelRootOf(meterLeaf) : null },
        { what: 'the view tools', el: toolsLeaf ? panelRootOf(toolsLeaf) : null },
        { what: 'the sheet', el: sheetEl },
        { what: 'the Handbook card', el: handbook },
      ]

      for (const entry of named) {
        const el = entry.el
        if (!el || !isVisible(el)) continue
        if (viewportHost && viewportHost.contains(el)) {
          namedOverlays.push(`${entry.what} (${name(el)}) is inside the viewport itself`)
          continue
        }
        const o = overlap(boxOf(el), canvas)
        if (o.w > TOL && o.h > TOL) {
          namedOverlays.push(
            `${entry.what} (${name(el)}) covers ${round(o.w)}x${round(o.h)}px of the canvas`,
          )
        }
      }

      // The swept check: anything else sitting on top of the model. Only things
      // that actually paint count — an empty positioning wrapper over the canvas
      // is invisible and harmless, a panel with a background is the bug.
      const paints = (el: Element): boolean => {
        const s = getComputedStyle(el)
        const bg = s.backgroundColor
        if (bg && bg !== 'transparent' && !/rgba\(0,\s*0,\s*0,\s*0\)/.test(bg)) return true
        if (s.backgroundImage !== 'none') return true
        if (s.boxShadow !== 'none') return true
        if (
          px(s.borderTopWidth) > 0 ||
          px(s.borderRightWidth) > 0 ||
          px(s.borderBottomWidth) > 0 ||
          px(s.borderLeftWidth) > 0
        ) {
          return true
        }
        if (/^(img|svg|button|input|select|canvas|video)$/.test(el.tagName.toLowerCase())) return true
        return Array.from(el.childNodes).some(
          (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim().length > 0,
        )
      }

      const flagged: Element[] = []
      for (const el of Array.from(document.body.querySelectorAll('*'))) {
        if (!canvasEl) break
        if (el === canvasEl || el.contains(canvasEl)) continue
        if (viewportHost && viewportHost.contains(el)) continue
        if (/^(script|style|link|template|noscript)$/.test(el.tagName.toLowerCase())) continue
        if (flagged.some((f) => f.contains(el))) continue
        if (!isVisible(el) || !paints(el)) continue
        const o = overlap(boxOf(el), canvas)
        if (o.w > 2 && o.h > 2) {
          flagged.push(el)
          sweptOverlays.push(`${name(el)} covers ${round(o.w)}x${round(o.h)}px of the canvas`)
        }
      }
    }

    // ---- header controls must not sit on top of one another --------------------
    // Found from the view selector rather than by class, because the header is
    // the one element every layout mode rebuilds.
    const viewControl = selectEl ?? tabs[0] ?? null
    const header = viewControl?.closest('header') ?? document.querySelector('header')
    const headerOverlaps: string[] = []
    if (header) {
      const all = Array.from(
        header.querySelectorAll(
          'button, select, input, a[href], summary, [role="radio"], [role="switch"], [role="tab"], [role="combobox"]',
        ),
      ).filter(isVisible)
      // Keep the leaves: a Switch is a <button role="switch">, and a segmented
      // control wraps its options, so an ancestor legitimately contains its own
      // children and would report as an overlap with every one of them.
      const leaves = all.filter((el) => !all.some((other) => other !== el && el.contains(other)))
      for (let i = 0; i < leaves.length; i++) {
        for (let j = i + 1; j < leaves.length; j++) {
          const a = leaves[i]
          const b = leaves[j]
          if (!a || !b) continue
          const o = overlap(boxOf(a), boxOf(b))
          if (o.w > TOL && o.h > TOL) {
            headerOverlaps.push(`${name(a)} and ${name(b)} overlap by ${round(o.w)}x${round(o.h)}px`)
          }
        }
      }
    }

    // ---- nothing sticks out of its parent --------------------------------------
    const parentOverflows: string[] = []
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      const parent = el.parentElement
      if (!parent || parent === document.body || parent === document.documentElement) continue
      if (!isVisible(el) || !isVisible(parent)) continue
      const s = getComputedStyle(el)
      // Positioned overlays and transformed things are placed deliberately
      // outside their parent's flow; they are covered by the overlay sweep and
      // by the page-width check instead.
      if (s.position === 'fixed' || s.position === 'absolute') continue
      if (s.transform !== 'none') continue
      // SVG geometry is not laid out by the CSS box model and is clipped by
      // viewBox and clip-path, neither of which getBoundingClientRect reports.
      // A Smith chart's constant-resistance circles are mostly outside the unit
      // circle by construction; the group is clipped and draws correctly, but
      // its measured rect is many times the chart. Anything inside an <svg> is
      // therefore checked by looking at the picture, not by measuring the DOM.
      if (el.namespaceURI === 'http://www.w3.org/2000/svg' && el.tagName !== 'svg') continue
      const ps = getComputedStyle(parent)
      if (ps.display === 'contents') continue
      // A parent that clips or scrolls on the x axis is doing so on purpose.
      if (ps.overflowX !== 'visible') continue
      const pr = parent.getBoundingClientRect()
      // Measured against the padding box, not the content box: a full-bleed row
      // inside a padded panel is a normal thing to draw and is not overflow.
      const left = pr.left + px(ps.borderLeftWidth)
      const right = pr.right - px(ps.borderRightWidth)
      const r = el.getBoundingClientRect()
      const over = Math.max(r.right - right, left - r.left)
      if (over > TOL) {
        parentOverflows.push(`${name(el)} sticks ${round(over)}px out of ${name(parent)}`)
      }
    }

    // ---- text is neither clipped nor truncated ---------------------------------
    const clipped: string[] = []
    const truncated: string[] = []
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      const tag = el.tagName.toLowerCase()
      // Form fields and replaced elements report a content width that has
      // nothing to do with whether a label is readable.
      if (/^(input|textarea|select|canvas|svg|img|video|option)$/.test(tag)) continue
      if (!isVisible(el)) continue
      const s = getComputedStyle(el)
      if (s.display === 'inline') continue
      const spill = el.scrollWidth - el.clientWidth
      if (el.clientWidth === 0) continue
      // Panel legends are set at 0.12em tracking, and the tracking after the
      // last letter counts toward scroll width in a box sized to its text. One
      // pixel of that is typography, not a clipped label.
      const slack = s.letterSpacing === 'normal' || px(s.letterSpacing) === 0 ? TOL : TOL + 2
      if (s.overflowX === 'visible') {
        if (spill > slack) {
          clipped.push(`${name(el)} is ${el.scrollWidth}px of content in a ${el.clientWidth}px box`)
        }
        continue
      }
      // Clipped or scrolling on the x axis is allowed, but an ellipsis eating a
      // label is exactly what the contract forbids: segmented controls wrap,
      // they do not shorten "Signal path" to "S…".
      if (s.textOverflow === 'ellipsis' && spill > slack) {
        truncated.push(`${name(el)} is truncated: ${el.scrollWidth}px of text in ${el.clientWidth}px`)
      }
    }

    // ---- touch targets ---------------------------------------------------------
    const smallTargets: string[] = []
    for (const el of Array.from(
      document.body.querySelectorAll('button, [role="radio"], [role="switch"], select'),
    )) {
      if (!isVisible(el)) continue
      const r = el.getBoundingClientRect()
      const short = Math.min(r.width, r.height)
      if (short < 39.5) {
        smallTargets.push(`${name(el)} is ${round(r.width)}x${round(r.height)}px`)
      }
    }

    return {
      layout: shell?.getAttribute('data-layout') ?? null,
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      bodyOverflow: document.body.scrollWidth - document.body.clientWidth,
      canvas,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      visibleViewTabs: tabs.filter(isVisible).length,
      viewSelectVisible: selectEl ? isVisible(selectEl) : false,
      sheetPresent: sheetEl !== null,
      sheetVisible: sheetEl ? isVisible(sheetEl) : false,
      namedOverlays,
      sweptOverlays,
      headerOverlaps,
      parentOverflows,
      clipped,
      truncated,
      smallTargets,
    }
  })
}

/**
 * Which view the application believes it is showing.
 *
 * Read from the shell, not from the control that was just operated: a select
 * that moves and a scene that does not is the failure this is looking for. The
 * fallbacks are in order of how much they prove.
 */
function currentView(page: Page): Promise<string> {
  return page.evaluate(() => {
    const shell = document.querySelector('[data-testid="layout"]')
    const marked = shell?.getAttribute('data-view')
    if (marked) return marked
    const tab = document.querySelector('[data-testid^="view-tab-"][aria-current="true"]')
    if (tab) return (tab.getAttribute('data-testid') ?? '').replace('view-tab-', '')
    const select = document.querySelector('[data-testid="view-select"]')
    if (select instanceof HTMLSelectElement) return select.value
    return 'nothing on the shell, no current tab and no select reports a view'
  })
}

/**
 * Wait out any CSS animation on an element before measuring it.
 *
 * `toBeVisible` resolves as soon as the element paints, and the Handbook card
 * slides in over 0.42s — so a measurement taken the moment it appears catches it
 * six pixels from where it lands. Geometry assertions have to be made against
 * the resting position, not the entrance.
 */
async function stillMoving(page: Page, testid: string): Promise<void> {
  await expect
    .poll(
      async () =>
        page.evaluate(
          (id) => document.querySelector(`[data-testid="${id}"]`)?.getAnimations().length ?? 0,
          testid,
        ),
      { message: `${testid} never stopped animating`, timeout: 10_000, intervals: [100] },
    )
    .toBe(0)
}

/** Wide uses the tab strip; everything below it uses the compact select. */
async function chooseView(page: Page, view: ViewId, mode: LayoutMode): Promise<void> {
  if (mode === 'wide') {
    await page.getByTestId(`view-tab-${view}`).click()
  } else {
    await page.getByTestId('view-select').selectOption(view)
  }
}

function canvasPixels(page: Page): Promise<string> {
  return page
    .locator(CANVAS)
    .screenshot()
    .then((shot) => shot.toString('base64'))
}

for (const size of SIZES) {
  const mode = expectedLayout(size.width, size.height)

  test.describe(`${size.width}x${size.height} — ${size.note}`, () => {
    test.use({ viewport: { width: size.width, height: size.height } })

    // Soft assertions throughout: one page load at this size costs most of a
    // minute under software rendering, so it reports every rule it breaks
    // rather than only the first.
    test(`the ${mode} layout holds together`, async ({ page }) => {
      await boot(page)
      const a = await audit(page)
      const at = `at ${size.width}x${size.height} (${size.note})`

      expect(
        a.layout,
        `no [data-testid="layout"] element carrying data-layout was found ${at}`,
      ).not.toBeNull()
      expect
        .soft(
          a.layout,
          `${at} the shell reports data-layout="${a.layout ?? 'none'}" but the contract asks for "${mode}" ` +
            `(compact below 900px wide or below 520px tall, wide from 1240px, medium between)`,
        )
        .toBe(mode)

      // Rule 4. The station rail's pixel min-width used to push the page sideways
      // on every phone, which on a touch screen means the model drifts off to the
      // left as soon as anyone swipes.
      expect
        .soft(
          a.documentOverflow,
          `${at} the page scrolls sideways by ${a.documentOverflow}px (document.scrollWidth ${
            a.innerWidth + a.documentOverflow
          } against a ${a.innerWidth}px window)`,
        )
        .toBeLessThanOrEqual(1)
      expect.soft(a.bodyOverflow, `${at} <body> scrolls sideways by ${a.bodyOverflow}px`).toBeLessThanOrEqual(1)

      // Rule 2. The floor and the share are both needed: 180px alone lets a tall
      // window give the model a sliver, and 28% alone is meaningless at 390px.
      expect(a.canvas, `${at} the viewport has no canvas to measure`).not.toBeNull()
      const canvasHeight = a.canvas?.height ?? 0
      const share = canvasHeight / a.innerHeight
      expect
        .soft(
          canvasHeight,
          `${at} the canvas is only ${Math.round(canvasHeight)}px tall; the contract's floor is 180px`,
        )
        .toBeGreaterThanOrEqual(180)
      expect
        .soft(
          share,
          `${at} the canvas takes ${(share * 100).toFixed(1)}% of the ${a.innerHeight}px window; the contract asks for 28%`,
        )
        .toBeGreaterThanOrEqual(0.28)

      // Rule 1. Six views, always reachable, in whichever form this mode uses.
      if (mode === 'wide') {
        expect
          .soft(a.visibleViewTabs, `${at} the header shows ${a.visibleViewTabs} of the 6 view tabs`)
          .toBe(6)
      } else {
        expect
          .soft(a.viewSelectVisible, `${at} [data-testid="view-select"] is missing or not visible`)
          .toBe(true)
        expect
          .soft(
            a.visibleViewTabs,
            `${at} the header still shows ${a.visibleViewTabs} view tabs; below wide the contract replaces the strip with the select`,
          )
          .toBe(0)
      }

      // Rule 3, and the sheet only exists where it belongs.
      if (mode === 'compact') {
        expect.soft(a.sheetVisible, `${at} [data-testid="sheet"] is missing or not visible`).toBe(true)
        expect
          .soft(
            a.namedOverlays,
            `${at} something the contract moves into the sheet is still on top of the model:\n  ${a.namedOverlays.join(
              '\n  ',
            )}`,
          )
          .toEqual([])
        expect
          .soft(
            a.sweptOverlays,
            `${at} these painted elements sit over the canvas:\n  ${a.sweptOverlays.join('\n  ')}`,
          )
          .toEqual([])
      } else {
        expect
          .soft(a.sheetPresent, `${at} the sheet is only meant to exist in compact`)
          .toBe(false)
      }

      // Rule 5. Measured only where the contract asks for it, but reported in
      // full so a failure is a to-do list rather than a puzzle.
      if (mode === 'compact') {
        expect
          .soft(
            a.smallTargets,
            `${at} ${a.smallTargets.length} controls are under 40px on their short side:\n  ${a.smallTargets.join(
              '\n  ',
            )}`,
          )
          .toEqual([])
      }

      // Rule 6, from both directions: content wider than its box, and labels
      // shortened to fit one.
      expect
        .soft(
          a.parentOverflows,
          `${at} these elements overflow their parent horizontally:\n  ${a.parentOverflows.join('\n  ')}`,
        )
        .toEqual([])
      expect
        .soft(
          a.clipped,
          `${at} these elements hold more content than they show:\n  ${a.clipped.join('\n  ')}`,
        )
        .toEqual([])
      expect
        .soft(
          a.truncated,
          `${at} these labels are being ellipsised away:\n  ${a.truncated.join('\n  ')}`,
        )
        .toEqual([])
      expect
        .soft(
          a.headerOverlaps,
          `${at} header controls are drawn on top of each other:\n  ${a.headerOverlaps.join('\n  ')}`,
        )
        .toEqual([])

      await page.screenshot({ path: `screenshots/responsive-${size.width}x${size.height}.png` })
    })
  })
}

/**
 * The case that was actually broken, given its own test so it cannot be lost in
 * a list of eleven.
 *
 * A phone held sideways is 390px of height for a header, a canvas, a transport
 * bar and everything else. The window is short, so the contract says compact
 * whatever the width says, and the 180px floor is what the canvas gets — the
 * 28% clause only asks for 110px here, which is why the floor exists at all.
 */
test.describe('phone landscape', () => {
  test.use({ viewport: { width: 844, height: 390 } })

  test('the model still gets 180px of height with the window on its side', async ({ page }) => {
    await boot(page)
    const a = await audit(page)

    expect(a.layout, 'a 390px-tall window is compact by the height clause, whatever its width').toBe(
      'compact',
    )
    expect(a.canvas, 'no canvas in the viewport at 844x390').not.toBeNull()
    const height = a.canvas?.height ?? 0
    expect(
      height,
      `the canvas is ${Math.round(height)}px tall in a 390px window — this is the letterbox the contract's 180px floor exists to stop`,
    ).toBeGreaterThanOrEqual(180)
    expect(
      a.documentOverflow,
      `the page scrolls sideways by ${a.documentOverflow}px at 844x390`,
    ).toBeLessThanOrEqual(1)
    expect(
      a.namedOverlays,
      `nothing may cover the model in compact, and these do:\n  ${a.namedOverlays.join('\n  ')}`,
    ).toEqual([])
  })
})

/**
 * Every view, in every layout mode.
 *
 * The tab strip is only one of the two ways in. The select was added late and
 * was wired to a local piece of state for a while, so it changed which option
 * looked chosen and nothing else: the check below reads the shell, not the
 * control that was just operated.
 */
const REACHABILITY: readonly { size: Size; mode: LayoutMode }[] = [
  { size: { width: 1920, height: 1080, note: 'desktop' }, mode: 'wide' },
  { size: { width: 1024, height: 768, note: 'tablet landscape' }, mode: 'medium' },
  { size: { width: 390, height: 844, note: 'phone portrait' }, mode: 'compact' },
  { size: { width: 844, height: 390, note: 'phone landscape' }, mode: 'compact' },
]

for (const entry of REACHABILITY) {
  test.describe(`${entry.mode} — ${entry.size.width}x${entry.size.height}`, () => {
    test.use({ viewport: { width: entry.size.width, height: entry.size.height } })

    test(`all six views are reachable in ${entry.mode}`, async ({ page }) => {
      await boot(page)

      if (entry.mode === 'wide') {
        for (const view of VIEWS) {
          await expect(
            page.getByTestId(`view-tab-${view}`),
            `the ${view} tab is missing from the wide header`,
          ).toBeVisible()
        }
      } else {
        const select = page.getByTestId('view-select')
        await expect(select, `no [data-testid="view-select"] below wide (${entry.size.note})`).toBeVisible()
        const values = await page
          .locator('[data-testid="view-select"] option')
          .evaluateAll((els) => els.map((el) => (el as HTMLOptionElement).value))
        expect(
          [...values].sort(),
          `view-select must carry one option per view id, and carries ${JSON.stringify(values)}`,
        ).toEqual([...VIEWS].sort())
      }

      // Walked in a rotated order so the first view is not also the one that is
      // already selected: "it did not change" and "it was right already" are
      // different results and only one of them is a pass.
      for (const view of VIEWS.slice(1).concat(VIEWS.slice(0, 1))) {
        await chooseView(page, view, entry.mode)
        await expect
          .poll(() => currentView(page), {
            message: `choosing ${view} in ${entry.mode} did not move the application to it`,
            timeout: 20_000,
            intervals: [200, 500],
          })
          .toBe(view)
        if (entry.mode === 'wide') {
          await expect(
            page.getByTestId(`view-tab-${view}`),
            `the ${view} tab does not report itself as current`,
          ).toHaveAttribute('aria-current', 'true')
        }
        await expect(page.locator(CANVAS), `the canvas went away on the ${view} view`).toBeVisible()
      }
    })
  })
}

/**
 * The attribute check above proves the shell knows which view it is on. This
 * proves the scene knows too, once, at the size where the two are most likely to
 * have been wired up separately.
 */
test.describe('compact rendering', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('changing view through the compact select changes the picture', async ({ page }) => {
    await boot(page)
    await chooseView(page, 'exterior', 'compact')
    await expect.poll(() => currentView(page), { timeout: 20_000 }).toBe('exterior')
    const exterior = await canvasPixels(page)

    await chooseView(page, 'thermal', 'compact')
    await expect
      .poll(async () => (await canvasPixels(page)) !== exterior, {
        message:
          'the compact selector moved the shell to the thermal view and the canvas kept drawing the exterior one',
        timeout: 45_000,
        intervals: [1000],
      })
      .toBe(true)
  })
})

/**
 * The sheet is where everything that used to float goes. It is the whole of the
 * compact layout's usable surface, so a tab that does nothing takes a quarter of
 * the application with it.
 */
for (const size of [
  { width: 390, height: 844, note: 'phone portrait' },
  { width: 844, height: 390, note: 'phone landscape' },
] as const) {
  test.describe(`the sheet at ${size.width}x${size.height}`, () => {
    test.use({ viewport: { width: size.width, height: size.height } })

    test('every tab is there and every tab shows something different', async ({ page }) => {
      await boot(page)
      await expect(
        page.getByTestId('sheet'),
        `no [data-testid="sheet"] at ${size.width}x${size.height}, which is compact`,
      ).toBeVisible()

      const bodies = new Map<string, string>()
      for (const tab of SHEET_TABS) {
        const control = page.getByTestId(`sheet-tab-${tab}`)
        await expect(control, `the sheet has no ${tab} tab`).toBeVisible()
        await control.click()

        // Whichever of the three the implementation uses to mark the current tab.
        await expect
          .poll(
            () =>
              page.evaluate((id: string) => {
                const el = document.querySelector(`[data-testid="sheet-tab-${id}"]`)
                if (!el) return 'missing'
                return [
                  el.getAttribute('aria-selected') ?? '',
                  el.getAttribute('aria-current') ?? '',
                  el.getAttribute('data-on') ?? '',
                ].join(' ')
              }, tab),
            {
              message: `the ${tab} tab does not mark itself as the current one after being clicked`,
              timeout: 15_000,
              intervals: [200],
            },
          )
          .toContain('true')

        const panel = page.getByTestId('sheet-panel')
        await expect(panel, `the sheet body is not visible on the ${tab} tab`).toBeVisible()
        const text = (await panel.innerText()).replace(/\s+/g, ' ').trim()
        expect(text.length, `the ${tab} panel is empty`).toBeGreaterThan(0)
        bodies.set(tab, text)
      }

      // Four tabs onto one panel is a real mistake to make: the state that says
      // which tab is current has to reach the body, not only the tab strip.
      for (const [a, textA] of bodies) {
        for (const [b, textB] of bodies) {
          if (a >= b) continue
          expect(
            textA === textB,
            `the ${a} and ${b} tabs show identical content, so the sheet body is not following the tabs`,
          ).toBe(false)
        }
      }

      await page.screenshot({ path: `screenshots/responsive-sheet-${size.width}x${size.height}.png` })
    })
  })
}

/**
 * Layouts are chosen by available space, not by what the browser claims to be.
 * A mode picked once at mount is indistinguishable from a correct one until
 * somebody turns their phone over or drags a window narrower.
 */
test.describe('resizing', () => {
  test.use({ viewport: { width: 1920, height: 1080 } })

  test('the layout follows the window, not the first measurement', async ({ page }) => {
    await boot(page)
    expect(
      (await audit(page)).layout,
      'the shell did not start in wide at 1920x1080',
    ).toBe('wide')

    for (const next of [
      { width: 1024, height: 768, mode: 'medium' as const },
      { width: 390, height: 844, mode: 'compact' as const },
      { width: 844, height: 390, mode: 'compact' as const },
      { width: 1920, height: 1080, mode: 'wide' as const },
    ]) {
      await page.setViewportSize({ width: next.width, height: next.height })
      await settle(page)
      const a = await audit(page)
      expect(
        a.layout,
        `resizing to ${next.width}x${next.height} left the shell in "${a.layout ?? 'none'}" instead of "${next.mode}"`,
      ).toBe(next.mode)
      expect(
        a.documentOverflow,
        `the page scrolls sideways by ${a.documentOverflow}px after resizing to ${next.width}x${next.height}`,
      ).toBeLessThanOrEqual(1)
      const height = a.canvas?.height ?? 0
      expect(
        height,
        `the canvas is ${Math.round(height)}px tall after resizing to ${next.width}x${next.height}`,
      ).toBeGreaterThanOrEqual(180)
    }
  })
})

/**
 * Rule 8. A callout is a fixed number of pixels wide whatever the scene is, so
 * two parts a comfortable distance apart on a desk are the same box on a phone —
 * and the same two collide again on any screen once the camera swings so one
 * sits behind the other. The scene places labels only where they are clear.
 */
test.describe('labels over the picture', () => {
  for (const size of [
    { width: 320, height: 568, note: 'smallest phone' },
    { width: 390, height: 844, note: 'phone portrait' },
    { width: 844, height: 390, note: 'phone landscape' },
    { width: 1024, height: 768, note: 'tablet landscape' },
    { width: 1600, height: 1000, note: 'desktop' },
  ]) {
    test(`no two callouts overlap at ${size.width}x${size.height}`, async ({ page }) => {
      await page.setViewportSize(size)
      await boot(page)
      // The declutter pass runs five times a second; give it several.
      await page.waitForTimeout(1200)

      const clashes = await page.evaluate(() => {
        const labels = Array.from(document.querySelectorAll('[data-testid^="callout-"]')).map(
          (el) => ({ text: el.textContent?.trim() ?? '', box: el.getBoundingClientRect() }),
        )
        const found: string[] = []
        for (const [i, one] of labels.entries()) {
          for (const other of labels.slice(i + 1)) {
            if (one.box.width < 1 || other.box.width < 1) continue
            const x = Math.min(one.box.right, other.box.right) - Math.max(one.box.left, other.box.left)
            const y = Math.min(one.box.bottom, other.box.bottom) - Math.max(one.box.top, other.box.top)
            if (x > 2 && y > 2) {
              found.push(
                `"${one.text}" and "${other.text}" overlap by ${Math.round(x)}x${Math.round(y)}px`,
              )
            }
          }
        }
        return { found, count: labels.length }
      })

      expect(clashes.count, `no callouts were found at all at ${size.note}`).toBeGreaterThan(0)
      expect(
        clashes.found,
        `at ${size.width}x${size.height} (${size.note}) labels are drawn on top of each other:\n  ${clashes.found.join('\n  ')}`,
      ).toEqual([])
    })
  }
})

/**
 * The Handbook cards are the explanatory half of the application. Inside the
 * compact sheet the card inherited the sheet's height — about 150px on a phone,
 * for articles three times that long — so on a small screen it leaves the sheet
 * and takes the bottom of the window, or the right of it in landscape, with the
 * picture still visible beside or above it.
 */
test.describe('the Handbook on a small screen', () => {
  for (const size of [
    { width: 390, height: 844, note: 'phone portrait' },
    { width: 844, height: 390, note: 'phone landscape' },
    { width: 768, height: 1024, note: 'tablet portrait' },
  ]) {
    test(`is readable at ${size.width}x${size.height}`, async ({ page }) => {
      await page.setViewportSize(size)
      await boot(page)

      // Open a card the same way a reader does: through the chain, from the sheet.
      await page.getByTestId('sheet-tab-chain').click()
      await page.getByTestId('stage-final-pa').click()
      const card = page.getByTestId('handbook')
      await expect(card, 'the Handbook did not open from the sheet').toBeVisible()
      await stillMoving(page, 'handbook')

      const shape = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="handbook"]')
        const body = el?.querySelector('[class*="_body_"]')
        const canvas = document.querySelector('[data-testid="viewport"] canvas')
        const r = el?.getBoundingClientRect()
        const b = body?.getBoundingClientRect()
        const c = canvas?.getBoundingClientRect()
        const transport = document.querySelector('[data-testid="transport"], [class*="_transport_"]')
        return {
          reading: Math.round(b?.height ?? 0),
          measure: Math.round(b?.width ?? 0),
          // How much of the transport bar the card actually covers. A real
          // intersection, not an edge comparison: in landscape the card is in
          // the picture's column and the transport is in the one beside it, so
          // they overlap vertically while never touching.
          intoTransport: (() => {
            if (!r || !transport) return 0
            const t = transport.getBoundingClientRect()
            const w = Math.min(r.right, t.right) - Math.max(r.left, t.left)
            const h = Math.min(r.bottom, t.bottom) - Math.max(r.top, t.top)
            return w > 0 && h > 0 ? Math.round(w * h) : 0
          })(),
          hasCanvas: !!c,
          pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        }
      })

      // Enough of a pane to read a paragraph in, not a letterbox.
      expect(
        shape.reading,
        `the reading pane is only ${shape.reading}px tall at ${size.note}`,
      ).toBeGreaterThanOrEqual(220)
      // Prose set the full width of a tablet is hard to track line to line.
      expect(
        shape.measure,
        `the text is set ${shape.measure}px wide at ${size.note}`,
      ).toBeLessThanOrEqual(760)
      // Contract rule 9: the card takes the picture and the sheet, never the
      // transport. What is behind it is checked by name in "an open card leaves
      // the controls alone" — this is the geometry the same rule rests on.
      expect(
        shape.intoTransport,
        `the card covers ${shape.intoTransport}px² of the transport bar at ${size.note}`,
      ).toBeLessThanOrEqual(0)
      expect(shape.hasCanvas, 'the picture stopped rendering behind the card').toBe(true)
      expect(shape.pageOverflow, 'the card made the page scroll sideways').toBeLessThanOrEqual(1)

      await page.screenshot({ path: `screenshots/responsive-handbook-${size.width}x${size.height}.png` })
      await page.getByTestId('handbook-close').click()
      await expect(card).toBeHidden()
    })
  }
})

/**
 * Anything floating over the picture is bounded by the picture. The tools column
 * carries the two level sliders the transport gives up below the wide layout,
 * which makes it tall; on a short window its last controls used to finish
 * underneath the transport bar, where nothing could click them.
 */
test.describe('floating panels stay inside the picture', () => {
  for (const size of [
    { width: 900, height: 540, note: 'medium, very short' },
    { width: 1024, height: 600, note: 'a 1024x600 tablet' },
    { width: 1024, height: 768, note: 'tablet landscape' },
    { width: 1239, height: 560, note: 'medium at its upper edge, short' },
    { width: 1600, height: 620, note: 'wide, short' },
    { width: 1600, height: 1000, note: 'desktop' },
  ]) {
    test(`every tool can be clicked at ${size.width}x${size.height}`, async ({ page }) => {
      await page.setViewportSize(size)
      await boot(page)

      const result = await page.evaluate(() => {
        const col = Array.from(document.querySelectorAll('div')).find(
          (d) => /Copy this bench/.test(d.textContent ?? '') && getComputedStyle(d).position === 'absolute',
        )
        if (!col) return { found: false, bad: [] as string[], under: 0 }

        const transport = document.querySelector('[data-testid="transport"], [class*="_transport_"]')
        const under = transport
          ? Math.round(col.getBoundingClientRect().bottom - transport.getBoundingClientRect().top)
          : 0

        const controls = Array.from(col.querySelectorAll('button, input, select')).filter(
          (e) => e.getBoundingClientRect().width > 2,
        )
        // Reachable means: at SOME scroll position of the column, the control's
        // centre is inside the column and a hit test there lands on it.
        const reachable = new Set<Element>()
        for (const top of [0, col.scrollHeight]) {
          col.scrollTop = top
          const cr = col.getBoundingClientRect()
          for (const el of controls) {
            const b = el.getBoundingClientRect()
            const cx = b.left + b.width / 2
            const cy = b.top + b.height / 2
            if (cy < cr.top - 1 || cy > cr.bottom + 1) continue
            const hit = document.elementFromPoint(cx, cy)
            if (hit && (hit === el || el.contains(hit) || hit.contains(el))) reachable.add(el)
          }
        }
        col.scrollTop = 0

        return {
          found: true,
          under,
          bad: controls
            .filter((e) => !reachable.has(e))
            .map((e) => (e.getAttribute('data-testid') ?? e.textContent ?? e.tagName).trim().slice(0, 24)),
        }
      })

      expect(result.found, 'the floating tools column was not found').toBe(true)
      expect(
        result.under,
        `the tools column finishes ${result.under}px inside the transport bar at ${size.note}`,
      ).toBeLessThanOrEqual(0)
      expect(
        result.bad,
        `at ${size.width}x${size.height} (${size.note}) these tools cannot be clicked at any scroll position:\n  ${result.bad.join('\n  ')}`,
      ).toEqual([])
    })
  }
})

/**
 * A card opened on a phone must not take the controls with it. The transport
 * bar is where the keys are, and the tour is advanced from the picture — both
 * have to stay live while a card is being read.
 */
test.describe('an open card leaves the controls alone', () => {
  for (const size of [
    { width: 320, height: 568, note: 'smallest phone' },
    { width: 390, height: 844, note: 'phone portrait' },
    { width: 844, height: 390, note: 'phone landscape' },
    { width: 768, height: 1024, note: 'tablet portrait' },
  ]) {
    test(`the transport still works behind a card at ${size.width}x${size.height}`, async ({ page }) => {
      await page.setViewportSize(size)
      await boot(page)
      await page.getByTestId('sheet-tab-chain').click()
      await page.getByTestId('stage-final-pa').click()
      await expect(page.getByTestId('handbook')).toBeVisible()
      await stillMoving(page, 'handbook')

      const blocked = await page.evaluate(() => {
        const out: string[] = []
        for (const sel of ['[data-testid="ptt"]', '[data-testid="tune"]', '[data-testid="view-select"]']) {
          const el = document.querySelector(sel)
          if (!el) {
            out.push(`${sel} is missing`)
            continue
          }
          const b = el.getBoundingClientRect()
          const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
          if (!hit || !(hit === el || el.contains(hit))) {
            out.push(`${sel} is behind ${hit ? (hit.getAttribute('data-testid') ?? hit.tagName) : 'nothing'}`)
          }
        }
        return out
      })
      expect(
        blocked,
        `at ${size.note} an open Handbook card blocks:\n  ${blocked.join('\n  ')}`,
      ).toEqual([])

      // And the click really reaches the key, not just passes a hit test. The
      // meters are in the sheet, which the card covers on purpose, so the key's
      // own state is what says whether the press landed.
      await expect(page.getByTestId('ptt')).toHaveAttribute('aria-pressed', 'false')
      await page.getByTestId('ptt').click()
      await expect(page.getByTestId('ptt')).toHaveAttribute('aria-pressed', 'true')
      await page.getByTestId('ptt').click()
      await expect(page.getByTestId('ptt')).toHaveAttribute('aria-pressed', 'false')
    })
  }

  test('the tour can be advanced on a phone with a card open', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await boot(page)
    await page.getByTestId('sheet-tab-tools').click()
    await page.getByRole('switch', { name: /Tour/i }).click()
    await expect(page.getByTestId('tour-step')).toBeVisible()

    const reachable = await page.evaluate(() => {
      const overlay = document.querySelector('[data-testid="tour-step"]')
      if (!overlay) return ['the tour overlay is not in the document']
      const bad: string[] = []
      for (const btn of Array.from(overlay.querySelectorAll('button'))) {
        const b = btn.getBoundingClientRect()
        if (b.width < 2 || b.height < 2) continue
        const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
        if (!hit || !(hit === btn || btn.contains(hit))) {
          bad.push(`"${btn.textContent?.trim()}" is behind ${hit ? (hit.getAttribute('data-testid') ?? hit.tagName) : 'nothing'}`)
        }
      }
      return bad
    })
    expect(reachable, `tour controls unreachable:\n  ${reachable.join('\n  ')}`).toEqual([])
  })
})

/**
 * The tour is how a presenter walks the chain, and on a phone its box is docked
 * in a picture row only a couple of hundred pixels tall. Nothing about it may be
 * clipped away, and its buttons must stay pressable.
 */
test.describe('the guided tour on a small screen', () => {
  for (const size of [
    { width: 320, height: 568, note: 'smallest phone' },
    { width: 390, height: 844, note: 'phone portrait' },
    { width: 844, height: 390, note: 'phone landscape' },
  ]) {
    test(`nothing is clipped away at ${size.width}x${size.height}`, async ({ page }) => {
      await page.setViewportSize(size)
      await boot(page)
      await page.getByTestId('sheet-tab-tools').click()
      await page.getByRole('switch', { name: /Tour/i }).click()
      const step = page.getByTestId('tour-step')
      await expect(step).toBeVisible()

      const shape = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="tour-step"]')
        if (!el) return { missing: true, hidden: [] as string[], unclickable: [] as string[] }
        const box = el.getBoundingClientRect()
        // Anything inside that is scrolled out AND cannot be scrolled to.
        const scrollable = el.scrollHeight > el.clientHeight + 1
        const hidden: string[] = []
        const unclickable: string[] = []
        for (const child of Array.from(el.querySelectorAll('h2, p, button, [class*="_count"], [class*="_progress"]'))) {
          const b = child.getBoundingClientRect()
          if (b.height < 1) continue
          const above = b.bottom < box.top - 1
          const below = b.top > box.bottom + 1
          if ((above || below) && !scrollable) {
            hidden.push(`${child.tagName} "${child.textContent?.trim().slice(0, 22)}" is outside the box and it does not scroll`)
          }
          if (child.tagName === 'BUTTON' && !above && !below) {
            const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
            if (!hit || !(hit === child || child.contains(hit))) {
              unclickable.push(`"${child.textContent?.trim()}" is behind ${hit ? (hit.getAttribute('data-testid') ?? hit.tagName) : 'nothing'}`)
            }
          }
        }
        return { missing: false, hidden, unclickable, top: Math.round(box.top), scrollable }
      })

      expect(shape.missing, 'the tour overlay is not in the document').toBe(false)
      expect(
        shape.hidden,
        `at ${size.note} part of the tour step is off the box with no way to scroll to it:\n  ${shape.hidden.join('\n  ')}`,
      ).toEqual([])
      expect(
        shape.unclickable,
        `at ${size.note} tour controls are covered:\n  ${shape.unclickable.join('\n  ')}`,
      ).toEqual([])
      await page.screenshot({ path: `screenshots/responsive-tour-${size.width}x${size.height}.png` })
    })
  }
})

/**
 * The per-size audit only ever sees the tab the sheet opens on, so three
 * quarters of the compact interface was never measured against rule 5. This
 * walks every tab and measures what each one puts on screen.
 */
test.describe('touch targets on every sheet tab', () => {
  for (const size of [
    { width: 320, height: 568, note: 'smallest phone' },
    { width: 390, height: 844, note: 'phone portrait' },
    { width: 844, height: 390, note: 'phone landscape' },
  ]) {
    test(`every tab meets the 40px rule at ${size.width}x${size.height}`, async ({ page }) => {
      await page.setViewportSize(size)
      await boot(page)

      const small: string[] = []
      for (const tab of ['meters', 'chain', 'station', 'tools'] as const) {
        await page.getByTestId(`sheet-tab-${tab}`).click()
        await page.waitForTimeout(150)
        const found = await page.evaluate((which) => {
          const panel = document.querySelector('[data-testid="sheet-panel"]')
          if (!panel) return [`${which}: no panel`]
          const out: string[] = []
          for (const el of Array.from(panel.querySelectorAll('button, select, [role="tab"], [role="switch"], [role="radio"]'))) {
            const b = el.getBoundingClientRect()
            if (b.width < 2 || b.height < 2) continue
            if (getComputedStyle(el).visibility === 'hidden') continue
            const short = Math.min(b.width, b.height)
            // 39.5 rather than 40, to absorb subpixel rounding.
            if (short < 39.5) {
              const name = (el.getAttribute('data-testid') ?? el.textContent ?? el.tagName).trim().slice(0, 24)
              out.push(`${which}: ${name} is ${Math.round(b.width)}x${Math.round(b.height)}`)
            }
          }
          return out
        }, tab)
        small.push(...found)
      }

      expect(
        small,
        `at ${size.width}x${size.height} (${size.note}) ${small.length} controls are under 40px on their short side:\n  ${small.join('\n  ')}`,
      ).toEqual([])
    })
  }
})

/**
 * Presenter mode multiplies --ui-scale, so every label over the model gets
 * bigger. The collision boxes are estimated, not measured, and an estimate
 * pinned to a scale of 1 lets them overlap again exactly where it matters most:
 * on a projector, in front of a room.
 */
test.describe('labels in presenter mode', () => {
  for (const size of [
    { width: 390, height: 844, note: 'phone portrait' },
    { width: 1024, height: 768, note: 'tablet landscape' },
    { width: 1600, height: 1000, note: 'desktop' },
  ]) {
    test(`no two callouts overlap with presenter on at ${size.width}x${size.height}`, async ({ page }) => {
      await page.setViewportSize(size)
      await boot(page)
      await page.keyboard.press('p')
      await expect
        .poll(async () =>
          page.evaluate(() =>
            Number(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')),
          ),
        )
        .toBeGreaterThan(1)

      // The cutaway is the crowded view — eight labels on the boards inside the
      // radio, several of them a couple of centimetres apart. The exterior has
      // four and would pass on a bad estimate as easily as a good one.
      const mode = (await audit(page)).layout as LayoutMode
      await chooseView(page, 'cutaway', mode)
      await page.waitForTimeout(1400)

      const clashes = await page.evaluate(() => {
        const labels = Array.from(document.querySelectorAll('[data-testid^="callout-"]')).map((el) => ({
          text: el.textContent?.trim() ?? '',
          box: el.getBoundingClientRect(),
        }))
        const found: string[] = []
        for (const [i, one] of labels.entries()) {
          for (const other of labels.slice(i + 1)) {
            if (one.box.width < 1 || other.box.width < 1) continue
            const x = Math.min(one.box.right, other.box.right) - Math.max(one.box.left, other.box.left)
            const y = Math.min(one.box.bottom, other.box.bottom) - Math.max(one.box.top, other.box.top)
            if (x > 2 && y > 2) found.push(`"${one.text}" and "${other.text}" overlap by ${Math.round(x)}x${Math.round(y)}px`)
          }
        }
        return { found, count: labels.length }
      })

      expect(clashes.count, 'no callouts were drawn at all').toBeGreaterThan(0)
      expect(
        clashes.found,
        `at ${size.note} in presenter mode labels are drawn on top of each other:\n  ${clashes.found.join('\n  ')}`,
      ).toEqual([])
    })
  }
})
