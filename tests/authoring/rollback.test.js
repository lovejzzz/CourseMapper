import { readAuthoringFlags } from '../../src/lib/authoring/featureFlags.js';
import { applyLocalDraft } from '../../src/lib/authoring/application.js';
import { prepareRemoteApplication } from '../../src/lib/authoring/remoteApplication.js';
import { it, expect } from 'vitest';
import { indexedDB } from 'fake-indexeddb';
import { setup, completeDraft, LOCAL_PRINCIPAL, request } from './helpers.js';
import { createAuthoringService } from '../../src/lib/authoringCore/service.js';
import { createExchangeApp } from '../../server/authoring/app.mjs';
import { hash } from '../../src/lib/authoringCore/core.js';
it('stops new tool writes while preserving saved draft reads and diagnostics', async () => {
  const ctx = await setup(indexedDB);
  const { record } = await completeDraft(ctx);
  const service = createAuthoringService({ store: ctx.store, writesEnabled: false });
  const call = (op, args = {}) => service.execute(`cm_v2_${op}`, args, LOCAL_PRINCIPAL);
  expect((await call('get_capabilities')).data.writesEnabled).toBe(false);
  expect((await call('get_context', { requestId: record.id })).ok).toBe(true);
  expect((await call('get_draft_status', { requestId: record.id, draftId: ctx.draftId })).ok).toBe(true);
  expect((await call('submit_course_plan', ctx.planArgs)).error.code).toBe('WRITES_DISABLED');
  expect((await call('create_request', { request, idempotencyKey: 'frozen-new' })).error.code).toBe('WRITES_DISABLED');
  expect(await ctx.store.get(record.id)).toEqual(record);
});
it('disables fresh website changes/applications but permits matching reservation recovery, receipt and revocation', async () => {
  const ctx = await setup(indexedDB);
  const { record } = await completeDraft(ctx);
  const body = {
    requestId: record.id,
    draftId: ctx.draftId,
    draftRevision: record.drafts[ctx.draftId].revision,
    projectId: 'project',
    applicationId: 'saved-application',
    currentHash: await hash(null),
  };
  const app = createExchangeApp({
    store: ctx.store,
    resource: 'https://exchange.test',
    issuer: 'https://identity.test',
    websiteOrigin: 'https://website.test',
    verifyToken: async () => LOCAL_PRINCIPAL,
    verifyWebsiteToken: async () => ({ uid: 'local' }),
    remoteWritesEnabled: false,
    applyEnabled: false,
  });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const post = async (route, data = body) =>
    (
      await fetch(`http://127.0.0.1:${server.address().port}/api/authoring/${route}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://website.test', Authorization: 'Bearer owner' },
        body: JSON.stringify(data),
      })
    ).json();
  try {
    for (const route of ['share', 'sources', 'requirements', 'grant'])
      expect((await post(route)).error.code).toBe('WRITES_DISABLED');
    expect((await post('read')).ok).toBe(true);
    expect((await post('reserve')).error.code).toBe('APPLY_DISABLED');
    expect(await ctx.store.get(record.id)).toEqual(record);
    // Model an application reserved before the disable switch was deployed.
    const reserved = structuredClone(record);
    reserved.storageVersion++;
    reserved.drafts[ctx.draftId].reservation = { ...body, state: 'reserved', expiresAt: Date.now() + 300000 };
    await ctx.store.cas(record.id, record.storageVersion, reserved);
    expect((await post('reserve')).ok).toBe(true);
    expect((await post('receipt', { ...body, contentHash: await hash('saved content') })).ok).toBe(true);
    expect((await post('revoke')).ok).toBe(true);
    expect((await post('read')).data.drafts[ctx.draftId].application.applicationId).toBe(body.applicationId);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

it('separates browser controls and fails closed for invalid values', () => {
  expect(readAuthoringFlags()).toEqual({ pageTools: true, localWrites: true, apply: true });
  expect(readAuthoringFlags({ VITE_AUTHORING_PAGE_TOOLS_ENABLED: 'false' })).toEqual({
    pageTools: false,
    localWrites: true,
    apply: true,
  });
  expect(
    readAuthoringFlags({ VITE_AUTHORING_LOCAL_WRITES_ENABLED: 'invalid', VITE_AUTHORING_APPLY_ENABLED: 'false' }),
  ).toEqual({ pageTools: true, localWrites: false, apply: false });
});
it('rejects fresh local and remote application preparation before any storage side effect', async () => {
  await expect(applyLocalDraft({ applyEnabled: false })).rejects.toThrow('temporarily disabled');
  await expect(prepareRemoteApplication({ applyEnabled: false })).rejects.toThrow('temporarily disabled');
});
