import { test, expect } from '@playwright/test'

/**
 * The container is meant to run at a club meeting on whatever network happens to
 * exist, or none. Nothing may be fetched from outside the origin.
 */
test('makes no requests to any external host', async ({ page }) => {
  const external: string[] = []
  page.on('request', (r) => {
    const u = r.url()
    if (!u.startsWith('http://127.0.0.1') && !u.startsWith('blob:') && !u.startsWith('data:')) {
      external.push(u)
    }
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="viewport"] canvas', { timeout: 30_000 })
  await page.waitForTimeout(5000)
  expect(external, `external requests: ${external.join(', ')}`).toEqual([])
})

/**
 * Warnings emitted from inside a dependency that we neither cause nor can fix
 * from here. Each one is listed individually rather than the check being relaxed,
 * so a genuinely new warning still fails the build.
 */
const KNOWN_LIBRARY_WARNINGS = [
  // @react-three/fiber's own render loop still constructs a THREE.Clock.
  'THREE.Clock: This module has been deprecated',
]

test('loads with no console errors and no React warnings', async ({ page }) => {
  const bad: string[] = []
  page.on('pageerror', (e) => bad.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return
    const text = m.text()
    if (KNOWN_LIBRARY_WARNINGS.some((known) => text.includes(known))) return
    bad.push(`${m.type()}: ${text}`)
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="viewport"] canvas', { timeout: 30_000 })
  await page.waitForTimeout(4000)
  expect(bad, bad.join('\n')).toEqual([])
})
