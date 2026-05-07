import React from 'react';
import { resolveLabel } from './constants';

/**
 * ProgressCard — inline generation summary card shown in the chat timeline.
 * Rendered when generation completes or when a notable phase change occurs.
 */
export default function ProgressCard({ data, onFixAllClick, onSkipHealthGate }) {
  if (!data) return null;

  const { phase, deliverables, totalTime, lessonCount, error } = data;

  // Error card
  if (error) {
    return (
      <div className="mx-2 my-1 px-4 py-3 rounded-xl bg-red-50/80 border border-red-200/40 animate-spring-in">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span className="text-[13px] font-medium text-red-600">{error}</span>
        </div>
      </div>
    );
  }

  // Health gate card — shown after generation when issues are found
  if (phase === 'healthGate') {
    const { findings = [], errorCount = 0, warningCount = 0, autoFixCount = 0, needsDecisionCount = 0, status } = data;

    // Skipped state — collapsed one-liner
    if (status === 'skipped') {
      return (
        <div className="mx-2 my-1 px-3.5 py-2 rounded-xl bg-slate-50/60 border border-slate-200/30 animate-spring-in">
          <div className="flex items-center gap-2">
            <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="text-[12px] text-slate-500">
              Health check skipped — {errorCount} error{errorCount !== 1 ? 's' : ''}, {warningCount} warning
              {warningCount !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      );
    }

    const isFix = status === 'fixing';
    const top5 = findings.filter((f) => f.severity !== 'info').slice(0, 5);
    const totalIssues = errorCount + warningCount;

    return (
      <div className="mx-2 my-1 rounded-xl bg-amber-50/80 border border-amber-200/40 animate-spring-in overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center">
              <svg className="w-3 h-3 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>
            <span className="text-[13px] font-semibold text-amber-800">
              Course Health Check — {errorCount} error{errorCount !== 1 ? 's' : ''}, {warningCount} warning
              {warningCount !== 1 ? 's' : ''}
            </span>
          </div>
          <p className="text-[12px] text-amber-700/80 ml-7">
            Issues found in your deliverables. Fix them now or skip to review later.
          </p>
        </div>

        {/* Findings preview */}
        {top5.length > 0 && (
          <div className="px-4 pb-2 space-y-1">
            {top5.map((f, i) => (
              <div key={i} className="flex items-start gap-2 text-[11px]">
                <span
                  className={`mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    f.severity === 'error' ? 'bg-red-400' : 'bg-amber-400'
                  }`}
                />
                <span className="text-slate-600">{f.message}</span>
              </div>
            ))}
            {findings.filter((f) => f.severity !== 'info').length > 5 && (
              <p className="text-[11px] text-amber-500 ml-3.5">
                +{findings.filter((f) => f.severity !== 'info').length - 5} more…
              </p>
            )}
          </div>
        )}

        {/* Breakdown + actions */}
        <div className="px-4 pb-3 flex items-center justify-between border-t border-amber-200/40 pt-2.5">
          <div className="text-[11px] text-amber-600 space-x-3">
            {autoFixCount > 0 && <span>{autoFixCount} auto-fixable</span>}
            {needsDecisionCount > 0 && <span>{needsDecisionCount} need review</span>}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onSkipHealthGate}
              disabled={isFix}
              className="px-3 py-1.5 text-[11px] font-medium text-amber-600 hover:text-amber-800 transition-colors disabled:opacity-50"
            >
              Skip
            </button>
            <button
              onClick={onFixAllClick}
              disabled={isFix}
              className="tactile px-3.5 py-1.5 rounded-lg text-[11px] font-semibold text-white bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 shadow-sm transition-all disabled:opacity-50 flex items-center gap-1.5"
            >
              {isFix && (
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {isFix ? 'Fixing…' : `Fix All ${totalIssues} Issue${totalIssues !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Completion card
  if (phase === 'complete') {
    const doneCount = deliverables?.filter((d) => d.status === 'done').length || 0;
    const failedCount = deliverables?.filter((d) => d.status === 'error').length || 0;
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
            <p>
              {doneCount} deliverable{doneCount !== 1 ? 's' : ''} ready
              {failedCount > 0 ? ` · ${failedCount} failed` : ''}
            </p>
          </div>
          {deliverables && deliverables.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {deliverables.map((d) => (
                <span
                  key={d.id}
                  className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                    d.status === 'done'
                      ? 'bg-emerald-100/80 text-emerald-700'
                      : d.status === 'error'
                        ? 'bg-red-100/80 text-red-600'
                        : 'bg-slate-100/80 text-slate-500'
                  }`}
                >
                  {d.status === 'done' ? '✓' : d.status === 'error' ? '✗' : '·'} {resolveLabel(d.id)}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Course map ready card — includes greeting
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
      </div>
    );
  }

  return null;
}
