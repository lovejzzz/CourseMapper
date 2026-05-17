import React, { useEffect, useMemo, useRef, useState } from 'react';

function groupSteps(steps) {
  if (!steps.length) return [];

  const groups = [];
  let current = { label: steps[0].label || steps[0].tool || 'Working', items: [steps[0]] };

  for (let i = 1; i < steps.length; i++) {
    const stepLabel = steps[i].label || steps[i].tool || 'Working';
    if (stepLabel === current.label) {
      current.items.push(steps[i]);
    } else {
      groups.push(current);
      current = { label: stepLabel, items: [steps[i]] };
    }
  }
  groups.push(current);

  return groups.map((group) => {
    if (group.items.length === 1) return { ...group.items[0], _count: 1, label: group.label };

    const doneCount = group.items.filter((step) => step.status === 'done').length;
    const errorCount = group.items.filter((step) => step.status === 'error').length;
    const partialCount = group.items.filter((step) => step.status === 'partial').length;
    const runningCount = group.items.filter((step) => step.status === 'running').length;
    const issueCount = errorCount + partialCount;
    const total = group.items.length;
    const aggregateStatus =
      runningCount > 0 ? 'running' : errorCount > 0 ? 'error' : partialCount > 0 ? 'partial' : 'done';

    return {
      label: group.label,
      status: aggregateStatus,
      summary:
        aggregateStatus === 'running'
          ? `${doneCount}/${total} done`
          : aggregateStatus === 'done'
            ? `${total} items`
            : `${issueCount} with issues`,
      thought: group.items.find((step) => step.status === 'running')?.thought,
      _count: total,
    };
  });
}

function getElapsedSeconds(startedAt, endedAt) {
  if (!startedAt) return 0;
  const end = endedAt || Date.now();
  const elapsedMs = Math.max(0, end - startedAt);
  if (elapsedMs > 0 && elapsedMs < 1000) return 1;
  return Math.floor(elapsedMs / 1000);
}

function formatTime(seconds) {
  if (seconds <= 0) return 'under 1s';
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function latestStep(steps, status) {
  for (let i = steps.length - 1; i >= 0; i--) {
    if (status === 'running' && steps[i].status === 'running') return steps[i];
  }
  return steps[steps.length - 1] || null;
}

function previousDoneStep(steps) {
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i].status === 'done' || steps[i].status === 'partial') return steps[i];
  }
  return null;
}

function statusTitle(status, tone, currentStep) {
  if (status === 'running') return currentStep?.label || currentStep?.tool || 'Thinking';
  if (status === 'error' || tone === 'error') return 'Needs review';
  if (tone === 'partial') return 'Finished with issues';
  return 'Work complete';
}

function StatusIcon({ status, tone }) {
  if (status === 'running') {
    return (
      <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-40 animate-ping" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-indigo-500" />
      </span>
    );
  }
  if (tone === 'error') {
    return (
      <svg
        className="h-3.5 w-3.5 text-red-500"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2.3}
          d="M12 9v4m0 4h.01M4.93 19h14.14c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.2 16c-.77 1.33.19 3 1.73 3z"
        />
      </svg>
    );
  }
  if (tone === 'partial') {
    return (
      <svg className="h-3.5 w-3.5 text-amber-500" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2 1 21h22L12 2Zm1 16h-2v-2h2v2Zm0-4h-2V9h2v5Z" />
      </svg>
    );
  }
  return (
    <svg
      className="h-3.5 w-3.5 text-emerald-500"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="m5 13 4 4L19 7" />
    </svg>
  );
}

function StepIcon({ status }) {
  if (status === 'running') {
    return <span className="mt-1 h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" aria-hidden="true" />;
  }
  if (status === 'error') {
    return <span className="mt-1 h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden="true" />;
  }
  if (status === 'partial') {
    return <span className="mt-1 h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />;
  }
  return <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />;
}

