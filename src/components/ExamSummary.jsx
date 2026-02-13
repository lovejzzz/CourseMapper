import React, { useState } from 'react';

export default function ExamSummary({ changes, onRetry }) {
  const [expanded, setExpanded] = useState(false);
  const [retrying, setRetrying] = useState(false);
  if (!changes || changes.length === 0) return null;

  // Detect failure marker
  const isFailed = changes.length === 1 && changes[0].startsWith('__EXAM_FAILED__:');
  const failReason = isFailed ? changes[0].replace('__EXAM_FAILED__:', '') : null;

  if (isFailed) {
    return (
      <div className="mt-3 ml-10 animate-spring-in flex items-center gap-2">
        <span className="flex items-center gap-2 text-xs font-semibold text-amber-700 bg-amber-50/80 px-3 py-1.5 rounded-squircle-xs border border-amber-200/50">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          Examination skipped{failReason ? `: ${failReason}` : ''}
        </span>
        {onRetry && (
          <button
            onClick={async () => { setRetrying(true); try { await onRetry(); } finally { setRetrying(false); } }}
            disabled={retrying}
            className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50/80 px-3 py-1.5 rounded-squircle-xs border border-indigo-200/50 hover:bg-indigo-100/80 transition-colors duration-150 disabled:opacity-50"
          >
            {retrying ? (
              <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            {retrying ? 'Retrying...' : 'Retry'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 ml-10 animate-spring-in">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50/80 px-3 py-1.5 rounded-squircle-xs border border-emerald-200/50 hover:bg-emerald-100/80 transition-colors duration-150"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        Examination completed. All {changes.length} fixed
        <svg className={`w-3 h-3 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && (
        <ul className="mt-2 space-y-2 text-[11px] text-emerald-800 bg-emerald-50/50 rounded-squircle-xs p-3 border border-emerald-100/50 max-h-60 overflow-y-auto">
          {changes.map((c, i) => {
            const colonIdx = c.indexOf(': ');
            const hasReason = colonIdx > 0 && colonIdx < 60;
            const location = hasReason ? c.slice(0, colonIdx) : c;
            const reason = hasReason ? c.slice(colonIdx + 2) : null;
            return (
              <li key={i} className="flex items-start gap-1.5">
                <span className="text-emerald-500 mt-0.5 flex-shrink-0">•</span>
                <span>
                  <span className="font-semibold">{location}</span>
                  {reason && <span className="text-emerald-600 block mt-0.5">{reason}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
