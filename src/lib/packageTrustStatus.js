import { finishStatusOf } from './pipelineMachine';

function compactCount(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function plural(count, singular, pluralValue = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralValue}`;
}

export function countQualityFindings(quality) {
  if (Number.isFinite(quality?.findingCount)) return compactCount(quality.findingCount);
  const counts = quality?.findingCounts || {};
  return compactCount(counts.p0) + compactCount(counts.p1) + compactCount(counts.p2);
}

export function buildQualityReviewIssue(quality) {
  if (quality?.status !== 'graded') return null;
  const counts = quality.findingCounts || {};
  const p0 = compactCount(counts.p0);
  const findingCount = countQualityFindings(quality);
  const score = Number(quality.score);
  const textureScore = Number(quality.texture?.score);
  const scoreNeedsReview = Number.isFinite(score) && score < 100;
  const textureNeedsReview = Number.isFinite(textureScore) && textureScore < 100;
  if (findingCount === 0 && !scoreNeedsReview && !textureNeedsReview) return null;

  return {
    label: 'Package notes',
    message:
      p0 > 0
        ? 'One content issue needs a fix before this package is ready to share.'
        : 'Some generated content should get a quick instructor review before publishing.',
    count: Math.max(1, findingCount || Number(scoreNeedsReview) + Number(textureNeedsReview)),
    severity: p0 > 0 ? 'blocker' : 'warning',
  };
}

export function buildExportWarningIssues(packageReceipt, featureLabels = {}) {
  if (packageReceipt?.exportWarning) {
    return [
      {
        label: 'Export check',
        message: 'One exported file needs a quick visual scan before publishing.',
        detail: packageReceipt.exportWarning,
        severity: 'warning',
      },
    ];
  }
  const warnings = Array.isArray(packageReceipt?.exportWarnings) ? packageReceipt.exportWarnings : [];
  if (warnings.length > 0) {
    return warnings.slice(0, 3).map((warning) => ({
      label: warning.label || featureLabels[warning.featureId] || 'Export check',
      message: 'One exported file needs a quick visual scan before publishing.',
      detail: warning.message || '',
      severity: 'warning',
    }));
  }
  const warningCount = compactCount(packageReceipt?.exportWarningCount);
  if (warningCount <= 0) return [];
  return [
    {
      label: 'Export check',
      message: `${plural(warningCount, 'export note')} saved for review before publishing.`,
      severity: 'warning',
    },
  ];
}

export function buildExportFailureIssue(packageReceipt, featureLabels = {}) {
  const failedCount = compactCount(packageReceipt?.exportFailed);
  const exportStatus = String(packageReceipt?.exportStatus || '').toLowerCase();
  if (failedCount <= 0 && exportStatus !== 'failed') return null;
  const failures = Array.isArray(packageReceipt?.exportFailures) ? packageReceipt.exportFailures : [];
  const firstFailure = failures.find((failure) => failure?.message || failure?.featureId) || null;
  return {
    label: firstFailure?.label || featureLabels[firstFailure?.featureId] || 'Export check',
    message: `${plural(Math.max(1, failedCount), 'export issue')} must be fixed before the ZIP is available.`,
    detail: firstFailure?.message || packageReceipt?.exportFailure || '',
    count: Math.max(1, failedCount),
    severity: 'blocker',
  };
}

function buildSourceLedgerIssues(packageReceipt) {
  const issues = [];
  const fields = [
    ['sourceLedgerWarningCount', 'Source ledger'],
    ['sourceWarningCount', 'Source ledger'],
    ['genomeWarningCount', 'Genome bridge'],
    ['sourceGenomeCaveatCount', 'Source/genome bridge'],
    ['digestCaveatCount', 'Digest caveat'],
  ];
  fields.forEach(([key, label]) => {
    const count = compactCount(packageReceipt?.[key]);
    if (count > 0) {
      issues.push({
        label,
        message: `${plural(count, 'source note')} saved for instructor confirmation.`,
        severity: 'warning',
      });
    }
  });
  const caveats = Array.isArray(packageReceipt?.digestCaveats) ? packageReceipt.digestCaveats : [];
  caveats.slice(0, 3).forEach((caveat) => {
    const label = caveat?.label || caveat?.type || 'Digest caveat';
    const message = caveat?.message || caveat?.detail || '';
    issues.push({
      label,
      message: 'A package note was saved for instructor confirmation.',
      detail: message,
      severity: 'warning',
    });
  });
  return issues;
}

export function summarizePackageReviewMeta({ qualityIssue = null, exportIssues = [], sourceIssues = [] } = {}) {
  const parts = [];
  if (qualityIssue) parts.push(plural(qualityIssue.count, 'content note'));
  if (exportIssues.length > 0) parts.push(plural(exportIssues.length, 'export note'));
  if (sourceIssues.length > 0) parts.push(plural(sourceIssues.length, 'source note'));
  return parts.join(' · ');
}

function buildQualityProofIssue(packageQuality, finishStatus) {
  if (finishStatus !== 'ready') return null;
  if (packageQuality?.status === 'graded') return null;
  return {
    label: 'Package check',
    message: 'A final quality check is still pending; review the package before publishing.',
    count: 1,
    severity: 'warning',
  };
}

export function getPackageTrustStatus({
  packageQualityPass = null,
  quality = null,
  receipt = null,
  readiness = null,
  featureLabels = {},
} = {}) {
  const finishStatus = finishStatusOf(packageQualityPass);
  const packageReceipt = receipt || packageQualityPass?.receipt || null;
  const packageQuality = quality || packageQualityPass?.quality || null;
  const qualityIssue = buildQualityReviewIssue(packageQuality);
  const qualityProofIssue = qualityIssue ? null : buildQualityProofIssue(packageQuality, finishStatus);
  const exportFailureIssue = buildExportFailureIssue(packageReceipt, featureLabels);
  const exportIssues = buildExportWarningIssues(packageReceipt, featureLabels);
  const sourceIssues = buildSourceLedgerIssues(packageReceipt);
  const readinessBlockers = Array.isArray(readiness?.blockers) ? readiness.blockers : [];
  const readinessWarnings = Array.isArray(readiness?.warnings) ? readiness.warnings : [];
  const packageBlockerCount = compactCount(packageQualityPass?.blockers);
  const packageWarningCount = compactCount(packageQualityPass?.warnings);
  const exportFailedCount = exportFailureIssue ? exportFailureIssue.count : compactCount(packageReceipt?.exportFailed);
  const qualityBlockerCount =
    qualityIssue?.severity === 'blocker' ? Math.max(1, compactCount(packageQuality?.findingCounts?.p0)) : 0;
  const qualityWarningCount =
    qualityIssue && qualityIssue.severity !== 'blocker' ? Math.max(1, qualityIssue.count) : qualityProofIssue ? 1 : 0;
  // `packageQualityPass.blockers`, readiness blockers, and quality P0s are
  // three views of the same unresolved content gates after the finalizer.
  // Summing them made one P0 read as five blockers in the workspace crown.
  // Count the largest content view once, then add truly separate export
  // failures.
  const blockerCount =
    Math.max(packageBlockerCount, readinessBlockers.length, qualityBlockerCount) + exportFailedCount;
  const warningCount =
    packageWarningCount + readinessWarnings.length + qualityWarningCount + exportIssues.length + sourceIssues.length;
  const hasNotGradedQuality = Boolean(qualityProofIssue || (packageQuality && packageQuality.status !== 'graded'));
  const isRunning = finishStatus === 'running';
  const isGenerationRunning = isRunning && packageQualityPass?.phase === 'generation';
  const canDownload = finishStatus === 'ready' && blockerCount === 0;

  let state = finishStatus || 'idle';
  if (isGenerationRunning) state = 'building';
  else if (isRunning) state = 'running';
  else if (blockerCount > 0 || finishStatus === 'blocked') state = 'blocked';
  else if (hasNotGradedQuality && finishStatus === 'ready') state = 'not-graded';
  else if (warningCount > 0) state = 'review';
  else if (finishStatus === 'ready') state = 'clean';
  else if (!finishStatus || finishStatus === 'idle') state = 'idle';

  const clean = state === 'clean';
  const review = state === 'review' || state === 'not-graded';
  const blocked = state === 'blocked';

  return {
    state,
    finishStatus,
    clean,
    review,
    blocked,
    canDownload,
    qualityIssue,
    qualityProofIssue,
    exportFailureIssue,
    exportIssues,
    sourceIssues,
    reviewIssues: [qualityIssue || qualityProofIssue, exportFailureIssue, ...exportIssues, ...sourceIssues].filter(
      Boolean,
    ),
    blockerCount,
    warningCount,
    reviewMeta: summarizePackageReviewMeta({
      qualityIssue: qualityIssue || qualityProofIssue,
      exportIssues,
      sourceIssues,
    }),
    toneKey: clean ? 'excellent' : blocked ? 'blocked' : review ? 'assumptions' : 'neutral',
  };
}
