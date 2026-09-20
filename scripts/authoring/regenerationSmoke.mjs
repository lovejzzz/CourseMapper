import { chromium } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const output = new URL('../../verification-output/external-authoring/', import.meta.url);
const mode = process.env.AUTHORING_TEST_MODE || 'external-agent';
assert(['external-agent', 'site-model'].includes(mode));
const evidenceDir = mode === 'site-model' ? 'regeneration-site-model' : 'regeneration';
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
  await page.getByRole('button', { name: 'Regen', exact: true }).click();
  // The guarded click returns synchronously without starting a generation run.
  await page.getByRole('button', { name: 'Regen', exact: true }).waitFor();
  const after = await save('after');
  assert.deepEqual(content(after), content(before), 'Regeneration changed accepted authored content without preview');
  const receiptCount = await page.getByTestId('agent-receipt-card').count();
  await page.getByRole('button', { name: 'Finish package', exact: true }).click();
  await page.getByTestId('agent-receipt-card').nth(receiptCount).waitFor();
  const finished = await save('after-finalizer');
  assert.deepEqual(content(finished), content(before), 'Package finalizer rewrote authored content');
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
        blockedRegenerationPreservesContent: true,
        finalizerPreservesContent: true,
        modelRequests,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(`${mode}: regeneration and completed package review preserve authored data.`);
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
