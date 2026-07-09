import { expect, test } from '@playwright/test';

test.describe('Provider picker', () => {
  test('redirects stale local browser settings to keyless Scion', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('coursemapper-provider', 'webllm');
      localStorage.setItem('coursemapper-modelid', 'Llama-3.2-1B-Instruct-q4f16_1-MLC');
      localStorage.setItem('coursemapper-modelname', 'Local browser model');
    });

    await page.goto('/');

    await expect(page.getByLabel('Provider')).toHaveValue('public');
    await expect(page.getByLabel('Provider').locator('option[value="webllm"]')).toHaveCount(0);
    await expect(page.getByText('Local browser model')).toHaveCount(0);

    await page
      .getByLabel('Describe your course')
      .fill('Design an 8 lesson graduate course on trauma-informed social work practice.');
    await expect(page.getByTestId('landing-setup-button')).toBeEnabled();
  });

  test('does not probe a restored Local provider until the user checks the server', async ({ page }) => {
    let localProbeCount = 0;
    await page.route('http://127.0.0.1:8799/v1/models', async (route) => {
      localProbeCount += 1;
      await route.abort();
    });
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('coursemapper-local-provider-opt-in', 'true');
      localStorage.setItem('coursemapper-provider', 'local');
      localStorage.setItem('coursemapper-modelid', 'scion-1');
      localStorage.setItem('coursemapper-modelname', 'Scion-1');
    });

    await page.goto('/');

    await expect(page.getByLabel('Provider')).toHaveValue('local');
    await expect(page.getByRole('button', { name: 'Check server' })).toBeVisible();
    await expect(page.getByText('Failed to fetch')).toHaveCount(0);
    await page.waitForTimeout(1000);
    expect(localProbeCount).toBe(0);

    await page.getByRole('button', { name: 'Check server' }).click();

    await expect.poll(() => localProbeCount).toBe(1);
    await expect(page.getByText('Local offline')).toBeVisible();
    await expect(page.getByText('Local server unavailable')).toHaveCount(2);
  });
});
