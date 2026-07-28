// eslint-disable-next-line @typescript-eslint/no-require-imports
const { defineConfig, devices } = require('playwright/test') as typeof import('playwright/test');

/**
 * Playwright config for Pixie Lab SEO E2E tests.
 *
 * All network calls to /api/lab/seo/* are mocked via page.route() inside each
 * spec — no live backend required. Browsers must be installed separately:
 *   npx playwright install chromium
 *
 * To run:
 *   npm run test:e2e
 *   npx playwright test --project=chromium
 *   npx playwright test --project=mobile-chrome
 */

export default defineConfig({
  testDir: './e2e',
  /* Glob to match only our E2E specs (not vitest unit tests) */
  testMatch: '**/*.e2e.ts',
  /* Short timeout — all network is mocked so tests should be fast */
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],

  use: {
    /* Base URL — the dev server must be running on 3002 for live tests.
       All route-mocked tests work without it since they intercept requests
       before they leave the browser. */
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3002',
    /* Capture screenshots / traces on failure */
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    /* Don't load third-party resources not covered by our mocks */
    actionTimeout: 8_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 375, height: 812 },
      },
    },
  ],

  /* webServer is intentionally omitted — tests use route-mocking and don't
     need a running Next.js server for the mock-only suites.
     Add the block below if you want playwright to start the dev server:

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3002',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  */
});
