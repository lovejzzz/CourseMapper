import { assert, hash } from '../authoringCore/primitives.js';
import { contentBase } from '../authoringCore/service.js';
import { restoreAuthorWorkspace } from './localWorkspace.js';

export async function readRemoteApplication(store, uid) {
  const pointer = (await store.get(`pendingRemoteApplication:${uid}`)) || (await store.get('pendingRemoteApplication'));
  assert(pointer?.owner === uid, 'NOT_FOUND', 'No saved remote application for this account.');
  const application = await store.get(`remoteApplication:${pointer.id}`);
  assert(
    application?.owner === uid && application.snapshot,
    'MISSING_CONTENT',
    'The saved remote application is unavailable.',
  );
  return application;
}

export async function recoverRemoteApplication({
  store,
  uid,
  getCurrent,
  isCurrent = () => true,
  loadWorkspace = (key) => restoreAuthorWorkspace({ authoringWorkspaceKey: key }),
}) {
  const before = getCurrent();
  const beforeHash = await hash(contentBase(before));
  const application = await readRemoteApplication(store, uid);
  assert(
    application.phase !== 'cancelled',
    'APPLICATION_CANCELLED',
    'This application attempt was discarded. Review the draft again.',
  );
  assert(
    application.phase !== 'prepared',
    'RESERVATION_REQUIRED',
    'Resume the saved reservation before recovering this application.',
  );
  assert(isCurrent(), 'ACCOUNT_CHANGED', 'The signed-in account changed. Open recovery again.');
  if (before?.courseMap?.authoringV2?.applicationId === application.id) {
    assert(
      getCurrent()?.courseMap?.authoringV2?.applicationId === application.id,
      'WORKSPACE_CHANGED',
      'The course changed during recovery. Try again.',
    );
    return { snapshot: getCurrent(), alreadyOpen: true };
  }
  assert(
    !before ||
      ((!before.projectId || before.projectId === application.snapshot.projectId) &&
        beforeHash === (await hash(contentBase(application.before)))),
    'WORKSPACE_CHANGED',
    'Save and close the current course before recovering a different application.',
  );
  const key = `workspace:${application.id}`;
  const edited = await store.get(key);
  const snapshot = edited ? await loadWorkspace(key) : application.snapshot;
  assert(
    snapshot?.courseMap?.authoringV2?.applicationId === application.id,
    'MISSING_CONTENT',
    'The saved application identity does not match.',
  );
  assert(isCurrent(), 'ACCOUNT_CHANGED', 'The signed-in account changed. Open recovery again.');
  assert(
    (await hash(contentBase(getCurrent()))) === beforeHash,
    'WORKSPACE_CHANGED',
    'The course changed during recovery. Try again.',
  );
  return { snapshot, alreadyOpen: false };
}

// An API result is usable only by the account that initiated it. The guard is
// checked after token refresh and after body parsing, not just before fetch.
export async function callAccountApi({ endpoint, user, getUid, path, body, fetch: fetchImpl = globalThis.fetch }) {
  const uid = user?.uid;
  assert(uid, 'UNAUTHENTICATED', 'Sign in to CourseMapper first.');
  const current = () => assert(getUid() === uid, 'ACCOUNT_CHANGED', 'The signed-in account changed. Try again.');
  const token = await user.getIdToken(path.startsWith('connection/'));
  current();
  const response = await fetchImpl(`${endpoint}/api/authoring/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  current();
  assert(
    response.ok && result.ok,
    result.error?.code || 'REMOTE_ERROR',
    result.error?.message || 'The exchange request failed.',
  );
  return result.data;
}
