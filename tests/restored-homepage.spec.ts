import { expect, test } from '@playwright/test';

test('online Scion preserves its selection but requires explicit data permission before continuing', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (/\.gguf(?:\?|$)|\/api\/scion\/complete/.test(request.url())) requests.push(request.url());
  });
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Describe your course' }).fill('A short course on evaluating evidence.');
  await page.getByTestId('ai-config-summary').getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('combobox', { name: 'Model', exact: true }).selectOption('scion-hosted');
  const notice = page.getByTestId('scion-model-boundary');
  await expect(notice).toContainText('human review');
  await expect(notice).toContainText('Source research off');
  const permission = notice.getByRole('checkbox');
  await expect(permission).not.toBeChecked();
  await expect(page.getByTestId('landing-setup-button')).toBeDisabled();
  await expect(
    page.getByText('Open AI settings and review the online Scion data notice, or choose local Scion.', { exact: true }),
  ).toBeVisible();
  await permission.check();
  await expect(page.getByTestId('landing-setup-button')).toBeEnabled();
  await page.reload();
  await page.getByRole('textbox', { name: 'Describe your course' }).fill('A short course on evaluating evidence.');
  await expect(page.getByTestId('ai-config-summary')).toContainText('Online Scion');
  await page.getByTestId('ai-config-summary').getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Model', exact: true })).toHaveValue('scion-hosted');
  await page.getByTestId('scion-model-boundary').getByRole('checkbox').uncheck();
  await expect(page.getByTestId('landing-setup-button')).toBeDisabled();
  await page.getByRole('combobox', { name: 'Model', exact: true }).selectOption('scion-public');
  await expect(page.getByTestId('landing-setup-button')).toBeEnabled();
  expect(requests).toEqual([]);
});

test('the original homepage retains attachments, all original material choices and the custom builder', async ({
  page,
}) => {
  const modelRequests: string[] = [];
  page.on('request', (request) => {
    if (/\.gguf(?:\?|$)|:generateContent|:streamGenerateContent|\/api\/scion\/complete/.test(request.url()))
      modelRequests.push(request.url());
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Turn a syllabus into a teachable course.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Attach files', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Describe your course' }).fill('A short course on evaluating evidence.');
  await page.getByTestId('landing-setup-button').click();
  await expect(page.getByRole('heading', { name: 'Choose materials', exact: true })).toBeVisible();
  for (const name of [
    'Syllabus',
    'Lesson Plans',
    'Slide Decks',
    'Assignment Briefs',
    'Rubrics',
    'Discussion Prompts',
    'Quiz & Exam Bank',
    'Study Guides',
    'Course FAQ',
  ])
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Select all', exact: true }).click();
  await expect(page.getByRole('button', { name: /Configure materials/ })).toContainText('9');
  await page.getByRole('button', { name: /Create custom/ }).click();
  await expect(page.getByRole('dialog', { name: 'Create Custom Deliverable' })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Describe your course' })).toHaveValue(
    'A short course on evaluating evidence.',
  );
  expect(modelRequests).toEqual([]);
});
