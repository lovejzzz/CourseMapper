import React, { useState } from 'react';
import { resolveLabel } from './constants';

/**
 * ChangeSummaryCard — Shown after agent actions (direct, batch, or proposal).
 * Displays a structured summary of applied changes with an undo button.
 */
export default function ChangeSummaryCard({ summary, onUndo, canUndo }) {
  const [collapsed, setCollapsed] = useState(false);

  if (!summary) return null;

  const { changes, message } = summary;

  return (
    <div className="mx-2 my-1 rounded-xl bg-emerald-50/60 border border-emerald-200/30 shadow-glass animate-spring-in overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setCollapsed(v => !v)}
        className="w-full px-3.5 py-2 flex items-center gap-2 hover:bg-emerald-50/80 transition-colors"
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Expand change summary' : 'Collapse change summary'}
      >
        <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
          <svg className="w-3 h-3 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <span className="text-[13px] font-semibold text-emerald-700 flex-1 text-left">
          Changes Applied
        </span>
        {canUndo && onUndo && (
          <span
            role="button"
            onClick={(e) => { e.stopPropagation(); onUndo(); }}
            className="tactile flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold text-slate-500 hover:text-indigo-600 hover:bg-white/60 transition-all"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" />
            </svg>
            Undo
          </span>
        )}
        <svg
          className={`w-3 h-3 text-emerald-400 transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Body */}
      {!collapsed && (
        <div className="px-3.5 pb-2.5 space-y-1 border-t border-emerald-100/50">
          {(changes || []).map((c, i) => (
            <div key={i} className="flex items-center gap-2 text-[12px] text-emerald-700 py-0.5">
              <span className="text-emerald-400 font-mono text-[11px]">
                {c.type === 'added' ? '+' : c.type === 'removed' ? '−' : '~'}
              </span>
              <span>
                {c.type === 'added' ? 'Added' : c.type === 'removed' ? 'Removed' : 'Edited'}{' '}
                {c.count} {resolveLabel(c.featureId)}
                {c.label ? ` — ${c.label}` : ''}
              </span>
            </div>
          ))}
          {message && (
            <p className="text-[11px] text-emerald-600/70 mt-1">{message}</p>
          )}
        </div>
      )}
    </div>
  );
}
