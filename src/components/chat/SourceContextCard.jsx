import React from 'react';
import { getAgentSourceContextSummary } from '../../lib/agentSourceContext';

export default function SourceContextCard({ message }) {
  const summary = getAgentSourceContextSummary(message);
  const visibleNames = summary.fileNames || [];
  const hiddenFileText =
    summary.hiddenFileCount > 0
      ? `+${summary.hiddenFileCount} more file${summary.hiddenFileCount === 1 ? '' : 's'}`
      : '';

  return (
    <div data-testid="source-context-card" className="flex justify-start animate-spring-in">
      <div className="ml-8 max-w-[90%] rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-2 text-[12px] text-slate-600 shadow-sm">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white/80 text-sky-600 shadow-sm">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.2}
                d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5A3.375 3.375 0 0 0 10.125 2.25H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
              />
            </svg>
          </span>
          <div className="min-w-0">
            <div className="truncate font-bold text-sky-800">
              {summary.label} - {summary.fileCount || summary.materialNoteCount} material
              {(summary.fileCount || summary.materialNoteCount) === 1 ? '' : 's'}
            </div>
            <div className="truncate text-[11px] font-medium text-slate-500">
              {visibleNames.concat(hiddenFileText ? [hiddenFileText] : []).join(', ')}
            </div>
          </div>
        </div>

        {summary.materialNotes.length > 0 && (
          <div className="mt-2 space-y-1 border-t border-sky-100 pt-2">
            {summary.materialNotes.slice(0, 3).map((note) => (
              <div key={note.name} className="text-[11px] leading-snug text-slate-600">
                <span className="font-bold text-slate-700">{note.name}: </span>
                {note.excerpt}
              </div>
            ))}
            {summary.materialNotes.length > 3 && (
              <div className="text-[11px] font-semibold text-slate-400">
                +{summary.materialNotes.length - 3} more source note
                {summary.materialNotes.length - 3 === 1 ? '' : 's'}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
