import { expect, test } from '@playwright/test';

test('v0.16.44 changelog reports conservative semantic repair and its corpus cost honestly', async ({ page }) => {
  await page.goto('/#/changelog');

  const body = page.locator('body');
  await expect(page.getByRole('heading', { name: 'Changelog', exact: true })).toBeVisible();
  await expect(body).toContainText('0.16.44');
  await expect(body).toContainText('Read the Evidence First');
  await expect(body).toContainText('intercepts 12/46 losses');
  await expect(body).toContainText('six answer-index repairs');
  await expect(body).toContainText('first affirmative sentence');
  await expect(body).toContainText('141/192 atoms');
  await expect(body).toContainText('123 to 118');
  await expect(body).toContainText('no quality adapter is trained or active');
});
