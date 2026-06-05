import { expect, test } from '@playwright/test';

test.describe('Provider picker', () => {
  test('redirects stale local AI settings to a supported BYOK provider', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('coursemapper-provider', 'webllm');
      localStorage.setItem('coursemapper-modelid', 'Llama-3.2-1B-Instruct-q4f16_1-MLC');
      localStorage.setItem('coursemapper-modelname', 'Local browser model');
    });

    await page.goto('/');

    await expect(page.getByLabel('Provider')).toHaveValue('anthropic');
    await expect(page.getByLabel('Provider').locator('option[value="webllm"]')).toHaveCount(0);
    await expect(page.getByText('Local browser model')).toHaveCount(0);

    await page
      .getByLabel('Describe your course')
      .fill('Design an 8 lesson graduate course on trauma-informed social work practice.');
    await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });
});
