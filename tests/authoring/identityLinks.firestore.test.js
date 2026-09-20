import { describe, it, expect } from 'vitest';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createIdentityLinkStore } from '../../server/authoring/identityLinks.mjs';
import { hash } from '../../src/lib/authoringCore/core.js';
const suite = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;
suite('Firestore identity-link concurrency', () => {
  it('allows one owner, prevents callback replay and makes unlink win over late completion', async () => {
    const app = initializeApp({ projectId: 'coursemapper-rules-test' }, `links-${Date.now()}`);
    try {
      const db = getFirestore(app),
        store = createIdentityLinkStore(db);
      const suffix = Date.now(),
        users = [`link-a-${suffix}`, `link-b-${suffix}`];
      const identity = { issuer: 'https://identity.test/', subject: `sub-${suffix}` };
      for (const uid of users)
        await store.begin(uid, {
          stateHash: 'expected',
          expiresAt: Date.now() + 60000,
          nonce: 'nonce',
          verifier: 'verifier',
        });
      const consume = await Promise.allSettled([
        store.consume(users[0], 'expected', Date.now()),
        store.consume(users[0], 'expected', Date.now()),
      ]);
      expect(consume.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
      const bound = await Promise.allSettled(users.map((uid) => store.bind(uid, identity, 0, Date.now())));
      expect(bound.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
      const owner = users[bound.findIndex((x) => x.status === 'fulfilled')];
      const ref = db
        .collection('authoringExchangeV2')
        .doc('_identities')
        .collection('bindings')
        .doc(await hash([identity.issuer, identity.subject]));
      expect((await ref.get()).data().uid).toBe(owner);
      await store.begin(owner, { stateHash: 'next', expiresAt: Date.now() + 60000 });
      const pending = await store.consume(owner, 'next', Date.now());
      await store.revoke(owner, Date.now());
      await expect(store.bind(owner, identity, pending.epoch, Date.now())).rejects.toThrow('changed');
      expect((await ref.get()).data().revoked).toBe(true);
      expect(await store.status(owner)).toEqual({ linked: false });
    } finally {
      await deleteApp(app);
    }
  });
});
