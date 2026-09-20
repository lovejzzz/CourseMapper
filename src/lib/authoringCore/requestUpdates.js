import { assert, clone, bytes, LIMITS, requestSchema, safeInput, validateShape } from './core.js';

// Teacher-only; changing requirements never silently expands an AI grant.
export async function updateRequestRequirements(store, requestId, expected, uid, changes, now = Date.now()) {
  const record = await store.get(requestId, uid);
  assert(record?.owner === uid && !record.deleted, 'NOT_FOUND', 'Request is not available.');
  assert(
    record.storageVersion === expected,
    'REVISION_CONFLICT',
    'Request changed. Refresh before editing requirements.',
  );
  assert(!record.revoked && record.expiresAt > now, 'GRANT_REVOKED', 'Request access has expired or been revoked.');
  assert(
    !record.grant,
    'FORBIDDEN',
    'Restore full request access before changing teaching requirements, or create a new request.',
  );
  assert(
    !Object.values(record.drafts).some((draft) => draft.reservation && !draft.application),
    'APPLICATION_LOCKED',
    'Resolve the pending application before changing requirements.',
  );
  const fields = ['title', 'brief', 'learnerProfile', 'language', 'lessonCount', 'sessionMinutes'];
  assert(
    changes &&
      typeof changes === 'object' &&
      !Array.isArray(changes) &&
      Object.keys(changes).length &&
      Object.keys(changes).every((key) => fields.includes(key)),
    'INVALID_INPUT',
    'Only teaching requirements may be changed here.',
  );
  safeInput(changes);
  const request = { ...record.request, ...clone(changes) };
  validateShape(requestSchema, request);
  const next = clone(record);
  next.request = request;
  next.revision++;
  next.storageVersion++;
  next.grantVersion = (record.grantVersion || 0) + 1;
  for (const draft of Object.values(next.drafts)) {
    if (draft.application || draft.supersededByRequestRevision) continue;
    draft.requestBeforeSupersession = clone(record.request);
    draft.requestRevisionBeforeSupersession = record.revision;
    draft.supersededByRequestRevision = next.revision;
    draft.revision++;
    draft.state = 'superseded';
    delete draft.validation;
    delete draft.preview;
  }
  assert(bytes(next) <= LIMITS.draftBytes, 'PAYLOAD_TOO_LARGE', 'Request history is full. Create a new request.');
  await store.cas(requestId, expected, next, uid);
  return next;
}
