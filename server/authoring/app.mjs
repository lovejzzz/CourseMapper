import { updateRequestRequirements } from '../../src/lib/authoringCore/requestUpdates.js';
import { replaceRequestSources } from '../../src/lib/authoringCore/sourceUpdates.js';
import { setRequestGrant } from '../../src/lib/authoringCore/grants.js';
import { deleteOwnedRequest } from '../../src/lib/authoringCore/lifecycle.js';
import { itemPage } from '../../src/lib/authoringCore/pagination.js';
import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { tools, lessonSchema, clone, assert, AuthoringError } from '../../src/lib/authoringCore/core.js';
import { createAuthoringService, failure, LOCAL_PRINCIPAL } from '../../src/lib/authoringCore/service.js';
import { authenticationChallenge, bearerToken } from './auth.mjs';
export function resolvedToolSchema(tool) {
  const schema = clone(tool.inputSchema);
  if (schema.properties?.bundle) {
    schema.properties.bundle = clone(lessonSchema);
    delete schema.properties.bundle.$id;
    schema.$defs = clone(lessonSchema.$defs);
  }
  if (schema.properties?.request) {
    delete schema.properties.request.$id;
    delete schema.properties.request.$schema;
  }
  return schema;
}
export function createExchangeApp({
  store,
  verifyToken,
  verifyWebsiteToken,
  identityLinks,
  resource,
  issuer,
  websiteOrigin,
  now = () => Date.now(),
  remoteWritesEnabled = true,
  applyEnabled = true,
}) {
  const app = express();
  app.disable('x-powered-by');
  const remote = createAuthoringService({
    store,
    channel: 'remote',
    writesEnabled: remoteWritesEnabled,
    now,
    reviewBase: `${websiteOrigin}/?authoring=1&remote=1`,
  });
  const website = createAuthoringService({ store, channel: 'website', now, writesEnabled: remoteWritesEnabled });
  const scopes = LOCAL_PRINCIPAL.scopes;
  const challenge = authenticationChallenge(resource);
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (req.headers.origin && req.headers.origin !== websiteOrigin)
      return res.status(403).json({ error: 'Origin not allowed' });
    if (req.headers.origin === websiteOrigin) {
      res.set('Access-Control-Allow-Origin', websiteOrigin);
      res.set('Vary', 'Origin');
      res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  app.use(express.json({ limit: '2mb' }));
  app.get('/health', (_req, res) =>
    res.json({ ok: true, protocolVersion: 'coursemapper.authoring.v2', publicPluginStatus: 'not-published' }),
  );
  app.get('/.well-known/oauth-protected-resource', (_req, res) =>
    res.json({ resource, authorization_servers: [issuer], scopes_supported: scopes }),
  );
  app.post('/mcp', async (req, res) => {
    // This stateless endpoint always returns JSON. The SDK still requires both
    // media types, even with enableJsonResponse. Accept JSON-capable discovery
    // clients without making them advertise an unused SSE response format.
    if (!req.accepts('application/json'))
      return res.status(406).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Not Acceptable: Client must accept application/json' },
        id: null,
      });
    req.headers.accept = 'application/json, text/event-stream';
    // The SDK's Node-to-Web adapter consumes rawHeaders rather than headers.
    const rawHeaders = [];
    for (let index = 0; index < req.rawHeaders.length; index += 2)
      if (req.rawHeaders[index].toLowerCase() !== 'accept')
        rawHeaders.push(req.rawHeaders[index], req.rawHeaders[index + 1]);
    req.rawHeaders = [...rawHeaders, 'Accept', req.headers.accept];
    let principal = null;
    if (req.headers.authorization) {
      try {
        const token = bearerToken(req.headers.authorization);
        assert(token, 'UNAUTHENTICATED', 'Bearer authentication is required.');
        principal = await verifyToken(token);
      } catch {
        return res.status(401).set('WWW-Authenticate', challenge).json({ error: 'Authentication required' });
      }
    }
    const server = new Server({ name: 'coursemapper-authoring', version: '2.0.0' }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: resolvedToolSchema(t),
        annotations: t.remote.annotations,
        securitySchemes: t.remote.securitySchemes,
        _meta: { securitySchemes: t.remote.securitySchemes },
      })),
    }));
    server.setRequestHandler(CallToolRequestSchema, async ({ params }, extra) => {
      const result = await remote.execute(params.name, params.arguments || {}, principal, { signal: extra.signal });
      return {
        structuredContent: result,
        content: [{ type: 'text', text: JSON.stringify(result) }],
        isError: !result.ok,
        ...(['UNAUTHENTICATED', 'FORBIDDEN'].includes(result.error?.code)
          ? { _meta: { 'mcp/www_authenticate': [challenge] } }
          : {}),
      };
    });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch {
      if (!res.headersSent) res.status(500).json({ error: 'MCP request failed' });
    }
  });
  app.all('/mcp', (_req, res) => res.status(405).set('Allow', 'POST').end());
  app.use('/api/authoring', async (req, res, next) => {
    try {
      assert(req.headers.origin === websiteOrigin, 'FORBIDDEN', 'Website origin is required.');
      const token = bearerToken(req.headers.authorization);
      assert(token, 'UNAUTHENTICATED', 'Sign in to CourseMapper.');
      const user = await verifyWebsiteToken(token);
      req.websiteUser = user;
      req.principal = { ...LOCAL_PRINCIPAL, uid: user.uid };
      next();
    } catch {
      res.status(401).json({ error: 'Website authentication required' });
    }
  });
  const route = (path, handler) =>
    app.post(`/api/authoring/${path}`, async (req, res) => {
      try {
        if (['share', 'sources', 'requirements', 'grant'].includes(path))
          assert(
            remoteWritesEnabled,
            'WRITES_DISABLED',
            'New remote authoring writes are temporarily disabled. Saved work remains available.',
          );
        res.json(await handler(req.body, req.principal));
      } catch (e) {
        res.status(e.code === 'NOT_FOUND' ? 404 : 400).json(failure(e));
      }
    });
  // Linking is available while authoring writes are disabled for rollout.
  for (const action of ['start', 'finish', 'revoke', 'status']) {
    app.post(`/api/authoring/connection/${action}`, async (req, res) => {
      if (!identityLinks)
        return res.status(503).json({
          ok: false,
          error: { code: 'CONNECTION_UNAVAILABLE', message: 'AI account connections are not configured yet.' },
        });
      try {
        res.json({ ok: true, data: await identityLinks[action](req.websiteUser, req.body) });
      } catch (error) {
        // Do not expose token endpoint responses or provider/Firestore diagnostics.
        const known =
          error instanceof AuthoringError &&
          ['REAUTHENTICATION_REQUIRED', 'INVALID_LINK', 'IDENTITY_CONFLICT'].includes(error.code);
        res.status(400).json({
          ok: false,
          error: {
            code: known ? error.code : 'CONNECTION_FAILED',
            message: known ? error.message : 'Could not update the AI connection. Start again.',
          },
        });
      }
    });
  }
  route('share', (body, p) =>
    website.createRequest(body.request, p, {
      idempotencyKey: body.idempotencyKey,
      sources: body.sources || [],
      base: body.base || null,
      remoteAllowed: true,
    }),
  );
  route('list', (body, p) => website.execute('cm_v2_list_requests', body, p));
  async function ownedRecord(requestId, p) {
    const record = await store.get(requestId, p.uid);
    assert(record && !record.deleted && record.owner === p.uid, 'NOT_FOUND', 'Request is not available.');
    return record;
  }
  route('manage', async (body, p) => {
    const items = (await store.list(p.uid))
      .filter((r) => r.request && !r.deleted)
      .map((r) => ({ requestId: r.id, title: r.request.title, revoked: r.revoked, expiresAt: r.expiresAt }))
      .sort((a, b) => a.requestId.localeCompare(b.requestId));
    const page = await itemPage(items, ['manage', p.uid, items], body.cursor, 20);
    return { ok: true, data: { requests: page.items, cursor: page.cursor } };
  });
  route('requirements', async (body, p) => ({
    ok: true,
    data: await updateRequestRequirements(
      store,
      body.requestId,
      body.expectedStorageVersion,
      p.uid,
      body.changes,
      now(),
    ),
  }));
  route('sources', async (body, p) => ({
    ok: true,
    data: await replaceRequestSources(store, body.requestId, body.expectedStorageVersion, p.uid, body.sources, now()),
  }));
  route('grant', async (body, p) => {
    const record = await setRequestGrant(
      store,
      body.requestId,
      body.expectedStorageVersion,
      p.uid,
      body.selection,
      now(),
    );
    return {
      ok: true,
      data: { revision: record.revision, storageVersion: record.storageVersion, grant: record.grant },
    };
  });
  route('delete', async (body, p) => {
    assert(Number.isInteger(body.expectedStorageVersion), 'INVALID_INPUT', 'Refresh the request before deleting.');
    await deleteOwnedRequest(store, body.requestId, body.expectedStorageVersion, p.uid);
    return { ok: true, data: { deleted: true } };
  });
  route('read', async (body, p) => {
    const record = await ownedRecord(body.requestId, p);
    return { ok: true, data: record };
  });
  route('revoke', async (body, p) => {
    const record = await ownedRecord(body.requestId, p);
    const expected = record.storageVersion;
    record.revoked = true;
    record.storageVersion++;
    await store.cas(record.id, expected, record, p.uid);
    return { ok: true };
  });
  route('cancel-intent', async (body, p) => {
    const r = await ownedRecord(body.requestId, p);
    const draft = r.drafts[body.draftId];
    assert(
      draft && /^[a-zA-Z0-9-]{1,120}$/.test(body.applicationId || ''),
      'INVALID_INPUT',
      'Choose a saved application intent.',
    );
    assert(
      draft.reservation?.applicationId !== body.applicationId,
      'APPLICATION_LOCKED',
      'This application owns a reservation. Recover it on the original device.',
    );
    if (draft.cancelledApplicationIds?.includes(body.applicationId)) return { ok: true, data: { cancelled: true } };
    assert(
      (draft.cancelledApplicationIds?.length || 0) < 200,
      'REQUEST_FULL',
      'This draft has reached its cancellation limit.',
    );
    const expected = r.storageVersion;
    draft.cancelledApplicationIds = [...(draft.cancelledApplicationIds || []), body.applicationId];
    r.storageVersion++;
    await store.cas(r.id, expected, r, p.uid);
    return { ok: true, data: { cancelled: true } };
  });
  route('reserve', async (body, p) => {
    const r = await website.getRecord(body.requestId, p, 'get_context');
    const draft = r.drafts[body.draftId];
    assert(
      draft && draft.revision === body.draftRevision && draft.preview?.revision === draft.revision,
      'STALE_PREVIEW',
      'Preview the latest draft before applying.',
    );
    assert(
      typeof body.projectId === 'string' && /^[a-f0-9]{64}$/.test(body.currentHash || ''),
      'INVALID_INPUT',
      'Application requires a project and current content hash.',
    );
    assert(
      !draft.cancelledApplicationIds?.includes(body.applicationId),
      'APPLICATION_CANCELLED',
      'This application intent was cancelled.',
    );
    if (draft.reservation) {
      assert(
        draft.reservation.applicationId === body.applicationId &&
          draft.reservation.projectId === body.projectId &&
          draft.reservation.currentHash === body.currentHash,
        'APPLICATION_LOCKED',
        'Another application is reserved; resolve its receipt on the original device.',
      );
      return { ok: true, data: draft.reservation };
    }
    assert(
      applyEnabled,
      'APPLY_DISABLED',
      'New applications are temporarily disabled. Existing applications can still be recovered.',
    );
    assert(!draft.application, 'ALREADY_APPLIED', 'Draft was already applied.');
    assert(
      typeof body.applicationId === 'string' && /^[a-zA-Z0-9-]{1,120}$/.test(body.applicationId),
      'INVALID_INPUT',
      'An application ID is required.',
    );
    const expected = r.storageVersion;
    draft.reservation = {
      applicationId: body.applicationId,
      projectId: body.projectId,
      currentHash: body.currentHash,
      expiresAt: now() + 300000,
      state: 'reserved',
    };
    r.storageVersion++;
    await store.cas(r.id, expected, r, p.uid);
    return { ok: true, data: draft.reservation };
  });
  route('receipt', async (body, p) => {
    // Revoking AI access does not prevent the owner from acknowledging an
    // application already durably saved under an earlier reservation.
    const r = await ownedRecord(body.requestId, p);
    const draft = r.drafts[body.draftId];
    assert(
      draft?.reservation?.applicationId === body.applicationId,
      'APPLICATION_LOCKED',
      'Application reservation does not match.',
    );
    assert(/^[a-f0-9]{64}$/.test(body.contentHash || ''), 'INVALID_INPUT', 'A durable content hash is required.');
    if (draft.application) {
      assert(
        draft.application.contentHash === body.contentHash,
        'IDEMPOTENCY_CONFLICT',
        'This application was reported with different content.',
      );
      return { ok: true, data: draft.application };
    }
    const expected = r.storageVersion;
    draft.application = {
      applicationId: body.applicationId,
      contentHash: body.contentHash,
      projectId: draft.reservation.projectId,
      reportedAt: now(),
    };
    draft.state = 'applied';
    r.storageVersion++;
    await store.cas(r.id, expected, r, p.uid);
    return { ok: true, data: draft.application };
  });
  app.use((error, _req, res, next) => {
    if (res.headersSent) return next(error);
    res.status(error.status || 500).json({ error: 'Request could not be processed' });
  });
  return app;
}
