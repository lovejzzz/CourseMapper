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
      targets: summarizeTargets(
        group.items.flatMap((step) => step.targets || []),
        3,
      ),
      _count: total,
    };
  });
}

function summarizeTargets(targets = [], max = 3) {
  const unique = [];
  for (const target of targets) {
    const label = String(target || '').trim();
    if (label && !unique.includes(label)) unique.push(label);
  }
  if (unique.length <= max) return unique;
  return [...unique.slice(0, max), `+${unique.length - max} more`];
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

const ACTION_TOOLS = new Set([
  'edit_course_map',
  'edit_deliverables',
  'generate_slide_images',
  'finalize_package',
  'repair_package_readiness',
  'retry_package_weak_spots',
  'save_preference',
  'remember',
  'forget',
  'undo_last',
  'create_tool',
  'run_tool',
]);

const WORKSPACE_ACTION_TOOLS = new Set([
  'edit_course_map',
  'edit_deliverables',
  'generate_slide_images',
  'finalize_package',
  'repair_package_readiness',
  'retry_package_weak_spots',
  'undo_last',
]);

const MEMORY_ACTION_TOOLS = new Set(['save_preference', 'remember', 'forget', 'create_tool', 'run_tool']);

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function buildAgentRunOutcome(steps = [], { status = 'complete', mode = '' } = {}) {
  const safeSteps = Array.isArray(steps) ? steps.filter(Boolean) : [];
  if (safeSteps.length === 0) {
    return {
      label: status === 'running' ? 'Waiting for tools' : 'No tool activity',
      tone: 'slate',
    };
  }

  const workspaceSteps = safeSteps.filter((step) => WORKSPACE_ACTION_TOOLS.has(step.tool));
  const memorySteps = safeSteps.filter((step) => MEMORY_ACTION_TOOLS.has(step.tool));
  const issueCount = safeSteps.filter((step) => step.status === 'error' || step.status === 'partial').length;
  const completedWorkspaceSteps = workspaceSteps.filter((step) => step.status === 'done' || step.status === 'partial');
  const runningWorkspaceStep = workspaceSteps.some((step) => step.status === 'running');
  const completedMemorySteps = memorySteps.filter((step) => step.status === 'done' || step.status === 'partial');
  const failedWorkspaceOnly = workspaceSteps.length > 0 && completedWorkspaceSteps.length === 0 && issueCount > 0;

  if (status === 'running') {
    if (runningWorkspaceStep) return { label: 'Editing now', tone: 'indigo' };
    if (completedWorkspaceSteps.length > 0) return { label: 'Workspace updated', tone: 'emerald' };
    return { label: 'Inspecting', tone: 'slate' };
  }

  if (failedWorkspaceOnly) return { label: 'Action failed', tone: 'red' };
  if (issueCount > 0 && completedWorkspaceSteps.length > 0) return { label: 'Changes need review', tone: 'amber' };
  if (completedWorkspaceSteps.length > 0) return { label: 'Workspace updated', tone: 'emerald' };
  if (completedMemorySteps.length > 0) return { label: 'Agent memory updated', tone: 'indigo' };
  if (
    String(mode || '')
      .toLowerCase()
      .includes('review')
  )
    return { label: 'No workspace edits', tone: 'slate' };
  return { label: 'No workspace edits', tone: 'slate' };
}

export function buildAgentActivityReceipt(steps = []) {
  const safeSteps = Array.isArray(steps) ? steps.filter(Boolean) : [];
  if (safeSteps.length === 0) return [];

  const actionCount = safeSteps.filter((step) => ACTION_TOOLS.has(step.tool)).length;
  const checkCount = safeSteps.length - actionCount;
  const issueCount = safeSteps.filter((step) => step.status === 'error' || step.status === 'partial').length;
  const uniqueTargets = summarizeTargets(
    safeSteps.flatMap((step) => step.targets || []),
    2,
  );

  return [
    pluralize(safeSteps.length, 'tool'),
    checkCount > 0 ? pluralize(checkCount, 'check') : null,
    actionCount > 0 ? pluralize(actionCount, 'action') : null,
    issueCount > 0 ? pluralize(issueCount, 'issue') : '0 issues',
    uniqueTargets.length > 0 ? uniqueTargets.join(', ') : null,
  ].filter(Boolean);
}

function summarizeIssueContext(issueSteps = [], runMeta = {}) {
  const issueLabels = summarizeTargets(
    issueSteps.map((step) => step.label || step.tool || step.summary || '').filter(Boolean),
    2,
  );
  const issueTargets = summarizeTargets(
    issueSteps.flatMap((step) => step.targets || []),
    3,
  );
  const targetText = issueTargets.length > 0 ? issueTargets.join(', ') : runMeta?.target || 'the current workspace';
  const issueText = issueLabels.length > 0 ? issueLabels.join(', ') : 'the failed step';
  return { issueText, targetText };
}

function isPackageIssueStep(step) {
  if (!step) return false;
  if (['finalize_package', 'repair_package_readiness', 'retry_package_weak_spots'].includes(step.tool)) return true;
  return (step.targets || []).some((target) =>
    String(target || '')
      .toLowerCase()
      .includes('package'),
  );
}

export function buildAgentRecoveryActions(steps = [], { status = 'complete', runMeta = null } = {}) {
  if (status === 'running') return [];

  const safeSteps = Array.isArray(steps) ? steps.filter(Boolean) : [];
  const issueSteps = safeSteps.filter((step) => step.status === 'error' || step.status === 'partial');
  if (issueSteps.length === 0) return [];

  const { issueText, targetText } = summarizeIssueContext(issueSteps, runMeta || {});
  const hasWorkspaceIssue = issueSteps.some((step) => WORKSPACE_ACTION_TOOLS.has(step.tool));
  const hasPackageIssue = issueSteps.some(isPackageIssueStep);
  const actions = [];

  if (hasPackageIssue) {
    actions.push({
      id: 'review-package-issues',
      label: 'Review issues',
      displayText: 'Review package issues',
      localIntent: 'audit-package',
      prompt: [
        'Review the package issues from the previous Agent run before applying changes.',
        `Focus on ${targetText}.`,
        `The issue appeared around: ${issueText}.`,
        'Run read-only checks first, identify the smallest safe fix, and say whether the package needs automatic repair, localized regeneration, or instructor review.',
      ].join(' '),
    });
  }

  if (hasWorkspaceIssue && status !== 'error') {
    actions.push({
      id: 'retry-safe-fixes',
      label: 'Retry safe fixes',
      displayText: 'Retry safe fixes',
      localIntent: hasPackageIssue ? 'finish-package' : 'model-agent',
      prompt: [
        'Retry only the failed or partial workspace fixes from the previous Agent run.',
        `Focus on ${targetText}.`,
        `The incomplete step was: ${issueText}.`,
        'Use the smallest safe scope, verify the affected material, and stop if the next step requires an instructor decision.',
      ].join(' '),
    });
  }

  actions.push({
    id: 'plan-recovery',
    label: 'Plan recovery',
    displayText: 'Plan recovery',
    localIntent: 'plan-next',
    prompt: [
      'Inspect the failed or partial Agent run and plan the recovery path.',
      `Focus on ${targetText}.`,
      `The issue appeared around: ${issueText}.`,
      'Call inspect_workspace and plan_workspace_next_step if available. Do not apply changes until you identify the smallest safe next action.',
    ].join(' '),
  });

  const unique = [];
  actions.forEach((action) => {
    if (!unique.some((existing) => existing.id === action.id)) unique.push(action);
  });
  return unique.slice(0, 2);
}

function statusTitle(status, tone, currentStep) {
  if (status === 'running') return currentStep?.label || currentStep?.tool || 'Thinking';
  if (status === 'error' || tone === 'error') return 'Needs attention';
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

export default function AgentProgressCard({
  steps = [],
  status = 'running',
  thinkingText = '',
  startedAt,
  endedAt,
  runMeta = null,
  onRecoveryAction,
}) {
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
  const activityReceipt = useMemo(() => buildAgentActivityReceipt(steps), [steps]);
  const runOutcome = useMemo(
    () => buildAgentRunOutcome(steps, { status, mode: runMeta?.mode }),
    [runMeta?.mode, status, steps],
  );
  const recoveryActions = useMemo(
    () => buildAgentRecoveryActions(steps, { status, runMeta }),
    [runMeta, status, steps],
  );

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
  const runTargets = summarizeTargets(
    steps.flatMap((step) => step.targets || []),
    3,
  );
  const receiptParts = [
    runMeta?.mode,
    runTargets.length > 0 ? runTargets.join(', ') : runMeta?.target,
    runMeta?.model,
  ].filter(Boolean);
  const receiptMeta = receiptParts.length > 0 ? `${receiptParts.join(' · ')} · ${progressMeta}` : progressMeta;

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

            <p className="mt-0.5 text-[10px] font-medium text-slate-400">{receiptMeta}</p>

            {(runOutcome || activityReceipt.length > 0) && (
              <div
                data-testid="agent-activity-receipt"
                className="mt-1 flex flex-wrap gap-1.5 text-[10px] font-semibold"
                aria-label={`Agent activity receipt: ${[runOutcome?.label, ...activityReceipt].filter(Boolean).join(', ')}`}
              >
                {runOutcome && (
                  <span
                    data-testid="agent-run-outcome"
                    className={`rounded-full border px-1.5 py-0.5 ${OUTCOME_TONES[runOutcome.tone] || OUTCOME_TONES.slate}`}
                  >
                    {runOutcome.label}
                  </span>
                )}
                {activityReceipt.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-slate-200/70 bg-white/70 px-1.5 py-0.5 text-slate-500"
                  >
                    {item}
                  </span>
                ))}
              </div>
            )}

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

            {!isRunning && recoveryActions.length > 0 && onRecoveryAction && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {recoveryActions.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    data-testid={`agent-progress-action-${action.id}`}
                    onClick={() => onRecoveryAction(action)}
                    className={`tactile inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-bold transition-colors ${
                      action.id === 'plan-recovery'
                        ? 'border-slate-200/80 bg-white/75 text-slate-600 hover:bg-slate-50'
                        : 'border-indigo-200/80 bg-indigo-50/80 text-indigo-700 hover:bg-indigo-100/80'
                    }`}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
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
                  {step.targets?.length > 0 && <span className="ml-1 text-slate-400">· {step.targets.join(', ')}</span>}
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

const OUTCOME_TONES = {
  slate: 'border-slate-200/70 bg-white/70 text-slate-500',
  indigo: 'border-indigo-200/70 bg-indigo-50 text-indigo-700',
  emerald: 'border-emerald-200/70 bg-emerald-50 text-emerald-700',
  amber: 'border-amber-200/70 bg-amber-50 text-amber-700',
  red: 'border-red-200/70 bg-red-50 text-red-700',
};
