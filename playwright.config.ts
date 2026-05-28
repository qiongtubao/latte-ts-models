import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:3456',
  },
  webServer: {
    command: 'node dist/cli/index.js ui --port 3456 --no-open',
    port: 3456,
    reuseExistingServer: true,
    timeout: 15000,
  },
});
