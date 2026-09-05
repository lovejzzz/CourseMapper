import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  JUDGMENT_CLASS_KEYS,
  REVIEW_CLASS_KEYS,
  REVIEW_CLASS_LABELS,
  buildFocusEventForTarget,
  flattenReviewQueue,
} from '../lib/reviewQueueModel';

/**
 * ReviewQueue — v0.14.4 WS-C2: the step-through review drawer.
 *
 * Drawer, not modal (QualityReportModal stays a centered modal because its
 * report is self-contained): review is a LOOK-AT-THE-WORKSPACE flow, so the
 * panel anchors right and leaves the deliverables visible while Jump /
 * prev-next highlight the exact location via the existing focus events.
 * On small screens it takes the full width with a dimmed backdrop (the
 * caller brings the export view forward first, mirroring the quality chip's
 * mobileWorkspaceView handling).
 *
 * This component never mutates progress itself — Mark reviewed / Dismiss
 * call back into the queue's owner (AppFlow since v0.14.9 B1; ExportSidePanel
 * only hosts the drawer), which owns the persisted
 * 'coursemapper-review-progress' state.
 *
 * v0.14.9 B1: spot-checks are ROUTINE confirmations — they don't count toward
 * the header CTA's headline number, and their class header carries a
 * "Confirm all" so fifteen look-here items are one click, not fifteen.
 */

const CLASS_TONES = {
  sync: 'bg-indigo-600 text-white',
  observations: 'bg-amber-100 text-amber-700',
  spotChecks: 'bg-indigo-100 text-indigo-700',
  structural: 'bg-slate-200 text-slate-600',
};

function itemState(item, progress) {
  if (Array.isArray(progress?.dismissed) && progress.dismissed.includes(item.id)) return 'dismissed';
  if (item.reviewedAtSource || (Array.isArray(progress?.reviewed) && progress.reviewed.includes(item.id)))
    return 'reviewed';
  return 'open';
}

export function dispatchReviewJump(item) {
  const focusEvent = buildFocusEventForTarget(item?.target);
  if (!focusEvent) return false;
  window.dispatchEvent(new CustomEvent(focusEvent.type, { detail: focusEvent.detail }));
  return true;
}

