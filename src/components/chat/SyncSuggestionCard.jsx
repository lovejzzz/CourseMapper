import React, { useState } from 'react';
import { resolveLabel } from './constants';

/**
 * SyncSuggestionCard — Shown when an edit triggers downstream sync needs.
 * Displays affected deliverables with individual checkboxes so the user
 * can choose which to sync. Supports retry for failed items.
 */
export default function SyncSuggestionCard({ suggestion, onApprove, onSkip }) {
  const [collapsed, setCollapsed] = useState(false);
  const [checkedItems, setCheckedItems] = useState(null); // null = all checked (default)

  if (!suggestion) return null;

  const { id, status, editSource, editSummary, plan, failedItems } = suggestion;
  const isPending = status === 'pending';
  const isSyncing = status === 'syncing';
  const isDone = status === 'done';
  const isSkipped = status === 'skipped';
  const isPartialFail = status === 'partialFail';
  const effectivePlan = plan || [];
  const isBlueprintSync =
    editSource === 'artifactBlueprint' ||
    effectivePlan.some(
      (entry) =>
        (Array.isArray(entry?.canonicalPatches) && entry.canonicalPatches.length > 0) ||
        (Array.isArray(entry?.canonicalPatchRequests) && entry.canonicalPatchRequests.length > 0),
    );

  // Build edit description
  const fields = editSummary?.fields || [];
  const lessons = editSummary?.lessonIndices || [];
  const lessonText =
    lessons.length > 0 ? ` in Lesson${lessons.length > 1 ? 's' : ''} ${lessons.map((n) => n + 1).join(', ')}` : '';
  const editDesc =
    editSource === 'deliverable' || isBlueprintSync
      ? `Edited **${fields[0] || 'a deliverable'}**${lessonText}`
      : `Edited **${fields.join(', ')}**${lessonText}`;

  // Theme colors by status
  const theme = isDone
    ? {
        bg: 'bg-emerald-50/60',
        border: 'border-emerald-200/30',
        icon: 'text-emerald-600',
        iconBg: 'bg-emerald-100',
        text: 'text-emerald-700',
        subtext: 'text-emerald-600/70',
      }
    : isSkipped
      ? {
          bg: 'bg-slate-50/60',
          border: 'border-slate-200/30',
          icon: 'text-slate-400',
          iconBg: 'bg-slate-100',
          text: 'text-slate-500',
          subtext: 'text-slate-400',
        }
      : isPartialFail
        ? {
            bg: 'bg-red-50/60',
            border: 'border-red-200/30',
            icon: 'text-red-500',
            iconBg: 'bg-red-100',
            text: 'text-red-700',
            subtext: 'text-red-500/70',
          }
        : {
            bg: 'bg-amber-50/60',
            border: 'border-amber-200/30',
            icon: 'text-amber-600',
            iconBg: 'bg-amber-100',
            text: 'text-amber-700',
            subtext: 'text-amber-600/70',
          };

  // Checkbox state
  const getChecked = (i) => (checkedItems === null ? true : !!checkedItems[i]);
  const anyChecked = checkedItems === null ? true : Object.values(checkedItems).some(Boolean);
  const sourceOnlyPlan = (() => {
    const sourceFeatureId = editSummary?.sourceFeatureId;
    const sourceMatches = sourceFeatureId ? effectivePlan.filter((entry) => entry.featureId === sourceFeatureId) : [];
    return sourceMatches.length > 0 ? sourceMatches : effectivePlan.slice(0, 1);
  })();
  const statusTitle = (() => {
    if (isDone) return isBlueprintSync ? 'Blueprint Sync Complete' : 'Sync Complete';
    if (isSyncing) return 'Syncing...';
    if (isSkipped) return isBlueprintSync ? 'Kept Local' : 'Sync Skipped';
    if (isPartialFail) return 'Sync Partially Failed';
    if (isBlueprintSync) return 'Sync Choice';
    return `${effectivePlan.length} Deliverable${effectivePlan.length !== 1 ? 's' : ''} Need Syncing`;
  })();

  function toggleItem(i) {
    setCheckedItems((prev) => {
      if (prev === null) {
        // First toggle: initialize all as checked, then uncheck this one
        const init = {};
        effectivePlan.forEach((_, idx) => {
          init[idx] = idx !== i;
        });
        return init;
      }
      return { ...prev, [i]: !prev[i] };
    });
  }

  function handleApprove() {
    if (!anyChecked) return;
    // Filter plan to only checked items
    const selectedPlan = checkedItems === null ? effectivePlan : effectivePlan.filter((_, i) => checkedItems[i]);
    onApprove?.(id, selectedPlan);
  }

  function handleApprovePlan(selectedPlan) {
    if (!selectedPlan || selectedPlan.length === 0) return;
    onApprove?.(id, selectedPlan);
  }

  function handleRetry() {
    // Retry only the failed items
    if (failedItems?.length > 0) {
      onApprove?.(id, failedItems);
    }
  }

  return (
    <div
      className={`mx-2 my-1 rounded-xl ${theme.bg} border ${theme.border} shadow-glass animate-spring-in overflow-hidden`}
    >
      {/* Header */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="w-full px-3.5 py-2 flex items-center gap-2 transition-colors"
        aria-expanded={!collapsed}
      >
        <div className={`w-5 h-5 rounded-full ${theme.iconBg} flex items-center justify-center flex-shrink-0`}>
          {isDone ? (
            <svg className="w-3 h-3 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          ) : isSyncing ? (
            <svg className="w-3 h-3 text-amber-600 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : isPartialFail ? (
            <svg className="w-3 h-3 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          ) : (
            <svg className={`w-3 h-3 ${theme.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          )}
        </div>
        <span className={`text-[13px] font-semibold ${theme.text} flex-1 text-left`}>
          {statusTitle}
        </span>
        <svg
          className={`w-3 h-3 ${theme.subtext} transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Body */}
      {!collapsed && (
        <div className="px-3.5 pb-2.5 space-y-1.5 border-t border-amber-100/50">
          <p className={`text-[12px] ${theme.subtext} pt-1.5`}>{editDesc}</p>
          {isBlueprintSync && isPending && (
            <p className="rounded-lg bg-white/65 px-2.5 py-2 text-[12px] font-medium leading-snug text-slate-700">
              Keep this edit only here, or sync it through the course blueprint?
            </p>
          )}

          {/* Affected deliverables — with checkboxes when pending */}
          <div className="space-y-0.5">
            {effectivePlan.map((entry, i) => {
              const lessonDesc = entry.lessonIndices
                ? `Lesson${entry.lessonIndices.length > 1 ? 's' : ''} ${entry.lessonIndices.map((n) => n + 1).join(', ')}`
                : 'full regeneration';
              const isFailed = failedItems?.some((f) => f.featureId === entry.featureId);

              return (
                <label
                  key={i}
                  className={`flex items-center gap-2 text-[12px] py-0.5 ${
                    isPending ? 'cursor-pointer hover:bg-amber-50/50 rounded px-1 -mx-1' : ''
                  } ${isFailed ? 'text-red-600' : isDone ? 'text-emerald-700' : isSkipped ? 'text-slate-400' : 'text-amber-700'}`}
                >
                  {/* Checkbox only when pending. Blueprint sync uses explicit choice buttons below. */}
                  {isPending && !isBlueprintSync && (
                    <input
                      type="checkbox"
                      checked={getChecked(i)}
                      onChange={() => toggleItem(i)}
                      className="w-3.5 h-3.5 rounded border-amber-300 text-amber-500 focus:ring-amber-400 focus:ring-1 cursor-pointer"
                    />
                  )}
                  {!isPending && (
                    <span
                      className={`font-mono text-[11px] ${isFailed ? 'text-red-400' : isDone ? 'text-emerald-400' : 'text-slate-300'}`}
                    >
                      {isFailed ? '✗' : isDone ? '✓' : '•'}
                    </span>
                  )}
                  <span className="flex-1">
                    <span className="font-medium">{resolveLabel(entry.featureId)}</span>
                    <span className={`ml-1.5 ${theme.subtext}`}>— {lessonDesc}</span>
                  </span>
                </label>
              );
            })}
          </div>

          {/* Action buttons */}
          {isPending && isBlueprintSync && (
            <div className="grid grid-cols-1 gap-1.5 pt-1 sm:grid-cols-3">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSkip?.(id);
                }}
                className="tactile rounded-lg border border-slate-200 bg-white/70 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 shadow-sm transition-colors hover:bg-slate-50"
              >
                Keep local
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleApprovePlan(sourceOnlyPlan);
                }}
                disabled={sourceOnlyPlan.length === 0}
                className="tactile rounded-lg border border-amber-200 bg-white/75 px-2.5 py-1.5 text-[11px] font-semibold text-amber-700 shadow-sm transition-colors hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Sync this lesson
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleApprovePlan(effectivePlan);
                }}
                disabled={effectivePlan.length === 0}
                className="tactile rounded-lg bg-amber-500 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-amber-200"
              >
                Sync related materials
              </button>
            </div>
          )}
          {isPending && !isBlueprintSync && (
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleApprove();
                }}
                disabled={!anyChecked}
                className={`tactile px-3 py-1 rounded-lg text-[12px] font-semibold shadow-sm transition-colors ${
                  anyChecked
                    ? 'text-white bg-amber-500 hover:bg-amber-600'
                    : 'text-amber-300 bg-amber-200 cursor-not-allowed'
                }`}
              >
                Sync{' '}
                {checkedItems === null ? 'All' : `Selected (${Object.values(checkedItems).filter(Boolean).length})`}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSkip?.(id);
                }}
                className="tactile px-3 py-1 rounded-lg text-[12px] font-medium text-amber-600 hover:bg-amber-100/60 transition-colors"
              >
                Skip
              </button>
            </div>
          )}

          {/* Retry button for partial failures */}
          {isPartialFail && failedItems?.length > 0 && (
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRetry();
                }}
                className="tactile px-3 py-1 rounded-lg text-[12px] font-semibold text-white bg-red-500 hover:bg-red-600 shadow-sm transition-colors"
              >
                Retry Failed ({failedItems.length})
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSkip?.(id);
                }}
                className="tactile px-3 py-1 rounded-lg text-[12px] font-medium text-red-500 hover:bg-red-100/60 transition-colors"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Syncing indicator */}
          {isSyncing && (
            <p className="text-[11px] text-amber-600/70 pt-0.5">
              Regenerating {effectivePlan.length} deliverable{effectivePlan.length !== 1 ? 's' : ''}...
            </p>
          )}
        </div>
      )}
    </div>
  );
}
