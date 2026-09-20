import { chromium } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const output = new URL('../../verification-output/external-authoring/', import.meta.url);
const mode = process.env.AUTHORING_TEST_MODE || 'external-agent';
assert(['external-agent', 'site-model'].includes(mode));
const evidenceDir = `cascade-${mode}`;
await mkdir(new URL(`${evidenceDir}/`, output), { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ acceptDownloads: true });
page.setDefaultTimeout(20000);
const modelRequests = [],
  errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('request', (r) => {
  if (
    /api\.openai\.com|api\.anthropic\.com|generativelanguage|openrouter|\.gguf(?:\?|$)|\/chat\/completions|\/v1\/responses/.test(
      r.url(),
    )
  )
    modelRequests.push(r.url());
});
async function save(name) {
  await page.getByText('Project', { exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('workspace-menu-save-project').click(),
  ]);
  const path = new URL(`${evidenceDir}/${name}.coursemapper`, output);
  await download.saveAs(fileURLToPath(path));
  await page.getByText('Project', { exact: true }).click();
  return JSON.parse(await readFile(path, 'utf8'));
}
const content = (s) => ({
  courseMap: s.courseMap,
  deliverables: Object.fromEntries(
    Object.entries(s.deliverables).map(([k, v]) => [k, { data: v.data, authoredContent: v.authoredContent }]),
  ),
});
try {
  await page.goto(process.env.AUTHORING_TEST_URL || 'http://127.0.0.1:5189');
  const fixture = JSON.parse(await readFile(new URL('criteria/saved.coursemapper', output), 'utf8'));
  fixture.executionMode = mode;
  await page.locator('#landing-file-input').setInputFiles({
    name: 'criteria.coursemapper',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(fixture)),
  });
  await page.getByRole('heading', { name: 'Open-ended design task', exact: true }).waitFor();
  await page.getByRole('button', { name: /^Assignment Briefs/ }).click();
  const before = await save('before');
  if (mode === 'site-model') {
    await page.getByRole('button', { name: 'AI authoring', exact: true }).click();
    await page.getByRole('button', { name: 'Switch to website generation', exact: true }).click();
    await page.getByRole('region', { name: 'External AI authoring' }).waitFor({ state: 'hidden' });
  }
  await page.getByRole('button', { name: 'Course Map', exact: true }).click();
  const cell = page.locator('td[data-field-key="topicSection"]').first();
  await cell.getByRole('button', { name: 'Click to edit cell', exact: true }).click();
  const editedTopic = 'Teacher changed the topic; preserve existing accepted prose.';
  await page.getByRole('textbox', { name: 'Edit cell content', exact: true }).fill(editedTopic);
  await page.getByRole('textbox', { name: 'Edit cell content', exact: true }).press('Enter');
  await page.getByRole('button', { name: /^Sync all stale/ }).waitFor();
  await page.getByRole('button', { name: /^Assignment Briefs/ }).click();
  await page.getByText(/This deliverable .* out of sync/).waitFor();
  const edited = await save('edited');
  assert.equal(edited.courseMap.lessons[0].sections[0].topicSection, editedTopic);
  assert.deepEqual(content(edited).deliverables, content(before).deliverables);
  assert(edited.deliverables.assignments.stale, 'Edit must leave related materials stale');
  await page.getByRole('button', { name: /^Sync all stale/ }).click();
  const after = await save('after-sync');
  assert.deepEqual(content(after), content(edited), 'Cascade changed accepted content without preview');
  assert(after.deliverables.assignments.stale, 'Blocked sync must preserve stale warning');
  await page.getByText(/This deliverable .* out of sync/).waitFor();
  await page.getByRole('button', { name: 'Sync All', exact: true }).click();
  await page.getByRole('button', { name: 'Sync Partially Failed', exact: true }).waitFor();
  await page.getByText('Authoring review required', { exact: true }).waitFor();
  await page.getByText('Accepted materials kept unchanged', { exact: true }).waitFor();
  const afterCard = await save('after-card-sync');
  assert.deepEqual(content(afterCard), content(edited), 'Sync card changed accepted content');
  assert(afterCard.deliverables.assignments.stale, 'Sync card must not mark blocked work complete');
  assert.deepEqual(modelRequests, []);
  assert.deepEqual(errors, []);
  await page.screenshot({
    path: fileURLToPath(new URL(`${evidenceDir}/result.png`, output)),
    fullPage: true,
  });
  await writeFile(
    new URL(`${evidenceDir}/result.json`, output),
    JSON.stringify(
      {
        passed: true,
        mode,
        blockedCascadePreservesContent: true,
        syncCardDoesNotReportSuccess: true,
        staleWarningPreserved: true,
        modelRequests,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(`${mode}: course-map edit and blocked cascade preserve authored data and stale warnings.`);
} catch (error) {
  console.error(error);
  console.error((await page.locator('body').innerText()).slice(-8000));
  await page
    .screenshot({
      path: fileURLToPath(new URL(`${evidenceDir}/failure.png`, output)),
      timeout: 5000,
    })
    .catch(() => {});
  throw error;
} finally {
  await browser.close();
}