export default function AgentProgressCard({ steps = [], status = 'running', thinkingText = '', startedAt, endedAt }) {
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(Date.now());
  const prevStatusRef = useRef(status);
  const localStartedAtRef = useRef(Date.now());
  const effectiveStartedAt = startedAt || localStartedAtRef.current;

  useEffect(() => {
    if (status !== 'running') return undefined;
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [status]);

  const groupedSteps = useMemo(() => groupSteps(steps), [steps]);
  const doneCount = steps.filter((step) => step.status === 'done').length;
  const issueCount = steps.filter((step) => step.status === 'error' || step.status === 'partial').length;
  const current = latestStep(steps, status);
  const previousDone = previousDoneStep(steps);
  const isRunning = status === 'running';
  const tone =
    status === 'error' || steps.some((step) => step.status === 'error') ? 'error' : issueCount > 0 ? 'partial' : 'ok';
  const title = statusTitle(status, tone, current);
  const styles = TONES[tone];
  const elapsed = getElapsedSeconds(effectiveStartedAt, status === 'running' ? now : endedAt || now);
  const slow = isRunning && elapsed >= 20;

  useEffect(() => {
    if (prevStatusRef.current === 'running' && status !== 'running') {
      setExpanded(issueCount > 0);
    }
    prevStatusRef.current = status;
  }, [status, issueCount]);

  const currentSummary = current?.summary || current?.thought || thinkingText;
  const progressMeta = isRunning
    ? `${doneCount}/${steps.length || 1} done · ${formatTime(elapsed)}`
    : `${steps.length || groupedSteps.length || 1} step${(steps.length || groupedSteps.length || 1) === 1 ? '' : 's'} · ${formatTime(elapsed)}`;

  return (
    <div
      className={`ml-8 mr-1 rounded-lg border ${styles.border} bg-white/70 shadow-sm animate-spring-in overflow-hidden`}
    >
      <div className="px-3 py-2">
        <div className="flex items-start gap-2.5">
          <div className={`mt-1 flex h-5 w-5 items-center justify-center rounded-full ${styles.iconBg}`}>
            <StatusIcon status={status} tone={tone} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-start justify-between gap-2">
              <p className={`min-w-0 text-[12px] font-semibold leading-snug ${styles.title}`}>
                {slow ? 'Still working' : title}
              </p>
            </div>

            <p className="mt-0.5 text-[10px] font-medium text-slate-400">{progressMeta}</p>

            <p className="mt-0.5 line-clamp-3 text-[11px] leading-relaxed text-slate-500">
              {isRunning
                ? currentSummary || 'Planning the next step...'
                : currentSummary ||
                  (tone === 'ok' ? 'All requested actions finished.' : 'Review the details before continuing.')}
            </p>

            {slow && previousDone && (
              <p className="mt-1 text-[10px] text-slate-400">
                Last completed: {previousDone.label || previousDone.tool}
              </p>
            )}
          </div>

          {(groupedSteps.length > 0 || thinkingText) && (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="tactile mt-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 hover:bg-slate-100/80 hover:text-slate-600"
              aria-expanded={expanded}
              aria-label={expanded ? 'Hide agent progress details' : 'Show agent progress details'}
            >
              {expanded ? 'Hide' : 'Details'}
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-200/50 px-3 py-2">
          {thinkingText && (
            <p className="mb-2 rounded-md bg-slate-50 px-2 py-1.5 text-[11px] leading-relaxed text-slate-500">
              {thinkingText.slice(-220)}
            </p>
          )}
          <div className="space-y-1.5">
            {groupedSteps.map((step, index) => (
              <div
                key={`${step.label || step.tool}-${index}`}
                className="flex items-start gap-2 text-[11px] leading-relaxed"
              >
                <StepIcon status={step.status} />
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-slate-600">{step.label || step.tool}</span>
                  {step._count > 1 && <span className="ml-1 text-slate-400">x{step._count}</span>}
                  {step.summary && <span className="ml-1 text-slate-400">{step.summary}</span>}
                  {step.thought && step.status === 'running' && (
                    <p className="truncate text-[10px] text-slate-400">{step.thought}</p>
                  )}
                </div>
              </div>
            ))}
            {groupedSteps.length === 0 && (
              <p className="text-[11px] text-slate-400">Waiting for the first tool update.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const TONES = {
  ok: {
    border: 'border-slate-200/70',
    iconBg: 'bg-indigo-50',
    title: 'text-slate-700',
  },
  partial: {
    border: 'border-amber-200/70',
    iconBg: 'bg-amber-50',
    title: 'text-amber-800',
  },
  error: {
    border: 'border-red-200/70',
    iconBg: 'bg-red-50',
    title: 'text-red-700',
  },
};
