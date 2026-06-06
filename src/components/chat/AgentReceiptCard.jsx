import React from 'react';

const TONES = {
  done: {
    wrapper: 'border-emerald-200/70 bg-emerald-50/70',
    icon: 'bg-emerald-100 text-emerald-600',
    title: 'text-emerald-800',
    badge: 'border-emerald-200 bg-emerald-100/80 text-emerald-700',
    body: 'text-emerald-700',
    dot: 'bg-emerald-500',
  },
  review: {
    wrapper: 'border-amber-200/70 bg-amber-50/70',
    icon: 'bg-amber-100 text-amber-600',
    title: 'text-amber-900',
    badge: 'border-amber-200 bg-amber-100/80 text-amber-800',
    body: 'text-amber-800',
    dot: 'bg-amber-500',
  },
  blocked: {
    wrapper: 'border-red-200/70 bg-red-50/70',
    icon: 'bg-red-100 text-red-600',
    title: 'text-red-800',
    badge: 'border-red-200 bg-red-100/80 text-red-700',
    body: 'text-red-700',
    dot: 'bg-red-500',
  },
};

const ACTION_STATE_LABELS = {
  running: 'Running',
  done: 'Done',
  sent: 'Sent to Agent',
  error: 'Error',
};

function normalizeList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  const text = String(value || '').trim();
  return text ? [text] : [];
}

function normalizeVerification(value) {
  if (!value || typeof value !== 'object') return null;
  const status = String(value.status || '').trim();
  const label = String(value.label || '').trim();
  if (!status && !label) return null;
  return {
    ...value,
    status,
    label,
  };
}

function normalizePlanning(value) {
  if (!value || typeof value !== 'object') return null;
  const status = String(value.status || '').trim();
  const label = String(value.label || '').trim();
  if (!status && !label) return null;
  return {
    ...value,
    status,
    label,
    required: value.required === true,
    hasPlan: value.hasPlan === true,
  };
}

function normalizeStateDiffs(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const status = String(item.status || '').trim();
      const action = String(item.action || '').trim();
      const target = String(item.target || '').trim();
      const before = String(item.before || '').trim();
      const after = String(item.after || '').trim();
      const reason = String(item.reason || '').trim();
      const path = String(item.path || '').trim();
      if (!status && !action && !target && !before && !after && !reason) return null;
      return { status, action, target, before, after, reason, path };
    })
    .filter(Boolean)
    .slice(0, 8);
}

function normalizeQualityScorecard(value) {
  if (!value || typeof value !== 'object') return null;
  const score = Number(value.score);
  const maxScore = Number(value.maxScore || 100);
  const label = String(value.label || '').trim();
  const dimensions = Array.isArray(value.dimensions)
    ? value.dimensions
        .map((dimension) => {
          if (!dimension || typeof dimension !== 'object') return null;
          const id = String(dimension.id || '').trim();
          const dimensionLabel = String(dimension.label || id).trim();
          const status = String(dimension.status || '').trim();
          const dimensionScore =
            typeof dimension.score === 'number' && Number.isFinite(dimension.score) ? dimension.score : null;
          if (!id && !dimensionLabel) return null;
          return { id, label: dimensionLabel, status, score: dimensionScore };
        })
        .filter(Boolean)
        .slice(0, 5)
    : [];
  if (!Number.isFinite(score) && !dimensions.length) return null;
  return {
    score: Number.isFinite(score) ? score : null,
    maxScore: Number.isFinite(maxScore) && maxScore > 0 ? maxScore : 100,
    label,
    status: String(value.status || '').trim(),
    dimensions,
  };
}

function receiptAction(action) {
  return {
    source: 'agent-receipt',
    ...action,
  };
}

export function getAgentReceiptActionKey(action, index = 0) {
  return [
    action?.id || `action-${index}`,
    action?.displayText || action?.label || '',
    action?.localIntent || '',
    action?.source || '',
  ]
    .map((part) => String(part || '').trim())
    .join('|');
}

function resolveActionStateFromResult(result) {
  if (result && typeof result === 'object' && result.status) return String(result.status);
  if (result === true) return 'done';
  if (result === false) return 'sent';
  return 'sent';
}

