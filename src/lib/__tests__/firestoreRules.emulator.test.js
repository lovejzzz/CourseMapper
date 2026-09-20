import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';

const hasEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const describeWithEmulator = hasEmulator ? describe : describe.skip;
let testEnv;

describeWithEmulator('firestore.rules emulator', () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'coursemapper-rules-test',
      firestore: {
        rules: readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8'),
        host: '127.0.0.1',
        port: Number(process.env.FIRESTORE_EMULATOR_HOST?.split(':').at(-1) || 8080),
      },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  afterAll(async () => {
    await testEnv?.cleanup();
  });

  it('lets users read and write their own project docs', async () => {
    const db = testEnv.authenticatedContext('alice').firestore();
    const ref = doc(db, 'users/alice/projects/project-a');

    await assertSucceeds(setDoc(ref, { courseName: 'Intro', updatedAt: 1 }));
    await assertSucceeds(getDoc(ref));
  });

  it('blocks cross-user reads and writes', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();
    const bobDb = testEnv.authenticatedContext('bob').firestore();

    await assertSucceeds(setDoc(doc(aliceDb, 'users/alice/projects/project-a'), { courseName: 'Intro' }));
    await assertFails(getDoc(doc(bobDb, 'users/alice/projects/project-a')));
    await assertFails(setDoc(doc(bobDb, 'users/alice/projects/project-b'), { courseName: 'Hack' }));
  });

  it('blocks unauthenticated access', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    const ref = doc(db, 'users/alice/projects/project-a');

    await assertFails(getDoc(ref));
    await assertFails(setDoc(ref, { courseName: 'Nope' }));
  });

  it('blocks writes with excessive top-level fields', async () => {
    const db = testEnv.authenticatedContext('alice').firestore();
    const tooWide = Object.fromEntries(Array.from({ length: 81 }, (_, i) => [`field${i}`, i]));

    await assertFails(setDoc(doc(db, 'users/alice/projects/too-wide'), tooWide));
  });

  it('lets owners delete their own docs', async () => {
    const db = testEnv.authenticatedContext('alice').firestore();
    const ref = doc(db, 'users/alice/projects/project-a');

    await assertSucceeds(setDoc(ref, { courseName: 'Intro' }));
    await assertSucceeds(deleteDoc(ref));
  });

  it('keeps exchange records server-only even for their owner', async () => {
    const db = testEnv.authenticatedContext('alice').firestore();
    await assertFails(setDoc(doc(db, 'authoringExchangeV2/alice/requests/request1'), { owner: 'alice' }));
    await assertFails(getDoc(doc(db, 'authoringExchangeV2/alice/requests/request1')));
  });

  it('rejects legacy overwrites and stale revisions on authored projects', async () => {
    const db = testEnv.authenticatedContext('alice').firestore();
    const ref = doc(db, 'users/alice/projects/authored');
    const initial = { courseName: 'Authored', requiredCapabilities: ['authored-content-v2'], authoringRevision: 1 };
    await assertSucceeds(setDoc(ref, initial));
    await assertFails(setDoc(ref, { courseName: 'Old client' }, { merge: true }));
    await assertFails(setDoc(ref, { courseName: 'Old replacement' }));
    await assertSucceeds(setDoc(ref, { ...initial, authoringRevision: 2 }));
    await assertFails(setDoc(ref, { ...initial, authoringRevision: 2 }));
    await assertFails(setDoc(doc(db, 'users/alice/projects/authored/deliverables/lessonPlans'), { data: 'legacy' }));
    const block = doc(db, 'users/alice/projects/authored/authoringBlocks/block1');
    await assertSucceeds(setDoc(block, { text: 'immutable author content' }));
    await assertFails(setDoc(block, { text: 'changed' }));
  });

  it.each([
    'users/alice',
    'users/alice/customDeliverables/custom',
    'users/alice/agentData/preferences',
    'users/alice/agentData/memory/entries/memory',
    'users/alice/agentData/customTools/entries/tool',
    'users/alice/projects/legacy/deliverables/lessonPlans',
  ])('preserves owner access and isolation for legacy path %s', async (path) => {
    const alice = testEnv.authenticatedContext('alice').firestore();
    const bob = testEnv.authenticatedContext('bob').firestore();
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(setDoc(doc(alice, 'users/alice/projects/legacy'), { courseName: 'Legacy' }));
    await assertSucceeds(setDoc(doc(alice, path), { value: 'private' }));
    await assertSucceeds(getDoc(doc(alice, path)));
    await assertSucceeds(setDoc(doc(alice, path), { value: 'updated' }));
    for (const db of [bob, anon]) {
      await assertFails(getDoc(doc(db, path)));
      await assertFails(setDoc(doc(db, path), { value: 'intruder' }));
      await assertFails(deleteDoc(doc(db, path)));
    }
    await assertSucceeds(deleteDoc(doc(alice, path)));
  });
  it('denies unmatched collections and nested project paths', async () => {
    const db = testEnv.authenticatedContext('alice').firestore();
    for (const path of [
      'public/private',
      'users/alice/projects/project/unknown/document',
      'authoringExchangeV2/_identities/bindings/identity',
    ]) {
      await assertFails(getDoc(doc(db, path)));
      await assertFails(setDoc(doc(db, path), { value: 'unapproved' }));
    }
  });

  it('keeps emulator tests skipped outside firebase emulators:exec', () => {
    expect(hasEmulator).toBe(true);
  });
});
