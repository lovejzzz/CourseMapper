// Run from the isolated deployment runtime; writes only to a loopback emulator.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^127\.0\.0\.1:\d+$/);
const runtimeRequire = createRequire(resolve('package.json'));
const { initializeApp, deleteApp } = runtimeRequire('firebase-admin/app');
const { getFirestore } = runtimeRequire('firebase-admin/firestore');
const { createFirestoreStore } = await import(pathToFileURL(resolve('server/authoring/firestoreStore.mjs')));
const app = initializeApp({ projectId: 'coursemapper-rules-test' });
const db = getFirestore(app);
const store = createFirestoreStore(db);
const uid = `runtime-${randomUUID()}`;
const key = 'a'.repeat(64);
const original = {
  id: key,
  owner: uid,
  storageVersion: 0,
  createdAt: Date.now(),
  expiresAt: Date.now() + 60000,
  revision: 0,
  revoked: false,
  remoteAllowed: true,
  request: { title: 'Runtime compatibility' },
  sources: [{ text: '中文🌍'.repeat(50000) }],
};
try {
  await store.cas(key, null, original, uid);
  assert.deepEqual(await store.get(key, uid), original);
  assert.equal(await store.get(key, `${uid}-other`), null);
  const outcomes = await Promise.allSettled([
    store.cas(key, 0, { ...original, storageVersion: 1, revision: 1 }, uid),
    store.cas(key, 0, { ...original, storageVersion: 1, revision: 2 }, uid),
  ]);
  assert.equal(outcomes.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(outcomes.find((result) => result.status === 'rejected').reason.code, 'REVISION_CONFLICT');
  assert.equal((await store.list(uid)).length, 1);
  await store.deleteRequest(key, 1, uid);
  assert.equal((await store.get(key, uid)).deleted, true);
  const cleanup = await store.cleanupOwner(uid, { apply: true });
  assert(cleanup.unreferencedBlocks > 0);
  console.log(
    JSON.stringify({
      passed: true,
      runtimeFirestoreCompatibility: true,
      unicodeRoundtrip: true,
      competingWriterRejected: true,
      deletionAndCleanup: true,
    }),
  );
} finally {
  await db.recursiveDelete(db.collection('authoringExchangeV2').doc(uid));
  await db.terminate();
  await deleteApp(app);
}
