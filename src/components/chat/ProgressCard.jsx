import React from 'react';
import { resolveLabel } from './constants';

// ── Starter icon (matches MessageList's StarterIcon) ──────────────────────────
function StarterIcon({ type }) {
  if (type === 'plus') return (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
  if (type === 'search') return (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
  if (type === 'edit') return (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  );
  return (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  );
}

/**
 * ProgressCard — inline generation summary card shown in the chat timeline.
 * Rendered when generation completes or when a notable phase change occurs.
 */
export default function ProgressCard({ data, onSuggestionClick }) {
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
    const failedCount = deliverables?.filter(d => d.status === 'error').length || 0;
    const timeStr = totalTime
      ? totalTime < 60000
        ? `${(totalTime / 1000).toFixed(0)}s`
        : `${(totalTime / 60000).toFixed(1)}m`
      : null;

    return (
      <div className="animate-spring-in">
        <div className="mx-2 my-1 px-4 py-3 rounded-xl bg-emerald-50/80 border border-emerald-200/40">
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

        {/* Agent greeting + starters after completion summary */}
        {data.greeting && (
          <div className="flex items-start gap-2.5 mx-1 mt-2 mb-2">
            <div className="w-6 h-6 mt-0.5 rounded-lg bg-gradient-to-br from-indigo-500/10 to-violet-500/10 flex items-center justify-center flex-shrink-0">
              <svg className="w-3 h-3 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <div className="bg-white/60 border border-slate-200/30 rounded-xl rounded-tl-md px-3.5 py-2.5 shadow-glass max-w-[88%]">
              <p className="text-[13px] text-slate-600 leading-snug">{data.greeting}</p>
            </div>
          </div>
        )}
        {data.starters?.length > 0 && onSuggestionClick && (
          <div className="ml-9 flex flex-wrap gap-1.5">
            {data.starters.map((s, i) => (
              <button
                key={i}
                onClick={() => onSuggestionClick(s.text)}
                className="tactile inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-slate-600 bg-white/50 border border-slate-200/40 rounded-full shadow-sm hover:bg-indigo-50/70 hover:border-indigo-200/50 hover:text-indigo-700 transition-all duration-200"
              >
                <span className="text-slate-400">
                  <StarterIcon type={s.icon} />
                </span>
                {s.text}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Course map ready card — includes greeting + starter prompts
  if (phase === 'courseMapReady') {
    return (
      <div className="mx-1 my-1 animate-spring-in">
        {/* Notification badge */}
        <div className="flex items-center gap-2 mb-2 ml-1">
          <div className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center">
            <svg className="w-3 h-3 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <span className="text-[12px] font-semibold text-indigo-600">
            Course map ready{lessonCount ? ` — ${lessonCount} lessons` : ''}
          </span>
        </div>

        {/* Greeting bubble (like opener) */}
        {data.greeting && (
          <div className="flex items-start gap-2.5 mb-2">
            <div className="w-6 h-6 mt-0.5 rounded-lg bg-gradient-to-br from-indigo-500/10 to-violet-500/10 flex items-center justify-center flex-shrink-0">
              <svg className="w-3 h-3 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <div className="bg-white/60 border border-slate-200/30 rounded-xl rounded-tl-md px-3.5 py-2.5 shadow-glass max-w-[88%]">
              <p className="text-[13px] text-slate-600 leading-snug">{data.greeting}</p>
            </div>
          </div>
        )}

        {/* Starter prompts */}
        {data.starters?.length > 0 && onSuggestionClick && (
          <div className="ml-8 flex flex-wrap gap-1.5">
            {data.starters.map((s, i) => (
              <button
                key={i}
                onClick={() => onSuggestionClick(s.text)}
                className="tactile inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-slate-600 bg-white/50 border border-slate-200/40 rounded-full shadow-sm hover:bg-indigo-50/70 hover:border-indigo-200/50 hover:text-indigo-700 transition-all duration-200"
              >
                <span className="text-slate-400">
                  <StarterIcon type={s.icon} />
                </span>
                {s.text}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return null;
}
