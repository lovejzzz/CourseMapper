import { finishStatusOf } from './pipelineMachine';

function compactCount(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function plural(count, singular, pluralValue = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralValue}`;
}

function severityCount(count, label) {
  return `${count} ${label}`;
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
  const p1 = compactCount(counts.p1);
  const p2 = compactCount(counts.p2);
  const findingCount = countQualityFindings(quality);
  const score = Number(quality.score);
  const textureScore = Number(quality.texture?.score);
  const scoreNeedsReview = Number.isFinite(score) && score < 100;
  const textureNeedsReview = Number.isFinite(textureScore) && textureScore < 100;
  if (findingCount === 0 && !scoreNeedsReview && !textureNeedsReview) return null;

  const parts = [];
  if (p0 > 0) parts.push(severityCount(p0, 'P0'));
  if (p1 > 0) parts.push(severityCount(p1, 'P1'));
  if (p2 > 0) parts.push(severityCount(p2, 'P2'));
  if (scoreNeedsReview) parts.push(`quality ${score}/100`);
  if (textureNeedsReview) parts.push(`texture ${textureScore}/100`);

  return {
    label: 'Quality',
    message: `${parts.join(' · ')} remain; open the quality report before publishing.`,
    count: Math.max(1, findingCount || Number(scoreNeedsReview) + Number(textureNeedsReview)),
    severity: p0 > 0 ? 'blocker' : 'warning',
  };
}

export function buildExportWarningIssues(packageReceipt, featureLabels = {}) {
  if (packageReceipt?.exportWarning) {
    return [
      {
        label: 'Export warning',
        message: packageReceipt.exportWarning,
        severity: 'warning',
      },
    ];
  }
  const warnings = Array.isArray(packageReceipt?.exportWarnings) ? packageReceipt.exportWarnings : [];
  if (warnings.length > 0) {
    return warnings.slice(0, 3).map((warning) => ({
      label: warning.label || featureLabels[warning.featureId] || 'Export warning',
      message: warning.message || 'Export verification found a warning.',
      severity: 'warning',
    }));
  }
  const warningCount = compactCount(packageReceipt?.exportWarningCount);
  if (warningCount <= 0) return [];
  return [
    {
      label: 'Export warning',
      message: `${plural(warningCount, 'warning')} found; review the package report before publishing.`,
      severity: 'warning',
    },
  ];
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
        message: `${plural(count, 'caveat')} found; review the package report before publishing.`,
        severity: 'warning',
      });
    }
  });
  const caveats = Array.isArray(packageReceipt?.digestCaveats) ? packageReceipt.digestCaveats : [];
  caveats.slice(0, 3).forEach((caveat) => {
    const label = caveat?.label || caveat?.type || 'Digest caveat';
    const message = caveat?.message || caveat?.detail || 'The run digest reported a caveat.';
    issues.push({ label, message, severity: 'warning' });
  });
  return issues;
}

export function summarizePackageReviewMeta({ qualityIssue = null, exportIssues = [], sourceIssues = [] } = {}) {
  const parts = [];
  if (qualityIssue) parts.push(plural(qualityIssue.count, 'quality issue'));
  if (exportIssues.length > 0) parts.push(plural(exportIssues.length, 'export warning'));
  if (sourceIssues.length > 0) parts.push(plural(sourceIssues.length, 'source caveat'));
  return parts.join(' · ');
}

function buildQualityProofIssue(packageQuality, finishStatus) {
  if (finishStatus !== 'ready') return null;
  if (packageQuality?.status === 'graded') return null;
  return {
    label: 'Quality evidence',
    message: 'No completed quality grade is attached; review the package before publishing.',
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
  const exportIssues = buildExportWarningIssues(packageReceipt, featureLabels);
  const sourceIssues = buildSourceLedgerIssues(packageReceipt);
  const readinessBlockers = Array.isArray(readiness?.blockers) ? readiness.blockers : [];
  const readinessWarnings = Array.isArray(readiness?.warnings) ? readiness.warnings : [];
  const packageBlockerCount = compactCount(packageQualityPass?.blockers);
  const packageWarningCount = compactCount(packageQualityPass?.warnings);
  const exportFailedCount = compactCount(packageReceipt?.exportFailed);
  const qualityBlockerCount = qualityIssue?.severity === 'blocker' ? Math.max(1, qualityIssue.count) : 0;
  const qualityWarningCount =
    qualityIssue && qualityIssue.severity !== 'blocker' ? Math.max(1, qualityIssue.count) : qualityProofIssue ? 1 : 0;
  const blockerCount = packageBlockerCount + readinessBlockers.length + exportFailedCount + qualityBlockerCount;
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
    exportIssues,
    sourceIssues,
    reviewIssues: [qualityIssue || qualityProofIssue, ...exportIssues, ...sourceIssues].filter(Boolean),
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
