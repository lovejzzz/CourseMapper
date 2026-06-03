import { expect, test } from '@playwright/test';

const WEBLLM_RUNTIME_URL = 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.81/lib/index.js';

test.describe('Local AI runtime', () => {
  test('loads the pinned browser runtime without blocking the landing flow', async ({ page }) => {
    await page.route(WEBLLM_RUNTIME_URL, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: `
          export async function CreateMLCEngine(modelId, options = {}) {
            options.initProgressCallback?.({
              text: 'Local model ready from mocked browser runtime.',
              progress: 1,
            });
            return {
              chat: {
                completions: {
                  create: async () => ({
                    choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
                  }),
                },
              },
              unload: async () => {},
            };
          }
        `,
      }),
    );

    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
      Object.defineProperty(navigator, 'gpu', {
        configurable: true,
        value: {},
      });
    });

    await page.goto('/');
    await page.getByLabel('Provider').selectOption('webllm');

    await expect(page.getByText('Connected')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('createRequire')).toHaveCount(0);

    await page
      .getByLabel('Describe your course')
      .fill('Design an 8 lesson graduate course on trauma-informed social work practice.');
    await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });
});
