// Real isolated Chrome stores + HTTP exchange; identity and server storage are
// fixtures. This tests browser recovery, not Google/Auth0 authorization.
import { chromium } from '@playwright/test';
import { indexedDB } from 'fake-indexeddb';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { setup, completeDraft } from '../../tests/authoring/helpers.js';
import { createExchangeApp } from '../../server/authoring/app.mjs';
import { previewApplication } from '../../src/lib/authoring/application.js';

let vite;
let origin = process.env.AUTHORING_TEST_URL;
if (!origin) {
  vite = await createServer({ server: { host: '127.0.0.1', port: 0 } });
  await vite.listen();
  origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
}
const ctx = await setup(indexedDB);
const { record } = await completeDraft(ctx);
const previous = record.storageVersion++;
record.remoteAllowed = true;
await ctx.store.cas(record.id, previous, record);
let now = Date.now();
const app = createExchangeApp({
  store: ctx.store,
  resource: 'https://exchange.test',
  issuer: 'https://identity.test',
  websiteOrigin: origin,
  verifyToken: async () => {
    throw new Error('OAuth is not part of this browser fault fixture');
  },
  verifyWebsiteToken: async (token) => {
    if (token !== 'browser-fixture') throw new Error('Invalid fixture identity');
    return { uid: 'local' };
  },
  now: () => now,
});
const server = await new Promise((resolve) => {
  const s = app.listen(0, '127.0.0.1', () => resolve(s));
});
const endpoint = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  channel: process.env.AUTHORING_TEST_BROWSER_CHANNEL || 'chrome',
  headless: true,
});
const errors = [];
try {
  const first = await browser.newContext();
  const second = await browser.newContext();
  // New Chrome requires explicit loopback permission for the local HTTP fixture.
  await Promise.all([first, second].map((context) => context.grantPermissions(['local-network-access'], { origin })));
  const pages = await Promise.all([first.newPage(), second.newPage()]);
  for (const page of pages) {
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/authoring-fault-harness', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<title>CourseMapper interrupted recovery test</title>' }),
    );
    await page.goto(`${origin}/authoring-fault-harness`);
  }
  const preview = await previewApplication(record, ctx.draftId, null);
  const args = { uid: 'local', requestId: record.id, draftId: ctx.draftId, preview, current: null, applyEnabled: true };
  async function prepare(page) {
    return page.evaluate(async (args) => {
      const { createIndexedDbStore } = await import('/src/lib/authoring/indexedDbStore.js');
      const { prepareRemoteApplication } = await import('/src/lib/authoring/remoteApplication.js');
      return prepareRemoteApplication({ ...args, store: createIndexedDbStore() });
    }, args);
  }
  const a = await prepare(pages[0]);
  const b = await prepare(pages[1]);
  assert.notEqual(a.id, b.id);
  async function act(page, operation, loseBody = false) {
    return page.evaluate(
      async ({ endpoint, operation, loseBody }) => {
        const { createIndexedDbStore } = await import('/src/lib/authoring/indexedDbStore.js');
        const { confirmRemoteReservation } = await import('/src/lib/authoring/remoteApplication.js');
        const { callAccountApi, readRemoteApplication, recoverRemoteApplication } =
          await import('/src/lib/authoring/remoteRecovery.js');
        const { saveAuthorWorkspaceForResume } = await import('/src/lib/authoring/localWorkspace.js');
        const store = createIndexedDbStore();
        const application = await readRemoteApplication(store, 'local');
        const api = (path, body) =>
          callAccountApi({
            endpoint,
            user: { uid: 'local', getIdToken: async () => 'browser-fixture' },
            getUid: () => 'local',
            path,
            body,
            timeoutMs: loseBody ? 500 : 5000,
            fetch: async (...args) => {
              const response = await fetch(...args);
              if (!loseBody) return response;
              // Consume the actual committed response before simulating a lost body.
              await response.json();
              return { ok: response.ok, json: () => new Promise(() => {}) };
            },
          });
        try {
          if (operation === 'reserve')
            return await confirmRemoteReservation({ store, application, api, getCurrent: () => null });
          if (operation === 'save-edit') {
            const snapshot = structuredClone(application.snapshot);
            snapshot.courseMap.courseName = 'Teacher edit survives interrupted receipt';
            await saveAuthorWorkspaceForResume(snapshot);
            return snapshot;
          }
          if (operation === 'recover')
            return await recoverRemoteApplication({ store, uid: 'local', getCurrent: () => null });
          if (operation === 'receipt')
            return await api('receipt', {
              requestId: application.requestId,
              draftId: application.draftId,
              applicationId: application.id,
              contentHash: application.appliedHash,
            });
          if (operation === 'read') return application;
        } catch (error) {
          return { error: error.code, message: error.message };
        }
      },
      { endpoint, operation, loseBody },
    );
  }
  const lostReservation = await act(pages[0], 'reserve', true);
  assert.equal(lostReservation.error, 'REMOTE_TIMEOUT', JSON.stringify(lostReservation));
  assert.equal((await act(pages[0], 'read')).phase, 'prepared');
  await pages[0].reload();
  now += 24 * 60 * 60 * 1000;
  assert.equal((await act(pages[1], 'reserve')).error, 'APPLICATION_LOCKED');
  const reserved = await act(pages[0], 'reserve');
  assert.equal(reserved.id, a.id);
  assert.equal(reserved.phase, 'locally-saved');
  const edited = await act(pages[0], 'save-edit');
  assert.equal((await act(pages[0], 'receipt', true)).error, 'REMOTE_TIMEOUT');
  const committed = await ctx.store.get(record.id);
  assert.equal(committed.drafts[ctx.draftId].application.applicationId, a.id);
  await pages[0].reload();
  assert.equal((await act(pages[0], 'read')).reportPending, true);
  assert.deepEqual((await act(pages[0], 'recover')).snapshot, edited);
  assert.equal((await act(pages[1], 'reserve')).error, 'APPLICATION_LOCKED');
  await act(pages[0], 'receipt');
  assert.deepEqual(await ctx.store.get(record.id), committed);
  assert.deepEqual(errors, []);
  const result = {
    ok: true,
    cases: [
      'lost reservation response survives reload',
      'second profile blocked after timeout',
      'original reservation resumes idempotently',
      'teacher edits survive lost committed receipt and reload',
      'second profile cannot replace applied course',
      'receipt retry is idempotent',
    ],
    browserProfiles: 2,
    identity: 'synthetic fixture, not live OAuth',
    errors,
  };
  const output = new URL('../../verification-output/external-authoring/interrupted-browser/', import.meta.url);
  await mkdir(output, { recursive: true });
  await writeFile(new URL('result.json', output), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  await vite?.close();
}
