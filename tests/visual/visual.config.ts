import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  use: {
    baseURL: 'http://localhost:53305/garden/',
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
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
