import { deriveAutomatedEvidenceBand, deriveAutomatedEvidenceSummary } from './automatedReadinessSignal.js';

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

function verifyDeterministicEvidence(section, quality) {
  const rules = Array.isArray(section?.rules) ? section.rules : [];
  if (rules.length === 0) return invalid('deterministic evidence rules are missing');
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
  }
  return { status: 'verified', totals, evidenceSummary, band };
}

function verifyConformance(section, quality) {
  const dimensions = section?.dimensions || {};
  const rows = Object.entries(dimensions);
  if (rows.length === 0) return invalid('conformance dimensions are missing');
  let weighted = 0;
  let totalWeight = 0;
  for (const [dimension, row] of rows) {
    const points = row?.points || {};
    if (points.earned + points.lost + points.unobserved !== points.potential) {
      return invalid(`${dimension} conformance points do not equal their potential`);
    }
    if (row.status === 'negative-evidence-only') {
      let before = 100;
      for (const deduction of row.deductions || []) {
        const after = Math.max(0, before - Number(deduction.nominalPointsLost || 0));
        if (deduction.before !== before || deduction.after !== after) {
          return invalid(`${deduction.ruleId} conformance deduction cannot be replayed`);
        }
        before = after;
      }
      if (before !== points.earned) return invalid(`${dimension} deductions do not reproduce the score`);
    }
    const weight = Number(row.weight);
    if (!Number.isFinite(weight) || weight <= 0) return invalid(`${dimension} has an invalid weight`);
    weighted += points.earned * weight;
    totalWeight += weight;
  }
  let score = Math.round(weighted / totalWeight);
  for (const gate of section?.overall?.adjustments || []) {
    if (gate.before !== score || gate.transform?.operator !== 'cap') {
      return invalid(`${gate.ruleId} aggregate gate cannot be replayed`);
    }
    const after = Math.min(score, Number(gate.transform.maximum));
    if (gate.after !== after || gate.delta !== after - score)
      return invalid(`${gate.ruleId} aggregate result was forged`);
    score = after;
  }
  if (score !== section?.overall?.score)
    return invalid('conformance aggregate does not match its dimensions and gates');
  if (quality && Number(quality.score) !== score)
    return invalid('displayed conformance score does not match the ledger');
  return { status: 'verified', score };
}

export async function verifyScoreLedger({
  ledger,
  quality = null,
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
  const evidenceResult = verifyDeterministicEvidence(ledger.deterministicPackageEvidence, quality);
  if (evidenceResult.status !== 'verified') return evidenceResult;
  const conformanceResult = verifyConformance(ledger.encodedDefectConformance, quality);
  if (conformanceResult.status !== 'verified') return conformanceResult;
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
