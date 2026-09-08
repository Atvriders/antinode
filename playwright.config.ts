import { defineConfig, devices } from '@playwright/test'

/**
 * A CI runner has no GPU: the whole 3D scene is rendered by SwiftShader on the
 * CPU, and it is several times slower than a developer machine doing the same
 * thing. Timeouts are generous there rather than tuned to whatever is fastest
 * locally, because a suite that only passes on the author's laptop is not a
 * suite.
 */
const SLOW = Boolean(process.env.CI)

export default defineConfig({
  testDir: './e2e',
  timeout: SLOW ? 240_000 : 120_000,
  expect: { timeout: SLOW ? 45_000 : 25_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'off',
    // The load event waits on the first WebGL frame, which is exactly the slow
    // part. Every test waits for the canvas explicitly straight afterwards, so
    // waiting for it twice only costs time.
    navigationTimeout: SLOW ? 120_000 : 60_000,
    actionTimeout: SLOW ? 45_000 : 20_000,
    launchOptions: {
      args: [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--no-sandbox',
        '--disable-dev-shm-usage',
      ],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1600, height: 1000 } } }],
  webServer: {
    command: 'npm run preview -- --port 4173 --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
