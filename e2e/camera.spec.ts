import { test, expect } from '@playwright/test'

/**
 * Orbiting the model must stick.
 *
 * The camera rig used to lerp toward the current view's preset on every frame,
 * for ever, so a drag was undone the instant it ended: the scene could only ever
 * be looked at from the angle the view chose. It also meant a drag that finished
 * over a component opened that component's page, because the release counted as
 * a click.
 */

const canvasPixels = async (page: import('@playwright/test').Page) => {
  const shot = await page.locator('[data-testid="viewport"] canvas').screenshot()
  return shot.toString('base64')
}

async function boot(page: import('@playwright/test').Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="viewport"] canvas', { timeout: 30_000 })
  await page.waitForTimeout(3500)
}

async function drag(page: import('@playwright/test').Page, dx: number, dy: number) {
  const box = await page.locator('[data-testid="viewport"] canvas').boundingBox()
  if (!box) throw new Error('no canvas')
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(cx + (dx * i) / 20, cy + (dy * i) / 20)
    await page.waitForTimeout(16)
  }
  await page.mouse.up()
}

test('the view stays where it is dragged', async ({ page }) => {
  // Compared against the untouched preset rather than against an earlier frame
  // of itself: OrbitControls damps for several seconds of wall clock when the
  // renderer is running in software, so "has it stopped moving yet" is not a
  // question this environment can answer quickly. "Is it still where the preset
  // put it" is, and it is the actual property — the old rig flew home, so a
  // dragged view ended up pixel-identical to one that had never been touched.
  await boot(page)
  const untouched = await canvasPixels(page)

  await boot(page)
  await drag(page, 260, -60)
  await page.waitForTimeout(8000)
  const dragged = await canvasPixels(page)

  expect(dragged, 'the camera flew back to the view preset after the drag').not.toBe(untouched)
})

test('a drag does not open the page of whatever is under the cursor', async ({ page }) => {
  await boot(page)
  await drag(page, 240, -50)
  await page.waitForTimeout(600)
  await expect(page.getByTestId('handbook')).toHaveCount(0)
})

test('a click still opens a part, and switching view still moves the camera', async ({ page }) => {
  await boot(page)
  const box = await page.locator('[data-testid="viewport"] canvas').boundingBox()
  if (!box) throw new Error('no canvas')
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await expect(page.getByTestId('handbook')).toBeVisible()

  const before = await canvasPixels(page)
  await page.getByTestId('view-tab-station').click()
  await page.waitForTimeout(3000)
  const after = await canvasPixels(page)
  expect(after, 'changing view did not move the camera').not.toBe(before)
})
