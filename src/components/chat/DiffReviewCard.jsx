import React, { useState } from 'react';

/**
 * DiffReviewCard — Shows a visual diff of what an AI action will change,
 * with Accept / Reject buttons (Cursor-style review before apply).
 *
 * Rendered in MessageList when a user selects a proposal option.
 * Changes are NOT applied until the user clicks Accept.
 */

const ACTION_LABELS = {
  addItem: 'Add',
  removeItem: 'Remove',
  editItem: 'Edit',
  editCell: 'Edit cell',
  editTitle: 'Rename lesson',
  addLesson: 'Add lesson',
  deleteLesson: 'Delete lesson',
};

function getDeliverableLabel(featureId) {
  const map = {
    quizBank: 'Quiz Bank', discussions: 'Discussions', assignments: 'Assignments',
    slideDecks: 'Slide Decks', courseFaq: 'Course FAQ', rubrics: 'Rubrics',
    studyGuides: 'Study Guides', lessonPlans: 'Lesson Plans', syllabus: 'Syllabus',
  };
  return map[featureId] || featureId;
}

/** Build a human-readable summary of what the action does */
function describeDiff(action, preview) {
  const type = action?.type;
  const label = ACTION_LABELS[type] || 'Change';
  const featureLabel = action?.featureId ? getDeliverableLabel(action.featureId) : '';
  const lessonNum = action?.lessonIndex != null ? `Lesson ${action.lessonIndex + 1}` : '';

  const parts = [label];
  switch (type) {
    case 'addItem':
      parts.push(`item to ${featureLabel}`);
      if (lessonNum) parts.push(lessonNum);
      break;
    case 'removeItem':
      parts.push(`item from ${featureLabel}`);
      if (lessonNum) parts.push(lessonNum);
      break;
    case 'editItem':
      parts.push(`in ${featureLabel}`);
      break;
    case 'editCell':
      parts.push(`"${action.field || ''}" in ${lessonNum}`);
      break;
    case 'editTitle':
      if (lessonNum) parts.push(lessonNum);
      break;
    case 'addLesson':
      parts.push(`"${action.title || 'New lesson'}"`);
      break;
    case 'deleteLesson':
      if (lessonNum) parts.push(lessonNum);
      break;
    default:
      parts.push('content');
  }
  return parts.join(' — ');
}

function DiffValue({ label, value, color }) {
  if (value == null || value === '') return null;
  const colorMap = {
    red: 'bg-red-50/70 border-red-200/50 text-red-700',
    green: 'bg-emerald-50/70 border-emerald-200/50 text-emerald-700',
    neutral: 'bg-slate-50/70 border-slate-200/50 text-slate-600',
  };
  return (
    <div className={`rounded-lg border px-3 py-2 text-xs leading-relaxed ${colorMap[color] || colorMap.neutral}`}>
      <span className="text-[10px] uppercase tracking-wider font-semibold opacity-60 block mb-1">{label}</span>
      <span className="whitespace-pre-wrap break-words">{typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}</span>
    </div>
  );
}

function ItemFields({ item, featureId }) {
  if (!item) return null;
  const entries = Object.entries(item).filter(([, v]) => v != null && v !== '');
  if (entries.length === 0) return null;
  return (
    <div className="space-y-1">
      {entries.slice(0, 6).map(([key, val]) => (
        <div key={key} className="text-[11px]">
          <span className="text-slate-400 font-medium">{key}: </span>
          <span className="text-slate-600">
            {Array.isArray(val) ? val.join(', ') : String(val).slice(0, 200)}
          </span>
        </div>
      ))}
      {entries.length > 6 && (
        <div className="text-[10px] text-slate-400">+{entries.length - 6} more fields</div>
      )}
    </div>
  );
}

