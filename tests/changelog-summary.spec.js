import { expect, test } from '@playwright/test';

test('public changelog stays concise and instructor-facing', async ({ page }) => {
  await page.goto('/#/changelog');

  await expect(page.getByRole('heading', { name: 'Changelog', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Better output fidelity' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recent improvements' })).toBeVisible();
  await expect(page.getByText('A calmer workspace')).toBeVisible();
  await expect(page.locator('main')).not.toContainText('compiler burden');
  await expect(page.locator('main')).not.toContainText('evidence replay');
});
