import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
  workers: 1,
  reporter: [['list']],
});
