import { expect, test } from '@playwright/test';

test('v0.16.42 changelog reports the paired gap without claiming an adapter win', async ({ page }) => {
  await page.goto('/#/changelog');

  const body = page.locator('body');
  await expect(page.getByRole('heading', { name: 'Changelog', exact: true })).toBeVisible();
  await expect(body).toContainText('0.16.42');
  await expect(body).toContainText('Both Orders Agree');
  await expect(body).toContainText('46 stable score-qualified GPT-5.4-mini winners');
  await expect(body).toContainText('30 stable ties');
  await expect(body).toContainText('one opposite-winner disagreement');
  await expect(body).toContainText('Scion base records zero stable wins');
  await expect(body).toContainText('The research gate remains closed at 46/100');
  await expect(body).toContainText('hosted Scion remains the pinned public Gemma base plus compiler');
});
