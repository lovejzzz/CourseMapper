import { expect, test } from '@playwright/test';

test('keeps the setup journey readable at the 320px minimum width', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload();

  await page
    .getByRole('textbox', { name: 'Describe your course' })
    .fill(
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
  await expect(page.getByText('Generation settings', { exact: true })).toBeVisible();
  await expect(page.getByText('Course Map + 5 materials selected.', { exact: true })).toBeVisible();
  await expect(page.getByTestId('config-sticky-action')).toHaveCSS('position', 'static');

  await page.getByRole('button', { name: 'Help' }).click();
  const setupHelp = page.getByTestId('setup-help-dialog');
  await expect(setupHelp).toBeVisible();
  await expect(setupHelp.getByRole('heading', { name: 'From brief to teachable package' })).toBeVisible();
  await expect(setupHelp.getByText('Generate, watch, and review')).toBeVisible();
  const setupHelpBox = await setupHelp.boundingBox();
  expect(setupHelpBox.x).toBeGreaterThanOrEqual(8);
  expect(setupHelpBox.x + setupHelpBox.width).toBeLessThanOrEqual(page.viewportSize().width - 8);
  expect(setupHelpBox.y).toBeGreaterThanOrEqual(8);
  expect(setupHelpBox.y + setupHelpBox.height).toBeLessThanOrEqual(page.viewportSize().height - 8);
  await setupHelp.getByRole('button', { name: 'Got it' }).click();
  await expect(setupHelp).toBeHidden();

  await page.getByRole('button', { name: 'Course defaults' }).click();
  await expect(page.getByText(/uses compact defaults\./)).toHaveCSS('text-overflow', 'clip');
  await expect(page.getByText('Reusable classroom policies and logistics')).toHaveCSS('text-overflow', 'clip');

  const lessonPlanSettings = page.getByRole('button', { name: 'Expand Lesson Plans settings' });
  await lessonPlanSettings.click();
  const expandedLessonPlanSettings = page.getByRole('button', { name: 'Collapse Lesson Plans settings' });
  await expect(expandedLessonPlanSettings).toBeVisible();
  await expandedLessonPlanSettings.scrollIntoViewIfNeeded();
  const generationActionBox = await page.getByTestId('config-sticky-action').boundingBox();
  const lessonPlanSettingsBox = await expandedLessonPlanSettings.boundingBox();
  expect(generationActionBox.y + generationActionBox.height).toBeLessThanOrEqual(lessonPlanSettingsBox.y + 1);

  const configMetrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.body.scrollWidth,
  }));
  expect(configMetrics.scrollWidth).toBeLessThanOrEqual(configMetrics.clientWidth + 2);
});

test('keeps custom-material orientation and actions fixed while its phone form scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload();
  await page
    .getByRole('textbox', { name: 'Describe your course' })
    .fill('Build a short interface design course with critique, prototyping, and usability testing.');
  await page.getByRole('button', { name: 'Customize package' }).click();
  await page.getByRole('button', { name: /Create custom/ }).click();

  const dialog = page.getByRole('dialog', { name: 'Create Custom Deliverable' });
  const dialogHeading = dialog.getByRole('heading', { name: 'Create Custom Deliverable' });
  const close = dialog.getByRole('button', { name: 'Close dialog' });
  const name = dialog.getByRole('textbox', { name: 'Name *' });
  const next = dialog.getByRole('button', { name: 'Next' });
  await expect(dialogHeading).toBeVisible();
  await expect(close).toBeVisible();
  await expect(name).toHaveAttribute('aria-describedby', 'custom-deliverable-name-hint');
  await expect(next).toBeDisabled();
  await expect(dialog.getByRole('tab', { name: '2. Prompt & Settings' })).toBeDisabled();

  const dialogBox = await dialog.boundingBox();
  expect(dialogBox.x).toBeGreaterThanOrEqual(8);
  expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(page.viewportSize().width - 8);
  expect(dialogBox.y).toBeGreaterThanOrEqual(8);
  expect(dialogBox.y + dialogBox.height).toBeLessThanOrEqual(page.viewportSize().height - 8);

  await name.fill('Weekly learning journal');
  await expect(next).toBeEnabled();
  await next.click();
  const create = dialog.getByRole('button', { name: 'Create Deliverable' });
  await expect(create).toBeVisible();
  await expect(create).toBeEnabled();
  await dialog
    .getByPlaceholder('Generate [deliverable type] for this course:\n\n{{courseMap}}\n\nReturn ONLY valid JSON.')
    .scrollIntoViewIfNeeded();
  await expect(dialogHeading).toBeVisible();
  await expect(close).toBeVisible();
  await expect(create).toBeVisible();

  await close.click();
  await page.getByRole('button', { name: /Create custom/ }).click();
  const reopened = page.getByRole('dialog', { name: 'Create Custom Deliverable' });
  await expect(reopened.getByRole('textbox', { name: 'Name *' })).toHaveValue('');
  await expect(reopened.getByRole('button', { name: 'Next' })).toBeDisabled();
  await expect(reopened.getByText('Add a name to continue.')).toBeVisible();
});
