import { defineConfig, devices } from '@playwright/test'

/**
 * Every run of this suite renders the 3D scene on the CPU.
 *
 * `launchOptions` below forces `--use-angle=swiftshader` for everyone, not just
 * for CI, so that a screenshot means the same thing wherever it was taken. The
 * timeouts here used to be halved when `process.env.CI` was unset, on the
 * assumption that a developer machine is faster — but it is doing exactly the
 * same software rasterising, and the only thing that split achieved was a suite
 * that failed locally and passed on CI.
 *
 * The numbers are sized for what that work actually costs. Forcing a WebGL frame
 * capture takes 10-13s here, measured, and flat whether the clip is a whole
 * viewport or a 200x120 corner — it is the capture, not the pixels. Anything
 * that screenshots the canvas needs room for several of those.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 420_000,
  expect: { timeout: 45_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'off',
    // The load event waits on the first WebGL frame, which is exactly the slow
    // part. Every test waits for the canvas explicitly straight afterwards, so
    // waiting for it twice only costs time.
    navigationTimeout: 120_000,
    actionTimeout: 90_000,
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
