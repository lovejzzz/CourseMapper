export function buildPackageReadinessBinding(readiness = null) {
  const canonicalValue = (value) => {
    if (Array.isArray(value)) return value.map(canonicalValue);
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.keys(value)
          .sort()
          .filter((key) => value[key] !== undefined && typeof value[key] !== 'function')
          .map((key) => [key, canonicalValue(value[key])]),
      );
    }
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    return value == null || ['string', 'boolean'].includes(typeof value) ? value : String(value);
  };
  const compactIssue = (issue) => (typeof issue === 'string' ? issue.trim() : canonicalValue(issue));
  const issueRows =
    Array.isArray(readiness?.issues) && readiness.issues.length > 0
      ? readiness.issues
      : [
          ...(Array.isArray(readiness?.blockers) ? readiness.blockers : []),
          ...(Array.isArray(readiness?.warnings) ? readiness.warnings : []),
        ];
  const issuesByIdentity = new Map(
    issueRows
      .map(compactIssue)
      .filter(Boolean)
      .map((issue) => [JSON.stringify(issue), issue]),
  );
  const issues = [...issuesByIdentity.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, issue]) => issue);
  return {
    protocol: 'coursemapper-package-readiness-binding-v1',
    status: String(readiness?.status || 'unknown'),
    blockerCount: Array.isArray(readiness?.blockers)
      ? readiness.blockers.length
      : Math.max(0, Number(readiness?.blockers) || 0),
    warningCount: Array.isArray(readiness?.warnings)
      ? readiness.warnings.length
      : Math.max(0, Number(readiness?.warnings) || 0),
    issues,
  };
}

function structuralReadinessForReceipt(readiness = null) {
  const withoutQualityGate = (issues) =>
    Array.isArray(issues)
      ? issues.filter((issue) => issue?.source !== 'qualityGate')
      : Math.max(0, Number(issues) || 0);
  const blockers = withoutQualityGate(readiness?.blockers);
  const warnings = withoutQualityGate(readiness?.warnings);
  const blockerCount = Array.isArray(blockers) ? blockers.length : blockers;
  const warningCount = Array.isArray(warnings) ? warnings.length : warnings;
  return {
    ...(readiness || {}),
    blockers,
    warnings,
    issues: [...(Array.isArray(blockers) ? blockers : []), ...(Array.isArray(warnings) ? warnings : [])],
    status: blockerCount > 0 ? 'blocked' : warningCount > 0 ? 'warnings' : 'ready',
  };
}

function authenticLanguageCoverageIssue(coverage = null) {
  const requiredLessonCount = Math.max(0, Number(coverage?.requiredLessonCount) || 0);
  const admittedLessonCount = Math.max(0, Number(coverage?.admittedLessonCount) || 0);
  const ratio = Number(coverage?.coverage);
  if (
    coverage?.protocol !== 'coursemapper-authentic-language-data-coverage-v1' ||
    requiredLessonCount === 0 ||
    (Number.isFinite(ratio) && ratio >= 1 && admittedLessonCount >= requiredLessonCount)
  ) {
    return null;
  }
  const missingLessons = (Array.isArray(coverage?.lessons) ? coverage.lessons : [])
    .filter((lesson) => lesson?.admitted !== true)
    .map((lesson) => Number(lesson?.lessonNumber))
    .filter((lessonNumber) => Number.isInteger(lessonNumber) && lessonNumber > 0);
  return {
    severity: 'warning',
    featureId: 'courseMap',
    label: 'Authentic language evidence',
    message:
      `Source-bound authentic-language evidence covers ${admittedLessonCount}/${requiredLessonCount} required lessons` +
      `${missingLessons.length > 0 ? `; missing Lessons ${missingLessons.join(', ')}` : ''}. Complete the missing evidence families before checkpoint promotion.`,
    source: 'authenticLanguageDataCoverage',
    retryable: false,
    autoFixable: false,
    promotionSeverity: 'P1',
  };
}

