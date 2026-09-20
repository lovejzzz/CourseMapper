import { it, expect, vi } from 'vitest';
import { indexedDB } from 'fake-indexeddb';
import { createIndexedDbStore } from '../../src/lib/authoring/indexedDbStore.js';
import { id } from '../../src/lib/authoringCore/primitives.js';
import {
  recoverRemoteApplication,
  readRemoteApplication,
  callAccountApi,
} from '../../src/lib/authoring/remoteRecovery.js';
const snapshot = (applicationId, text) => ({
  projectId: applicationId,
  courseMap: { courseName: text, authoringV2: { applicationId } },
  deliverables: {},
});
async function setup() {
  const store = createIndexedDbStore({ indexedDB, name: `remote-recovery-${id()}` });
  const application = { id: id(), owner: 'teacher', storageVersion: 0, before: null };
  application.snapshot = snapshot(application.id, 'original');
  await store.saveRemoteApplication(application);
  return { store, application };
}
it('recovers the latest edited workspace instead of the original application snapshot', async () => {
  const { store, application } = await setup();
  const latest = snapshot(application.id, 'later teacher edits');
  await store.cas(`workspace:${application.id}`, null, { snapshot: latest, storageVersion: 0 });
  const loadWorkspace = vi.fn(async (key) => (await store.get(key)).snapshot);
  const result = await recoverRemoteApplication({ store, uid: 'teacher', getCurrent: () => null, loadWorkspace });
  expect(result.snapshot).toEqual(latest);
  expect(loadWorkspace).toHaveBeenCalledOnce();
});
it('keeps an already-open edited application and refuses to overwrite an unrelated course', async () => {
  const { store, application } = await setup();
  const current = snapshot(application.id, 'unsaved current edits');
  const recovered = await recoverRemoteApplication({ store, uid: 'teacher', getCurrent: () => current });
  expect(recovered).toEqual({ snapshot: current, alreadyOpen: true });
  await expect(
    recoverRemoteApplication({ store, uid: 'teacher', getCurrent: () => snapshot('different-course', 'different') }),
  ).rejects.toThrow('Save and close');
});
it('keeps recovery pointers separate across accounts and rejects another account’s application', async () => {
  const { store, application } = await setup();
  await store.saveRemoteApplication({ ...application, id: 'other-app', owner: 'other' });
  expect((await readRemoteApplication(store, 'teacher')).id).toBe(application.id);
  expect((await readRemoteApplication(store, 'other')).id).toBe('other-app');
  await expect(readRemoteApplication(store, 'unknown')).rejects.toThrow('No saved');
});
it('fails recovery when the current workspace or identity changes during storage reads', async () => {
  const { store, application } = await setup();
  await store.cas(`workspace:${application.id}`, null, { snapshot: application.snapshot, storageVersion: 0 });
  let current = null;
  await expect(
    recoverRemoteApplication({
      store,
      uid: 'teacher',
      getCurrent: () => current,
      loadWorkspace: async () => {
        current = snapshot('new-course', 'new edits');
        return application.snapshot;
      },
    }),
  ).rejects.toThrow('course changed');
  await expect(
    recoverRemoteApplication({ store, uid: 'teacher', getCurrent: () => null, isCurrent: () => false }),
  ).rejects.toThrow('account changed');
});
it('does not send a request when the account changes during token refresh', async () => {
  let uid = 'first';
  const fetch = vi.fn();
  const user = {
    uid,
    getIdToken: async () => {
      uid = 'second';
      return 'test-token';
    },
  };
  await expect(
    callAccountApi({ endpoint: 'https://test.invalid', user, getUid: () => uid, path: 'read', body: {}, fetch }),
  ).rejects.toThrow('account changed');
  expect(fetch).not.toHaveBeenCalled();
});
it('discards a private response if the account changes while its body is arriving', async () => {
  let uid = 'first';
  const user = { uid, getIdToken: async () => 'test-token' };
  const fetch = async () => ({
    ok: true,
    json: async () => {
      uid = 'second';
      return { ok: true, data: { private: 'first-account material' } };
    },
  });
  await expect(
    callAccountApi({ endpoint: 'https://test.invalid', user, getUid: () => uid, path: 'read', body: {}, fetch }),
  ).rejects.toThrow('account changed');
});