export function buildAgentReceiptSummary(receipt = {}) {
  const changed = normalizeList(receipt.changed);
  const checked = normalizeList(receipt.checked);
  const issues = normalizeList(receipt.issues);
  const status =
    receipt.status === 'blocked'
      ? 'blocked'
      : receipt.status === 'review'
        ? 'review'
        : issues.length
          ? 'review'
          : 'done';
  const mode = String(receipt.mode || '').trim();
  const target = String(receipt.target || '').trim();
  const next = String(receipt.next || '').trim();
  const planning = normalizePlanning(receipt.planning);
  const verification = normalizeVerification(receipt.verification);
  const stateDiffs = normalizeStateDiffs(receipt.stateDiffs);
  const quality = normalizeQualityScorecard(receipt.quality);

  return {
    title: receipt.title || (status === 'blocked' ? 'Action needs attention' : 'Action complete'),
    badge: receipt.badge || (status === 'done' ? 'Ready' : status === 'blocked' ? 'Blocked' : 'Review'),
    status,
    mode,
    target,
    changed: changed.length > 0 ? changed : ['No workspace edits'],
    checked,
    issues,
    planning,
    verification,
    stateDiffs,
    quality,
    next,
  };
}

export function buildAgentReceiptActions(receipt = {}) {
  const summary = buildAgentReceiptSummary(receipt);
  const targetText = summary.target || 'the current workspace';
  const issueText = summary.issues.length > 0 ? summary.issues.slice(0, 2).join('; ') : 'the latest Agent result';
  const intentType = receipt?.intent?.type || '';

  if (summary.status === 'blocked') {
    return [
      receiptAction({
        id: 'review-issues',
        label: 'Review issues',
        displayText: 'Review issues',
        localIntent: intentType === 'finish_package' || intentType === 'package_repair' ? 'audit-package' : undefined,
        prompt: [
          'Review the issues from the latest Agent receipt before applying changes.',
          `Focus on ${targetText}.`,
          `The issue was: ${issueText}.`,
          'Use read-only checks first, identify the smallest safe recovery path, and say whether the next step is automatic repair, localized regeneration, or instructor review.',
        ].join(' '),
      }),
      receiptAction({
        id: 'plan-recovery',
        label: 'Plan recovery',
        displayText: 'Plan recovery',
        localIntent: 'plan-next',
        prompt: [
          'Plan the recovery path from the latest blocked Agent receipt.',
          `Focus on ${targetText}.`,
          'Inspect the workspace and produce the next safest action. Do not apply changes yet.',
        ].join(' '),
      }),
    ];
  }

  if (summary.status === 'review') {
    return [
      receiptAction({
        id: 'review-partial',
        label: 'Review result',
        displayText: 'Review result',
        localIntent: intentType === 'finish_package' || intentType === 'package_repair' ? 'audit-package' : undefined,
        prompt: [
          'Review the latest Agent receipt and explain what still needs attention.',
          `Focus on ${targetText}.`,
          `The review note was: ${issueText}.`,
          'Do not apply changes until you identify the smallest safe next action.',
        ].join(' '),
      }),
      receiptAction({
        id: 'plan-next',
        label: 'Plan next',
        displayText: 'Plan next step',
        localIntent: 'plan-next',
        prompt: [
          'Inspect the workspace after the latest Agent receipt and plan the highest-impact next action.',
          'Do not apply changes yet. Return the next action, why it matters, and whether it is safe to apply automatically.',
        ].join(' '),
      }),
    ];
  }

  if (intentType === 'workspace_plan') {
    return [
      receiptAction({
        id: 'audit-quality',
        label: 'Check',
        displayText: 'Check package',
        localIntent: 'audit-package',
        prompt: [
          'Check package quality for the current workspace plan.',
          `Focus on ${targetText}.`,
          'Check readiness, classroom usefulness, alignment, export risk, and the most important remaining issue.',
        ].join(' '),
      }),
      receiptAction({
        id: 'finish-package',
        label: 'Finish',
        displayText: 'Finish package',
        localIntent: 'finish-package',
        prompt: [
          'Use the current workspace plan to finish the course package.',
          'Run safe repairs, verify exports, and stop for instructor-only decisions.',
        ].join(' '),
      }),
    ];
  }

  if (intentType === 'package_audit') {
    return [
      receiptAction({
        id: 'plan-next',
        label: 'Plan fix',
        displayText: 'Plan next step',
        localIntent: 'plan-next',
        prompt: [
          'Inspect the workspace after the latest quality audit and plan the highest-impact fix.',
          'Do not apply changes yet. Return the next action, why it matters, and whether it is safe to apply automatically.',
        ].join(' '),
      }),
      receiptAction({
        id: 'finish-package',
        label: 'Finish',
        displayText: 'Finish package',
        localIntent: 'finish-package',
        prompt: [
          'Finish the course package after the latest audit.',
          'Apply only safe repairs, verify exports, and stop for instructor-only decisions.',
        ].join(' '),
      }),
    ];
  }

  if (intentType === 'content_edit' || intentType === 'package_repair' || intentType === 'finish_package') {
    return [
      receiptAction({
        id: 'audit-quality',
        label: 'Check',
        displayText: 'Check package',
        localIntent: 'audit-package',
        prompt: [
          'Check package quality after the latest Agent run.',
          `Focus on ${targetText}.`,
          'Check readiness, classroom usefulness, alignment, export risk, and the most important remaining issue.',
        ].join(' '),
      }),
      receiptAction({
        id: 'plan-next',
        label: 'Plan next',
        displayText: 'Plan next step',
        localIntent: 'plan-next',
        prompt: [
          'Inspect the workspace after the latest Agent run and plan the highest-impact next action.',
          'Do not apply changes yet. Return the next action, why it matters, and whether it is safe to apply automatically.',
        ].join(' '),
      }),
    ];
  }

  return [
    receiptAction({
      id: 'plan-next',
      label: 'Plan next',
      displayText: 'Plan next step',
      localIntent: 'plan-next',
      prompt: [
        'Inspect the workspace after the latest completed Agent run and plan the highest-impact next action.',
        'Do not apply changes yet. Return the next action, why it matters, and whether it is safe to apply automatically.',
      ].join(' '),
    }),
    receiptAction({
      id: 'audit-quality',
      label: 'Check',
      displayText: 'Check package',
      localIntent: 'audit-package',
      prompt: [
        'Check package quality after the latest completed Agent run.',
        `Focus on ${targetText}.`,
        'Check readiness, classroom usefulness, alignment, export risk, and the most important remaining issue.',
      ].join(' '),
    }),
  ];
}

