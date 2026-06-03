import { buildHumanReviewRecommendation, summarizeRepairEvidence } from './packageTrust';

const CONFIDENCE_TONES = {
  Excellent: 'excellent',
  'Good with assumptions': 'assumptions',
  'Needs attention': 'blocked',
};

function count(value) {
  return Number.isFinite(value) ? value : 0;
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
    topIssues: [
      ...blockers,
      ...classroomBlockers,
      ...exportIssues,
      ...classroomWarnings,
      ...warnings,
      ...findings,
    ].slice(0, 4),
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
