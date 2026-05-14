const CONFIDENCE_TONES = {
  Excellent: 'excellent',
  'Good with assumptions': 'assumptions',
  'Needs attention': 'blocked',
};

function count(value) {
  return Number.isFinite(value) ? value : 0;
}

function mapIssue(issue, fallbackSeverity = 'warning') {
  return {
    severity: issue?.severity || fallbackSeverity,
    label: issue?.label || issue?.category || issue?.featureId || 'Package',
    message: issue?.message || 'Review this item before export.',
  };
}

export function normalizePackageSummary(result = {}) {
  const confidence = result.confidence || (result.error ? 'Needs attention' : 'Good with assumptions');
  const readiness = result.readiness || {};
  const validation = result.validation || {};
  const exportVerification = result.exportVerification || {};
  const blockers = Array.isArray(readiness.blockers) ? readiness.blockers.map((issue) => mapIssue(issue, 'error')) : [];
  const warnings = Array.isArray(readiness.warnings)
    ? readiness.warnings.map((issue) => mapIssue(issue, 'warning'))
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
    validationErrorCount: count(validation.errorCount),
    validationWarningCount: count(validation.warningCount),
    exportStatus: exportVerification.status || null,
    exportChecked: count(exportVerification.checked),
    exportFailed: count(exportVerification.failed),
    exportWarningCount: count(exportVerification.warningCount),
    checkedSections: readiness.checkedSections || null,
    lessonCount: readiness.lessonCount || null,
    topIssues: [...blockers, ...exportIssues, ...warnings, ...findings].slice(0, 4),
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
      ? `${summary.blockerCount || 0} blocker(s), ${summary.warningCount || 0} warning(s)`
      : 'no readiness blockers';
  const validationText =
    summary.validationErrorCount || summary.validationWarningCount
      ? `${summary.validationErrorCount || 0} validation error(s), ${summary.validationWarningCount || 0} validation warning(s)`
      : 'no validation errors';
  const exportText =
    summary.exportChecked > 0
      ? `${summary.exportChecked || 0} export check(s), ${summary.exportFailed || 0} failed`
      : 'exports not checked';

  return `[Package readiness: ${summary.confidence || 'Unknown'}; ${summary.repairsApplied || 0} safe repair(s); ${issueText}; ${validationText}; ${exportText}.]`;
}
