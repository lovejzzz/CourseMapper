import {
  AUTOMATED_EVIDENCE_COMPONENT_LABELS,
  AUTOMATED_EVIDENCE_RULE_CONTRACTS,
  AUTOMATED_EVIDENCE_RULE_VERSION,
  deriveAutomatedEvidenceBand,
  deriveAutomatedEvidenceSummary,
  replayAutomatedEvidenceRule,
} from './automatedReadinessSignal.js';
import { ENCODED_DEFECT_CONFORMANCE_DIMENSION_WEIGHTS } from './conformanceScoreLedger.js';

function sameBinding(left, right) {
  return Boolean(left && right && left.algorithm === right.algorithm && left.sha256 === right.sha256);
}

function sameArtifactBinding(left, right) {
  return Boolean(left && right && left.algorithm === right.algorithm && left.rootSha256 === right.rootSha256);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function invalid(reason) {
  return { status: 'invalid', reason, projection: null };
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function sha256Text(value) {
  const bytes = new TextEncoder().encode(String(value || ''));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function verifyJsonReceipt(binding, receipt, { path, count = null } = {}) {
  if (!binding) return { status: 'verified' };
  if (!receipt || typeof receipt !== 'object') return invalid(`${path} receipt is missing`);
  if (
    binding.algorithm !== 'sha256' ||
    binding.path !== path ||
    (count !== null && binding.count !== count) ||
    binding.sha256 !== (await sha256Text(JSON.stringify(receipt, null, 2)))
  ) {
    return invalid(`${path} receipt does not match its ledger binding`);
  }
  return { status: 'verified' };
}

function conformanceGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function verifyDeterministicRuleContract(rules) {
  if (rules.length !== AUTOMATED_EVIDENCE_RULE_CONTRACTS.length) {
    return invalid('deterministic evidence rule set does not match the protocol');
  }
  const rulesById = new Map(rules.map((rule) => [rule?.ruleId, rule]));
  for (const contract of AUTOMATED_EVIDENCE_RULE_CONTRACTS) {
    const rule = rulesById.get(contract.ruleId);
    if (!rule) return invalid(`${contract.ruleId} is missing from the deterministic evidence protocol`);
    if (
      rule.ruleVersion !== AUTOMATED_EVIDENCE_RULE_VERSION ||
      rule.constructId !== contract.constructId ||
      Number(rule.points?.max) !== contract.max
    ) {
      return invalid(`${contract.ruleId} does not match its canonical rule contract`);
    }
    const expectedEvidence = contract.evidence;
    const actualEvidence = (rule.evidence || []).map((entry) => [
      entry?.evidenceId,
      entry?.artifactPath,
      entry?.jsonPointer,
    ]);
    if (!sameJson(actualEvidence, expectedEvidence)) {
      return invalid(`${contract.ruleId} evidence bindings do not match the protocol`);
    }
    const expectedDependsOn = expectedEvidence.map(([evidenceId]) => evidenceId);
    if (!sameJson(rule.dependsOn, expectedDependsOn)) {
      return invalid(`${contract.ruleId} score-bearing evidence ownership was forged`);
    }
    let replay;
    try {
      replay = replayAutomatedEvidenceRule(rule);
    } catch (error) {
      return invalid(error?.message || `${contract.ruleId} could not be replayed`);
    }
    if (
      rule.status !== replay.status ||
      rule.evidencePolarity !== replay.evidencePolarity ||
      !sameJson(rule.points, replay.points) ||
      rule.predicate?.operator !== replay.predicateOperator ||
      !sameJson(rule.predicate?.expected, replay.predicateExpected) ||
      !sameJson(rule.predicate?.actual, replay.predicateActual) ||
      rule.antiGaming?.inputFingerprint !== replay.antiGamingInputFingerprint
    ) {
      return invalid(`${contract.ruleId} status, points, predicate, or polarity cannot be replayed`);
    }
    for (const evidence of rule.evidence || []) {
      if (evidence.inputFingerprint !== replay.evidenceInputFingerprints[evidence.evidenceId]) {
        return invalid(`${evidence.evidenceId} observation fingerprint cannot be replayed`);
      }
    }
  }
  return { status: 'verified' };
}

function verifyDisplayedComponents(components, rules) {
  if (!components || typeof components !== 'object') return invalid('displayed evidence components are missing');
  const expected = Object.fromEntries(
    rules.map((rule) => [
      rule.constructId,
      {
        status: rule.status,
        label: AUTOMATED_EVIDENCE_COMPONENT_LABELS[rule.constructId],
        evidencePolarity: rule.evidencePolarity,
        weight: rule.points.max,
        score: rule.status === 'evaluated' ? Math.round((rule.points.earned / rule.points.max) * 100) : null,
        points: rule.points,
        reason: rule.reason,
        action: rule.action?.instruction,
        evidence: Object.fromEntries((rule.evidence || []).map((entry) => [entry.evidenceId, entry.observed])),
        ruleId: rule.ruleId,
      },
    ]),
  );
  return sameJson(components, expected)
    ? { status: 'verified' }
    : invalid('displayed evidence components do not match the canonical rule projection');
}

function verifyDeterministicEvidence(section, quality) {
  const rules = Array.isArray(section?.rules) ? section.rules : [];
  if (rules.length === 0) return invalid('deterministic evidence rules are missing');
  if (section?.ruleVersion !== AUTOMATED_EVIDENCE_RULE_VERSION) {
    return invalid('deterministic evidence rule version does not match the protocol');
  }
  const contractResult = verifyDeterministicRuleContract(rules);
  if (contractResult.status !== 'verified') return contractResult;
  const totals = { potential: 0, earned: 0, lost: 0, unobserved: 0 };
  const ruleIds = new Set();
  const scoreBearingEvidence = new Map();
  for (const rule of rules) {
    if (!rule?.ruleId || ruleIds.has(rule.ruleId)) return invalid('rule identities are missing or duplicated');
    ruleIds.add(rule.ruleId);
    const points = rule.points || {};
    for (const [target, source] of [
      ['potential', 'max'],
      ['earned', 'earned'],
      ['lost', 'lost'],
      ['unobserved', 'unobserved'],
    ]) {
      const value = Number(points[source]);
      if (!Number.isFinite(value) || value < 0) return invalid(`${rule.ruleId} has invalid ${source} points`);
      totals[target] += value;
    }
    if (points.earned + points.lost + points.unobserved !== points.max) {
      return invalid(`${rule.ruleId} point buckets do not equal its maximum`);
    }
    if (rule.status === 'evaluated' && points.unobserved !== 0) {
      return invalid(`${rule.ruleId} mixes evaluated and unobserved points`);
    }
    if (rule.status === 'unobserved' && (points.earned !== 0 || points.lost !== 0)) {
      return invalid(`${rule.ruleId} awards or deducts unobserved points`);
    }
    if (rule.status === 'evaluated') {
      for (const evidenceId of rule.dependsOn || []) {
        if (scoreBearingEvidence.has(evidenceId)) return invalid(`${evidenceId} earns credit in two constructs`);
        scoreBearingEvidence.set(evidenceId, rule.constructId);
      }
    }
  }
  if (totals.potential !== 100 || totals.earned + totals.lost + totals.unobserved !== 100) {
    return invalid('deterministic evidence totals do not partition a fixed 100-point potential');
  }
  if (JSON.stringify(totals) !== JSON.stringify(section.points)) {
    return invalid('deterministic evidence aggregate does not match its rule rows');
  }
  let evidenceSummary;
  let band;
  try {
    evidenceSummary = deriveAutomatedEvidenceSummary(rules);
    band = deriveAutomatedEvidenceBand(evidenceSummary, totals);
  } catch (error) {
    return invalid(error?.message || 'deterministic evidence polarity is invalid');
  }
  if (quality?.readiness) {
    if (quality.readiness.score !== totals.earned || quality.readiness.maxScore !== 100) {
      return invalid('displayed deterministic evidence score does not match the ledger');
    }
    if (JSON.stringify(quality.readiness.points) !== JSON.stringify(totals)) {
      return invalid('displayed deterministic evidence buckets do not match the ledger');
    }
    const derivedDisplay = {
      attainableMaxScore: evidenceSummary.evaluatedCoverage,
      evidenceCeiling: evidenceSummary.evaluatedCoverage,
      evaluatedCoverage: evidenceSummary.evaluatedCoverage,
      positiveValidationCoverage: evidenceSummary.positiveValidationCoverage,
      positiveValidationEarned: evidenceSummary.positiveValidationEarned,
      positiveValidationLost: evidenceSummary.positiveValidationLost,
      negativeEvidenceCoverage: evidenceSummary.negativeEvidenceCoverage,
      negativeEvidenceEarned: evidenceSummary.negativeEvidenceEarned,
      negativeEvidenceLost: evidenceSummary.negativeEvidenceLost,
      band,
    };
    for (const [field, expected] of Object.entries(derivedDisplay)) {
      if (quality.readiness[field] !== expected) {
        return invalid(`displayed deterministic evidence ${field} does not match the ledger`);
      }
    }
    const componentResult = verifyDisplayedComponents(quality.readiness.components, rules);
    if (componentResult.status !== 'verified') return componentResult;
  }
  return { status: 'verified', totals, evidenceSummary, band };
}

function verifyConformance(section, quality, findings = null) {
  if (
    section?.protocol !== 'coursemapper-encoded-defect-conformance-ledger-v1' ||
    section?.construct !== 'encoded-package-defect-conformance'
  ) {
    return invalid('conformance ledger does not match the canonical protocol');
  }
  const dimensions = section?.dimensions || {};
  const rows = Object.entries(dimensions);
  if (!sameJson(Object.keys(dimensions), Object.keys(ENCODED_DEFECT_CONFORMANCE_DIMENSION_WEIGHTS))) {
    return invalid('conformance dimensions do not match the canonical protocol');
  }
  let weighted = 0;
  let totalWeight = 0;
  const suppliedFindings = Array.isArray(findings) ? findings : null;
  let highestSeverity = suppliedFindings?.some((finding) => finding?.severity === 'P0')
    ? 'P0'
    : suppliedFindings?.some((finding) => finding?.severity === 'P1')
      ? 'P1'
      : null;
  const severityCounts = { p0: 0, p1: 0, p2: 0 };
  const findingIds = new Set();
  for (const finding of suppliedFindings || []) {
    const key = String(finding?.severity || '').toLowerCase();
    if (key in severityCounts) severityCounts[key] += 1;
  }
  for (const [dimension, row] of rows) {
    const points = row?.points || {};
    const expectedWeight = ENCODED_DEFECT_CONFORMANCE_DIMENSION_WEIGHTS[dimension];
    const expectedStatus = dimension === 'texture' ? 'evaluated-metric' : 'negative-evidence-only';
    if (
      row.constructId !== `encodedDefectConformance.${dimension}` ||
      row.status !== expectedStatus ||
      row.weight !== expectedWeight ||
      points.potential !== 100 ||
      points.unobserved !== 0 ||
      !Number.isInteger(points.earned) ||
      !Number.isInteger(points.lost) ||
      points.earned < 0 ||
      points.earned > 100 ||
      points.lost < 0 ||
      points.lost > 100 ||
      points.earned + points.lost !== 100
    ) {
      return invalid(`${dimension} conformance points do not equal their potential`);
    }
    if (row.status === 'negative-evidence-only') {
      const expectedFindings = suppliedFindings
        ?.filter((finding) => finding?.dimension === dimension)
        .slice()
        .sort((left, right) => `${left?.ruleId}:${left?.id}`.localeCompare(`${right?.ruleId}:${right?.id}`));
      if (!suppliedFindings && (row.deductions || []).length > 0) {
        return invalid(`${dimension} conformance deductions have no independent finding receipt`);
      }
      if (expectedFindings && expectedFindings.length !== (row.deductions || []).length) {
        return invalid(`${dimension} conformance deductions do not match the independent findings`);
      }
      if (
        row.coverage?.mode !== 'negative-evidence-only' ||
        row.coverage?.positiveValidation !== false ||
        row.coverage?.encodedFindings !== (row.deductions || []).length
      ) {
        return invalid(`${dimension} conformance coverage does not match its deductions`);
      }
      let before = 100;
      for (const [deductionIndex, deduction] of (row.deductions || []).entries()) {
        const finding = expectedFindings?.[deductionIndex] || null;
        const nominalPointsLost = Number(deduction.nominalPointsLost);
        const after = Math.max(0, before - nominalPointsLost);
        if (
          !deduction.ruleId ||
          !deduction.findingId ||
          findingIds.has(deduction.findingId) ||
          deduction.type !== 'encoded-defect-deduction' ||
          deduction.ruleVersion !== section.graderVersion ||
          deduction.predicate?.operator !== 'finding-present' ||
          deduction.predicate?.expected !== false ||
          deduction.predicate?.actual !== true ||
          !['P0', 'P1', 'P2'].includes(deduction.severity) ||
          !Number.isFinite(nominalPointsLost) ||
          nominalPointsLost < 0 ||
          deduction.before !== before ||
          deduction.after !== after ||
          deduction.effectivePointsLost !== before - after
        ) {
          return invalid(`${deduction.ruleId} conformance deduction cannot be replayed`);
        }
        if (
          finding &&
          (deduction.ruleId !== finding.ruleId ||
            deduction.ruleVersion !== finding.ruleVersion ||
            deduction.findingId !== finding.id ||
            deduction.nominalPointsLost !== Number(finding.pointsLost || 0) ||
            deduction.severity !== finding.severity ||
            deduction.evidenceTier !== finding.evidenceTier ||
            deduction.reason !== finding.reason ||
            deduction.action !== finding.action ||
            !sameJson(deduction.evidence, { file: finding.file, quote: finding.evidence }))
        ) {
          return invalid(`${deduction.ruleId} conformance deduction was not derived from its finding`);
        }
        findingIds.add(deduction.findingId);
        if (!suppliedFindings) {
          severityCounts[deduction.severity.toLowerCase()] += 1;
          if (deduction.severity === 'P0') highestSeverity = 'P0';
          else if (deduction.severity === 'P1' && highestSeverity !== 'P0') highestSeverity = 'P1';
        }
        before = after;
      }
      if (before !== points.earned) return invalid(`${dimension} deductions do not reproduce the score`);
    } else {
      const [metric] = row.deductions || [];
      if (
        row.coverage?.mode !== 'positive-and-negative-metric' ||
        row.coverage?.positiveValidation !== true ||
        row.deductions?.length !== 1 ||
        metric?.ruleId !== 'DQC.TEXTURE.VISIBLE_UNIT_METRIC' ||
        metric?.ruleVersion !== section.graderVersion ||
        metric?.type !== 'metric-result' ||
        metric?.predicate?.operator !== 'texture-score' ||
        metric?.predicate?.actual !== points.earned ||
        metric?.before !== 100 ||
        metric?.after !== points.earned ||
        metric?.effectivePointsLost !== points.lost
      ) {
        return invalid('texture metric cannot be replayed from its canonical row');
      }
    }
    weighted += points.earned * expectedWeight;
    totalWeight += expectedWeight;
  }
  const weightedExact = weighted / totalWeight;
  let score = Math.round(weightedExact);
  const expectedGate =
    highestSeverity === 'P0'
      ? { ruleId: 'DQC.OVERALL.P0_CAP', maximum: 74 }
      : highestSeverity === 'P1'
        ? { ruleId: 'DQC.OVERALL.P1_CAP', maximum: 89 }
        : null;
  const adjustments = section?.overall?.adjustments || [];
  if (adjustments.length !== (expectedGate ? 1 : 0)) {
    return invalid('conformance aggregate gates do not match the encoded finding severities');
  }
  for (const gate of adjustments) {
    if (gate.before !== score || gate.transform?.operator !== 'cap') {
      return invalid(`${gate.ruleId} aggregate gate cannot be replayed`);
    }
    if (gate.ruleId !== expectedGate.ruleId || gate.transform.maximum !== expectedGate.maximum) {
      return invalid(`${gate.ruleId} is not the canonical aggregate gate`);
    }
    const after = Math.min(score, Number(gate.transform.maximum));
    if (gate.after !== after || gate.delta !== after - score)
      return invalid(`${gate.ruleId} aggregate result was forged`);
    score = after;
  }
  if (
    section?.overall?.totalWeight !== totalWeight ||
    section?.overall?.weightedExact !== Number(weightedExact.toFixed(6)) ||
    section?.overall?.beforeAdjustments !== Math.round(weightedExact)
  ) {
    return invalid('conformance aggregate metadata cannot be replayed');
  }
  if (score !== section?.overall?.score)
    return invalid('conformance aggregate does not match its dimensions and gates');
  if (quality && Number(quality.score) !== score)
    return invalid('displayed conformance score does not match the ledger');
  if (quality) {
    const projectedDimensions = Object.fromEntries(rows.map(([dimension, row]) => [dimension, row.points.earned]));
    if (!sameJson(quality.dimensions, projectedDimensions)) {
      return invalid('displayed conformance dimensions do not match the ledger');
    }
    if (!sameJson(quality.findingCounts, severityCounts)) {
      return invalid('displayed finding counts do not match the canonical findings');
    }
    if (quality.grade !== conformanceGrade(score)) {
      return invalid('displayed conformance grade does not match the verified score');
    }
  }
  return { status: 'verified', score };
}

export async function verifyScoreLedger({
  ledger,
  quality = null,
  findings = null,
  packageReadinessReceipt = null,
  currentGraderVersion = '',
  gradingScope = null,
  evidenceArtifacts = null,
} = {}) {
  if (!ledger || ledger.protocol !== 'coursemapper-score-ledger-v1') {
    return {
      status: 'unverifiable-legacy',
      reason: 'SCORE_LEDGER.json is missing or uses an unknown protocol',
      projection: null,
    };
  }
  const ledgerGrader = ledger.encodedDefectConformance?.graderVersion || '';
  if (currentGraderVersion && ledgerGrader !== currentGraderVersion) {
    return { status: 'stale-regrade-required', reason: 'grader version changed', projection: null };
  }
  if (gradingScope && !sameBinding(ledger.bindings?.gradingScope, gradingScope)) {
    return { status: 'stale-regrade-required', reason: 'logical grading scope changed', projection: null };
  }
  if (evidenceArtifacts && !sameArtifactBinding(ledger.bindings?.evidenceArtifacts, evidenceArtifacts)) {
    return invalid('graded artifact bytes changed');
  }
  const findingRows = Array.isArray(findings) ? findings : null;
  const qualityFindingsReceipt = findingRows
    ? {
        protocol: 'coursemapper-quality-findings-v1',
        graderVersion: ledgerGrader,
        findingCount: findingRows.length,
        findings: findingRows,
      }
    : null;
  const findingsReceiptResult = await verifyJsonReceipt(ledger.bindings?.qualityFindings, qualityFindingsReceipt, {
    path: 'QUALITY_FINDINGS.json',
    count: findingRows?.length ?? null,
  });
  if (findingsReceiptResult.status !== 'verified') return findingsReceiptResult;
  if (packageReadinessReceipt) {
    if (
      !['coursemapper-package-readiness-receipt-v1', 'coursemapper-package-readiness-receipt-v2'].includes(
        packageReadinessReceipt.protocol,
      ) ||
      !sameJson(packageReadinessReceipt.readiness, ledger.bindings?.packageReadiness)
    ) {
      return invalid('package readiness receipt does not match the ledger');
    }
  }
  const readinessReceiptResult = await verifyJsonReceipt(
    ledger.bindings?.packageReadinessReceipt,
    packageReadinessReceipt,
    { path: 'PACKAGE_READINESS.json' },
  );
  if (readinessReceiptResult.status !== 'verified') return readinessReceiptResult;
  const evidenceResult = verifyDeterministicEvidence(ledger.deterministicPackageEvidence, quality);
  if (evidenceResult.status !== 'verified') return evidenceResult;
  const conformanceResult = verifyConformance(ledger.encodedDefectConformance, quality, findings);
  if (conformanceResult.status !== 'verified') return conformanceResult;
  const integrityRule = ledger.deterministicPackageEvidence?.rules?.find(
    (rule) => rule?.ruleId === 'DPK.PACKAGE.INTEGRITY',
  );
  const integrityObservations = Object.fromEntries(
    (integrityRule?.evidence || []).map((entry) => [entry.evidenceId, entry.observed]),
  );
  for (const [evidenceId, dimension] of [
    ['grader.structure-conformance', 'structure'],
    ['grader.format-conformance', 'format'],
    ['grader.identity-conformance', 'identity'],
  ]) {
    if (
      Number(integrityObservations[evidenceId]) !==
      Number(ledger.encodedDefectConformance?.dimensions?.[dimension]?.points?.earned)
    ) {
      return invalid(`${dimension} conformance diverges between the deterministic and conformance ledgers`);
    }
  }
  const projection = deepFreeze({
    deterministicPackageEvidence: {
      ...evidenceResult.totals,
      ...evidenceResult.evidenceSummary,
      attainableMaxScore: evidenceResult.evidenceSummary.evaluatedCoverage,
      evidenceCeiling: evidenceResult.evidenceSummary.evaluatedCoverage,
      band: evidenceResult.band,
      protocol: ledger.deterministicPackageEvidence?.protocol || null,
    },
    encodedDefectConformance: {
      score: conformanceResult.score,
      graderVersion: ledgerGrader,
    },
  });
  return { status: 'verified', reason: '', projection };
}
