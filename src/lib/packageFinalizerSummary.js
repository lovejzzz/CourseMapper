import { buildHumanReviewRecommendation, summarizeRepairEvidence } from './packageTrust.js';
import { CURRENT_FINALIZER_REVISION } from './packageTrustStatus.js';

const CONFIDENCE_TONES = {
  Excellent: 'excellent',
  'Good with assumptions': 'assumptions',
  'Needs attention': 'blocked',
};

function count(value) {
  return Number.isFinite(value) ? value : 0;
}

export function resolveProviderCallCount(result = null, fallbackCount = 0) {
  const reported = Number(result?.providerCallCount ?? result?.providerCallsUsed);
  const resolved = Number.isFinite(reported) ? reported : Number(fallbackCount);
  return Number.isFinite(resolved) ? Math.max(0, Math.floor(resolved)) : 0;
}

function pluralize(countValue, singular, plural = `${singular}s`) {
  return `${countValue} ${countValue === 1 ? singular : plural}`;
}

function mapIssue(issue, fallbackSeverity = 'warning') {
  return {
    severity: issue?.severity || fallbackSeverity,
    label: issue?.label || issue?.category || issue?.featureId || 'Package',
    message: issue?.message || 'Review this item before export.',
  };
}

function buildReviewActionsFromIssues(issues = []) {
  const normalizedIssues = Array.isArray(issues) ? issues.filter((issue) => issue?.label && issue?.message) : [];
  if (normalizedIssues.length > 0) {
    return normalizedIssues.slice(0, 5).map((issue) => ({
      label: issue.label,
      action: issue.message,
    }));
  }
  return [
    { label: 'Official dates', action: 'Confirm the official calendar and due dates before publication.' },
    { label: 'Local policy', action: 'Confirm institution policy language and accommodation wording.' },
    { label: 'Source permissions', action: 'Confirm copied readings, media, cases, and datasets are approved.' },
  ];
}

export function buildPackageTrustBoundarySummary({
  lessonCount = 0,
  compilerSummary = null,
  repairsApplied = 0,
  safeInferenceCount = null,
  modelCallCount = null,
  apiSpendSummary = null,
  reviewRequiredCount = 0,
  externalProofStatus = 'not attached',
} = {}) {
  const items = [];
  const normalizedLessonCount = count(lessonCount);
  if (normalizedLessonCount > 0) {
    items.push({ id: 'source', label: 'Course source', value: pluralize(normalizedLessonCount, 'lesson') });
  }

  const compiledFeatureCount = count(compilerSummary?.compiledFeatureCount);
  if (compiledFeatureCount > 0) {
    items.push({ id: 'compiled', label: 'Compiled', value: pluralize(compiledFeatureCount, 'material') });
  }

  if (Number.isFinite(safeInferenceCount)) {
    items.push({ id: 'inferred', label: 'Safely inferred', value: pluralize(count(safeInferenceCount), 'field') });
  }

  items.push({ id: 'repaired', label: 'Local repairs', value: String(count(repairsApplied)) });

  const apiSpendLabel =
    typeof apiSpendSummary === 'string' ? apiSpendSummary.trim() : String(apiSpendSummary?.label || '').trim();
  if (apiSpendLabel) {
    items.push({ id: 'model', label: 'Model use', value: apiSpendLabel });
  } else if (Number.isFinite(modelCallCount)) {
    items.push({ id: 'model', label: 'Model calls', value: String(count(modelCallCount)) });
  }

  items.push({ id: 'review', label: 'Needs review', value: String(count(reviewRequiredCount)) });

  if (externalProofStatus) {
    items.push({ id: 'external-proof', label: 'External proof', value: String(externalProofStatus) });
  }

  return { items };
}

