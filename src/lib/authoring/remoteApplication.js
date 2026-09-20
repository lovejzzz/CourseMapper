import { authoringFlags } from './featureFlags.js';
import { assert, clone, hash, id } from '../authoringCore/primitives.js';
import { contentBase } from '../authoringCore/service.js';

export async function prepareRemoteApplication({
  store,
  uid,
  requestId,
  draftId,
  preview,
  current,
  applyEnabled = authoringFlags.apply,
}) {
  assert(
    applyEnabled,
    'APPLY_DISABLED',
    'New applications are temporarily disabled. Existing applications can still be recovered.',
  );
  assert(
    preview && !preview.conflicts.length && (await hash(contentBase(current))) === preview.currentHash,
    'WORKSPACE_CHANGED',
    'Preview the current course again.',
  );
  const applicationId = id();
  const snapshot = clone(preview.snapshot);
  snapshot.projectId = current?.projectId || id();
  snapshot.courseMap.authoringV2 = {
    protocolVersion: 'coursemapper.authoring.v2',
    applicationId,
    requestId,
    draftId,
    draftRevision: preview.draftRevision,
    remote: true,
  };
  const application = {
    id: applicationId,
    owner: uid,
    storageVersion: 0,
    requestId,
    draftId,
    snapshot,
    before: clone(current),
    currentHash: preview.currentHash,
    draftRevision: preview.draftRevision,
    appliedHash: await hash(contentBase(snapshot)),
    phase: 'prepared',
    reportPending: true,
  };
  // This durable intent precedes the first network side effect. It is not an
  // applied project and cannot be recovered into the workspace until reserved.
  await store.saveRemoteApplication(application);
  return application;
}

export async function confirmRemoteReservation({ store, application, api, getCurrent, isCurrent = () => true }) {
  const saved = await store.get(`remoteApplication:${application.id}`);
  assert(
    saved?.owner === application.owner && saved.phase === 'prepared',
    'INVALID_STATE',
    'Recover the latest saved application state.',
  );
  const checkCurrent = async () => {
    assert(
      (await hash(contentBase(getCurrent()))) === saved.currentHash,
      'WORKSPACE_CHANGED',
      'The course changed. Save it separately and restore the reviewed baseline before resuming this application.',
    );
    assert(isCurrent(), 'ACCOUNT_CHANGED', 'The signed-in account changed. Recover after signing back in.');
  };
  await checkCurrent();
  await api('reserve', {
    requestId: saved.requestId,
    draftId: saved.draftId,
    draftRevision: saved.draftRevision,
    applicationId: saved.id,
    projectId: saved.snapshot.projectId,
    currentHash: saved.currentHash,
  });
  await checkCurrent();
  const next = { ...saved, phase: 'locally-saved', storageVersion: saved.storageVersion + 1 };
  await store.cas(`remoteApplication:${saved.id}`, saved.storageVersion, next);
  assert(isCurrent(), 'ACCOUNT_CHANGED', 'The signed-in account changed. Recover after signing back in.');
  return next;
}

export async function cancelPreparedApplication({ store, application, api }) {
  const saved = await store.get(`remoteApplication:${application.id}`);
  assert(
    saved?.owner === application.owner && saved.phase === 'prepared',
    'INVALID_STATE',
    'Only an uncommitted local attempt can be discarded.',
  );
  await api('cancel-intent', { requestId: saved.requestId, draftId: saved.draftId, applicationId: saved.id });
  const next = { ...saved, phase: 'cancelled', reportPending: false, storageVersion: saved.storageVersion + 1 };
  await store.cas(`remoteApplication:${saved.id}`, saved.storageVersion, next);
  return next;
}
