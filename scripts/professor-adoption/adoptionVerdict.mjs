export const ADOPTION_VERDICT_VERSION = 1;

export const ADOPTION_TIERS = [
  {
    id: 'blocked',
    rank: 0,
    label: 'Blocked',
    description: 'A P0 or package-integrity failure makes instructor handoff unsafe.',
  },
  {
    id: 'export-safe',
    rank: 1,
    label: 'Export Safe',
    description: 'The package can be downloaded and opened, but classroom quality is not proven.',
  },
  {
    id: 'structured-complete',
    rank: 2,
    label: 'Structurally Complete',
    description: 'Core deliverables and registries are present and internally consistent.',
  },
  {
    id: 'classroom-ready-draft',
    rank: 3,
    label: 'Classroom-Ready Draft',
    description: 'The package is usable for classroom preparation with local instructor review.',
  },
  {
    id: 'adoption-ready',
    rank: 4,
    label: 'Adoption-Ready',
    description: 'The package clears discipline/source coverage and public-course adoption pressure.',
  },
  {
    id: 'university-proofed',
    rank: 5,
    label: 'University-Proofed',
    description: 'The package is adoption-ready and backed by complete external proof evidence.',
  },
];

const TIER_BY_ID = new Map(ADOPTION_TIERS.map((tier) => [tier.id, tier]));
const STEM_DISCIPLINE_RE =
  /\b(operating systems?|computer science|programming|software|data science|machine learning|artificial intelligence|linear algebra|calculus|mathematics|statistics|physics|chemistry|biology|geology|astronomy|engineering|economics|accounting|finance)\b/i;

function tier(id) {
  return TIER_BY_ID.get(id) || TIER_BY_ID.get('blocked');
}

function tierMin(currentId, capId) {
  return tier(currentId).rank <= tier(capId).rank ? currentId : capId;
}

function cleanText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function addUnique(rows, row) {
  if (!row?.id) return;
  if (!rows.some((entry) => entry.id === row.id)) rows.push(row);
}

function parseGenomeCounts(value) {
  const text = cleanText(value);
  const match = text.match(/([0-9]+)\s+genome\s*\+\s*([0-9]+)\s+cached\s+of\s+([0-9]+)\s+lessons/i);
  if (!match) return null;
  return {
    genome: Number(match[1]),
    cached: Number(match[2]),
    lessons: Number(match[3]),
    linked: Number(match[1]) + Number(match[2]),
    line: text,
  };
}

function parseQuality(scoreLedger = null, packageManifest = {}) {
  const quality = packageManifest?.quality || {};
  const counts = quality.findingCounts || {};
  const ledgerScore = Number(scoreLedger?.encodedDefectConformance?.overall?.score);
  const manifestScore = Number(quality.score);
  const score = Number.isFinite(ledgerScore) ? ledgerScore : Number.isFinite(manifestScore) ? manifestScore : null;
  const source = Number.isFinite(ledgerScore) ? 'SCORE_LEDGER.json' : score !== null ? 'PACKAGE_MANIFEST.json' : 'none';
  return {
    status: quality.status || (score !== null ? 'graded' : 'unknown'),
    verification: Number.isFinite(ledgerScore)
      ? 'ledger-replayable'
      : score !== null
        ? 'unverifiable-legacy'
        : 'absent',
    source,
    score,
    grade: quality.grade || null,
    p0: Number.isFinite(Number(counts.p0)) ? Number(counts.p0) : 0,
    p1: Number.isFinite(Number(counts.p1)) ? Number(counts.p1) : 0,
    p2: Number.isFinite(Number(counts.p2)) ? Number(counts.p2) : 0,
  };
}

function parseExportStatus(packageManifest = {}, logText = '') {
  const gate = packageManifest?.gates || packageManifest?.exportVerification || {};
  const log = String(logText || '');
  const logMatch = log.match(/export_verify_done\s+({[^\n]+})/g)?.at(-1);
  let parsed = null;
  if (logMatch) {
    try {
      parsed = JSON.parse(logMatch.replace(/^.*export_verify_done\s+/, ''));
    } catch {
      parsed = null;
    }
  }
  const status = gate.exportStatus || gate.status || parsed?.status || packageManifest?.exportStatus || 'unknown';
  const failed = Number(gate.exportFailed ?? gate.failed ?? parsed?.failed ?? 0);
  const warnings = Number(gate.exportWarnings ?? gate.warningCount ?? gate.warnings ?? parsed?.warningCount ?? 0);
  return {
    status,
    failed: Number.isFinite(failed) ? failed : 0,
    warnings: Number.isFinite(warnings) ? warnings : 0,
    checked: Number(gate.exportChecked ?? gate.checked ?? parsed?.checked ?? 0) || 0,
  };
}

