import { finishStatusOf } from './pipelineMachine';
import {
  countAdvisoryQualityFindings,
  countBlockingQualityFindings,
  isBlockingQualityFinding,
} from './qualityFindingPolicy';
import { countSourceAdvisoryFindings, countSourceQualityAdvisoryFindings } from './quality/sourceEvidence';

function compactCount(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function plural(count, singular, pluralValue = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralValue}`;
}

export function countQualityFindings(quality) {
  const counts = quality?.findingCounts || {};
  const summaryCount = compactCount(counts.p0) + compactCount(counts.p1) + compactCount(counts.p2);
  const detailCount = Array.isArray(quality?.findings) ? quality.findings.length : 0;
  return Math.max(
    summaryCount,
    detailCount,
    Number.isFinite(quality?.findingCount) ? compactCount(quality.findingCount) : 0,
  );
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
        count: 1,
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
      count: 1,
      severity: 'warning',
    }));
  }
  const warningCount = compactCount(packageReceipt?.exportWarningCount);
  if (warningCount <= 0) return [];
  return [
    {
      label: 'Export check',
      message: `${plural(warningCount, 'export note')} saved for review before publishing.`,
      count: warningCount,
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
    .map((finding, index) => ({ finding, index }))
    .sort(
      (left, right) =>
        (left.finding?.severity === 'P0' ? 0 : left.finding?.severity === 'P1' ? 1 : 2) -
          (right.finding?.severity === 'P0' ? 0 : right.finding?.severity === 'P1' ? 1 : 2) || left.index - right.index,
    )
    .map(({ finding }) => finding)
    .slice(0, 5)
    .map((finding) => ({
      label: findingLabel(finding),
      message: findingMessage(finding),
      detail: [finding?.file, finding?.evidence].filter(Boolean).join(' · '),
      count: 1,
      severity: finding?.severity === 'P0' ? 'blocker' : 'warning',
      domain: 'source',
    }));
}

function buildSourceLedgerIssues(packageReceipt, sourceEvidence = null) {
  const evidenceIssues = sourceFindingIssues(sourceEvidence);
  const issues = [...evidenceIssues];
  const reviewRequiredCount = compactCount(sourceEvidence?.reviewRequiredCount);
  if (reviewRequiredCount > 0) {
    issues.push({
      label: 'Source review',
      message: `${plural(reviewRequiredCount, 'source row')} saved for instructor confirmation.`,
      detail: sourceEvidence?.reportPath || '',
      count: reviewRequiredCount,
      severity: 'warning',
      domain: 'source',
    });
  }
  const missingRefCount = compactCount(sourceEvidence?.refCoverage?.missing);
  if (missingRefCount > 0) {
    issues.push({
      label: 'Source coverage',
      message: `${plural(missingRefCount, 'content item')} still needs a source reference.`,
      count: missingRefCount,
      severity: 'warning',
      domain: 'source',
    });
  }
  const danglingRefCount = compactCount(sourceEvidence?.refCoverage?.danglingRefs);
  if (danglingRefCount > 0) {
    issues.push({
      label: 'Source coverage',
      message: `${plural(danglingRefCount, 'source reference')} does not resolve to the source ledger.`,
      count: danglingRefCount,
      severity: 'warning',
      domain: 'source',
    });
  }
  if (issues.length > 0) return dedupeReviewIssues(issues);

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
        count,
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
      count: 1,
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
  return ['readiness', 'retry', 'export', 'quality', 'source'].reduce(
    (total, domain) => total + compactCount(warningDomains?.[domain]),
    0,
  );
}

function canonicalBlockerCount(blockerDomains) {
  if (compactCount(blockerDomains?.schemaVersion) !== 1) return null;
  return ['readiness', 'quality', 'export'].reduce(
    (total, domain) => total + compactCount(blockerDomains?.[domain]),
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
    qualityIssues.find((issue) => !sourceIssueMessages.has(issue.message)) ||
    (sourceIssues.length === 0 ? qualityIssues[0] || null : null);
  const qualityProofIssue = qualityIssue ? null : buildQualityProofIssue(packageQuality, finishStatus);
  const readinessBlockers = Array.isArray(readiness?.blockers) ? readiness.blockers : [];
  const readinessWarnings = Array.isArray(readiness?.warnings) ? readiness.warnings : [];
  const packageBlockerCount = compactCount(packageQualityPass?.blockers);
  const packageWarningCount = compactCount(packageQualityPass?.warnings);
  const exportFailedCount = exportFailureIssue ? exportFailureIssue.count : compactCount(packageReceipt?.exportFailed);
  const qualityBlockerCount = countBlockingQualityFindings(packageQuality);
  const unavailableQualityProofCount = packageQuality && packageQuality.status !== 'graded' ? 1 : 0;
  const qualityWarningCount = qualityProofIssue
    ? 1
    : qualityIssues.some((issue) => issue.severity !== 'blocker')
      ? Math.max(1, countAdvisoryQualityFindings(packageQuality))
      : 0;
  const warningDomainCount = canonicalWarningCount(packageQualityPass?.warningDomains);
  const blockerDomainCount = canonicalBlockerCount(packageQualityPass?.blockerDomains);
  // Legacy AppFlow scalars already included readiness plus export failures.
  // Treat that scalar as an inclusive floor, while still reconstructing the
  // independent content and export domains when a restored record omitted it.
  // New records use the versioned, non-overlapping blockerDomains ledger.
  const inferredLegacyBlockerCount =
    Math.max(readinessBlockers.length, qualityBlockerCount + unavailableQualityProofCount) + exportFailedCount;
  const blockerCount =
    blockerDomainCount === null ? Math.max(packageBlockerCount, inferredLegacyBlockerCount) : blockerDomainCount;
  const operationalWarningCount = Math.max(
    packageWarningCount,
    readinessWarnings.length + exportIssues.reduce((total, issue) => total + compactCount(issue?.count || 1), 0),
  );
  const sourceQualityWarningCount = countSourceQualityAdvisoryFindings(sourceEvidence);
  const sourceWarningCount = sourceEvidence
    ? countSourceAdvisoryFindings(sourceEvidence)
    : sourceIssues.reduce((total, issue) => total + compactCount(issue?.count || 1), 0);
  const legacyWarningCount =
    operationalWarningCount + Math.max(0, qualityWarningCount - sourceQualityWarningCount) + sourceWarningCount;
  const warningCount = warningDomainCount === null ? legacyWarningCount : warningDomainCount;
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