export default function DiffReviewCard({ diff, status, onAccept, onReject }) {
  const [expanded, setExpanded] = useState(false);
  if (!diff) return null;

  const { action, preview, optionTitle } = diff;
  const isPending = status === 'pending';
  const isAccepted = status === 'accepted';
  const isRejected = status === 'rejected';

  const description = describeDiff(action, preview);
  const type = action?.type;

  return (
    <div className={`mx-1 my-1 animate-spring-in rounded-xl border px-4 py-3 transition-all duration-300 ${
      isAccepted ? 'bg-emerald-50/50 border-emerald-300/40'
        : isRejected ? 'bg-red-50/30 border-red-200/30 opacity-60'
          : 'bg-white/60 border-indigo-200/40 shadow-glass'
    }`}>
      {/* Header */}
      <div className="flex items-start gap-2.5 mb-2">
        <div className={`w-6 h-6 mt-0.5 rounded-lg flex items-center justify-center flex-shrink-0 ${
          isAccepted ? 'bg-emerald-100/80' : isRejected ? 'bg-red-100/60' : 'bg-indigo-100/80'
        }`}>
          {isAccepted ? (
            <svg className="w-3 h-3 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          ) : isRejected ? (
            <svg className="w-3 h-3 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-3 h-3 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-slate-800 leading-snug">
            {isAccepted ? 'Applied' : isRejected ? 'Rejected' : 'Review change'}
            {optionTitle && <span className="font-normal text-slate-500"> — {optionTitle}</span>}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">{description}</p>
        </div>
      </div>

      {/* Diff content */}
      <div className="ml-8 space-y-2">
        {/* Add item: show what will be added */}
        {type === 'addItem' && action.item && (
          <div className="rounded-lg border border-emerald-200/40 bg-emerald-50/40 px-3 py-2">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-emerald-500 block mb-1.5">+ Adding</span>
            <ItemFields item={action.item} featureId={action.featureId} />
          </div>
        )}

        {/* Remove item: show what will be removed */}
        {type === 'removeItem' && preview?.removedItem && (
          <div className="rounded-lg border border-red-200/40 bg-red-50/40 px-3 py-2">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-red-500 block mb-1.5">- Removing</span>
            <ItemFields item={preview.removedItem} featureId={action.featureId} />
          </div>
        )}

        {/* Edit item/cell/title: show before → after */}
        {(type === 'editItem' || type === 'editCell' || type === 'editTitle') && (
          <div className="space-y-1.5">
            {preview?.oldValue != null && (
              <DiffValue label="Before" value={preview.oldValue} color="red" />
            )}
            <DiffValue
              label="After"
              value={type === 'editTitle' ? action.newTitle : action.value}
              color="green"
            />
          </div>
        )}

        {/* Add lesson: show lesson details */}
        {type === 'addLesson' && (
          <div className="rounded-lg border border-emerald-200/40 bg-emerald-50/40 px-3 py-2">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-emerald-500 block mb-1.5">+ New lesson</span>
            <p className="text-xs text-emerald-700 font-medium">{action.title}</p>
            {action.sections && (
              <p className="text-[11px] text-emerald-600 mt-1">{action.sections.length} section(s)</p>
            )}
          </div>
        )}

        {/* Delete lesson: show what will be removed */}
        {type === 'deleteLesson' && preview?.lessonTitle && (
          <div className="rounded-lg border border-red-200/40 bg-red-50/40 px-3 py-2">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-red-500 block mb-1.5">- Deleting</span>
            <p className="text-xs text-red-700 font-medium">{preview.lessonTitle}</p>
          </div>
        )}

        {/* Expand toggle for full action JSON */}
        <span
          role="button"
          tabIndex={0}
          onClick={() => setExpanded(v => !v)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setExpanded(v => !v); }}
          className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
        >
          {expanded ? 'Hide raw' : 'Show raw'}
          <svg className={`w-2.5 h-2.5 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
          </svg>
        </span>
        {expanded && (
          <pre className="text-[10px] text-slate-500 bg-slate-50/80 rounded-lg p-2 overflow-x-auto max-h-32 border border-slate-200/30">
            {JSON.stringify(action, null, 2)}
          </pre>
        )}
      </div>

      {/* Accept / Reject buttons */}
      {isPending && (
        <div className="ml-8 mt-3 flex items-center gap-2">
          <button
            onClick={() => onAccept?.()}
            className="tactile flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-semibold shadow-sm hover:bg-emerald-600 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            Apply
          </button>
          <button
            onClick={() => onReject?.()}
            className="tactile flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-white/80 border border-slate-200/60 text-slate-600 text-xs font-semibold hover:bg-red-50 hover:border-red-200/60 hover:text-red-600 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Reject
          </button>
        </div>
      )}

      {/* Status indicator */}
      {isAccepted && (
        <div className="ml-8 mt-2 text-[11px] text-emerald-600 font-medium flex items-center gap-1.5">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Change applied
        </div>
      )}
      {isRejected && (
        <div className="ml-8 mt-2 text-[11px] text-red-500 font-medium flex items-center gap-1.5">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
          Change rejected
        </div>
      )}
    </div>
  );
}
