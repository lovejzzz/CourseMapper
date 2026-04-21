import React, { useState, useEffect, useRef } from 'react';

/**
 * AgentProgressCard — Shows the agent's step-by-step progress during multi-tool operations.
 *
 * While running: expanded with scrollable steps area.
 * After completion: auto-collapses to a one-line summary, re-expandable.
 */
/**
 * Group consecutive steps with the same label into single entries.
 * e.g. 15× "Reading lesson data" → one row: "Reading lesson data · 15 items"
 */
function groupSteps(steps) {
  if (steps.length === 0) return [];
  const groups = [];
  let current = { label: steps[0].label || steps[0].tool, items: [steps[0]] };

  for (let i = 1; i < steps.length; i++) {
    const stepLabel = steps[i].label || steps[i].tool;
    if (stepLabel === current.label) {
      current.items.push(steps[i]);
    } else {
      groups.push(current);
      current = { label: stepLabel, items: [steps[i]] };
    }
  }
  groups.push(current);

  return groups.map(g => {
    if (g.items.length === 1) {
      // Single step — return as-is
      return { ...g.items[0], _count: 1 };
    }
    // Grouped — compute aggregate status. `partial` is treated as an issue
    // alongside `error` for the aggregate, but retains its distinct icon for
    // single-step rows.
    const doneCount = g.items.filter(s => s.status === 'done').length;
    const errorCount = g.items.filter(s => s.status === 'error').length;
    const partialCount = g.items.filter(s => s.status === 'partial').length;
    const runningCount = g.items.filter(s => s.status === 'running').length;
    const issueCount = errorCount + partialCount;
    const total = g.items.length;
    const aggregateStatus = runningCount > 0 ? 'running'
      : errorCount > 0 ? 'error'
      : partialCount > 0 ? 'partial'
      : 'done';
    const summary = aggregateStatus === 'running'
      ? `${doneCount}/${total} done`
      : aggregateStatus === 'done'
        ? `${total} items`
        : `${issueCount} with issues`;
    return {
      label: g.label,
      status: aggregateStatus,
      summary,
      _count: total,
      // Keep the latest thought if any step is running
      thought: g.items.find(s => s.status === 'running')?.thought,
    };
  });
}

