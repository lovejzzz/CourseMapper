import { connectIdentity } from '../../lib/authoring/identityLink.js';
import { authoringFlags } from '../../lib/authoring/featureFlags.js';
import RequirementsEditor from './RequirementsEditor';
import EmailSignInButton from '../EmailSignInButton';
import SourceEditor from './SourceEditor';
import {
  prepareRemoteApplication,
  confirmRemoteReservation,
  cancelPreparedApplication,
} from '../../lib/authoring/remoteApplication.js';
import { callAccountApi, readRemoteApplication, recoverRemoteApplication } from '../../lib/authoring/remoteRecovery.js';
import GrantEditor from './GrantEditor';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { previewApplication } from '../../lib/authoring/application';
import { contentBase } from '../../lib/authoringCore/service';
import { assert, hash } from '../../lib/authoringCore/core';
const endpoint = import.meta.env.VITE_AUTHORING_EXCHANGE_URL;
const button = 'rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-40';
export default function RemoteAuthoringSection({ store, workspace, workspaceFiles, onApply, localRecord }) {
  const { user, signInWithGoogle } = useAuth();
  const account = useRef(user?.uid);
  account.current = user?.uid;
  const [requests, setRequests] = useState([]);
  const [record, setRecord] = useState(null);
  const [draftId, setDraftId] = useState('');
  const [preview, setPreview] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setRequests([]);
    setRecord(null);
    setDraftId('');
    setPreview(null);
    setMessage('');
  }, [user?.uid]);
  async function api(path, body) {
    return callAccountApi({ endpoint, user, getUid: () => account.current, path, body });
  }
  async function run(fn) {
    setBusy(true);
    setMessage('');
    try {
      await fn();
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function refreshRequests() {
    const all = [];
    let cursor;
    do {
      const page = await api('manage', cursor ? { cursor } : {});
      all.push(...page.requests);
      cursor = page.cursor;
    } while (cursor);
    setRequests(all);
  }
  async function report(application) {
    assert(
      !['prepared', 'cancelled'].includes(application.phase),
      'RESERVATION_REQUIRED',
      'Resume the interrupted application before reporting its receipt.',
    );
    await api('receipt', {
      requestId: application.requestId,
      draftId: application.draftId,
      applicationId: application.id,
      contentHash: application.appliedHash,
    });
    const next = { ...application, reportPending: false, storageVersion: application.storageVersion + 1 };
    await store.cas(`remoteApplication:${application.id}`, application.storageVersion, next);
    setMessage('Applied locally. The remote draft receipt is confirmed. Cloud project sync is separate.');
  }
  async function apply() {
    assert(!workspace.current?.isBusy?.(), 'WORKSPACE_BUSY', 'Wait for the current course operation to finish.');
    const current = workspace.current?.getSnapshot?.() || null;
    assert(
      preview && preview.conflicts.length === 0 && (await hash(contentBase(current))) === preview.currentHash,
      'WORKSPACE_CHANGED',
      'Preview the current course again.',
    );
    const fresh = await api('read', { requestId: record.id });
    assert(
      fresh.storageVersion === preview.requestVersion && fresh.drafts[draftId]?.revision === preview.draftRevision,
      'STALE_PREVIEW',
      'The remote draft changed. Refresh it.',
    );
    const intent = await prepareRemoteApplication({
      store,
      uid: user.uid,
      requestId: record.id,
      draftId,
      preview,
      current,
    });
    const application = await confirmRemoteReservation({
      store,
      application: intent,
      api,
      getCurrent: () => workspace.current?.getSnapshot?.() || null,
      isCurrent: () => account.current === user.uid,
    });
    const snapshot = application.snapshot;
    await onApply(snapshot);
    setPreview(null);
    try {
      await report(application);
    } catch {
      setMessage(
        'Applied and saved locally. Receipt delivery is pending; use Retry receipt. Do not apply the draft again.',
      );
    }
  }
  if (!endpoint) return null;
  return (
    <section className="my-4 space-y-3 rounded-lg border border-slate-200 p-3" aria-label="Remote AI drafts">
      <h3 className="font-semibold">Connected AI drafts</h3>
      {!user ? (
        <button className={button} onClick={signInWithGoogle}>
          Sign in to review remote drafts
        </button>
      ) : (
        <fieldset disabled={busy} className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button className={button} onClick={signInWithGoogle}>
              Sign in again to manage AI connections
            </button>
            <EmailSignInButton reauthenticate key={user.uid} />
            <button
              className={button}
              onClick={() => {
                const popup = window.open('about:blank', 'coursemapper-identity-link', 'popup,width=520,height=720');
                run(async () => {
                  await connectIdentity({ api, popup });
                  setMessage('AI identity connected. Sign in with this same identity in your AI app.');
                });
              }}
            >
              Connect AI identity
            </button>
            <button
              className={button}
              onClick={() =>
                run(async () => {
                  const status = await api('connection/status', {});
                  setMessage(status.linked ? 'An AI identity is connected.' : 'No AI identity is connected.');
                })
              }
            >
              Check AI connection
            </button>
            <button
              className={button}
              onClick={() =>
                run(async () => {
                  await api('connection/revoke', {});
                  setMessage('AI identity disconnected. Remote access is revoked; saved courses remain available.');
                })
              }
            >
              Disconnect AI identity
            </button>

            <button className={button} onClick={() => run(refreshRequests)}>
              Refresh remote requests
            </button>
            {localRecord && (
              <button
                className={button}
                onClick={() =>
                  run(async () => {
                    await api('share', {
                      request: localRecord.request,
                      sources: localRecord.sources,
                      base: localRecord.base,
                      idempotencyKey: localRecord.id,
                    });
                    setMessage('The selected request, source text and course baseline were shared with the exchange.');
                  })
                }
              >
                Share this request and selected content
              </button>
            )}
          </div>
          <select
            aria-label="Remote requests"
            className="w-full rounded border p-2"
            onChange={(e) =>
              run(async () => {
                const r = await api('read', { requestId: e.target.value });
                setRecord(r);
                setDraftId('');
                setPreview(null);
              })
            }
            defaultValue=""
          >
            <option value="" disabled>
              Select a shared request
            </option>
            {requests.map((r) => (
              <option key={r.requestId} value={r.requestId}>
                {r.title}
                {r.revoked ? ' · revoked' : r.expiresAt <= Date.now() ? ' · expired' : ''}
              </option>
            ))}
          </select>
          {record && (
            <>
              <RequirementsEditor
                key={`requirements:${record.id}:${record.storageVersion}`}
                record={record}
                onSave={(changes) =>
                  run(async () => {
                    const next = await api('requirements', {
                      requestId: record.id,
                      expectedStorageVersion: record.storageVersion,
                      changes,
                    });
                    setRecord(next);
                    setDraftId('');
                    setPreview(null);
                    setMessage('Requirements updated. The AI must create a fresh draft with the current contracts.');
                  })
                }
              />
              <SourceEditor
                workspaceFiles={workspaceFiles}
                key={`${record.id}:${record.storageVersion}`}
                record={record}
                onSave={(sources) =>
                  run(async () => {
                    const next = await api('sources', {
                      requestId: record.id,
                      expectedStorageVersion: record.storageVersion,
                      sources,
                    });
                    setRecord(next);
                    setPreview(null);
                    setMessage(
                      'Shared sources updated. The AI must refresh contracts and revise outdated references before review.',
                    );
                  })
                }
              />
              <select
                aria-label="Remote drafts"
                className="w-full rounded border p-2"
                value={draftId}
                onChange={(e) => {
                  setDraftId(e.target.value);
                  setPreview(null);
                }}
              >
                <option value="">Select a received draft</option>
                {Object.values(record.drafts).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.plan?.title || 'Draft'} · {d.state}
                  </option>
                ))}
              </select>
              <button
                className={button}
                onClick={() =>
                  run(async () => {
                    await api('revoke', { requestId: record.id });
                    setRecord(null);
                    setMessage('Remote access revoked.');
                  })
                }
              >
                Revoke remote access
              </button>
              <button
                className={button}
                onClick={() =>
                  run(async () => {
                    if (
                      !window.confirm(
                        'Delete this shared request and its drafts? Applied courses and copies in your AI conversation will remain.',
                      )
                    )
                      return;
                    await api('delete', { requestId: record.id, expectedStorageVersion: record.storageVersion });
                    setRecord(null);
                    setDraftId('');
                    setPreview(null);
                    await refreshRequests();
                    setMessage(
                      'Shared request access removed. Stored server copies are removed when retention cleanup runs.',
                    );
                  })
                }
              >
                Delete shared request and drafts
              </button>
            </>
          )}
          {record && (
            <GrantEditor
              record={record}
              draftId={draftId}
              onSave={(selection) =>
                run(async () => {
                  await api('grant', {
                    requestId: record.id,
                    expectedStorageVersion: record.storageVersion,
                    selection,
                  });
                  setRecord(await api('read', { requestId: record.id }));
                  setPreview(null);
                  setMessage(
                    selection ? 'Remote AI access limited to your selection.' : 'Full request access restored.',
                  );
                })
              }
            />
          )}
          {draftId && (
            <button
              className={button}
              onClick={() =>
                run(async () => {
                  const fresh = await api('read', { requestId: record.id });
                  setRecord(fresh);
                  setPreview(await previewApplication(fresh, draftId, workspace.current?.getSnapshot?.() || null));
                })
              }
            >
              Review against current course
            </button>
          )}
          {preview && (
            <>
              <p className="text-sm">
                {preview.conflicts.length
                  ? `${preview.conflicts.length} conflicts protect your edits. Revise the draft.`
                  : 'No concurrent teacher-edit conflicts. Review the material below.'}
              </p>
              <details>
                <summary>Proposed materials</summary>
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap text-xs">
                  {JSON.stringify(
                    Object.fromEntries(Object.entries(preview.snapshot.deliverables).map(([k, v]) => [k, v.data])),
                    null,
                    2,
                  )}
                </pre>
              </details>
              <button
                className={button}
                disabled={!authoringFlags.apply || !!preview.conflicts.length}
                onClick={() => run(apply)}
              >
                Apply reviewed remote draft
              </button>
            </>
          )}
          <button
            className={button}
            onClick={() =>
              run(async () => {
                const saved = await readRemoteApplication(store, user.uid);
                assert(account.current === user.uid, 'ACCOUNT_CHANGED', 'The signed-in account changed. Try again.');
                await report(saved);
              })
            }
          >
            Retry receipt
          </button>
          <button
            className={button}
            onClick={() =>
              run(async () => {
                const saved = await readRemoteApplication(store, user.uid);
                if (saved.phase === 'prepared') {
                  await confirmRemoteReservation({
                    store,
                    application: saved,
                    api,
                    getCurrent: () => workspace.current?.getSnapshot?.() || null,
                    isCurrent: () => account.current === user.uid,
                  });
                }
                const recovered = await recoverRemoteApplication({
                  store,
                  uid: user.uid,
                  getCurrent: () => workspace.current?.getSnapshot?.() || null,
                  isCurrent: () => account.current === user.uid,
                });
                assert(account.current === user.uid, 'ACCOUNT_CHANGED', 'The signed-in account changed. Try again.');
                if (!recovered.alreadyOpen) await onApply(recovered.snapshot);
                setMessage(
                  recovered.alreadyOpen
                    ? 'This application is already open. Your current edits were preserved.'
                    : 'Recovered the latest locally saved application and teacher edits.',
                );
              })
            }
          >
            Recover remote application
          </button>
          <button
            className={button}
            onClick={() =>
              run(async () => {
                const saved = await readRemoteApplication(store, user.uid);
                await cancelPreparedApplication({ store, application: saved, api });
                setMessage(
                  'Uncommitted attempt discarded. The server will reject delayed reservation requests for that ID.',
                );
              })
            }
          >
            Discard uncommitted attempt
          </button>
        </fieldset>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </section>
  );
}
