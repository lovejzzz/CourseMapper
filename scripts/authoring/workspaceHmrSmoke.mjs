// Real browser/Vite lifecycle test with an instrumented registration host.
// This is not evidence of discovery by an external AI platform.
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const vite = await createServer({ server: { host: '127.0.0.1', port: 0 } });
await vite.listen();
const browser = await chromium.launch({
  channel: process.env.AUTHORING_TEST_BROWSER_CHANNEL || 'chrome',
  headless: true,
});
const output = new URL('../../verification-output/external-authoring/workspace-hmr/', import.meta.url);
await mkdir(output, { recursive: true });
const page = await browser.newPage();
page.setDefaultTimeout(45000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('dialog', (dialog) => dialog.accept());
try {
  await page.addInitScript(() => {
    window.testTools = new Map();
    window.retainedTools = {};
    window.duplicateRegistrations = [];
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      value: {
        registerTool(tool) {
          if (window.testTools.has(tool.name)) window.duplicateRegistrations.push(tool.name);
          window.testTools.set(tool.name, tool);
        },
        unregisterTool(name) {
          window.testTools.delete(name);
        },
      },
    });
  });
  await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/?authoring=1`);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  async function openProject(name) {
    const project = {
      formatVersion: 1,
      projectId: `test-project-${name}`,
      hasGenerated: true,
      courseMap: {
        courseName: `Workspace ${name}`,
        lessons: [
          {
            id: `lesson-${name}`,
            title: `Lesson ${name}`,
            sections: [{ topicSection: `Unique topic ${name}`, learningGoals: `Explain ${name}.` }],
          },
        ],
      },
      columns: [],
      userEdits: [],
      chatHistory: [],
      fileNames: [],
      versionHistory: [],
      selectedFeatures: ['courseMap'],
      deliverableConfig: {},
      lessonScope: { type: 'all' },
      promptText: `Independent project ${name}`,
      activeTab: 'courseMap',
      deliverables: {},
    };
    await page
      .locator('#landing-file-input')
      .setInputFiles({
        name: `${name}.coursemapper`,
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(project)),
      });
    await page.getByRole('heading', { name: `Workspace ${name}`, exact: true }).waitFor();
    await page.getByText('Autosaved locally', { exact: true }).filter({ visible: true }).waitFor();
    await page.getByRole('button', { name: 'AI authoring', exact: true }).click();
    await page.getByRole('combobox', { name: 'Saved requests', exact: true }).selectOption({ label: 'New request' });
    await page.getByLabel('Course title', { exact: true }).fill(`Request ${name}`);
    await page
      .getByRole('textbox', { name: 'Teaching brief', exact: true })
      .fill(`Draft materials for independent workspace ${name}.`);
    console.log('Saving request', name);
    await page.getByRole('button', { name: 'Save request', exact: true }).click();
    await page
      .getByRole('combobox', { name: 'Saved requests', exact: true })
      .locator('option:checked')
      .filter({ hasText: `Request ${name}` })
      .waitFor({ state: 'attached' });
    await page
      .getByText('Request saved on this device. Allow page access or copy the task to your AI conversation.', {
        exact: true,
      })
      .waitFor();
    await page.getByRole('checkbox', { name: 'Allow page tools to access this request', exact: true }).check();
    return page.evaluate(async (name) => {
      const capabilities = await window.testTools.get('cm_v2_get_capabilities').execute({});
      const requestId = document.querySelector('select[aria-label="Saved requests"]')?.value;
      const epoch = capabilities.data.documentEpoch;
      const context = await window.testTools.get('cm_v2_get_context').execute({ requestId, documentEpoch: epoch });
      window.retainedTools[name] = window.testTools.get('cm_v2_create_draft').execute;
      return { requestId, epoch, context };
    }, name);
  }
  const a = await openProject('A');
  assert(a.context.ok, JSON.stringify(a.context));
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByText('Project', { exact: true }).click();
  await page.getByTestId('workspace-menu-new-project').click();
  await page.locator('#landing-file-input').waitFor({ state: 'attached' });
  const b = await openProject('B');
  assert(b.context.ok, JSON.stringify(b.context));
  assert.notEqual(a.requestId, b.requestId);
  async function stale(name, request, epoch = request.epoch) {
    return page.evaluate(
      async ({ name, request, epoch }) =>
        window.retainedTools[name]({
          requestId: request.requestId,
          documentEpoch: epoch,
          expectedRequestRevision: 0,
          baseContentRevision: request.context.data.baseContentRevision,
          idempotencyKey: `stale-${name}-${epoch}`,
        }),
      { name, request, epoch },
    );
  }
  assert.equal((await stale('A', a)).error.code, 'PAGE_ACCESS_REQUIRED');
  const module = await vite.moduleGraph.getModuleByUrl('/src/components/authoring/AuthoringPanel.jsx');
  assert(module, 'AuthoringPanel must have been loaded by the real Vite page.');
  await vite.reloadModule(module);
  const grant = page.getByRole('checkbox', { name: 'Allow page tools to access this request', exact: true });
  await expect(grant).not.toBeChecked({ timeout: 20000 });
  await page.waitForFunction(() => window.testTools.size === 13);
  assert.equal((await stale('B', b)).error.code, 'PAGE_ACCESS_REQUIRED');
  await grant.check();
  const current = await page.evaluate(async (requestId) => {
    const caps = await window.testTools.get('cm_v2_get_capabilities').execute({});
    const epoch = caps.data.documentEpoch;
    return {
      epoch,
      context: await window.testTools.get('cm_v2_get_context').execute({ requestId, documentEpoch: epoch }),
      names: [...window.testTools.keys()],
      duplicates: window.duplicateRegistrations,
    };
  }, b.requestId);
  assert.notEqual(current.epoch, b.epoch);
  assert(current.context.ok);
  const crossRequest = await page.evaluate(
    async ({ request, epoch }) =>
      window.testTools
        .get('cm_v2_create_draft')
        .execute({
          requestId: request.requestId,
          documentEpoch: epoch,
          expectedRequestRevision: 0,
          baseContentRevision: request.context.data.baseContentRevision,
          idempotencyKey: 'cross-workspace-current-tool',
        }),
    { request: a, epoch: current.epoch },
  );
  assert.equal(crossRequest.error.code, 'NOT_FOUND');
  assert.equal(new Set(current.names).size, 13);
  assert.deepEqual(current.duplicates, []);
  const records = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('coursemapper-authoring-v2');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('records', 'readonly');
          const all = tx.objectStore('records').getAll();
          tx.oncomplete = () => {
            db.close();
            resolve(
              all.result.map((r) => ({
                title: r.request.title,
                revision: r.revision,
                drafts: Object.keys(r.drafts).length,
                baseTitle: r.base?.courseMap?.courseName,
              })),
            );
          };
          tx.onabort = () => reject(tx.error);
        };
      }),
  );
  assert.equal(records.length, 2);
  assert.deepEqual(records.map((r) => r.baseTitle).sort(), ['Workspace A', 'Workspace B']);
  assert(records.every((r) => r.revision === 0 && r.drafts === 0));
  await page.getByRole('heading', { name: 'Workspace B', exact: true }).waitFor();
  assert.deepEqual(errors, []);
  await writeFile(
    new URL('result.json', output),
    JSON.stringify(
      {
        ok: true,
        host: 'instrumented registration host; not external AI platform',
        realViteHmr: true,
        independentWorkspaceSnapshots: records,
        staleCallbacksRejected: true,
        currentToolCrossRequestDenied: true,
        uniqueTools: current.names.length,
        browserErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log('Two independent workspace snapshots survive stale callbacks and real Vite hot reload.');
} catch (error) {
  console.error(error);
  await page.screenshot({ path: new URL('failure.png', output).pathname, fullPage: true }).catch(() => {});
  console.error((await page.locator('body').innerText()).slice(-5000));
  throw error;
} finally {
  await browser.close();
  await vite.close();
}
