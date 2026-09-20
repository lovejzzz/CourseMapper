import { it, expect, vi } from 'vitest';
import { indexedDB } from 'fake-indexeddb';
import { createIndexedDbStore } from '../../src/lib/authoring/indexedDbStore.js';
import { id } from '../../src/lib/authoringCore/primitives.js';

it('commits the remote recovery pointer together with its full application', async () => {
  const store = createIndexedDbStore({ indexedDB, name: `recovery-${id()}` });
  const application = { id: id(), owner: 'teacher', snapshot: { text: '完整内容' }, storageVersion: 0 };
  await store.saveRemoteApplication(application);
  expect(await store.get('pendingRemoteApplication')).toEqual(application);
  expect(await store.get(`remoteApplication:${application.id}`)).toEqual(application);
  await expect(store.saveRemoteApplication({ ...application, snapshot: {} })).rejects.toThrow('already saved');
  expect(await store.get('pendingRemoteApplication')).toEqual(application);
});

it('rejects a stale browser tab instead of overwriting a newer teacher edit', async () => {
  vi.stubGlobal('indexedDB', indexedDB);
  try {
    vi.resetModules();
    const tabOne = await import('../../src/lib/authoring/localWorkspace.js');
    const snapshot = { courseMap: { courseName: 'Test', authoringV2: { applicationId: id() } }, text: 'first' };
    const pointer = await tabOne.saveAuthorWorkspace(snapshot);
    vi.resetModules();
    const tabTwo = await import('../../src/lib/authoring/localWorkspace.js');
    await tabTwo.restoreAuthorWorkspace(pointer);
    await tabOne.saveAuthorWorkspace({ ...snapshot, text: 'teacher edit' });
    await expect(tabTwo.saveAuthorWorkspace({ ...snapshot, text: 'stale edit' })).rejects.toThrow('Another tab');
    expect((await tabTwo.restoreAuthorWorkspace(pointer)).text).toBe('teacher edit');
  } finally {
    vi.unstubAllGlobals();
  }
});
