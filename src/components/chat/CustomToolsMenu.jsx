/**
 * CustomToolsMenu — dropdown in the ChatPanel header showing the registry of
 * macros the agent has created (via create_tool). Lets the user inspect each
 * macro's plan and delete the ones they don't want anymore.
 */
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { exportCustomTool } from '../../lib/customAgentTools';

// Short example users can drop into the Import textarea so they're not
// staring at an empty box wondering "what do I paste here?". Kept inline so
// the chat bundle doesn't pull in a separate asset.
const EXAMPLE_IMPORT_JSON = JSON.stringify({
  kind: 'coursemapper-macro',
  version: 1,
  tool: {
    name: 'audit_bloom_floor',
    description: 'Validate the course and read a deliverable in one pass.',
    params: { featureId: 'string — deliverable to inspect' },
    plan: [
      { id: 'v', tool: 'validate_course', args: {} },
      { id: 'r', tool: 'read_deliverable', args: { featureId: '{{args.featureId}}' } },
    ],
  },
}, null, 2);

export default function CustomToolsMenu({ tools, onDelete, onImport, syncError }) {
  const [open, setOpen] = useState(false);
  const [expandedName, setExpandedName] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState(null);
  const [copiedName, setCopiedName] = useState(null);
  const menuRef = useRef(null);

  async function handleExport(tool) {
    try {
      const json = exportCustomTool(tool);
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(json);
      } else {
        // Fallback for insecure contexts: dump to a textarea and select it.
        const ta = document.createElement('textarea');
        ta.value = json;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopiedName(tool.name);
      setTimeout(() => setCopiedName(cur => cur === tool.name ? null : cur), 1500);
    } catch (e) {
      setImportError(`Copy failed: ${e.message}`);
    }
  }

  function handleImport() {
    if (!onImport) return;
    const result = onImport(importText);
    if (result?.ok) {
      setImporting(false);
      setImportText('');
      setImportError(null);
    } else {
      setImportError(result?.error || 'Import failed.');
    }
  }

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const count = tools?.length || 0;
  const hasTools = count > 0;
  const sortedTools = useMemo(
    () => [...(tools || [])].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    [tools]
  );
  // A sync error renders a small amber "!" pill next to the count so users
  // can tell cloud sync failed (permission denied, offline, etc.) — hovering
  // shows which macro and which op didn't persist.
  const hasSyncError = !!syncError;

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(v => !v)}
        className={`tactile group flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-semibold border transition-all duration-200 ${
          hasSyncError
            ? 'text-amber-700 bg-amber-50/80 border-amber-200/60 hover:bg-amber-100'
            : hasTools
              ? 'text-violet-700 bg-violet-50/80 border-violet-200/60 hover:bg-violet-100'
              : 'text-slate-400 bg-white/50 border-slate-200/40 hover:text-slate-600 hover:bg-slate-50'
        }`}
        aria-label={`Custom agent tools — ${count} registered${hasSyncError ? ', cloud sync failed' : ''}`}
        aria-expanded={open}
        title={
          hasSyncError
            ? `Cloud sync failed for "${syncError.name}" (${syncError.op}): ${syncError.message}. Local copy is still usable.`
            : hasTools ? `${count} agent-created macro${count === 1 ? '' : 's'}` : 'No macros yet'
        }
      >
        {/* wand/sparkle icon */}
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
        </svg>
        <span>{count}</span>
        {hasSyncError && (
          <span className="ml-0.5 w-3 h-3 rounded-full bg-amber-200 text-amber-800 text-[9px] flex items-center justify-center font-bold" aria-hidden="true">
            !
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-[70vh] overflow-y-auto bg-white/95 backdrop-blur-lg rounded-xl shadow-xl border border-slate-200/60 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="px-4 py-3 border-b border-slate-100">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-slate-700">Agent macros</p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Tools the agent built via <code className="px-1 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px]">create_tool</code>. Session-scoped, synced to your account.
                </p>
              </div>
              {onImport && (
                <button
                  type="button"
                  onClick={() => { setImporting(v => !v); setImportError(null); }}
                  className="flex-shrink-0 text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
                  title="Paste a macro JSON snippet"
                >
                  {importing ? 'Cancel' : 'Import'}
                </button>
              )}
            </div>

            {importing && (
              <div className="mt-2 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] text-slate-500">
                    Paste a macro JSON snippet someone shared, or use <code className="px-1 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px]">Copy JSON</code> on one of your own.
                  </p>
                  <button
                    type="button"
                    onClick={() => { setImportText(EXAMPLE_IMPORT_JSON); setImportError(null); }}
                    className="flex-shrink-0 text-[10px] text-indigo-500 hover:text-indigo-700 underline-offset-2 hover:underline"
                    title="Fill the box with a minimal example macro"
                  >
                    Insert example
                  </button>
                </div>
                <textarea
                  value={importText}
                  onChange={(e) => { setImportText(e.target.value); setImportError(null); }}
                  placeholder='{"kind":"coursemapper-macro","version":1,"tool":{...}}'
                  className="w-full h-24 text-[10px] font-mono p-2 rounded-md border border-slate-200 bg-white/80 text-slate-700 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 resize-none"
                />
                {importError && (
                  <p className="text-[10px] text-red-500">{importError}</p>
                )}
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={!importText.trim()}
                  className="w-full px-3 py-1.5 rounded-md text-[10px] font-semibold text-white bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Register macro
                </button>
              </div>
            )}

            {hasSyncError && (
              <div className="mt-2 p-2 rounded-md bg-amber-50/80 border border-amber-200/60">
                <p className="text-[10px] font-semibold text-amber-700">Cloud sync failed</p>
                <p className="text-[10px] text-amber-600 mt-0.5">
                  <code className="font-mono">{syncError.name}</code> ({syncError.op}) didn't reach the cloud: {syncError.message}. Local copy still works — any future macro save will retry.
                </p>
              </div>
            )}
          </div>

          {!hasTools && (
            <div className="px-4 py-6 text-center">
              <p className="text-[11px] text-slate-500">No macros yet.</p>
              <p className="text-[10px] text-slate-400 mt-1">
                Ask the agent to "make a reusable tool for …" and it'll register one here.
              </p>
            </div>
          )}

          {hasTools && (
            <ul className="py-1">
              {sortedTools.map(tool => {
                const isExpanded = expandedName === tool.name;
                const steps = Array.isArray(tool.plan) ? tool.plan : [];
                return (
                  <li key={tool.name} className="border-b border-slate-100 last:border-b-0">
                    <div className="px-4 py-2 hover:bg-indigo-50/60 transition-colors">
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <button
                            type="button"
                            onClick={() => setExpandedName(isExpanded ? null : tool.name)}
                            className="w-full text-left"
                          >
                            <div className="flex items-center gap-1.5">
                              <code className="text-[11px] font-semibold text-violet-700 truncate">
                                {tool.name}
                              </code>
                              <span className="text-[9px] text-slate-400 font-medium whitespace-nowrap">
                                {steps.length} step{steps.length === 1 ? '' : 's'}
                              </span>
                            </div>
                            {tool.description && (
                              <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">
                                {tool.description}
                              </p>
                            )}
                          </button>

                          {isExpanded && steps.length > 0 && (
                            <ol className="mt-2 pl-3 border-l-2 border-violet-200 space-y-1">
                              {steps.map((s, i) => (
                                <li key={s.id || i} className="text-[10px] text-slate-500">
                                  <span className="font-semibold text-slate-600">{i + 1}.</span>{' '}
                                  <code className="text-violet-600">{s.tool}</code>
                                  {s.id && <span className="text-slate-400"> ({s.id})</span>}
                                </li>
                              ))}
                            </ol>
                          )}
                        </div>

                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => handleExport(tool)}
                            className={`transition-colors p-1 ${
                              copiedName === tool.name
                                ? 'text-emerald-500'
                                : 'text-slate-400 hover:text-indigo-500'
                            }`}
                            aria-label={`Export macro ${tool.name}`}
                            title={copiedName === tool.name ? 'Copied!' : 'Copy JSON to clipboard'}
                          >
                            {copiedName === tool.name ? (
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : (
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-2m-6-9l4-4m0 0l4 4m-4-4v12" />
                              </svg>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`Delete macro "${tool.name}"?`)) onDelete?.(tool.name);
                            }}
                            className="text-slate-400 hover:text-red-500 transition-colors p-1"
                            aria-label={`Delete macro ${tool.name}`}
                            title="Delete macro"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
