import { expect, it } from 'vitest';
import { indexedDB } from 'fake-indexeddb';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createTokenVerifier } from '../../server/authoring/auth.mjs';
import { createExchangeApp } from '../../server/authoring/app.mjs';
import { setup, completeDraft, LOCAL_PRINCIPAL } from './helpers.js';

it('rechecks signed-token binding, account ownership, expiry and request revocation on every HTTP call', async () => {
  const ctx = await setup(indexedDB);
  const { record } = await completeDraft(ctx);
  const version = record.storageVersion++;
  record.remoteAllowed = true;
  record.request.title = 'Private signed-token sentinel';
  await ctx.store.cas(record.id, version, record);
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const key = { ...(await exportJWK(publicKey)), kid: 'boundary' };
  const issued = Math.floor(Date.now() / 1000);
  const binding = { uid: 'local', revoked: false, revokedBefore: 0 };
  const verifyToken = createTokenVerifier({
    issuer: 'https://identity.test',
    audience: 'https://exchange.test',
    jwks: createLocalJWKSet({ keys: [key] }),
    resolveIdentity: async ({ subject }) => (subject === 'owner' ? binding : { uid: 'other' }),
  });
  const token = ({ sub = 'owner', iat = issued - 10, exp = issued + 300 } = {}) =>
    new SignJWT({ scope: LOCAL_PRINCIPAL.scopes.join(' ') })
      .setProtectedHeader({ alg: 'RS256', kid: 'boundary' })
      .setSubject(sub)
      .setIssuer('https://identity.test')
      .setAudience('https://exchange.test')
      .setIssuedAt(iat)
      .setExpirationTime(exp)
      .sign(privateKey);
  const app = createExchangeApp({
    store: ctx.store,
    verifyToken,
    verifyWebsiteToken: async () => {
      throw new Error('No website credential in this test');
    },
    resource: 'https://exchange.test',
    issuer: 'https://identity.test',
    websiteOrigin: 'https://website.test',
  });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const call = async (jwt, name = 'get_context', args = { requestId: record.id }) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: `cm_v2_${name}`, arguments: args },
      }),
    });
    const body = await response.json();
    return body.result || { status: response.status, challenge: response.headers.get('www-authenticate'), body };
  };
  const deniedAuth = (result) => {
    expect(result.status).toBe(401);
    expect(result.challenge).toContain('oauth-protected-resource');
    expect(result.body).toEqual({ error: 'Authentication required' });
    expect(JSON.stringify(result)).not.toContain('Private signed-token sentinel');
  };
  try {
    const original = await token();
    expect((await call(original)).structuredContent.ok).toBe(true);
    binding.revoked = true;
    deniedAuth(await call(original));
    binding.revoked = false;
    binding.revokedBefore = (issued - 5) * 1000;
    deniedAuth(await call(original));
    const renewed = await token({ iat: issued });
    expect((await call(renewed)).structuredContent.ok).toBe(true);
    deniedAuth(await call(await token({ iat: issued - 100, exp: issued - 1 })));
    const outsider = await call(await token({ sub: 'other' }));
    expect(outsider.structuredContent.error.code).toBe('NOT_FOUND');
    expect(JSON.stringify(outsider)).not.toContain('Private signed-token sentinel');
    const revoked = await ctx.store.get(record.id);
    const previous = revoked.storageVersion++;
    revoked.revoked = true;
    await ctx.store.cas(record.id, previous, revoked);
    expect((await call(renewed)).structuredContent.error.code).toBe('GRANT_REVOKED');
    const listing = await call(renewed, 'list_requests', {});
    expect(listing.structuredContent.ok).toBe(true);
    expect(JSON.stringify(listing)).not.toContain(record.id);
    expect(await ctx.store.get(record.id)).toEqual(revoked);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
