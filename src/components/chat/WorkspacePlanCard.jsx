import React from 'react';

const SAFE_MODE_LABELS = {
  'review-only': 'Review only',
  'safe-auto-fix': 'Safe auto-fix',
  'needs-approval': 'Needs approval',
  'requires-generation': 'Generate',
};

const INTENT_BUTTON_LABELS = {
  create_course_map: 'Plan generate',
  regenerate_failed_feature: 'Plan generate',
  generate_missing_feature: 'Plan generate',
  sync_stale_deliverables: 'Review sync',
  clear_readiness_blockers: 'Fix',
  review_readiness_blockers: 'Review',
  improve_active_feature: 'Improve',
  improve_course_map: 'Improve',
  audit_package: 'Audit',
  continue_plan: 'Continue',
};

const ACTION_STATE_LABELS = {
  running: 'Running',
  done: 'Done',
  sent: 'Sent to Agent',
  error: 'Error',
};

function getPlanActionIntent(action) {
  if (!action) return 'continue_plan';
  if (typeof action.intent === 'string') return action.intent;
  return action.intent?.type || 'continue_plan';
}

export function getWorkspacePlanActionKey(action, index = 0) {
  return [
    getPlanActionIntent(action),
    action?.priority || `P${index}`,
    action?.title || '',
    action?.target || '',
    getActionFeatureIds(action).join(','),
  ]
    .map((part) => String(part || '').trim())
    .join('|');
}

function getActionFeatureIds(action) {
  const intentFeatureIds = Array.isArray(action?.intent?.featureIds) ? action.intent.featureIds : [];
  const actionFeatureIds = Array.isArray(action?.featureIds) ? action.featureIds : [];
  return [...intentFeatureIds, ...actionFeatureIds].map((featureId) => String(featureId || '').trim()).filter(Boolean);
}

function canRunActionDirectly(action, actionCapabilities = {}) {
  const intent = getPlanActionIntent(action);
  const capability = actionCapabilities?.[intent];
  if (!capability) return false;
  if (capability === true) return true;

  const supportedFeatureIds = Array.isArray(capability.featureIds)
    ? new Set(capability.featureIds.map((featureId) => String(featureId || '').trim()).filter(Boolean))
    : null;
  if (!supportedFeatureIds || supportedFeatureIds.size === 0) return true;

  const actionFeatureIds = getActionFeatureIds(action);
  if (actionFeatureIds.length === 0) return true;
  return actionFeatureIds.some((featureId) => supportedFeatureIds.has(featureId));
}

function getFeatureText(action) {
  if (action?.target) return action.target;
  if (Array.isArray(action?.featureIds) && action.featureIds.length > 0) return action.featureIds.join(', ');
  return 'Workspace';
}

function buildIntentInstruction(action) {
  const intent = getPlanActionIntent(action);
  const featureText = getFeatureText(action);
  const instructions = {
    create_course_map:
      'This needs course-map generation, which is outside the chat edit tools. Explain the exact generation step and what context from the starting request/materials should drive it.',
    regenerate_failed_feature:
      'This needs regeneration. Inspect the failed target if useful, then tell the user the smallest safe regeneration scope. Do not claim regeneration happened unless a tool result proves it.',
    generate_missing_feature:
      'This needs generation of missing selected deliverables. Explain the smallest generation scope and what the user should expect before the package can be complete.',
    sync_stale_deliverables:
      'Review the stale downstream materials and pending sync need. Do not apply changes until the user approves the sync or repair step.',
    clear_readiness_blockers:
      'Use finalize_package or repair_package_readiness when safe. Apply only deterministic, localized repairs, then verify readiness again.',
    review_readiness_blockers:
      'Review package readiness without applying changes. Explain the blocker, the concrete fix, and what evidence would prove it is resolved.',
    improve_active_feature:
      'Read the active deliverable first. If apply mode is enabled and the change is safe/localized, improve it directly; otherwise explain the concrete edit.',
    improve_course_map:
      'Read the relevant course-map lesson or section first. If apply mode is enabled and the change is safe/localized, edit the course map directly; otherwise explain the concrete edit.',
    audit_package:
      'Run read-only package checks first. Summarize the most important quality gap and the smallest next change; do not apply edits during this audit.',
    continue_plan: 'Continue with this plan item using the safest available tool sequence.',
  };
  return [`Intent: ${intent}`, `Target scope: ${featureText}`, instructions[intent] || instructions.continue_plan].join(
    '\n',
  );
}

