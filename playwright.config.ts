import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end config. Run with `npm run test:e2e` (or `npx playwright test`).
 * Vitest only picks up tests/**\/*.test.ts, so these *.spec.ts files never run under `npm test`.
 */
const PORT = 5190;

/** Playback timing in notes.spec is checked in the motion projects; reduced-motion.spec covers that project. */
const NOT_NOTES = /notes\.spec\.ts$/;
const ONLY_REDUCED = /reduced-motion\.spec\.ts$/;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // Scene generation (paper textures, sprites) is CPU-heavy; keep parallelism modest so timing-based tests stay honest.
  workers: process.env.CI ? 2 : 3,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'desktop',
      testIgnore: ONLY_REDUCED,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
    },
    {
      name: 'laptop',
      testIgnore: ONLY_REDUCED,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
    },
    {
      name: 'mobile',
      testIgnore: ONLY_REDUCED,
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 412, height: 915 },
        hasTouch: true,
        isMobile: true,
      },
    },
    {
      name: 'reduced-motion',
      testIgnore: NOT_NOTES,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
        reducedMotion: 'reduce',
      },
    },
  ],
});
