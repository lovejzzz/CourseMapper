import { authoringFlags } from './featureFlags.js';
import { assert, clone, hash, id, mergeThreeWay } from '../authoringCore/core.js';
import { contentBase } from '../authoringCore/service.js';
import { projectDraft, preserveAuthoredSnapshot } from '../authoringCore/projector.js';
export async function previewApplication(record, draftId, current) {
  const draft = record.drafts[draftId];
  assert(draft?.preview?.revision === draft.revision, 'STALE_PREVIEW', 'Check and preview this draft again.');
  assert(!draft.application, 'ALREADY_APPLIED', 'This draft has already been applied.');
  const proposed = projectDraft(draft, record.request);
  const base = contentBase(record.base);
  const live = contentBase(current);
  const map = mergeThreeWay(base.courseMap, live.courseMap, proposed.courseMap, '/courseMap');
  const deliverables = { ...clone(live.deliverables) };
  const conflicts = [...map.conflicts];
  for (const [feature, entry] of Object.entries(proposed.deliverables)) {
    const merged = mergeThreeWay(
      base.deliverables[feature]?.data,
      live.deliverables[feature]?.data,
      entry.data,
      `/deliverables/${feature}`,
    );
    deliverables[feature] = {
      ...live.deliverables[feature],
      ...entry,
      data: merged.value,
      authoredContent: { ...entry.authoredContent, teacherOverride: clone(merged.value) },
    };
    conflicts.push(...merged.conflicts);
  }
  return {
    requestVersion: record.storageVersion,
    draftRevision: draft.revision,
    currentHash: await hash(live),
    conflicts,
    snapshot: preserveAuthoredSnapshot({
      ...clone(current || {}),
      courseGraph: null,
      courseMap: map.value,
      deliverables,
      userEdits: clone(live.userEdits),
      selectedFeatures: [
        ...new Set(['courseMap', ...(current?.selectedFeatures || []), ...record.request.requestedFeatures]),
      ],
      hasGenerated: true,
      activeTab: 'lessonPlans',
      executionMode: 'external-agent',
    }),
  };
}
export async function applyLocalDraft({
  store,
  record,
  draftId,
  preview,
  getCurrent,
  applyEnabled = authoringFlags.apply,
}) {
  assert(applyEnabled, 'APPLY_DISABLED', 'New applications are temporarily disabled. Saved courses remain available.');
  assert(
    !preview.conflicts.length,
    'MERGE_CONFLICT',
    'Teacher edits conflict with the draft. Revise the draft before applying.',
  );
  assert(
    (await hash(contentBase(getCurrent()))) === preview.currentHash,
    'WORKSPACE_CHANGED',
    'The course changed. Preview it again.',
  );
  const latest = await store.get(record.id);
  assert(
    latest?.storageVersion === preview.requestVersion && !latest.revoked,
    'REVISION_CONFLICT',
    'Request changed before application.',
  );
  const draft = latest.drafts[draftId];
  assert(
    draft.revision === preview.draftRevision && !draft.application,
    'STALE_PREVIEW',
    'Draft changed before application.',
  );
  const applicationId = id();
  const snapshot = clone(preview.snapshot);
  snapshot.courseMap.authoringV2 = {
    protocolVersion: 'coursemapper.authoring.v2',
    applicationId,
    requestId: record.id,
    draftId,
    draftRevision: draft.revision,
  };
  const application = {
    id: applicationId,
    owner: 'local',
    storageVersion: 0,
    requestId: record.id,
    draftId,
    snapshot,
    before: clone(getCurrent()),
    appliedHash: await hash(contentBase(snapshot)),
    createdAt: Date.now(),
  };
  // Recheck immediately before the transaction after all asynchronous hashes.
  assert(
    (await hash(contentBase(getCurrent()))) === preview.currentHash,
    'WORKSPACE_CHANGED',
    'The course changed. Preview it again.',
  );
  draft.application = { applicationId, revision: draft.revision, localSaved: true, cloudSynced: false };
  draft.state = 'applied';
  latest.storageVersion++;
  await store.apply(record.id, preview.requestVersion, latest, application);
  return application;
}
export async function undoApplication({ store, application, getCurrent }) {
  assert(
    (await hash(contentBase(getCurrent()))) === application.appliedHash,
    'WORKSPACE_CHANGED',
    'Edits made after application must be preserved. Undo is unavailable until they are saved separately.',
  );
  const record = await store.get(application.requestId);
  const version = record.storageVersion;
  record.drafts[application.draftId].state = 'undone';
  record.drafts[application.draftId].application.undone = true;
  record.storageVersion++;
  const inverse = { ...application, id: id(), snapshot: application.before, undoneApplicationId: application.id };
  await store.apply(record.id, version, record, inverse);
  return inverse.snapshot;
}
