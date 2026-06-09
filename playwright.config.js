import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  timeout: 30000,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  // v0.8.6 failure-visibility refinements:
  // - line reporter keeps terminal output compact while running
  // - html + json reports land in gitignored verification-output/e2e-report,
  //   so a red run always leaves an inspectable artifact with the failing
  //   step, error, attached screenshot, and trace — no re-run needed
  reporter: [
    ['line'],
    ['html', { open: 'never', outputFolder: 'verification-output/e2e-report' }],
    ['json', { outputFile: 'verification-output/e2e-report/results.json' }],
  ],
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    screenshot: 'only-on-failure',
    // Local runs have retries: 0, so 'on-first-retry' never captured a trace
    // for local failures — a failure left only a screenshot. Retaining traces
    // on failure adds timeline, console, and network context at small cost.
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    port: 5173,
    reuseExistingServer: true,
    timeout: 15000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
