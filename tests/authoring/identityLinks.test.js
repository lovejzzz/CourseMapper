import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createIdentityLinkService, createIdentityLinkStore } from '../../server/authoring/identityLinks.mjs';

// Serializable transactional test store; emulator exercises the Firestore adapter separately.
function database() {
  const data = new Map();
  let chain = Promise.resolve();
  function ref(path) {
    return {
      id: path.split('/').at(-1),
      path,
      collection: (name) => ref(`${path}/${name}`),
      doc: (name) => ref(`${path}/${name}`),
      get: async () => ({ data: () => structuredClone(data.get(path)) }),
    };
  }
  return {
    collection: ref,
    data,
    runTransaction(fn) {
      const run = chain.then(async () => {
        const writes = [];
        const result = await fn({ get: (r) => r.get(), set: (r, value, opts) => writes.push([r.path, value, opts]) });
        for (const [key, value, opts] of writes)
          data.set(key, structuredClone(opts?.merge ? { ...data.get(key), ...value } : value));
        return result;
      });
      chain = run.catch(() => {});
      return run;
    },
  };
}
const issuer = 'https://identity.test/';
const clientId = 'link-client';
async function setup() {
  const db = database(),
    store = createIdentityLinkStore(db);
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const key = await exportJWK(publicKey);
  key.kid = 'link-key';
  let clock = Date.now();
  const user = { uid: 'teacher1', auth_time: Math.floor(clock / 1000) };
  let nonce,
    claims = {},
    exchange;
  const fetchImpl = vi.fn(async (_url, options) => {
    exchange = options;
    return {
      ok: true,
      json: async () => ({
        id_token: await new SignJWT({ nonce, auth_time: user.auth_time, ...claims })
          .setProtectedHeader({ alg: 'RS256', kid: key.kid })
          .setSubject('external-subject')
          .setIssuer(claims.iss || issuer)
          .setAudience(claims.aud || clientId)
          .setIssuedAt()
          .setExpirationTime('5m')
          .sign(privateKey),
      }),
    };
  });
  const service = createIdentityLinkService({
    store,
    issuer,
    clientId,
    websiteOrigin: 'https://website.test',
    jwks: createLocalJWKSet({ keys: [key] }),
    fetchImpl,
    now: () => clock,
  });
  async function start(who = user) {
    const result = await service.start(who);
    nonce = new URL(result.authorizationUrl).searchParams.get('nonce');
    return result;
  }
  return {
    db,
    store,
    service,
    fetchImpl,
    user,
    start,
    exchange: () => exchange,
    claims: (v) => {
      claims = v;
    },
    advance: (ms) => {
      clock += ms;
    },
  };
}

describe('verified dual-login connection', () => {
  it('exchanges one-time state with S256 and binds only the signed subject, never an email', async () => {
    const ctx = await setup();
    const started = await ctx.start();
    const url = new URL(started.authorizationUrl);
    expect(url.origin).toBe('https://identity.test');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('redirect_uri')).toBe('https://website.test/authoring-link.html');
    expect(url.searchParams.get('scope')).toBe('openid');
    expect(await ctx.service.finish(ctx.user, { state: started.state, code: 'authorization-code' })).toEqual({
      linked: true,
    });
    const body = ctx.exchange().body;
    expect(createHash('sha256').update(body.get('code_verifier')).digest('base64url')).toBe(
      url.searchParams.get('code_challenge'),
    );
    expect(await ctx.service.status(ctx.user)).toEqual({ linked: true });
    const binding = [...ctx.db.data.entries()].find(([key]) => key.includes('/bindings/'))[1];
    expect(binding).toMatchObject({ uid: 'teacher1', issuer, subject: 'external-subject', revoked: false });
    await expect(ctx.service.finish(ctx.user, { state: started.state, code: 'authorization-code' })).rejects.toThrow(
      'already used',
    );
    expect(ctx.fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('rejects a different Firebase account, changed state and expired attempts before code exchange', async () => {
    const ctx = await setup();
    const { state } = await ctx.start();
    await expect(ctx.service.finish({ ...ctx.user, uid: 'teacher2' }, { state, code: 'code' })).rejects.toThrow(
      'expired',
    );
    await expect(ctx.service.finish(ctx.user, { state: 'a'.repeat(43), code: 'code' })).rejects.toThrow('expired');
    ctx.advance(300001);
    await expect(ctx.service.finish(ctx.user, { state, code: 'code' })).rejects.toThrow('Sign in again');
    await expect(
      ctx.service.finish({ ...ctx.user, auth_time: Math.floor(Date.now() / 1000) + 300 }, { state, code: 'code' }),
    ).rejects.toThrow('expired');
    expect(ctx.fetchImpl).not.toHaveBeenCalled();
  });
  it.each([
    { nonce: 'wrong' },
    { aud: 'another-client' },
    { iss: 'https://attacker.test/' },
    { azp: 'wrong-client' },
    { auth_time: 1 },
  ])('rejects signed but invalid proof %j', async (claims) => {
    const ctx = await setup();
    const { state } = await ctx.start();
    ctx.claims(claims);
    await expect(ctx.service.finish(ctx.user, { state, code: 'code' })).rejects.toThrow();
    expect(await ctx.service.status(ctx.user)).toEqual({ linked: false });
  });
  it('prevents two website accounts from linking the same external identity', async () => {
    const ctx = await setup();
    let attempt = await ctx.start();
    await ctx.service.finish(ctx.user, { state: attempt.state, code: 'code1' });
    const other = { ...ctx.user, uid: 'teacher2' };
    attempt = await ctx.start(other);
    await expect(ctx.service.finish(other, { state: attempt.state, code: 'code2' })).rejects.toThrow('another account');
    await ctx.service.revoke(ctx.user);
    attempt = await ctx.start(other);
    await expect(ctx.service.finish(other, { state: attempt.state, code: 'code3' })).rejects.toThrow('another account');
  });
  it('unlink wins against an already consumed callback and invalidates existing tokens', async () => {
    const ctx = await setup();
    const first = await ctx.start();
    await ctx.service.finish(ctx.user, { state: first.state, code: 'first' });
    const second = await ctx.start();
    const pending = await ctx.store.consume(
      ctx.user.uid,
      createHash('sha256').update(second.state).digest('base64url'),
      Date.now(),
    );
    await ctx.service.revoke(ctx.user);
    await expect(
      ctx.store.bind(ctx.user.uid, { issuer, subject: 'external-subject' }, pending.epoch, Date.now()),
    ).rejects.toThrow('changed');
    expect(await ctx.service.status(ctx.user)).toEqual({ linked: false });
    const binding = [...ctx.db.data.entries()].find(([key]) => key.includes('/bindings/'))[1];
    expect(binding.revoked).toBe(true);
    expect(binding.revokedBefore).toBeGreaterThan(0);
  });
});
