import { test, expect, type Page } from '@playwright/test';
import { completeCourse } from '../../src/studio/__tests__/fixtures';
import JSZip from 'jszip';
import fs from 'node:fs/promises';

async function health(page: Page, ready = true) {
  await page.route('**/api/scion/health', (route) =>
    route.fulfill({
      status: ready ? 200 : 451,
      json: ready
        ? { ready, model: 'synthetic-test-only' }
        : { ready, error: 'Online generation is not available in your region.' },
    }),
  );
}
async function openFixture(page: Page) {
  const course = completeCourse();
  for (const lesson of Object.values(course.lessons)) {
    const task = lesson.activities[1];
    task.datasets = [
      { id: 'delays', label: 'Different fictional trip delays', kind: 'observations', values: [2, 4, 6, 20] },
    ];
    task.calculations = [
      { dataset: 'delays', operation: 'mean', expected: 8 },
      { dataset: 'delays', operation: 'median', expected: 5 },
    ];
    task.material = 'Fictional delays are 2, 4, 6 and 20 minutes.';
    task.evidence = [];
    task.answer = 'TEACHER_ONLY_ANSWER: Mean {{delays.mean}}, median {{delays.median}}.';
  }
  await page.goto('/');
  await page.getByRole('button', { name: 'Open course', exact: true }).click();
  await page.locator('input[type=file][accept=".json"]').setInputFiles({
    name: 'synthetic.edutool.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(course)),
  });
  await expect(page.getByRole('heading', { name: 'Understanding delay data', exact: true })).toBeVisible();
  return course;
}

test('course import, student/teacher export separation, deep edits and stable lesson identity survive refresh', async ({
  page,
}) => {
  await health(page);
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));
  const original = await openFixture(page);
  await expect(page.getByText('TEACHER_ONLY_ANSWER', { exact: false })).toHaveCount(0);
  const exported = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export course' }).click();
  await page.getByRole('button', { name: 'Download course package' }).click();
  const zip = await JSZip.loadAsync(await fs.readFile((await (await exported).path())!));
  const studentFile = Object.keys(zip.files).find((name) => name.includes('student') && name.endsWith('.html'))!;
  const teacherFile = Object.keys(zip.files).find((name) => name.includes('teacher') && name.endsWith('.html'))!;
  expect(await zip.file(studentFile)!.async('string')).not.toContain('TEACHER_ONLY_ANSWER');
  expect(await zip.file(teacherFile)!.async('string')).toContain('TEACHER_ONLY_ANSWER');
  expect(zip.file('slideDecks.pptx')).not.toBeNull();
  expect(zip.file('courseMap.xlsx')).not.toBeNull();
  await page.getByRole('button', { name: 'Close export', exact: true }).click();
  await page.getByRole('button', { name: 'Instructor view' }).click();
  await expect(page.getByText('TEACHER_ONLY_ANSWER', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Edit lesson', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Saved teacher revision');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Saved teacher revision' })).toBeVisible();
  const address = page.url();
  await page.getByRole('button', { name: 'Move later' }).click();
  await expect(page.getByRole('button', { name: 'Move later' })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Saved teacher revision' })).toBeVisible();
  expect(new URL(page.url()).hash).toBe(new URL(address).hash);
  const saved = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save course file' }).click();
  const backup = JSON.parse(await fs.readFile((await (await saved).path())!, 'utf8'));
  expect(backup.lessons[original.lessonOrder[0]].activities[0].id).toBe(
    original.lessons[original.lessonOrder[0]].activities[0].id,
  );
  expect(backup.edits.length).toBe(2);
  expect(failures).toEqual([]);
});

test('a shared allowance failure saves a resumable course without downloading a model', async ({ page }) => {
  await health(page);
  await page.route('**/api/scion/complete', (route) =>
    route.fulfill({
      status: 429,
      headers: { 'Retry-After': '86400' },
      json: { error: 'Shared free daily allowance reached.' },
    }),
  );
  await page.goto('/');
  await page
    .getByLabel('What do you want to teach or learn?')
    .fill('Distinguish an observation from an inference using short fictional records.');
  await page.getByRole('button', { name: 'Prepare materials' }).click();
  await page.getByLabel('Lessons', { exact: true }).fill('2');
  await page.getByRole('checkbox', { name: /I am 18 or older/ }).check();
  await page.getByRole('button', { name: 'Build my course' }).click();
  await expect(page.getByRole('alert')).toContainText('Shared free daily allowance reached');
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
  await expect(page.getByText('0 of 2 lessons saved')).toBeVisible();
});

test('mobile retains the backup control and navigation; region restrictions remain explicit', async ({ page }) => {
  await health(page, false);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByLabel('What do you want to teach or learn?').fill('Evidence-based reading');
  await page.getByRole('button', { name: 'Prepare materials' }).click();
  await expect(page.getByText('Online generation is not available in your region.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Build my course' })).toBeDisabled();
  await openFixture(page);
  await expect(page.getByRole('button', { name: 'Save course file' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('link', { name: 'Privacy', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Privacy', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Back to Studio' }).click();
  await expect(page.getByRole('heading', { name: 'What do you want to teach/learn?', exact: true })).toBeVisible();
});

test('rich editing syncs a task across materials, survives reload, and exports formatted Word and Chinese PDF', async ({
  page,
}, testInfo) => {
  test.setTimeout(60000);
  await health(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openFixture(page);
  await page.getByRole('button', { name: 'All materials' }).click();
  await page.getByLabel('Choose material').selectOption('assignments');
  await page
    .getByRole('button', { name: 'Edit Explain why the large delay changes the mean more than the median.' })
    .first()
    .click();
  const editor = page.getByRole('textbox', { name: 'Linked material text' });
  await editor.fill('解释较大的延误值为何对平均数的影响大于中位数。');
  await editor.press('ControlOrMeta+A');
  await page.getByRole('button', { name: 'Bold', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('rich-editor.png') });
  await page.getByRole('button', { name: 'Save & sync materials' }).click();
  await expect(page.getByRole('status')).toContainText('Saved and synced across');
  await expect(page.locator('.material-document strong').filter({ hasText: '解释较大的延误值' })).toBeVisible();
  await page.getByLabel('Choose material').selectOption('student');
  await expect(page.locator('.material-document strong').filter({ hasText: '解释较大的延误值' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'All materials' }).click();
  await expect(page.locator('.material-document strong').filter({ hasText: '解释较大的延误值' })).toBeVisible();
  await page.getByLabel('Choose material').selectOption('assignments');
  await page.getByRole('button', { name: 'Export this material' }).click();
  const wordDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download DOCX' }).click();
  const word = await JSZip.loadAsync(await fs.readFile((await (await wordDownload).path())!));
  const xml = await word.file('word/document.xml')!.async('string');
  expect(xml).toMatch(/<w:b\/>[^<]*.*?解释较大的延误值/s);
  expect(xml).not.toContain('TEACHER_ONLY_ANSWER');
  await page.getByRole('combobox', { name: 'Export format', exact: true }).selectOption('pdf');
  const pdfDownload = page.waitForEvent('download', { timeout: 60000 });
  await page.getByRole('button', { name: 'Download PDF' }).click();
  const pdf = await pdfDownload;
  await pdf.saveAs(testInfo.outputPath('chinese-assignment.pdf'));
  const bytes = await fs.readFile((await pdf.path())!);
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  expect(bytes.length).toBeGreaterThan(10000);
  await page.getByRole('button', { name: 'Close export', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('linked-assignments.png'), fullPage: true });
  expect(errors).toEqual([]);
});