function exportReceiptValue(exportVerification = {}) {
  if (Array.isArray(exportVerification.formatsVerified) && exportVerification.formatsVerified.length > 0) {
    return exportVerification.formatsVerified.join(', ');
  }
  const checked = count(exportVerification.checked);
  if (checked > 0) return pluralize(checked, 'export check');
  return 'not verified';
}

function localConfirmationValue(checklist = []) {
  const items = Array.isArray(checklist) ? checklist.map((item) => String(item || '').trim()).filter(Boolean) : [];
  if (items.length === 0) return 'official dates, policies, readings';
  return items.slice(0, 3).join('; ');
}

export function sourceGroundedLessonCountForReceipt(coverage, lessonCount = 0) {
  if (!coverage || typeof coverage !== 'object') return null;
  const total = Math.max(0, Number(lessonCount) || Number(coverage.sessions) || 0);
  const observed = Math.max(
    Number(coverage.researchedLessons) || 0,
    Number(coverage.genomeLinkedLessons) || 0,
    Number(coverage.resourcesByOrigin?.['algi-research']) > 0 ? Number(coverage.sessionsWithResources) || 0 : 0,
  );
  return total > 0 ? Math.min(total, observed) : observed;
}

export function buildCompactPackageTrustReceipt({
  lessonCount = 0,
  compilerSummary = null,
  selectedFeatureCount = null,
  modelGeneratedDeliverableCount = 0,
  deterministicRepairCount = 0,
  reviewRequiredCount = 0,
  sourceGroundedLessonCount = null,
  inferredAssumptionCount = null,
  exportVerification = {},
  studentFacingCleanlinessStatus = 'checked',
  localConfirmationChecklist = [],
  liveProviderCallCount = null,
  budgetStatus = '',
} = {}) {
  const compiledDeliverables = count(compilerSummary?.compiledFeatureCount);
  const selectedCount = Number.isFinite(selectedFeatureCount) ? count(selectedFeatureCount) : compiledDeliverables;
  const modelGenerated = Number.isFinite(modelGeneratedDeliverableCount)
    ? count(modelGeneratedDeliverableCount)
    : Math.max(0, selectedCount - compiledDeliverables);
  const fields = [
    { id: 'compiled', label: 'Compiled', value: pluralize(compiledDeliverables, 'deliverable') },
    { id: 'model-generated', label: 'Model-generated', value: pluralize(modelGenerated, 'deliverable') },
    { id: 'repairs', label: 'Repairs', value: pluralize(count(deterministicRepairCount), 'safe repair') },
    { id: 'review', label: 'Review needed', value: pluralize(count(reviewRequiredCount), 'lesson') },
  ];

  // Unknown is not zero. Render this receipt only when graph coverage supplied
  // an observed count; the former lesson-count fallback falsely displayed
  // "0/N" for fully researched packages.
  if (Number.isFinite(sourceGroundedLessonCount)) {
    fields.push({
      id: 'source-grounded',
      label: 'Source-grounded',
      value: `${count(sourceGroundedLessonCount)}/${count(lessonCount)} lessons`,
    });
  }

  if (Number.isFinite(inferredAssumptionCount)) {
    fields.push({ id: 'assumptions', label: 'Assumptions', value: String(count(inferredAssumptionCount)) });
  }

  fields.push(
    { id: 'exports', label: 'Exports verified', value: exportReceiptValue(exportVerification) },
    { id: 'cleanliness', label: 'Student-facing cleanliness', value: studentFacingCleanlinessStatus || 'checked' },
    { id: 'confirmations', label: 'Local confirmations', value: localConfirmationValue(localConfirmationChecklist) },
  );

  if (Number.isFinite(liveProviderCallCount)) {
    fields.push({ id: 'live-calls', label: 'Live calls', value: String(count(liveProviderCallCount)) });
  }
  if (budgetStatus) fields.push({ id: 'budget', label: 'Budget', value: String(budgetStatus) });

  return { fields };
}

