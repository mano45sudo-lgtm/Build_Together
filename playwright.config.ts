import { defineConfig, devices } from '@playwright/test';

// Playwright E2E scaffold. Browsers are installed on demand when E2E work begins:
//   pnpm exec playwright install chromium
// Phase 0 provides config + one placeholder spec so the toolchain is wired, not to run a
// full suite (no product UI exists yet).
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
