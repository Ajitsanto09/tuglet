import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 7_000 },
  workers: 1, // each test owns a whole browser profile; keep runs deterministic
  retries: 0,
  reporter: [['list']],
  webServer: {
    command: 'node scripts/serve-demo.mjs --port 4173',
    url: 'http://localhost:4173/',
    reuseExistingServer: true,
  },
});