function summarizeQualityReceiptIssue(issue, labelForFeature) {
  if (!issue) return null;
  return {
    severity: issue.severity === 'blocker' ? 'error' : issue.severity || 'warning',
    label: issue.label || labelForFeature?.(issue.featureId) || issue.featureId || 'Package',
    message: issue.message || 'Needs attention before export.',
  };
}

export function buildQualityReceipt({
  result,
  exportVerification,
  repairsApplied = 0,
  retryCount = 0,
  selectedFeatureIds = [],
  courseMap,
  includeWarnings = true,
  apiSpendSummary = null,
  compilerSummary = null,
  sourceGroundedLessonCount = null,
  labelForFeature,
} = {}) {
  const readiness = result?.readiness || {};
  const blockers = Array.isArray(readiness.blockers) ? readiness.blockers : [];
  const warnings = Array.isArray(readiness.warnings) ? readiness.warnings : [];
  const exportWarning = (exportVerification?.checks || []).find((check) => check.status === 'warning');
  const topIssues = [...blockers, ...(includeWarnings ? warnings : [])]
    .map((issue) => summarizeQualityReceiptIssue(issue, labelForFeature))
    .filter(Boolean)
    .slice(0, 3);
  const checkedFeatureCount = Array.isArray(selectedFeatureIds) ? selectedFeatureIds.length : 0;
  const repairSummary = summarizeRepairEvidence(result?.repairs || []);
  const humanDecisionCount = blockers.length + (includeWarnings ? warnings.length : 0);
  const lessonCount = courseMap?.lessons?.length || 0;
  const reviewRequiredCount =
    humanDecisionCount + (exportVerification?.failed || 0) + (exportVerification?.warningCount || 0);
  const handoffStatus =
    blockers.length + (exportVerification?.failed || 0) > 0
      ? 'blocked'
      : reviewRequiredCount > 0
        ? 'exportable-needs-review'
        : 'publishable';
  return {
    finalizerRevision: CURRENT_FINALIZER_REVISION,
    handoffStatus,
    checkedSections: checkedFeatureCount > 0 ? `${checkedFeatureCount}/${checkedFeatureCount}` : '',
    lessonCount,
    autoFixedCount: repairsApplied,
    retriedCount: retryCount,
    humanDecisionCount,
    exportStatus: exportVerification?.status || '',
    exportChecked: exportVerification?.checked || 0,
    exportFailed: exportVerification?.failed || 0,
    exportWarningCount: exportVerification?.warningCount || 0,
    exportWarning: exportWarning?.message || '',
    repairSummary,
    trustBoundary: buildPackageTrustBoundarySummary({
      lessonCount,
      compilerSummary,
      repairsApplied,
      apiSpendSummary,
      reviewRequiredCount,
      externalProofStatus: 'not attached',
    }),
    compactTrustReceipt: buildCompactPackageTrustReceipt({
      lessonCount,
      compilerSummary,
      selectedFeatureCount: checkedFeatureCount,
      deterministicRepairCount: repairsApplied,
      reviewRequiredCount,
      sourceGroundedLessonCount,
      exportVerification,
      studentFacingCleanlinessStatus:
        exportVerification?.failed || exportVerification?.warningCount ? 'review flagged' : 'clean',
      localConfirmationChecklist: ['official dates', 'institution policies', 'copyrighted readings'],
      budgetStatus: apiSpendSummary?.label || 'within configured budget',
    }),
    reviewRecommendation: buildHumanReviewRecommendation({
      blockerCount: blockers.length + (exportVerification?.failed || 0),
      warningCount: (includeWarnings ? warnings.length : 0) + (exportVerification?.warningCount || 0),
      repaired: repairSummary !== 'none',
    }),
    reviewActions: buildReviewActionsFromIssues(topIssues),
    topIssues,
  };
}

