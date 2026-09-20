import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ docs: new Map() }));
vi.mock('firebase/firestore', () => {
  const read = (key) => ({ exists: () => state.docs.has(key), data: () => state.docs.get(key) });
  return {
    doc: (_db, ...parts) => parts.join('/'),
    getDoc: async (key) => read(key),
    setDoc: async (key, value) => state.docs.set(key, value),
    serverTimestamp: () => ({ toMillis: () => 10 }),
    runTransaction: async (_db, fn) =>
      fn({ get: async (key) => read(key), set: (key, value) => state.docs.set(key, value) }),
  };
});
beforeEach(() => {
  state.docs.clear();
  vi.resetModules();
});
const snapshot = { courseMap: { courseName: 'Reviewed course' }, requiredCapabilities: ['authored-content-v2'] };
it('restores the persisted cloud baseline after reload and still rejects a later device write', async () => {
  const first = await import('../../src/lib/authoring/cloudProject.js');
  await first.saveAuthoredCloudProject({}, 'owner', 'course', snapshot);
  const saved = JSON.parse(JSON.stringify(first.cloudVersionForResume('owner', 'course')));
  vi.resetModules();
  const reloaded = await import('../../src/lib/authoring/cloudProject.js');
  await expect(reloaded.saveAuthoredCloudProject({}, 'owner', 'course', snapshot)).rejects.toThrow('another device');
  expect(reloaded.restoreCloudVersionForResume('owner', 'course', saved)).toBe(true);
  await expect(reloaded.saveAuthoredCloudProject({}, 'owner', 'course', snapshot)).resolves.toBe(2);
  const root = state.docs.get('users/owner/projects/course');
  state.docs.set('users/owner/projects/course', { ...root, authoringRevision: 3 });
  await expect(reloaded.saveAuthoredCloudProject({}, 'owner', 'course', snapshot)).rejects.toThrow('another device');
});
it('never adopts another account, project, or malformed resume baseline', async () => {
  const module = await import('../../src/lib/authoring/cloudProject.js');
  for (const saved of [
    null,
    { uid: 'other', projectId: 'course', revision: 1, updatedAt: null },
    { uid: 'owner', projectId: 'other', revision: 1, updatedAt: null },
    { uid: 'owner', projectId: 'course', revision: -1, updatedAt: null },
  ])
    expect(module.restoreCloudVersionForResume('owner', 'course', saved)).toBe(false);
  expect(module.cloudVersionForResume('owner', 'course')).toBeNull();
});