function PlanIcon() {
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

function EvidenceChips({ evidence, course }) {
  const chips = [
    course?.lessonCount ? `${course.lessonCount} lessons` : null,
    Number.isFinite(evidence?.generatedFeatureCount) ? `${evidence.generatedFeatureCount} generated` : null,
    evidence?.staleFeatureCount ? `${evidence.staleFeatureCount} stale` : null,
    evidence?.failedFeatureCount ? `${evidence.failedFeatureCount} failed` : null,
    evidence?.packageBlockerCount ? `${evidence.packageBlockerCount} package blocker` : null,
    evidence?.classroomBlockerCount ? `${evidence.classroomBlockerCount} classroom blocker` : null,
  ].filter(Boolean);

  if (chips.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-medium">
      {chips.map((chip) => (
        <span key={chip} className="rounded-full bg-white/65 px-2 py-0.5 text-slate-600">
          {chip}
        </span>
      ))}
    </div>
  );
}

export function buildWorkspacePlanActionPrompt(action) {
  if (!action) return 'Continue with the highest-impact workspace plan item.';
  const mode =
    action.safeMode === 'safe-auto-fix'
      ? 'If it is still safe and localized, apply the fix directly. If it is not safe, explain what needs user approval.'
      : action.safeMode === 'review-only'
        ? 'Review only. Do not apply changes; explain the concrete next change and why it matters.'
        : action.safeMode === 'needs-approval'
          ? 'Do not apply changes until the user approves the sync or repair step.'
          : 'Explain the generation step needed and what the user should expect.';
  return [
    `Act on this workspace plan item: ${action.title}`,
    buildIntentInstruction(action),
    action.target ? `Target: ${action.target}` : '',
    action.reason ? `Reason: ${action.reason}` : '',
    action.suggestedCommand ? `Suggested command: ${action.suggestedCommand}` : '',
    action.toolHint ? `Tool hint: ${action.toolHint}` : '',
    mode,
  ]
    .filter(Boolean)
    .join('\n');
}

export function getWorkspacePlanActionButtonLabel(action, actionCapabilities = {}) {
  const intent = getPlanActionIntent(action);
  if (intent === 'sync_stale_deliverables' && canRunActionDirectly(action, actionCapabilities)) return 'Sync';
  if (intent === 'generate_missing_feature' && canRunActionDirectly(action, actionCapabilities)) return 'Generate';
  if (intent === 'regenerate_failed_feature' && canRunActionDirectly(action, actionCapabilities)) return 'Regenerate';
  if (INTENT_BUTTON_LABELS[intent]) return INTENT_BUTTON_LABELS[intent];
  if (action?.safeMode === 'safe-auto-fix') return 'Fix';
  if (action?.safeMode === 'requires-generation') return 'Plan generate';
  if (action?.safeMode === 'needs-approval') return 'Review';
  return 'Continue';
}

export function buildWorkspacePlanActionDisplayText(action, actionCapabilities = {}) {
  const command = getWorkspacePlanActionButtonLabel(action, actionCapabilities);
  const rawTitle = String(action?.title || 'workspace plan').trim() || 'workspace plan';
  const title = rawTitle.length > 72 ? `${rawTitle.slice(0, 69).trimEnd()}...` : rawTitle;
  return `${command}: ${title}`;
}

export function buildWorkspacePlanActionSendOptions(action, actionCapabilities = {}) {
  const displayText = buildWorkspacePlanActionDisplayText(action, actionCapabilities);
  const safeAutoFix = action?.safeMode === 'safe-auto-fix';
  const directSync = getPlanActionIntent(action) === 'sync_stale_deliverables' && canRunActionDirectly(action, actionCapabilities);
  const directGeneration =
    ['generate_missing_feature', 'regenerate_failed_feature'].includes(getPlanActionIntent(action)) &&
    canRunActionDirectly(action, actionCapabilities);
  return {
    displayText,
    agentPromptOverride: buildWorkspacePlanActionPrompt(action),
    dryRunOverride: safeAutoFix || directSync || directGeneration ? false : true,
    forceApplyMode: safeAutoFix,
  };
}

function resolveActionStateFromResult(result) {
  if (result && typeof result === 'object' && result.status) return String(result.status);
  if (result === true) return 'done';
  if (result === false) return 'sent';
  return 'sent';
}

function PlanActionRow({ action, index, isPrimary, actionCapabilities, actionState, onAction }) {
  const safeModeLabel = SAFE_MODE_LABELS[action.safeMode] || action.safeMode || 'Review only';
  const priority = action.priority || `P${index}`;
  const buttonLabel = getWorkspacePlanActionButtonLabel(action, actionCapabilities);
  const actionStatus = String(actionState?.status || '');
  const stateLabel = actionStatus ? ACTION_STATE_LABELS[actionStatus] || actionStatus : '';
  const isRunning = actionStatus === 'running';
  const isComplete = actionStatus === 'done' || actionStatus === 'sent';
  const isError = actionStatus === 'error';
  const effectiveButtonLabel = isRunning
    ? 'Working'
    : actionStatus === 'done'
      ? 'Done'
      : actionStatus === 'sent'
        ? 'Sent'
        : isError
          ? 'Retry'
          : buttonLabel;
  const buttonDisabled = isRunning || isComplete;
  const buttonClassName = isError
    ? 'tactile shrink-0 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-70'
    : isComplete
      ? 'tactile shrink-0 rounded-md border border-slate-200 bg-white/70 px-2 py-1 text-[10px] font-semibold text-slate-500 transition-colors disabled:cursor-not-allowed disabled:opacity-80'
      : 'tactile shrink-0 rounded-md border border-slate-900 bg-slate-900 px-2 py-1 text-[10px] font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div
      className={`flex items-start gap-2 border-t border-white/70 py-2 first:border-t-0 first:pt-0 ${
        isPrimary ? '' : 'opacity-95'
      }`}
    >
      <span
        className={`mt-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
          priority === 'P0' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'
        }`}
      >
        {priority}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="text-[12px] font-semibold leading-snug text-slate-800">{action.title}</p>
          <span className="rounded-full border border-slate-200 bg-white/70 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">
            {safeModeLabel}
          </span>
          {stateLabel && (
            <span
              data-testid={`workspace-plan-action-state-${getPlanActionIntent(action)}`}
              className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${
                actionState.status === 'done'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : actionState.status === 'error'
                    ? 'border-red-200 bg-red-50 text-red-700'
                    : actionState.status === 'running'
                      ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 bg-white/70 text-slate-500'
              }`}
            >
              {stateLabel}
            </span>
          )}
        </div>
        {action.reason && <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{action.reason}</p>}
        {action.target && <p className="mt-0.5 text-[10px] font-medium text-slate-400">Target: {action.target}</p>}
      </div>
      {onAction && (
        <button
          type="button"
          onClick={() => onAction(action)}
          disabled={buttonDisabled}
          data-testid={`workspace-plan-action-${getPlanActionIntent(action)}`}
          className={buttonClassName}
          aria-label={`${effectiveButtonLabel} ${action.title}`}
        >
          {effectiveButtonLabel}
        </button>
      )}
    </div>
  );
}

export default function WorkspacePlanCard({
  plan,
  actionCapabilities = {},
  actionStates: persistedActionStates = null,
  onAction,
  onActionStateChange,
}) {
  const initialActionStates = React.useMemo(() => {
    if (persistedActionStates && typeof persistedActionStates === 'object') return persistedActionStates;
    if (plan?.actionStates && typeof plan.actionStates === 'object') return plan.actionStates;
    return {};
  }, [persistedActionStates, plan?.actionStates]);
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
      const key = getWorkspacePlanActionKey(action, index);
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
  if (!plan) return null;
  const actions = Array.isArray(plan.actions) ? plan.actions.filter(Boolean).slice(0, 5) : [];
  const highest = plan.highestImpactAction || actions[0] || null;
  const modeLabel = plan.executionMode === 'auto-fix' ? 'Auto-fix available' : 'Review only';

  return (
    <div
      data-testid="workspace-plan-card"
      className="ml-8 mr-1 overflow-hidden rounded-lg border border-indigo-200/70 bg-indigo-50/65 shadow-sm animate-spring-in"
    >
      <div className="px-3 py-2.5">
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
            <PlanIcon />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[12px] font-semibold text-indigo-900">Workspace plan</p>
              <span className="rounded-full border border-indigo-200 bg-white/70 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                {modeLabel}
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-indigo-800">
              {highest?.title || 'The Agent found the next workspace step.'}
            </p>
            <EvidenceChips evidence={plan.evidence} course={plan.course} />
          </div>
        </div>

        {actions.length > 0 && (
          <div className="mt-2 border-t border-indigo-100/80 pt-2">
            <div className="space-y-0">
              {actions.map((action, index) => (
                <PlanActionRow
                  key={`${action.title}-${index}`}
                  action={action}
                  index={index}
                  isPrimary={action === highest || action.title === highest?.title}
                  actionCapabilities={actionCapabilities}
                  actionState={actionStates[getWorkspacePlanActionKey(action, index)]}
                  onAction={() => handleAction(action, index)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