/** Single source of truth for the status icon used in both the header and the step list. */
function StatusIcon({ status, className = 'w-3.5 h-3.5' }) {
  if (status === 'running') {
    return (
      <svg className={`${className} text-violet-500 animate-spin`} fill="none" viewBox="0 0 24 24" aria-hidden="true">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    );
  }
  if (status === 'error') {
    return (
      <svg className={`${className} text-red-500`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    );
  }
  if (status === 'partial') {
    // Amber triangle — signals "landed, but not cleanly", visually distinct
    // from both ✓ (done) and ✗ (error). Pairs with the ChangeSummaryCard's
    // mixed tone, which sits right below in the chat stream.
    return (
      <svg className={`${className} text-amber-500`} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2L1 21h22L12 2zm1 16h-2v-2h2v2zm0-4h-2V9h2v5z" />
      </svg>
    );
  }
  return (
    <svg className={`${className} text-green-500`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

export default function AgentProgressCard({ steps = [], status = 'running', thinkingText = '' }) {
  const [expanded, setExpanded] = useState(true);
  const isComplete = status === 'complete';
  const isError = status === 'error';
  const prevStatusRef = useRef(status);
  const groupedSteps = groupSteps(steps);

  // How many of the actual (ungrouped) steps ended with trouble. Counts both
  // full errors and partial outcomes, so a single edit_deliverables that did
  // half its patches registers as one issue — matching what the user sees
  // in the ChangeSummaryCard that renders right below.
  const errorStepCount = steps.filter(s => s.status === 'error').length;
  const partialStepCount = steps.filter(s => s.status === 'partial').length;
  const issueCount = errorStepCount + partialStepCount;
  const hasIssues = issueCount > 0;
  // Aggregate status mood. Overrides the incoming `status` prop so the
  // completed card renders in amber when any step had issues, rather than
  // violet-"complete" which would suggest the agent ran cleanly.
  const tone = isError || (isComplete && errorStepCount > 0 && partialStepCount === 0)
    ? 'error'
    : hasIssues ? 'partial'
    : 'ok';
  const toneStyles = CARD_TONE[tone];

  // Timer for elapsed time
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (status !== 'running') return;
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [status]);

  const formatTime = (s) => s < 60 ? `${s}s` : `${Math.floor(s/60)}m ${s%60}s`;

  // Auto-collapse when agent finishes — BUT preserve the step trail when
  // there were issues. The ChangeSummaryCard below handles detail + actions;
  // this card just keeps the execution context visible so users can see the
  // exact sequence that led to the trouble.
  useEffect(() => {
    if ((isComplete || isError) && prevStatusRef.current === 'running') {
      setExpanded(hasIssues);
    }
    prevStatusRef.current = status;
  }, [status, isComplete, isError, hasIssues]);

  const showSteps = isComplete || isError ? expanded : true;

  // If no steps yet, show "Thinking..." with optional streaming text preview
  if (steps.length === 0 && status === 'running') {
    return (
      <div className="mx-2 my-1 rounded-xl bg-violet-50/60 border border-violet-200/30 shadow-glass p-3.5">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-violet-500 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-[13px] font-semibold text-violet-700">Thinking...</span>
        </div>
        {thinkingText && (
          <p className="mt-1.5 ml-6 text-[11px] text-violet-500/70 italic line-clamp-2">
            {thinkingText.slice(-150)}
          </p>
        )}
      </div>
    );
  }

  // Header text — tone-aware so a completed turn with issues doesn't read
  // as a clean success.
  let headerText;
  if (isError && errorStepCount === 0) {
    headerText = 'Agent encountered an error';
  } else if (isComplete && hasIssues) {
    const label = `${issueCount} ${issueCount === 1 ? 'issue' : 'issues'}`;
    headerText = `Agent finished with ${label} — ${groupedSteps.length} action${groupedSteps.length !== 1 ? 's' : ''} · ${formatTime(elapsed)}`;
  } else if (isComplete) {
    headerText = `Agent completed — ${groupedSteps.length} action${groupedSteps.length !== 1 ? 's' : ''} · ${formatTime(elapsed)}`;
  } else if (isError) {
    // Error status AND we have step-level detail — surface the first error's summary.
    const firstIssue = steps.find(s => s.status === 'error' || s.status === 'partial');
    headerText = firstIssue?.summary
      ? `Agent encountered an error — ${firstIssue.summary}`
      : 'Agent encountered an error';
  } else {
    headerText = `Agent working… (${groupedSteps.length} action${groupedSteps.length !== 1 ? 's' : ''}) · ${formatTime(elapsed)}`;
  }

  return (
    <div className={`mx-2 my-1 rounded-xl ${toneStyles.bg} border ${toneStyles.border} shadow-glass overflow-hidden animate-spring-in`}>
      {/* Header */}
      <button
        onClick={() => setExpanded(v => !v)}
        className={`w-full px-3.5 py-2 flex items-center gap-2 ${toneStyles.hover} transition-colors`}
        aria-expanded={showSteps}
        aria-label={showSteps ? 'Collapse agent progress' : 'Expand agent progress'}
      >
        <div className={`w-5 h-5 rounded-full ${toneStyles.iconBg} flex items-center justify-center flex-shrink-0`}>
          {status === 'running' ? (
            <svg className={`w-3 h-3 ${toneStyles.iconFg} animate-spin`} fill="none" viewBox="0 0 24 24" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : tone === 'error' ? (
            <svg className={`w-3 h-3 ${toneStyles.iconFg}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
            </svg>
          ) : tone === 'partial' ? (
            <svg className={`w-3 h-3 ${toneStyles.iconFg}`} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 2L1 21h22L12 2zm1 16h-2v-2h2v2zm0-4h-2V9h2v5z" />
            </svg>
          ) : (
            <svg className={`w-3 h-3 ${toneStyles.iconFg}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          )}
        </div>
        <span className={`text-[13px] font-semibold ${toneStyles.title} flex-1 text-left`}>
          {headerText}
        </span>
        <svg
          className={`w-3 h-3 ${toneStyles.chevron} transition-transform duration-200 ${showSteps ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Steps — scrollable when many */}
      {showSteps && (
        <div className={`px-3.5 pb-3 border-t ${toneStyles.divider} max-h-36 overflow-y-auto`}>
          <div className="space-y-1.5 pt-2">
            {groupedSteps.map((step, i) => {
              const isIssueRow = step.status === 'error' || step.status === 'partial';
              return (
                <div key={i} className="flex items-start gap-2">
                  <div className="mt-0.5 flex-shrink-0">
                    <StatusIcon status={step.status} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className={`text-[12px] font-medium ${isIssueRow ? 'text-slate-700' : 'text-violet-800'}`}>
                      {step.label || step.tool}
                    </span>
                    {step._count > 1 && (
                      <span className="text-[11px] text-violet-500 ml-1.5">
                        ×{step._count}
                      </span>
                    )}
                    {step.summary && (
                      <span className={`text-[11px] ml-1.5 ${
                        step.status === 'error' ? 'text-red-600' :
                        step.status === 'partial' ? 'text-amber-700' :
                        'text-violet-600/70'
                      }`}>
                        — {step.summary}
                      </span>
                    )}
                    {step.thought && step.status === 'running' && (
                      <p className="text-[11px] text-violet-500/60 italic mt-0.5 truncate">
                        {step.thought}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Tone styling for the whole card — matches the tones on ChangeSummaryCard
// so the two cards read as a matched pair when they sit next to each other.
const CARD_TONE = {
  ok: {
    bg: 'bg-violet-50/60', border: 'border-violet-200/30', hover: 'hover:bg-violet-50/80',
    iconBg: 'bg-violet-100', iconFg: 'text-violet-600',
    title: 'text-violet-700', chevron: 'text-violet-400', divider: 'border-violet-100/50',
  },
  partial: {
    bg: 'bg-amber-50/60', border: 'border-amber-200/40', hover: 'hover:bg-amber-50/80',
    iconBg: 'bg-amber-100', iconFg: 'text-amber-600',
    title: 'text-amber-800', chevron: 'text-amber-400', divider: 'border-amber-100/50',
  },
  error: {
    bg: 'bg-red-50/60', border: 'border-red-200/40', hover: 'hover:bg-red-50/80',
    iconBg: 'bg-red-100', iconFg: 'text-red-600',
    title: 'text-red-700', chevron: 'text-red-400', divider: 'border-red-100/50',
  },
};
