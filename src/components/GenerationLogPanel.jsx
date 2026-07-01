import React, { useState } from 'react';

const typeStyles = {
  success: 'text-emerald-700 bg-emerald-50/60',
  warning: 'text-amber-700 bg-amber-50/60',
  error: 'text-red-600 bg-red-50/60',
  switch: 'text-indigo-700 bg-indigo-50/60',
  info: 'text-slate-600 bg-slate-50/60',
};

const typeIcons = {
  success: (
    <svg className="w-3 h-3 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  ),
  warning: (
    <svg className="w-3 h-3 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01" />
      <circle cx="12" cy="12" r="9" strokeWidth={2} />
    </svg>
  ),
  error: (
    <svg className="w-3 h-3 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  switch: (
    <svg className="w-3 h-3 text-indigo-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
      />
    </svg>
  ),
  info: (
    <svg className="w-3 h-3 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z"
      />
    </svg>
  ),
};

export default function GenerationLogPanel({ entries, defaultCollapsed = false }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  if (!entries || entries.length === 0) return null;

  // Determine which entries are "done" — success entries that follow a completed step
  // e.g. "Added 5 lessons" after "Expected 14 but got 9 — auto-completing"
  const doneIndices = new Set();
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    // A success entry after a warning (auto-completing) means that step is done
    if (e.type === 'success' && i > 0 && entries[i - 1].type === 'warning') doneIndices.add(i);
    if (e.type === 'success' && i > 0 && entries[i - 1].type === 'switch') doneIndices.add(i);
    // Mark the warning itself as done if a success follows it
    if (e.type === 'success' && i > 0 && (entries[i - 1].type === 'warning' || entries[i - 1].type === 'switch'))
      doneIndices.add(i - 1);
  }

  return (
    <div className="mt-3 ml-10 animate-spring-in">
      <div className="rounded-squircle-xs border border-slate-200/50 bg-slate-50/40 overflow-hidden">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full px-3 py-1.5 border-b border-slate-200/40 flex items-center gap-1.5 hover:bg-slate-100/40 transition-colors duration-150"
          aria-label={collapsed ? 'Expand generation log' : 'Collapse generation log'}
          aria-expanded={!collapsed}
        >
          <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Generation Log</span>
          {/* Download JSON button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              const payload = {
                exportedAt: new Date().toISOString(),
                entryCount: entries.length,
                entries: entries.map((en, i) => ({
                  index: i,
                  type: en.type,
                  message: en.message,
                  at: en.at ? new Date(en.at).toISOString() : null,
                })),
              };
              const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `generation-log-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            title="Download generation log as JSON"
            aria-label="Download generation log as JSON"
            className="ml-1 p-0.5 rounded hover:bg-slate-200/60 transition-colors duration-150 text-slate-400 hover:text-slate-600"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
          </button>
          <svg
            className={`w-3 h-3 text-slate-400 ml-auto transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {!collapsed && (
          <div className="divide-y divide-slate-100/60">
            {entries.map((entry, i) => {
              const isDone = doneIndices.has(i);
              return (
                <div
                  key={i}
                  className={`flex items-start gap-2 px-3 py-1.5 ${typeStyles[entry.type] || typeStyles.info} ${isDone ? 'opacity-50' : ''}`}
                >
                  <div className="mt-0.5">{typeIcons[entry.type] || typeIcons.info}</div>
                  <div className="flex-1 min-w-0">
                    <span className={`text-[11px] font-semibold ${isDone ? 'line-through' : ''}`}>{entry.model}</span>
                    <span className="text-[11px] mx-1.5 opacity-50">—</span>
                    <span className={`text-[11px] ${isDone ? 'line-through' : ''}`}>{entry.message}</span>
                  </div>
                  <span className="text-2xs opacity-40 flex-shrink-0 mt-0.5">{entry.time}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
