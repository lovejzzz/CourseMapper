function compactCount(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

const SOURCE_TEXT_PATTERN =
  /\b(?:bibliograph|citation|doi|license|provenance|source(?:ref| ref| ledger| report| review| coverage)|trusted concept-linked)\b/i;

export function isSourceQualityFinding(finding = {}) {
  if (finding?.domain === 'source') return true;
  const dimension = String(finding?.dimension || '');
  if (/\bcitations?\b/i.test(dimension) || /\bsource\b/i.test(dimension)) return true;
  return SOURCE_TEXT_PATTERN.test([finding?.file, finding?.detail, finding?.message].filter(Boolean).join(' '));
}

function compactFinding(finding = {}) {
  return {
    domain: 'source',
    severity: finding?.severity || 'P2',
    dimension: finding?.dimension || 'citations',
    detail: finding?.detail || finding?.message || '',
    ...(finding?.file ? { file: finding.file } : {}),
    ...(finding?.evidence ? { evidence: finding.evidence } : {}),
  };
}

function compactCoverage(coverage) {
  if (!coverage || typeof coverage !== 'object') return null;
  const totals = coverage.totals || {};
  return {
    total: compactCount(totals.total),
    withRefs: compactCount(totals.withRefs),
    missing: compactCount(totals.missing),
    danglingRefs: compactCount(totals.danglingRefs),
  };
}

/**
 * Carry the structured source proof used by the ZIP grader across the
 * finalizer boundary. The UI should never have to reverse-engineer this from
 * prose in QUALITY_REPORT.md or from receipt keys no producer writes.
 */
export function buildFinalizeSourceEvidence(manifest = null, findings = []) {
  if (!manifest || typeof manifest !== 'object') return null;
  const ledgerSummary = manifest.sourceLedgerSummary || null;
  const reviewRows = Array.isArray(manifest.sourceReviewRows) ? manifest.sourceReviewRows : [];
  const coverage = manifest.courseIR?.sourceRefCoverage || manifest.sourceReport?.sourceRefCoverage || null;
  const sourceFindings = (Array.isArray(findings) ? findings : []).filter(isSourceQualityFinding).map(compactFinding);
  const sourceCount = compactCount(manifest.sourceReport?.sourceCount ?? ledgerSummary?.sourceCount);
  const reviewRequiredCount = compactCount(
    manifest.sourceReport?.sourceReviewCount ?? ledgerSummary?.reviewRequiredCount ?? reviewRows.length,
  );
  const refCoverage = compactCoverage(coverage);

  if (!ledgerSummary && reviewRows.length === 0 && !manifest.sourceReport && !coverage && sourceFindings.length === 0) {
    return null;
  }

  return {
    schemaVersion: 1,
    sourceCount,
    reviewRequiredCount,
    reportPath: manifest.sourceReport?.path || '',
    ...(ledgerSummary ? { ledgerSummary: { ...ledgerSummary } } : {}),
    ...(refCoverage ? { refCoverage } : {}),
    findings: sourceFindings,
  };
}

export function countSourceAdvisoryFindings(sourceEvidence) {
  const findingCount = countSourceQualityAdvisoryFindings(sourceEvidence);
  const refCoverage = sourceEvidence?.refCoverage || {};
  const structuredCount =
    compactCount(sourceEvidence?.reviewRequiredCount) +
    compactCount(refCoverage.missing) +
    compactCount(refCoverage.danglingRefs);
  return Math.max(findingCount, structuredCount);
}

export function countSourceQualityAdvisoryFindings(sourceEvidence) {
  return (Array.isArray(sourceEvidence?.findings) ? sourceEvidence.findings : []).filter(
    (finding) => finding?.severity !== 'P0',
  ).length;
}
