// Run browserSmoke.mjs first to create the authored project fixture. Requires pdftotext.
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const output = new URL('../../verification-output/external-authoring/', import.meta.url);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ acceptDownloads: true });
page.setDefaultTimeout(20000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.goto(process.env.AUTHORING_TEST_URL || 'http://127.0.0.1:5188');
  const project = JSON.parse(await readFile(new URL('roundtrip.coursemapper', output), 'utf8'));
  const math = 'Math notation: x² + y² = z²; α ≤ β; ∑ x.';
  project.deliverables.lessonPlans.data.plans[0].materials.push(math);
  project.deliverables.lessonPlans.authoredContent.teacherOverride = structuredClone(
    project.deliverables.lessonPlans.data,
  );
  project.deliverables.assignments.data.assignments[0].instructions.push(math);
  project.deliverables.assignments.authoredContent.teacherOverride = structuredClone(
    project.deliverables.assignments.data,
  );
  await page.locator('#landing-file-input').setInputFiles({
    name: 'pdf-check.coursemapper',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await page.getByRole('heading', { name: 'Authoring browser acceptance', exact: true }).waitFor();
  await mkdir(new URL('pdf/', output), { recursive: true });
  const texts = {};
  for (const [tab, file] of [
    ['Course Map', 'courseMap'],
    ['Lesson Plans', 'lesson'],
    ['Assignment Briefs', 'assignment'],
    ['Rubrics', 'rubric'],
  ]) {
    await page.getByRole('button', { name: new RegExp(`^${tab}`) }).click();
    const [downloaded] = await Promise.all([
      page.waitForEvent('download', { timeout: 60000 }),
      page.getByTestId('export-format-pdf').click(),
    ]);
    const path = fileURLToPath(new URL(`pdf/${file}.pdf`, output));
    await downloaded.saveAs(path);
    texts[file] = execFileSync('pdftotext', ['-layout', path, '-'], { encoding: 'utf8' });
    assert(texts[file].includes('Authoring browser acceptance'), `${tab} lost the course title`);
    await writeFile(new URL(`pdf/${file}.txt`, output), texts[file]);
  }
  const fixture = JSON.parse(
    await readFile(new URL('../../tests/authoring/lesson-bundle.fixture.json', import.meta.url), 'utf8'),
  );
  assert(texts.courseMap.includes('BAB') && texts.courseMap.includes('ABB'));
  assert(texts.courseMap.replace(/\s/g, '').includes('分别判断'), 'Course-map Chinese text was lost');
  assert(texts.lesson.includes('Teacher edit: preserve this exact explanation.'));
  assert(texts.lesson.includes('回环卡'));
  assert(texts.lesson.includes(math), 'Math notation was lost');
  assert(texts.lesson.includes('ABA 是回环卡，因为第一和第三个字符相同。'));
  assert(texts.assignment.includes('BAB') && texts.assignment.includes('ABB'));
  assert(
    !texts.assignment
      .replace(/\s/g, '')
      .includes(fixture.assessments[0].evaluation.teacherText.text.replace(/\s/g, '')),
    'Student assignment leaked answers',
  );
  assert(texts.rubric.includes('字符'));
  const compact = (text) => text.replace(/\s/g, '');
  assert(
    compact(texts.assignment).includes(compact(fixture.materials.assignmentBrief.map((block) => block.text).join(''))),
    'Assignment brief was rewritten',
  );
  for (const criterion of fixture.rubric) {
    assert(
      new RegExp(`${criterion.name}\\s+${criterion.weightPercent}%`).test(texts.rubric),
      'Rubric criterion weight was rewritten',
    );
  }
  assert(!texts.rubric.includes('Use of course concepts and evidence'), 'A rubric criterion was invented');
  const exportTexts = {};
  for (const [tab, extension, name] of [
    ['Lesson Plans', 'docx', 'teacher-lesson'],
    ['Assignment Briefs', 'docx', 'student-assignment'],
    ['Assignment Briefs', 'csv', 'student-assignment'],
  ]) {
    await page.getByRole('button', { name: new RegExp(`^${tab}`) }).click();
    const [downloaded] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId(`export-format-${extension}`).click(),
    ]);
    const path = fileURLToPath(new URL(`pdf/${name}.${extension}`, output));
    await downloaded.saveAs(path);
    const text =
      extension === 'docx'
        ? execFileSync('unzip', ['-p', path, 'word/document.xml'], { encoding: 'utf8' }).replace(/<[^>]+>/g, '')
        : await readFile(path, 'utf8');
    assert(text.includes(math), `${name}.${extension} lost math notation`);
    if (name === 'teacher-lesson') {
      assert(text.includes('回环卡'));
      assert(text.includes('ABA 是回环卡，因为第一和第三个字符相同。'));
    } else {
      assert(text.includes('分别判断 BAB 和 ABB'));
      assert(
        !compact(text).includes(compact(fixture.assessments[0].evaluation.teacherText.text)),
        `${extension} leaked teacher answers`,
      );
    }
    exportTexts[`${name}.${extension}`] = true;
  }
  assert(texts.assignment.includes(math), 'Student PDF lost math notation');
  assert.deepEqual(errors, []);
  await writeFile(
    new URL('pdf/result.json', output),
    JSON.stringify(
      { passed: true, files: Object.keys(texts), crossFormatExports: exportTexts, browserErrors: errors },
      null,
      2,
    ),
  );
  console.log('Course map, lesson, assignment and rubric PDF downloads and text preservation passed.');
} catch (error) {
  console.error(error);
  await page
    .screenshot({ path: fileURLToPath(new URL('pdf/failure.png', output)), fullPage: true, timeout: 5000 })
    .catch(() => {});
  throw error;
} finally {
  await browser.close();
}
