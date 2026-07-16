import { expect, test } from '@playwright/test';

test('v0.16.43 changelog reports semantic interception and its burden cost honestly', async ({ page }) => {
  await page.goto('/#/changelog');

  const body = page.locator('body');
  await expect(page.getByRole('heading', { name: 'Changelog', exact: true })).toBeVisible();
  await expect(body).toContainText('0.16.43');
  await expect(body).toContainText('Reject the False Pass');
  await expect(body).toContainText('intercepts nine');
  await expect(body).toContainText('three answer-index contradictions');
  await expect(body).toContainText('four explanations that merely repeat the keyed answer');
  await expect(body).toContainText('current retained-source replay admits 141/192 atoms');
  await expect(body).toContainText('compiler burden rises from 43 to 51 retry seats');
  await expect(body).toContainText('no quality adapter active');
});
