import { finishStatusOf } from './pipelineMachine';
import {
  countAdvisoryQualityFindings,
  countBlockingQualityFindings,
  isBlockingQualityFinding,
} from './qualityFindingPolicy';

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
  return buildQualityReviewIssues(quality)[0] || null;
}

function findingLabel(finding = {}) {
  const dimension = String(finding?.dimension || '')
    .replace(/[-_]+/g, ' ')
    .trim();
  if (!dimension) return 'Package note';
  return `${dimension.charAt(0).toUpperCase()}${dimension.slice(1)}`;
}

function findingMessage(finding = {}) {
  return String(finding?.detail || finding?.message || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function qualityFindingRank(quality, finding) {
  if (isBlockingQualityFinding(quality, finding)) return 0;
  if (finding?.severity === 'P0') return 1;
  if (finding?.severity === 'P1') return 2;
  if (finding?.severity === 'P2') return 3;
  return 4;
}

/**
 * Preserve the grader's actionable findings in the Agent instead of replacing
 * them with a generic "review generated content" sentence. The compact quality
 * badge still reports one aggregate count; this list owns the exact human task.
 */
export function buildQualityReviewIssues(quality) {
  if (quality?.status !== 'graded') return [];
  const counts = quality.findingCounts || {};
  const p0 = compactCount(counts.p0);
  const findingCount = countQualityFindings(quality);
  const score = Number(quality.score);
  const grade = String(quality.grade || '')
    .trim()
    .toUpperCase();
  const lowGradeNeedsReview = (grade && !['A', 'B'].includes(grade)) || (Number.isFinite(score) && score < 85);
  // A score or texture meter below a mathematically perfect 100 is not, by
  // itself, an actionable package issue. The old rule turned a zero-finding
  // 99/A package into an amber "review" state even after every export check
  // passed. Preserve the score as transparent evidence, but reserve warning
  // language for an actual finding or a genuinely low grade.
  if (findingCount === 0 && !lowGradeNeedsReview) return [];

  const findings = (Array.isArray(quality?.findings) ? quality.findings : [])
    .filter((finding) => findingMessage(finding))
    .map((finding, index) => ({ finding, index }))
    .sort(
      (left, right) =>
        qualityFindingRank(quality, left.finding) - qualityFindingRank(quality, right.finding) ||
        left.index - right.index,
    )
    .map(({ finding }) => finding)
    .slice(0, 5);
  if (findings.length > 0) {
    return findings.map((finding, index) => ({
      label: findingLabel(finding),
      message: findingMessage(finding),
      detail: [finding?.file, finding?.evidence].filter(Boolean).join(' · '),
      count: index === 0 ? Math.max(1, findingCount) : 1,
      severity: isBlockingQualityFinding(quality, finding) ? 'blocker' : 'warning',
    }));
  }

  return [
    {
      label: 'Package notes',
      message:
        p0 > 0
          ? 'One content issue needs a fix before this package is ready to share.'
          : 'The package score is below the publishing threshold; open the quality report for the exact checks.',
      count: Math.max(1, findingCount || Number(lowGradeNeedsReview)),
      severity: p0 > 0 ? 'blocker' : 'warning',
    },
  ];
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

function sourceFindingIssues(sourceEvidence) {
  const findings = Array.isArray(sourceEvidence?.findings) ? sourceEvidence.findings : [];
  return findings
    .filter((finding) => findingMessage(finding))
    .slice(0, 5)
    .map((finding) => ({
      label: findingLabel(finding),
      message: findingMessage(finding),
      detail: [finding?.file, finding?.evidence].filter(Boolean).join(' · '),
      severity: finding?.severity === 'P0' ? 'blocker' : 'warning',
      domain: 'source',
    }));
}

function buildSourceLedgerIssues(packageReceipt, sourceEvidence = null) {
  const evidenceIssues = sourceFindingIssues(sourceEvidence);
  if (evidenceIssues.length > 0) return evidenceIssues;

  const issues = [];
  const reviewRequiredCount = compactCount(sourceEvidence?.reviewRequiredCount);
  if (reviewRequiredCount > 0) {
    issues.push({
      label: 'Source review',
      message: `${plural(reviewRequiredCount, 'source row')} saved for instructor confirmation.`,
      detail: sourceEvidence?.reportPath || '',
      severity: 'warning',
      domain: 'source',
    });
  }
  const missingRefCount = compactCount(sourceEvidence?.refCoverage?.missing);
  if (missingRefCount > 0) {
    issues.push({
      label: 'Source coverage',
      message: `${plural(missingRefCount, 'content item')} still needs a source reference.`,
      severity: 'warning',
      domain: 'source',
    });
  }
  const danglingRefCount = compactCount(sourceEvidence?.refCoverage?.danglingRefs);
  if (danglingRefCount > 0) {
    issues.push({
      label: 'Source coverage',
      message: `${plural(danglingRefCount, 'source reference')} does not resolve to the source ledger.`,
      severity: 'warning',
      domain: 'source',
    });
  }
  if (issues.length > 0) return issues;

  // Legacy receipts used several experimental names. Keep reading them for
  // saved courses, but new finishes use packageQuality.sourceEvidence.
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

function dedupeReviewIssues(issues) {
  const seen = new Set();
  return issues.filter((issue) => {
    if (!issue) return false;
    const key = [issue.severity, issue.message, issue.detail].join('\u0000');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function canonicalWarningCount(warningDomains) {
  if (compactCount(warningDomains?.schemaVersion) !== 1) return null;
  if (Number.isFinite(Number(warningDomains?.total))) return compactCount(warningDomains.total);
  return ['readiness', 'retry', 'export', 'quality', 'source'].reduce(
    (total, domain) => total + compactCount(warningDomains?.[domain]),
    0,
  );
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
  const sourceEvidence = packageQualityPass?.sourceEvidence || packageQuality?.sourceEvidence || null;
  const qualityIssues = buildQualityReviewIssues(packageQuality);
  const exportFailureIssue = buildExportFailureIssue(packageReceipt, featureLabels);
  const exportIssues = buildExportWarningIssues(packageReceipt, featureLabels);
  const sourceIssues = buildSourceLedgerIssues(packageReceipt, sourceEvidence);
  const sourceIssueMessages = new Set(sourceIssues.map((issue) => issue.message));
  const qualityIssue =
    qualityIssues.find((issue) => !sourceIssueMessages.has(issue.message)) || qualityIssues[0] || null;
  const qualityProofIssue = qualityIssue ? null : buildQualityProofIssue(packageQuality, finishStatus);
  const readinessBlockers = Array.isArray(readiness?.blockers) ? readiness.blockers : [];
  const readinessWarnings = Array.isArray(readiness?.warnings) ? readiness.warnings : [];
  const packageBlockerCount = compactCount(packageQualityPass?.blockers);
  const packageWarningCount = compactCount(packageQualityPass?.warnings);
  const exportFailedCount = exportFailureIssue ? exportFailureIssue.count : compactCount(packageReceipt?.exportFailed);
  const qualityBlockerCount = countBlockingQualityFindings(packageQuality);
  const qualityWarningCount = qualityProofIssue
    ? 1
    : qualityIssues.some((issue) => issue.severity !== 'blocker')
      ? Math.max(1, countAdvisoryQualityFindings(packageQuality))
      : 0;
  const warningDomainCount = canonicalWarningCount(packageQualityPass?.warningDomains);
  // `packageQualityPass.blockers`, readiness blockers, and quality P0s are
  // three views of the same unresolved content gates after the finalizer.
  // Summing them made one P0 read as five blockers in the workspace crown.
  // Count the largest content view once, then add truly separate export
  // failures.
  const blockerCount = Math.max(packageBlockerCount, readinessBlockers.length, qualityBlockerCount) + exportFailedCount;
  const warningCount =
    warningDomainCount === null
      ? packageWarningCount + readinessWarnings.length + qualityWarningCount + exportIssues.length + sourceIssues.length
      : warningDomainCount + Number(Boolean(qualityProofIssue));
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
    reviewIssues: dedupeReviewIssues([
      ...(qualityIssues.length > 0 ? qualityIssues : qualityProofIssue ? [qualityProofIssue] : []),
      exportFailureIssue,
      ...exportIssues,
      ...sourceIssues,
    ]),
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
