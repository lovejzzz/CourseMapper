import { afterEach, expect, it, vi } from 'vitest';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
afterEach(() => {
  vi.doUnmock('../../src/lib/projectIndexedDbAutosave.js');
  vi.resetModules();
});

it('does not remove a newer project marker while an older quota fallback is committing', async () => {
  const commit = deferred();
  const started = deferred();
  vi.doMock('../../src/lib/projectIndexedDbAutosave.js', () => ({
    saveProjectIndexedDbAutosave: async () => {
      started.resolve();
      await commit.promise;
    },
  }));
  const { publishAuthorWorkspacePointer } = await import('../../src/lib/authoring/localWorkspace.js');
  const values = new Map([['coursemapper-project', 'old marker']]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: () => {
      throw new DOMException('Full', 'QuotaExceededError');
    },
    removeItem: (key) => values.delete(key),
  };
  const pending = publishAuthorWorkspacePointer({ authoringWorkspaceKey: 'old-application' }, storage);
  await started.promise;
  // Another project finished a synchronous save while this fallback was pending.
  values.set('coursemapper-project', 'new project marker');
  commit.resolve();
  await pending;
  expect(values.get('coursemapper-project')).toBe('new project marker');
});

it('keeps the previous resume marker if the fallback transaction fails', async () => {
  vi.doMock('../../src/lib/projectIndexedDbAutosave.js', () => ({
    saveProjectIndexedDbAutosave: async () => {
      throw new Error('Disk unavailable');
    },
  }));
  const { publishAuthorWorkspacePointer } = await import('../../src/lib/authoring/localWorkspace.js');
  const storage = {
    getItem: () => 'last durable marker',
    setItem: () => {
      throw new DOMException('Full', 'QuotaExceededError');
    },
    removeItem: vi.fn(),
  };
  await expect(publishAuthorWorkspacePointer({}, storage)).rejects.toThrow('Disk unavailable');
  expect(storage.removeItem).not.toHaveBeenCalled();
});
