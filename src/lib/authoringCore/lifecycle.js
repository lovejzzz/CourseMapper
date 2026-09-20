import { assert } from './primitives.js';
export async function deleteOwnedRequest(store, key, expected, uid) {
  if (store.deleteRequest) return store.deleteRequest(key, expected, uid);
  const record = await store.get(key, uid);
  assert(record?.owner === uid, 'NOT_FOUND', 'Request is not available.');
  if (record.deleted) return { deleted: true };
  assert(record.storageVersion === expected, 'REVISION_CONFLICT', 'Request changed. Refresh before deleting.');
  await store.cas(
    key,
    expected,
    { id: key, owner: uid, deleted: true, revoked: true, storageVersion: expected + 1 },
    uid,
  );
  return { deleted: true };
}