export function normalizePackageSummary(result = {}) {
  const confidence = result.confidence || (result.error ? 'Needs attention' : 'Good with assumptions');
  const readiness = result.readiness || {};
  const classroomReadiness = result.classroomReadiness || {};
  const validation = result.validation || {};
  const exportVerification = result.exportVerification || {};
  const blockers = Array.isArray(readiness.blockers) ? readiness.blockers.map((issue) => mapIssue(issue, 'error')) : [];
  const warnings = Array.isArray(readiness.warnings)
    ? readiness.warnings.map((issue) => mapIssue(issue, 'warning'))
    : [];
  const classroomBlockers = Array.isArray(classroomReadiness.blockers)
    ? classroomReadiness.blockers.map((issue) => mapIssue(issue, 'error'))
    : [];
  const classroomWarnings = Array.isArray(classroomReadiness.warnings)
    ? classroomReadiness.warnings.map((issue) => mapIssue(issue, 'warning'))
    : [];
  const findings = Array.isArray(validation.findings)
    ? validation.findings
        .filter((finding) => finding?.severity === 'error' || finding?.severity === 'warning')
        .map((issue) => mapIssue(issue, issue?.severity || 'warning'))
    : [];
  const exportIssues = Array.isArray(exportVerification.checks)
    ? exportVerification.checks
        .filter((check) => check?.status === 'failed' || check?.status === 'warning')
        .map((check) =>
          mapIssue(
            {
              severity: check.status === 'failed' ? 'error' : 'warning',
              label: check.label || check.featureId || 'Export',
              message: check.message,
            },
            check.status === 'failed' ? 'error' : 'warning',
          ),
        )
    : [];
  const repairSummary = result.repairSummary || summarizeRepairEvidence(result.repairs || []);
  const reviewRequiredCount =
    count(readiness.blockerCount) +
    count(readiness.warningCount) +
    count(classroomReadiness.blockerCount) +
    count(classroomReadiness.warningCount) +
    count(validation.errorCount) +
    count(validation.warningCount) +
    count(exportVerification.failed) +
    count(exportVerification.warningCount);
  const topIssues = [
    ...blockers,
    ...classroomBlockers,
    ...exportIssues,
    ...classroomWarnings,
    ...warnings,
    ...findings,
  ].slice(0, 4);
  const reviewActions =
    Array.isArray(result.reviewActions) && result.reviewActions.length > 0
      ? result.reviewActions.filter((item) => item?.label && item?.action).slice(0, 5)
      : buildReviewActionsFromIssues(topIssues);

  return {
    confidence,
    tone: CONFIDENCE_TONES[confidence] || 'assumptions',
    ready: confidence === 'Excellent' && !result.error && count(exportVerification.failed) === 0,
    error: result.error || null,
    nextAction: result.nextAction || (result.error ? 'Resolve the blocker, then finalize again.' : ''),
    repairsApplied: count(result.repairsApplied),
    repairsFailed: count(result.repairsFailed),
    blockerCount: count(readiness.blockerCount),
    warningCount: count(readiness.warningCount),
    classroomStatus: classroomReadiness.status || null,
    classroomBlockerCount: count(classroomReadiness.blockerCount),
    classroomWarningCount: count(classroomReadiness.warningCount),
    classroomCheckedFeatureCount: count(classroomReadiness.checkedFeatureCount),
    classroomCheckedFeatures: classroomReadiness.checkedFeatures || null,
    validationErrorCount: count(validation.errorCount),
    validationWarningCount: count(validation.warningCount),
    exportStatus: exportVerification.status || null,
    exportChecked: count(exportVerification.checked),
    exportFailed: count(exportVerification.failed),
    exportWarningCount: count(exportVerification.warningCount),
    warningDomains: result.warningDomains || null,
    blockerDomains: result.blockerDomains || null,
    sourceEvidence: result.sourceEvidence || result.quality?.sourceEvidence || null,
    quality: result.quality || null,
    apiSpendSummary: result.apiSpendSummary || null,
    apiFeatureSpendSummary: Array.isArray(result.apiFeatureSpendSummary) ? result.apiFeatureSpendSummary : [],
    compilerSummary: result.compilerSummary || null,
    trustBoundary:
      result.trustBoundary ||
      buildPackageTrustBoundarySummary({
        lessonCount: readiness.lessonCount || result.lessonCount,
        compilerSummary: result.compilerSummary,
        repairsApplied: count(result.repairsApplied),
        modelCallCount: Number.isFinite(result.providerCallCount) ? result.providerCallCount : null,
        apiSpendSummary: result.apiSpendSummary,
        reviewRequiredCount,
        externalProofStatus: result.externalProofStatus || 'not attached',
      }),
    compactTrustReceipt:
      result.compactTrustReceipt ||
      buildCompactPackageTrustReceipt({
        lessonCount: readiness.lessonCount || result.lessonCount,
        compilerSummary: result.compilerSummary,
        selectedFeatureCount: result.selectedFeatureCount,
        modelGeneratedDeliverableCount: result.modelGeneratedDeliverableCount,
        deterministicRepairCount: result.repairsApplied,
        reviewRequiredCount,
        sourceGroundedLessonCount: result.sourceGroundedLessonCount,
        inferredAssumptionCount: result.inferredAssumptionCount,
        exportVerification,
        studentFacingCleanlinessStatus: result.studentFacingCleanlinessStatus,
        localConfirmationChecklist: result.localConfirmationChecklist,
        liveProviderCallCount: result.liveProviderCallCount,
        budgetStatus: result.budgetStatus,
      }),
    repairSummary,
    reviewRecommendation:
      result.reviewRecommendation ||
      buildHumanReviewRecommendation({
        blockerCount:
          count(readiness.blockerCount) +
          count(classroomReadiness.blockerCount) +
          count(validation.errorCount) +
          count(exportVerification.failed),
        warningCount:
          count(readiness.warningCount) +
          count(classroomReadiness.warningCount) +
          count(validation.warningCount) +
          count(exportVerification.warningCount),
        repaired: repairSummary !== 'none',
      }),
    checkedItems: ['Readiness', 'classroom fit', 'content validation', 'export files'],
    checkedSections: readiness.checkedSections || null,
    lessonCount: readiness.lessonCount || null,
    reviewActions,
    topIssues,
  };
}

