import React from 'react';
import { resolveLabel } from './constants';

/**
 * ProgressCard — inline generation summary card shown in the chat timeline.
 * Rendered when generation completes or when a notable phase change occurs.
 */
export default function ProgressCard({ data }) {
  if (!data) return null;

  const { phase, deliverables, totalTime, lessonCount, error } = data;

  // Error card
  if (error) {
    return (
      <div className="mx-2 my-1 px-4 py-3 rounded-xl bg-red-50/80 border border-red-200/40 animate-spring-in">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-[13px] font-medium text-red-600">{error}</span>
        </div>
      </div>
    );
  }

  // Completion card
  if (phase === 'complete') {
    const doneCount = deliverables?.filter(d => d.status === 'done').length || 0;
    const totalCount = deliverables?.length || 0;
    const failedCount = deliverables?.filter(d => d.status === 'error').length || 0;
    const timeStr = totalTime
      ? totalTime < 60000
        ? `${(totalTime / 1000).toFixed(0)}s`
        : `${(totalTime / 60000).toFixed(1)}m`
      : null;

    return (
      <div className="mx-2 my-1 px-4 py-3 rounded-xl bg-emerald-50/80 border border-emerald-200/40 animate-spring-in">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
            <svg className="w-3 h-3 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <span className="text-[13px] font-semibold text-emerald-700">Generation complete</span>
          {timeStr && <span className="text-[11px] text-emerald-500 ml-auto">{timeStr}</span>}
        </div>
        <div className="text-[12px] text-emerald-600 space-y-0.5">
          {lessonCount && <p>{lessonCount} lessons generated</p>}
          <p>{doneCount} deliverable{doneCount !== 1 ? 's' : ''} ready{failedCount > 0 ? ` · ${failedCount} failed` : ''}</p>
        </div>
        {deliverables && deliverables.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {deliverables.map(d => (
              <span
                key={d.id}
                className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                  d.status === 'done' ? 'bg-emerald-100/80 text-emerald-700' :
                  d.status === 'error' ? 'bg-red-100/80 text-red-600' :
                  'bg-slate-100/80 text-slate-500'
                }`}
              >
                {d.status === 'done' ? '✓' : d.status === 'error' ? '✗' : '·'} {resolveLabel(d.id)}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Course map ready card
  if (phase === 'courseMapReady') {
    return (
      <div className="mx-2 my-1 px-4 py-3 rounded-xl bg-indigo-50/80 border border-indigo-200/40 animate-spring-in">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-[13px] font-medium text-indigo-700">
            Course map ready{lessonCount ? ` — ${lessonCount} lessons` : ''}
          </span>
        </div>
      </div>
    );
  }

  return null;
}
