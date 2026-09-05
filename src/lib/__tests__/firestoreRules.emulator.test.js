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
        port: 8080,
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

  it('keeps emulator tests skipped outside firebase emulators:exec', () => {
    expect(hasEmulator).toBe(true);
  });
});
