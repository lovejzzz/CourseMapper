import React, { useEffect, useMemo, useState } from 'react';
import { resolveLabel } from './constants';

export default function ChangeSummaryCard({ summary, status, onUndo, canUndo, onRetryFailed, onKeep }) {
  const [collapsed, setCollapsed] = useState(true);

  const { changes = [], applied = 0, failed = 0, pending = 0, failedItems = [], toolName, message } = summary || {};

  const hasSuccesses = changes.length > 0 || applied > 0;
  const hasFailures = failed > 0 || failedItems.length > 0;
  const hasPending = pending > 0;
  const tone = !hasFailures ? 'success' : !hasSuccesses ? 'error' : 'mixed';
  const styles = TONES[tone];
  const decided = status === 'retried' || status === 'kept';

  useEffect(() => {
    if (hasFailures) setCollapsed(false);
  }, [hasFailures]);

  const summaryText = useMemo(() => {
    const parts = [];
    if (applied > 0) parts.push(`${applied} applied`);
    if (changes.length > 0 && applied === 0) parts.push(`${changes.length} changed`);
    if (pending > 0) parts.push(`${pending} pending`);
    if (failed > 0) parts.push(`${failed} failed`);
    return parts.length ? parts.join(' · ') : message || 'No changes reported';
  }, [applied, changes.length, failed, pending, message]);

  const title =
    tone === 'success' ? 'Changes applied' : tone === 'error' ? 'Changes failed' : 'Changes partially applied';

  if (!summary) return null;

  return (
    <div
      className={`ml-8 mr-1 rounded-lg border bg-white/75 shadow-sm animate-spring-in overflow-hidden ${styles.border}`}
    >
      <div className="px-3 py-2">
        <div className="flex items-start gap-2.5">
          <div className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full ${styles.iconBg}`}>
            {tone === 'success' ? (
              <svg
                className="h-3.5 w-3.5 text-emerald-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="m5 13 4 4L19 7" />
              </svg>
            ) : (
              <svg
                className={`h-3.5 w-3.5 ${styles.iconText}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.2}
                  d="M12 9v4m0 4h.01M4.93 19h14.14c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.2 16c-.77 1.33.19 3 1.73 3z"
                />
              </svg>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className={`truncate text-[12px] font-semibold ${styles.title}`}>{title}</p>
              <span className="truncate text-[10px] font-medium text-slate-400">{summaryText}</span>
            </div>
            {message && <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-slate-500">{message}</p>}
            {hasPending && !message && (
              <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                Preview updates when the background regeneration finishes.
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {!decided && canUndo && onUndo && hasSuccesses && (
              <button
                type="button"
                onClick={onUndo}
                className="tactile rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 hover:bg-slate-100/80 hover:text-indigo-600"
                aria-label={tone === 'mixed' ? 'Undo all changes' : 'Undo last change'}
              >
                Undo
              </button>
            )}
            {(changes.length > 0 || failedItems.length > 0) && (
              <button
                type="button"
                onClick={() => setCollapsed((value) => !value)}
                className="tactile rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 hover:bg-slate-100/80 hover:text-slate-600"
                aria-expanded={!collapsed}
                aria-label={collapsed ? 'Show change details' : 'Hide change details'}
              >
                {collapsed ? 'Details' : 'Hide'}
              </button>
            )}
          </div>
        </div>
      </div>

      {!collapsed && (
        <div className="border-t border-slate-200/50 px-3 py-2">
          <div className="space-y-1.5">
            {changes.map((change, index) => (
              <div key={`ok-${index}`} className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-600">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                <span>
                  <span className="font-medium">
                    {change.type === 'added'
                      ? 'Added'
                      : change.type === 'removed'
                        ? 'Removed'
                        : change.type === 'generated'
                          ? 'Generated'
                          : 'Edited'}
                  </span>{' '}
                  {change.count} {resolveLabel(change.featureId)}
                  {change.label ? ` · ${change.label}` : ''}
                </span>
              </div>
            ))}

            {failedItems.map((failure, index) => {
              const feature = failure.featureId ? resolveLabel(failure.featureId) : 'course map';
              const lessonHint = typeof failure.lessonIndex === 'number' ? ` · Lesson ${failure.lessonIndex + 1}` : '';
              return (
                <div key={`fail-${index}`} className="flex items-start gap-2 text-[11px] leading-relaxed text-red-700">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden="true" />
                  <span>
                    <span className="font-medium">{failure.action}</span>
                    <span className="text-red-600/80">
                      {' '}
                      · {feature}
                      {lessonHint}
                    </span>
                    <span className="block text-red-600/80">{failure.message}</span>
                  </span>
                </div>
              );
            })}
          </div>

          {hasFailures && !decided && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {onRetryFailed && (
                <button
                  type="button"
                  onClick={() => onRetryFailed(failedItems, toolName)}
                  className="tactile rounded-md bg-slate-900 px-2 py-1 text-[10px] font-semibold text-white hover:bg-slate-800"
                  aria-label={`Retry ${failedItems.length} failed ${failedItems.length === 1 ? 'change' : 'changes'}`}
                >
                  Retry failed
                </button>
              )}
              {hasSuccesses && onKeep && (
                <button
                  type="button"
                  onClick={onKeep}
                  className="tactile rounded-md px-2 py-1 text-[10px] font-semibold text-slate-500 hover:bg-slate-100/80"
                  aria-label="Keep the applied changes and dismiss the failures"
                >
                  Keep applied
                </button>
              )}
            </div>
          )}

          {decided && (
            <p className="mt-2 text-[10px] text-slate-400">
              {status === 'retried' ? 'Retrying failed changes...' : 'Kept the applied changes.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const TONES = {
  success: {
    border: 'border-slate-200/70',
    iconBg: 'bg-emerald-50',
    iconText: 'text-emerald-500',
    title: 'text-slate-700',
  },
  error: {
    border: 'border-red-200/70',
    iconBg: 'bg-red-50',
    iconText: 'text-red-500',
    title: 'text-red-700',
  },
  mixed: {
    border: 'border-amber-200/70',
    iconBg: 'bg-amber-50',
    iconText: 'text-amber-500',
    title: 'text-amber-800',
  },
};
