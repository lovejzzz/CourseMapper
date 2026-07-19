import { expect, test } from '@playwright/test';

test('keeps the setup journey readable at the 320px minimum width', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload();

  await page.getByRole('textbox', { name: 'Describe your course' }).fill(
    'Design a 6-week introductory user experience research course with interviews, usability testing, synthesis, and a portfolio-ready final study.',
  );
  await page.getByRole('button', { name: 'Customize package' }).click();
  await expect(page.getByRole('heading', { name: 'Choose materials' })).toBeVisible();

  const progressLabels = page.getByTestId('setup-progress').locator('li > span > span:last-child');
  await expect(progressLabels).toHaveText(['Brief', 'Materials', 'Generate']);

  const continuation = page.getByTestId('feature-select-continue');
  await expect(continuation).toBeVisible();
  await expect(continuation.getByText('Review generation', { exact: true })).toBeVisible();
  await expect(continuation).toContainText('Course Map only');
  const continuationBox = await continuation.boundingBox();
  expect(continuationBox.x).toBeGreaterThanOrEqual(8);
  expect(continuationBox.x + continuationBox.width).toBeLessThanOrEqual(page.viewportSize().width - 8);

  const metrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.body.scrollWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 2);

  await page.getByRole('button', { name: 'Recommended set' }).click();
  await continuation.click();
  await expect(page.getByRole('heading', { name: 'Configure generation' })).toBeVisible();
  await expect(page.getByText('Scion runs locally in this browser and needs no API key.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate workspace' })).toBeVisible();

  const configMetrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.body.scrollWidth,
  }));
  expect(configMetrics.scrollWidth).toBeLessThanOrEqual(configMetrics.clientWidth + 2);
});
