import { createIndexedDbStore } from './indexedDbStore.js';
import { assert } from '../authoringCore/primitives.js';
import { saveProjectIndexedDbAutosave } from '../projectIndexedDbAutosave.js';
const store = createIndexedDbStore();
const versions = new Map();
let queue = Promise.resolve();
export function saveAuthorWorkspace(snapshot) {
  const next = queue.catch(() => {}).then(() => save(snapshot));
  queue = next;
  return next;
}
export async function saveAuthorWorkspaceForResume(snapshot, storage = globalThis.localStorage) {
  const pointer = await saveAuthorWorkspace(snapshot);
  await publishAuthorWorkspacePointer(pointer, storage);
  return pointer;
}
export async function publishAuthorWorkspacePointer(pointer, storage = globalThis.localStorage) {
  const payload = JSON.stringify(pointer);
  try {
    storage.setItem('coursemapper-project', payload);
  } catch {
    // Reuse the normal Resume fallback when localStorage has no space even
    // for a small marker. Commit the new pointer before removing the old one.
    const previousMarker = storage.getItem('coursemapper-project');
    await saveProjectIndexedDbAutosave(payload);
    // Another project may have saved while the fallback transaction awaited.
    // Only retire the marker this attempt actually replaced.
    if (storage.getItem('coursemapper-project') === previousMarker) storage.removeItem('coursemapper-project');
  }
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
/** Explicit cloud/file opens establish a new local editing baseline. Autosave
 * itself must never adopt a revision it has not read. */
export async function prepareAuthorWorkspaceRestore(snapshot) {
  const applicationId = snapshot?.courseMap?.authoringV2?.applicationId;
  if (!applicationId) return;
  await queue.catch(() => {});
  const key = `workspace:${applicationId}`;
  const current = await store.get(key);
  versions.set(key, current?.storageVersion ?? null);
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
