import { test, expect } from '@playwright/test'

test('the whole interface is reachable from the keyboard', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="viewport"] canvas', { timeout: 30_000 })

  const seen: string[] = []
  for (let i = 0; i < 45; i++) {
    await page.keyboard.press('Tab')
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      if (!el || el === document.body) return null
      const s = getComputedStyle(el)
      return {
        id: el.getAttribute('data-testid') ?? el.tagName.toLowerCase(),
        outline: s.outlineStyle,
        name: el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 30) ?? '',
      }
    })
    if (info) seen.push(info.id)
  }
  expect(seen.length).toBeGreaterThan(20)
  expect(new Set(seen).size).toBeGreaterThan(12)
})

test('focus is always visible', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="viewport"] canvas', { timeout: 30_000 })
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  const visible = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null
    if (!el) return false
    const s = getComputedStyle(el)
    return s.outlineStyle !== 'none' || s.boxShadow !== 'none'
  })
  expect(visible).toBe(true)
})

test('reduced motion is honoured', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="viewport"] canvas', { timeout: 30_000 })
  await page.waitForTimeout(1500)
  const durations = await page.evaluate(() =>
    Array.from(document.querySelectorAll('*'))
      .map((el) => getComputedStyle(el).transitionDuration)
      .filter((d) => d && d !== '0s' && !d.startsWith('0s,')),
  )
  expect(durations).toEqual([])
})

test('every control has an accessible name', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="viewport"] canvas', { timeout: 30_000 })
  const unnamed = await page.evaluate(() => {
    const out: string[] = []
    document.querySelectorAll('button, input, select, [role="radio"], [role="switch"], [role="spinbutton"]').forEach((el) => {
      const e = el as HTMLElement
      const name =
        e.getAttribute('aria-label') ||
        e.getAttribute('title') ||
        (e.getAttribute('aria-labelledby') && 'labelled') ||
        e.textContent?.trim() ||
        (e.id && document.querySelector(`label[for="${e.id}"]`)?.textContent?.trim())
      if (!name) out.push(`${e.tagName}.${e.className}`.slice(0, 60))
    })
    return out
  })
  expect(unnamed, unnamed.join('\n')).toEqual([])
})
