import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
let vite;
let origin = process.env.AUTHORING_TEST_URL;
if (!origin) {
  vite = await createServer({ server: { host: '127.0.0.1', port: 0 } });
  await vite.listen();
  origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
}
const browser = await chromium.launch({
  channel: process.env.AUTHORING_TEST_BROWSER_CHANNEL || 'chrome',
  headless: true,
});
try {
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${origin}/?authoring=1`);
  await page.getByLabel('Course title', { exact: true }).fill('Explicit request options acceptance');
  await page.getByLabel('Teaching brief', { exact: true }).fill('Compare two explanations of a new idea.');
  await page.getByLabel('Learner profile', { exact: true }).fill('Adult beginners with no prior statistics experience');
  await page.getByLabel('Language', { exact: true }).fill('Español');
  const choices = page.getByRole('group', { name: 'Materials to create', exact: true });
  for (const name of ['Lesson plans', 'Assignment briefs', 'Rubrics'])
    await choices.getByRole('checkbox', { name, exact: true }).uncheck();
  assert.equal(await page.getByRole('button', { name: 'Save request', exact: true }).isEnabled(), false);
  await choices.getByRole('checkbox', { name: 'Assignment briefs', exact: true }).check();
  await page.getByRole('button', { name: 'Save request', exact: true }).click();
  await page
    .getByText('Request saved on this device. Allow page access or copy the task to your AI conversation.', {
      exact: true,
    })
    .waitFor();
  async function copy() {
    await page.getByRole('button', { name: 'Copy task for AI', exact: true }).click();
    await page.getByText('Task copied. Paste it into your AI conversation.', { exact: true }).waitFor();
    return page.evaluate(() => navigator.clipboard.readText());
  }
  const task = await copy();
  assert(task.includes('Learners: Adult beginners with no prior statistics experience'));
  assert(task.includes('Language: Español'));
  assert(task.includes('Materials: Assignment briefs\n'));
  assert(task.includes('Uncertainties: None reported'));
  const request = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('coursemapper-authoring-v2');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const database = open.result;
          const tx = database.transaction('records', 'readonly');
          const all = tx.objectStore('records').getAll();
          tx.oncomplete = () => {
            database.close();
            resolve(all.result.find((r) => r.request?.title === 'Explicit request options acceptance')?.request);
          };
          tx.onabort = () => reject(tx.error);
        };
      }),
  );
  assert.equal(request.learnerProfile, 'Adult beginners with no prior statistics experience');
  assert.equal(request.language, 'Español');
  assert.deepEqual(request.requestedFeatures, ['assignments']);
  assert.deepEqual(request.uncertainties, []);
  await page.reload();
  await page
    .getByRole('combobox', { name: 'Saved requests', exact: true })
    .selectOption({ label: 'Explicit request options acceptance' });
  assert.equal(await copy(), task);
  await page.getByRole('combobox', { name: 'Saved requests', exact: true }).selectOption({ label: 'New request' });
  await page.getByLabel('Course title', { exact: true }).fill('Brief-only request acceptance');
  await page
    .getByLabel('Teaching brief', { exact: true })
    .fill('Define the learner and language with the teacher before drafting.');
  await page.getByRole('button', { name: 'Save request', exact: true }).click();
  await page
    .getByText('Request saved on this device. Allow page access or copy the task to your AI conversation.', {
      exact: true,
    })
    .waitFor();
  const fallback = await copy();
  assert(fallback.includes('Learners: As described in the brief'));
  assert(fallback.includes('Language: As requested in the brief'));
  assert(fallback.includes('Learner profile was not entered separately'));
  assert(fallback.includes('Language was not entered separately'));
  assert.deepEqual(errors, []);
  const result = {
    ok: true,
    explicitLearnersLanguageMaterials: true,
    noMaterialsRejected: true,
    persistedAfterReload: true,
    copiedTaskExact: true,
    missingDetailsDisclosed: true,
    browserErrors: errors,
  };
  const output = new URL('../../verification-output/external-authoring/request-options/', import.meta.url);
  await mkdir(output, { recursive: true });
  await writeFile(new URL('result.json', output), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
  await vite?.close();
}
