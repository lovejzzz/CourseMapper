import React, { lazy, Suspense, useEffect, useRef, useCallback, useMemo, useState } from 'react';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import CustomToolsMenu from './CustomToolsMenu';
import AgentWorkingSetPanel from './AgentWorkingSetPanel';
import ModelConfig from '../ModelConfig';
import useChatRouter from './useChatRouter';
import ExamReview from '../ExamReview';
import { executeAction } from '../../lib/agentActions';
import { resolveLabel } from './constants';
import { evaluateWorkspaceReadiness } from '../../lib/deliverableReadiness';
import { buildPostGenerationDigest } from '../../lib/agentDigest';
import { classifyFinalizePackageStepStatus, normalizePackageSummary } from '../../lib/packageFinalizerSummary';
import { finishStatusOf, isFinishPassActive, isPackageReady } from '../../lib/pipelineMachine';
import { summarizeLandingAgentContext } from '../../lib/landingAgentContext';
import { getPackageTrustStatus } from '../../lib/packageTrustStatus';
import { useAIConfig } from '../../contexts/AIConfigContext';

const ProgressHeader = lazy(() => import('./ProgressHeader'));

function activeTabLabel(activeTab) {
  if (!activeTab) return 'Course Map';
  return resolveLabel(activeTab);
}

function latestRunningStep(steps = []) {
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i]?.status === 'running') return steps[i];
  }
  return null;
}

function deriveAgentStatus(progress, isStreaming, isAgentMode, _agentDryRun = false, isGeneratingWorkspace = false) {
  if (!isAgentMode && isGeneratingWorkspace) {
    return { label: 'Building', tone: 'indigo', detail: 'Starting workspace' };
  }
  if (!isAgentMode) return { label: 'Ask', tone: 'slate', detail: 'Ready' };
  if (!progress && !isStreaming) return { label: 'Ready', tone: 'emerald', detail: 'Ready' };
  if (progress?.status === 'error') return { label: 'Needs you', tone: 'red', detail: 'Needs a decision' };
  if (progress?.status === 'complete') {
    const hasIssues = progress.steps?.some((step) => step.status === 'error' || step.status === 'partial');
    return hasIssues
      ? { label: 'Needs you', tone: 'amber', detail: 'Check latest result' }
      : { label: 'Done', tone: 'emerald', detail: 'Done' };
  }
  return {
    label: 'Working',
    tone: 'indigo',
    detail: 'Working',
  };
}

function summarizePackageQuality(readiness, repairsApplied = 0) {
  const repairText =
    repairsApplied > 0 ? `Auto-fixed ${repairsApplied} safe issue${repairsApplied === 1 ? '' : 's'}. ` : '';
  if (!readiness) return `${repairText}Package finishing complete.`;
  if (readiness.blockers?.length > 0) {
    return `${repairText}${readiness.blockers.length} critical issue${readiness.blockers.length === 1 ? '' : 's'} still need review.`;
  }
  if (readiness.warnings?.length > 0) {
    return `${repairText}${readiness.warnings.length} note${readiness.warnings.length === 1 ? '' : 's'} need review.`;
  }
  return `${repairText}Workspace is ready to download.`;
}

function getSelectedFailedDeliverableIssues(deliverables = {}, selectedFeatures = []) {
  if (!deliverables || typeof deliverables !== 'object') return [];
  const selected = Array.isArray(selectedFeatures) && selectedFeatures.length > 0 ? selectedFeatures : [];
  return selected
    .filter((featureId) => featureId && featureId !== 'courseMap')
    .map((featureId) => {
      const entry = deliverables?.[featureId];
      if (!entry) return null;
      const status = String(entry.status || '').toLowerCase();
      if (status !== 'error' && status !== 'failed' && !entry.error) return null;
      const label = resolveLabel(featureId) || 'Material';
      return {
        severity: 'error',
        label,
        message: `${label} failed to generate.`,
      };
    })
    .filter(Boolean);
}

