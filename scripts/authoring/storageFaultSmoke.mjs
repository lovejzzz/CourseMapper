import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const output = new URL('../../verification-output/external-authoring/storage-faults/', import.meta.url);
await mkdir(output, { recursive: true });
const bundle = JSON.parse(
  await readFile(new URL('../../tests/authoring/lesson-bundle.fixture.json', import.meta.url), 'utf8'),
);
bundle.lessonId = 'lesson1';
function clean(value) {
  if (!value || typeof value !== 'object') return;
  if (value.evidenceRefs) value.evidenceRefs = [];
  Object.values(value).forEach(clean);
}
clean(bundle);
const plan = {
  title: 'Storage failure acceptance',
  description: 'Atomic application test',
  lessons: [
    {
      clientId: 'lesson1',
      title: 'Loop cards',
      objectives: bundle.objectiveIds.map((clientId, index) => ({
        clientId,
        text: index ? 'Apply the rule.' : 'Explain the rule.',
      })),
    },
  ],
};
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
page.setDefaultTimeout(20000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
async function records() {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('coursemapper-authoring-v2', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('records', 'readonly');
          const all = tx.objectStore('records').getAll();
          all.onerror = () => reject(all.error);
          tx.oncomplete = () => {
            db.close();
            resolve(all.result);
          };
        };
      }),
  );
}
try {
  await page.goto(`${process.env.AUTHORING_TEST_URL || 'http://127.0.0.1:5188'}/?authoring=1`);
  await page.getByLabel('Course title', { exact: true }).fill(plan.title);
  await page.getByLabel('Teaching brief', { exact: true }).fill('Teach the loop-card rule and assess its application.');
  await page.getByLabel('Minutes per lesson', { exact: true }).fill('45');
  await page.getByRole('button', { name: 'Save request', exact: true }).click();
  await page.getByText('Import AI response', { exact: true }).click();
  await page.getByLabel('Draft JSON', { exact: true }).fill(JSON.stringify({ plan, bundles: [bundle] }));
  await page.getByRole('button', { name: 'Save imported draft', exact: true }).click();
  await page.getByRole('button', { name: 'Check and preview', exact: true }).click();
  await page.getByRole('button', { name: 'Apply reviewed draft', exact: true }).waitFor();
  const before = await records();
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    window.storageFault = { mode: '', hits: 0 };
    IDBObjectStore.prototype.put = function (value, key) {
      if (
        this.transaction.db.name === 'coursemapper-authoring-v2' &&
        String(key).startsWith('application:') &&
        window.storageFault.mode
      ) {
        const mode = window.storageFault.mode;
        window.storageFault.mode = '';
        window.storageFault.hits++;
        if (mode === 'quota') throw new DOMException('Injected storage quota exhausted', 'QuotaExceededError');
        const request = original.call(this, value, key);
        const tx = this.transaction;
        queueMicrotask(() => tx.abort());
        return request;
      }
      return original.call(this, value, key);
    };
  });
  for (const mode of ['quota', 'abort']) {
    await page.evaluate((mode) => {
      window.storageFault.mode = mode;
    }, mode);
    await page.getByRole('button', { name: 'Apply reviewed draft', exact: true }).click();
    await page.getByText(mode === 'quota' ? /Injected storage quota exhausted/ : /aborted/i).waitFor();
    assert.deepEqual(await records(), before, `${mode} left a partial request or application record`);
    assert.equal(
      await page.getByRole('heading', { name: plan.title, exact: true }).count(),
      0,
      `${mode} changed the visible course`,
    );
    assert.equal(await page.getByText('Applied and saved on this device.', { exact: false }).count(), 0);
    await page.screenshot({ path: fileURLToPath(new URL(`${mode}.png`, output)), fullPage: true });
  }
  assert.equal(await page.evaluate(() => window.storageFault.hits), 2);
  await page.evaluate(() => {
    const descriptor = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, 'oncomplete');
    Object.defineProperty(IDBTransaction.prototype, 'oncomplete', {
      configurable: true,
      get: descriptor.get,
      set(handler) {
        descriptor.set.call(this, function (event) {
          if (this.applicationCommitFault) {
            window.committedBeforeUi = true;
            return;
          }
          handler?.call(this, event);
        });
      },
    });
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (this.transaction.db.name === 'coursemapper-authoring-v2' && key === 'latestApplication')
        this.transaction.applicationCommitFault = true;
      return put.call(this, value, key);
    };
  });
  await page.getByRole('button', { name: 'Apply reviewed draft', exact: true }).click();
  console.log('Committed retry requested');
  await page.waitForFunction(() => window.committedBeforeUi === true, null, { timeout: 20000 });
  console.log('Commit confirmed before UI');
  assert.equal(await page.getByRole('heading', { name: plan.title, exact: true }).count(), 0);
  console.log('Reloading');
  await page.reload({ timeout: 20000 });
  console.log('Reloaded');
  await page.getByRole('button', { name: 'Recover saved application', exact: true }).click();
  await page.getByRole('heading', { name: plan.title, exact: true }).waitFor();
  console.log('Recovered UI');
  const after = await records();
  console.log('Read durable records');
  const request = after.find((record) => record.request);
  assert.equal(Object.values(request.drafts)[0].state, 'applied');
  assert(after.some((record) => record.snapshot?.courseMap?.courseName === plan.title));
  await page.getByRole('button', { name: 'Undo application', exact: true }).click();
  await page.getByText('Application undone.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: plan.title, exact: true }).count(), 0);
  const unavailable = await browser.newPage();
  unavailable.setDefaultTimeout(20000);
  unavailable.on('pageerror', (error) => errors.push(error.message));
  await unavailable.addInitScript(() => {
    const open = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (name, ...args) {
      if (name === 'coursemapper-authoring-v2')
        throw new DOMException('Storage is unavailable in this browsing mode.', 'SecurityError');
      return open.call(this, name, ...args);
    };
  });
  await unavailable.goto(`${process.env.AUTHORING_TEST_URL || 'http://127.0.0.1:5188'}/?authoring=1`);
  await unavailable.getByLabel('Course title', { exact: true }).fill('Storage access denied');
  await unavailable.getByLabel('Teaching brief', { exact: true }).fill('This request must not be reported saved.');
  await unavailable.getByRole('button', { name: 'Save request', exact: true }).click();
  await unavailable.getByText('Storage is unavailable in this browsing mode.', { exact: true }).waitFor();
  assert.equal(await unavailable.getByRole('button', { name: 'Apply reviewed draft', exact: true }).count(), 0);
  assert.equal(await unavailable.getByText('Request saved on this device.', { exact: false }).count(), 0);
  await unavailable.screenshot({ path: fileURLToPath(new URL('unavailable.png', output)), fullPage: true });
  assert.deepEqual(errors, []);
  await writeFile(
    new URL('result.json', output),
    JSON.stringify(
      {
        passed: true,
        injectedFaults: ['quota-after-request-write', 'abort-before-commit'],
        atomicRollbackVerified: true,
        noPrematureUiApply: true,
        successfulRetryVerified: true,
        durableCommitBeforeUiRecoveryVerified: true,
        undoAfterRecoveryVerified: true,
        storageAccessDeniedVerified: true,
        browserErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log(
    'Browser quota and transaction-abort injection passed: no partial records or premature UI apply; retry succeeds.',
  );
} catch (error) {
  console.error(error.message);
  await page
    .screenshot({ path: fileURLToPath(new URL('failure.png', output)), fullPage: true, timeout: 5000 })
    .catch(() => {});
  throw error;
} finally {
  await browser.close();
}
