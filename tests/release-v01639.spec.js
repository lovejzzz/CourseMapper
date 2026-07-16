import { expect, test } from '@playwright/test';

test('v0.16.39 changelog shows exact adapter lineage without claiming a quality win', async ({ page }) => {
  await page.goto('/#/changelog');

  const body = page.locator('body');
  await expect(page.getByRole('heading', { name: 'Changelog', exact: true })).toBeVisible();
  await expect(body).toContainText('0.16.39');
  await expect(body).toContainText('One Adapter, One Lineage');
  await expect(body).toContainText('52,704,096-byte browser adapter');
  await expect(body).toContainText('This is a permanently non-promotable smoke adapter');
  await expect(body).toContainText('hosted Scion stays base-only');
});
