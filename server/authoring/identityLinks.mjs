import { randomBytes, createHash } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { assert, hash } from '../../src/lib/authoringCore/core.js';
const opaque = () => randomBytes(32).toString('base64url');
const digest = (value) => createHash('sha256').update(value).digest('base64url');
const fresh = (user, now) =>
  assert(
    Number.isFinite(user.auth_time) && user.auth_time * 1000 <= now + 30000 && now - user.auth_time * 1000 < 300000,
    'REAUTHENTICATION_REQUIRED',
    'Sign in again before changing your AI connection.',
  );

// One pending exchange and one active identity per website account. Transactions
// prevent a callback racing with unlink from restoring a revoked connection.
export function createIdentityLinkStore(db) {
  const root = db.collection('authoringExchangeV2').doc('_identities');
  const accountRef = async (uid) => root.collection('accounts').doc(await hash(uid));
  const bindingRef = async (issuer, subject) => root.collection('bindings').doc(await hash([issuer, subject]));
  return {
    async begin(uid, session) {
      const ref = await accountRef(uid);
      await db.runTransaction(async (tx) => {
        const old = (await tx.get(ref)).data() || { epoch: 0 };
        tx.set(ref, { ...old, pending: { ...session, epoch: old.epoch } });
      });
    },
    async consume(uid, stateHash, now) {
      const ref = await accountRef(uid);
      return db.runTransaction(async (tx) => {
        const old = (await tx.get(ref)).data();
        const pending = old?.pending;
        assert(
          pending && pending.stateHash === stateHash && pending.expiresAt > now,
          'INVALID_LINK',
          'The connection attempt expired or was already used. Start again.',
        );
        tx.set(ref, { ...old, pending: null });
        return pending;
      });
    },
    async bind(uid, identity, epoch, now) {
      const ref = await accountRef(uid);
      const binding = await bindingRef(identity.issuer, identity.subject);
      await db.runTransaction(async (tx) => {
        const account = (await tx.get(ref)).data();
        const existing = (await tx.get(binding)).data();
        assert(account?.epoch === epoch, 'INVALID_LINK', 'The connection changed. Start again.');
        assert(!existing || existing.uid === uid, 'IDENTITY_CONFLICT', 'This identity is linked to another account.');
        assert(
          !account.binding || account.binding === binding.id,
          'IDENTITY_CONFLICT',
          'Disconnect the current identity first.',
        );
        tx.set(binding, {
          ...identity,
          uid,
          revoked: false,
          revokedBefore: existing?.revokedBefore || 0,
          linkedAt: now,
        });
        tx.set(ref, { ...account, pending: null, binding: binding.id, epoch: epoch + 1 });
      });
    },
    async revoke(uid, now) {
      const ref = await accountRef(uid);
      await db.runTransaction(async (tx) => {
        const account = (await tx.get(ref)).data() || { epoch: 0 };
        if (account.binding)
          tx.set(
            root.collection('bindings').doc(account.binding),
            { revoked: true, revokedBefore: now },
            { merge: true },
          );
        tx.set(ref, { epoch: account.epoch + 1, binding: null, pending: null });
      });
    },
    async status(uid) {
      const account = (await (await accountRef(uid)).get()).data();
      return { linked: !!account?.binding };
    },
  };
}

export function createIdentityLinkService({
  store,
  issuer,
  jwksUrl,
  clientId,
  websiteOrigin,
  fetchImpl = fetch,
  jwks,
  now = () => Date.now(),
}) {
  const keys = jwks || createRemoteJWKSet(new URL(jwksUrl));
  const redirectUri = `${websiteOrigin}/authoring-link.html`;
  return {
    async start(user) {
      fresh(user, now());
      const state = opaque(),
        nonce = opaque(),
        verifier = opaque();
      await store.begin(user.uid, { stateHash: digest(state), nonce, verifier, expiresAt: now() + 300000 });
      const url = new URL('authorize', issuer);
      url.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid',
        state,
        nonce,
        code_challenge: digest(verifier),
        code_challenge_method: 'S256',
        prompt: 'login',
        max_age: '0',
      }).toString();
      return { authorizationUrl: url.href, state };
    },
    async finish(user, body) {
      fresh(user, now());
      assert(
        typeof body?.state === 'string' &&
          /^[A-Za-z0-9_-]{43}$/.test(body.state) &&
          typeof body.code === 'string' &&
          body.code.length > 0 &&
          body.code.length <= 4096,
        'INVALID_LINK',
        'Invalid connection callback.',
      );
      const pending = await store.consume(user.uid, digest(body.state), now());
      const response = await fetchImpl(new URL('oauth/token', issuer), {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: clientId,
          redirect_uri: redirectUri,
          code: body.code,
          code_verifier: pending.verifier,
        }),
      });
      assert(response.ok, 'INVALID_LINK', 'Identity verification failed. Start again.');
      const tokens = await response.json();
      let payload;
      try {
        ({ payload } = await jwtVerify(tokens.id_token, keys, {
          issuer,
          audience: clientId,
          algorithms: ['RS256'],
          requiredClaims: ['sub', 'exp', 'iat', 'nonce', 'auth_time'],
          maxTokenAge: '5m',
        }));
      } catch {
        assert(false, 'INVALID_LINK', 'Identity verification failed. Start again.');
      }
      assert(
        payload.nonce === pending.nonce &&
          typeof payload.sub === 'string' &&
          payload.sub.length > 0 &&
          payload.sub.length <= 255 &&
          (!payload.azp || payload.azp === clientId),
        'INVALID_LINK',
        'Identity verification failed. Start again.',
      );
      fresh(payload, now());
      await store.bind(user.uid, { issuer, subject: payload.sub }, pending.epoch, now());
      return { linked: true };
    },
    async revoke(user) {
      fresh(user, now());
      await store.revoke(user.uid, now());
      return { linked: false };
    },
    status: (user) => store.status(user.uid),
  };
}
