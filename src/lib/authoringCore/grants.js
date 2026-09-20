import { assert, clone, canonical, FEATURES } from './primitives.js';
const OPERATIONS = [
  'get_context',
  'get_generation_contract',
  'get_draft_status',
  'get_diagnostics',
  'search_content',
  'read_content',
  'submit_lesson_bundle',
  'validate_draft',
  'preview_draft',
];
export async function setRequestGrant(store, requestId, expected, uid, selection, now = Date.now()) {
  const record = await store.get(requestId, uid);
  assert(record?.owner === uid && !record.deleted, 'NOT_FOUND', 'Request is not available.');
  assert(record.storageVersion === expected, 'REVISION_CONFLICT', 'Request changed. Refresh its permissions.');
  const next = clone(record);
  if (selection === null) next.grant = null;
  else {
    assert(
      selection && typeof selection === 'object' && !Array.isArray(selection),
      'INVALID_SCOPE',
      'Choose a revision scope.',
    );
    const draft = record.drafts[selection.draftId];
    assert(
      draft?.plan && !draft.application && !draft.reservation && !draft.supersededByRequestRevision,
      'INVALID_SCOPE',
      'Choose an editable draft with a course plan.',
    );
    assert(
      draft.plan.lessons.every((lesson) => draft.bundles[lesson.id]),
      'INCOMPLETE_DRAFT',
      'Receive all lessons before limiting revision access.',
    );
    for (const [key, allowed, nonempty] of [
      ['lessonIds', draft.plan.lessons.map((l) => l.id), true],
      ['sourceIds', record.sources.map((s) => s.sourceId), false],
      ['featureIds', record.request.requestedFeatures, true],
    ]) {
      assert(
        Array.isArray(selection[key]) &&
          (!nonempty || selection[key].length) &&
          new Set(selection[key]).size === selection[key].length &&
          selection[key].every((id) => allowed.includes(id)),
        'INVALID_SCOPE',
        `Select authorized ${key}.`,
      );
    }
    next.grant = {
      subjectUid: uid,
      requestId,
      draftId: draft.id,
      lessonIds: [...selection.lessonIds],
      sourceIds: [...selection.sourceIds],
      featureIds: [...selection.featureIds],
      operations: OPERATIONS,
      expiresAt: record.expiresAt,
      revocationVersion: (record.grantVersion || 0) + 1,
    };
  }
  assert(
    record.expiresAt > now && !record.revoked,
    'GRANT_REVOKED',
    'Create a new request after access expires or is revoked.',
  );
  next.grantVersion = (record.grantVersion || 0) + 1;
  next.revision++;
  next.storageVersion++;
  for (const draft of Object.values(next.drafts)) {
    if (!draft.application && !draft.reservation && !draft.supersededByRequestRevision) {
      delete draft.validation;
      delete draft.preview;
      draft.state = 'editing';
    }
  }
  await store.cas(requestId, expected, next, uid);
  return next;
}
export function authorizeGrant(record, principal, op, args, now) {
  const grant = record.grant;
  if (!grant) return;
  assert(
    grant.subjectUid === principal.uid && grant.requestId === record.id && grant.expiresAt > now,
    'FORBIDDEN',
    'This request permission is unavailable.',
  );
  assert(grant.operations.includes(op), 'FORBIDDEN', 'The teacher has limited access to selected lesson revisions.');
  if (args.draftId) assert(args.draftId === grant.draftId, 'NOT_FOUND', 'Draft is outside the permitted scope.');
  if (args.lessonId)
    assert(grant.lessonIds.includes(args.lessonId), 'NOT_FOUND', 'Lesson is outside the permitted scope.');
  if (op === 'get_generation_contract')
    assert(args.kind === 'lesson-bundle', 'FORBIDDEN', 'Course structure changes require broader permission.');
}
export function checkFeatureChanges(before, after, features = FEATURES) {
  const fields = {
    lessonPlans: ['concepts', 'examples', 'lessonPlan', 'uncertainties'],
    assignments: ['assessments'],
    rubrics: ['rubric'],
  };
  for (const [feature, key] of [
    ['lessonPlans', 'teacherNotes'],
    ['assignments', 'assignmentBrief'],
  ]) {
    if (!features.includes(feature))
      assert(
        canonical(before.materials[key]) === canonical(after.materials[key]),
        'FORBIDDEN',
        `Changes to ${feature} require broader permission.`,
      );
  }
  for (const fixed of ['lessonId', 'objectiveIds'])
    assert(
      canonical(before[fixed]) === canonical(after[fixed]),
      'FORBIDDEN',
      'Learning objective changes require broader permission.',
    );
  for (const [feature, names] of Object.entries(fields))
    if (!features.includes(feature)) {
      assert(
        names.every((key) => canonical(before[key]) === canonical(after[key])),
        'FORBIDDEN',
        `Changes to ${feature} require broader permission.`,
      );
    }
}

// A restricted revision may retain an unchanged passage citing a source whose
// text is no longer shared. It cannot add/reuse that citation in changed prose.
export function checkUnsharedEvidenceChanges(before, after, sourceIds) {
  if (!after || typeof after !== 'object') return;
  if (Array.isArray(after.evidenceRefs) && after.evidenceRefs.some((ref) => !sourceIds.includes(ref.sourceId))) {
    assert(
      canonical(before) === canonical(after),
      'FORBIDDEN',
      'This passage cites an unshared source. Preserve it unchanged or ask the teacher to share that source.',
    );
    return;
  }
  for (const [key, value] of Object.entries(after)) checkUnsharedEvidenceChanges(before?.[key], value, sourceIds);
}