function operationQualifiedEvidenceIssue(evidence = null) {
  if (!evidence) return null;
  const demandedLessonCount = Math.max(0, Number(evidence?.summary?.demandedLessonCount) || 0);
  const completeLessonCount = Math.max(0, Number(evidence?.summary?.completeLessonCount) || 0);
  const missingLessonNumbers = (Array.isArray(evidence?.missingLessonNumbers) ? evidence.missingLessonNumbers : [])
    .map(Number)
    .filter((lessonNumber) => Number.isInteger(lessonNumber) && lessonNumber > 0);
  const passed =
    evidence?.protocol === 'coursemapper-operation-qualified-evidence-receipt-v1' &&
    evidence?.summary?.status === 'passed' &&
    completeLessonCount === demandedLessonCount &&
    missingLessonNumbers.length === 0;
  if (passed) return null;
  return {
    severity: 'warning',
    featureId: 'courseMap',
    label: 'Quantitative operation evidence',
    message:
      `Operation-qualified evidence covers ${completeLessonCount}/${demandedLessonCount} demanded lessons` +
      `${missingLessonNumbers.length > 0 ? `; missing Lessons ${missingLessonNumbers.join(', ')}` : ''}. Complete the exact demanded calculations across every required artifact family before checkpoint promotion.`,
    source: 'operationQualifiedEvidence',
    retryable: false,
    autoFixable: false,
    promotionSeverity: 'P1',
  };
}

function readinessWithPromotionEvidence(readiness = null, issues = []) {
  const normalizedIssues = issues.filter(Boolean);
  if (normalizedIssues.length === 0) return readiness;
  const blockers = Array.isArray(readiness?.blockers) ? readiness.blockers : [];
  const warnings = [...(Array.isArray(readiness?.warnings) ? readiness.warnings : []), ...normalizedIssues];
  return {
    ...(readiness || {}),
    blockers,
    warnings,
    issues: [...blockers, ...warnings],
    status: blockers.length > 0 ? 'blocked' : 'warnings',
  };
}

