import { expect, test } from '@playwright/test';

test('v0.16.41 changelog shows one sealed first order without claiming a preference or model win', async ({ page }) => {
  await page.goto('/#/changelog');

  const body = page.locator('body');
  await expect(page.getByRole('heading', { name: 'Changelog', exact: true })).toBeVisible();
  await expect(body).toContainText('0.16.41');
  await expect(body).toContainText('One Order Under Seal');
  await expect(body).toContainText('All ten chunks use one exact judge revision');
  await expect(body).toContainText('changed exactly 200 status labels to `scored`');
  await expect(body).toContainText('No combined completed-review plaintext was written');
  await expect(body).toContainText('One presentation order cannot establish a stable preference');
  await expect(body).toContainText('Hosted Scion remains the pinned public Gemma base plus compiler');
});
