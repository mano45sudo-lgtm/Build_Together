import { test, expect } from '@playwright/test';

// Phase 0 placeholder E2E. Real journeys are added in later UI phases.
// Run requires browsers: `pnpm exec playwright install chromium` and a running web app.
test.describe('BuildTogether scaffold (placeholder)', () => {
  test.skip(true, 'No product UI in Phase 0 — E2E journeys arrive in later phases.');

  test('placeholder', async () => {
    expect(true).toBe(true);
  });
});
