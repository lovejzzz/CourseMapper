import { expect, test } from '@playwright/test';

test('v0.16.45 changelog reports source-aware semantic admission and its retry cost honestly', async ({ page }) => {
  await page.goto('/#/changelog');

  const body = page.locator('body');
  await expect(page.getByRole('heading', { name: 'Changelog', exact: true })).toBeVisible();
  await expect(body).toContainText('0.16.45');
  await expect(body).toContainText('Stop Calling Truth a Misconception');
  await expect(body).toContainText('intercepts 18/46 losses');
  await expect(body).toContainText('three shared content tokens');
  await expect(body).toContainText('(Claim 0).');
  await expect(body).toContainText('131/192 atoms');
  await expect(body).toContainText('51 to 61');
  await expect(body).toContainText('adapter remains inactive');
});
