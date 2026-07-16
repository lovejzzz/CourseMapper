import { expect, test } from '@playwright/test';

test('v0.16.40 changelog shows compiler recovery and a judgment-ready boundary', async ({ page }) => {
  await page.goto('/#/changelog');

  const body = page.locator('body');
  await expect(page.getByRole('heading', { name: 'Changelog', exact: true })).toBeVisible();
  await expect(body).toContainText('0.16.40');
  await expect(body).toContainText('Repair, Then Judge');
  await expect(body).toContainText('admission rises from 133/192 (69.3%) to 149/192 (77.6%)');
  await expect(body).toContainText('exactly 100 source-grounded comparisons');
  await expect(body).toContainText('must not judge it');
  await expect(body).toContainText('Hosted Scion remains the pinned public Gemma base');
});
