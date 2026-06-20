function rows(manifest) {
  return Array.isArray(manifest?.sourceLedger) ? manifest.sourceLedger : [];
}

function hasRef(row) {
  return /^https?:\/\//i.test(String(row?.url || '')) || /\S/.test(String(row?.doi || ''));
}

function ambiguousLicense(row) {
  const license = String(row?.license || '')
    .trim()
    .toLowerCase();
  return (
    row?.licenseAmbiguous === true ||
    !license ||
    /^(open access|open license|unknown|public metadata|open library public metadata|metadata only|instructor review required|review required|varies|mixed)$/.test(
      license,
    )
  );
}

export function hasSourceLedgerProof(manifest) {
  return Boolean(
    rows(manifest).length || manifest?.courseIR?.sourceRefCoverage || manifest?.sourceReport?.sourceRefCoverage,
  );
}

export function expectsSourceLedgerProof(manifest) {
  const pipeline = manifest?.pipeline;
  if (!pipeline || typeof pipeline !== 'object') return false;
  const text = Object.values(pipeline)
    .map((value) => (typeof value === 'string' ? value : JSON.stringify(value || '')))
    .join(' ')
    .toLowerCase();
  return /\b(?:genome|openalex|openlibrary|openstax|source-finder|source ledger|sourceref|source ref|knowledgebackbone|citation|limited knowledge check|native authoring|courseir)\b/.test(
    text,
  );
}

export function shouldCheckSourceLedger(manifest) {
  return hasSourceLedgerProof(manifest) || expectsSourceLedgerProof(manifest);
}

export function checkSourceLedger(findings, { files, manifest }) {
  const ledger = rows(manifest);
  const coverage = manifest?.courseIR?.sourceRefCoverage || manifest?.sourceReport?.sourceRefCoverage || null;
  const reportPath = manifest?.sourceReport?.path || 'SOURCE_REPORT.md';

  if (ledger.length === 0 && !coverage) {
    findings.add({
      severity: 'P1',
      dimension: 'honesty',
      file: 'PACKAGE_MANIFEST.json',
      detail: 'source-backed pipeline did not export sourceLedger, sourceRef coverage, or SOURCE_REPORT.md proof',
      evidence: JSON.stringify(manifest?.pipeline || {}).slice(0, 200),
    });
    return;
  }

  if (!files.some((file) => file.path === reportPath)) {
    findings.add({
      severity: 'P1',
      dimension: 'structure',
      file: reportPath,
      detail: 'source ledger proof is present but the package does not include the declared source report',
      evidence: reportPath,
    });
  }

  const ids = new Set();
  for (const row of ledger) {
    const id = String(row?.id || '').trim();
    if (!id || ids.has(id)) {
      findings.add({
        severity: 'P1',
        dimension: 'citations',
        file: 'PACKAGE_MANIFEST.json',
        detail: 'source ledger row has a missing or duplicate id',
        evidence: JSON.stringify(row).slice(0, 160),
      });
    }
    if (id) ids.add(id);
    if (!String(row?.title || row?.evidence || '').trim()) {
      findings.add({
        severity: 'P1',
        dimension: 'citations',
        file: 'PACKAGE_MANIFEST.json',
        detail: `source ledger row ${id || '(missing id)'} has no title or evidence`,
        evidence: JSON.stringify(row).slice(0, 160),
      });
    }
    if (!hasRef(row) && !['courseir', 'instructor', 'instructor-provided'].includes(row?.provider)) {
      findings.add({
        severity: 'P2',
        dimension: 'citations',
        file: 'PACKAGE_MANIFEST.json',
        detail: `source ledger row ${id || '(missing id)'} has no accessible URL or DOI`,
        evidence: row?.title || row?.evidence || JSON.stringify(row).slice(0, 120),
      });
    }
    if (ambiguousLicense(row)) {
      findings.add({
        severity: 'P2',
        dimension: 'citations',
        file: 'PACKAGE_MANIFEST.json',
        detail: `source ledger row ${id || '(missing id)'} has ambiguous or missing license`,
        evidence: row?.license || row?.title || row?.evidence || id,
      });
    }
  }

  for (const [category, proof] of Object.entries(coverage?.categories || {})) {
    const total = Number(proof?.total) || 0;
    const withRefs = Number(proof?.withRefs) || 0;
    const danglingRefs = Number(proof?.danglingRefs) || 0;
    if (total > 0 && withRefs < total) {
      findings.add({
        severity: category === 'factualClaims' ? 'P1' : 'P2',
        dimension: category === 'factualClaims' ? 'honesty' : 'citations',
        file: 'PACKAGE_MANIFEST.json',
        detail: `${category} sourceRef coverage is incomplete (${withRefs}/${total})`,
        evidence: (proof?.missingIds || []).join(', ') || `${withRefs}/${total}`,
      });
    }
    if (danglingRefs > 0) {
      findings.add({
        severity: 'P1',
        dimension: 'citations',
        file: 'PACKAGE_MANIFEST.json',
        detail: `${category} contains ${danglingRefs} sourceRef(s) that do not resolve to the source ledger`,
        evidence: JSON.stringify(proof).slice(0, 160),
      });
    }
  }
}
