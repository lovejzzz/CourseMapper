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

export function buildPackageReadinessReceipt({ readiness = null, quality = null, exportVerification = null } = {}) {
  const structural = buildPackageReadinessBinding(structuralReadinessForReceipt(readiness));
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
  return {
    protocol: 'coursemapper-package-readiness-receipt-v2',
    purpose: 'post-grade-package-handoff',
    claimBoundary:
      'Download safety proves structural preparation and export verification only. It does not claim factual accuracy, source validation, classroom readiness, or pedagogical quality.',
    readiness: buildPackageReadinessBinding(readiness),
    contentReadiness: {
      status: graded ? (p0 > 0 ? 'blocked' : p1 + p2 > 0 ? 'review' : 'clear') : 'not-graded',
      score: graded && Number.isFinite(Number(quality?.score)) ? Number(quality.score) : null,
      grade: graded ? String(quality?.grade || '') || null : null,
      blockerCount: p0,
      reviewFindingCount: p1 + p2,
      evidenceClass: graded ? quality?.evidenceClass || 'deterministic' : null,
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
