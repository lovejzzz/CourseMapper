import { it, expect, vi } from 'vitest';
import { indexedDB } from 'fake-indexeddb';
import { createIndexedDbStore } from '../../src/lib/authoring/indexedDbStore.js';
import { id } from '../../src/lib/authoringCore/primitives.js';

it('resumes a newly applied course instead of an older project before debounced autosave', async () => {
  vi.stubGlobal('indexedDB', indexedDB);
  const values = new Map([['coursemapper-project', JSON.stringify({ courseMap: { courseName: 'Older course' } })]]);
  const storage = { setItem: (key, value) => values.set(key, value) };
  try {
    vi.resetModules();
    const writer = await import('../../src/lib/authoring/localWorkspace.js');
    const snapshot = {
      courseMap: { courseName: 'Applied course', authoringV2: { applicationId: id() } },
      deliverables: { lessonPlans: { data: { text: 'Exact reviewed teaching text' } } },
    };
    await writer.saveAuthorWorkspaceForResume(snapshot, storage);
    // Model a page reload: no autosave callback or in-memory version state survives.
    vi.resetModules();
    const reader = await import('../../src/lib/authoring/localWorkspace.js');
    expect(await reader.restoreAuthorWorkspace(JSON.parse(values.get('coursemapper-project')))).toEqual(snapshot);
    await reader.saveAuthorWorkspace({ ...snapshot, edited: true });
  } finally {
    vi.unstubAllGlobals();
  }
});

it('does not report a resumable application when publishing its resume pointer fails', async () => {
  vi.stubGlobal('indexedDB', indexedDB);
  try {
    vi.resetModules();
    const writer = await import('../../src/lib/authoring/localWorkspace.js');
    await expect(
      writer.saveAuthorWorkspaceForResume(
        { courseMap: { courseName: 'Applied course', authoringV2: { applicationId: id() } } },
        {
          getItem: () => 'older marker',
          setItem: () => {
            throw new Error('Storage unavailable');
          },
          removeItem: () => {
            throw new Error('Storage unavailable');
          },
        },
      ),
    ).rejects.toThrow('Storage unavailable');
  } finally {
    vi.unstubAllGlobals();
  }
});

it('resumes exact author content through IndexedDB when localStorage is full, without clearing unrelated data', async () => {
  vi.stubGlobal('indexedDB', indexedDB);
  const values = new Map([
    ['coursemapper-project', 'older resume marker'],
    ['unrelated-user-data', 'preserve me'],
  ]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: () => {
      throw new DOMException('Full', 'QuotaExceededError');
    },
    removeItem: (key) => values.delete(key),
  };
  try {
    vi.resetModules();
    const writer = await import('../../src/lib/authoring/localWorkspace.js');
    const snapshot = {
      courseMap: { courseName: 'Quota recovery', authoringV2: { applicationId: id() } },
      text: 'Reviewed author content',
    };
    await writer.saveAuthorWorkspaceForResume(snapshot, storage);
    expect(values.has('coursemapper-project')).toBe(false);
    expect(values.get('unrelated-user-data')).toBe('preserve me');
    vi.resetModules();
    const fallback = await import('../../src/lib/projectIndexedDbAutosave.js');
    const reader = await import('../../src/lib/authoring/localWorkspace.js');
    const pointer = JSON.parse(await fallback.loadProjectIndexedDbAutosave());
    expect(await reader.restoreAuthorWorkspace(pointer)).toEqual(snapshot);
    await reader.saveAuthorWorkspaceForResume({ ...snapshot, text: 'Teacher edit after reload' }, storage);
    expect((await reader.restoreAuthorWorkspace(JSON.parse(await fallback.loadProjectIndexedDbAutosave()))).text).toBe(
      'Teacher edit after reload',
    );
  } finally {
    vi.unstubAllGlobals();
  }
});

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

it('resumes a cloud/file snapshot opened after reload and rejects edits from the old tab', async () => {
  vi.stubGlobal('indexedDB', indexedDB);
  const values = new Map();
  const storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) };
  try {
    vi.resetModules();
    const oldTab = await import('../../src/lib/authoring/localWorkspace.js');
    const snapshot = {
      courseMap: { courseName: 'Original local course', authoringV2: { applicationId: id() } },
      text: 'original',
    };
    await oldTab.saveAuthorWorkspaceForResume(snapshot, storage);
    vi.resetModules();
    const cloudTab = await import('../../src/lib/authoring/localWorkspace.js');
    const cloudSnapshot = { ...snapshot, text: 'Explicitly opened cloud content', localCloudOwnerUid: 'owner' };
    await cloudTab.prepareAuthorWorkspaceRestore(cloudSnapshot);
    await cloudTab.saveAuthorWorkspaceForResume(cloudSnapshot, storage);
    await expect(oldTab.saveAuthorWorkspace({ ...snapshot, text: 'stale background edit' })).rejects.toThrow(
      'Another tab',
    );
    vi.resetModules();
    const resumed = await import('../../src/lib/authoring/localWorkspace.js');
    expect(await resumed.restoreAuthorWorkspace(JSON.parse(values.get('coursemapper-project')))).toEqual(cloudSnapshot);
    await resumed.saveAuthorWorkspace({ ...cloudSnapshot, text: 'Teacher edit after Resume' });
  } finally {
    vi.unstubAllGlobals();
  }
});

it('still rejects an intervening edit after preparing an explicit restore', async () => {
  vi.stubGlobal('indexedDB', indexedDB);
  try {
    vi.resetModules();
    const first = await import('../../src/lib/authoring/localWorkspace.js');
    const snapshot = { courseMap: { courseName: 'Shared', authoringV2: { applicationId: id() } }, text: 'original' };
    await first.saveAuthorWorkspace(snapshot);
    vi.resetModules();
    const opener = await import('../../src/lib/authoring/localWorkspace.js');
    await opener.prepareAuthorWorkspaceRestore(snapshot);
    await first.saveAuthorWorkspace({ ...snapshot, text: 'Newer edit while cloud opens' });
    await expect(opener.saveAuthorWorkspace(snapshot)).rejects.toThrow('Another tab');
  } finally {
    vi.unstubAllGlobals();
  }
});
