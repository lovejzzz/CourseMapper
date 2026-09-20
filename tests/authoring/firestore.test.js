import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  saveAuthoredCloudProject,
  loadAuthoredCloudProject,
  rememberCloudVersion,
} from '../../src/lib/authoring/cloudProject.js';
import { createFirestoreStore } from '../../server/authoring/firestoreStore.mjs';
import { createAuthoringService, LOCAL_PRINCIPAL } from '../../src/lib/authoringCore/service.js';
import { request } from './helpers.js';
import { id } from '../../src/lib/authoringCore/primitives.js';
const suite = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;
suite('real Firestore authoring transactions and cloud recovery', () => {
  let environment, adminApp;
  const uid = 'author-cloud-test',
    pid = 'project1';
  beforeAll(async () => {
    environment = await initializeTestEnvironment({
      projectId: 'coursemapper-rules-test',
      firestore: {
        rules: readFileSync('firestore.rules', 'utf8'),
        host: '127.0.0.1',
        port: Number(process.env.FIRESTORE_EMULATOR_HOST.split(':').at(-1)),
      },
    });
    adminApp = initializeApp({ projectId: 'coursemapper-rules-test' }, 'authoring-test');
  });
  afterAll(async () => {
    await environment?.cleanup();
    if (adminApp) await deleteApp(adminApp);
  });
  it('roundtrips Unicode blocks and rejects a competing writer and missing content', async () => {
    const db = environment.authenticatedContext(uid).firestore();
    const snapshot = {
      requiredCapabilities: ['authored-content-v2'],
      courseMap: { courseName: 'Cloud lesson', authoringV2: { applicationId: 'app1' }, lessons: [] },
      deliverables: {
        lessonPlans: {
          status: 'done',
          data: { materials: ['author explanation'] },
          authoredContent: { text: '中文🌍'.repeat(30000) },
        },
      },
    };
    snapshot.deliverables.lessonPlans.authoredContent.text = 'BOUNDARY';
    const start = JSON.stringify(snapshot).indexOf('BOUNDARY');
    snapshot.deliverables.lessonPlans.authoredContent.text = 'x'.repeat(119999 - start) + '🌍中'.repeat(50000);
    await saveAuthoredCloudProject(db, uid, pid, snapshot);
    const rootRef = doc(db, 'users', uid, 'projects', pid);
    const root = (await getDoc(rootRef)).data();
    expect((await loadAuthoredCloudProject(db, uid, pid, root)).deliverables).toEqual(snapshot.deliverables);
    rememberCloudVersion(uid, pid, root);
    await setDoc(rootRef, { ...root, authoringRevision: root.authoringRevision + 1 });
    await expect(saveAuthoredCloudProject(db, uid, pid, snapshot)).rejects.toThrow('another device');
    await deleteDoc(doc(db, 'users', uid, 'projects', pid, 'authoringBlocks', root.authoringManifest.blocks[0]));
    await expect(loadAuthoredCloudProject(db, uid, pid, root)).rejects.toThrow('missing');
  });
  it('stores the remote draft and receipt atomically across service instances', async () => {
    const store1 = createFirestoreStore(getFirestore(adminApp));
    const store2 = createFirestoreStore(getFirestore(adminApp));
    const one = createAuthoringService({ store: store1, channel: 'remote' });
    const two = createAuthoringService({ store: store2, channel: 'remote' });
    const principal = { ...LOCAL_PRINCIPAL, uid: 'remote-transaction-user' };
    const created = await one.createRequest(request, principal, { idempotencyKey: id() });
    const args = {
      requestId: created.data.requestId,
      expectedRequestRevision: 0,
      baseContentRevision: created.data.baseContentRevision,
      idempotencyKey: id(),
    };
    const outcomes = await Promise.all([
      one.execute('cm_v2_create_draft', args, principal),
      two.execute('cm_v2_create_draft', { ...args, idempotencyKey: id() }, principal),
    ]);
    expect(outcomes.filter((x) => x.ok)).toHaveLength(1);
    const record = await store1.get(created.data.requestId, principal.uid);
    expect(Object.keys(record.drafts)).toHaveLength(1);
    expect(Object.keys(record.receipts)).toHaveLength(1);
    const success = outcomes.find((x) => x.ok);
    if (outcomes[0].ok) expect(await two.execute('cm_v2_create_draft', args, principal)).toEqual(success);
    expect(await store2.get(created.data.requestId, 'another-user')).toBeNull();
    record.sources = [{ text: 'BOUNDARY' }];
    const start = JSON.stringify(record).indexOf('BOUNDARY');
    record.sources[0].text = 'x'.repeat(119999 - start) + '🌍中'.repeat(50000);
    const previous = record.storageVersion;
    record.storageVersion++;
    await store1.cas(record.id, previous, record, principal.uid);
    expect((await store2.get(record.id, principal.uid)).sources).toEqual(record.sources);
  });
  it('does not silently truncate an account with more than 200 request summaries', async () => {
    const db = getFirestore(adminApp);
    const uid = 'pagination-user';
    const batch = db.batch();
    for (let index = 0; index < 205; index++) {
      const key = String(index).padStart(64, '0');
      batch.set(db.collection('authoringExchangeV2').doc(uid).collection('requests').doc(key), {
        createdAt: index,
        summary: {
          id: key,
          owner: uid,
          request: { title: `Request ${index}` },
          revision: 0,
          revoked: false,
          remoteAllowed: true,
          expiresAt: Date.now() + 60000,
        },
      });
    }
    await batch.commit();
    const service = createAuthoringService({ store: createFirestoreStore(db), channel: 'remote' });
    let cursor,
      found = [];
    do {
      const result = await service.execute('cm_v2_list_requests', cursor ? { cursor } : {}, {
        ...LOCAL_PRINCIPAL,
        uid,
      });
      expect(result.ok).toBe(true);
      found.push(...result.data.requests.map((r) => r.requestId));
      cursor = result.data.cursor;
    } while (cursor);
    expect(new Set(found).size).toBe(205);
  });
  it('cleans expired/deleted data and orphan blocks while preserving live manifests and tombstones', async () => {
    const db = getFirestore(adminApp),
      uid = 'retention-user';
    const store = createFirestoreStore(db, { now: () => 5000 });
    const make = (id, expiresAt, text) => ({
      id,
      owner: uid,
      request: { title: text },
      drafts: {},
      sources: [],
      storageVersion: 0,
      revision: 0,
      createdAt: 1,
      expiresAt,
      remoteAllowed: true,
      revoked: false,
    });
    const liveId = 'a'.repeat(64),
      expiredId = 'b'.repeat(64),
      deletedId = 'c'.repeat(64);
    const live = make(liveId, 10000, 'Keep live content');
    await store.cas(liveId, null, live, uid);
    await store.cas(expiredId, null, make(expiredId, 4000, 'Expired secret text'), uid);
    await store.cas(deletedId, null, make(deletedId, 10000, 'Deleted secret text'), uid);
    await store.deleteRequest(deletedId, 0, uid);
    const preview = await store.cleanupOwner(uid);
    expect(preview.expiredRequests).toBe(1);
    expect((await store.get(expiredId, uid)).request.title).toBe('Expired secret text');
    const result = await store.cleanupOwner(uid, { apply: true });
    expect(result.unreferencedBlocks).toBe(2);
    expect((await store.get(expiredId, uid)).deleted).toBe(true);
    expect(await store.get(liveId, uid)).toEqual(live);
    const blocks = await db.collection('authoringExchangeV2').doc(uid).collection('blocks').get();
    expect(blocks.size).toBe(1);
    await expect(store.cas(deletedId, null, make(deletedId, 10000, 'resurrection'), uid)).rejects.toThrow('deleted');
    await expect(store.deleteRequest(liveId, 9, uid)).rejects.toThrow('changed');
    await expect(store.deleteRequest(liveId, 0, 'other-owner')).rejects.toThrow('not available');
  });

  it('never commits a manifest with missing blocks during concurrent cleanup and save', async () => {
    const db = getFirestore(adminApp),
      uid = 'retention-race';
    const store = createFirestoreStore(db);
    const key = 'd'.repeat(64);
    let record = {
      id: key,
      owner: uid,
      request: { title: 'Initial' },
      remoteAllowed: true,
      revoked: false,
      storageVersion: 0,
      revision: 0,
      createdAt: 1,
      expiresAt: Date.now() + 60000,
    };
    await store.cas(key, null, record, uid);
    for (let index = 0; index < 6; index++) {
      const next = { ...record, request: { title: `Version ${index}` }, storageVersion: record.storageVersion + 1 };
      const [save, cleanup] = await Promise.allSettled([
        store.cas(key, record.storageVersion, next, uid),
        store.cleanupOwner(uid, { apply: true }),
      ]);
      expect(cleanup.status).toBe('fulfilled');
      if (save.status === 'fulfilled') record = next;
      else expect(save.reason.code).toBe('REVISION_CONFLICT');
      expect(await store.get(key, uid)).toEqual(record);
    }
  });
});
