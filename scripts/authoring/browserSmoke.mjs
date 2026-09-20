import { chromium } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import JSZip from 'jszip';
import assert from 'node:assert/strict';
const baseURL = process.env.AUTHORING_TEST_URL || 'http://127.0.0.1:5188';
const resumeQuota = process.env.AUTHORING_TEST_RESUME_QUOTA === '1';
const output = new URL('../../verification-output/external-authoring/', import.meta.url);
await mkdir(output, { recursive: true });
const fixture = JSON.parse(
  await readFile(new URL('../../tests/authoring/lesson-bundle.fixture.json', import.meta.url), 'utf8'),
);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, acceptDownloads: true });
await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
const errors = [],
  modelRequests = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('request', (r) => {
  if (
    /api\.openai\.com|api\.anthropic\.com|generativelanguage|openrouter|\.gguf(?:\?|$)|\/chat\/completions|\/v1\/responses/.test(
      r.url(),
    )
  )
    modelRequests.push(r.url());
});
try {
  await page.addInitScript((quota) => {
    if (!sessionStorage.getItem('authoring-smoke-seeded') && !localStorage.getItem('coursemapper-project')) {
      localStorage.setItem(
        'coursemapper-project',
        JSON.stringify({ courseMap: { courseName: 'Older saved course', lessons: [] }, hasGenerated: true }),
      );
    }
    sessionStorage.setItem('authoring-smoke-seeded', 'true');
    if (quota) {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === 'coursemapper-project') throw new DOMException('Full', 'QuotaExceededError');
        return original.call(this, key, value);
      };
    }
  }, resumeQuota);
  await page.goto(`${baseURL}/?authoring=1`);
  await page.getByLabel('Course title', { exact: true }).fill('Authoring browser acceptance');
  await page
    .getByLabel('Teaching brief', { exact: true })
    .fill('Explain a new concept, work through an example and assess its use.');
  await page.getByLabel('Minutes per lesson', { exact: true }).fill('45');
  await page.getByRole('button', { name: 'Save request', exact: true }).click();
  await page.getByText('Import AI response', { exact: true }).click();
  const bundle = structuredClone(fixture);
  bundle.lessonId = 'lesson1';
  function clean(value) {
    if (!value || typeof value !== 'object') return;
    if (value.evidenceRefs) value.evidenceRefs = [];
    Object.values(value).forEach(clean);
  }
  clean(bundle);
  const plan = {
    title: 'Authoring browser acceptance',
    description: 'External content roundtrip.',
    lessons: [
      {
        clientId: 'lesson1',
        title: 'Loop-card reasoning',
        objectives: bundle.objectiveIds.map((clientId, i) => ({
          clientId,
          text: i ? 'Apply the new rule.' : 'Explain the new rule.',
        })),
      },
    ],
  };
  await page.getByLabel('Draft JSON', { exact: true }).fill(JSON.stringify({ plan, bundles: [bundle] }));
  await page.getByRole('button', { name: 'Save imported draft', exact: true }).click();
  await page.getByText('AI revision permissions', { exact: true }).click();
  await page.getByRole('checkbox', { name: 'Lesson plans', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Assignments', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Limit AI revision access', exact: true }).click();
  await page.getByText('AI access limited. Enable page access again to use the new scope.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Copy task for AI', exact: true }).click();
  await page
    .getByText('Revision task copied. Keep its response envelope when importing the revised bundles.', { exact: true })
    .waitFor();
  const revisionTask = await page.evaluate(() => navigator.clipboard.readText());
  const envelope = JSON.parse(
    revisionTask.slice(revisionTask.lastIndexOf('Response envelope: ') + 'Response envelope: '.length),
  );
  envelope.bundles[0].rubric[0].bands[0].descriptor += ' Revision import preserved.';
  await page.getByLabel('Draft JSON', { exact: true }).fill(JSON.stringify(envelope));
  await page.getByRole('button', { name: 'Save imported draft', exact: true }).click();
  await page
    .getByText('Revisions saved in the existing draft. Check and preview before applying.', { exact: true })
    .waitFor();
  await page.getByRole('button', { name: 'Check and preview', exact: true }).click();
  await page.getByRole('button', { name: 'Apply reviewed draft', exact: true }).click();
  await page
    .getByText('Applied and saved on this device. Cloud sync is reported separately in the workspace.', { exact: true })
    .waitFor();
  // Reload as soon as application reports success, before its autosave debounce.
  // Resume must select this course, never the older saved project's marker.
  await page.reload();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.getByRole('heading', { name: 'Authoring browser acceptance', exact: true }).waitFor();
  await page.getByText(bundle.examples[0].result.text, { exact: false }).first().waitFor();
  const original = `${bundle.concepts[0].name}\n${bundle.concepts[0].explanation.text}`;
  await page.getByText(original, { exact: true }).click();
  const edit = `${original}\nTeacher edit: preserve this exact explanation.`;
  // Inline material editor is the focused field, distinct from the agent composer.
  await page.locator('textarea:focus, input:focus').fill(edit);
  await page.getByRole('heading', { name: 'Materials & Resources', exact: true }).click();
  await page.getByText('Teacher edit: preserve this exact explanation.', { exact: false }).first().waitFor();
  await page.waitForTimeout(3500); // Exercise the production autosave debounce.
  await page.screenshot({ path: new URL('browser-edited.png', output).pathname, fullPage: true });
  await page.getByText('Project', { exact: true }).click();
  const filePromise = page.waitForEvent('download');
  await page.getByTestId('workspace-menu-save-project').click();
  const file = await filePromise;
  const filePath = new URL('roundtrip.coursemapper', output).pathname;
  await file.saveAs(filePath);
  const saved = JSON.parse(await readFile(filePath, 'utf8'));
  assert(saved.requiredCapabilities.includes('authored-content-v2'));
  assert(
    JSON.stringify(saved.deliverables.rubrics.data).includes('Revision import preserved.'),
    'Scoped revision was lost',
  );
  assert(
    JSON.stringify(saved.deliverables.lessonPlans.authoredContent.teacherOverride).includes(
      'Teacher edit: preserve this exact explanation.',
    ),
  );
  assert(
    JSON.stringify(saved.deliverables.lessonPlans.authoredContent.bundles).includes(bundle.examples[0].result.text),
  );
  await page.getByText('Project', { exact: true }).click();
  const [docx] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-format-docx').click()]);
  const docxPath = new URL('lesson.docx', output).pathname;
  await docx.saveAs(docxPath);
  const archive = await JSZip.loadAsync(await readFile(docxPath));
  const xml = await archive.file('word/document.xml').async('string');
  assert(xml.includes(bundle.examples[0].result.text), 'DOCX lost the worked example result');
  assert(xml.includes('Teacher edit: preserve this exact explanation.'), 'DOCX lost the teacher edit');
  await page.getByRole('button', { name: 'Assignment Briefs', exact: true }).click();
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-format-csv').click()]);
  const csvPath = new URL('student-assignment.csv', output).pathname;
  await csv.saveAs(csvPath);
  const csvText = await readFile(csvPath, 'utf8');
  assert(!csvText.includes(bundle.assessments[0].evaluation.teacherText.text), 'Student assignment leaked answers');
  if (resumeQuota) assert.equal(await page.evaluate(() => localStorage.getItem('coursemapper-project')), null);
  else await page.waitForFunction(() => Boolean(localStorage.getItem('coursemapper-project')), { timeout: 15000 });
  await page.reload();
  const close = page.getByRole('button', { name: 'Close', exact: true });
  await close.waitFor();
  await close.click();
  const restore = page.getByRole('button', { name: /restore|resume/i }).first();
  await restore.click();
  await page.getByRole('heading', { name: 'Authoring browser acceptance', exact: true }).waitFor();
  await page.getByRole('button', { name: /^Lesson Plans/ }).click();
  await page.getByText('Teacher edit: preserve this exact explanation.', { exact: false }).first().waitFor();
  await page.getByRole('link', { name: 'EduTool.dev home', exact: true }).click();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.getByRole('heading', { name: 'Authoring browser acceptance', exact: true }).waitFor();
  await page.getByText('Teacher edit: preserve this exact explanation.', { exact: false }).first().waitFor();
  await page.goto(baseURL);
  await page.locator('#landing-file-input').setInputFiles(filePath);
  await page.getByRole('heading', { name: 'Authoring browser acceptance', exact: true }).waitFor();
  await page.getByRole('button', { name: /^Lesson Plans/ }).click();
  await page.getByText('Teacher edit: preserve this exact explanation.', { exact: false }).first().waitFor();
  await page.getByRole('button', { name: 'AI authoring', exact: true }).click();
  await page.getByLabel('Saved requests', { exact: true }).selectOption({ label: 'Authoring browser acceptance' });
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete local request and drafts', exact: true }).click();
  await page
    .getByText('Local request and drafts deleted. Applied courses remain available.', { exact: true })
    .waitFor();
  assert.equal(await page.getByLabel('Saved requests', { exact: true }).locator('option').count(), 1);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByText('Teacher edit: preserve this exact explanation.', { exact: false }).first().waitFor();
  assert.equal(modelRequests.length, 0, 'External authoring made a model or weights request');
  assert.deepEqual(errors, [], 'Browser errors');
  await writeFile(
    new URL('browser-result.json', output),
    JSON.stringify(
      {
        ok: true,
        nativeUI: true,
        importedFixture: true,
        teacherSetRevisionScope: true,
        applied: true,
        teacherEditPreserved: true,
        localReopen: true,
        projectFile: true,
        projectFileReopened: true,
        deletedRequestPreservesAppliedCourse: true,
        docxContainsExample: true,
        studentCsvExcludesAnswer: true,
        modelRequests,
        browserErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log('Browser authoring, edit, local reopen, project file, DOCX and student CSV passed; zero model requests.');
} catch (e) {
  await page.screenshot({ path: new URL('browser-failure.png', output).pathname, fullPage: true });
  await writeFile(
    new URL('browser-failure.json', output),
    JSON.stringify({ error: e.message, errors, modelRequests }, null, 2),
  );
  throw e;
} finally {
  await browser.close();
}
