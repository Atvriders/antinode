import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

/**
 * The scene is actually being drawn.
 *
 * This exists because seventy-one tests passed against a completely black
 * canvas. A `useFrame` with a priority above zero takes over the render loop in
 * react-three-fiber and the automatic render stops; the labels, the meters and
 * every panel carried on exactly as before, over nothing. Every other test in
 * this suite reads the DOM, and the DOM was fine.
 *
 * A WebGL canvas cannot be read back with `toDataURL` or `drawImage` unless it
 * was created with `preserveDrawingBuffer`, which costs frame time in normal
 * use. So the picture is compared instead: against itself with the canvas
 * hidden, which is the page's own background and therefore exactly what a dead
 * canvas looks like, and against a different view of the same scene.
 */
async function captureViewport(page: Page, hideCanvas = false): Promise<Buffer> {
  // Only the canvas: the labels and the note are DOM, and would otherwise be
  // the thing that differs between two captures of a scene that never drew.
  await page.addStyleTag({
    content: `[data-testid^="callout-"], [class*="_wrapper_"], [class*="_viewNote_"],
              [data-testid="tour-step"] { visibility: hidden !important; }
              ${hideCanvas ? '[data-testid="viewport"] canvas { visibility: hidden !important; }' : ''}`,
  })
  await page.waitForTimeout(400)
  // What this costs on a CPU rasteriser, and why the budget for it is where it
  // is, is recorded in playwright.config.ts.
  return page.locator('[data-testid="viewport"]').screenshot()
}

test('the 3D scene is actually rendering', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="viewport"] canvas', { timeout: 120_000 })
  await page.waitForTimeout(2500)

  const drawn = await captureViewport(page)

  // The same page with the canvas itself hidden: the panel background, which is
  // precisely what a stopped render loop leaves behind.
  const blank = await captureViewport(page, true)
  expect(
    Buffer.compare(drawn, blank),
    'the viewport looks the same with the canvas hidden as with it shown — the scene is not being drawn',
  ).not.toBe(0)
})

test('the picture changes when the view does', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="viewport"] canvas', { timeout: 120_000 })
  await page.waitForTimeout(2500)
  const exterior = await captureViewport(page)

  await page.getByTestId('view-select').selectOption('cutaway')
  await page.waitForTimeout(3500)
  const cutaway = await captureViewport(page)

  expect(
    Buffer.compare(exterior, cutaway),
    'the exterior and the cutaway draw the same pixels — the scene is frozen',
  ).not.toBe(0)
})
