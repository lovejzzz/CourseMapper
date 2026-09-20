import { createIndexedDbStore } from './indexedDbStore.js';
import { assert } from '../authoringCore/primitives.js';
const store = createIndexedDbStore();
const versions = new Map();
let queue = Promise.resolve();
export function saveAuthorWorkspace(snapshot) {
  const next = queue.catch(() => {}).then(() => save(snapshot));
  queue = next;
  return next;
}
async function save(snapshot) {
  const key = `workspace:${snapshot.courseMap.authoringV2.applicationId}`;
  const current = await store.get(key);
  assert(
    !current || versions.get(key) === current.storageVersion,
    'REVISION_CONFLICT',
    'Another tab saved this course. Reopen its latest version before saving.',
  );
  const record = { snapshot, storageVersion: (current?.storageVersion ?? -1) + 1 };
  await store.cas(key, current?.storageVersion ?? null, record);
  versions.set(key, record.storageVersion);
  return {
    authoringWorkspaceKey: key,
    courseMap: { courseName: snapshot.courseMap.courseName },
    savedAt: snapshot.savedAt,
  };
}
export async function restoreAuthorWorkspace(pointer) {
  if (!pointer?.authoringWorkspaceKey) return pointer;
  const record = await store.get(pointer.authoringWorkspaceKey);
  assert(
    record?.snapshot,
    'MISSING_CONTENT',
    'Saved author content is missing from this browser. Open your project backup.',
  );
  versions.set(pointer.authoringWorkspaceKey, record.storageVersion);
  return record.snapshot;
}