export function buildPackageReadinessReceipt({
  readiness = null,
  quality = null,
  exportVerification = null,
  authenticLanguageDataCoverage = null,
  operationQualifiedEvidence = null,
} = {}) {
  const promotionIssues = [
    authenticLanguageCoverageIssue(authenticLanguageDataCoverage),
    operationQualifiedEvidenceIssue(operationQualifiedEvidence),
  ].filter(Boolean);
  const effectiveReadiness = readinessWithPromotionEvidence(readiness, promotionIssues);
  const structural = buildPackageReadinessBinding(structuralReadinessForReceipt(effectiveReadiness));
  const graded = quality?.status === 'graded';
  const p0 = Math.max(0, Number(quality?.findingCounts?.p0) || 0);
  const p1 = Math.max(0, Number(quality?.findingCounts?.p1) || 0);
  const p2 = Math.max(0, Number(quality?.findingCounts?.p2) || 0);
  const checked = Math.max(0, Number(exportVerification?.checked) || 0);
  const failed = Math.max(0, Number(exportVerification?.failed) || 0);
  const warningCount = Math.max(0, Number(exportVerification?.warningCount ?? exportVerification?.warnings) || 0);
  const exportStatus = String(exportVerification?.status || '').toLowerCase();
  const exportVerified = checked > 0 && ['passed', 'warnings'].includes(exportStatus) && failed === 0;
  const downloadBlockerCount = structural.blockerCount + failed;
  const conformanceScore = graded && Number.isFinite(Number(quality?.score)) ? Number(quality.score) : null;
  const evidenceScore =
    graded && Number.isFinite(Number(quality?.readiness?.score)) ? Number(quality.readiness.score) : null;
  const evidenceMaxScore =
    graded && Number.isFinite(Number(quality?.readiness?.maxScore)) ? Number(quality.readiness.maxScore) : null;
  const evidencePoints = quality?.readiness?.points || null;
  const unobservedEvidencePoints = Number.isFinite(Number(evidencePoints?.unobserved))
    ? Math.max(0, Number(evidencePoints.unobserved))
    : null;
  const evidenceStatus = !graded
    ? 'not-graded'
    : evidenceScore == null || evidenceMaxScore == null || unobservedEvidencePoints == null
      ? 'unobserved'
      : p0 > 0 || p1 > 0 || evidenceScore < 80 || evidenceMaxScore !== 100 || unobservedEvidencePoints > 0
        ? 'review'
        : 'clear';
  const conformanceStatus = graded ? (p0 > 0 ? 'blocked' : p1 + p2 > 0 ? 'review' : 'clear') : 'not-graded';
  return {
    protocol: 'coursemapper-package-readiness-receipt-v2',
    purpose: 'post-grade-package-handoff',
    claimBoundary:
      'Download safety proves structural preparation and export verification only. It does not claim factual accuracy, source validation, classroom readiness, or pedagogical quality.',
    readiness: buildPackageReadinessBinding(effectiveReadiness),
    encodedConformance: {
      status: conformanceStatus,
      score: conformanceScore,
      maxScore: graded ? 100 : null,
      blockerCount: p0,
      reviewFindingCount: p1 + p2,
      evidenceClass: graded ? quality?.evidenceClass || 'deterministic' : null,
      claimBoundary:
        'This score measures encoded package-defect conformance. It is not a teaching-quality grade or publication decision.',
    },
    deterministicEvidenceReadiness: {
      status: evidenceStatus,
      score: evidenceScore,
      maxScore: evidenceMaxScore,
      points: evidencePoints,
      unobservedPoints: unobservedEvidencePoints,
      evidenceClass: graded ? quality?.readiness?.evidenceClass || 'deterministic' : null,
      claimBoundary:
        quality?.readiness?.claimBoundary ||
        'This ledger records deterministic evidence actually observed in the package; unobserved points never earn credit.',
    },
    contentReadiness: {
      status: graded
        ? p0 > 0
          ? 'blocked'
          : p1 + p2 + promotionIssues.length > 0 || evidenceStatus !== 'clear'
            ? 'review'
            : 'clear'
        : 'not-graded',
      score: conformanceScore,
      grade: graded ? String(quality?.grade || '') || null : null,
      blockerCount: p0,
      reviewFindingCount: p1 + p2 + promotionIssues.length,
      evidenceClass: graded ? quality?.evidenceClass || 'deterministic' : null,
      deprecated: true,
      replacementFields: ['encodedConformance', 'deterministicEvidenceReadiness'],
    },
    exportVerification: {
      status: exportStatus || 'unverified',
      checked,
      failed,
      warningCount,
      ...(Array.isArray(exportVerification?.formatsVerified)
        ? { formatsVerified: exportVerification.formatsVerified.filter(Boolean) }
        : {}),
    },
    downloadSafety: {
      status: downloadBlockerCount > 0 ? 'blocked' : exportVerified ? 'verified' : 'unverified',
      blockerCount: downloadBlockerCount,
      structuralBlockerCount: structural.blockerCount,
      exportFailureCount: failed,
    },
    ...(promotionIssues.length > 0
      ? {
          promotionReadiness: {
            status: 'blocked',
            p1Count: promotionIssues.length,
            issues: promotionIssues,
          },
        }
      : {}),
  };
}

export function hasVerifiedPackageDownloadReceipt(receipt) {
  if (receipt?.protocol !== 'coursemapper-package-readiness-receipt-v2') return false;
  const verification = receipt.exportVerification || {};
  const checked = Math.max(0, Number(verification.checked) || 0);
  const failed = Math.max(0, Number(verification.failed) || 0);
  const status = String(verification.status || '').toLowerCase();
  return (
    receipt.downloadSafety?.status === 'verified' &&
    Math.max(0, Number(receipt.downloadSafety?.blockerCount) || 0) === 0 &&
    checked > 0 &&
    ['passed', 'warnings'].includes(status) &&
    failed === 0
  );
}
