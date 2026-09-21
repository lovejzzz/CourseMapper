import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { createCourseMcpService } from '../lib/courseMcp/service';
import { registerCourseTools } from '../lib/courseMcp/webmcp';

export default function CourseMcpPanel({ workspace }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [grant, setGrant] = useState(null);
  const [message, setMessage] = useState('');
  const uid = user?.uid || 'local';
  const supported = typeof document.modelContext?.registerTool === 'function';
  const allowed = !!grant && grant.uid === uid;
  const context = useRef(null);
  context.current = {
    allowed,
    accessKey: allowed ? grant.key : null,
    workspace: workspace.current,
    onChange: setMessage,
  };
  const service = useMemo(
    () => createCourseMcpService(() => ({ ...context.current, workspace: workspace.current })),
    [workspace],
  );
  useEffect(() => registerCourseTools(document, service, setMessage), [service]);
  useEffect(() => {
    setGrant(null);
    setMessage('');
  }, [uid]);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="fixed bottom-4 right-4 z-40 rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-lg"
      >
        MCP{allowed ? ' · connected' : ''}
      </button>
      {open && (
        <section
          aria-label="Course MCP connection"
          className="fixed bottom-20 right-4 z-50 w-[min(420px,calc(100vw-32px))] rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Connect your AI</h2>
            <button type="button" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
          <p className="my-3 text-sm">
            Open a course, enable access below, then ask your AI to read or edit it. Changes appear directly in the
            editor. No separate request or draft is needed.
          </p>
          <p className="my-3 text-sm text-slate-600">
            This connection uses browser WebMCP. Use a browser AI host that supports page tools. It is not a remote MCP
            server URL for ordinary ChatGPT connectors.
          </p>
          {!supported && (
            <p role="status" className="my-3 text-sm">
              This browser does not expose WebMCP page tools. Open EduTool in a supported AI browser to connect.
            </p>
          )}
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={allowed}
              disabled={!supported}
              onChange={(event) => {
                setGrant(event.target.checked ? { uid, key: crypto.randomUUID() } : null);
                setMessage('');
              }}
            />
            Allow MCP to read and edit the open course in this tab
          </label>
          <p className="mt-2 text-xs text-slate-500">
            Includes course text and teaching materials. Access ends when disabled, the page reloads, or the account
            changes. Attachments and account credentials are not shared.
          </p>
          <button
            type="button"
            disabled={!allowed}
            className="mt-4 rounded-lg border px-3 py-2 text-sm disabled:opacity-40"
            onClick={async () => {
              const current = await service.execute('cm_course_read');
              if (!current.ok) {
                setMessage(current.error.message);
                return;
              }
              const result = await service.execute('cm_course_undo', {
                expectedRevision: current.data.revision,
                operationId: crypto.randomUUID(),
              });
              if (!result.ok) setMessage(result.error.message);
            }}
          >
            Undo last MCP edit
          </button>
          {message && (
            <p role="status" className="mt-3 text-sm">
              {message}
            </p>
          )}
        </section>
      )}
    </>
  );
}
