import React, { useState } from 'react';

/**
 * ExamReview — interactive patch review UI for the Examine step.
 *
 * Props:
 *   pendingExamPatches  { patches: Patch[], baseMap: CourseMap } | null
 *   examChanges         string[]  — settled changes (accepted / rejected)
 *   onAcceptPatches     (indices: number[] | null) => void
 *   onRejectPatch       (index: number) => void
 *   onRetryExamine      () => Promise<void>  (only shown on failure)
 */
export default function ExamReview({
  pendingExamPatches,
  examChanges,
  onAcceptPatches,
  onRejectPatch,
  onRetryExamine,
  onFocusPatch,
}) {
  const [retrying, setRetrying] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // ── Failure state ──
  const isFailed = examChanges?.length === 1 && examChanges[0].startsWith('__EXAM_FAILED__:');
  if (isFailed) {
    const failReason = examChanges[0].replace('__EXAM_FAILED__:', '');
    return (
      <div className="mt-3 ml-6 animate-spring-in flex items-center gap-2 flex-wrap">
        <span className="flex items-center gap-2 text-xs font-semibold text-amber-700 bg-amber-50/80 px-3 py-1.5 rounded-squircle-xs border border-amber-200/50">
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          Examination skipped{failReason ? `: ${failReason}` : ''}
        </span>
        {onRetryExamine && (
          <button
            onClick={async () => {
              setRetrying(true);
              try {
                await onRetryExamine();
              } finally {
                setRetrying(false);
              }
            }}
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
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            )}
            {retrying ? 'Retrying...' : 'Retry'}
          </button>
        )}
      </div>
    );
  }

  // ── Pending review state ──
  if (pendingExamPatches && pendingExamPatches.patches?.length > 0) {
    const { patches } = pendingExamPatches;
    return (
      <div className="mt-3 ml-6 animate-spring-in">
        {/* Header row — wraps if too narrow */}
        <div className="flex items-center gap-1.5 flex-wrap mb-2">
          <button
            type="button"
            data-testid="exam-review-summary"
            onClick={() => onFocusPatch?.(patches[0])}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-violet-700 bg-violet-50/80 px-2.5 py-1.5 rounded-squircle-xs border border-violet-200/50 hover:bg-violet-100/80 transition-colors duration-150"
            title={onFocusPatch ? 'Jump to the first suggested change' : undefined}
          >
            <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            {patches.length} suggestion{patches.length !== 1 ? 's' : ''} to review
          </button>
          {/* Batch actions */}
          <button
            onClick={() => onAcceptPatches(null)}
            className="text-[10px] font-semibold text-emerald-700 bg-emerald-50/80 px-2 py-1.5 rounded-squircle-xs border border-emerald-200/50 hover:bg-emerald-100/80 transition-colors duration-150"
          >
            Accept all
          </button>
          <button
            onClick={() => onAcceptPatches([])}
            className="text-[10px] font-semibold text-slate-600 bg-slate-50/80 px-2 py-1.5 rounded-squircle-xs border border-slate-200/50 hover:bg-slate-100/80 transition-colors duration-150"
          >
            Keep all mine
          </button>
        </div>

        {/* Per-patch list — scrollable so it doesn't overflow the sidebar */}
        <ul className="space-y-2 max-h-72 overflow-y-auto pr-0.5">
          {patches.map((patch, i) => (
            <PatchCard
              key={i}
              patch={patch}
              baseMap={pendingExamPatches.baseMap}
              onAccept={() => onAcceptPatches([i])}
              onReject={() => onRejectPatch(i)}
              onFocus={onFocusPatch ? () => onFocusPatch(patch) : null}
            />
          ))}
        </ul>
      </div>
    );
  }

  // ── Settled state (accepted / rejected summary) ──
  if (!examChanges || examChanges.length === 0) return null;

  const accepted = examChanges.filter((c) => !c.startsWith('__REJECTED__:'));
  const rejected = examChanges.filter((c) => c.startsWith('__REJECTED__:')).map((c) => c.replace('__REJECTED__:', ''));
  const allRejected = accepted.length === 0;

  if (allRejected) {
    return (
      <div className="mt-3 ml-6 animate-spring-in">
        <span className="flex items-center gap-2 text-xs font-semibold text-slate-500 bg-slate-50/80 px-3 py-1.5 rounded-squircle-xs border border-slate-200/50 w-fit">
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          All AI suggestions declined — your version kept
        </span>
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
        {accepted.length} accepted{rejected.length > 0 ? `, ${rejected.length} kept yours` : ''}
        <svg
          className={`w-3 h-3 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && (
        <ul className="mt-2 space-y-1.5 text-[11px] bg-white/60 rounded-squircle-xs p-3 border border-slate-100/70 max-h-60 overflow-y-auto">
          {accepted.map((c, i) => {
            // Format is "Label: reason text" — split on the FIRST ": " only.
            // Labels (buildPatchLabel output) never contain ": " themselves,
            // so the first occurrence is always the loc/reason separator.
            const colonIdx = c.indexOf(': ');
            const hasReason = colonIdx > 0;
            const location = hasReason ? c.slice(0, colonIdx) : c;
            const reason = hasReason ? c.slice(colonIdx + 2) : null;
            return (
              <li key={`a${i}`} className="flex items-start gap-1.5 text-emerald-800">
                <span className="text-emerald-500 mt-0.5 flex-shrink-0">✓</span>
                <span>
                  <span className="font-semibold">{location}</span>
                  {reason && <span className="text-emerald-600 block mt-0.5">{reason}</span>}
                </span>
              </li>
            );
          })}
          {rejected.map((loc, i) => (
            <li key={`r${i}`} className="flex items-start gap-1.5 text-slate-400">
              <span className="mt-0.5 flex-shrink-0">–</span>
              <span className="line-through">{loc}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Individual patch card ──
function PatchCard({ patch, baseMap, onAccept, onReject, onFocus }) {
  const label = buildLabel(patch);
  const newVal = formatValue(patch.value);
  const oldVal = formatValue(getPatchCurrentValue(patch, baseMap));
  const canShowDiff = oldVal != null && newVal != null && oldVal !== newVal;

  return (
    <li
      data-testid="exam-review-patch"
      className="flex flex-col gap-1.5 bg-white/70 rounded-squircle-xs border border-violet-100/80 px-2.5 py-2 text-[10px] min-w-0 overflow-hidden"
    >
      {/* Location + buttons */}
      <div className="flex items-start justify-between gap-1.5">
        <span className="font-semibold text-slate-700 leading-snug break-words min-w-0">{label}</span>
        <div className="flex items-center gap-1 flex-shrink-0">
          {onFocus && (
            <button
              type="button"
              onClick={onFocus}
              className="text-[9px] font-semibold text-violet-700 bg-violet-50 px-1.5 py-0.5 rounded border border-violet-200/60 hover:bg-violet-100 transition-colors duration-100 whitespace-nowrap"
            >
              Review
            </button>
          )}
          <button
            onClick={onAccept}
            className="text-[9px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/60 hover:bg-emerald-100 transition-colors duration-100 whitespace-nowrap"
          >
            Accept
          </button>
          <button
            onClick={onReject}
            className="text-[9px] font-semibold text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200/60 hover:bg-slate-100 transition-colors duration-100 whitespace-nowrap"
          >
            Keep mine
          </button>
        </div>
      </div>
      {canShowDiff && (
        <div className="grid gap-1 rounded border border-slate-100 bg-slate-50/70 p-2 leading-relaxed">
          <div>
            <span className="block text-[9px] font-bold uppercase tracking-wide text-slate-400">Current</span>
            <span className="text-slate-500 line-through decoration-red-300">{oldVal}</span>
          </div>
          <div>
            <span className="block text-[9px] font-bold uppercase tracking-wide text-violet-400">Suggested</span>
            <span className="text-violet-700">{newVal}</span>
          </div>
        </div>
      )}
      {/* Proposed value */}
      {newVal && !canShowDiff && (
        <div className="text-violet-700 bg-violet-50/60 rounded px-2 py-1 leading-relaxed border border-violet-100/50 break-words">
          <span className="text-violet-400 font-semibold mr-1">AI suggests:</span>
          {newVal}
        </div>
      )}
      {/* Reason */}
      {patch.reason && <div className="text-slate-500 italic leading-relaxed break-words">{patch.reason}</div>}
    </li>
  );
}

function getPatchCurrentValue(patch, baseMap) {
  if (!patch || !baseMap) return null;
  if (patch.field === 'courseName') return baseMap.courseName ?? '';
  if (patch.field === 'semester') return baseMap.semester ?? '';
  const lesson = baseMap.lessons?.[patch.lessonIndex];
  if (patch.field === 'title') return lesson?.title ?? '';
  if (patch.sectionIndex != null && patch.field) return lesson?.sections?.[patch.sectionIndex]?.[patch.field] ?? '';
  return null;
}

function buildLabel(p) {
  const label = (p.field || '')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
  if (p.action === 'addLesson') return `Add Lesson ${(p.lessonIndex || 0) + 1}`;
  if (p.action === 'addSection') return `Add section in Lesson ${(p.lessonIndex || 0) + 1}`;
  if (p.action === 'removeLesson') return `Remove Lesson ${(p.lessonIndex || 0) + 1}`;
  if (p.action === '_fullMapFallback') return 'Revised course map';
  if (p.field === 'title') return `Lesson ${(p.lessonIndex || 0) + 1} title`;
  if (p.field === 'courseName' || p.field === 'semester') return label;
  return `Lesson ${(p.lessonIndex || 0) + 1}, Section ${(p.sectionIndex || 0) + 1} — ${label}`;
}

function formatValue(val) {
  if (val == null) return null;
  if (typeof val === 'string') return val.length > 160 ? val.slice(0, 160) + '…' : val;
  if (typeof val === 'object') return null; // don't show full map object
  return String(val);
}
