import React from 'react';
import { summarizeLandingAgentContextMessage } from '../../lib/landingAgentContext';

function FilePill({ name }) {
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full border border-indigo-100 bg-white/75 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
      <svg className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2.2}
          d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5A3.375 3.375 0 0 0 10.125 2.25H6.75A2.25 2.25 0 0 0 4.5 7.875v12.75A2.25 2.25 0 0 0 6.75 22.875h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.375Z"
        />
      </svg>
      <span className="truncate">{name}</span>
    </span>
  );
}

export default function LandingContextCard({ message }) {
  const summary = summarizeLandingAgentContextMessage(message);
  if (!summary.hasContext) return null;

  const hiddenFileText =
    summary.hiddenFileCount > 0
      ? `+${summary.hiddenFileCount} more file${summary.hiddenFileCount === 1 ? '' : 's'}`
      : '';
  const sourceCount = summary.materialNoteCount || summary.materialNotes.length;

  return (
    <div data-testid="landing-context-card" className="flex justify-start animate-spring-in">
      <div className="ml-8 max-w-[92%] rounded-xl border border-indigo-100 bg-indigo-50/65 px-3 py-2.5 text-[12px] text-slate-600 shadow-sm">
        <div className="flex min-w-0 items-start gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/85 text-indigo-600 shadow-sm">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.2}
                d="M12 6v6l4 2m6-2a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z"
              />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-bold text-indigo-800">Starting brief</span>
              {summary.fileCount > 0 && (
                <span className="rounded-full bg-white/75 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
                  {summary.fileCount} material{summary.fileCount === 1 ? '' : 's'}
                </span>
              )}
              {sourceCount > 0 && (
                <span className="rounded-full bg-white/75 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
                  {sourceCount} source note{sourceCount === 1 ? '' : 's'}
                </span>
              )}
            </div>

            {summary.promptExcerpt && (
              <p className="mt-1.5 line-clamp-3 text-[12px] leading-snug text-slate-700">{summary.promptExcerpt}</p>
            )}

            {(summary.fileNames.length > 0 || hiddenFileText) && (
              <div className="mt-2 flex min-w-0 flex-wrap gap-1.5">
                {summary.fileNames.map((name) => (
                  <FilePill key={name} name={name} />
                ))}
                {hiddenFileText && <FilePill name={hiddenFileText} />}
              </div>
            )}

            {summary.materialNotes.length > 0 && (
              <div className="mt-2 space-y-1 border-t border-indigo-100 pt-2">
                {summary.materialNotes.slice(0, 2).map((note) => (
                  <div key={note.name} className="text-[11px] leading-snug text-slate-600">
                    <span className="font-bold text-slate-700">{note.name}: </span>
                    {note.excerpt}
                  </div>
                ))}
                {summary.materialNotes.length > 2 && (
                  <div className="text-[11px] font-semibold text-slate-400">
                    +{summary.materialNotes.length - 2} more source note
                    {summary.materialNotes.length - 2 === 1 ? '' : 's'}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
