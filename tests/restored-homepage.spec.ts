import { APP_VERSION } from '../src/lib/appVersion.js';
import { CURRENT_RELEASE } from '../src/lib/currentRelease.js';
import { expect, test } from '@playwright/test';

for (const storageMode of ['local', 'indexed-db', 'indexed-db-pointer']) {
  test(`cancelling material selection retains the previous ${storageMode} course`, async ({ page }) => {
    const modelRequests: string[] = [];
    page.on('request', (request) => {
      if (/\.gguf(?:\?|$)|:generateContent|:streamGenerateContent|\/api\/scion\/complete/.test(request.url()))
        modelRequests.push(request.url());
    });
    await page.goto('/');
    const previous = await page.evaluate(async (mode) => {
      const snapshot = JSON.stringify({
        formatVersion: 1,
        hasGenerated: true,
        provider: 'public',
        modelId: 'scion-public',
        courseMap: {
          courseName: 'Previously saved teacher course',
          lessons: [{ title: 'Original lesson', sections: [{ topicSection: 'Keep this teacher edit' }] }],
        },
        selectedFeatures: ['courseMap'],
        activeTab: 'courseMap',
        promptText: 'The original teacher brief',
        deliverables: {},
        savedAt: Date.now(),
      });
      if (mode === 'local') localStorage.setItem('coursemapper-project', snapshot);
      else {
        const { saveProjectIndexedDbAutosave } = await import('/src/lib/projectIndexedDbAutosave.js');
        await saveProjectIndexedDbAutosave(snapshot);
        if (mode === 'indexed-db-pointer')
          localStorage.setItem('coursemapper-project', JSON.stringify({ indexedDbAutosave: true }));
      }
      return snapshot;
    }, storageMode);
    await page.reload();
    await expect(page.getByTestId('saved-session-banner')).toBeVisible();
    await page.getByRole('textbox', { name: 'Describe your course' }).fill('A single 45-minute statistics lesson.');
    await page.getByTestId('landing-setup-button').click();
    await expect(page.getByRole('heading', { name: 'Choose materials', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Select all', exact: true }).click();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByTestId('saved-session-banner')).toBeVisible();
    const retained = await page.evaluate(async (mode) => {
      if (mode === 'local') return localStorage.getItem('coursemapper-project');
      const { loadProjectIndexedDbAutosave } = await import('/src/lib/projectIndexedDbAutosave.js');
      return loadProjectIndexedDbAutosave();
    }, storageMode);
    expect(retained).toBe(previous);
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await expect(page.getByTestId('workspace-shell')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Previously saved teacher course', exact: true })).toBeVisible();
    await expect(page.getByText('Keep this teacher edit', { exact: true }).first()).toBeVisible();
    expect(modelRequests).toEqual([]);
  });
}

test('saved online Scion settings migrate to local without contacting the paused API', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('coursemapper-provider', 'public');
    localStorage.setItem('coursemapper-modelid', 'scion-hosted');
    localStorage.setItem('coursemapper-modelname', 'Scion · Online Gemma 4 31B');
    localStorage.setItem('coursemapper-scion-hosted-consent', '2026-09-05-v1');
  });
  const requests: string[] = [];
  page.on('request', (request) => {
    if (/\.gguf(?:\?|$)|\/api\/scion\/(complete|health)/.test(request.url())) requests.push(request.url());
  });
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Describe your course' }).fill('A short course on evaluating evidence.');
  await page.getByTestId('ai-config-summary').getByRole('button', { name: 'Edit', exact: true }).click();
  const model = page.getByRole('combobox', { name: 'Model', exact: true });
  await expect(model).toHaveValue('scion-public');
  await expect(model.locator('option[value="scion-hosted"]')).toHaveCount(0);
  await expect(page.getByTestId('scion-online-availability')).toHaveCount(0);
  await expect(page.getByTestId('landing-setup-button')).toBeEnabled();
  await page.reload();
  await page.getByRole('textbox', { name: 'Describe your course' }).fill('A short course on evaluating evidence.');
  await expect(page.getByTestId('ai-config-summary')).not.toContainText('Online Scion');
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

test('the public changelog shows the actual current release and its quality limits', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: `v${APP_VERSION}`, exact: true }).click();
  await expect(page.getByRole('heading', { name: CURRENT_RELEASE.title, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Reason about source quantities', exact: true })).toBeVisible();
  await expect(
    page.getByText('broad source understanding and learning outcomes remain unverified', { exact: false }),
  ).toBeVisible();
  await expect(page.getByText('the shared online API stays paused', { exact: false })).toBeVisible();
});
