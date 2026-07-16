import { expect, test } from '@playwright/test';

test('v0.16.46 changelog reports source-authoritative answer repair and its retry cost honestly', async ({ page }) => {
  await page.goto('/#/changelog');

  const body = page.locator('body');
  await expect(page.getByRole('heading', { name: 'Changelog', exact: true })).toBeVisible();
  await expect(body).toContainText('0.16.46');
  await expect(body).toContainText('Let the Source Hold the Key');
  await expect(body).toContainText('intercepts 20/46 losses');
  await expect(body).toContainText('three supported content tokens');
  await expect(body).toContainText('eight replace explanation-only repairs');
  await expect(body).toContainText('130/192');
  await expect(body).toContainText('61 to 62');
  await expect(body).toContainText('adapter remains inactive');
});
