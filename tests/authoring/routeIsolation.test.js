import { describe, it, expect } from 'vitest';
import { indexedDB } from 'fake-indexeddb';
import { createExchangeApp } from '../../server/authoring/app.mjs';
import { setup, completeDraft, LOCAL_PRINCIPAL, request } from './helpers.js';
import { hash } from '../../src/lib/authoringCore/core.js';

const origin = 'https://website.test';
async function harness(run) {
  const ctx = await setup(indexedDB);
  const { record, bundle, lesson } = await completeDraft(ctx);
  const previous = record.storageVersion;
  record.remoteAllowed = true;
  record.request.title = 'Private owner course sentinel';
  record.storageVersion++;
  await ctx.store.cas(record.id, previous, record);
  const app = createExchangeApp({
    store: ctx.store,
    resource: 'https://exchange.test',
    issuer: 'https://identity.test',
    websiteOrigin: origin,
    verifyToken: async (token) => {
      if (!['remote-owner', 'remote-other', 'remote-limited'].includes(token)) throw new Error('invalid');
      return {
        ...LOCAL_PRINCIPAL,
        uid: token === 'remote-other' ? 'other' : 'local',
        scopes: token === 'remote-limited' ? [] : LOCAL_PRINCIPAL.scopes,
      };
    },
    verifyWebsiteToken: async (token) => {
      if (!['website-owner', 'website-other'].includes(token)) throw new Error('invalid');
      return { uid: token === 'website-owner' ? 'local' : 'other' };
    },
  });
  const server = await new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (
    path,
    body,
    authorization = 'Bearer website-other',
    sourceOrigin = origin,
    accept = 'application/json, text/event-stream',
  ) => {
    const response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: accept,
        ...(authorization ? { Authorization: authorization } : {}),
        ...(sourceOrigin ? { Origin: sourceOrigin } : {}),
      },
      body: JSON.stringify(body),
    });
    return { status: response.status, headers: response.headers, body: await response.json() };
  };
  const mcp = async (name, args, token = 'remote-other') =>
    (
      await post(
        '/mcp',
        { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: `cm_v2_${name}`, arguments: args } },
        `Bearer ${token}`,
        null,
      )
    ).body.result;
  try {
    await run({ ctx, record, bundle, lesson, post, mcp });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

describe('two-account HTTP route isolation', () => {
  it('serves JSON discovery clients without SSE while preserving authentication and media-type rejection', async () =>
    harness(async ({ post, record }) => {
      const initialize = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'json-client', version: '1' },
        },
      };
      for (const accept of ['application/json', '*/*', 'application/json, text/event-stream']) {
        const result = await post('/mcp', initialize, null, null, accept);
        expect(result.status).toBe(200);
        expect(result.headers.get('content-type')).toContain('application/json');
        expect(result.body.result.serverInfo.name).toBe('coursemapper-authoring');
        const listed = await post('/mcp', { jsonrpc: '2.0', id: 2, method: 'tools/list' }, null, null, accept);
        expect(listed.body.result.tools).toHaveLength(14);
        const privateRead = {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'cm_v2_get_context',
            arguments: { requestId: record.id },
          },
        };
        const denied = await post('/mcp', privateRead, null, null, accept);
        expect(denied.body.result.structuredContent.error.code).toBe('UNAUTHENTICATED');
        expect(JSON.stringify(denied.body)).not.toContain('Private owner course sentinel');
        expect((await post('/mcp', privateRead, 'Bearer invalid', null, accept)).status).toBe(401);
      }
      for (const accept of [
        'text/html',
        'text/event-stream',
        'application/json;q=0, text/html',
        'application/json;q=0, text/event-stream',
      ]) {
        expect((await post('/mcp', initialize, null, null, accept)).status).toBe(406);
      }
    }));

  it('denies cross-owner reads and every website mutation without changing the victim record', async () =>
    harness(async ({ ctx, record, post }) => {
      const body = {
        requestId: record.id,
        draftId: ctx.draftId,
        expectedStorageVersion: record.storageVersion,
        selection: null,
        applicationId: 'intruder-application',
        projectId: 'intruder-project',
        draftRevision: 4,
        currentHash: await hash(null),
        contentHash: await hash('intruder'),
      };
      for (const route of [
        'read',
        'requirements',
        'sources',
        'grant',
        'delete',
        'revoke',
        'cancel-intent',
        'reserve',
        'receipt',
      ]) {
        const result = await post(`/api/authoring/${route}`, body);
        expect(result.body.error?.code, route).toBe('NOT_FOUND');
        expect(JSON.stringify(result.body), route).not.toContain('Private owner course sentinel');
        expect(await ctx.store.get(record.id), route).toEqual(record);
      }
      for (const route of ['list', 'manage']) {
        const result = await post(`/api/authoring/${route}`, {});
        expect(result.body.data.requests, route).toEqual([]);
      }
      const shared = await post('/api/authoring/share', {
        request,
        idempotencyKey: 'other-account-share',
        owner: 'local',
        uid: 'local',
      });
      expect(shared.body.ok).toBe(true);
      const ownId = shared.body.data.requestId;
      expect((await ctx.store.get(ownId)).owner).toBe('other');
      const sourceChange = {
        requestId: ownId,
        expectedStorageVersion: 0,
        sources: [
          {
            sourceId: 'mine',
            title: 'My notes',
            excerpts: [{ excerptId: 'text', text: 'Only my account may read this.' }],
          },
        ],
      };
      const changed = await post('/api/authoring/sources', sourceChange);
      expect(changed.body.ok).toBe(true);
      expect(changed.body.data.sources[0].title).toBe('My notes');
      expect((await post('/api/authoring/sources', sourceChange)).body.error.code).toBe('REVISION_CONFLICT');
      const requirementsChange = {
        requestId: ownId,
        expectedStorageVersion: changed.body.data.storageVersion,
        changes: { brief: 'Compare classification rules.', lessonCount: 2, sessionMinutes: 30 },
      };
      const revised = await post('/api/authoring/requirements', requirementsChange);
      expect(revised.body.ok).toBe(true);
      expect(revised.body.data.request).toMatchObject(requirementsChange.changes);
      expect(revised.body.data.sources).toEqual(changed.body.data.sources);
      expect((await post('/api/authoring/requirements', requirementsChange)).body.error.code).toBe('REVISION_CONFLICT');

      expect((await post('/api/authoring/read', { requestId: ownId }, 'Bearer website-owner')).body.error.code).toBe(
        'NOT_FOUND',
      );
    }));

  it('rejects absent, wrong-channel and wrong-origin credentials on all website routes', async () =>
    harness(async ({ record, post }) => {
      const routes = [
        'share',
        'sources',
        'requirements',
        'list',
        'manage',
        'read',
        'grant',
        'delete',
        'revoke',
        'cancel-intent',
        'reserve',
        'receipt',
      ];
      for (const route of routes) {
        for (const auth of [null, 'Bearer invalid', 'Bearer remote-owner']) {
          expect(
            (await post(`/api/authoring/${route}`, { requestId: record.id }, auth)).status,
            `${route} / ${auth}`,
          ).toBe(401);
        }
        expect(
          (await post(`/api/authoring/${route}`, {}, 'Bearer website-owner', 'https://attacker.test')).status,
          route,
        ).toBe(403);
        expect((await post(`/api/authoring/${route}`, {}, 'Bearer website-owner', null)).status, route).toBe(401);
      }
    }));

  it('denies every private MCP tool across accounts and enforces its scope before revealing content', async () =>
    harness(async ({ ctx, record, bundle, lesson, mcp }) => {
      const requestId = record.id,
        draftId = ctx.draftId;
      const mutation = { requestId, draftId, expectedDraftRevision: 4, idempotencyKey: 'isolation-attempt' };
      const cases = {
        get_context: { requestId },
        search_content: { requestId, query: 'Private' },
        read_content: { requestId, contentId: 'source-unknown', expectedRevision: await hash(null) },
        get_generation_contract: { requestId, kind: 'course-plan' },
        create_draft: {
          requestId,
          expectedRequestRevision: record.revision,
          baseContentRevision: record.baseContentRevision,
          idempotencyKey: 'isolation-draft',
        },
        submit_course_plan: { ...mutation, contractHash: await hash(null), plan: ctx.planArgs.plan },
        submit_lesson_bundle: { ...mutation, lessonId: lesson.id, contractHash: await hash(null), bundle },
        validate_draft: mutation,
        preview_draft: { ...mutation, validationId: 'validation-unknown' },
        get_draft_status: { requestId, draftId },
        get_diagnostics: { requestId },
      };
      for (const [operation, args] of Object.entries(cases)) {
        const result = await mcp(operation, args);
        expect(result?.structuredContent.error?.code, operation).toBe('NOT_FOUND');
        expect(JSON.stringify(result), operation).not.toContain('Private owner course sentinel');
        expect((await mcp(operation, args, 'remote-limited')).structuredContent.error.code, operation).toBe(
          'FORBIDDEN',
        );
        expect(await ctx.store.get(record.id), operation).toEqual(record);
      }
      expect((await mcp('list_requests', {})).structuredContent.data.requests).toEqual([]);
      expect((await mcp('list_requests', {}, 'remote-limited')).structuredContent.error.code).toBe('FORBIDDEN');
      expect(
        (await mcp('create_request', { request, idempotencyKey: 'limited-request' }, 'remote-limited'))
          .structuredContent.error.code,
      ).toBe('FORBIDDEN');
      expect((await mcp('get_capabilities', {})).structuredContent.ok).toBe(true);
      const created = await mcp('create_request', { request, idempotencyKey: 'new-other-request' });
      expect(created.structuredContent.ok).toBe(true);
      expect((await ctx.store.get(created.structuredContent.data.requestId)).owner).toBe('other');
      expect((await mcp('get_context', { requestId }, 'remote-owner')).structuredContent.ok).toBe(true);
    }));

  it('accepts case-insensitive Bearer schemes but never bare tokens or other schemes', async () =>
    harness(async ({ record, post }) => {
      for (const authorization of ['Bearer website-owner', 'bearer website-owner', 'BEARER website-owner']) {
        expect(
          (await post('/api/authoring/read', { requestId: record.id }, authorization)).body.ok,
          authorization,
        ).toBe(true);
      }
      for (const authorization of ['website-owner', 'Basic website-owner', 'Bearer website-owner extra']) {
        expect((await post('/api/authoring/read', { requestId: record.id }, authorization)).status, authorization).toBe(
          401,
        );
      }
      const rpc = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'cm_v2_get_context', arguments: { requestId: record.id } },
      };
      expect((await post('/mcp', rpc, 'bearer remote-owner', null)).body.result.structuredContent.ok).toBe(true);
      for (const authorization of ['remote-owner', 'Basic remote-owner', 'Bearer website-owner']) {
        const denied = await post('/mcp', rpc, authorization, null);
        expect(denied.status).toBe(401);
        expect(denied.headers.get('WWW-Authenticate')).toContain('resource_metadata');
      }
    }));
});
