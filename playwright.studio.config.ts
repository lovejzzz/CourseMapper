import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/studio',
  timeout: 30000,
  workers: 1,
  retries: 0,
  reporter: [['line'], ['html', { open: 'never', outputFolder: 'verification-output/studio-browser' }]],
  use: {
    baseURL: 'http://127.0.0.1:5194',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5194 --strictPort',
    url: 'http://127.0.0.1:5194',
    reuseExistingServer: false,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
