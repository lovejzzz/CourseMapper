import { it, expect } from 'vitest';
import { indexedDB } from 'fake-indexeddb';
import { createIndexedDbStore } from '../../src/lib/authoring/indexedDbStore.js';
import {
  prepareRemoteApplication,
  confirmRemoteReservation,
  cancelPreparedApplication,
} from '../../src/lib/authoring/remoteApplication.js';
import { recoverRemoteApplication, readRemoteApplication } from '../../src/lib/authoring/remoteRecovery.js';
import { hash, id } from '../../src/lib/authoringCore/primitives.js';
import { contentBase } from '../../src/lib/authoringCore/service.js';
async function setup() {
  const store = createIndexedDbStore({ indexedDB, name: `intent-${id()}` });
  const args = {
    store,
    uid: 'teacher',
    requestId: 'request',
    draftId: 'draft',
    current: null,
    preview: {
      conflicts: [],
      currentHash: await hash(contentBase(null)),
      draftRevision: 4,
      snapshot: { courseMap: { courseName: 'Reviewed course' }, deliverables: {} },
    },
  };
  return { store, args };
}
it('persists intent before reservation, retries a lost response with the same identity, and prevents premature recovery', async () => {
  const { store, args } = await setup();
  const application = await prepareRemoteApplication(args);
  await expect(recoverRemoteApplication({ store, uid: 'teacher', getCurrent: () => null })).rejects.toThrow(
    'reservation',
  );
  let reserved;
  const api = async (_path, body) => {
    expect((await readRemoteApplication(store, 'teacher')).id).toBe(body.applicationId);
    if (!reserved) {
      reserved = body;
      throw new Error('Connection lost after server commit');
    }
    expect(body).toEqual(reserved);
    return reserved;
  };
  const params = { store, application, api, getCurrent: () => null };
  await expect(confirmRemoteReservation(params)).rejects.toThrow('Connection lost');
  expect((await readRemoteApplication(store, 'teacher')).phase).toBe('prepared');
  await expect(prepareRemoteApplication(args)).rejects.toThrow('Recover the interrupted');
  const confirmed = await confirmRemoteReservation(params);
  expect(confirmed.phase).toBe('locally-saved');
  const recovered = await recoverRemoteApplication({ store, uid: 'teacher', getCurrent: () => null });
  expect(recovered.snapshot).toEqual(application.snapshot);
});
it('allows only one simultaneous prepared application per account', async () => {
  const { store, args } = await setup();
  const results = await Promise.allSettled([prepareRemoteApplication(args), prepareRemoteApplication(args)]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect((await readRemoteApplication(store, 'teacher')).phase).toBe('prepared');
});
it('keeps intent recoverable without applying if reservation is rejected or the workspace changes', async () => {
  const { store, args } = await setup();
  const application = await prepareRemoteApplication(args);
  await expect(
    confirmRemoteReservation({
      store,
      application,
      getCurrent: () => null,
      api: async () => {
        throw new Error('Other device owns reservation');
      },
    }),
  ).rejects.toThrow('Other device');
  let current = null;
  await expect(
    confirmRemoteReservation({
      store,
      application,
      getCurrent: () => current,
      api: async () => {
        current = { courseMap: { courseName: 'Teacher edit' } };
      },
    }),
  ).rejects.toThrow('course changed');
  expect((await readRemoteApplication(store, 'teacher')).phase).toBe('prepared');
});
it('does not reserve when durable intent storage fails', async () => {
  const { args } = await setup();
  await expect(
    prepareRemoteApplication({
      ...args,
      store: {
        saveRemoteApplication: async () => {
          throw new Error('Quota exceeded');
        },
      },
    }),
  ).rejects.toThrow('Quota exceeded');
});

it('requires server acknowledgement before discarding an uncommitted intent', async () => {
  const { store, args } = await setup();
  const application = await prepareRemoteApplication(args);
  await expect(
    cancelPreparedApplication({
      store,
      application,
      api: async () => {
        throw new Error('Existing reservation');
      },
    }),
  ).rejects.toThrow('Existing reservation');
  expect((await readRemoteApplication(store, 'teacher')).phase).toBe('prepared');
  await cancelPreparedApplication({ store, application, api: async () => ({ cancelled: true }) });
  await expect(recoverRemoteApplication({ store, uid: 'teacher', getCurrent: () => null })).rejects.toThrow(
    'discarded',
  );
  expect((await prepareRemoteApplication(args)).id).not.toBe(application.id);
});
