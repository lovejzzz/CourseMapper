import { expect, test } from '@playwright/test';

test.describe('Provider picker', () => {
  test('redirects stale browser-local WebLLM settings to keyless Scion', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('coursemapper-provider', 'webllm');
      localStorage.setItem('coursemapper-modelid', 'Llama-3.2-1B-Instruct-q4f16_1-MLC');
      localStorage.setItem('coursemapper-modelname', 'Local browser model');
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Edit' }).click();

    await expect(page.getByLabel('Provider')).toHaveValue('public');
    await expect(page.getByLabel('Provider').locator('option[value="webllm"]')).toHaveCount(0);
    await expect(page.getByText('Local browser model')).toHaveCount(0);

    await page
      .getByLabel('Describe your course')
      .fill('Design an 8 lesson graduate course on trauma-informed social work practice.');
    await expect(page.getByTestId('landing-setup-button')).toBeEnabled();
  });

  test('restores the cloud provider the user chose last time', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('coursemapper-provider', 'google');
    });

    await page.goto('/');

    await expect(page.getByLabel('Provider')).toHaveValue('google');
    await expect(page.getByLabel('API', { exact: true })).toHaveCount(0);
  });

  test('redirects stale Local provider settings to keyless Scion', async ({ page }) => {
    let localProbeCount = 0;
    await page.route('http://127.0.0.1:8799/v1/models', async (route) => {
      localProbeCount += 1;
      await route.abort();
    });
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('coursemapper-provider', 'local');
      localStorage.setItem('coursemapper-modelid', 'scion-1');
      localStorage.setItem('coursemapper-modelname', 'Scion-1');
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Edit' }).click();

    await expect(page.getByLabel('Provider')).toHaveValue('public');
    await expect(page.getByLabel('Provider').locator('option[value="local"]')).toHaveCount(0);
    await expect(page.getByLabel('API', { exact: true })).toBeDisabled();
    await expect(page.getByLabel('API', { exact: true })).toHaveValue('No API key required');
    await expect(page.getByLabel('Model').locator('option')).toHaveText('Scion V0.16.25');
    await expect(page.getByTestId('scion-draft-boundary')).toBeVisible();
    await expect(page.getByTestId('enrichment-preference')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Check server' })).toHaveCount(0);
    await expect(page.getByText('Failed to fetch')).toHaveCount(0);
    await page.waitForTimeout(1000);
    expect(localProbeCount).toBe(0);
  });
});
