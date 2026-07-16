import { expect, test } from '@playwright/test';

test('v0.16.38 changelog states the recomputable judge contract without claiming a model win', async ({ page }) => {
  await page.goto('/#/changelog');

  const body = page.locator('body');
  await expect(page.getByRole('heading', { name: 'Changelog', exact: true })).toBeVisible();
  await expect(body).toContainText('0.16.38');
  await expect(body).toContainText('Score Twice, Prove Every Score');
  await expect(body).toContainText('The adapter promotion verifier now reconstructs every model-judge scorecard');
  await expect(body).toContainText('claims no adapter quality gain');
});