function sourceCoverageStatus({ sourceCoverage = {}, professorAdoptionSummary = {} }) {
  const caseCount = Number(sourceCoverage.caseCount ?? professorAdoptionSummary.caseCount ?? 0);
  const status = sourceCoverage.status || professorAdoptionSummary.status || 'unknown';
  const sourceStandardCoverage = {
    status,
    caseCount,
    source: sourceCoverage.source || 'public-source professor-adoption benchmark',
    substituteForGenome: Boolean(sourceCoverage.substituteForGenome ?? caseCount >= 30),
    evidence:
      sourceCoverage.evidence ||
      (caseCount > 0
        ? `${caseCount} public-source benchmark case(s), status=${status}`
        : 'No source benchmark evidence.'),
  };
  sourceStandardCoverage.passes =
    sourceStandardCoverage.substituteForGenome && status === 'pass' && sourceStandardCoverage.caseCount >= 30;
  return sourceStandardCoverage;
}

function assessmentRegistryStats({ assessmentRegistry = null, courseGraph = null, packageManifest = {} }) {
  const registry =
    (Array.isArray(assessmentRegistry) && assessmentRegistry) ||
    (Array.isArray(courseGraph?.assessments) && courseGraph.assessments) ||
    (Array.isArray(packageManifest?.assessments) && packageManifest.assessments) ||
    [];
  const graded = registry.filter((entry) => entry?.kind !== 'in-class');
  const weightSum = graded.reduce((sum, entry) => sum + (Number(entry.weightPct ?? entry.weight ?? 0) || 0), 0);
  const hasArtifacts =
    registry.length === 0 || registry.every((entry) => !entry?.artifact || typeof entry.artifact === 'string');
  return {
    count: registry.length,
    gradedCount: graded.length,
    weightSum,
    hasArtifacts,
    passes: registry.length > 0 && graded.length > 0 && Math.abs(weightSum - 100) <= 0.5 && hasArtifacts,
  };
}

function adoptionSummaryStatus(summary = {}) {
  return {
    status: summary.status || 'unknown',
    caseCount: Number(summary.caseCount || 0),
    minimumScore: Number(summary.minimumScore || 0),
    p0: Number(summary.findingCounts?.P0 || 0),
    p1: Number(summary.findingCounts?.P1 || 0),
    p2: Number(summary.findingCounts?.P2 || 0),
  };
}

function confidenceFor({ tierId, caps, blockingReasons, dimensions }) {
  if (blockingReasons.length > 0 || tierId === 'blocked') return 'low';
  if (caps.length > 0) return 'medium';
  if (dimensions.professorAdoption.status === 'pass' && dimensions.sourceStandardCoverage.passes) return 'high';
  if (tierId === 'adoption-ready' || tierId === 'university-proofed') return 'medium';
  return 'low';
}

export function isStructuredStemCourse({ packageManifest = {}, courseGraph = {}, courseTitle = '' } = {}) {
  const text = [
    courseTitle,
    packageManifest?.courseName,
    packageManifest?.title,
    courseGraph?.courseName,
    ...(Array.isArray(courseGraph?.concepts)
      ? courseGraph.concepts.slice(0, 12).map((concept) => concept?.title || concept?.term)
      : []),
  ]
    .filter(Boolean)
    .join(' ');
  return STEM_DISCIPLINE_RE.test(text);
}

