import React, { useState } from 'react';
import { resolveLabel } from './constants';

/**
 * ChangeSummaryCard — shown after agent edit tools land. Three possible shapes
 * depending on how the batch went:
 *   - pure success  → emerald card, successes only, Undo button
 *   - pure failure  → red card, failure list, Retry-failed button
 *   - mixed         → amber card, both lists, Keep applied / Retry failed / Undo all
 *
 * Retry-failed emits a silent follow-up message so the agent self-corrects
 * using the exact originalInput for each failed patch. "Keep applied" just
 * dismisses the failure panel locally — no state mutation, the successful
 * edits already landed.
 */
export default function ChangeSummaryCard({ summary, status, onUndo, canUndo, onRetryFailed, onKeep }) {
  const [collapsed, setCollapsed] = useState(false);

  if (!summary) return null;

  const {
    changes = [],
    applied = 0,
    failed = 0,
    failedItems = [],
    toolName,
    message,
  } = summary;

  const hasSuccesses = changes.length > 0;
  const hasFailures = failed > 0 || failedItems.length > 0;
  // Overall mood of the card — tints everything consistently.
  const tone = !hasFailures ? 'success' : !hasSuccesses ? 'error' : 'mixed';
  const styles = TONES[tone];

  // Keep / Retry only make sense while the user hasn't decided yet.
  const decided = status === 'retried' || status === 'kept';

  return (
    <div className={`mx-2 my-1 rounded-xl border shadow-glass animate-spring-in overflow-hidden ${styles.container}`}>
      {/* Header */}
      <button
        onClick={() => setCollapsed(v => !v)}
        className={`w-full px-3.5 py-2 flex items-center gap-2 transition-colors ${styles.header}`}
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Expand change summary' : 'Collapse change summary'}
      >
        <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${styles.iconBg}`}>
          {tone === 'success' ? (
            <svg className={`w-3 h-3 ${styles.iconFg}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className={`w-3 h-3 ${styles.iconFg}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
            </svg>
          )}
        </div>
        <span className={`text-[13px] font-semibold flex-1 text-left ${styles.title}`}>
          {tone === 'success' ? 'Changes applied' : tone === 'error' ? 'Changes failed' : `${applied} applied · ${failed} failed`}
        </span>
        {/* Header-level action shortcut: whichever single action is most useful for the current mood */}
        {!decided && canUndo && onUndo && hasSuccesses && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onUndo(); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onUndo(); } }}
            aria-label={tone === 'mixed' ? 'Undo all changes' : 'Undo last change'}
            className="tactile flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold text-slate-500 hover:text-indigo-600 hover:bg-white/60 transition-all"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" />
            </svg>
            {tone === 'mixed' ? 'Undo all' : 'Undo'}
          </span>
        )}
        <svg
          className={`w-3 h-3 transition-transform duration-200 ${styles.chevron} ${collapsed ? '' : 'rotate-180'}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Body */}
      {!collapsed && (
        <div className={`px-3.5 pb-2.5 border-t ${styles.body}`}>
          {/* Success items */}
          {changes.map((c, i) => (
            <div key={`ok-${i}`} className={`flex items-center gap-2 text-[12px] py-0.5 ${styles.successLine}`}>
              <span className="font-mono text-[11px] opacity-70">
                {c.type === 'added' ? '+' : c.type === 'removed' ? '−' : '~'}
              </span>
              <span>
                {c.type === 'added' ? 'Added' : c.type === 'removed' ? 'Removed' : 'Edited'}{' '}
                {c.count} {resolveLabel(c.featureId)}
                {c.label ? ` — ${c.label}` : ''}
              </span>
            </div>
          ))}

          {/* Failure items — shown with their error message */}
          {failedItems.length > 0 && (
            <div className={`${hasSuccesses ? 'mt-2 pt-2 border-t' : 'mt-1'} ${styles.failSection}`}>
              {hasSuccesses && (
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Didn't apply</p>
              )}
              <ul className="space-y-1">
                {failedItems.map((f, i) => {
                  const feature = f.featureId ? resolveLabel(f.featureId) : 'course map';
                  const lessonHint = typeof f.lessonIndex === 'number' ? ` · Lesson ${f.lessonIndex + 1}` : '';
                  return (
                    <li key={`fail-${i}`} className="text-[11px] text-red-700 leading-relaxed">
                      <span className="font-mono text-[10px] opacity-70 mr-1">✕</span>
                      <span className="font-semibold">{f.action}</span>
                      <span className="text-red-600/80"> — {feature}{lessonHint}</span>
                      <span className="block ml-4 text-red-600/80">{f.message}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Decision bar for mixed / failure states */}
          {hasFailures && !decided && (
            <div className="mt-2.5 pt-2 border-t border-slate-200/30 flex flex-wrap items-center gap-1.5">
              {onRetryFailed && (
                <button
                  type="button"
                  onClick={() => onRetryFailed(failedItems, toolName)}
                  className="tactile px-2.5 py-1 rounded-lg text-[11px] font-semibold text-white bg-indigo-500 hover:bg-indigo-600 transition-all shadow-sm"
                  aria-label={`Retry ${failedItems.length} failed ${failedItems.length === 1 ? 'change' : 'changes'}`}
                >
                  Retry {failedItems.length} failed
                </button>
              )}
              {hasSuccesses && onKeep && (
                <button
                  type="button"
                  onClick={onKeep}
                  className="tactile px-2.5 py-1 rounded-lg text-[11px] font-semibold text-slate-600 bg-white/70 border border-slate-200/50 hover:bg-white hover:border-slate-300 transition-all"
                  aria-label="Keep the applied changes and dismiss the failures"
                >
                  Keep applied
                </button>
              )}
              {canUndo && onUndo && hasSuccesses && (
                <button
                  type="button"
                  onClick={onUndo}
                  className="tactile px-2.5 py-1 rounded-lg text-[11px] font-semibold text-slate-600 hover:bg-white/60 transition-all"
                  aria-label="Undo every change from this batch"
                >
                  Undo all
                </button>
              )}
            </div>
          )}

          {/* Status footer — shows what decision was made */}
          {decided && (
            <p className={`text-[10px] mt-1 ${status === 'retried' ? 'text-indigo-500' : 'text-slate-400'}`}>
              {status === 'retried' ? 'Retrying failed changes…' : 'Kept the applied changes.'}
            </p>
          )}

          {message && !decided && (
            <p className={`text-[10px] mt-1 ${styles.messageText}`}>{message}</p>
          )}
        </div>
      )}
    </div>
  );
}

const TONES = {
  success: {
    container: 'bg-emerald-50/60 border-emerald-200/30',
    header: 'hover:bg-emerald-50/80',
    iconBg: 'bg-emerald-100',
    iconFg: 'text-emerald-600',
    title: 'text-emerald-700',
    chevron: 'text-emerald-400',
    body: 'border-emerald-100/50',
    successLine: 'text-emerald-700',
    failSection: 'border-emerald-100/50',
    messageText: 'text-emerald-600/70',
  },
  error: {
    container: 'bg-red-50/60 border-red-200/40',
    header: 'hover:bg-red-50/80',
    iconBg: 'bg-red-100',
    iconFg: 'text-red-600',
    title: 'text-red-700',
    chevron: 'text-red-400',
    body: 'border-red-100/50',
    successLine: 'text-red-700',
    failSection: 'border-red-100/50',
    messageText: 'text-red-600/70',
  },
  mixed: {
    container: 'bg-amber-50/60 border-amber-200/40',
    header: 'hover:bg-amber-50/80',
    iconBg: 'bg-amber-100',
    iconFg: 'text-amber-600',
    title: 'text-amber-800',
    chevron: 'text-amber-400',
    body: 'border-amber-100/50',
    successLine: 'text-emerald-700',
    failSection: 'border-amber-100/50',
    messageText: 'text-amber-700/70',
  },
};
