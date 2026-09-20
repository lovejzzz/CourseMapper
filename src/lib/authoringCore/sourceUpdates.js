import { assert, clone, bytes, LIMITS } from './primitives.js';
import { prepareSourceSnapshots } from './sourceSnapshots.js';

// Teacher-only operation: deliberately absent from the model tool catalog.
export async function replaceRequestSources(store, requestId, expected, uid, sources, now = Date.now()) {
  const record = await store.get(requestId, uid);
  assert(record?.owner === uid && !record.deleted, 'NOT_FOUND', 'Request is not available.');
  assert(record.storageVersion === expected, 'REVISION_CONFLICT', 'Sources changed. Refresh the request.');
  assert(!record.revoked && record.expiresAt > now, 'GRANT_REVOKED', 'Request access has expired or been revoked.');
  assert(
    !Object.values(record.drafts).some((draft) => draft.reservation && !draft.application),
    'APPLICATION_LOCKED',
    'Resolve the pending application before changing sources.',
  );
  const next = clone(record);
  next.sources = await prepareSourceSnapshots(sources);
  next.request.sourcePolicy = next.sources.length ? 'explicit-shared-snapshots' : 'no-uploaded-sources';
  next.revision++;
  next.storageVersion++;
  next.grantVersion = (record.grantVersion || 0) + 1;
  if (next.grant) {
    next.grant.sourceIds = next.grant.sourceIds.filter((sourceId) =>
      next.sources.some((source) => source.sourceId === sourceId),
    );
    next.grant.revocationVersion = next.grantVersion;
  }
  for (const draft of Object.values(next.drafts)) {
    if (draft.application || draft.supersededByRequestRevision) continue;
    delete draft.validation;
    delete draft.preview;
    draft.revision++;
    draft.state = 'editing';
  }
  assert(
    bytes(next) <= LIMITS.draftBytes,
    'PAYLOAD_TOO_LARGE',
    'Request storage limit reached. Share fewer sources or create a new request.',
  );
  await store.cas(requestId, expected, next, uid);
  return next;
}
