import React, { useState } from 'react';
import { resolveLabel } from './constants';

/**
 * SyncSuggestionCard — Shown when an edit triggers downstream sync needs.
 * Displays affected deliverables and lets the user approve or skip the sync.
 */
export default function SyncSuggestionCard({ suggestion, onApprove, onSkip }) {
  const [collapsed, setCollapsed] = useState(false);

  if (!suggestion) return null;

  const { id, status, editSource, editSummary, plan } = suggestion;
  const isPending = status === 'pending';
  const isSyncing = status === 'syncing';
  const isDone = status === 'done';
  const isSkipped = status === 'skipped';

  // Build edit description
  const fields = editSummary?.fields || [];
  const lessons = editSummary?.lessonIndices || [];
  const lessonText = lessons.length > 0
    ? ` in Lesson${lessons.length > 1 ? 's' : ''} ${lessons.map(n => n + 1).join(', ')}`
    : '';
  const editDesc = editSource === 'deliverable'
    ? `You edited ${fields[0] || 'a deliverable'}${lessonText}`
    : `You edited ${fields.join(', ')}${lessonText}`;

  // Theme colors by status
  const theme = isDone
    ? { bg: 'bg-emerald-50/60', border: 'border-emerald-200/30', icon: 'text-emerald-600', iconBg: 'bg-emerald-100', text: 'text-emerald-700' }
    : isSkipped
    ? { bg: 'bg-slate-50/60', border: 'border-slate-200/30', icon: 'text-slate-400', iconBg: 'bg-slate-100', text: 'text-slate-500' }
    : { bg: 'bg-amber-50/60', border: 'border-amber-200/30', icon: 'text-amber-600', iconBg: 'bg-amber-100', text: 'text-amber-700' };

  return (
    <div className={`mx-2 my-1 rounded-xl ${theme.bg} border ${theme.border} shadow-glass animate-spring-in overflow-hidden`}>
      {/* Header */}
      <button
        onClick={() => setCollapsed(v => !v)}
        className={`w-full px-3.5 py-2 flex items-center gap-2 hover:${theme.bg} transition-colors`}
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
          ) : (
            <svg className={`w-3 h-3 ${theme.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          )}
        </div>
        <span className={`text-[13px] font-semibold ${theme.text} flex-1 text-left`}>
          {isDone ? 'Sync Complete' : isSyncing ? 'Syncing…' : isSkipped ? 'Sync Skipped' : 'Sync Needed'}
        </span>
        <svg
          className={`w-3 h-3 ${isSkipped ? 'text-slate-300' : isDone ? 'text-emerald-400' : 'text-amber-400'} transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Body */}
      {!collapsed && (
        <div className="px-3.5 pb-2.5 space-y-1.5 border-t border-amber-100/50">
          <p className={`text-[12px] ${isDone || isSkipped ? 'text-slate-500' : 'text-amber-800'} pt-1.5`}>
            {editDesc}. {isDone ? 'Deliverables updated:' : isSkipped ? 'These deliverables were not synced:' : 'These deliverables need updating:'}
          </p>

          {/* Affected deliverables list */}
          <div className="space-y-0.5">
            {(plan || []).map((entry, i) => (
              <div key={i} className={`flex items-center gap-2 text-[12px] ${isDone ? 'text-emerald-700' : isSkipped ? 'text-slate-400' : 'text-amber-700'} py-0.5`}>
                <span className={`font-mono text-[11px] ${isDone ? 'text-emerald-400' : isSkipped ? 'text-slate-300' : 'text-amber-400'}`}>•</span>
                <span>
                  {resolveLabel(entry.featureId)}
                  {entry.lessonIndices
                    ? ` (Lesson${entry.lessonIndices.length > 1 ? 's' : ''} ${entry.lessonIndices.map(n => n + 1).join(', ')})`
                    : ' (full update)'}
                </span>
              </div>
            ))}
          </div>

          {/* Action buttons — only when pending */}
          {isPending && (
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={(e) => { e.stopPropagation(); onApprove?.(id); }}
                className="tactile px-3 py-1 rounded-lg text-[12px] font-semibold text-white bg-amber-500 hover:bg-amber-600 shadow-sm transition-colors"
              >
                Sync Now
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onSkip?.(id); }}
                className="tactile px-3 py-1 rounded-lg text-[12px] font-medium text-amber-600 hover:bg-amber-100/60 transition-colors"
              >
                Skip
              </button>
            </div>
          )}

          {/* Syncing indicator */}
          {isSyncing && (
            <p className="text-[11px] text-amber-600/70 pt-0.5">
              Regenerating {plan?.length || 0} deliverable{(plan?.length || 0) !== 1 ? 's' : ''}…
            </p>
          )}
        </div>
      )}
    </div>
  );
}
