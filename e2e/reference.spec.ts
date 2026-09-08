import { test, expect } from '@playwright/test'

/**
 * The myth cards and the glossary are the payload of the whole application. They
 * were authored, committed, and then rendered nowhere at all — the audit found
 * them sitting in the bundle unreachable.
 */
test('the reference drawer shows the corrections and the glossary', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="viewport"] canvas', { timeout: 30_000 })

  await page.getByTestId('reference-open').click()
  const sheet = page.getByTestId('reference')
  await expect(sheet).toBeVisible()

  // The reflected-power correction is the one this application exists to make.
  await expect(sheet).toContainText(/reflected/i)
  const cards = await page.locator('[data-testid^="myth-"]').count()
  expect(cards).toBeGreaterThanOrEqual(10)

  await page.getByTestId('reference-tab-glossary').click()
  await expect(sheet).toContainText(/standing wave/i)

  // Searching narrows it.
  await page.getByRole('searchbox').fill('velocity factor')
  await expect(sheet).toContainText(/velocity factor/i)

  await page.screenshot({ path: 'screenshots/reference.png' })
  await page.getByTestId('reference-close').click()
  await expect(sheet).toHaveCount(0)
})

test('the solver advice reaches the screen', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="viewport"] canvas', { timeout: 30_000 })
  await page.getByTestId('preset-long-thin-coax').click()
  await page.getByTestId('ptt').click()
  await page.waitForTimeout(2500)
  // Eleven sentences of teaching copy were being computed every frame and thrown
  // away. At least one of them must be visible when the station deserves it.
  await expect(page.getByTestId('advice')).toBeVisible()
})
