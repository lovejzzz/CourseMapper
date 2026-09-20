import { describe, it, expect } from 'vitest';
import { failure, createAuthoringService, LOCAL_PRINCIPAL } from '../../src/lib/authoringCore/service.js';
import { AuthoringError } from '../../src/lib/authoringCore/core.js';
import { createExchangeApp } from '../../server/authoring/app.mjs';

const secret = 'PRIVATE-SOURCE-AND-CREDENTIAL-SENTINEL';
const internal = () =>
  Object.assign(new Error(secret), {
    code: 'REVISION_CONFLICT',
    details: [{ path: `/${secret}`, message: secret }],
  });
function expectPrivate(result) {
  expect(JSON.stringify(result)).not.toContain(secret);
  expect(result.error).toEqual({
    code: 'INTERNAL_ERROR',
    message: 'The operation could not be completed.',
    retryable: false,
    issues: [],
  });
}
describe('external authoring error disclosure', () => {
  it('hides coded dependency errors and malformed thrown values but retains actionable domain errors', () => {
    for (const value of [internal(), null, undefined, secret, { code: 'NOT_FOUND', message: secret }])
      expectPrivate(failure(value));
    const result = failure(new AuthoringError('REVISION_CONFLICT', 'Refresh the request.'));
    expect(result.error.code).toBe('REVISION_CONFLICT');
    expect(result.error.retryable).toBe(true);
    expect(result.error.message).toBe('Refresh the request.');
  });
  it('hides storage diagnostics from the tool response', async () => {
    const service = createAuthoringService({
      store: {
        get: async () => {
          throw internal();
        },
      },
    });
    expectPrivate(await service.execute('cm_v2_get_context', { requestId: 'request-private' }, LOCAL_PRINCIPAL));
  });
  it('hides dependency diagnostics from authenticated website routes', async () => {
    const app = createExchangeApp({
      store: {
        get: async () => {
          throw internal();
        },
      },
      resource: 'https://exchange.test',
      issuer: 'https://issuer.test',
      websiteOrigin: 'https://website.test',
      verifyToken: async () => LOCAL_PRINCIPAL,
      verifyWebsiteToken: async () => ({ uid: 'local' }),
    });
    const server = await new Promise((resolve) => {
      const server = app.listen(0, '127.0.0.1', () => resolve(server));
    });
    try {
      for (const route of ['read', 'requirements', 'sources']) {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/api/authoring/${route}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test', Origin: 'https://website.test' },
          body: JSON.stringify({ requestId: 'request-private' }),
        });
        expectPrivate(await response.json());
      }
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