export function classifyFinalizePackageStepStatus(result = {}) {
  const summary = normalizePackageSummary(result);
  if (summary.error || summary.confidence === 'Needs attention') return 'error';
  if (summary.exportFailed > 0) return 'error';
  if (summary.confidence === 'Good with assumptions' || summary.repairsFailed > 0) return 'partial';
  if (summary.exportWarningCount > 0) return 'partial';
  return 'done';
}

export function formatPackageSummaryForHistory(summary = {}) {
  const issueText =
    summary.blockerCount || summary.warningCount
      ? `${summary.blockerCount || 0} issue(s) to fix, ${summary.warningCount || 0} review item(s)`
      : 'no issues to fix';
  const validationText =
    summary.validationErrorCount || summary.validationWarningCount
      ? `${summary.validationErrorCount || 0} validation issue(s), ${summary.validationWarningCount || 0} validation review item(s)`
      : 'no validation errors';
  const classroomText =
    summary.classroomBlockerCount || summary.classroomWarningCount
      ? `${summary.classroomBlockerCount || 0} classroom issue(s), ${summary.classroomWarningCount || 0} classroom review item(s)`
      : 'classroom checks passed';
  const exportText =
    summary.exportChecked > 0
      ? `${summary.exportChecked || 0} export check(s), ${summary.exportFailed || 0} failed`
      : 'exports not checked';
  return `[Package check: ${summary.confidence || 'Unknown'}; ${summary.repairsApplied || 0} safe repair(s); ${issueText}; ${classroomText}; ${validationText}; ${exportText}.]`;
}
