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
    // Grouped — compute aggregate status
    const doneCount = g.items.filter(s => s.status === 'done').length;
    const errorCount = g.items.filter(s => s.status === 'error').length;
    const runningCount = g.items.filter(s => s.status === 'running').length;
    const total = g.items.length;
    const aggregateStatus = runningCount > 0 ? 'running' : errorCount > 0 ? 'error' : 'done';
    const summary = aggregateStatus === 'running'
      ? `${doneCount}/${total} done`
      : aggregateStatus === 'done'
        ? `${total} items`
        : `${errorCount} failed`;
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

export default function AgentProgressCard({ steps = [], status = 'running' }) {
  const [expanded, setExpanded] = useState(true);
  const isComplete = status === 'complete';
  const isError = status === 'error';
  const prevStatusRef = useRef(status);
  const groupedSteps = groupSteps(steps);

  // Timer for elapsed time
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (status !== 'running') return;
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [status]);

  const formatTime = (s) => s < 60 ? `${s}s` : `${Math.floor(s/60)}m ${s%60}s`;

  // Auto-collapse when agent finishes — transition from running → complete/error
  useEffect(() => {
    if ((isComplete || isError) && prevStatusRef.current === 'running') {
      setExpanded(false);
    }
    prevStatusRef.current = status;
  }, [status, isComplete, isError]);

  const showSteps = isComplete || isError ? expanded : true;

  // If no steps yet, show "Thinking..."
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
      </div>
    );
  }

  return (
    <div className="mx-2 my-1 rounded-xl bg-violet-50/60 border border-violet-200/30 shadow-glass overflow-hidden animate-spring-in">
      {/* Header */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full px-3.5 py-2 flex items-center gap-2 hover:bg-violet-50/80 transition-colors"
      >
        <div className="w-5 h-5 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
          {status === 'running' ? (
            <svg className="w-3 h-3 text-violet-600 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-3 h-3 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          )}
        </div>
        <span className="text-[13px] font-semibold text-violet-700 flex-1 text-left">
          {isComplete
            ? `Agent completed — ${groupedSteps.length} action${groupedSteps.length !== 1 ? 's' : ''} · ${formatTime(elapsed)}`
            : isError
              ? 'Agent encountered an error'
              : `Agent working... (${groupedSteps.length} action${groupedSteps.length !== 1 ? 's' : ''}) · ${formatTime(elapsed)}`
          }
        </span>
        <svg
          className={`w-3 h-3 text-violet-400 transition-transform duration-200 ${showSteps ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Steps — scrollable when many */}
      {showSteps && (
        <div className="px-3.5 pb-3 border-t border-violet-100/50 max-h-36 overflow-y-auto">
          <div className="space-y-1.5 pt-2">
            {groupedSteps.map((step, i) => (
              <div key={i} className="flex items-start gap-2">
                {/* Status icon */}
                <div className="mt-0.5 flex-shrink-0">
                  {step.status === 'running' ? (
                    <svg className="w-3.5 h-3.5 text-violet-500 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : step.status === 'error' ? (
                    <svg className="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>

                {/* Step details */}
                <div className="flex-1 min-w-0">
                  <span className="text-[12px] font-medium text-violet-800">
                    {step.label || step.tool}
                  </span>
                  {step._count > 1 && (
                    <span className="text-[11px] text-violet-500 ml-1.5">
                      ×{step._count}
                    </span>
                  )}
                  {step.summary && (
                    <span className="text-[11px] text-violet-600/70 ml-1.5">
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
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