export function buildAdoptionVerdict({
  packageManifest = {},
  courseGraph = null,
  assessmentRegistry = null,
  qualityReport = '',
  scoreLedger = null,
  logText = '',
  professorAdoptionSummary = null,
  professorAdoptionResults = [],
  sourceCoverage = {},
  externalProof = null,
  courseTitle = '',
  requirePackageEvidence = true,
} = {}) {
  const caps = [];
  const blockingReasons = [];
  const nextRepairs = [];
  let tierId = 'university-proofed';

  // qualityReport remains an accepted display artifact for compatibility, but
  // scoring never parses prose. Structured ledger/manifest data is the only
  // quality input.
  void qualityReport;
  const quality = parseQuality(scoreLedger, packageManifest);
  const exportStatus = parseExportStatus(packageManifest, logText);
  const genomeCounts = parseGenomeCounts(
    packageManifest?.pipeline?.genomeLinker || packageManifest?.pipeline?.knowledgeBackbone,
  );
  const assessmentStats = assessmentRegistryStats({ assessmentRegistry, courseGraph, packageManifest });
  const sourceStandardCoverage = sourceCoverageStatus({
    sourceCoverage,
    professorAdoptionSummary: professorAdoptionSummary || {},
  });
  const professorAdoption = adoptionSummaryStatus(professorAdoptionSummary || {});
  const structuredStem = isStructuredStemCourse({ packageManifest, courseGraph, courseTitle });
  const genomeLinked = genomeCounts ? genomeCounts.linked : 0;

  const hasPackageManifest = packageManifest && Object.keys(packageManifest).length > 0;

  if (requirePackageEvidence && !hasPackageManifest) {
    addUnique(caps, {
      id: 'package-evidence-missing',
      tierCap: 'export-safe',
      reason: 'No final package manifest was supplied to the adoption verdict engine.',
      evidence: 'packageManifest missing',
    });
    tierId = tierMin(tierId, 'export-safe');
  }

  if (hasPackageManifest && (!['passed', 'warnings'].includes(exportStatus.status) || exportStatus.failed > 0)) {
    addUnique(blockingReasons, {
      id: 'export-integrity-failed',
      severity: 'P0',
      reason: `Export verification did not pass (${exportStatus.status}, failed=${exportStatus.failed}).`,
      evidence: JSON.stringify(exportStatus),
      nextRepair: 'repair-export-integrity',
    });
    tierId = 'blocked';
  }

  if (hasPackageManifest && exportStatus.failed === 0 && exportStatus.warnings > 0) {
    addUnique(caps, {
      id: 'export-review-required',
      tierCap: 'export-safe',
      reason: `Export verification completed with ${exportStatus.warnings} warning(s); the ZIP is openable but not cleared for classroom publication.`,
      evidence: JSON.stringify(exportStatus),
    });
    tierId = tierMin(tierId, 'export-safe');
  }

  if (hasPackageManifest && quality.status === 'graded' && quality.p1 > 0) {
    addUnique(caps, {
      id: 'quality-p1-review-required',
      tierCap: 'classroom-ready-draft',
      reason: `Package quality grader found ${quality.p1} P1 finding(s) that require instructor review.`,
      evidence: `score=${quality.score}, grade=${quality.grade}`,
    });
    tierId = tierMin(tierId, 'classroom-ready-draft');
  }

  if (hasPackageManifest && quality.status === 'graded' && quality.p0 > 0) {
    addUnique(blockingReasons, {
      id: 'quality-p0',
      severity: 'P0',
      reason: `Package quality grader found ${quality.p0} P0 finding(s).`,
      evidence: `score=${quality.score}, grade=${quality.grade}`,
      nextRepair: 'repair-quality-p0',
    });
    tierId = 'blocked';
  }

  if (hasPackageManifest && quality.status !== 'graded') {
    addUnique(caps, {
      id: 'quality-not-graded',
      tierCap: 'export-safe',
      reason: 'The package did not receive a final quality grade.',
      evidence: `quality.status=${quality.status}`,
    });
    tierId = tierMin(tierId, 'export-safe');
  }

  if (hasPackageManifest && !assessmentStats.passes) {
    addUnique(caps, {
      id: 'assessment-registry-incomplete',
      tierCap: 'structured-complete',
      reason: 'Assessment registry is missing, ungraded, or weights do not sum to 100.',
      evidence: JSON.stringify(assessmentStats),
    });
    tierId = tierMin(tierId, 'structured-complete');
  }

  if (structuredStem && genomeCounts && genomeLinked === 0 && !sourceStandardCoverage.passes) {
    addUnique(caps, {
      id: 'no-knowledge-backbone-or-source-standard',
      tierCap: 'classroom-ready-draft',
      reason: 'Structured STEM course has 0 genome-linked lessons and no passing substitute source-standard benchmark.',
      evidence: `${genomeCounts.line}; ${sourceStandardCoverage.evidence}`,
    });
    tierId = tierMin(tierId, 'classroom-ready-draft');
  }

  if (!sourceStandardCoverage.passes) {
    addUnique(caps, {
      id: 'source-standard-coverage-missing',
      tierCap: 'classroom-ready-draft',
      reason: 'No passing 30-case public-source benchmark is attached as substitute standards/source coverage.',
      evidence: sourceStandardCoverage.evidence,
    });
    tierId = tierMin(tierId, 'classroom-ready-draft');
  }

  if (professorAdoptionSummary && professorAdoption.status !== 'pass') {
    addUnique(caps, {
      id: 'professor-adoption-not-pass',
      tierCap: 'classroom-ready-draft',
      reason: `Professor adoption benchmark status is ${professorAdoption.status}.`,
      evidence: `cases=${professorAdoption.caseCount}, minimumScore=${professorAdoption.minimumScore}`,
    });
    tierId = tierMin(tierId, 'classroom-ready-draft');
  } else if (!professorAdoptionSummary) {
    addUnique(caps, {
      id: 'professor-adoption-not-attached',
      tierCap: 'classroom-ready-draft',
      reason: 'No professor-adoption benchmark summary is attached.',
      evidence: 'professorAdoptionSummary missing',
    });
    tierId = tierMin(tierId, 'classroom-ready-draft');
  }

  if (!externalProof?.status || externalProof.status !== 'pass') {
    addUnique(caps, {
      id: 'external-proof-missing',
      tierCap: 'adoption-ready',
      reason: 'External reviewer proof is not attached, so the package cannot be University-Proofed.',
      evidence: externalProof?.status ? `externalProof.status=${externalProof.status}` : 'external proof missing',
    });
    tierId = tierMin(tierId, 'adoption-ready');
  }

  for (const reason of blockingReasons) {
    addUnique(nextRepairs, {
      id: reason.nextRepair || reason.id,
      priority: reason.severity || 'P0',
      targetArea: 'package',
      acceptanceCriteria: [reason.reason],
      proofCommands: ['npm run audit:deep-quality'],
    });
  }

  for (const result of professorAdoptionResults || []) {
    for (const finding of result.findings || []) {
      addUnique(nextRepairs, {
        id: finding.requiredRepairAction || `${finding.dimension}-${finding.failureClass}`,
        priority: finding.severity || 'P2',
        targetArea: finding.suspectedOwner || 'compiler',
        acceptanceCriteria: finding.acceptanceCriteria || ['The professor-adoption finding no longer appears.'],
        proofCommands: finding.proofCommands || ['npm run audit:professor-adoption'],
      });
    }
  }

  const dimensions = {
    exportIntegrity: exportStatus,
    packageQuality: quality,
    assessmentRegistry: assessmentStats,
    knowledgeCoverage: {
      status: genomeLinked > 0 ? 'pass' : structuredStem ? 'unlinked-structured-stem' : 'not-linked',
      structuredStem,
      genome: genomeCounts,
    },
    sourceStandardCoverage,
    professorAdoption,
    externalProof: externalProof || { status: 'not-attached' },
  };
  const gateTopologyStatus = confidenceFor({ tierId, caps, blockingReasons, dimensions });
  const evidenceCoverage = {
    verification: quality.verification,
    source: quality.source,
    deterministicPackageEvidence: scoreLedger?.deterministicPackageEvidence?.points || null,
    note: 'Evidence coverage is a vector of earned, lost, and unobserved points, not a scalar confidence claim.',
  };

  return {
    version: ADOPTION_VERDICT_VERSION,
    status: blockingReasons.length > 0 ? 'blocked' : caps.length > 0 ? 'capped' : 'pass',
    tier: tierId,
    tierRank: tier(tierId).rank,
    tierLabel: tier(tierId).label,
    // Compatibility alias. This value describes gate topology only; it is not
    // evidence confidence and must not be used as one.
    confidence: gateTopologyStatus,
    gateTopologyStatus,
    evidenceCoverage,
    minimumGatePolicy: {
      usesMinimumGates: true,
      averageScoreCanOnlyRaiseWithinUncappedTier: true,
      note: 'Caps and P0 blockers determine the maximum tier before averages or headline scores are considered.',
    },
    caps,
    blockingReasons,
    nextRepairs,
    dimensions,
  };
}
