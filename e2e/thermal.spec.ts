import { test, expect } from '@playwright/test'

/**
 * The thermal view has to show heat where the heat is. An earlier version mapped
 * thermal node ids straight onto part ids, and since no part is called
 * "pa-junction" the finals never glowed at all.
 */
test('the thermal view shows the finals and the heatsink getting hot', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="viewport"] canvas', { timeout: 30_000 })

  await page.getByTestId('preset-dummy-load').click()
  await page.getByTestId('mode-FM').click()
  await page.getByTestId('view-tab-thermal').click()
  await page.getByTestId('ptt').click()
  await page.getByTestId('timescale-60').click()
  await page.waitForTimeout(10_000)

  const temp = Number(((await page.getByTestId('readout-patemp').textContent()) ?? '').replace(/[^0-9.-]/g, ''))
  expect(temp, 'the finals should be well above ambient after ten minutes of key-down').toBeGreaterThan(45)

  // The breakdown list carries a damage indicator per part with an accessible
  // name, so the heat is legible without relying on colour alone.
  await page.getByTestId('view-tab-exploded').click()
  await page.waitForTimeout(800)
  await expect(page.getByTestId('damage-final-q1')).toBeVisible()
  await expect(page.getByTestId('damage-pa-heatsink')).toBeVisible()

  await page.getByTestId('view-tab-thermal').click()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'screenshots/thermal-hot.png' })
})
