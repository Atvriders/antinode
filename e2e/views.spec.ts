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
