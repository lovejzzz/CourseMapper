import { defineConfig } from '@playwright/test';

const e2ePort = Number(process.env.COURSEMAPPER_E2E_PORT || 5180);
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;

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
    baseURL: e2eBaseUrl,
    headless: true,
    screenshot: 'only-on-failure',
    // Local runs have retries: 0, so 'on-first-retry' never captured a trace
    // for local failures — a failure left only a screenshot. Retaining traces
    // on failure adds timeline, console, and network context at small cost.
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${e2ePort} --strictPort`,
    url: e2eBaseUrl,
    // The default Vite port is often occupied by a developer tab or an older
    // audit. Reusing that transient process let it vanish midway through a
    // 141-test run. The suite owns a dedicated strict port for its full life.
    reuseExistingServer: false,
    timeout: 15000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
