import { test, expect } from '@playwright/test'

const VIEWS = ['exterior', 'signal-path', 'exploded', 'cutaway', 'thermal', 'station'] as const

test('every view renders and is reachable by keyboard', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="viewport"] canvas', { timeout: 30_000 })

  for (const [i, v] of VIEWS.entries()) {
    await page.getByTestId(`view-tab-${v}`).click()
    await page.waitForTimeout(1400)
    await expect(page.getByTestId(`view-tab-${v}`)).toHaveAttribute('aria-current', 'true')
    await expect(page.locator('[data-testid="viewport"] canvas')).toBeVisible()
    await page.screenshot({ path: `screenshots/view-${i + 1}-${v}.png` })
  }

  // Number keys select views.
  await page.keyboard.press('3')
  await expect(page.getByTestId('view-tab-exploded')).toHaveAttribute('aria-current', 'true')
})

test('layout does not scroll horizontally at any width', async ({ page }) => {
  for (const width of [1920, 1440, 1180, 900, 640, 380]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-testid="viewport"] canvas', { timeout: 30_000 })
    await page.waitForTimeout(700)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(1)
    await page.screenshot({ path: `screenshots/width-${width}.png` })
  }
})

/**
 * Two switches in the tools panel did nothing for most of the project's life:
 * `showLabels` was threaded all the way to the scene and never read, and the
 * component `showEnergyFlow` was meant to drive was never built. A control that
 * lies is worse than one that is absent.
 */
test('the labels and flow switches actually change the picture', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="viewport"] canvas', { timeout: 30_000 })
  await page.waitForTimeout(3000)

  // By test id, not by text: "Antenna socket" is also a row in the chain rail.
  const labels = () => page.locator('[data-testid^="callout-"]')
  await expect(labels().first()).toBeVisible()

  await page.getByRole('switch', { name: /labels/i }).click()
  await page.waitForTimeout(600)
  await expect(labels()).toHaveCount(0)

  await page.getByRole('switch', { name: /labels/i }).click()
  await page.waitForTimeout(600)
  await expect(labels().first()).toBeVisible()

  // Flow only has anything to show while transmitting; check it renders and
  // toggles without taking the canvas down.
  await page.getByTestId('view-tab-signal-path').click()
  await page.getByTestId('ptt').click()
  await page.waitForTimeout(2500)
  await page.getByRole('switch', { name: /flow/i }).click()
  await page.waitForTimeout(1200)
  await expect(page.locator('[data-testid="viewport"] canvas')).toBeVisible()
})
