import React from 'react';
import { resolveLabel } from './constants';
import { getWorkspacePlanActionKey } from './WorkspacePlanCard';
import { AGENT_SOURCE_CONTEXT_ROLE, getAgentSourceContextSummary } from '../../lib/agentSourceContext';
import { summarizeLandingAgentContext } from '../../lib/landingAgentContext';

const MUTED_TONE = 'border-slate-200 bg-white/70 text-slate-600';
const GOOD_TONE = 'border-emerald-200 bg-emerald-50 text-emerald-700';
const WARN_TONE = 'border-amber-200 bg-amber-50 text-amber-700';
const BAD_TONE = 'border-red-200 bg-red-50 text-red-700';
const MODE_TONE = 'border-indigo-200 bg-indigo-50 text-indigo-700';

function compactCount(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function uniqueValues(values) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map((value) => String(value || '').trim()).filter(Boolean)));
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
  const status = String(packageQualityPass?.status || '').toLowerCase();
  const blockers = compactCount(packageQualityPass?.blockers);
  const warnings = compactCount(packageQualityPass?.warnings);

  if (status === 'running') return { label: 'Finishing', tone: WARN_TONE };
  if (status === 'ready') return { label: 'Ready', tone: GOOD_TONE };
  if (status === 'blocked' || blockers > 0) return { label: 'Needs attention', tone: BAD_TONE };
  if (status === 'warnings' || warnings > 0) return { label: 'Review notes', tone: WARN_TONE };
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
  const sourceNoteCount = sourceSummaries.reduce((count, summary) => count + compactCount(summary.materialNoteCount), 0);
  const landingMaterialCount = compactCount(landing.fileCount || landing.materialNoteCount);
  const totalMaterialCount = landingMaterialCount + sourceFileCount;
  const totalSourceNoteCount = compactCount(landing.materialNoteCount) + sourceNoteCount;
  const parts = [];

  if (landing.hasPrompt) parts.push('prompt');
  if (totalMaterialCount > 0) parts.push(`${totalMaterialCount} material${totalMaterialCount === 1 ? '' : 's'}`);
  if (totalSourceNoteCount > 0) parts.push(`${totalSourceNoteCount} source note${totalSourceNoteCount === 1 ? '' : 's'}`);

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
    title: status === 'running' ? 'Running' : status === 'error' || errorCount > 0 ? 'Run needs review' : 'Run complete',
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
    if (message.role === 'packageSummary') {
      const confidence = String(message.summary?.confidence || '').trim();
      const blocked =
        message.summary?.tone === 'blocked' ||
        confidence === 'Needs attention' ||
        compactCount(message.summary?.blockerCount) > 0;
      activities.push({
        title: 'Package check',
        label: confidence || (blocked ? 'needs attention' : 'checked'),
        tone: blocked ? BAD_TONE : confidence === 'Good with assumptions' ? WARN_TONE : GOOD_TONE,
      });
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
  agentDryRun = false,
  isAgentProviderReady = true,
} = {}) {
  const lessonCount = Array.isArray(courseMap?.lessons) ? courseMap.lessons.length : 0;
  const selectedDeliverableIds = uniqueValues(selectedFeatures).filter((featureId) => featureId !== 'courseMap');
  const syncIds = uniqueValues(pendingSyncFeatureIds);
  const syncSet = new Set(syncIds);
  const selectedSet = new Set(selectedDeliverableIds);
  const allRelevantIds = uniqueValues([...selectedDeliverableIds, ...syncIds, ...Object.keys(deliverables || {})]).filter(
    (featureId) => featureId !== 'courseMap',
  );

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
  const modeLabel = !isAgentProviderReady ? 'Local tools' : agentDryRun ? 'Review only' : 'Auto-fix';
  const selectedFeatureLabels = selectedDeliverableIds.map(resolveLabel).slice(0, 3);

  return {
    activeTarget,
    briefStatus,
    planStatus,
    activityStatus,
    lessonCount,
    scopeLabel: buildScopeLabel(lessonScope, lessonCount),
    modeLabel,
    modeTone: !isAgentProviderReady ? WARN_TONE : agentDryRun ? MUTED_TONE : MODE_TONE,
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

function StatusChip({ label, value, tone = MUTED_TONE, testId }) {
  if (!label && !value) return null;
  return (
    <span
      data-testid={testId}
      className={`inline-flex min-h-[22px] max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${tone}`}
    >
      {label && <span className="shrink-0 opacity-70">{label}</span>}
      {value && <span className="truncate">{value}</span>}
    </span>
  );
}

function ActivityChip({ activity, index }) {
  if (!activity?.title && !activity?.label) return null;
  return (
    <span
      data-testid={`agent-working-activity-${index}`}
      className={`inline-flex min-h-[22px] max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${activity.tone || MUTED_TONE}`}
      title={`${activity.title || 'Activity'}${activity.label ? `: ${activity.label}` : ''}`}
    >
      <span className="shrink-0 opacity-70">{activity.title || 'Activity'}</span>
      {activity.label && <span className="truncate">{activity.label}</span>}
    </span>
  );
}

export default function AgentWorkingSetPanel(props) {
  const summary = buildAgentWorkingSetSummary(props);
  if (!summary.hasCourseMap && !summary.hasDeliverableContext) return null;

  const materialTone =
    summary.failedFeatureCount > 0
      ? BAD_TONE
      : summary.staleFeatureCount > 0 || summary.missingFeatureCount > 0
        ? WARN_TONE
        : summary.readyFeatureCount > 0
          ? GOOD_TONE
          : MUTED_TONE;
  const materialParts = [
    summary.readyFeatureCount ? `${summary.readyFeatureCount} ready` : null,
    summary.generatingFeatureCount ? `${summary.generatingFeatureCount} running` : null,
    summary.missingFeatureCount ? `${summary.missingFeatureCount} missing` : null,
    summary.staleFeatureCount ? `${summary.staleFeatureCount} stale` : null,
    summary.failedFeatureCount ? `${summary.failedFeatureCount} failed` : null,
  ].filter(Boolean);
  const selectedText =
    summary.selectedFeatureLabels.length > 0
      ? `${summary.selectedFeatureLabels.join(', ')}${summary.hiddenSelectedFeatureCount > 0 ? ` +${summary.hiddenSelectedFeatureCount}` : ''}`
      : 'No deliverables selected';

  return (
    <div
      data-testid="agent-working-set-panel"
      className="flex-shrink-0 border-t border-slate-200/40 bg-white/58 px-3.5 py-2"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <StatusChip label="Working set" value={summary.activeTarget} tone={MODE_TONE} testId="agent-working-target" />
        {summary.briefStatus.hasBrief && (
          <StatusChip label="Brief" value={summary.briefStatus.label} tone={MODE_TONE} testId="agent-working-brief" />
        )}
        {summary.planStatus.hasPlan && (
          <StatusChip
            label="Plan"
            value={summary.planStatus.label}
            tone={summary.planStatus.tone}
            testId="agent-working-plan"
          />
        )}
        {summary.activityStatus.hasActivity &&
          summary.activityStatus.activities.map((activity, index) => (
            <ActivityChip key={`${activity.title}-${activity.label}-${index}`} activity={activity} index={index} />
          ))}
        <StatusChip label="Mode" value={summary.modeLabel} tone={summary.modeTone} testId="agent-working-mode" />
        <StatusChip label="Scope" value={summary.scopeLabel} testId="agent-working-scope" />
        <StatusChip
          label="Materials"
          value={materialParts.length > 0 ? materialParts.join(', ') : 'none ready'}
          tone={materialTone}
          testId="agent-working-materials"
        />
        <StatusChip
          label="Package"
          value={summary.packageStatus.label}
          tone={summary.packageStatus.tone}
          testId="agent-working-package"
        />
      </div>
      {summary.selectedFeatureCount > 0 && (
        <div
          data-testid="agent-working-selected"
          className="mt-1 truncate text-[10px] font-medium text-slate-500"
          title={selectedText}
        >
          Selected: {selectedText}
        </div>
      )}
    </div>
  );
}
