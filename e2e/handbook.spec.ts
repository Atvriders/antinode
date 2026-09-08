import { test, expect } from '@playwright/test'

/**
 * The Handbook slides over the right rail, not over the application. It escaped
 * once, when the grid gained a containing block and the rail did not, and it
 * covered the entire window.
 */
test('the Handbook card stays inside the right rail', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="viewport"] canvas', { timeout: 30_000 })

  await page.getByTestId('stage-final-pa').click()
  const card = page.getByTestId('handbook')
  await expect(card).toBeVisible()

  const box = await card.boundingBox()
  expect(box).not.toBeNull()
  if (!box) return
  // It must occupy a rail, not the window.
  expect(box.width).toBeLessThan(420)
  expect(box.x).toBeGreaterThan(1000)
  // The model must still be visible next to it.
  await expect(page.locator('[data-testid="viewport"] canvas')).toBeVisible()
  await page.screenshot({ path: 'screenshots/handbook.png' })

  await page.getByTestId('handbook-close').click()
  await expect(card).toHaveCount(0)
})
