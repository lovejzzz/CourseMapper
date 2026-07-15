import React from 'react';
import { finishStatusOf } from '../../lib/pipelineMachine';
import { resolveLabel } from './constants';
import { getWorkspacePlanActionKey } from './WorkspacePlanCard';
import { AGENT_SOURCE_CONTEXT_ROLE, getAgentSourceContextSummary } from '../../lib/agentSourceContext';
import { summarizeLandingAgentContext } from '../../lib/landingAgentContext';
import { getPackageTrustStatus } from '../../lib/packageTrustStatus';

const MUTED_TONE = 'border-slate-200 bg-white/70 text-slate-600';
const GOOD_TONE = 'border-emerald-200 bg-emerald-50 text-emerald-700';
const WARN_TONE = 'border-amber-200 bg-amber-50 text-amber-700';
const BAD_TONE = 'border-red-200 bg-red-50 text-red-700';
const MODE_TONE = 'border-indigo-200 bg-indigo-50 text-indigo-700';
const NOTE_TONE = 'border-sky-200 bg-sky-50 text-sky-700';

function compactCount(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function uniqueValues(values) {
  return Array.from(
    new Set((Array.isArray(values) ? values : []).map((value) => String(value || '').trim()).filter(Boolean)),
  );
}

function isFeatureReady(entry) {
  return Boolean(entry?.status === 'done' && entry?.data);
}

function isFeatureFailed(entry) {
  const status = String(entry?.status || '').toLowerCase();
  return Boolean(status === 'failed' || status === 'error' || entry?.error);
}

function isFeatureGenerating(entry) {
  const status = String(entry?.status || '').toLowerCase();
  return Boolean(status === 'generating' || status === 'loading');
}

function buildScopeLabel(lessonScope, lessonCount) {
  const scopedCount =
    lessonScope?.type === 'specific' && Array.isArray(lessonScope.indices) ? lessonScope.indices.length : 0;
  if (scopedCount > 0) return `${scopedCount}/${lessonCount || scopedCount} lessons`;
  if (lessonCount > 0) return `${lessonCount} lesson${lessonCount === 1 ? '' : 's'}`;
  return 'No course map';
}

function buildPackageStatus(packageQualityPass) {
  const status = String(finishStatusOf(packageQualityPass)).toLowerCase().replace('idle', '');
  const trustStatus = getPackageTrustStatus({ packageQualityPass });

  if (status === 'running' && packageQualityPass?.phase === 'generation')
    return { label: 'Building', tone: MUTED_TONE };
  if (status === 'running') return { label: 'Finishing', tone: WARN_TONE };
  if (trustStatus.clean) return { label: 'Ready', tone: GOOD_TONE };
  if (trustStatus.blocked) return { label: 'Needs attention', tone: BAD_TONE };
  if (trustStatus.review) return { label: 'Review notes', tone: NOTE_TONE, readyWithNotes: true };
  return { label: 'Not checked', tone: MUTED_TONE };
}

function buildBriefStatus(messages) {
  const landing = summarizeLandingAgentContext(messages);
  const sourceMessages = (Array.isArray(messages) ? messages : []).filter(
    (message) => message?.role === AGENT_SOURCE_CONTEXT_ROLE,
  );
  const sourceSummaries = sourceMessages.map(getAgentSourceContextSummary);
  const sourceFileCount = sourceSummaries.reduce(
    (count, summary) => count + compactCount(summary.fileCount || summary.materialNoteCount),
    0,
  );
  const sourceNoteCount = sourceSummaries.reduce(
    (count, summary) => count + compactCount(summary.materialNoteCount),
    0,
  );
  const landingMaterialCount = compactCount(landing.fileCount || landing.materialNoteCount);
  const totalMaterialCount = landingMaterialCount + sourceFileCount;
  const totalSourceNoteCount = compactCount(landing.materialNoteCount) + sourceNoteCount;
  const parts = [];

  if (landing.hasPrompt) parts.push('prompt');
  if (totalMaterialCount > 0) parts.push(`${totalMaterialCount} material${totalMaterialCount === 1 ? '' : 's'}`);
  if (totalSourceNoteCount > 0)
    parts.push(`${totalSourceNoteCount} source note${totalSourceNoteCount === 1 ? '' : 's'}`);

  return {
    hasBrief: landing.hasContext || sourceMessages.length > 0,
    label: parts.length > 0 ? parts.join(' + ') : 'context added',
  };
}

function buildPlanStatus(messages) {
  const safeMessages = Array.isArray(messages) ? messages : [];
  for (let i = safeMessages.length - 1; i >= 0; i--) {
    const message = safeMessages[i];
    if (message?.role !== 'workspacePlan') continue;
    const plan = message.plan || {};
    const actions = Array.isArray(plan.actions) ? plan.actions.filter(Boolean).slice(0, 5) : [];
    if (actions.length === 0) continue;

    const actionStates =
      message.actionStates && typeof message.actionStates === 'object'
        ? message.actionStates
        : plan.actionStates && typeof plan.actionStates === 'object'
          ? plan.actionStates
          : {};
    const counts = { done: 0, sent: 0, error: 0, running: 0 };
    actions.forEach((action, index) => {
      const status = String(actionStates[getWorkspacePlanActionKey(action, index)]?.status || '').trim();
      if (Object.prototype.hasOwnProperty.call(counts, status)) counts[status] += 1;
    });

    const completedCount = counts.done + counts.sent;
    const untouchedCount = Math.max(0, actions.length - completedCount - counts.error - counts.running);
    const parts = [
      counts.running ? `${counts.running} running` : null,
      counts.error ? `${counts.error} blocked` : null,
      counts.done ? `${counts.done} done` : null,
      counts.sent ? `${counts.sent} sent` : null,
      untouchedCount && completedCount === 0 && counts.error === 0 && counts.running === 0
        ? `${actions.length} ready`
        : null,
    ].filter(Boolean);

    return {
      hasPlan: true,
      label: parts.length > 0 ? parts.join(', ') : `${actions.length} ready`,
      tone: counts.error > 0 ? BAD_TONE : counts.running > 0 ? WARN_TONE : completedCount > 0 ? GOOD_TONE : MODE_TONE,
    };
  }
  return { hasPlan: false, label: '', tone: MUTED_TONE };
}

function countActionStates(actionStates) {
  const counts = { done: 0, sent: 0, error: 0, running: 0 };
  Object.values(actionStates && typeof actionStates === 'object' ? actionStates : {}).forEach((state) => {
    const status = String(state?.status || '').trim();
    if (Object.prototype.hasOwnProperty.call(counts, status)) counts[status] += 1;
  });
  return counts;
}

function summarizeActionStateCounts(actionStates) {
  const counts = countActionStates(actionStates);
  return [
    counts.running ? `${counts.running} running` : null,
    counts.error ? `${counts.error} blocked` : null,
    counts.done ? `${counts.done} done` : null,
    counts.sent ? `${counts.sent} sent` : null,
  ].filter(Boolean);
}

function buildReceiptActivity(message) {
  const receipt = message?.receipt || {};
  const status = String(receipt.status || '').trim();
  const actionParts = summarizeActionStateCounts(message?.actionStates || receipt.actionStates);
  const label = actionParts.length > 0 ? actionParts.join(', ') : status || receipt.badge || 'recorded';
  return {
    title: receipt.title || 'Receipt',
    label,
    tone:
      status === 'blocked' || actionParts.some((part) => part.includes('blocked'))
        ? BAD_TONE
        : status === 'review' || actionParts.some((part) => part.includes('running'))
          ? WARN_TONE
          : status === 'done' || actionParts.length > 0
            ? GOOD_TONE
            : MUTED_TONE,
  };
}

function buildProgressActivity(message) {
  const steps = Array.isArray(message?.steps) ? message.steps : [];
  const running = steps.find((step) => step?.status === 'running');
  const errorCount = steps.filter((step) => step?.status === 'error' || step?.status === 'partial').length;
  const status = String(message?.status || '').trim();
  return {
    title:
      status === 'running' ? 'Running' : status === 'error' || errorCount > 0 ? 'Run needs review' : 'Run complete',
    label:
      status === 'running' && running
        ? running.label || running.tool || 'Working'
        : `${steps.length} tool${steps.length === 1 ? '' : 's'}${errorCount ? `, ${errorCount} issue${errorCount === 1 ? '' : 's'}` : ''}`,
    tone: status === 'error' || errorCount > 0 ? BAD_TONE : status === 'running' ? WARN_TONE : GOOD_TONE,
  };
}

function buildRecentActivityStatus(messages) {
  const safeMessages = Array.isArray(messages) ? messages : [];
  const activities = [];
  for (let i = safeMessages.length - 1; i >= 0 && activities.length < 2; i--) {
    const message = safeMessages[i];
    if (!message || typeof message !== 'object') continue;
    if (message.role === 'agentReceipt') {
      activities.push(buildReceiptActivity(message));
      continue;
    }
    if (message.role === 'agentProgress') {
      activities.push(buildProgressActivity(message));
      continue;
    }
    if (message.role === 'changeSummary') {
      const failed = compactCount(message.summary?.failed);
      const applied = compactCount(message.summary?.applied);
      activities.push({
        title: failed > 0 ? 'Changes need review' : 'Changes applied',
        label: `${applied} applied${failed ? `, ${failed} failed` : ''}`,
        tone: failed > 0 ? WARN_TONE : GOOD_TONE,
      });
      continue;
    }
  }

  return {
    hasActivity: activities.length > 0,
    activities,
  };
}

export function buildAgentWorkingSetSummary({
  courseMap,
  activeTab = 'courseMap',
  deliverables = {},
  selectedFeatures = [],
  lessonScope = null,
  pendingSyncFeatureIds = [],
  packageQualityPass = null,
  messages = [],
  isAgentProviderReady = true,
} = {}) {
  const lessonCount = Array.isArray(courseMap?.lessons) ? courseMap.lessons.length : 0;
  const selectedDeliverableIds = uniqueValues(selectedFeatures).filter((featureId) => featureId !== 'courseMap');
  const syncIds = uniqueValues(pendingSyncFeatureIds);
  const syncSet = new Set(syncIds);
  const selectedSet = new Set(selectedDeliverableIds);
  const allRelevantIds = uniqueValues([
    ...selectedDeliverableIds,
    ...syncIds,
    ...Object.keys(deliverables || {}),
  ]).filter((featureId) => featureId !== 'courseMap');

  let readyFeatureCount = 0;
  let missingFeatureCount = 0;
  let staleFeatureCount = 0;
  let failedFeatureCount = 0;
  let generatingFeatureCount = 0;

  allRelevantIds.forEach((featureId) => {
    const entry = deliverables?.[featureId];
    if (isFeatureReady(entry)) readyFeatureCount += 1;
    if (isFeatureFailed(entry)) failedFeatureCount += 1;
    if (isFeatureGenerating(entry)) generatingFeatureCount += 1;
    if (entry?.stale || syncSet.has(featureId)) staleFeatureCount += 1;
  });

  selectedDeliverableIds.forEach((featureId) => {
    const entry = deliverables?.[featureId];
    if (!isFeatureReady(entry) && !isFeatureGenerating(entry) && !isFeatureFailed(entry)) missingFeatureCount += 1;
  });

  const activeTarget = activeTab && activeTab !== 'courseMap' ? resolveLabel(activeTab) : 'Course Map';
  const packageStatus = buildPackageStatus(packageQualityPass);
  const briefStatus = buildBriefStatus(messages);
  const planStatus = buildPlanStatus(messages);
  const activityStatus = buildRecentActivityStatus(messages);
  const toolStateLabel = !isAgentProviderReady ? 'Local checks available' : 'AI connected';
  const selectedFeatureLabels = selectedDeliverableIds.map(resolveLabel).slice(0, 3);

  return {
    activeTarget,
    briefStatus,
    planStatus,
    activityStatus,
    lessonCount,
    scopeLabel: buildScopeLabel(lessonScope, lessonCount),
    toolStateLabel,
    toolStateTone: !isAgentProviderReady ? WARN_TONE : MODE_TONE,
    selectedFeatureCount: selectedDeliverableIds.length,
    selectedFeatureLabels,
    hiddenSelectedFeatureCount: Math.max(0, selectedDeliverableIds.length - selectedFeatureLabels.length),
    readyFeatureCount,
    missingFeatureCount,
    staleFeatureCount,
    failedFeatureCount,
    generatingFeatureCount,
    packageStatus,
    hasCourseMap: lessonCount > 0,
    hasDeliverableContext: allRelevantIds.length > 0 || selectedSet.size > 0,
  };
}

export default function AgentWorkingSetPanel(props) {
  const summary = buildAgentWorkingSetSummary(props);
  const [expanded, setExpanded] = React.useState(false);
  if (!summary.hasCourseMap && !summary.hasDeliverableContext) return null;

  const quietMaterialParts = [
    summary.readyFeatureCount ? `${summary.readyFeatureCount} ready` : null,
    summary.generatingFeatureCount ? `${summary.generatingFeatureCount} running` : null,
    summary.failedFeatureCount ? `${summary.failedFeatureCount} failed` : null,
  ].filter(Boolean);
  const detailMaterialParts = [
    ...quietMaterialParts,
    summary.missingFeatureCount ? `${summary.missingFeatureCount} not generated yet` : null,
    summary.staleFeatureCount ? `${summary.staleFeatureCount} will sync when needed` : null,
  ].filter(Boolean);
  const latestActivity = summary.activityStatus.activities[0];
  const readyWithNotes = Boolean(summary.packageStatus.readyWithNotes);
  const needsAttention = summary.packageStatus.label === 'Needs attention' || summary.failedFeatureCount > 0;
  const localOnly = summary.toolStateLabel !== 'AI connected';
  const headline =
    summary.packageStatus.label === 'Building'
      ? 'Building package'
      : summary.packageStatus.label === 'Finishing'
        ? 'Finishing package'
        : readyWithNotes
          ? 'Ready to export'
          : needsAttention
            ? 'Review before export'
            : summary.packageStatus.label === 'Ready'
              ? 'Ready to export'
              : localOnly
                ? 'Workspace open'
                : 'Workspace ready';
  const supportLine = [
    summary.scopeLabel,
    quietMaterialParts.length > 0 ? quietMaterialParts.join(', ') : 'No generated materials yet',
  ].filter(Boolean);

  return (
    <div
      data-testid="agent-working-set-panel"
      className="flex-shrink-0 border-b border-slate-200/50 bg-slate-50/70 px-3.5 py-2"
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p data-testid="agent-working-target" className="truncate text-[11px] font-bold text-slate-700">
            {headline}
          </p>
          <p data-testid="agent-working-materials" className="mt-0.5 truncate text-[10px] font-medium text-slate-500">
            {supportLine.join(' · ')}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span
            data-testid="agent-working-package-status"
            className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${summary.packageStatus.tone}`}
          >
            {summary.packageStatus.label}
          </span>
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="tactile rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 hover:bg-white/80 hover:text-slate-600"
            aria-expanded={expanded}
            aria-label={expanded ? 'Hide workspace details' : 'Show workspace details'}
          >
            {expanded ? 'Hide' : 'Details'}
          </button>
        </div>
      </div>
      {expanded && (
        <div
          data-testid="agent-working-set-details"
          className="mt-1.5 space-y-1 text-[10px] font-medium text-slate-500"
        >
          <p className="truncate">Target: {summary.activeTarget}</p>
          <p className="truncate">
            Materials: {detailMaterialParts.length > 0 ? detailMaterialParts.join(', ') : 'No generated materials yet'}
          </p>
          <p className="truncate">Tools: {summary.toolStateLabel}</p>
          {(summary.planStatus.hasPlan || latestActivity || summary.briefStatus.hasBrief) && (
            <p className="truncate text-slate-400">
              {summary.planStatus.hasPlan
                ? `Plan: ${summary.planStatus.label}`
                : latestActivity
                  ? `${latestActivity.title}: ${latestActivity.label}`
                  : `Brief: ${summary.briefStatus.label}`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
