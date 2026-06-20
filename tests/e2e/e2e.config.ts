import { defineConfig } from '@playwright/test';

/**
 * Minimal, self-contained Playwright config for eric's behavioral interaction
 * e2e harness. Modeled on tests/visual/visual.config.ts: same dev server +
 * baseURL, headless (Playwright default), single worker so the shared dev
 * server / store introspection never races across tests.
 *
 * Run: npm run test:e2e
 */
export default defineConfig({
  testDir: '.',
  use: {
    baseURL: 'http://localhost:53305/garden/',
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    // headless is Playwright's default; stated explicitly so nobody's
    // foreground app gets a stolen-focus surprise.
    headless: true,
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:53305/garden/',
    reuseExistingServer: true,
    timeout: 30_000,
  },
  workers: 1,
  reporter: [['list']],
});