function dedupePackageIssues(issues = []) {
  const seen = new Set();
  return issues.filter((issue) => {
    const key = `${issue?.severity || ''}:${issue?.label || ''}:${issue?.message || ''}`;
    if (!issue?.label || !issue?.message || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildPackageReceiptSummary(packageQualityPass, courseMap, selectedFeatures = [], deliverables = {}) {
  // v0.15.3 C2: phase questions go through the machine's selectors —
  // finishStatusOf(null) is 'idle', which covers the missing-pass case.
  const finishStatus = finishStatusOf(packageQualityPass);
  if (finishStatus === 'running' || finishStatus === 'idle') return null;
  const receipt = packageQualityPass.receipt || {};
  const trustStatus = getPackageTrustStatus({ packageQualityPass });
  const failedDeliverableIssues = getSelectedFailedDeliverableIssues(deliverables, selectedFeatures);
  const blockerCount = Math.max(trustStatus.blockerCount, failedDeliverableIssues.length);
  const warningCount = trustStatus.warningCount;
  const ready = isPackageReady(packageQualityPass) && trustStatus.clean;
  const tone = trustStatus.toneKey === 'neutral' ? 'assumptions' : trustStatus.toneKey;
  const checkedFeatureCount = Array.isArray(selectedFeatures) ? selectedFeatures.length : 0;
  return {
    confidence: ready ? 'Excellent' : blockerCount > 0 ? 'Needs attention' : 'Good with assumptions',
    tone,
    ready,
    downloadable: trustStatus.canDownload,
    nextAction: ready
      ? 'Safe checks passed and the package is ready to download.'
      : blockerCount > 0
        ? 'Finish package handled safe fixes. The remaining issue needs attention before download.'
        : 'Review notes are saved in the Agent panel and package report before publishing.',
    repairsApplied: packageQualityPass.repairsApplied || receipt.autoFixedCount || 0,
    blockerCount,
    warningCount,
    checkedItems: receipt.checkedItems || ['Readiness', 'classroom fit', 'content validation', 'export files'],
    classroomStatus: ready ? 'ready' : null,
    classroomBlockerCount: 0,
    classroomWarningCount: 0,
    exportChecked: receipt.exportChecked || 0,
    exportFailed: receipt.exportFailed || 0,
    exportWarningCount: receipt.exportWarningCount || 0,
    checkedSections:
      receipt.checkedSections || (checkedFeatureCount > 0 ? `${checkedFeatureCount}/${checkedFeatureCount}` : ''),
    lessonCount: receipt.lessonCount || courseMap?.lessons?.length || 0,
    apiSpendSummary: receipt.apiSpendSummary || null,
    apiFeatureSpendSummary: receipt.apiFeatureSpendSummary || [],
    compilerSummary: receipt.compilerSummary || null,
    trustBoundary: receipt.trustBoundary || null,
    repairSummary: receipt.repairSummary || 'none',
    reviewRecommendation: receipt.reviewRecommendation || '',
    topIssues: ready
      ? []
      : dedupePackageIssues([
          ...failedDeliverableIssues,
          ...(trustStatus.reviewIssues.length > 0 ? trustStatus.reviewIssues : receipt.topIssues || []),
        ]),
  };
}

function buildPackageReceiptMessage(packageReceiptSummary, packageQualityPass) {
  if (!packageReceiptSummary) return null;
  const summary = packageReceiptSummary;
  const keyParts = [
    // Reachable only with a built summary (status ready/blocked/done), where
    // finishStatusOf returns the same value the old `.status || 'done'` did.
    finishStatusOf(packageQualityPass),
    summary.ready ? 'ready' : 'review',
    summary.checkedSections || 'sections',
    summary.lessonCount || 0,
    summary.exportChecked || 0,
    summary.exportFailed || 0,
    summary.blockerCount || 0,
    summary.warningCount || 0,
    summary.repairsApplied || 0,
  ];
  return {
    id: `package-receipt-${keyParts.map((part) => String(part).replace(/[^a-z0-9]+/gi, '-')).join('-')}`,
    role: 'packageSummary',
    source: 'package-quality-pass',
    summary,
  };
}

function countResultValue(value, fallback = 0) {
  if (Array.isArray(value)) return value.length;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function buildPackageFinishSummaryMessage(result = {}, courseMap, selectedFeatures = []) {
  const normalized = normalizePackageSummary({
    ...result,
    lessonCount: result.lessonCount || courseMap?.lessons?.length || 0,
  });
  const packageQualityPass = {
    status: result.packageQualityStatus || result.status || (normalized.ready ? 'ready' : 'blocked'),
    repairsApplied: countResultValue(result.repairsApplied, normalized.repairsApplied || 0),
    warnings: countResultValue(result.warnings, normalized.warningCount || 0),
    blockers: countResultValue(result.blockers, normalized.blockerCount || 0),
    receipt: result.receipt || {
      checkedItems: normalized.checkedItems,
      checkedSections: normalized.checkedSections,
      lessonCount: normalized.lessonCount,
      exportChecked: normalized.exportChecked,
      exportFailed: normalized.exportFailed,
      exportWarningCount: normalized.exportWarningCount,
      apiSpendSummary: normalized.apiSpendSummary,
      apiFeatureSpendSummary: normalized.apiFeatureSpendSummary,
      compilerSummary: normalized.compilerSummary,
      trustBoundary: normalized.trustBoundary,
      repairSummary: normalized.repairSummary,
      reviewRecommendation: normalized.reviewRecommendation,
      topIssues: normalized.topIssues,
    },
    quality: result.quality || null,
  };
  return buildPackageReceiptMessage(
    buildPackageReceiptSummary(
      packageQualityPass,
      result.courseMap || courseMap,
      selectedFeatures,
      result.deliverables || {},
    ),
    packageQualityPass,
  );
}

function getWorkspacePlanIntent(action) {
  if (!action) return '';
  if (typeof action.intent === 'string') return action.intent;
  return action.intent?.type || '';
}

function summarizeDirectPackageFinish(result) {
  const status = result?.packageQualityStatus || result?.status || '';
  const normalized = normalizePackageSummary(result || {});
  const readiness = result?.readiness || {};
  const blockerCount = Number(readiness.blockers?.length ?? readiness.blockerCount ?? result?.blockers ?? 0);
  const warningCount = Number(readiness.warnings?.length ?? readiness.warningCount ?? result?.warnings ?? 0);
  const trustStatus = getPackageTrustStatus({
    packageQualityPass: {
      status: status || (normalized.ready ? 'ready' : 'blocked'),
      blockers: blockerCount || normalized.blockerCount,
      warnings: warningCount || normalized.warningCount,
      receipt: result?.receipt || {
        exportFailed: normalized.exportFailed,
        exportWarningCount: normalized.exportWarningCount,
        topIssues: normalized.topIssues,
      },
      quality: result?.quality || null,
    },
  });
  if ((status === 'ready' || (blockerCount === 0 && warningCount === 0 && result)) && trustStatus.clean) {
    return 'Package is ready. Safe checks passed and the export panel is ready.';
  }
  if (trustStatus.blocked) {
    return `Decision needed: ${trustStatus.blockerCount} blocker${
      trustStatus.blockerCount === 1 ? '' : 's'
    }. Check the receipt before downloading.`;
  }
  if (trustStatus.review) {
    return 'Package notes saved. Review them in the Agent panel or package report before publishing.';
  }
  return 'Package pass complete. Check the export panel for the latest status.';
}

function getWorkspacePlanFeatureIds(action) {
  const intentFeatureIds = Array.isArray(action?.intent?.featureIds) ? action.intent.featureIds : [];
  const actionFeatureIds = Array.isArray(action?.featureIds) ? action.featureIds : [];
  return [...intentFeatureIds, ...actionFeatureIds].map((featureId) => String(featureId || '').trim()).filter(Boolean);
}

function findPendingSyncPlanMatch(messages, action) {
  const featureIds = new Set(getWorkspacePlanFeatureIds(action));
  const suggestions = Array.isArray(messages)
    ? messages.filter((message) => message?.role === 'syncSuggestion' && message.status === 'pending')
    : [];

  for (const suggestion of suggestions) {
    const plan = Array.isArray(suggestion.plan) ? suggestion.plan.filter(Boolean) : [];
    if (plan.length === 0) continue;
    const selectedPlan =
      featureIds.size === 0 ? plan : plan.filter((entry) => featureIds.has(String(entry?.featureId || '').trim()));
    if (selectedPlan.length > 0) return { suggestion, selectedPlan };
  }
  return null;
}

function getPendingSyncFeatureIds(messages) {
  const featureIds = new Set();
  if (!Array.isArray(messages)) return [];
  messages.forEach((message) => {
    if (message?.role !== 'syncSuggestion' || message.status !== 'pending') return;
    const plan = Array.isArray(message.plan) ? message.plan : [];
    plan.forEach((entry) => {
      const featureId = String(entry?.featureId || '').trim();
      if (featureId) featureIds.add(featureId);
    });
  });
  return [...featureIds];
}

function summarizeSyncPlanFeatures(plan) {
  const featureLabels = Array.from(
    new Set((Array.isArray(plan) ? plan : []).map((entry) => resolveLabel(entry?.featureId)).filter(Boolean)),
  );
  if (featureLabels.length === 0) return 'stale deliverables';
  if (featureLabels.length === 1) return featureLabels[0];
  if (featureLabels.length === 2) return `${featureLabels[0]} and ${featureLabels[1]}`;
  return `${featureLabels.slice(0, 2).join(', ')} and ${featureLabels.length - 2} more`;
}

function summarizeFeatureIds(featureIds) {
  const labels = Array.from(new Set((Array.isArray(featureIds) ? featureIds : []).map(resolveLabel).filter(Boolean)));
  if (labels.length === 0) return 'selected deliverables';
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, 2).join(', ')} and ${labels.length - 2} more`;
}

function collectSyncCanonicalPatches(syncResult = {}) {
  const summaryPatches = Array.isArray(syncResult?.syncSummary?.appliedCanonicalPatches)
    ? syncResult.syncSummary.appliedCanonicalPatches
    : [];
  const fallbackPatches = Array.isArray(syncResult?.syncSummary?.canonicalPatches)
    ? syncResult.syncSummary.canonicalPatches
    : [];
  const planPatches = (Array.isArray(syncResult?.selectedPlan) ? syncResult.selectedPlan : []).flatMap((entry) =>
    Array.isArray(entry?.canonicalPatches) ? entry.canonicalPatches : [],
  );
  const patches =
    summaryPatches.length > 0 ? summaryPatches : fallbackPatches.length > 0 ? fallbackPatches : planPatches;
  const seen = new Set();
  return patches.filter((patch) => {
    if (!patch) return false;
    const key = `${patch.lessonIndex}:${patch.sectionIndex ?? 0}:${patch.field}:${patch.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function summarizeCanonicalPatchesForReceipt(patches = []) {
  const labels = patches
    .map((patch) => {
      const lessonLabel = Number.isInteger(patch?.lessonIndex) ? `Lesson ${patch.lessonIndex + 1}` : 'Course map';
      const fieldLabel = patch?.label || patch?.field || 'field';
      return `${lessonLabel} ${fieldLabel}`;
    })
    .filter(Boolean);
  if (labels.length === 0) return 'course blueprint';
  if (labels.length <= 3) return labels.join(', ');
  return `${labels.slice(0, 3).join(', ')} and ${labels.length - 3} more`;
}

function getSyncReceiptProviderCallText(syncResult = {}, hasCanonicalPatches = false) {
  const rawCount = syncResult?.syncSummary?.providerCallCount;
  if (Number.isFinite(Number(rawCount))) return `${Math.max(0, Number(rawCount))}`;
  return hasCanonicalPatches ? '0' : 'unknown';
}

function describeLessonScope(lessonScope, courseMap) {
  const lessons = Array.isArray(courseMap?.lessons) ? courseMap.lessons : [];
  if (lessonScope?.type === 'specific' && Array.isArray(lessonScope.indices) && lessonScope.indices.length > 0) {
    const labels = lessonScope.indices
      .map((index) => lessons[index]?.title || `Lesson ${Number(index) + 1}`)
      .filter(Boolean);
    if (labels.length === 1) return labels[0];
    if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
    return `${labels.slice(0, 2).join(', ')} and ${labels.length - 2} more`;
  }
  if (lessons.length > 0) return `All ${lessons.length} lessons`;
  return 'Current workspace';
}

function buildLessonScopeReceipt({
  status = 'done',
  changed = [],
  checked = ['Course map lesson count', 'Working set scope'],
  issues = [],
  next = '',
  runStats = null,
  toolManifest = null,
} = {}) {
  return buildAgentReceiptMessage({
    title: status === 'done' ? 'Scope receipt' : 'Scope needs review',
    status,
    badge: status === 'done' ? 'Scope set' : 'Review',
    mode: 'Local',
    target: 'Lesson scope',
    changed,
    checked,
    issues,
    next,
    runStats,
    toolManifest,
  });
}

const EXPANSION_STAGES = [
  {
    label: 'Applied Extension',
    focus: 'extend the core ideas into a new applied case',
    artifact: 'application brief',
  },
  {
    label: 'Integration and Transfer',
    focus: 'connect earlier lessons and transfer the approach to a new context',
    artifact: 'synthesis plan',
  },
  {
    label: 'Evidence and Feedback',
    focus: 'use evidence and feedback to improve the course work',
    artifact: 'revision memo',
  },
  {
    label: 'Final Demonstration',
    focus: 'prepare a final demonstration of learning',
    artifact: 'final learning artifact',
  },
];

function stripLessonPrefix(text = '') {
  return String(text || '')
    .replace(/^lesson\s+\d+\s*[:.-]\s*/i, '')
    .trim();
}

function getCourseExpansionTheme(courseMap = {}) {
  const lessons = Array.isArray(courseMap?.lessons) ? courseMap.lessons : [];
  const lastLesson = lessons[lessons.length - 1] || {};
  const lastSection = Array.isArray(lastLesson.sections) ? lastLesson.sections[0] || {} : {};
  const topic = String(lastSection.topicSection || lastSection.topic || '').trim();
  const lessonTitle = stripLessonPrefix(lastLesson.title || '');
  const courseName = String(courseMap?.courseName || '')
    .replace(/\bcourse\b/gi, '')
    .trim();
  return topic || lessonTitle || courseName || 'the course focus';
}

function buildDeterministicExpansionLessons({ courseMap, currentLessonCount, targetLessonCount }) {
  const theme = getCourseExpansionTheme(courseMap);
  const lessons = [];
  for (let index = currentLessonCount; index < targetLessonCount; index += 1) {
    const lessonNumber = index + 1;
    const stage = EXPANSION_STAGES[(index - currentLessonCount) % EXPANSION_STAGES.length];
    const topic = `${stage.label}: ${theme}`;
    lessons.push({
      lessonIndex: index,
      title: `Lesson ${lessonNumber}: ${stage.label}`,
      sections: [
        {
          learningGoals: `Students will ${stage.focus} using ${theme}.`,
          topicSection: topic,
          learningObjectives: `By the end of the lesson, students can explain, apply, and critique ${theme} in a structured task.`,
          weeklyAssessments: `Students submit a ${stage.artifact} showing how they used evidence from the lesson.`,
          asyncActivities: `Review instructor-provided materials on ${theme} and prepare two questions for class.`,
          syncActivities: `Workshop ${theme} through examples, peer feedback, and a short application task.`,
          technologyNeeded: 'Course LMS, shared documents, and standard presentation tools.',
          presentationFormat: 'Mini-lesson, guided practice, and application workshop.',
          supportingResources: `Instructor-provided readings, examples, and templates related to ${theme}.`,
          evaluateDesign: true,
        },
      ],
    });
  }
  return lessons;
}

function buildExpandCoursePrompt({ currentLessonCount, targetLessonCount, agentDryRun = false } = {}) {
  const missingCount = Math.max(0, Number(targetLessonCount || 0) - Number(currentLessonCount || 0));
  if (agentDryRun) {
    return [
      `Review how to expand this course from ${currentLessonCount} to ${targetLessonCount} lessons.`,
      `Do not edit. Propose exactly ${missingCount} new lesson titles and the course-map fields each added lesson would need.`,
      'Call read_lesson only if the existing course-map summary in the prompt is insufficient.',
    ].join(' ');
  }

  return [
    `Expand the course map from ${currentLessonCount} to ${targetLessonCount} lessons.`,
    `Call edit_course_map with exactly ${missingCount} addLesson patch${missingCount === 1 ? '' : 'es'} appended after the existing lessons.`,
    'Keep existing lessons unchanged.',
    'Each added lesson must include a concrete title and one section with learningGoals, topicSection, learningObjectives, weeklyAssessments, asyncActivities, syncActivities, and technologyNeeded.',
    'After editing, summarize the added lessons and any downstream materials that now need sync or regeneration.',
  ].join(' ');
}

function buildAgentHelpPayload({
  activeTab,
  chat,
  lessonScope,
  courseMap,
  pendingSyncFeatureIds = [],
  canUndo = false,
}) {
  return {
    activeTarget: activeTab && activeTab !== 'courseMap' ? resolveLabel(activeTab) : 'Course Map',
    providerReady: chat?.isAgentProviderReady !== false,
    agentDryRun: Boolean(chat?.agentDryRun),
    lessonScopeText: describeLessonScope(lessonScope, courseMap),
    syncFeatureCount: Array.isArray(pendingSyncFeatureIds) ? pendingSyncFeatureIds.length : 0,
    canUndo,
  };
}

function getAgentCommandTemporaryBlockMessage({
  item,
  packageQualityPass,
  isDelivGenerating = false,
  isSyncing = false,
  isRevising = false,
  isStreaming = false,
  directPlanActionRunning = false,
}) {
  const displayText = item?.displayText || item?.label || 'that action';
  if (isFinishPassActive(packageQualityPass)) {
    return `I'm already checking the package. Wait for that to finish, then run ${displayText} again.`;
  }
  if (isDelivGenerating) {
    return `I'm still generating course materials. Wait for generation to finish, then run ${displayText} again.`;
  }
  if (isSyncing) {
    return `I'm syncing deliverables right now. Wait for sync to finish, then run ${displayText} again.`;
  }
  if (isRevising || isStreaming || directPlanActionRunning) {
    return `I'm already working on another Agent action. Wait for it to finish, then run ${displayText} again.`;
  }
  return '';
}

function summarizeDirectGenerationResult(result, requestedFeatureIds = []) {
  const completed = Array.isArray(result?.completedFeatureIds) ? result.completedFeatureIds : [];
  const failed = Array.isArray(result?.failedFeatureIds) ? result.failedFeatureIds : [];
  if (result?.status === 'busy') return result.message || 'Generation is already running.';
  if (completed.length === 0 && failed.length === 0 && result?.message) return result.message;
  if (failed.length > 0) {
    return `Generation finished with ${completed.length}/${requestedFeatureIds.length || completed.length + failed.length} deliverable${
      requestedFeatureIds.length === 1 ? '' : 's'
    } complete. ${summarizeFeatureIds(failed)} still need attention.`;
  }
  return `Generated ${summarizeFeatureIds(completed.length > 0 ? completed : requestedFeatureIds)} and ran the package checks.`;
}

function summarizeDirectAuditSummary(summary) {
  if (!summary) return 'Check complete. Review the package card.';
  if (summary.ready) return 'Check complete. No blockers found.';
  if (summary.tone === 'blocked') {
    return `Check complete. ${summary.blockerCount || summary.topIssues?.length || 1} blocker${
      (summary.blockerCount || summary.topIssues?.length || 1) === 1 ? '' : 's'
    } need attention.`;
  }
  return `Check complete. ${summary.warningCount || summary.topIssues?.length || 1} review item${
    (summary.warningCount || summary.topIssues?.length || 1) === 1 ? '' : 's'
  } found.`;
}

function textList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  const text = String(value || '').trim();
  return text ? [text] : [];
}

function buildAgentReceiptMessage({
  title = 'Action complete',
  status = 'done',
  badge = '',
  mode = 'Agent run',
  target = 'Workspace',
  changed = [],
  checked = [],
  issues = [],
  next = '',
  intent = null,
  runStats = null,
  toolManifest = null,
  stateDiffs = null,
} = {}) {
  const receipt = {
    title,
    status,
    badge,
    mode,
    target,
    changed: textList(changed),
    checked: textList(checked),
    issues: textList(issues).slice(0, 4),
    next,
  };
  if (intent) receipt.intent = intent;
  if (runStats) receipt.runStats = runStats;
  if (toolManifest) receipt.toolManifest = toolManifest;
  if (Array.isArray(stateDiffs) && stateDiffs.length > 0) receipt.stateDiffs = stateDiffs;
  return {
    role: 'agentReceipt',
    receipt,
  };
}

function extractSummaryIssues(summary = {}) {
  const topIssues = Array.isArray(summary.topIssues) ? summary.topIssues : [];
  if (topIssues.length > 0) {
    return topIssues
      .map((issue) => `${issue.label || 'Issue'}: ${issue.message || issue.text || 'Needs review.'}`)
      .filter(Boolean);
  }
  const issueCount =
    Number(summary.blockerCount || 0) +
    Number(summary.warningCount || 0) +
    Number(summary.classroomBlockerCount || 0) +
    Number(summary.classroomWarningCount || 0) +
    Number(summary.validationErrorCount || 0) +
    Number(summary.validationWarningCount || 0) +
    Number(summary.exportFailed || 0) +
    Number(summary.exportWarningCount || 0);
  if (!issueCount) return [];
  return [`${issueCount} package item${issueCount === 1 ? '' : 's'} need review.`];
}

function packageReceiptStatus(summary = {}) {
  const blockerCount =
    Number(summary.blockerCount || 0) + Number(summary.classroomBlockerCount || 0) + Number(summary.exportFailed || 0);
  const reviewCount =
    Number(summary.warningCount || 0) +
    Number(summary.classroomWarningCount || 0) +
    Number(summary.validationErrorCount || 0) +
    Number(summary.validationWarningCount || 0) +
    Number(summary.exportWarningCount || 0);
  if (summary.tone === 'blocked' || blockerCount > 0) {
    return 'blocked';
  }
  if (summary.ready === true) return 'done';
  if (summary.tone === 'assumptions' || reviewCount > 0) return 'review';
  if (summary.status === 'ready' || summary.packageQualityStatus === 'ready') return 'done';
  if (reviewCount === 0 && summary.tone !== 'assumptions') return 'done';
  return 'review';
}

function buildPackageAuditReceipt(summary = {}) {
  const status = packageReceiptStatus(summary);
  return buildAgentReceiptMessage({
    title: status === 'done' ? 'Package checked' : 'Review required',
    status,
    badge: status === 'done' ? 'Passed' : status === 'blocked' ? 'Blocked' : 'Review',
    mode: 'Local check',
    target: 'Package',
    changed: 'No content edits',
    checked: ['Readiness', 'Classroom fit', 'Content validation', 'Export files'],
    issues: extractSummaryIssues(summary),
    next:
      status === 'done'
        ? 'No blockers found in the read-only checks.'
        : status === 'blocked'
          ? 'Open the package issues before downloading.'
          : 'Review the package notes before export.',
  });
}

function buildPackageFinishReceipt(result = {}) {
  const summary = normalizePackageSummary(result);
  const status = packageReceiptStatus({
    ...summary,
    ready: result?.ready === true && packageReceiptStatus(summary) === 'done',
    packageQualityStatus: result?.packageQualityStatus || result?.status,
  });
  const repairsApplied = Number(summary.repairsApplied || 0);
  return buildAgentReceiptMessage({
    title: status === 'done' ? 'Package finished' : 'Finish needs review',
    status,
    badge: status === 'done' ? 'Ready' : status === 'blocked' ? 'Blocked' : 'Review',
    mode: 'Package finish',
    target: 'Package',
    changed:
      repairsApplied > 0
        ? `${repairsApplied} safe repair${repairsApplied === 1 ? '' : 's'} applied`
        : 'No safe repairs needed',
    checked: ['Readiness', 'Classroom fit', 'Content validation', 'Export files'],
    issues: extractSummaryIssues(summary),
    stateDiffs: buildPackageRepairReceiptDiffs(result),
    next: status === 'done' ? 'Download anytime.' : 'Review the remaining package issues before export.',
  });
}

function buildWorkspacePlanReceipt(plan = {}, mode = 'Workspace plan') {
  const action = plan?.highestImpactAction || (Array.isArray(plan?.actions) ? plan.actions[0] : null);
  return buildAgentReceiptMessage({
    title: 'Plan ready',
    status: 'done',
    badge: 'Plan ready',
    mode,
    target: 'Workspace',
    changed: 'No workspace edits',
    checked: ['Course map', 'Deliverable status', 'Package readiness'],
    next: action?.title ? `Start with: ${action.title}.` : 'Use the plan card to choose the next action.',
  });
}

function buildPackageRepairReceiptDiffs(result = {}) {
  const repairs = Array.isArray(result?.repairs) ? result.repairs : [];
  return repairs
    .filter(Boolean)
    .slice(0, 8)
    .map((repair) => ({
      status: repair.success === false ? 'failed' : 'changed',
      action: 'repair_package_readiness',
      target: repair.label || 'Package',
      featureId: repair.featureId,
      before: repair.success === false ? '' : 'Generated deliverable state',
      after:
        Array.isArray(repair.changes) && repair.changes.length > 0 ? repair.changes.join('; ') : repair.message || '',
      reason: repair.success === false ? repair.message || 'Package repair failed.' : '',
    }));
}

function buildUndoReceipt(targetLabel) {
  return buildAgentReceiptMessage({
    title: 'Undo complete',
    status: 'done',
    badge: 'Restored',
    mode: 'Undo',
    target: targetLabel,
    changed: `Restored previous ${targetLabel} state`,
    checked: 'Undo snapshot',
    stateDiffs: [
      {
        status: 'changed',
        action: 'undo_last',
        target: targetLabel,
        before: 'Latest deliverable state',
        after: 'Previous deliverable snapshot restored.',
      },
    ],
    next: 'Run Check package if you want me to verify the workspace again.',
  });
}

function buildGenerationReceipt(result = {}, featureSummary, requestedFeatureIds = []) {
  const failedCount = Array.isArray(result?.failedFeatureIds) ? result.failedFeatureIds.length : 0;
  const status = failedCount > 0 || result?.status === 'busy' ? 'review' : 'done';
  return buildAgentReceiptMessage({
    title: status === 'done' ? 'Generation receipt' : 'Generation needs review',
    status,
    badge: status === 'done' ? 'Generated' : 'Review',
    mode: 'Generation',
    target: featureSummary,
    changed: status === 'done' ? `Generated ${featureSummary}` : `Partially generated ${featureSummary}`,
    checked: 'Package checks after generation',
    issues:
      failedCount > 0
        ? [`${summarizeFeatureIds(result.failedFeatureIds)} still need attention.`]
        : result?.status === 'busy'
          ? [result.message || 'Generation was already running.']
          : [],
    next:
      status === 'done'
        ? 'Review the generated deliverables before export.'
        : 'Review the failed deliverables before export.',
  });
}

function buildSyncReceipt(featureSummary, mode = 'Sync', syncResult = null) {
  const canonicalPatches = collectSyncCanonicalPatches(syncResult);
  if (canonicalPatches.length > 0) {
    const providerCallText = getSyncReceiptProviderCallText(syncResult, true);
    const patchSummary = summarizeCanonicalPatchesForReceipt(canonicalPatches);
    const status = syncResult?.status === 'failed' || syncResult?.status === 'partialFail' ? 'review' : 'done';
    const issues =
      status === 'review' && Array.isArray(syncResult?.failedItems) && syncResult.failedItems.length > 0
        ? [`${summarizeSyncPlanFeatures(syncResult.failedItems)} did not finish syncing.`]
        : [];
    return buildAgentReceiptMessage({
      title: status === 'done' ? 'Blueprint sync receipt' : 'Blueprint sync needs review',
      status,
      badge: status === 'done' ? 'Synced' : 'Review',
      mode,
      target: featureSummary,
      intent: { type: 'content_edit', syncMode: 'canonical_patch' },
      runStats: { providerCallCount: Number(providerCallText) || 0 },
      toolManifest: [
        {
          tool: 'apply_canonical_patch',
          label: 'Update blueprint',
          status: 'done',
          summary: patchSummary,
          targets: ['Course Map'],
        },
        {
          tool: 'compiler_sync',
          label: 'Compiler sync',
          status: status === 'done' ? 'done' : 'partial',
          summary: `Model calls: ${providerCallText}`,
          targets: featureSummary ? [featureSummary] : [],
        },
      ],
      changed: `Updated blueprint: ${patchSummary}`,
      checked: [`Recompiled: ${featureSummary}`, `Model calls: ${providerCallText}`],
      issues,
      next:
        status === 'done'
          ? 'Review the synced lesson materials.'
          : 'Retry the failed sync items or keep the edit local.',
    });
  }
  return buildAgentReceiptMessage({
    title: 'Sync receipt',
    status: 'done',
    badge: 'Synced',
    mode,
    target: featureSummary,
    changed: `Synced ${featureSummary}`,
    checked: 'Approved sync plan',
    next: 'Check the sync card for the final status.',
  });
}

function buildSyncSkipReceipt(featureSummary, mode = 'Sync', suggestion = null) {
  const isCourseMapSource = suggestion?.editSource === 'courseMap';
  return buildAgentReceiptMessage({
    title: isCourseMapSource ? 'Sync skipped receipt' : 'Local edit receipt',
    status: 'done',
    badge: isCourseMapSource ? 'Skipped' : 'Kept local',
    mode,
    target: featureSummary,
    changed: isCourseMapSource ? 'Kept course map edit without recompiling deliverables' : 'Kept artifact edit local',
    checked: isCourseMapSource
      ? ['Compiler sync skipped', 'Model calls: 0']
      : ['Blueprint unchanged', 'Compiler sync skipped', 'Model calls: 0'],
    next: isCourseMapSource
      ? 'Run Sync later if deliverables should match the course map.'
      : 'No downstream sync will run for this local edit.',
  });
}

function summarizeDirectWorkspacePlan(plan) {
  const action = plan?.highestImpactAction || (Array.isArray(plan?.actions) ? plan.actions[0] : null);
  if (action?.title) return `Plan ready. Start with: ${action.title}.`;
  return 'Plan ready. Review the workspace plan card for the next step.';
}

function buildLocalAgentUserMessage(text, agentPromptOverride = null) {
  const message = { role: 'user', text };
  const prompt = typeof agentPromptOverride === 'string' ? agentPromptOverride.trim() : '';
  if (prompt) message.agentPromptOverride = prompt;
  return message;
}

function buildDirectAgentStep(tool, label, { status = 'done', targets = [], summary = '', stateDiffs = null } = {}) {
  const step = {
    tool,
    label,
    status,
    targets: Array.isArray(targets) ? targets.filter(Boolean) : [],
    summary,
  };
  if (Array.isArray(stateDiffs) && stateDiffs.length > 0) step.stateDiffs = stateDiffs;
  return step;
}

function buildDirectAgentProgress({
  id = null,
  startedAt,
  endedAt = null,
  mode = 'Agent run',
  target = 'Workspace',
  steps = [],
  status = null,
}) {
  const safeSteps = Array.isArray(steps) ? steps.filter(Boolean) : [];
  const resolvedStatus = status || (safeSteps.some((step) => step.status === 'error') ? 'error' : 'complete');
  const message = {
    id: id || `local-agent-progress-${startedAt || endedAt || Date.now()}`,
    role: 'agentProgress',
    status: resolvedStatus,
    startedAt: startedAt || endedAt || Date.now(),
    runMeta: {
      mode,
      target,
      model: 'Local tools',
    },
    steps: safeSteps,
  };
  if (resolvedStatus !== 'running') message.endedAt = endedAt || Date.now();
  return message;
}

function commitDirectAgentProgress(chat, progressId, progress) {
  if (typeof chat?.updateLocalMessage === 'function') {
    chat.updateLocalMessage({ id: progressId }, () => progress);
    return;
  }
  chat?.addLocalMessages?.(progress);
}

function issueStepStatus(errorCount = 0, warningCount = 0) {
  if (Number(errorCount) > 0) return 'error';
  if (Number(warningCount) > 0) return 'partial';
  return 'done';
}

function buildPackageAuditProgressSteps(summary = {}) {
  const readinessErrors = Number(summary.blockerCount || 0) + Number(summary.classroomBlockerCount || 0);
  const readinessWarnings = Number(summary.warningCount || 0) + Number(summary.classroomWarningCount || 0);
  const validationErrors = Number(summary.validationErrorCount || 0);
  const validationWarnings = Number(summary.validationWarningCount || 0);
  const exportErrors = Number(summary.exportFailed || 0);
  const exportWarnings = Number(summary.exportWarningCount || 0);

  return [
    buildDirectAgentStep('review_package_readiness', 'Review readiness', {
      status: issueStepStatus(readinessErrors, readinessWarnings),
      targets: ['Package'],
      summary:
        readinessErrors || readinessWarnings
          ? `${readinessErrors + readinessWarnings} readiness issue${readinessErrors + readinessWarnings === 1 ? '' : 's'}`
          : 'No readiness blockers',
    }),
    buildDirectAgentStep('validate_course', 'Validate course materials', {
      status: issueStepStatus(validationErrors, validationWarnings),
      targets: ['Package'],
      summary:
        validationErrors || validationWarnings
          ? `${validationErrors + validationWarnings} validation issue${validationErrors + validationWarnings === 1 ? '' : 's'}`
          : 'No validation issues',
    }),
    buildDirectAgentStep('verify_package_exports', 'Verify exports', {
      status: issueStepStatus(exportErrors, exportWarnings),
      targets: ['Package'],
      summary:
        exportErrors || exportWarnings ? `${exportErrors} failed, ${exportWarnings} warning` : 'Exports verified',
    }),
  ];
}

function buildPackageFinishProgressSteps(result = {}) {
  const summary = normalizePackageSummary(result);
  const repairIssueCount = Number(summary.repairsFailed || 0);
  const trustStatus = getPackageTrustStatus({
    packageQualityPass: {
      status: result?.packageQualityStatus || result?.status || (summary.ready ? 'ready' : 'blocked'),
      blockers: summary.blockerCount,
      warnings: summary.warningCount,
      receipt: result?.receipt || {
        exportFailed: summary.exportFailed,
        exportWarningCount: summary.exportWarningCount,
        topIssues: summary.topIssues,
      },
      quality: result?.quality || null,
    },
  });
  const finalStatus = trustStatus.clean
    ? 'done'
    : trustStatus.blocked
      ? 'error'
      : trustStatus.review
        ? 'partial'
        : classifyFinalizePackageStepStatus(result);
  const finishSummary =
    finalStatus === 'done'
      ? 'Safe checks passed'
      : finalStatus === 'error'
        ? `${trustStatus.blockerCount || summary.exportFailed || 1} blocker${
            (trustStatus.blockerCount || summary.exportFailed || 1) === 1 ? '' : 's'
          } still need review`
        : `${trustStatus.warningCount || summary.exportWarningCount || 1} review item${
            (trustStatus.warningCount || summary.exportWarningCount || 1) === 1 ? '' : 's'
          } found`;
  return [
    buildDirectAgentStep('repair_package_readiness', 'Repair safe blockers', {
      status: repairIssueCount > 0 ? 'partial' : 'done',
      targets: ['Package'],
      summary:
        Number(summary.repairsApplied || 0) > 0
          ? `${summary.repairsApplied} safe repair${summary.repairsApplied === 1 ? '' : 's'}`
          : 'No safe repairs needed',
      stateDiffs: buildPackageRepairReceiptDiffs(result),
    }),
    buildDirectAgentStep('finalize_package', 'Finish package', {
      status: finalStatus,
      targets: ['Package'],
      summary: finishSummary,
    }),
  ];
}

function formatLandingContextDetail(summary) {
  if (!summary?.hasContext) return '';
  const fileCount = Number(summary.fileCount || 0);
  const firstFile = summary.fileNames?.[0];
  const hiddenCount = Math.max(0, fileCount - (firstFile ? 1 : 0));
  const fileText =
    fileCount > 0
      ? firstFile
        ? `${firstFile}${hiddenCount > 0 ? ` +${hiddenCount}` : ''}`
        : `${fileCount} uploaded material${fileCount === 1 ? '' : 's'}`
      : '';
  const sourceNoteText = summary.hasMaterialNotes
    ? `${summary.materialNoteCount || 1} source note${summary.materialNoteCount === 1 ? '' : 's'}`
    : '';

  if (summary.hasPrompt && fileText && sourceNoteText) return `Starting request + ${fileText} + ${sourceNoteText}`;
  if (summary.hasPrompt && sourceNoteText) return `Starting request + ${sourceNoteText}`;
  if (fileText && sourceNoteText) return `Uploaded materials: ${fileText} + ${sourceNoteText}`;
  if (sourceNoteText) return `Uploaded materials: ${sourceNoteText}`;
  if (summary.hasPrompt && fileText) return `Starting request + ${fileText}`;
  if (summary.hasPrompt) return 'Starting request';
  return fileText ? `Uploaded materials: ${fileText}` : '';
}

const STATUS_TONES = {
  slate: 'bg-slate-100 text-slate-500 border-slate-200/70',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200/70',
  amber: 'bg-amber-50 text-amber-700 border-amber-200/70',
  red: 'bg-red-50 text-red-700 border-red-200/70',
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200/70',
};

const MODEL_CONFIG_TONES = {
  connected: 'border-emerald-200/70 bg-emerald-50 text-emerald-700 hover:bg-emerald-100/80',
  validating: 'border-amber-200/70 bg-amber-50 text-amber-700 hover:bg-amber-100/80',
  no_funds: 'border-amber-200/70 bg-amber-50 text-amber-700 hover:bg-amber-100/80',
  error: 'border-red-200/70 bg-red-50 text-red-700 hover:bg-red-100/80',
  idle: 'border-slate-200/70 bg-white/70 text-slate-600 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700',
};

const PROVIDER_LABELS = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  deepseek: 'DeepSeek',
  public: 'Scion',
  local: 'Scion',
  webllm: 'Local AI',
};

function getWorkspaceModelLabel({ modelName, modelId, isReady }) {
  const savedModel = String(modelName || '').trim();
  if (savedModel) return savedModel;
  const savedModelId = String(modelId || '').trim();
  if (savedModelId && isReady) return savedModelId;
  return isReady ? 'Choose model' : 'Configure model';
}

export function getWorkspaceModelStatus({
  provider,
  apiKey = '',
  apiStatus = 'idle',
  modelId = '',
  modelName = '',
  isReady = false,
} = {}) {
  const providerLabel = PROVIDER_LABELS[provider] || 'AI provider';
  const hasKey = Boolean(String(apiKey || '').trim());
  const hasModel = Boolean(String(modelId || modelName || '').trim());
  const savedModelLabel = hasModel ? getWorkspaceModelLabel({ modelName, modelId, isReady: true }) : '';

  if (apiStatus === 'validating') {
    return {
      label: 'Checking model',
      tone: 'validating',
      title: 'Checking the saved provider, key, and model',
      heading: 'Checking model connection',
      message: 'This workspace stays open while I validate the saved model setup.',
      actionLabel: 'Open settings',
      blocked: false,
    };
  }

  if (apiStatus === 'error') {
    return {
      label: savedModelLabel || 'Fix model/key',
      tone: 'error',
      title: 'Change provider, API key, or model',
      heading: 'Model connection failed',
      message:
        'Model-backed edits are paused because the saved provider, key, or model could not be validated. Local Audit and Plan still work.',
      actionLabel: 'Change key/model',
      blocked: true,
    };
  }

  if (apiStatus === 'no_funds') {
    return {
      label: savedModelLabel || 'Add credits',
      tone: 'no_funds',
      title: 'Add credits or change provider, API key, or model',
      heading: 'Model credits unavailable',
      message:
        'Model-backed edits are paused because this key has no available credits. Add credits or switch provider/key/model here.',
      actionLabel: 'Change key/model',
      blocked: true,
    };
  }

  if (provider !== 'webllm' && provider !== 'public' && provider !== 'local' && !hasKey) {
    return {
      label: savedModelLabel || 'Configure model',
      tone: 'idle',
      title: 'Connect a provider and API key',
      heading: 'Connect AI to edit with the agent',
      message: `Local checks still work. Connect ${providerLabel} for edits.`,
      actionLabel: 'Configure',
      blocked: true,
    };
  }

  if (!hasModel) {
    return {
      label: 'Choose model',
      tone: 'idle',
      title: 'Select a model',
      heading: 'Choose a model',
      message: 'Select a model to resume model-backed agent edits in this workspace.',
      actionLabel: 'Choose model',
      blocked: true,
    };
  }

  return {
    label: getWorkspaceModelLabel({ modelName, modelId, isReady }),
    tone: isReady ? 'connected' : 'idle',
    title: 'Change provider, API key, or model',
    heading: '',
    message: '',
    actionLabel: 'Change model',
    blocked: false,
  };
}

/**
 * ChatPanel — Unified chat interface replacing ProgressPanel + RevisionChat + HelpDrawer.
 * Handles: generation progress (header), help questions (Ask mode), agent actions (Revise mode),
 * file uploads, and inline progress cards.
 */
export default function ChatPanel({
  // Shared focus: ref holding { featureId, itemIndex } for the item on screen
  viewportRef,
  // Generation state
  currentStep,
  modelName,
  error,
  streamDetail,
  streamProgress,
  completenessInfo,
  isStopped,
  retryInfo,
  generationLog,
  // Generation controls
  onStop,
  onResume,
  onClearAll,
  onRetryExamine,
  // Deliverable state
  deliverables,
  selectedFeatures,
  columns,
  deliverableConfig,
  lessonScope,
  onLessonScopeChange,
  delivProgress,
  currentDelivFeatures,
  isDelivGenerating,
  delivTimings,
  packageQualityPass,
  onStopDeliverables,
  onPackageQualityPassUpdate,
  onAutoRepairReadiness,
  onFinalizePackage,
  onGenerateFeatures,
  onAuditPackage,
  // Sync state
  isSyncing,
  pendingSyncCount,
  syncingFeatures,
  // Revision
  onRevision,
  onDeliverableRevision,
  isRevising,
  activeTab,
  courseMap,
  slideTheme,
  // Chat state
  chatHistory,
  onChatHistoryChange,
  // Exam review
  pendingExamPatches,
  examChanges,
  onAcceptPatches,
  onRejectPatch,
  onFocusExamPatch,
  // Agent: course map editor + deliverable update
  editor,
  optimisticUpdate,
  regenerateLesson,
  // Agent phase 2: undo + highlight
  delivUndoSnapshot,
  delivUndoFn,
  delivCanUndo,
  onAgentHighlight,
  // Agent-mediated sync
  pendingSyncSuggestion,
  clearPendingSyncSuggestion,
  executeSyncPlan,
  clearSyncStalePlan,
  notifyEdit,
  // External ref for sending messages from outside (e.g., context menu)
  chatSendRef,
  // User ID for cloud sync
  uid,
  onApiCallEvent,
  // v0.14.4 WS-C1: the observation card routes into the unified review queue
  onOpenReviewQueue,
  compactReadyMode = false,
  ribbonModel = null,
}) {
  const [workspaceModelConfigOpen, setWorkspaceModelConfigOpen] = useState(false);
  const openWorkspaceModelConfig = useCallback(() => {
    setWorkspaceModelConfigOpen(true);
  }, []);
  const { provider, apiKey, apiStatus, modelId } = useAIConfig();

  // Detect agent mode: deliverables with done status exist
  const isAgentMode = !!(
    deliverables && Object.keys(deliverables).some((k) => k !== 'courseMap' && deliverables[k]?.status === 'done')
  );

  // Keep refs for values that can change between parallel tool calls in the same agent turn
  const delivRef = useRef(deliverables);
  delivRef.current = deliverables;
  const courseMapRef = useRef(courseMap);
  courseMapRef.current = courseMap;
  const autoRepairReadinessRef = useRef(onAutoRepairReadiness);
  autoRepairReadinessRef.current = onAutoRepairReadiness;
  const finalizePackageRef = useRef(onFinalizePackage);
  finalizePackageRef.current = onFinalizePackage;
  const packageQualityPassUpdateRef = useRef(onPackageQualityPassUpdate);
  packageQualityPassUpdateRef.current = onPackageQualityPassUpdate;

  // Build the action executor that agent mode uses
  const execAction = useCallback(
    (action, opts = {}) => {
      const optimisticUpdateWithRef = (featureId, data) => {
        optimisticUpdate(featureId, data);
        if (!featureId) return;
        delivRef.current = {
          ...(delivRef.current || {}),
          [featureId]: {
            ...(delivRef.current?.[featureId] || {}),
            status: 'done',
            data,
            error: null,
          },
        };
      };
      const result = executeAction(action, {
        editor,
        deliverables: opts.deliverables || delivRef.current,
        optimisticUpdate: opts.optimisticUpdate || optimisticUpdateWithRef,
        courseMap: courseMapRef.current,
        regenerateLesson,
        snapshot: opts.snapshot || delivUndoSnapshot,
        skipSnapshot: opts.skipSnapshot || false,
      });
      // Trigger visual highlight on success
      if (result.success && onAgentHighlight && action.featureId) {
        onAgentHighlight(action.featureId, action.lessonIndex ?? null);
      }
      return result;
    },
    [editor, optimisticUpdate, regenerateLesson, delivUndoSnapshot, onAgentHighlight],
  );

  const chat = useChatRouter({
    courseMap,
    activeTab,
    onRevision,
    onDeliverableRevision,
    isStopped,
    onResume,
    savedMessages: chatHistory,
    onMessagesChange: onChatHistoryChange,
    // Agent params
    deliverables,
    selectedFeatures,
    columns,
    deliverableConfig,
    lessonScope,
    executeAction: execAction,
    optimisticUpdate,
    delivUndoSnapshot,
    delivUndoFn,
    executeSyncPlan,
    notifyEdit,
    slideTheme,
    uid,
    onApiCallEvent,
    viewportRef,
  });

  // ── Expose chat.send to parent via ref (for context menu inline AI) ──
  useEffect(() => {
    if (!chatSendRef) return;
    chatSendRef.current = (prompt, options = {}) => {
      if (options.forceApplyMode) {
        chat.setAgentDryRun(false);
      }
      return chat.send(prompt, options);
    };
    // v0.15: the review queue's "Sync now" approves through the SAME router
    // pathway the chat card uses — execute the plan AND mark the suggestion
    // message done. Without this, the queue path read the live
    // pendingSyncSuggestion, which this panel consumes into chat history
    // (and nulls) within one render — the drawer's sync action was dead in
    // live use; only the chat card worked.
    chatSendRef.current.approveSyncSuggestion = (suggestionId, selectedPlan = null) =>
      chat.handleApproveSyncSuggestion(suggestionId, selectedPlan);
  }, [chat, chatSendRef]);

  // ── Bridge sync suggestion from useSmartSync into chat messages ──
  useEffect(() => {
    if (pendingSyncSuggestion) {
      chat.pushSyncSuggestion(pendingSyncSuggestion);
      clearPendingSyncSuggestion?.();
    }
    // Intentionally depends only on pendingSyncSuggestion: chat.pushSyncSuggestion and
    // clearPendingSyncSuggestion are stable refs/callbacks. Including them would trigger
    // spurious re-fires when the chat object identity changes during re-renders.
  }, [pendingSyncSuggestion]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Proactive agent: auto-review after deliverable generation completes ──
  const prevDelivGeneratingRef = useRef(isDelivGenerating);
  const proactiveReviewDoneRef = useRef(false);
  const autoReviewTimerRef = useRef(null);
  // v0.15.3 C2: ONE machine-derived status feeds the ref, the effects, and
  // every dep array below — the component never reads .status directly.
  const finishStatus = finishStatusOf(packageQualityPass);
  const packageQualityStatusRef = useRef(finishStatus);
  packageQualityStatusRef.current = finishStatus;
  const applyDeterministicReadinessRepairs = useCallback(() => {
    if (typeof autoRepairReadinessRef.current !== 'function') {
      return {
        changed: false,
        applied: 0,
        repairs: [],
        courseMap: courseMapRef.current,
        deliverables: delivRef.current,
      };
    }
    return autoRepairReadinessRef.current({
      selectedFeatureIds: selectedFeatures,
      lessonFilter: lessonScope?.type === 'specific' ? lessonScope.indices : null,
    });
  }, [selectedFeatures, lessonScope]);
  // If the user types and sends during the 2s delay, we cancel the auto-review
  // so we don't double-post a message on top of their own. Also keeps the
  // proactiveReviewDoneRef flipped so we don't re-schedule later.
  useEffect(() => {
    if (chat.isStreaming && autoReviewTimerRef.current) {
      clearTimeout(autoReviewTimerRef.current);
      autoReviewTimerRef.current = null;
      packageQualityPassUpdateRef.current?.({
        status: 'idle',
        message: 'Manual agent work started before the automatic final pass.',
        repairsApplied: 0,
        warnings: 0,
        blockers: 0,
      });
    }
  }, [chat.isStreaming]);
  useEffect(() => {
    if (
      finishStatus === 'running' &&
      packageQualityPass?.source !== 'auto-review-pending' &&
      autoReviewTimerRef.current
    ) {
      clearTimeout(autoReviewTimerRef.current);
      autoReviewTimerRef.current = null;
    }
  }, [packageQualityPass?.source, finishStatus]);
  useEffect(() => {
    const wasGenerating = prevDelivGeneratingRef.current;
    prevDelivGeneratingRef.current = isDelivGenerating;
    const packageFinishing = packageQualityStatusRef.current === 'running';
    if (packageFinishing) {
      if (!wasGenerating && isDelivGenerating) {
        proactiveReviewDoneRef.current = true;
      }
      return;
    }
    if (!wasGenerating && isDelivGenerating) {
      proactiveReviewDoneRef.current = false;
    }

    // Detect transition: generating → done (only trigger once per session)
    if (wasGenerating && !isDelivGenerating && isAgentMode && !chat.isStreaming && !proactiveReviewDoneRef.current) {
      const doneCount = deliverables ? Object.values(deliverables).filter((d) => d?.status === 'done').length : 0;
      if (doneCount >= 2) {
        proactiveReviewDoneRef.current = true;
        packageQualityPassUpdateRef.current?.({
          status: 'running',
          phase: 'finish',
          source: 'auto-review-pending',
          message: 'Finishing package: checking, repairing, and preparing export...',
          repairsApplied: 0,
          warnings: 0,
          blockers: 0,
        });
        // Brief delay to let UI settle, then run the finalizer — but cancel if the
        // user beats us to the punch by sending their own message.
        autoReviewTimerRef.current = setTimeout(async () => {
          autoReviewTimerRef.current = null;
          if (chat.isStreaming) {
            const repairResult = applyDeterministicReadinessRepairs();
            const lessonFilter = lessonScope?.type === 'specific' ? lessonScope.indices : null;
            const readiness = evaluateWorkspaceReadiness({
              courseMap: repairResult?.courseMap || courseMapRef.current,
              deliverables: repairResult?.deliverables || delivRef.current,
              selectedFeatures,
              columns,
              lessonFilter,
            });
            packageQualityPassUpdateRef.current?.({
              status: readiness.status,
              message: summarizePackageQuality(readiness, repairResult?.applied || 0),
              repairsApplied: repairResult?.applied || 0,
              warnings: readiness.warnings.length,
              blockers: readiness.blockers.length,
            });
            return;
          }
          if (typeof finalizePackageRef.current !== 'function') {
            const repairResult = applyDeterministicReadinessRepairs();
            const lessonFilter = lessonScope?.type === 'specific' ? lessonScope.indices : null;
            const readiness = evaluateWorkspaceReadiness({
              courseMap: repairResult?.courseMap || courseMapRef.current,
              deliverables: repairResult?.deliverables || delivRef.current,
              selectedFeatures,
              columns,
              lessonFilter,
            });
            packageQualityPassUpdateRef.current?.({
              status: readiness.status,
              message: summarizePackageQuality(readiness, repairResult?.applied || 0),
              repairsApplied: repairResult?.applied || 0,
              warnings: readiness.warnings.length,
              blockers: readiness.blockers.length,
            });
            return;
          }
          try {
            await finalizePackageRef.current({
              selectedFeatures,
              selectedFeatureIds: selectedFeatures,
              lessonFilter: lessonScope?.type === 'specific' ? lessonScope.indices : null,
              retry: true,
            });
          } catch (err) {
            packageQualityPassUpdateRef.current?.({
              status: 'blocked',
              message: err?.message || 'Package finishing could not complete.',
              repairsApplied: 0,
              warnings: 0,
              blockers: 1,
            });
          }
        }, 2000);
      }
    }
  }, [isDelivGenerating, finishStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  // v0.9.2 — the TA's eyes: when a generation run completes, surface at most
  // three grounded observations as quiet chips. Observe-only by contract.
  const digestRunRef = useRef(false);
  useEffect(() => {
    if (isDelivGenerating) {
      digestRunRef.current = true;
      return;
    }
    if (!digestRunRef.current) return;
    digestRunRef.current = false;
    const doneCount = Object.values(deliverables || {}).filter((entry) => entry?.status === 'done').length;
    if (doneCount === 0) return;
    const digest = buildPostGenerationDigest({ courseMap, deliverables });
    if (digest) chat.addLocalMessages([{ role: 'digest', digest, status: 'pending' }]);
  }, [isDelivGenerating]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(
    () => () => {
      if (autoReviewTimerRef.current) clearTimeout(autoReviewTimerRef.current);
    },
    [],
  );

  const showProgressHeader = !!(
    error ||
    (currentStep && currentStep !== 'done') ||
    isDelivGenerating ||
    finishStatus === 'running'
  );
  const compactReady = Boolean(
    compactReadyMode && isPackageReady(packageQualityPass) && !chat.isStreaming && !showProgressHeader,
  );

  // Extract latest agent progress for the fixed status area (not in chat scroll)
  const latestAgentProgress = useMemo(() => {
    for (let i = chat.messages.length - 1; i >= 0; i--) {
      if (chat.messages[i].role === 'agentProgress') return chat.messages[i];
    }
    return null;
  }, [chat.messages]);
  const isGeneratingWorkspace = !!(currentStep && currentStep !== 'done') || !!isDelivGenerating;
  const showsAgentIdentity = !!(courseMap || isGeneratingWorkspace || isAgentMode);
  const agentStatus =
    isAgentMode && !chat.isAgentProviderReady
      ? { label: 'Configure', tone: 'amber', detail: 'Provider/key required' }
      : deriveAgentStatus(latestAgentProgress, chat.isStreaming, isAgentMode, chat.agentDryRun, isGeneratingWorkspace);
  const compactReadyDetail =
    ribbonModel?.stage === 'ready' && ribbonModel?.stageLabel ? ribbonModel.stageLabel : 'Ready to export';
  const headerAgentStatus = compactReady
    ? { label: 'Ready', tone: 'emerald', detail: compactReadyDetail }
    : agentStatus;
  const landingContextSummary = useMemo(() => summarizeLandingAgentContext(chat.messages), [chat.messages]);
  const landingContextDetail = useMemo(
    () => formatLandingContextDetail(landingContextSummary),
    [landingContextSummary],
  );
  const packageReceiptSummary = useMemo(
    () => buildPackageReceiptSummary(packageQualityPass, courseMap, selectedFeatures, deliverables),
    [courseMap, deliverables, packageQualityPass, selectedFeatures],
  );
  const displayedMessages = useMemo(() => {
    const packageReceiptMessage = buildPackageReceiptMessage(packageReceiptSummary, packageQualityPass);
    const alreadyRendered = packageReceiptMessage
      ? chat.messages.some((message) => message?.role === 'packageSummary' && message.id === packageReceiptMessage.id)
      : false;
    return packageReceiptMessage && !alreadyRendered ? [...chat.messages, packageReceiptMessage] : chat.messages;
  }, [chat.messages, packageQualityPass, packageReceiptSummary]);
  const [directPlanActionRunning, setDirectPlanActionRunning] = React.useState(false);
  const staleDeliverableCount = deliverables
    ? Object.values(deliverables).filter((entry) => entry?.stale === true).length
    : 0;
  const agentCommandDisabled = !!(
    chat.isStreaming ||
    isRevising ||
    isDelivGenerating ||
    isSyncing ||
    directPlanActionRunning
  );
  const pendingSyncFeatureIds = useMemo(() => getPendingSyncFeatureIds(chat.messages), [chat.messages]);
  const activePendingSyncCount = Math.max(
    Number(pendingSyncCount) || 0,
    staleDeliverableCount,
    pendingSyncFeatureIds.length,
  );
  const workspacePlanActionCapabilities = useMemo(
    () => ({
      sync_stale_deliverables:
        pendingSyncFeatureIds.length > 0 && !agentCommandDisabled ? { featureIds: pendingSyncFeatureIds } : false,
      generate_missing_feature:
        typeof onGenerateFeatures === 'function' && courseMap?.lessons?.length && !agentCommandDisabled,
      regenerate_failed_feature:
        typeof onGenerateFeatures === 'function' && courseMap?.lessons?.length && !agentCommandDisabled,
      audit_package: typeof onAuditPackage === 'function' && courseMap?.lessons?.length && !agentCommandDisabled,
      review_readiness_blockers:
        typeof onAuditPackage === 'function' && courseMap?.lessons?.length && !agentCommandDisabled,
    }),
    [agentCommandDisabled, courseMap?.lessons?.length, onAuditPackage, onGenerateFeatures, pendingSyncFeatureIds],
  );
  const notifyAgentCommandTemporarilyBlocked = useCallback(
    (item) => {
      const message = getAgentCommandTemporaryBlockMessage({
        item,
        packageQualityPass,
        isDelivGenerating,
        isSyncing,
        isRevising,
        isStreaming: chat.isStreaming,
        directPlanActionRunning,
      });
      if (!message) return false;
      chat.addLocalMessages([
        buildLocalAgentUserMessage(item?.displayText || 'Run Agent action'),
        { role: 'assistant', text: message },
      ]);
      return true;
    },
    [chat, directPlanActionRunning, isDelivGenerating, isRevising, isSyncing, packageQualityPass],
  );
  const runDirectPackageAudit = useCallback(
    async ({
      displayText = 'Audit package',
      selectedFeatureIds = selectedFeatures,
      introText,
      agentPromptOverride = null,
    } = {}) => {
      if (!(typeof onAuditPackage === 'function' && courseMap?.lessons?.length && !agentCommandDisabled)) return false;
      const startedAt = Date.now();
      const progressId = `local-agent-audit-${startedAt}`;
      chat.addLocalMessages([
        buildLocalAgentUserMessage(displayText, agentPromptOverride),
        { role: 'assistant', text: introText || 'Checking the package.' },
        buildDirectAgentProgress({
          id: progressId,
          startedAt,
          mode: 'Local check',
          target: 'Package',
          status: 'running',
          steps: [
            buildDirectAgentStep('review_package_readiness', 'Review readiness', {
              status: 'running',
              targets: ['Package'],
              summary: 'Checking package readiness',
            }),
          ],
        }),
      ]);
      setDirectPlanActionRunning(true);
      try {
        const result = await onAuditPackage({
          selectedFeatureIds,
          lessonFilter: lessonScope?.type === 'specific' ? lessonScope.indices : null,
        });
        const summary = normalizePackageSummary(result);
        const progress = buildDirectAgentProgress({
          id: progressId,
          startedAt,
          mode: 'Local check',
          target: 'Package',
          steps: buildPackageAuditProgressSteps(summary),
        });
        commitDirectAgentProgress(chat, progressId, progress);
        chat.addLocalMessages([
          { role: 'packageSummary', summary },
          buildPackageAuditReceipt(summary),
          { role: 'assistant', text: summarizeDirectAuditSummary(summary) },
        ]);
      } catch (err) {
        const progress = buildDirectAgentProgress({
          id: progressId,
          startedAt,
          mode: 'Local check',
          target: 'Package',
          steps: [
            buildDirectAgentStep('review_package_readiness', 'Review readiness', {
              status: 'error',
              targets: ['Package'],
              summary: err?.message || 'Package audit failed',
            }),
          ],
        });
        commitDirectAgentProgress(chat, progressId, progress);
        chat.addLocalMessages({
          role: 'error',
          text: err?.message || 'Package audit could not complete.',
        });
      } finally {
        setDirectPlanActionRunning(false);
      }
      return true;
    },
    [agentCommandDisabled, chat, courseMap?.lessons?.length, lessonScope, onAuditPackage, selectedFeatures],
  );
  const runDirectPackageFinish = useCallback(
    async ({
      displayText = 'Finish package',
      introText = 'Finishing the package.',
      source = 'agent-command',
      maxRetryActions = 10,
      maxRetryCallBudget = 14,
      maxRetryPasses = 3,
      agentPromptOverride = null,
    } = {}) => {
      if (!(typeof finalizePackageRef.current === 'function' && !agentCommandDisabled && finishStatus !== 'running')) {
        return false;
      }

      const startedAt = Date.now();
      const progressId = `local-agent-finish-${startedAt}`;
      chat.addLocalMessages([
        buildLocalAgentUserMessage(displayText, agentPromptOverride),
        { role: 'assistant', text: introText },
        buildDirectAgentProgress({
          id: progressId,
          startedAt,
          mode: 'Package finish',
          target: 'Package',
          status: 'running',
          steps: [
            buildDirectAgentStep('finalize_package', 'Finish package', {
              status: 'running',
              targets: ['Package'],
              summary: 'Running safe repairs and export checks',
            }),
          ],
        }),
      ]);
      setDirectPlanActionRunning(true);
      try {
        const result = await finalizePackageRef.current({
          selectedFeatures,
          selectedFeatureIds: selectedFeatures,
          lessonFilter: lessonScope?.type === 'specific' ? lessonScope.indices : null,
          retry: true,
          source,
          maxRetryActions,
          maxRetryCallBudget,
          maxRetryPasses,
        });
        const progress = buildDirectAgentProgress({
          id: progressId,
          startedAt,
          mode: 'Package finish',
          target: 'Package',
          steps: buildPackageFinishProgressSteps(result),
        });
        commitDirectAgentProgress(chat, progressId, progress);
        const packageSummaryMessage = buildPackageFinishSummaryMessage(result, courseMap, selectedFeatures);
        chat.addLocalMessages([
          buildPackageFinishReceipt(result),
          { role: 'assistant', text: summarizeDirectPackageFinish(result) },
          ...(packageSummaryMessage ? [packageSummaryMessage] : []),
        ]);
      } catch (err) {
        const progress = buildDirectAgentProgress({
          id: progressId,
          startedAt,
          mode: 'Package finish',
          target: 'Package',
          steps: [
            buildDirectAgentStep('finalize_package', 'Finish package', {
              status: 'error',
              targets: ['Package'],
              summary: err?.message || 'Package finishing failed',
            }),
          ],
        });
        commitDirectAgentProgress(chat, progressId, progress);
        chat.addLocalMessages({
          role: 'error',
          text: err?.message || 'Package finishing could not complete.',
        });
      } finally {
        setDirectPlanActionRunning(false);
      }
      return true;
    },
    [agentCommandDisabled, chat, courseMap, finishStatus, lessonScope, selectedFeatures],
  );
  const runDirectWorkspacePlan = useCallback(
    async ({
      displayText = 'Plan next step',
      introText = 'Planning the next step.',
      agentPromptOverride = null,
    } = {}) => {
      if (agentCommandDisabled) return false;

      const startedAt = Date.now();
      const progressId = `local-agent-plan-${startedAt}`;
      chat.addLocalMessages([
        buildLocalAgentUserMessage(displayText, agentPromptOverride),
        { role: 'assistant', text: introText },
        buildDirectAgentProgress({
          id: progressId,
          startedAt,
          mode: 'Workspace plan',
          target: 'Workspace',
          status: 'running',
          steps: [
            buildDirectAgentStep('inspect_workspace', 'Inspect workspace', {
              status: 'running',
              targets: ['Workspace'],
              summary: 'Reading current workspace state',
            }),
          ],
        }),
      ]);
      setDirectPlanActionRunning(true);
      try {
        const { AGENT_TOOLS } = await import('../../lib/agentTools');
        const scopeIndices = lessonScope?.type === 'specific' ? lessonScope.indices : null;
        const toolCtx = {
          courseMap,
          activeTab,
          deliverables,
          selectedFeatures,
          columns,
          deliverableConfig,
          lessonFilter: scopeIndices,
          dryRun: !!chat.agentDryRun,
        };
        await AGENT_TOOLS.inspect_workspace.execute({}, toolCtx);
        const plan = await AGENT_TOOLS.plan_workspace_next_step.execute({}, toolCtx);
        const progress = buildDirectAgentProgress({
          id: progressId,
          startedAt,
          mode: 'Workspace plan',
          target: 'Workspace',
          steps: [
            buildDirectAgentStep('inspect_workspace', 'Inspect workspace', {
              targets: ['Workspace'],
              summary: 'Checked current materials',
            }),
            buildDirectAgentStep('plan_workspace_next_step', 'Plan next step', {
              targets: ['Workspace'],
              summary: 'Selected highest-impact action',
            }),
          ],
        });
        commitDirectAgentProgress(chat, progressId, progress);
        chat.addLocalMessages([
          { role: 'workspacePlan', plan },
          buildWorkspacePlanReceipt(plan, 'Workspace plan'),
          { role: 'assistant', text: summarizeDirectWorkspacePlan(plan) },
        ]);
      } catch (err) {
        const progress = buildDirectAgentProgress({
          id: progressId,
          startedAt,
          mode: 'Workspace plan',
          target: 'Workspace',
          steps: [
            buildDirectAgentStep('inspect_workspace', 'Inspect workspace', {
              status: 'error',
              targets: ['Workspace'],
              summary: err?.message || 'Workspace planning failed',
            }),
          ],
        });
        commitDirectAgentProgress(chat, progressId, progress);
        chat.addLocalMessages({
          role: 'error',
          text: err?.message || 'Workspace planning could not complete.',
        });
      } finally {
        setDirectPlanActionRunning(false);
      }
      return true;
    },
    [
      activeTab,
      agentCommandDisabled,
      chat,
      columns,
      courseMap,
      deliverableConfig,
      deliverables,
      lessonScope,
      selectedFeatures,
    ],
  );
  const runDirectUndo = useCallback(
    async ({
      displayText = 'Undo last change',
      introText = 'Undoing the last deliverable edit.',
      agentPromptOverride = null,
    } = {}) => {
      if (!(delivCanUndo && typeof delivUndoFn === 'function' && !agentCommandDisabled)) return false;

      const startedAt = Date.now();
      const progressId = `local-agent-undo-${startedAt}`;
      const targetLabel = activeTabLabel(activeTab);
      chat.addLocalMessages([
        buildLocalAgentUserMessage(displayText, agentPromptOverride),
        { role: 'assistant', text: introText },
        buildDirectAgentProgress({
          id: progressId,
          startedAt,
          mode: 'Undo',
          target: targetLabel,
          status: 'running',
          steps: [
            buildDirectAgentStep('undo_last', 'Undo last change', {
              status: 'running',
              targets: [targetLabel],
              summary: 'Restoring previous deliverable state',
            }),
          ],
        }),
      ]);
      setDirectPlanActionRunning(true);
      try {
        delivUndoFn();
        commitDirectAgentProgress(
          chat,
          progressId,
          buildDirectAgentProgress({
            id: progressId,
            startedAt,
            mode: 'Undo',
            target: targetLabel,
            steps: [
              buildDirectAgentStep('undo_last', 'Undo last change', {
                targets: [targetLabel],
                summary: 'Restored previous deliverable state',
                stateDiffs: [
                  {
                    status: 'changed',
                    action: 'undo_last',
                    target: targetLabel,
                    before: 'Latest deliverable state',
                    after: 'Previous deliverable snapshot restored.',
                  },
                ],
              }),
            ],
          }),
        );
        chat.addLocalMessages([
          buildUndoReceipt(targetLabel),
          {
            role: 'assistant',
            text: `Last ${targetLabel} change undone. Run Check package if you want me to verify the workspace again.`,
          },
        ]);
      } catch (err) {
        commitDirectAgentProgress(
          chat,
          progressId,
          buildDirectAgentProgress({
            id: progressId,
            startedAt,
            mode: 'Undo',
            target: targetLabel,
            steps: [
              buildDirectAgentStep('undo_last', 'Undo last change', {
                status: 'error',
                targets: [targetLabel],
                summary: err?.message || 'Undo failed',
              }),
            ],
          }),
        );
        chat.addLocalMessages({
          role: 'error',
          text: err?.message || 'Undo could not complete.',
        });
      } finally {
        setDirectPlanActionRunning(false);
      }
      return true;
    },
    [activeTab, agentCommandDisabled, chat, delivCanUndo, delivUndoFn],
  );

  const approveSyncSuggestionWithReceipt = useCallback(
    async (suggestionId, selectedPlan = null) => {
      const syncResult = await chat.handleApproveSyncSuggestion?.(suggestionId, selectedPlan);
      const planForSummary = Array.isArray(syncResult?.selectedPlan)
        ? syncResult.selectedPlan
        : Array.isArray(selectedPlan)
          ? selectedPlan
          : Array.isArray(syncResult?.suggestion?.plan)
            ? syncResult.suggestion.plan
            : [];
      const featureSummary = summarizeSyncPlanFeatures(planForSummary);
      const hasCanonicalPatches = collectSyncCanonicalPatches(syncResult).length > 0;
      chat.addLocalMessages([
        buildSyncReceipt(featureSummary, 'Sync', syncResult),
        {
          role: 'assistant',
          text: hasCanonicalPatches
            ? `Blueprint sync finished for ${featureSummary}.`
            : `Sync request finished for ${featureSummary}.`,
        },
      ]);
      return syncResult;
    },
    [chat],
  );

  const skipSyncSuggestionWithReceipt = useCallback(
    (suggestionId) => {
      const suggestion = chat.messages.find(
        (message) => message?.role === 'syncSuggestion' && message.id === suggestionId,
      );
      const plan = Array.isArray(suggestion?.plan) ? suggestion.plan : [];
      const shouldClearStale = suggestion?.status === 'pending';
      if (shouldClearStale && typeof clearSyncStalePlan === 'function') {
        clearSyncStalePlan(plan);
      }
      chat.handleSkipSyncSuggestion?.(suggestionId);
      if (shouldClearStale) {
        const featureSummary = summarizeSyncPlanFeatures(plan);
        chat.addLocalMessages([
          buildSyncSkipReceipt(featureSummary, 'Sync', suggestion),
          {
            role: 'assistant',
            text:
              suggestion?.editSource === 'courseMap'
                ? `Skipped compiler sync for ${featureSummary}.`
                : `Kept the edit local for ${featureSummary}.`,
          },
        ]);
      }
    },
    [chat, clearSyncStalePlan],
  );

  const handleWorkspacePlanAction = useCallback(
    async (action, followUp = {}) => {
      const intent = getWorkspacePlanIntent(action);
      const actionFeatureIds = getWorkspacePlanFeatureIds(action).filter((featureId) => featureId !== 'courseMap');
      const agentPromptOverride = followUp.sendOptions?.agentPromptOverride || null;
      if (
        notifyAgentCommandTemporarilyBlocked({
          id: intent || 'workspace-plan-action',
          displayText: followUp.displayText || action?.title || 'Run plan action',
        })
      ) {
        return { status: 'error' };
      }
      if (intent === 'audit_package' || intent === 'review_readiness_blockers') {
        const selectedFeatureIds = actionFeatureIds.length > 0 ? ['courseMap', ...actionFeatureIds] : selectedFeatures;
        const displayText = followUp.displayText || action?.title || 'Audit package';
        const handled = await runDirectPackageAudit({
          displayText,
          selectedFeatureIds,
          introText: intent === 'review_readiness_blockers' ? 'Checking the blockers.' : 'Checking the package.',
          agentPromptOverride,
        });
        if (handled) return true;
      }

      const generationFeatureIds = getWorkspacePlanFeatureIds(action).filter((featureId) => featureId !== 'courseMap');
      const canRunDirectGeneration =
        ['generate_missing_feature', 'regenerate_failed_feature'].includes(intent) &&
        generationFeatureIds.length > 0 &&
        typeof onGenerateFeatures === 'function' &&
        courseMap?.lessons?.length &&
        !agentCommandDisabled;
      if (canRunDirectGeneration) {
        const displayText = followUp.displayText || action?.title || 'Generate deliverables';
        const featureSummary = summarizeFeatureIds(generationFeatureIds);
        const startedAt = Date.now();
        const progressId = `local-agent-generate-${startedAt}`;
        chat.addLocalMessages([
          buildLocalAgentUserMessage(displayText, agentPromptOverride),
          {
            role: 'assistant',
            text: `${intent === 'regenerate_failed_feature' ? 'Regenerating' : 'Generating'} ${featureSummary} from the workspace plan.`,
          },
          buildDirectAgentProgress({
            id: progressId,
            startedAt,
            mode: 'Generation',
            target: featureSummary,
            status: 'running',
            steps: [
              buildDirectAgentStep('edit_deliverables', 'Generate deliverables', {
                status: 'running',
                targets: [featureSummary],
                summary: 'Starting generation',
              }),
            ],
          }),
        ]);
        setDirectPlanActionRunning(true);
        try {
          const result = await onGenerateFeatures({
            featureIds: generationFeatureIds,
            lessonFilter: lessonScope?.type === 'specific' ? lessonScope.indices : null,
            source: 'agent-plan',
          });
          const failedCount = Array.isArray(result?.failedFeatureIds) ? result.failedFeatureIds.length : 0;
          commitDirectAgentProgress(
            chat,
            progressId,
            buildDirectAgentProgress({
              id: progressId,
              startedAt,
              mode: 'Generation',
              target: featureSummary,
              steps: [
                buildDirectAgentStep('edit_deliverables', 'Generate deliverables', {
                  status: failedCount > 0 || result?.status === 'busy' ? 'partial' : 'done',
                  targets: [featureSummary],
                  summary: summarizeDirectGenerationResult(result, generationFeatureIds),
                }),
              ],
            }),
          );
          chat.addLocalMessages([
            buildGenerationReceipt(result, featureSummary, generationFeatureIds),
            { role: 'assistant', text: summarizeDirectGenerationResult(result, generationFeatureIds) },
          ]);
        } catch (err) {
          commitDirectAgentProgress(
            chat,
            progressId,
            buildDirectAgentProgress({
              id: progressId,
              startedAt,
              mode: 'Generation',
              target: featureSummary,
              steps: [
                buildDirectAgentStep('edit_deliverables', 'Generate deliverables', {
                  status: 'error',
                  targets: [featureSummary],
                  summary: err?.message || `Generation failed for ${featureSummary}`,
                }),
              ],
            }),
          );
          chat.addLocalMessages({
            role: 'error',
            text: err?.message || `Generation could not complete for ${featureSummary}.`,
          });
        } finally {
          setDirectPlanActionRunning(false);
        }
        return true;
      }

      const syncMatch = intent === 'sync_stale_deliverables' ? findPendingSyncPlanMatch(chat.messages, action) : null;
      const canRunDirectSync =
        intent === 'sync_stale_deliverables' &&
        action?.safeMode === 'needs-approval' &&
        syncMatch &&
        typeof chat.handleApproveSyncSuggestion === 'function' &&
        !agentCommandDisabled;
      if (canRunDirectSync) {
        const displayText = followUp.displayText || action?.title || 'Sync stale deliverables';
        const featureSummary = summarizeSyncPlanFeatures(syncMatch.selectedPlan);
        const startedAt = Date.now();
        const progressId = `local-agent-sync-${startedAt}`;
        chat.addLocalMessages([
          buildLocalAgentUserMessage(displayText, agentPromptOverride),
          { role: 'assistant', text: `Syncing ${featureSummary} from the workspace plan.` },
          buildDirectAgentProgress({
            id: progressId,
            startedAt,
            mode: 'Sync',
            target: featureSummary,
            status: 'running',
            steps: [
              buildDirectAgentStep('edit_deliverables', 'Sync stale deliverables', {
                status: 'running',
                targets: [featureSummary],
                summary: 'Applying approved sync plan',
              }),
            ],
          }),
        ]);
        setDirectPlanActionRunning(true);
        try {
          const syncResult = await chat.handleApproveSyncSuggestion(syncMatch.suggestion.id, syncMatch.selectedPlan);
          commitDirectAgentProgress(
            chat,
            progressId,
            buildDirectAgentProgress({
              id: progressId,
              startedAt,
              mode: 'Sync',
              target: featureSummary,
              steps: [
                buildDirectAgentStep('edit_deliverables', 'Sync stale deliverables', {
                  targets: [featureSummary],
                  summary: 'Applied the approved sync plan',
                }),
              ],
            }),
          );
          chat.addLocalMessages([
            buildSyncReceipt(featureSummary, 'Sync', syncResult),
            {
              role: 'assistant',
              text:
                collectSyncCanonicalPatches(syncResult).length > 0
                  ? `Blueprint sync finished for ${featureSummary}. Check the sync card for the final status.`
                  : `Sync request finished for ${featureSummary}. Check the sync card for the final status.`,
            },
          ]);
        } catch (err) {
          commitDirectAgentProgress(
            chat,
            progressId,
            buildDirectAgentProgress({
              id: progressId,
              startedAt,
              mode: 'Sync',
              target: featureSummary,
              steps: [
                buildDirectAgentStep('edit_deliverables', 'Sync stale deliverables', {
                  status: 'error',
                  targets: [featureSummary],
                  summary: err?.message || `Sync failed for ${featureSummary}`,
                }),
              ],
            }),
          );
          chat.addLocalMessages({
            role: 'error',
            text: err?.message || `Sync could not complete for ${featureSummary}.`,
          });
        } finally {
          setDirectPlanActionRunning(false);
        }
        return true;
      }

      const canRunDirectFinalize =
        intent === 'clear_readiness_blockers' &&
        ['safe-edit', 'safe-auto-fix'].includes(action?.safeMode) &&
        typeof finalizePackageRef.current === 'function' &&
        !agentCommandDisabled &&
        finishStatus !== 'running';
      if (!canRunDirectFinalize) return false;

      const displayText = followUp.displayText || action?.title || 'Fix package readiness';
      return runDirectPackageFinish({
        displayText,
        introText: 'Finishing the package.',
        source: 'agent-plan',
        maxRetryActions: 10,
        maxRetryCallBudget: 14,
        maxRetryPasses: 3,
        agentPromptOverride,
      });
    },
    [
      agentCommandDisabled,
      chat,
      courseMap?.lessons?.length,
      finishStatus,
      lessonScope,
      notifyAgentCommandTemporarilyBlocked,
      onAuditPackage,
      onGenerateFeatures,
      runDirectPackageAudit,
      runDirectPackageFinish,
      selectedFeatures,
    ],
  );
  const handleLessonScopeCommand = useCallback(
    async (item) => {
      if (!item || item.id !== 'set-lesson-scope') return false;

      const lessons = Array.isArray(courseMap?.lessons) ? courseMap.lessons : [];
      const currentLessonCount = lessons.length;
      const requestedAll = item.requestedScope === 'all';
      const targetLessonCount = requestedAll ? currentLessonCount : Number(item.targetLessonCount || 0);
      const displayText =
        item.displayText ||
        (requestedAll
          ? 'Use all lessons'
          : `Change scope to ${targetLessonCount} lesson${targetLessonCount === 1 ? '' : 's'}`);

      if (!currentLessonCount || !Number.isInteger(targetLessonCount) || targetLessonCount < 1) {
        chat.addLocalMessages([
          buildLocalAgentUserMessage(displayText),
          buildLessonScopeReceipt({
            status: 'blocked',
            issues: ['No generated course map is available to scope yet.'],
            next: 'Generate or restore a course map first.',
          }),
          { role: 'assistant', text: 'Generate or restore a course map before changing lesson scope.' },
        ]);
        return true;
      }

      if (targetLessonCount <= currentLessonCount) {
        const nextScope =
          requestedAll || targetLessonCount === currentLessonCount
            ? { type: 'all', indices: [] }
            : { type: 'specific', indices: Array.from({ length: targetLessonCount }, (_, index) => index) };
        onLessonScopeChange?.(nextScope);
        onPackageQualityPassUpdate?.({
          status: 'idle',
          message: `Scope changed to ${
            requestedAll || targetLessonCount === currentLessonCount ? `all ${currentLessonCount}` : targetLessonCount
          } lessons. Run Finish package to verify this scope.`,
          repairsApplied: 0,
          warnings: 0,
          blockers: 0,
        });
        const scopeText =
          requestedAll || targetLessonCount === currentLessonCount
            ? `all ${currentLessonCount} lessons`
            : `the first ${targetLessonCount} of ${currentLessonCount} lessons`;
        chat.addLocalMessages([
          buildLocalAgentUserMessage(displayText),
          buildLessonScopeReceipt({
            changed: [`Working set scope: ${scopeText}`],
            next: 'Run Finish package to verify the selected scope before downloading.',
          }),
          { role: 'assistant', text: `Scope updated to ${scopeText}.` },
        ]);
        return true;
      }

      const missingCount = targetLessonCount - currentLessonCount;
      const expansionLessons = buildDeterministicExpansionLessons({
        courseMap,
        currentLessonCount,
        targetLessonCount,
      });
      const addedLessonLabels = expansionLessons.map((lesson) => `Lesson ${Number(lesson.lessonIndex) + 1}`).join(', ');
      const generatedFeatureIds = (Array.isArray(selectedFeatures) ? selectedFeatures : []).filter(
        (featureId) => featureId !== 'courseMap' && deliverables?.[featureId]?.status === 'done',
      );
      const generatedFeatureSummary = summarizeFeatureIds(generatedFeatureIds);
      const scopeExpansionReceipt = (status = 'done') =>
        buildLessonScopeReceipt({
          status,
          changed: [
            `Updated blueprint: added ${addedLessonLabels || `${missingCount} lessons`}`,
            `Working set scope: all ${targetLessonCount} lessons`,
            generatedFeatureIds.length > 0
              ? `Compiler sync queued: ${generatedFeatureSummary}`
              : 'Compiler sync skipped: no generated downstream materials',
          ],
          checked: [
            `Course map lesson count: ${targetLessonCount}`,
            `Canonical patch: ${missingCount} addLesson patch${missingCount === 1 ? '' : 'es'}`,
            `Model calls: 0`,
          ],
          runStats: { providerCallCount: 0 },
          toolManifest: [
            {
              tool: 'apply_canonical_patch',
              label: 'Update blueprint',
              status: status === 'done' ? 'done' : 'review',
              summary: `Added ${addedLessonLabels || `${missingCount} lessons`}`,
              targets: ['Course Map'],
            },
            {
              tool: 'compiler_sync',
              label: 'Compiler sync',
              status: generatedFeatureIds.length > 0 ? 'pending' : 'skipped',
              summary: `Model calls: 0`,
              targets: generatedFeatureIds.length > 0 ? [generatedFeatureSummary] : [],
            },
          ],
          next:
            generatedFeatureIds.length > 0
              ? 'Run Sync stale deliverables when you want generated materials to match the expanded course map.'
              : 'Generate the selected deliverables for the expanded course map.',
        });

      if (typeof editor?.handleAddLessons === 'function') {
        const inserted = editor.handleAddLessons(expansionLessons);
        if (Array.isArray(inserted) && inserted.length === missingCount) {
          onLessonScopeChange?.({ type: 'all', indices: [] });
          onPackageQualityPassUpdate?.({
            status: 'idle',
            message: `Scope changed to all ${targetLessonCount} lessons. Sync generated materials before downloading.`,
            repairsApplied: 0,
            warnings: 0,
            blockers: 0,
          });
          chat.addLocalMessages([
            buildLocalAgentUserMessage(displayText),
            scopeExpansionReceipt('done'),
            {
              role: 'assistant',
              text: `Scope updated to all ${targetLessonCount} lessons. I added ${missingCount} course-map lesson${missingCount === 1 ? '' : 's'} and queued downstream sync. Model calls: 0.`,
            },
          ]);
          return true;
        }
      }

      if (!chat.isAgentProviderReady) {
        chat.addLocalMessages([
          buildLocalAgentUserMessage(displayText),
          buildLessonScopeReceipt({
            status: 'blocked',
            issues: [`Expanding from ${currentLessonCount} to ${targetLessonCount} lessons needs new lesson content.`],
            next: 'Configure an AI provider, then run this scope change again.',
          }),
          {
            role: 'assistant',
            text: `I can set scope within the existing ${currentLessonCount} lessons locally. Expanding to ${targetLessonCount} lessons needs the Agent to draft new course-map lessons.`,
          },
        ]);
        return true;
      }

      await chat.send(displayText, {
        displayText,
        agentPromptOverride: buildExpandCoursePrompt({
          currentLessonCount,
          targetLessonCount,
          agentDryRun: chat.agentDryRun,
        }),
      });
      return true;
    },
    [chat, courseMap, deliverables, editor, onLessonScopeChange, onPackageQualityPassUpdate, selectedFeatures],
  );
  const handleAgentCommand = useCallback(
    async (item) => {
      if (!item) return;
      if (item.id === 'agent-help') {
        chat.addLocalMessages([
          buildLocalAgentUserMessage(item.displayText),
          {
            role: 'agentHelp',
            help: buildAgentHelpPayload({
              activeTab,
              chat,
              lessonScope,
              courseMap,
              pendingSyncFeatureIds,
              canUndo: delivCanUndo,
            }),
          },
        ]);
        return;
      }
      if (notifyAgentCommandTemporarilyBlocked(item)) return;
      if (item.id === 'set-lesson-scope') {
        const handled = await handleLessonScopeCommand(item);
        if (handled) return;
      }
      if (item.id === 'sync-stale') {
        const handled = await handleWorkspacePlanAction(
          {
            title: 'Sync stale deliverables',
            target: summarizeFeatureIds(pendingSyncFeatureIds),
            safeMode: 'needs-approval',
            intent: { type: 'sync_stale_deliverables', featureIds: pendingSyncFeatureIds },
          },
          {
            displayText: item.displayText,
            sendOptions: { agentPromptOverride: item.prompt },
          },
        );
        if (handled) return;
      }
      if (item.id === 'improve-active' && activeTab && activeTab !== 'courseMap') {
        if (chat.agentDryRun) {
          const handled = await runDirectPackageAudit({
            displayText: item.displayText,
            selectedFeatureIds: ['courseMap', activeTab],
            introText: `Checking ${activeTabLabel(activeTab)} before any changes.`,
            agentPromptOverride: item.prompt,
          });
          if (handled) return;
        } else {
          // Improvement is a contextual Agent task, not a blind regeneration.
          // Route it through chat so attachments, the active artifact, and the
          // model-backed tool loop all reach Scion before any edit is proposed.
          await chat.send(item.displayText, {
            displayText: item.displayText,
            agentPromptOverride: item.prompt,
          });
          return;
        }
      }
      if (item.id === 'plan-next') {
        const handled = await runDirectWorkspacePlan({
          displayText: item.displayText,
          introText: 'Planning the next step.',
          agentPromptOverride: item.prompt,
        });
        if (handled) return;
      }
      if (item.id === 'undo-last') {
        const handled = await runDirectUndo({
          displayText: item.displayText,
          introText: 'Undoing the last deliverable edit from the Agent command.',
          agentPromptOverride: item.prompt,
        });
        if (handled) return;
      }
      if (item.id === 'audit-quality') {
        const handled = await runDirectPackageAudit({
          displayText: item.displayText,
          selectedFeatureIds: selectedFeatures,
          introText: 'Checking the package.',
          agentPromptOverride: item.prompt,
        });
        if (handled) return;
      }
      if (item.id === 'finish-package') {
        const handled = await runDirectPackageFinish({
          displayText: item.displayText,
          introText: 'Finishing the package.',
          source: 'agent-command',
          maxRetryActions: 10,
          maxRetryCallBudget: 14,
          maxRetryPasses: 3,
          agentPromptOverride: item.prompt,
        });
        if (handled) return;
      }
      chat.send(item.displayText, {
        displayText: item.displayText,
        agentPromptOverride: item.prompt,
      });
    },
    [
      chat,
      activeTab,
      courseMap,
      delivCanUndo,
      handleLessonScopeCommand,
      handleWorkspacePlanAction,
      lessonScope,
      notifyAgentCommandTemporarilyBlocked,
      pendingSyncFeatureIds,
      runDirectPackageAudit,
      runDirectPackageFinish,
      runDirectUndo,
      runDirectWorkspacePlan,
      selectedFeatures,
    ],
  );
  const handleAgentRecoveryAction = useCallback(
    async (action) => {
      if (!action) return false;
      const displayText = action.displayText || action.label || 'Recover Agent run';
      const fromReceipt = action.source === 'agent-receipt';
      if (notifyAgentCommandTemporarilyBlocked({ id: action.id, displayText })) return true;

      if (action.localIntent === 'audit-package') {
        return runDirectPackageAudit({
          displayText,
          selectedFeatureIds: selectedFeatures,
          introText: fromReceipt ? 'Checking the package.' : 'Checking the previous issue.',
          agentPromptOverride: action.prompt,
        });
      }

      if (action.localIntent === 'finish-package') {
        return runDirectPackageFinish({
          displayText,
          introText: fromReceipt ? 'Finishing the package.' : 'Retrying the safe fixes.',
          source: 'agent-recovery',
          maxRetryActions: 8,
          maxRetryCallBudget: 12,
          maxRetryPasses: 2,
          agentPromptOverride: action.prompt,
        });
      }

      if (action.localIntent === 'plan-next') {
        return runDirectWorkspacePlan({
          displayText,
          introText: fromReceipt ? 'Planning the next step.' : 'Planning the recovery.',
          agentPromptOverride: action.prompt,
        });
      }

      return false;
    },
    [
      chat.agentDryRun,
      notifyAgentCommandTemporarilyBlocked,
      runDirectPackageAudit,
      runDirectPackageFinish,
      runDirectWorkspacePlan,
      selectedFeatures,
    ],
  );
  const handleWorkspacePlanActionStateChange = useCallback(
    (messageIndex, actionStates) => {
      if (!Number.isInteger(messageIndex) || !actionStates || typeof actionStates !== 'object') return;
      chat.updateLocalMessage(
        (message, index) => index === messageIndex && message?.role === 'workspacePlan',
        (message) => ({
          ...message,
          actionStates,
          plan: message.plan ? { ...message.plan, actionStates } : message.plan,
        }),
      );
    },
    [chat],
  );
  const handleReceiptActionStateChange = useCallback(
    (messageIndex, actionStates) => {
      if (!Number.isInteger(messageIndex) || !actionStates || typeof actionStates !== 'object') return;
      chat.updateLocalMessage(
        (message, index) => index === messageIndex && message?.role === 'agentReceipt',
        (message) => ({
          ...message,
          actionStates,
          receipt: message.receipt ? { ...message.receipt, actionStates } : message.receipt,
        }),
      );
    },
    [chat],
  );
  const handleAgentStarterAction = useCallback(
    (starter) => {
      if (!starter?.action) return false;
      if (starter.action === 'regenerate-active') {
        const featureId = starter.featureId || activeTab;
        if (!featureId || featureId === 'courseMap') return false;
        if (
          notifyAgentCommandTemporarilyBlocked({
            id: 'improve-active',
            displayText: starter.text || `Improve ${activeTabLabel(featureId)}`,
          })
        ) {
          return true;
        }
        if (chat.agentDryRun) {
          runDirectPackageAudit({
            displayText: starter.text || `Improve ${activeTabLabel(featureId)}`,
            selectedFeatureIds: ['courseMap', featureId],
            introText: `Checking ${activeTabLabel(featureId)} before any changes.`,
          });
          return true;
        }
        handleWorkspacePlanAction(
          {
            title: `Regenerate ${activeTabLabel(featureId)}`,
            target: activeTabLabel(featureId),
            safeMode: 'requires-generation',
            intent: { type: 'regenerate_failed_feature', featureIds: [featureId] },
          },
          { displayText: starter.text || `Improve ${activeTabLabel(featureId)}` },
        );
        return true;
      }
      if (starter.action === 'local-audit') {
        if (
          notifyAgentCommandTemporarilyBlocked({
            id: 'audit-quality',
            displayText: starter.text || 'Run local audit',
          })
        ) {
          return true;
        }
        runDirectPackageAudit({
          displayText: starter.text || 'Run local audit',
          selectedFeatureIds: selectedFeatures,
          introText: 'Checking the package.',
        });
        return true;
      }
      if (starter.action === 'local-plan') {
        if (
          notifyAgentCommandTemporarilyBlocked({
            id: 'plan-next',
            displayText: starter.text || 'Plan next step',
          })
        ) {
          return true;
        }
        runDirectWorkspacePlan({
          displayText: starter.text || 'Plan next step',
          introText: 'Planning the next step.',
        });
        return true;
      }
      if (starter.action === 'finish-package') {
        if (
          notifyAgentCommandTemporarilyBlocked({
            id: 'finish-package',
            displayText: starter.text || 'Finish package',
          })
        ) {
          return true;
        }
        runDirectPackageFinish({
          displayText: starter.text || 'Finish package',
          introText: 'Finishing the package.',
          source: 'agent-starter',
          maxRetryActions: 10,
          maxRetryCallBudget: 14,
          maxRetryPasses: 3,
        });
        return true;
      }
      return false;
    },
    [
      activeTab,
      chat.agentDryRun,
      handleWorkspacePlanAction,
      notifyAgentCommandTemporarilyBlocked,
      runDirectPackageAudit,
      runDirectPackageFinish,
      runDirectWorkspacePlan,
      selectedFeatures,
    ],
  );

  const workspaceModelStatus = getWorkspaceModelStatus({
    provider,
    apiKey,
    apiStatus,
    modelId,
    modelName,
    isReady: chat.isAgentProviderReady,
  });
  const workspaceModelTone = MODEL_CONFIG_TONES[workspaceModelStatus.tone] || MODEL_CONFIG_TONES.idle;
  const showWorkspaceModelRecovery =
    showsAgentIdentity &&
    workspaceModelStatus.blocked &&
    !workspaceModelConfigOpen &&
    !chat.isStreaming &&
    !compactReady;

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200/70 bg-white/86 shadow-sm"
      data-print="hide"
    >
      {/* ── Header ── */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-200/70 flex-shrink-0">
        <div
          className={`w-7 h-7 rounded-lg flex items-center justify-center ${
            showsAgentIdentity ? 'bg-indigo-50' : 'bg-slate-100'
          }`}
        >
          {showsAgentIdentity ? (
            <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-semibold text-slate-800 truncate">
              {showsAgentIdentity ? 'Agent' : 'Assistant'}
            </h2>
            {/* When the recovery banner below carries the same "Configure"
                call-to-action (with the button), repeating it in this chip
                was a third nag on one screen — the banner is the message. */}
            {!(showWorkspaceModelRecovery && headerAgentStatus.label === 'Configure') && (
              <span
                className={`max-w-[150px] truncate rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_TONES[headerAgentStatus.tone]}`}
              >
                {headerAgentStatus.label}
              </span>
            )}
            {showsAgentIdentity && !compactReady && (
              <button
                type="button"
                data-testid="workspace-model-config-trigger"
                onClick={openWorkspaceModelConfig}
                className={`min-w-0 max-w-[170px] truncate rounded-full border px-2 py-0.5 text-[10px] font-bold transition-colors ${workspaceModelTone}`}
                title={workspaceModelStatus.title}
              >
                {workspaceModelStatus.label}
              </button>
            )}
          </div>
          <p className="text-[10px] text-slate-500 -mt-0.5 truncate">
            {compactReady
              ? headerAgentStatus.detail
              : showsAgentIdentity
                ? activeTabLabel(activeTab)
                : headerAgentStatus.detail}
          </p>
        </div>
        {chat.isStreaming && (
          <button
            type="button"
            onClick={chat.handleStop}
            className="group flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium text-violet-600 hover:text-red-600 hover:bg-red-50/80 border border-transparent hover:border-red-200/60 transition-all duration-150"
            title="Stop generation"
            aria-label="Stop generation"
          >
            <span className="relative w-2 h-2">
              <span className="absolute inset-0 rounded-full bg-violet-400 group-hover:hidden animate-pulse" />
              <span className="absolute inset-0 rounded-sm bg-red-500 hidden group-hover:block" />
            </span>
            <span className="group-hover:hidden">Working</span>
            <span className="hidden group-hover:inline">Stop</span>
          </button>
        )}
        {isAgentMode && (
          <CustomToolsMenu
            tools={chat.customTools}
            onDelete={chat.deleteCustomTool}
            onImport={chat.importCustomTool}
            syncError={chat.customToolSyncError}
          />
        )}
      </div>

      {workspaceModelConfigOpen && (
        <div
          data-testid="workspace-model-config-overlay"
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/25 px-3 py-6 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setWorkspaceModelConfigOpen(false);
          }}
        >
          <div className="w-full max-w-3xl rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xl shadow-slate-950/20">
            <div className="mb-2 flex items-center justify-between gap-3 px-1">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-800">Agent model settings</p>
                <p className="truncate text-[11px] font-medium text-slate-500">
                  Update the provider, API key, or model without leaving this workspace.
                </p>
              </div>
              <button
                type="button"
                data-testid="workspace-model-config-close"
                onClick={() => setWorkspaceModelConfigOpen(false)}
                className="tactile rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
            <div data-testid="workspace-model-config-panel">
              <ModelConfig />
            </div>
          </div>
        </div>
      )}

      {showWorkspaceModelRecovery && (
        <div
          data-testid="workspace-model-recovery-banner"
          className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-amber-200/50 bg-amber-50/80 px-3.5 py-2"
        >
          <div className="min-w-0">
            <p className="truncate text-[12px] font-bold text-amber-800">{workspaceModelStatus.heading}</p>
            <p className="truncate text-[11px] font-medium text-amber-700">{workspaceModelStatus.message}</p>
          </div>
          <button
            type="button"
            data-testid="workspace-model-recovery-action"
            onClick={openWorkspaceModelConfig}
            className="tactile shrink-0 rounded-lg border border-amber-200/80 bg-white/85 px-2.5 py-1 text-[11px] font-bold text-amber-700 hover:bg-amber-100"
          >
            {workspaceModelStatus.actionLabel}
          </button>
        </div>
      )}

      {showsAgentIdentity && landingContextDetail && (
        <div
          data-testid="agent-context-strip"
          className="flex min-h-[34px] flex-shrink-0 items-center gap-2 border-b border-slate-200/40 bg-slate-50/55 px-3.5 py-1.5 text-[11px]"
        >
          <span className="shrink-0 rounded-full border border-indigo-100 bg-white/80 px-2 py-0.5 font-bold text-indigo-600">
            Project brief
          </span>
          <span className="min-w-0 truncate font-medium text-slate-600">{landingContextDetail}</span>
        </div>
      )}

      {showsAgentIdentity && !compactReady && (
        <AgentWorkingSetPanel
          courseMap={courseMap}
          activeTab={activeTab}
          deliverables={deliverables}
          selectedFeatures={selectedFeatures}
          lessonScope={lessonScope}
          pendingSyncFeatureIds={pendingSyncFeatureIds}
          packageQualityPass={packageQualityPass}
          messages={chat.messages}
          agentDryRun={chat.agentDryRun}
          isAgentProviderReady={chat.isAgentProviderReady}
        />
      )}

      {/* ── Progress Header (collapsible) — generation + deliverable status ── */}
      {showProgressHeader && (
        <Suspense fallback={null}>
          <ProgressHeader
            currentStep={currentStep}
            modelName={modelName}
            streamProgress={streamProgress}
            streamDetail={streamDetail}
            completenessInfo={completenessInfo}
            error={error}
            isStopped={isStopped}
            retryInfo={retryInfo}
            deliverables={deliverables}
            delivProgress={delivProgress}
            currentDelivFeatures={currentDelivFeatures}
            isDelivGenerating={isDelivGenerating}
            delivTimings={delivTimings}
            packageQualityPass={packageQualityPass}
            onStop={onStop}
            onResume={onResume}
            onClearAll={onClearAll}
            onStopDeliverables={onStopDeliverables}
            isSyncing={isSyncing}
            pendingSyncCount={activePendingSyncCount}
            syncingFeatures={syncingFeatures}
          />
        </Suspense>
      )}

      {/* ── Exam Review (if pending) ── */}
      {(pendingExamPatches || (examChanges && examChanges.length > 0)) && (
        <div className="flex-shrink-0 border-b border-slate-200/40 px-4 py-2">
          <ExamReview
            pendingExamPatches={pendingExamPatches}
            examChanges={examChanges}
            onAcceptPatches={onAcceptPatches}
            onRejectPatch={onRejectPatch}
            onFocusPatch={onFocusExamPatch}
          />
        </div>
      )}

      {/* ── Message List (scrollable) — clean chat only ── */}
      <MessageList
        messages={displayedMessages}
        isStreaming={chat.isStreaming}
        onSuggestionClick={(q, options) => chat.send(q, options)}
        onStarterAction={handleAgentStarterAction}
        onRecoveryAction={handleAgentRecoveryAction}
        onWorkspacePlanAction={handleWorkspacePlanAction}
        onWorkspacePlanActionStateChange={handleWorkspacePlanActionStateChange}
        onReceiptActionStateChange={handleReceiptActionStateChange}
        onConfigureAI={openWorkspaceModelConfig}
        onSelectProposal={chat.handleSelectProposal}
        onDigestPrompt={(prompt) => chat.send(prompt)}
        onDigestOpenReview={onOpenReviewQueue}
        onDigestDismiss={(messageIndex) =>
          chat.updateLocalMessage(
            (msg, i) => i === messageIndex && msg.role === 'digest',
            (msg) => ({ ...msg, status: 'dismissed' }),
          )
        }
        onAcceptDiff={chat.handleAcceptDiff}
        onRejectDiff={chat.handleRejectDiff}
        onUndo={delivUndoFn}
        canUndo={delivCanUndo}
        onApproveSyncSuggestion={approveSyncSuggestionWithReceipt}
        onSkipSyncSuggestion={skipSyncSuggestionWithReceipt}
        onRegenerate={chat.regenerate}
        onFeedback={chat.feedback}
        onEditAndResend={chat.editAndResend}
        onRetryFailedEdits={chat.retryFailedEdits}
        onKeepAppliedChanges={chat.keepAppliedChanges}
        courseMap={courseMap}
        activeTab={activeTab}
        deliverables={deliverables}
        packageQualityPass={packageQualityPass}
        isAgentMode={isAgentMode}
        isAgentProviderReady={chat.isAgentProviderReady}
        isGenerating={!!(currentStep && currentStep !== 'done')}
        isDelivGenerating={!!isDelivGenerating}
        workspacePlanActionCapabilities={workspacePlanActionCapabilities}
        quietReadyMode={false}
      />

      {/* ── Chat Input ── */}
      <ChatInput
        onSend={chat.send}
        isStreaming={chat.isStreaming}
        isRevising={isRevising}
        onStop={chat.handleStop}
        attachedFiles={chat.attachedFiles}
        onProcessFiles={chat.processFiles}
        onRemoveAttached={chat.removeAttached}
        isParsing={chat.isParsing}
        activeTab={activeTab}
        courseMap={courseMap}
        isStopped={isStopped}
        hasPendingProposal={chat.messages.some((m) => m.role === 'proposal' && m.status === 'pending')}
        isAgentMode={isAgentMode}
        isAgentProviderReady={chat.isAgentProviderReady}
        agentDryRun={chat.agentDryRun}
        onConfigureAI={openWorkspaceModelConfig}
        onAgentCommand={handleAgentCommand}
        syncFeatureCount={pendingSyncFeatureIds.length}
        onUndo={delivUndoFn}
        canUndo={delivCanUndo}
      />
    </div>
  );
}