export default function ReviewQueue({
  open,
  queue,
  progress,
  focusItemId = null,
  onClose,
  onMark,
  // v0.14.9 B1: batch mark (the spot-check class's Confirm all).
  onMarkAll = null,
  // v0.14.7 WS-G4: sync items are ACTIONS — approving executes the plan.
  onExecuteSync = null,
}) {
  const items = useMemo(() => flattenReviewQueue(queue), [queue]);
  const [currentId, setCurrentId] = useState(null);

  const outstandingCount = useMemo(
    () => items.filter((item) => itemState(item, progress) === 'open').length,
    [items, progress],
  );

  const outstandingByKind = useMemo(() => {
    const openInClass = (classKey) =>
      (queue?.classes?.[classKey] || []).filter((item) => itemState(item, progress) === 'open').length;
    return {
      decisions: JUDGMENT_CLASS_KEYS.reduce((total, classKey) => total + openInClass(classKey), 0),
      spotChecks: openInClass('spotChecks'),
    };
  }, [queue, progress]);

  // Opening (or re-opening focused on an observation) selects the requested
  // item, else the first still-open one.
  useEffect(() => {
    if (!open) return;
    const focused = focusItemId ? items.find((item) => item.id === focusItemId || item.sourceId === focusItemId) : null;
    const firstOpen = items.find((item) => itemState(item, progress) === 'open');
    setCurrentId((focused || firstOpen || items[0] || {}).id || null);
    // Progress is intentionally not a dependency: marking an item must not
    // yank the selection away mid-review.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, focusItemId, items]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const currentIndex = Math.max(
    0,
    items.findIndex((item) => item.id === currentId),
  );

  const step = useCallback(
    (delta) => {
      if (items.length === 0) return;
      const nextIndex = Math.min(Math.max(currentIndex + delta, 0), items.length - 1);
      const nextItem = items[nextIndex];
      if (!nextItem) return;
      setCurrentId(nextItem.id);
      // Auto-jump as you advance — the step-through contract.
      dispatchReviewJump(nextItem);
    },
    [currentIndex, items],
  );

  if (!open || !queue) return null;

  const allClear = items.length > 0 && outstandingCount === 0;

  return (
    <>
      {/* Mobile backdrop only — on desktop the workspace stays interactive so Jump highlights are visible. */}
      <div className="fixed inset-0 z-[9997] bg-black/20 backdrop-blur-[1px] lg:hidden" onClick={onClose} />
      <div
        data-testid="review-queue-drawer"
        role="dialog"
        aria-label="Review queue"
        className="fixed inset-y-0 right-0 z-[9998] flex w-full max-w-md flex-col border-l border-slate-200/80 bg-white/95 shadow-2xl backdrop-blur-lg animate-in slide-in-from-right-4 duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-800">Review queue</p>
            <p data-testid="review-queue-progress" className="text-xs text-slate-400">
              {items.length === 0
                ? 'Nothing to review.'
                : allClear
                  ? `All ${items.length} item${items.length === 1 ? '' : 's'} handled.`
                  : [
                      outstandingByKind.decisions > 0
                        ? `${outstandingByKind.decisions} decision${outstandingByKind.decisions === 1 ? '' : 's'}`
                        : null,
                      outstandingByKind.spotChecks > 0
                        ? `${outstandingByKind.spotChecks} routine spot-check${outstandingByKind.spotChecks === 1 ? '' : 's'}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {items.length > 1 && (
              <>
                <button
                  type="button"
                  data-testid="review-queue-prev"
                  onClick={() => step(-1)}
                  disabled={currentIndex <= 0}
                  aria-label="Previous review item"
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-30"
                >
                  ‹
                </button>
                <span className="font-mono text-xs text-slate-400">
                  {currentIndex + 1}/{items.length}
                </span>
                <button
                  type="button"
                  data-testid="review-queue-next"
                  onClick={() => step(1)}
                  disabled={currentIndex >= items.length - 1}
                  aria-label="Next review item"
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-30"
                >
                  ›
                </button>
              </>
            )}
            <button
              type="button"
              data-testid="review-queue-close"
              onClick={onClose}
              aria-label="Close review queue"
              className="ml-1 flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
          {allClear && (
            <p
              data-testid="review-queue-all-clear"
              className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700"
            >
              All clear — every item is reviewed or dismissed.
            </p>
          )}
          {items.length === 0 && (
            <p data-testid="review-queue-empty" className="text-xs text-slate-400">
              Nothing needs review for this package.
            </p>
          )}
          {REVIEW_CLASS_KEYS.map((classKey) => {
            const classItems = queue.classes?.[classKey] || [];
            if (classItems.length === 0) return null;
            const openCount = classItems.filter((item) => itemState(item, progress) === 'open').length;
            return (
              <div key={classKey} data-testid={`review-queue-class-${classKey}`}>
                <div className="mb-1.5 flex items-center gap-1.5">
                  <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${CLASS_TONES[classKey]}`}>
                    {REVIEW_CLASS_LABELS[classKey].title}
                  </span>
                  <span className="text-xs font-semibold text-slate-400">
                    {openCount} of {classItems.length} open
                  </span>
                  {classKey === 'spotChecks' && openCount > 0 && typeof onMarkAll === 'function' && (
                    <button
                      type="button"
                      data-testid="review-queue-confirm-all"
                      onClick={() =>
                        onMarkAll(
                          classItems.filter((item) => itemState(item, progress) === 'open'),
                          'reviewed',
                        )
                      }
                      title="Spot-checks are routine confirmations — confirm every open one"
                      className="ml-auto rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-600 transition-colors hover:bg-indigo-100"
                    >
                      Confirm all
                    </button>
                  )}
                  {classKey === 'sync' && openCount > 0 && typeof onExecuteSync === 'function' && (
                    <button
                      type="button"
                      data-testid="review-queue-sync-now"
                      onClick={() => onExecuteSync(classItems[0])}
                      title="Apply the complete approved sync plan"
                      className="ml-auto rounded-md bg-indigo-600 px-2 py-0.5 text-xs font-bold text-white transition-colors hover:bg-indigo-700"
                    >
                      Sync all {openCount}
                    </button>
                  )}
                </div>
                <ul className="space-y-1.5">
                  {classItems.map((item) => {
                    const state = itemState(item, progress);
                    const isCurrent = item.id === currentId;
                    return (
                      <li
                        key={item.id}
                        data-testid="review-queue-item"
                        data-review-state={state}
                        className={`rounded-lg border px-3 py-2 transition-colors ${
                          isCurrent
                            ? 'border-indigo-300 bg-indigo-50/60 dark:border-indigo-500/40'
                            : 'border-slate-100 bg-white'
                        } ${state !== 'open' ? 'opacity-70' : ''}`}
                      >
                        <button
                          type="button"
                          onClick={() => setCurrentId(item.id)}
                          className="w-full text-left"
                          title="Select this item"
                        >
                          <p
                            className={`text-xs leading-snug ${
                              state === 'dismissed' ? 'text-slate-400 line-through' : 'text-slate-700'
                            }`}
                          >
                            {state === 'reviewed' && <span className="mr-1 font-bold text-emerald-600">✓</span>}
                            {item.title}
                          </p>
                          {item.detail && <p className="mt-0.5 text-xs leading-snug text-slate-400">{item.detail}</p>}
                        </button>
                        <div className="mt-1.5 flex items-center gap-1.5">
                          {item.target ? (
                            <button
                              type="button"
                              data-testid="review-queue-jump"
                              onClick={() => {
                                setCurrentId(item.id);
                                dispatchReviewJump(item);
                              }}
                              className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-600 transition-colors hover:bg-indigo-100"
                            >
                              Jump
                            </button>
                          ) : (
                            <span data-testid="review-queue-no-jump" className="text-xs italic text-slate-300">
                              No jump target
                            </span>
                          )}
                          <button
                            type="button"
                            data-testid="review-queue-mark"
                            onClick={() => onMark?.(item, state === 'reviewed' ? 'clear' : 'reviewed')}
                            className={`rounded-md px-2 py-0.5 text-xs font-semibold transition-colors ${
                              state === 'reviewed'
                                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {state === 'reviewed' ? 'Reviewed ✓' : 'Mark reviewed'}
                          </button>
                          {state !== 'dismissed' ? (
                            <button
                              type="button"
                              data-testid="review-queue-dismiss"
                              onClick={() => onMark?.(item, 'dismissed')}
                              className="rounded-md px-2 py-0.5 text-xs font-semibold text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                            >
                              Dismiss
                            </button>
                          ) : (
                            <button
                              type="button"
                              data-testid="review-queue-restore"
                              onClick={() => onMark?.(item, 'clear')}
                              className="rounded-md px-2 py-0.5 text-xs font-semibold text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                            >
                              Restore
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
