import { assert, hash } from '../../src/lib/authoringCore/core.js';
export function createFirestoreStore(db, { now = () => Date.now() } = {}) {
  function owner(uid) {
    assert(typeof uid === 'string' && /^[^/]{1,128}$/.test(uid), 'UNAUTHENTICATED', 'Invalid identity.');
    return db.collection('authoringExchangeV2').doc(uid);
  }
  function root(key, uid) {
    assert(/^[a-f0-9]{64}$/.test(key), 'NOT_FOUND', 'Request is not available.');
    return owner(uid).collection('requests').doc(key);
  }
  async function get(key, uid) {
    const ref = root(key, uid);
    return db.runTransaction(
      async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return null;
        const meta = snap.data();
        if (meta.deleted)
          return { id: key, owner: uid, storageVersion: meta.storageVersion, revoked: true, deleted: true };
        const parts = await Promise.all(
          meta.blocks.map(async (block) => {
            const part = await tx.get(owner(uid).collection('blocks').doc(block));
            assert(
              part.exists && (await hash(part.data().text)) === block,
              'MISSING_CONTENT',
              'Saved draft content is missing or damaged.',
            );
            return part.data().text;
          }),
        );
        const text = parts.join('');
        assert((await hash(text)) === meta.hash, 'MISSING_CONTENT', 'Saved draft integrity check failed.');
        return JSON.parse(text);
      },
      { readOnly: true },
    );
  }
  return {
    get,
    async list(uid) {
      const snap = await owner(uid).collection('requests').orderBy('createdAt').get();
      return snap.docs.filter((d) => !d.data().deleted).map((d) => d.data().summary);
    },
    async deleteRequest(key, expected, uid) {
      const ref = root(key, uid);
      return db.runTransaction(async (tx) => {
        const fence = await tx.get(owner(uid));
        const snap = await tx.get(ref);
        assert(snap.exists, 'NOT_FOUND', 'Request is not available.');
        if (snap.data().deleted) return { deleted: true };
        assert(
          snap.data().storageVersion === expected,
          'REVISION_CONFLICT',
          'Request changed. Refresh before deleting.',
        );
        tx.set(ref, { deleted: true, storageVersion: expected + 1, deletedAt: now() });
        tx.set(owner(uid), { writeGeneration: (fence.data()?.writeGeneration || 0) + 1 }, { merge: true });
        return { deleted: true };
      });
    },
    async cleanupOwner(uid, { apply = false } = {}) {
      const requests = await owner(uid).collection('requests').get();
      const expired = requests.docs.filter((r) => !r.data().deleted && r.data().expiresAt <= now());
      if (apply)
        for (const r of expired) {
          try {
            await this.deleteRequest(r.id, r.data().storageVersion, uid);
          } catch (e) {
            if (e.code !== 'REVISION_CONFLICT') throw e;
          }
        }
      const allBlocks = await owner(uid).collection('blocks').get();
      let removedBlocks = 0;
      // Optimistic batches observe the same owner fence that writers change when
      // publishing a manifest. A save also verifies its uploaded blocks inside
      // that transaction, so cleanup cannot leave a committed missing block.
      for (let start = 0; start < allBlocks.docs.length; start += 100) {
        const candidates = allBlocks.docs.slice(start, start + 100);
        for (let attempt = 0; attempt < 5; attempt++) {
          const fence = await owner(uid).get();
          const current = await owner(uid).collection('requests').get();
          const live = new Set(current.docs.flatMap((r) => (r.data().deleted ? [] : r.data().blocks || [])));
          const unused = candidates.filter((block) => !live.has(block.id));
          if (!apply || !unused.length) {
            removedBlocks += unused.length;
            break;
          }
          const batch = db.batch();
          unused.forEach((block) => batch.delete(block.ref));
          const generation = { writeGeneration: (fence.data()?.writeGeneration || 0) + 1 };
          if (fence.exists) batch.update(owner(uid), generation, { lastUpdateTime: fence.updateTime });
          else batch.create(owner(uid), generation);
          try {
            await batch.commit();
            removedBlocks += unused.length;
            break;
          } catch (error) {
            if (![6, 9, 10, 'already-exists', 'failed-precondition', 'aborted'].includes(error.code) || attempt === 4)
              throw error;
          }
        }
      }
      return { expiredRequests: expired.length, unreferencedBlocks: removedBlocks, applied: apply };
    },
    async cas(key, expected, value, uid) {
      const ref = root(key, uid);
      const text = JSON.stringify(value);
      const blocks = [];
      for (let offset = 0; offset < text.length; ) {
        let end = Math.min(text.length, offset + 120000);
        if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
        const part = text.slice(offset, end);
        offset = end;
        const block = await hash(part);
        blocks.push(block);
        const partRef = owner(uid).collection('blocks').doc(block);
        try {
          await partRef.create({ text: part, createdAt: now() });
        } catch (e) {
          if (e.code !== 6 && e.code !== 'already-exists') throw e;
        }
      }
      const digest = await hash(text);
      await db.runTransaction(async (tx) => {
        const fence = await tx.get(owner(uid));
        const snap = await tx.get(ref);
        const storedBlocks = await tx.getAll(...blocks.map((block) => owner(uid).collection('blocks').doc(block)));
        assert(
          storedBlocks.every((block) => block.exists),
          'REVISION_CONFLICT',
          'Content cleanup raced this save. Retry the operation.',
        );
        assert(!snap.data()?.deleted, 'NOT_FOUND', 'Request was deleted.');
        assert(
          (snap.exists ? snap.data().storageVersion : null) === expected,
          'REVISION_CONFLICT',
          'The request changed. Read its latest revision and retry.',
        );
        tx.set(owner(uid), { writeGeneration: (fence.data()?.writeGeneration || 0) + 1 }, { merge: true });
        tx.set(ref, {
          storageVersion: value.storageVersion,
          blocks,
          hash: digest,
          createdAt: value.createdAt,
          expiresAt: value.expiresAt,
          summary: {
            id: key,
            owner: uid,
            request: { title: value.request.title },
            revision: value.revision,
            revoked: value.revoked,
            remoteAllowed: value.remoteAllowed,
            expiresAt: value.expiresAt,
          },
        });
      });
      return value;
    },
  };
}
