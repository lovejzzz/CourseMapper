import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  testMatch: [
    'workspace-mobile.spec.js',
    'export-smoke.spec.js',
    'restored-homepage.spec.ts',
    'scion-compiler-workspace.spec.js',
  ],
  timeout: 60000,
  workers: 1,
  retries: 0,
  reporter: [['line'], ['html', { open: 'never', outputFolder: 'verification-output/compatibility-browser' }]],
  use: {
    baseURL: 'http://127.0.0.1:5196',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5196 --strictPort',
    url: 'http://127.0.0.1:5196',
    reuseExistingServer: false,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