function getReceiptActionButtonState(actionState = {}) {
  const status = String(actionState.status || '').trim();
  const isRunning = status === 'running';
  const isComplete = status === 'done' || status === 'sent';
  const isError = status === 'error';
  return {
    status,
    isRunning,
    isComplete,
    isError,
    stateLabel: status ? ACTION_STATE_LABELS[status] || status : '',
    buttonLabel: isRunning
      ? 'Working'
      : status === 'done'
        ? 'Done'
        : status === 'sent'
          ? 'Sent'
          : isError
            ? 'Retry'
            : '',
    disabled: isRunning || isComplete,
  };
}

function ReceiptActionStatePill({ action, actionState }) {
  const { status, stateLabel } = getReceiptActionButtonState(actionState);
  if (!status || !stateLabel) return null;
  const toneClass =
    status === 'done'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : status === 'error'
        ? 'border-red-200 bg-red-50 text-red-700'
        : status === 'running'
          ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
          : 'border-slate-200 bg-white/70 text-slate-500';
  return (
    <span
      data-testid={`agent-receipt-action-state-${action.id}`}
      className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${toneClass}`}
    >
      {stateLabel}
    </span>
  );
}

function ReceiptIcon({ status }) {
  if (status === 'blocked') {
    return (
      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2.2}
          d="M12 9v4m0 4h.01M4.93 19h14.14c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 0 0-3.46 0L3.2 16c-.77 1.33.19 3 1.73 3z"
        />
      </svg>
    );
  }
  if (status === 'review') {
    return (
      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2.2}
          d="M8.25 6.75h12M8.25 12h12M8.25 17.25h12M3.75 6.75h.008v.008H3.75V6.75Zm0 5.25h.008v.008H3.75V12Zm0 5.25h.008v.008H3.75v-.008Z"
        />
      </svg>
    );
  }
  return (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="m5 13 4 4L19 7" />
    </svg>
  );
}

function ReceiptList({ title, items = [], dotClass }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{title}</p>
      <div className="mt-1 space-y-1">
        {items.map((item) => (
          <div key={item} className="flex items-start gap-1.5 text-[11px] leading-snug text-slate-600">
            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} aria-hidden="true" />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function normalizeToolTrace(toolManifest) {
  if (!Array.isArray(toolManifest)) return [];
  return toolManifest
    .map((step) => {
      const label = String(step?.label || step?.tool || '').trim();
      const status = String(step?.status || 'done').trim();
      const summary = String(step?.summary || '').trim();
      const targets = normalizeList(step?.targets).slice(0, 2);
      if (!label) return null;
      return {
        label,
        status,
        summary,
        target: targets.join(', '),
      };
    })
    .filter(Boolean)
    .slice(0, 4);
}

function formatReceiptRunStatMeta(runStats) {
  if (!runStats || typeof runStats !== 'object') return '';
  const hasProviderCallCount = Object.prototype.hasOwnProperty.call(runStats, 'providerCallCount');
  const providerCallCount = Number(runStats.providerCallCount || 0);
  if (!hasProviderCallCount || providerCallCount < 0) return '';
  return `${providerCallCount} model call${providerCallCount === 1 ? '' : 's'}`;
}

function getToolTraceTone(status) {
  if (status === 'error') return 'border-red-200 bg-red-50 text-red-700';
  if (status === 'partial') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'running') return 'border-indigo-200 bg-indigo-50 text-indigo-700';
  return 'border-emerald-200 bg-emerald-50 text-emerald-700';
}

function getStateDiffTone(status) {
  if (status === 'failed') return { dot: 'bg-red-500', text: 'text-red-700', label: 'Failed' };
  if (status === 'skipped') return { dot: 'bg-slate-400', text: 'text-slate-600', label: 'Skipped' };
  if (status === 'pending') return { dot: 'bg-amber-500', text: 'text-amber-800', label: 'Queued' };
  return { dot: 'bg-emerald-500', text: 'text-slate-700', label: 'Changed' };
}

function ReceiptStateDiffs({ diffs = [] }) {
  if (!diffs.length) return null;
  return (
    <div data-testid="agent-receipt-state-diffs" className="mt-2 border-t border-white/70 pt-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Change details</p>
      <div className="mt-1 space-y-1.5">
        {diffs.map((diff, index) => {
          const tone = getStateDiffTone(diff.status);
          const targetMeta = [diff.target, diff.path].filter(Boolean).join(' · ');
          return (
            <div
              key={`${diff.status}-${diff.action}-${diff.target}-${diff.path}-${index}`}
              className={`flex items-start gap-1.5 text-[11px] leading-snug ${tone.text}`}
            >
              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} aria-hidden="true" />
              <span className="min-w-0">
                <span className="font-semibold">{tone.label}</span>
                {diff.action && <span> {diff.action}</span>}
                {targetMeta && <span className="text-slate-500"> · {targetMeta}</span>}
                {(diff.before || diff.after) && (
                  <span className="block text-slate-600">
                    {diff.before && (
                      <>
                        <span className="font-semibold">Before:</span> {diff.before}
                      </>
                    )}
                    {diff.before && diff.after && <span> </span>}
                    {diff.after && (
                      <>
                        <span className="font-semibold">After:</span> {diff.after}
                      </>
                    )}
                  </span>
                )}
                {diff.reason && <span className="block text-slate-500">{diff.reason}</span>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getQualityTone(score) {
  if (score == null) return 'border-slate-200 bg-white/65 text-slate-600';
  if (score >= 90) return 'border-emerald-200 bg-white/65 text-emerald-700';
  if (score >= 75) return 'border-amber-200 bg-white/65 text-amber-800';
  return 'border-red-200 bg-white/65 text-red-700';
}

function getQualityDimensionTone(status, score) {
  if (status === 'not_scored' || score == null) return 'border-slate-200 bg-slate-50 text-slate-500';
  if (status === 'pass' || score >= 90) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'watch' || score >= 75) return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-red-200 bg-red-50 text-red-700';
}

function ReceiptQualityScorecard({ quality }) {
  if (!quality) return null;
  const tone = getQualityTone(quality.score);
  const scoreText = quality.score == null ? quality.label || 'Not scored' : `${quality.score}/${quality.maxScore}`;
  return (
    <div
      data-testid="agent-receipt-quality-scorecard"
      className={`mt-2 rounded-md border px-2 py-1.5 text-[11px] leading-snug ${tone}`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-bold">Quality: </span>
        <span className="font-semibold">{scoreText}</span>
        {quality.label && <span>{quality.label}</span>}
      </div>
      {quality.dimensions.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {quality.dimensions.map((dimension) => (
            <span
              key={dimension.id || dimension.label}
              className={`rounded-md border px-1.5 py-0.5 text-[9px] font-bold ${getQualityDimensionTone(
                dimension.status,
                dimension.score,
              )}`}
              title={dimension.score == null ? 'Not scored' : `${dimension.score}/100`}
            >
              {dimension.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ReceiptToolTrace({ tools = [] }) {
  if (!tools.length) return null;
  return (
    <div data-testid="agent-receipt-tool-trace" className="mt-2 border-t border-white/70 pt-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Work done</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {tools.map((tool, index) => (
          <span
            key={`${tool.label}-${tool.status}-${tool.target}-${index}`}
            className={`inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-semibold ${getToolTraceTone(tool.status)}`}
            title={tool.summary || tool.label}
          >
            <span className="truncate">{tool.label}</span>
            {tool.target && <span className="max-w-28 truncate text-slate-500">{tool.target}</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function AgentReceiptCard({
  receipt,
  actionStates: persistedActionStates = null,
  onAction,
  onActionStateChange,
}) {
  const safeReceipt = receipt || {};
  const summary = buildAgentReceiptSummary(safeReceipt);
  const [expanded, setExpanded] = React.useState(summary.status !== 'done');
  const tone = TONES[summary.status] || TONES.done;
  const verificationTone =
    summary.verification?.status === 'verified'
      ? 'border-emerald-200 bg-white/65 text-emerald-700'
      : summary.verification?.status === 'missing' || summary.verification?.status === 'review'
        ? 'border-amber-200 bg-white/65 text-amber-800'
        : 'border-slate-200 bg-white/65 text-slate-600';
  const planningTone =
    summary.planning?.status === 'planned'
      ? 'border-indigo-200 bg-white/65 text-indigo-700'
      : summary.planning?.status === 'missing' || summary.planning?.status === 'review'
        ? 'border-amber-200 bg-white/65 text-amber-800'
        : 'border-slate-200 bg-white/65 text-slate-600';
  const meta = [summary.mode, summary.target, formatReceiptRunStatMeta(safeReceipt.runStats)]
    .filter(Boolean)
    .join(' · ');
  const actions = onAction ? buildAgentReceiptActions(safeReceipt).slice(0, 2) : [];
  const toolTrace = normalizeToolTrace(safeReceipt.toolManifest);
  const showDetails = expanded || summary.status !== 'done';
  const compactResult =
    summary.issues[0] ||
    summary.changed.find((item) => item && item !== 'No workspace edits') ||
    summary.checked[0] ||
    summary.next ||
    'Done.';
  const hasExpandableDetails =
    summary.changed.length > 0 ||
    summary.checked.length > 0 ||
    Boolean(summary.verification?.label) ||
    Boolean(summary.planning?.label) ||
    Boolean(summary.quality) ||
    summary.stateDiffs.length > 0 ||
    summary.issues.length > 0 ||
    Boolean(summary.next) ||
    toolTrace.length > 0 ||
    actions.length > 0;
  const initialActionStates = React.useMemo(() => {
    if (persistedActionStates && typeof persistedActionStates === 'object') return persistedActionStates;
    if (safeReceipt?.actionStates && typeof safeReceipt.actionStates === 'object') return safeReceipt.actionStates;
    return {};
  }, [persistedActionStates, safeReceipt?.actionStates]);
  const [actionStates, setActionStates] = React.useState(initialActionStates);
  const actionStatesRef = React.useRef(initialActionStates);
  React.useEffect(() => {
    actionStatesRef.current = initialActionStates;
    setActionStates(initialActionStates);
  }, [initialActionStates]);

  const commitActionState = React.useCallback(
    (key, state) => {
      const nextStates = { ...actionStatesRef.current, [key]: state };
      actionStatesRef.current = nextStates;
      setActionStates(nextStates);
      onActionStateChange?.(nextStates, { key, state });
      return nextStates;
    },
    [onActionStateChange],
  );

  const handleAction = React.useCallback(
    async (action, index) => {
      if (!onAction) return undefined;
      const key = getAgentReceiptActionKey(action, index);
      const existingStatus = actionStatesRef.current[key]?.status;
      if (existingStatus === 'running' || existingStatus === 'done' || existingStatus === 'sent') {
        return { status: existingStatus };
      }
      commitActionState(key, { status: 'running' });
      try {
        const result = await onAction(action);
        const nextStatus = resolveActionStateFromResult(result);
        commitActionState(key, { status: nextStatus });
        return result;
      } catch (err) {
        commitActionState(key, { status: 'error', message: err?.message || 'Action failed' });
        throw err;
      }
    },
    [commitActionState, onAction],
  );
  if (!receipt) return null;

  return (
    <div
      data-testid="agent-receipt-card"
      className={`ml-8 mr-1 overflow-hidden rounded-lg border ${tone.wrapper} shadow-sm animate-spring-in`}
    >
      <div className="px-3 py-2.5">
        <div className="flex items-start gap-2.5">
          <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${tone.icon}`}>
            <ReceiptIcon status={summary.status} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className={`text-[12px] font-semibold ${tone.title}`}>{summary.title}</p>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${tone.badge}`}>
                {summary.badge}
              </span>
            </div>
            {meta && <p className={`mt-0.5 text-[10px] font-medium ${tone.body}`}>{meta}</p>}
            <p className={`mt-1 text-[11px] leading-snug ${tone.body}`}>{compactResult}</p>
            {hasExpandableDetails && summary.status === 'done' && (
              <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                className="tactile mt-2 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 hover:bg-white/70 hover:text-slate-700"
                aria-expanded={expanded}
              >
                {expanded ? 'Hide details' : 'Details'}
              </button>
            )}
            {showDetails && (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <ReceiptList title="Changed" items={summary.changed} dotClass={tone.dot} />
                <ReceiptList title="Checked" items={summary.checked} dotClass="bg-indigo-400" />
              </div>
            )}
            {showDetails && summary.verification?.required && summary.verification.label && (
              <p
                data-testid="agent-receipt-verification"
                className={`mt-2 rounded-md border px-2 py-1.5 text-[11px] font-medium leading-snug ${verificationTone}`}
              >
                <span className="font-bold">Verified by reading back: </span>
                {summary.verification.label}
              </p>
            )}
            {showDetails && (summary.planning?.required || summary.planning?.hasPlan) && summary.planning.label && (
              <p
                data-testid="agent-receipt-planning"
                className={`mt-2 rounded-md border px-2 py-1.5 text-[11px] font-medium leading-snug ${planningTone}`}
              >
                <span className="font-bold">Plan: </span>
                {summary.planning.label}
              </p>
            )}
            {showDetails && <ReceiptQualityScorecard quality={summary.quality} />}
            {showDetails && <ReceiptStateDiffs diffs={summary.stateDiffs} />}
            {showDetails && summary.issues.length > 0 && (
              <div className="mt-2 border-t border-white/70 pt-2">
                <ReceiptList title="Needs attention" items={summary.issues} dotClass="bg-red-500" />
              </div>
            )}
            {showDetails && summary.next && (
              <p className="mt-2 rounded-md bg-white/60 px-2 py-1.5 text-[11px] font-medium leading-snug text-slate-600">
                <span className="font-bold text-slate-700">Next: </span>
                {summary.next}
              </p>
            )}
            {showDetails && <ReceiptToolTrace tools={toolTrace} />}
            {showDetails && actions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {actions.map((action, index) => {
                  const key = getAgentReceiptActionKey(action, index);
                  const actionState = actionStates[key] || {};
                  const buttonState = getReceiptActionButtonState(actionState);
                  const buttonLabel = buttonState.buttonLabel || action.label;
                  const buttonClassName = buttonState.isError
                    ? 'tactile rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-bold text-red-700 shadow-sm transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-70'
                    : buttonState.isComplete
                      ? 'tactile rounded-md border border-white/80 bg-white/65 px-2 py-1 text-[10px] font-bold text-slate-500 shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-80'
                      : 'tactile rounded-md border border-white/80 bg-white/75 px-2 py-1 text-[10px] font-bold text-slate-600 shadow-sm transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-60';
                  return (
                    <React.Fragment key={key}>
                      <button
                        type="button"
                        data-testid={`agent-receipt-action-${action.id}`}
                        disabled={buttonState.disabled}
                        onClick={() => handleAction(action, index)}
                        className={buttonClassName}
                      >
                        {buttonLabel}
                      </button>
                      <ReceiptActionStatePill action={action} actionState={actionState} />
                    </React.Fragment>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
