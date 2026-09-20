import { chromium } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import assert from 'node:assert/strict';
const output = new URL('../../verification-output/external-authoring/criteria/', import.meta.url);
await mkdir(output, { recursive: true });
const bundle = JSON.parse(
  await readFile(new URL('../../tests/authoring/lesson-bundle.fixture.json', import.meta.url), 'utf8'),
);
function clean(value) {
  if (!value || typeof value !== 'object') return;
  if (value.evidenceRefs) value.evidenceRefs = [];
  Object.values(value).forEach(clean);
}
clean(bundle);
bundle.lessonId = 'lesson1';
const prompt =
  'Design two different three-character cards, one from each category. Explain how your examples help a beginner distinguish the categories. Many designs can satisfy the criteria.';
const guidance =
  'TEACHER-ONLY: Accept any contrasting pair that satisfies the rule; do not require the sample pair. Ask the learner to justify the first and third characters.';
bundle.assessments[0].prompt.text = prompt;
bundle.assessments[0].evaluation = {
  kind: 'criteria-based',
  teacherText: { text: guidance, evidenceRefs: [] },
  reasoningOrCriteria: [
    {
      text: 'One card satisfies the loop rule and one does not; the learner identifies each category.',
      evidenceRefs: [],
    },
    { text: 'The explanation compares the relevant positions and explains why the pair contrasts.', evidenceRefs: [] },
  ],
};
bundle.assessments[0].studentEvidenceExpected =
  'Two original cards, their categories, and a short explanation for a beginner.';
bundle.materials.assignmentBrief = [{ text: prompt, evidenceRefs: [] }];
bundle.rubric[0].name = 'Contrasting examples';
bundle.rubric[0].bands.forEach((band, index) => {
  band.descriptor = [
    'Creates two valid contrasting cards and labels both categories correctly.',
    'Creates a contrasting pair with one labeling error.',
    'Creates one valid example but no contrast.',
    'Neither example demonstrates the requested categories.',
  ][index];
});
const plan = {
  title: 'Open-ended design task',
  description: 'Evaluate different valid designs using criteria.',
  lessons: [
    {
      clientId: 'lesson1',
      title: 'Design and explain contrasting cards',
      objectives: bundle.objectiveIds.map((clientId, i) => ({
        clientId,
        text: i ? 'Explain why contrasting examples help a beginner.' : 'Construct examples of both categories.',
      })),
    },
  ],
};
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ acceptDownloads: true });
page.setDefaultTimeout(20000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.goto(`${process.env.AUTHORING_TEST_URL || 'http://127.0.0.1:5189'}/?authoring=1`);
  await page.getByLabel('Course title', { exact: true }).fill(plan.title);
  await page.getByLabel('Teaching brief', { exact: true }).fill(plan.description);
  await page.getByLabel('Minutes per lesson', { exact: true }).fill('45');
  await page.getByRole('button', { name: 'Save request', exact: true }).click();
  await page.getByText('Import AI response', { exact: true }).click();
  await page.getByLabel('Draft JSON', { exact: true }).fill(JSON.stringify({ plan, bundles: [bundle] }));
  await page.getByRole('button', { name: 'Save imported draft', exact: true }).click();
  await page.getByRole('button', { name: 'Check and preview', exact: true }).click();
  await page.getByRole('button', { name: 'Apply reviewed draft', exact: true }).click();
  await page.getByRole('heading', { name: plan.title, exact: true }).waitFor();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByText(guidance, { exact: false }).first().waitFor();
  for (const [tab, format, name] of [
    ['Lesson Plans', '.docx', 'teacher.docx'],
    ['Assignment Briefs', '.csv', 'student.csv'],
  ]) {
    await page.getByRole('button', { name: new RegExp(`^${tab}`) }).click();
    const waiting = page.waitForEvent('download');
    await page.getByRole('button', { name: format, exact: true }).click();
    const download = await waiting;
    await download.saveAs(fileURLToPath(new URL(name, output)));
  }
  const docx = await JSZip.loadAsync(await readFile(new URL('teacher.docx', output)));
  const teacher = await docx.file('word/document.xml').async('string');
  assert(teacher.includes(guidance));
  const student = await readFile(new URL('student.csv', output), 'utf8');
  assert(student.includes('Many designs can satisfy the criteria.'));
  assert(!student.includes('TEACHER-ONLY') && !student.includes('do not require the sample pair'));
  await page.getByText('Project', { exact: true }).click();
  const waiting = page.waitForEvent('download');
  await page.getByTestId('workspace-menu-save-project').click();
  await (await waiting).saveAs(fileURLToPath(new URL('saved.coursemapper', output)));
  const saved = JSON.parse(await readFile(new URL('saved.coursemapper', output), 'utf8'));
  const author = JSON.stringify(saved.deliverables.lessonPlans.authoredContent);
  assert(author.includes('criteria-based') && author.includes(guidance));
  const rubric = saved.deliverables.rubrics.data.rubrics[0];
  assert.equal(rubric.criteria[0].exemplary, bundle.rubric[0].bands[0].descriptor);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: fileURLToPath(new URL('student-view.png', output)), fullPage: true });
  await writeFile(
    new URL('result.json', output),
    JSON.stringify(
      {
        passed: true,
        criteriaBasedKindPreserved: true,
        teacherGuidancePreserved: true,
        studentGuidanceExcluded: true,
        originalRubricPreserved: true,
        browserErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log('Criteria-based task import, review, apply, persistence and teacher/student exports passed.');
} catch (error) {
  console.error(error);
  await page.screenshot({ path: fileURLToPath(new URL('failure.png', output)), timeout: 5000 }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
