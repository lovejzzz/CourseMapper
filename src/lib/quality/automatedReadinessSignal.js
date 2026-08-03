import { extractExplicitLessonSequence } from '../explicitLessonSequence.js';
import { isClaimBoundSourceLedgerRow, isTrustedConceptLinkedSourceLedgerRow } from '../knowledge/sourceLedger.js';
export { buildAssessmentCoherenceFromPackage as assessment } from './assessmentCoherence.js';

export const AUTOMATED_READINESS_PROTOCOL = 'coursemapper-deterministic-package-evidence-v2';
// Compatibility exports retained for callers that previously rendered a
// moving readiness ruler. The v2 ledger always has a fixed 100-point potential.
export const AUTOMATED_READINESS_CEILING = 100;
// Maximum fixed potential retained for compatibility. A package-specific
// attainable maximum is derived from the evaluated rule rows below.
export const AUTOMATED_READINESS_ATTAINABLE_MAX = 100;
export const AUTOMATED_READINESS_CLAIM_BOUNDARY =
  'This deterministic evidence score is not a readiness probability. It cannot prove factual accuracy, teachability, accessibility, or instructor validation.';

export const AUTOMATED_EVIDENCE_RULE_VERSION = '1.0.0';
const COMPONENT_WEIGHTS = {
  curriculumFidelity: 25,
  evidenceGrounding: 25,
  instructionalTexture: 20,
  assessmentCoherence: 15,
  packageIntegrity: 15,
};

export const AUTOMATED_EVIDENCE_COMPONENT_LABELS = {
  curriculumFidelity: 'Ordered lesson-title sequence match',
  evidenceGrounding: 'Rendered exact-source claim coverage',
  instructionalTexture: 'Masked visible-unit variation',
  assessmentCoherence: 'Objective-task-rubric coherence',
  packageIntegrity: 'Encoded package-defect conformance',
};

export const AUTOMATED_EVIDENCE_RULE_CONTRACTS = Object.freeze([
  {
    ruleId: 'DPK.CURRICULUM.ORDERED_SEQUENCE',
    constructId: 'curriculumFidelity',
    max: 25,
    evaluatedPolarity: 'positive-metric',
    evaluatedPredicateOperator: 'weighted-ordered-coverage',
    unobservedPredicateOperator: 'ordered-topic-alignment',
    evidence: [
      ['course.explicit-lesson-sequence', 'PACKAGE_MANIFEST.json', '/generationConstraints/explicitLessonSequence'],
      ['package.lesson-titles-for-sequence', 'PACKAGE_MANIFEST.json', '/lessons/*/title'],
    ],
  },
  {
    ruleId: 'DPK.EVIDENCE.RENDERED_CLAIM_SUPPORT',
    constructId: 'evidenceGrounding',
    max: 25,
    evaluatedPolarity: 'positive-metric',
    evaluatedPredicateOperator: 'rendered-exact-source-claim-lesson-coverage',
    unobservedPredicateOperator: 'rendered-claim-to-source-entailment',
    evidence: [['package.source-support-receipts', 'PACKAGE_MANIFEST.json', '/sourceLedger']],
  },
  {
    ruleId: 'DPK.INSTRUCTION.TEXTURE',
    constructId: 'instructionalTexture',
    max: 20,
    evaluatedPolarity: 'positive-metric',
    evaluatedPredicateOperator: 'proportional-texture-score',
    unobservedPredicateOperator: 'texture-metric',
    evidence: [['grader.texture-score', 'SCORE_LEDGER.json', '/conformance/texture']],
  },
  {
    ruleId: 'DPK.ASSESSMENT.COHERENCE',
    constructId: 'assessmentCoherence',
    max: 15,
    evaluatedPolarity: 'positive-metric',
    evaluatedPredicateOperator: 'rendered-objective-task-evidence-rubric-linkage',
    unobservedPredicateOperator: 'assessment-objective-rubric-coherence',
    evidence: [
      [
        'grader.assessment-coherence-checks',
        'SCORE_LEDGER.json',
        '/readiness/ledger/rules/DPK.ASSESSMENT.COHERENCE/evidence',
      ],
    ],
  },
  {
    ruleId: 'DPK.PACKAGE.INTEGRITY',
    constructId: 'packageIntegrity',
    max: 15,
    evaluatedPolarity: 'negative-evidence-only',
    evaluatedPredicateOperator: 'weighted-structural-conformance',
    unobservedPredicateOperator: 'weighted-structural-conformance',
    evidence: [
      ['grader.structure-conformance', 'SCORE_LEDGER.json', '/conformance/dimensions/structure'],
      ['grader.format-conformance', 'SCORE_LEDGER.json', '/conformance/dimensions/format'],
      ['grader.identity-conformance', 'SCORE_LEDGER.json', '/conformance/dimensions/identity'],
    ],
  },
]);

function clamp(value, min = 0, max = 100) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(max, Math.max(min, numeric));
}

function rounded(value) {
  return Math.round(clamp(value));
}

function stableFingerprint(value) {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function textTokens(value) {
  return [
    ...new Set(
      String(value || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .split(/\s+/)
        .filter((token) => token.length >= 3),
    ),
  ];
}

function topicAlignment(expected, actual) {
  const expectedTokens = textTokens(expected);
  const actualTokens = new Set(textTokens(actual));
  if (expectedTokens.length === 0 || actualTokens.size === 0) return 0;
  return expectedTokens.filter((token) => actualTokens.has(token)).length / expectedTokens.length;
}

function ruleEvidenceObserved(rule, evidenceId) {
  return rule?.evidence?.find((entry) => entry?.evidenceId === evidenceId)?.observed;
}

function replayedPoints(max, componentScore) {
  const earned = Math.min(max, Math.max(0, Math.round((clamp(componentScore) / 100) * max)));
  return { max, earned, lost: max - earned, unobserved: 0 };
}

function assessmentCoherencePoints(max, observed = {}) {
  const passed = Number(observed.passedChecks);
  const total = Number(observed.totalChecks);
  if (!Number.isFinite(passed) || !Number.isFinite(total) || total <= 0) return replayedPoints(max, 0);
  const proportional = Math.floor((Math.min(total, Math.max(0, passed)) / total) * max);
  const earned = passed === total ? max : Math.min(max - 1, proportional);
  return { max, earned, lost: max - earned, unobserved: 0 };
}

export function replayAutomatedEvidenceRule(rule = {}) {
  const contract = AUTOMATED_EVIDENCE_RULE_CONTRACTS.find((entry) => entry.ruleId === rule.ruleId);
  if (!contract) throw new Error(`${rule.ruleId || 'rule'} is not part of the deterministic evidence protocol`);
  let status = 'unobserved';
  let points = { max: contract.max, earned: 0, lost: 0, unobserved: contract.max };
  let predicateOperator;
  let predicateExpected;
  let predicateActual;
  let antiGamingInput;

  if (rule.ruleId === 'DPK.CURRICULUM.ORDERED_SEQUENCE') {
    const sequenceObserved = ruleEvidenceObserved(rule, 'course.explicit-lesson-sequence');
    const titlesObserved = ruleEvidenceObserved(rule, 'package.lesson-titles-for-sequence');
    const sequence = Array.isArray(sequenceObserved) ? sequenceObserved : sequenceObserved?.sequence || [];
    const titles = Array.isArray(titlesObserved) ? titlesObserved : titlesObserved?.titles || [];
    antiGamingInput = [sequence, titles];
    if (sequence.length >= 2) {
      const comparisons = sequence.map((expected, index) => topicAlignment(expected, titles[index] || ''));
      const orderedMatched = comparisons.filter((ratio) => ratio >= 0.34).length;
      const orderedCoverage = orderedMatched / sequence.length;
      const countParity = Math.min(titles.length, sequence.length) / Math.max(titles.length, sequence.length);
      status = 'evaluated';
      points = replayedPoints(contract.max, (orderedCoverage * 0.8 + countParity * 0.2) * 100);
      predicateOperator = contract.evaluatedPredicateOperator;
      predicateExpected = { minimumTokenOverlap: 0.34, exactCountParity: 1 };
      predicateActual = { orderedMatched, orderedCoverage, countParity };
    } else {
      predicateOperator = contract.unobservedPredicateOperator;
      predicateExpected = 'explicit sequence with at least 2 lessons';
      predicateActual = 0;
    }
  } else if (rule.ruleId === 'DPK.EVIDENCE.RENDERED_CLAIM_SUPPORT') {
    const observed = ruleEvidenceObserved(rule, 'package.source-support-receipts');
    antiGamingInput = observed;
    const groundingRatio = Number(observed?.groundingRatio);
    if (
      observed?.protocol === 'rendered-exact-source-claim-coverage-v1' &&
      Number(observed?.lessons) > 0 &&
      Number.isFinite(groundingRatio) &&
      groundingRatio >= 0 &&
      groundingRatio <= 1
    ) {
      status = 'evaluated';
      points = replayedPoints(contract.max, groundingRatio * 100);
      predicateOperator = contract.evaluatedPredicateOperator;
      predicateExpected = { minimumExactClaimsPerLesson: 1, exactClaimIdentity: true, renderedByteBinding: true };
      predicateActual = observed;
    } else {
      predicateOperator = contract.unobservedPredicateOperator;
      predicateExpected = 'independently validated semantic support for rendered instructional claims';
      predicateActual = 'not implemented by this deterministic protocol';
    }
  } else if (rule.ruleId === 'DPK.INSTRUCTION.TEXTURE') {
    const observed = ruleEvidenceObserved(rule, 'grader.texture-score');
    const textureScore = observed?.textureScore;
    antiGamingInput = observed;
    if (Number.isFinite(Number(textureScore))) {
      status = 'evaluated';
      points = replayedPoints(contract.max, textureScore);
      predicateOperator = contract.evaluatedPredicateOperator;
      predicateExpected = 100;
      predicateActual = rounded(textureScore);
    } else {
      predicateOperator = contract.unobservedPredicateOperator;
      predicateExpected = 'finite score from masked visible-unit analysis';
      predicateActual = null;
    }
  } else if (rule.ruleId === 'DPK.ASSESSMENT.COHERENCE') {
    const observed = ruleEvidenceObserved(rule, 'grader.assessment-coherence-checks');
    const coherenceRatio = Number(observed?.coherenceRatio);
    antiGamingInput = observed;
    if (
      observed?.protocol === 'rendered-assessment-coherence-v1' &&
      Number(observed?.eligibleAssessments) > 0 &&
      Number(observed?.totalChecks) === Number(observed?.eligibleAssessments) * 5 &&
      Number.isFinite(coherenceRatio) &&
      coherenceRatio >= 0 &&
      coherenceRatio <= 1
    ) {
      status = 'evaluated';
      points = assessmentCoherencePoints(contract.max, observed);
      predicateOperator = contract.evaluatedPredicateOperator;
      predicateExpected = {
        checksPerAssessment: 5,
        renderedTaskAndRubricBytes: true,
        exactObjectiveVisibility: true,
      };
      predicateActual = observed;
    } else {
      predicateOperator = contract.unobservedPredicateOperator;
      predicateExpected = 'assessment-specific checks with objective and rubric linkage';
      predicateActual = 'no eligible rendered assessment receipt';
    }
  } else if (rule.ruleId === 'DPK.PACKAGE.INTEGRITY') {
    const observed = {
      structure: ruleEvidenceObserved(rule, 'grader.structure-conformance'),
      format: ruleEvidenceObserved(rule, 'grader.format-conformance'),
      identity: ruleEvidenceObserved(rule, 'grader.identity-conformance'),
    };
    antiGamingInput = observed;
    predicateOperator = Object.values(observed).every((value) => Number.isFinite(Number(value)))
      ? contract.evaluatedPredicateOperator
      : contract.unobservedPredicateOperator;
    predicateActual = observed;
    if (Object.values(observed).every((value) => Number.isFinite(Number(value)))) {
      status = 'evaluated';
      predicateExpected = { structure: 100, format: 100, identity: 100 };
      points = replayedPoints(
        contract.max,
        observed.structure * 0.45 + observed.format * 0.3 + observed.identity * 0.25,
      );
    } else predicateExpected = 'three finite dimension scores';
  }

  return {
    contract,
    status,
    evidencePolarity: status === 'unobserved' ? 'unobserved' : contract.evaluatedPolarity,
    points,
    predicateOperator,
    predicateExpected,
    predicateActual,
    antiGamingInputFingerprint: stableFingerprint(antiGamingInput),
    evidenceInputFingerprints: Object.fromEntries(
      contract.evidence.map(([evidenceId]) => [evidenceId, stableFingerprint(ruleEvidenceObserved(rule, evidenceId))]),
    ),
  };
}

function passedSupportReceipt(row = {}) {
  const receipt = row?.supportReceipt;
  const checkedClaims = Number(receipt?.checkedClaims);
  const minimumScore = Number(receipt?.minimumScore);
  if (
    receipt?.status !== 'passed' ||
    !Number.isFinite(checkedClaims) ||
    checkedClaims < 1 ||
    !Number.isFinite(minimumScore) ||
    minimumScore < 0.78
  ) {
    return null;
  }
  return { checkedClaims, minimumScore: clamp(minimumScore, 0, 1), method: String(receipt.method || '') };
}

function lessonNumbersForSource(row = {}) {
  const values = [...(Array.isArray(row?.sessionRefs) ? row.sessionRefs : []), ...(row?.conceptLinks || [])];
  const lessons = new Set();
  for (const value of values) {
    const text = typeof value === 'string' ? value : `${value?.id || ''} ${value?.label || ''}`;
    const match = String(text).match(/(?:lesson|session|^s)\s*[-:]?\s*(\d+)/i);
    if (match) lessons.add(Number(match[1]));
  }
  return lessons;
}

function lessonNumberForRenderedLocation(value = '') {
  const match = String(value || '').match(/(?:^|\/)Lesson\s+(\d{1,3})\b/i);
  return match ? Number(match[1]) : null;
}

function reconstructionDisclosure(manifest) {
  const count = Number(manifest?.pipeline?.nativeReconstruction?.readinessRepairedFieldCount) || 0;
  if (count <= 0) return null;
  return {
    status: 'deterministic-reconstruction',
    repairedFieldCount: Math.max(0, Math.floor(count)),
    claimBoundary:
      'Reconstructed fields are deterministic fallback content, not model-authored or independently verified evidence.',
  };
}

function evidenceRef(evidenceId, artifactPath, jsonPointer, observed) {
  return {
    evidenceId,
    artifactPath,
    jsonPointer,
    observed,
    inputFingerprint: stableFingerprint(observed),
  };
}

function evaluatedRule({
  ruleId,
  constructId,
  max,
  componentScore,
  evidence,
  predicate,
  reason,
  action,
  antiGaming,
  evidenceTier = 'deterministic-structural',
  evidencePolarity = 'positive-metric',
  points: declaredPoints,
}) {
  const points = declaredPoints || replayedPoints(max, componentScore);
  return {
    ruleId,
    ruleVersion: AUTOMATED_EVIDENCE_RULE_VERSION,
    constructId,
    status: 'evaluated',
    recoverability: 'author-recoverable',
    evidence,
    predicate,
    points,
    evidenceTier,
    evidencePolarity,
    confidence: {
      level: 'bounded',
      basis: 'Deterministic observations replay the declared predicate; no expert judgment is implied.',
    },
    reason,
    action: {
      instruction: action,
      expectedPredicateChange: predicate?.operator || 'declared rule improves',
    },
    antiGaming,
    dependsOn: evidence.map((entry) => entry.evidenceId),
  };
}

function unobservedRule({
  ruleId,
  constructId,
  max,
  evidence,
  predicate,
  reason,
  action,
  recoverability,
  evidenceTier,
  antiGaming,
}) {
  return {
    ruleId,
    ruleVersion: AUTOMATED_EVIDENCE_RULE_VERSION,
    constructId,
    status: 'unobserved',
    recoverability,
    evidence,
    predicate,
    points: { max, earned: 0, lost: 0, unobserved: max },
    evidenceTier,
    evidencePolarity: 'unobserved',
    confidence: {
      level: 'none',
      basis: reason,
    },
    reason,
    action: {
      instruction: action,
      expectedPredicateChange: 'supply eligible evidence so the rule can be evaluated',
    },
    antiGaming,
    dependsOn: evidence.map((entry) => entry.evidenceId),
  };
}

export function recomputeAutomatedEvidenceLedger(rules = []) {
  const totals = { potential: 0, earned: 0, lost: 0, unobserved: 0 };
  const ownedEvidence = new Map();
  for (const rule of rules) {
    const points = rule?.points || {};
    for (const key of Object.keys(totals)) {
      const sourceKey = key === 'potential' ? 'max' : key;
      const value = Number(points[sourceKey]);
      if (!Number.isFinite(value) || value < 0) throw new Error(`${rule?.ruleId || 'rule'} has invalid ${sourceKey}`);
      totals[key] += value;
    }
    if (points.earned + points.lost + points.unobserved !== points.max) {
      throw new Error(`${rule?.ruleId || 'rule'} point buckets do not equal its maximum`);
    }
    if (rule.status === 'evaluated' && points.unobserved !== 0) {
      throw new Error(`${rule.ruleId} is evaluated but carries unobserved points`);
    }
    if (rule.status === 'unobserved' && (points.earned !== 0 || points.lost !== 0)) {
      throw new Error(`${rule.ruleId} is unobserved but carries earned or lost points`);
    }
    if (rule.status === 'evaluated') {
      for (const evidenceId of rule.dependsOn || []) {
        if (ownedEvidence.has(evidenceId)) {
          throw new Error(
            `${evidenceId} earns points in both ${ownedEvidence.get(evidenceId)} and ${rule.constructId}`,
          );
        }
        ownedEvidence.set(evidenceId, rule.constructId);
      }
    }
  }
  return totals;
}

export function deriveAutomatedEvidenceSummary(rules = []) {
  const summary = {
    evaluatedCoverage: 0,
    positiveValidationCoverage: 0,
    positiveValidationEarned: 0,
    positiveValidationLost: 0,
    negativeEvidenceCoverage: 0,
    negativeEvidenceEarned: 0,
    negativeEvidenceLost: 0,
  };
  for (const rule of rules) {
    const replay = replayAutomatedEvidenceRule(rule);
    if (rule.status !== replay.status || rule?.evidencePolarity !== replay.evidencePolarity) {
      throw new Error(`${rule?.ruleId || 'rule'} has an invalid evidence polarity`);
    }
    if (rule.status !== 'evaluated') continue;
    summary.evaluatedCoverage += Number(rule.points.max);
    if (rule.evidencePolarity === 'positive-metric') {
      summary.positiveValidationCoverage += Number(rule.points.max);
      summary.positiveValidationEarned += Number(rule.points.earned);
      summary.positiveValidationLost += Number(rule.points.lost);
    } else if (rule.evidencePolarity === 'negative-evidence-only') {
      summary.negativeEvidenceCoverage += Number(rule.points.max);
      summary.negativeEvidenceEarned += Number(rule.points.earned);
      summary.negativeEvidenceLost += Number(rule.points.lost);
    }
  }
  return summary;
}

export function deriveAutomatedEvidenceBand(summary = {}, points = {}) {
  const positiveCoverage = Number(summary.positiveValidationCoverage) || 0;
  const positiveEarned = Number(summary.positiveValidationEarned) || 0;
  const unobserved = Number(points.unobserved) || 0;
  if (unobserved === 0 && positiveCoverage === 100 && positiveEarned >= 80) {
    return 'strong-positive-deterministic-evidence';
  }
  if (positiveCoverage >= 45 && positiveEarned >= 30) return 'partial-positive-deterministic-evidence';
  return 'limited-positive-deterministic-evidence';
}

function curriculumRule(manifest, course, lessonTitles) {
  const manifestSequence = Array.isArray(manifest?.generationConstraints?.explicitLessonSequence)
    ? manifest.generationConstraints.explicitLessonSequence.map((title) => String(title || '').trim()).filter(Boolean)
    : [];
  const explicitSequence =
    manifestSequence.length >= 2
      ? manifestSequence
      : extractExplicitLessonSequence(course?.prompt || course?.sourceBrief || '');
  const evidence = [
    evidenceRef(
      'course.explicit-lesson-sequence',
      'PACKAGE_MANIFEST.json',
      '/generationConstraints/explicitLessonSequence',
      explicitSequence,
    ),
    evidenceRef('package.lesson-titles-for-sequence', 'PACKAGE_MANIFEST.json', '/lessons/*/title', lessonTitles),
  ];
  if (explicitSequence.length < 2) {
    return unobservedRule({
      ruleId: 'DPK.CURRICULUM.ORDERED_SEQUENCE',
      constructId: 'curriculumFidelity',
      max: COMPONENT_WEIGHTS.curriculumFidelity,
      evidence,
      predicate: {
        operator: 'ordered-topic-alignment',
        expected: 'explicit sequence with at least 2 lessons',
        actual: 0,
      },
      reason: 'No explicit ordered source sequence was available, so curriculum fidelity was not scored.',
      action:
        'Provide the intended ordered lesson sequence in the course brief, then regenerate and review title alignment.',
      recoverability: 'author-recoverable',
      evidenceTier: 'deterministic-structural',
      antiGaming: {
        controls: ['missing sequence cannot earn credit', 'fixed 100-point potential', 'ordered position matching'],
        inputFingerprint: stableFingerprint([explicitSequence, lessonTitles]),
      },
    });
  }

  const comparisons = explicitSequence.map((expected, index) => topicAlignment(expected, lessonTitles[index] || ''));
  const orderedMatched = comparisons.filter((ratio) => ratio >= 0.34).length;
  const orderedCoverage = orderedMatched / explicitSequence.length;
  const countParity =
    Math.min(lessonTitles.length, explicitSequence.length) / Math.max(lessonTitles.length, explicitSequence.length);
  const componentScore = (orderedCoverage * 0.8 + countParity * 0.2) * 100;
  return evaluatedRule({
    ruleId: 'DPK.CURRICULUM.ORDERED_SEQUENCE',
    constructId: 'curriculumFidelity',
    max: COMPONENT_WEIGHTS.curriculumFidelity,
    componentScore,
    evidence: evidence.map((entry) => {
      const observed =
        entry.evidenceId === 'course.explicit-lesson-sequence'
          ? { expectedLessons: explicitSequence.length, sequence: explicitSequence }
          : { exportedLessons: lessonTitles.length, titles: lessonTitles, alignmentRatios: comparisons };
      return { ...entry, observed, inputFingerprint: stableFingerprint(observed) };
    }),
    predicate: {
      operator: 'weighted-ordered-coverage',
      expected: { minimumTokenOverlap: 0.34, exactCountParity: 1 },
      actual: { orderedMatched, orderedCoverage, countParity },
    },
    reason: `${orderedMatched}/${explicitSequence.length} lesson titles met the ordered topic-overlap rule; count parity was ${Number(countParity.toFixed(3))}.`,
    action:
      orderedMatched === explicitSequence.length && countParity === 1
        ? 'Preserve the explicit order and verify the lesson bodies follow the same progression.'
        : 'Rename, add, remove, or reorder lessons so each position reflects its corresponding source topic.',
    antiGaming: {
      controls: [
        'title genericity does not also earn texture points',
        'ordered position matching',
        'fixed denominator',
      ],
      inputFingerprint: stableFingerprint([explicitSequence, lessonTitles]),
    },
  });
}

function groundingRule(manifest, lessonCount) {
  const claimBoundRows = (Array.isArray(manifest?.sourceLedger) ? manifest.sourceLedger : []).filter(
    isClaimBoundSourceLedgerRow,
  );
  const claimBoundLessons = new Set();
  const renderedArtifacts = new Set();
  let renderedClaims = 0;
  for (const row of claimBoundRows) {
    for (const check of row?.supportReceipt?.checks || []) {
      if (check?.renderedLocation) {
        renderedArtifacts.add(String(check.renderedLocation));
        const lesson = lessonNumberForRenderedLocation(check.renderedLocation);
        if (lesson) claimBoundLessons.add(lesson);
      }
      if (check?.renderedLocation && check?.semanticSupport === true && check?.entailed === true) renderedClaims += 1;
    }
  }
  const boundedLessonCount = Math.max(0, Number(lessonCount) || 0);
  const coveredLessons = [...claimBoundLessons].filter(
    (lesson) => Number.isInteger(lesson) && lesson >= 1 && lesson <= boundedLessonCount,
  ).length;
  if (boundedLessonCount > 0 && coveredLessons > 0 && renderedClaims >= coveredLessons) {
    const observed = {
      protocol: 'rendered-exact-source-claim-coverage-v1',
      construct: 'rendered-exact-source-claim-support',
      downstreamClaimSupport: true,
      scoreEligible: true,
      lessons: boundedLessonCount,
      receiptBackedLessons: coveredLessons,
      verifiedClaims: renderedClaims,
      trustedConceptLinkedSources: claimBoundRows.length,
      renderedArtifacts: renderedArtifacts.size,
      groundingRatio: Number((coveredLessons / boundedLessonCount).toFixed(3)),
      claimBoundary:
        'Only exact source claims located in exported Office bytes are counted; surrounding prose remains unvalidated.',
    };
    return evaluatedRule({
      ruleId: 'DPK.EVIDENCE.RENDERED_CLAIM_SUPPORT',
      constructId: 'evidenceGrounding',
      max: COMPONENT_WEIGHTS.evidenceGrounding,
      componentScore: observed.groundingRatio * 100,
      evidence: [evidenceRef('package.source-support-receipts', 'PACKAGE_MANIFEST.json', '/sourceLedger', observed)],
      predicate: {
        operator: 'rendered-exact-source-claim-lesson-coverage',
        expected: { minimumExactClaimsPerLesson: 1, exactClaimIdentity: true, renderedByteBinding: true },
        actual: observed,
      },
      reason: `${coveredLessons}/${boundedLessonCount} lessons contain at least one byte-bound exact claim from an admitted source passage (${renderedClaims} claims across ${renderedArtifacts.size} artifacts).`,
      action:
        coveredLessons === boundedLessonCount
          ? 'Preserve the exact source-to-rendered-claim bindings and independently review surrounding instructional interpretations.'
          : 'Add at least one admitted, exact source claim to each uncovered lesson without deleting or paraphrasing already bound claims.',
      antiGaming: {
        controls: [
          'lesson-count denominator is fixed by the exported package',
          'citation rows without rendered byte locations earn no credit',
          'lexical near-matches and unsupported paraphrases earn no credit',
          'surrounding prose is explicitly outside the claim',
        ],
        inputFingerprint: stableFingerprint(observed),
      },
      evidenceTier: 'rendered-exact-source-claim',
    });
  }
  const receiptRows = (Array.isArray(manifest?.sourceLedger) ? manifest.sourceLedger : [])
    .filter(isTrustedConceptLinkedSourceLedgerRow)
    .map((row) => ({ row, receipt: passedSupportReceipt(row) }))
    .filter((entry) => entry.receipt);
  const receiptBackedLessons = new Set();
  for (const { row } of receiptRows) for (const lesson of lessonNumbersForSource(row)) receiptBackedLessons.add(lesson);
  const checkedClaims = receiptRows.reduce((sum, entry) => sum + entry.receipt.checkedClaims, 0);
  const supportQuality =
    receiptRows.length > 0
      ? receiptRows.reduce((sum, entry) => sum + entry.receipt.minimumScore, 0) / receiptRows.length
      : 0;
  const observed = {
    protocol: 'source-extraction-receipt-coverage-v1',
    construct: 'source-extraction-traceability',
    downstreamClaimSupport: false,
    scoreEligible: false,
    disqualificationReason: 'rendered-claim-semantic-support-not-validated',
    receiptBackedLessons: receiptBackedLessons.size,
    verifiedClaims: checkedClaims,
    trustedConceptLinkedSources: receiptRows.length,
    lessons: lessonCount,
    groundingRatio: Number((lessonCount > 0 ? receiptBackedLessons.size / lessonCount : 0).toFixed(3)),
    extractionSupportQuality: Number(supportQuality.toFixed(3)),
    sourceCoverageRetained: receiptRows.length > 0,
  };
  return unobservedRule({
    ruleId: 'DPK.EVIDENCE.RENDERED_CLAIM_SUPPORT',
    constructId: 'evidenceGrounding',
    max: COMPONENT_WEIGHTS.evidenceGrounding,
    evidence: [evidenceRef('package.source-support-receipts', 'PACKAGE_MANIFEST.json', '/sourceLedger', observed)],
    predicate: {
      operator: 'rendered-claim-to-source-entailment',
      expected: 'independently validated semantic support for rendered instructional claims',
      actual: 'not implemented by this deterministic protocol',
    },
    reason:
      'Extraction receipts prove traceability only; they do not validate semantic support for rendered teaching claims.',
    action:
      'Run claim-to-source semantic verification and attach passage-level support receipts before treating grounding as observed.',
    recoverability: 'protocol-ineligible',
    evidenceTier: 'semantic-grounding-required',
    antiGaming: {
      controls: [
        'source count cannot earn semantic support',
        'pipeline prose is ignored',
        'internal refs alone earn no points',
      ],
      inputFingerprint: stableFingerprint(observed),
    },
  });
}

function textureRule(textureScore) {
  const measured = Number.isFinite(Number(textureScore));
  const observed = { textureScore: measured ? rounded(textureScore) : null };
  if (!measured) {
    return unobservedRule({
      ruleId: 'DPK.INSTRUCTION.TEXTURE',
      constructId: 'instructionalTexture',
      max: COMPONENT_WEIGHTS.instructionalTexture,
      evidence: [evidenceRef('grader.texture-score', 'SCORE_LEDGER.json', '/conformance/texture', observed)],
      predicate: {
        operator: 'texture-metric',
        expected: 'finite score from masked visible-unit analysis',
        actual: null,
      },
      reason: 'The texture metric did not produce a finite observation.',
      action: 'Re-run package grading and inspect the visible-unit texture receipt.',
      recoverability: 'author-recoverable',
      evidenceTier: 'deterministic-content',
      antiGaming: {
        controls: ['course and registry slot values are masked'],
        inputFingerprint: stableFingerprint(observed),
      },
    });
  }
  return evaluatedRule({
    ruleId: 'DPK.INSTRUCTION.TEXTURE',
    constructId: 'instructionalTexture',
    max: COMPONENT_WEIGHTS.instructionalTexture,
    componentScore: textureScore,
    evidence: [evidenceRef('grader.texture-score', 'SCORE_LEDGER.json', '/conformance/texture', observed)],
    predicate: { operator: 'proportional-texture-score', expected: 100, actual: rounded(textureScore) },
    reason: `Masked visible-unit texture scored ${rounded(textureScore)}/100.`,
    action:
      rounded(textureScore) >= 90
        ? 'Preserve the current cross-lesson variation and review the worst repeated units.'
        : 'Replace repeated instructional phrasing with lesson-specific facts, decisions, evidence, and task conditions.',
    antiGaming: {
      controls: [
        'course-title and registry-title slots are masked',
        'repeated shingles are measured across visible units',
      ],
      inputFingerprint: stableFingerprint(observed),
    },
    evidenceTier: 'deterministic-content',
  });
}

function assessmentRule(receipt) {
  const observed = receipt || { eligibleAssessments: 0, totalChecks: 0 };
  const ratio = Number(observed?.coherenceRatio);
  const eligible = Number(observed?.eligibleAssessments);
  const valid =
    observed?.protocol === 'rendered-assessment-coherence-v1' &&
    eligible > 0 &&
    Number(observed?.totalChecks) === eligible * 5 &&
    Number.isFinite(ratio) &&
    ratio >= 0 &&
    ratio <= 1;
  const evidence = [
    evidenceRef(
      'grader.assessment-coherence-checks',
      'SCORE_LEDGER.json',
      '/readiness/ledger/rules/DPK.ASSESSMENT.COHERENCE/evidence',
      observed,
    ),
  ];
  if (valid) {
    const failedChecks = Number(observed.totalChecks) - Number(observed.passedChecks);
    return evaluatedRule({
      ruleId: 'DPK.ASSESSMENT.COHERENCE',
      constructId: 'assessmentCoherence',
      max: COMPONENT_WEIGHTS.assessmentCoherence,
      componentScore: ratio * 100,
      points: assessmentCoherencePoints(COMPONENT_WEIGHTS.assessmentCoherence, observed),
      evidence,
      predicate: {
        operator: 'rendered-objective-task-evidence-rubric-linkage',
        expected: { checksPerAssessment: 5, renderedTaskAndRubricBytes: true, exactObjectiveVisibility: true },
        actual: observed,
      },
      reason: `${observed.passedChecks}/${observed.totalChecks} rendered assessment-link checks passed across ${eligible} graded assessment${eligible === 1 ? '' : 's'}.`,
      action:
        failedChecks === 0
          ? 'Preserve the visible objective, task, student-evidence, and rubric chain when revising assessments.'
          : `Repair the ${failedChecks} failed task/rubric linkage check${failedChecks === 1 ? '' : 's'} named in the receipt, then re-export and regrade.`,
      antiGaming: {
        controls: [
          'only independently extracted Office text is evaluated',
          'every graded assessment contributes exactly five checks',
          'missing or wrong-lesson files fail rather than leave the denominator',
          'broad substance and consistency scores are not reused',
        ],
        inputFingerprint: stableFingerprint(observed),
      },
      evidenceTier: 'deterministic-rendered-assessment',
    });
  }
  return unobservedRule({
    ruleId: 'DPK.ASSESSMENT.COHERENCE',
    constructId: 'assessmentCoherence',
    max: COMPONENT_WEIGHTS.assessmentCoherence,
    evidence,
    predicate: {
      operator: 'assessment-objective-rubric-coherence',
      expected: 'assessment-specific checks with objective and rubric linkage',
      actual: 'no eligible rendered assessment receipt',
    },
    reason:
      'The current grader does not isolate assessment-specific coherence evidence, so broad conformance scores are not reused here.',
    action: 'Add assessment-specific objective, task, evidence, and rubric-link checks before enabling these points.',
    recoverability: 'protocol-ineligible',
    evidenceTier: 'deterministic-assessment-checks-required',
    antiGaming: {
      controls: ['broad substance score cannot be counted twice', 'broad consistency score cannot be counted twice'],
      inputFingerprint: stableFingerprint(observed),
    },
  });
}

function integrityRule(conformance) {
  const scores = conformance?.scores || {};
  const observed = {
    structure: Number.isFinite(Number(scores.structure)) ? rounded(scores.structure) : null,
    format: Number.isFinite(Number(scores.format)) ? rounded(scores.format) : null,
    identity: Number.isFinite(Number(scores.identity)) ? rounded(scores.identity) : null,
  };
  const complete = Object.values(observed).every(Number.isFinite);
  const evidence = [
    evidenceRef(
      'grader.structure-conformance',
      'SCORE_LEDGER.json',
      '/conformance/dimensions/structure',
      observed.structure,
    ),
    evidenceRef('grader.format-conformance', 'SCORE_LEDGER.json', '/conformance/dimensions/format', observed.format),
    evidenceRef(
      'grader.identity-conformance',
      'SCORE_LEDGER.json',
      '/conformance/dimensions/identity',
      observed.identity,
    ),
  ];
  if (!complete) {
    return unobservedRule({
      ruleId: 'DPK.PACKAGE.INTEGRITY',
      constructId: 'packageIntegrity',
      max: COMPONENT_WEIGHTS.packageIntegrity,
      evidence,
      predicate: {
        operator: 'weighted-structural-conformance',
        expected: 'three finite dimension scores',
        actual: observed,
      },
      reason: 'Structure, format, and identity evidence was incomplete.',
      action: 'Re-run package grading until all three integrity dimensions are observed.',
      recoverability: 'author-recoverable',
      evidenceTier: 'deterministic-structural',
      antiGaming: { controls: ['overall conformance is not reused'], inputFingerprint: stableFingerprint(observed) },
    });
  }
  const componentScore = observed.structure * 0.45 + observed.format * 0.3 + observed.identity * 0.25;
  return evaluatedRule({
    ruleId: 'DPK.PACKAGE.INTEGRITY',
    constructId: 'packageIntegrity',
    max: COMPONENT_WEIGHTS.packageIntegrity,
    componentScore,
    evidence,
    predicate: {
      operator: 'weighted-structural-conformance',
      expected: { structure: 100, format: 100, identity: 100 },
      actual: observed,
    },
    reason: `Structure ${observed.structure}/100, format ${observed.format}/100, and identity ${observed.identity}/100 produced the declared integrity result.`,
    action:
      componentScore >= 90
        ? 'Preserve package structure and inspect any remaining integrity deductions in the conformance ledger.'
        : 'Resolve structure, format, and identity findings listed in the conformance ledger, then regrade.',
    antiGaming: {
      controls: ['overall conformance is not reused', 'only structure, format, and identity own these points'],
      inputFingerprint: stableFingerprint(observed),
    },
    evidencePolarity: 'negative-evidence-only',
  });
}

export function computeAutomatedReadinessSignal({
  manifest = {},
  course = {},
  lessonTitles = [],
  conformance = {},
  texture = {},
  assessment = null,
} = {}) {
  const titles = (Array.isArray(lessonTitles) ? lessonTitles : [])
    .map((title) => String(title || '').trim())
    .filter(Boolean);
  const rules = [
    curriculumRule(manifest, course, titles),
    groundingRule(manifest, titles.length),
    textureRule(texture?.score),
    assessmentRule(assessment),
    integrityRule(conformance),
  ];
  const points = recomputeAutomatedEvidenceLedger(rules);
  const evidenceSummary = deriveAutomatedEvidenceSummary(rules);
  if (points.potential !== 100)
    throw new Error(`Automated evidence ledger potential must be 100, received ${points.potential}`);
  const components = Object.fromEntries(
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
        action: rule.action.instruction,
        evidence: Object.fromEntries(rule.evidence.map((entry) => [entry.evidenceId, entry.observed])),
        ruleId: rule.ruleId,
      },
    ]),
  );

  return {
    protocol: AUTOMATED_READINESS_PROTOCOL,
    evidenceClass: 'deterministic',
    validationTier: 'deterministic-package-evidence',
    construct: 'deterministic-package-evidence',
    score: points.earned,
    maxScore: 100,
    potentialPoints: 100,
    attainableMaxScore: evidenceSummary.evaluatedCoverage,
    evidenceCeiling: evidenceSummary.evaluatedCoverage,
    evaluatedCoverage: evidenceSummary.evaluatedCoverage,
    positiveValidationCoverage: evidenceSummary.positiveValidationCoverage,
    positiveValidationEarned: evidenceSummary.positiveValidationEarned,
    positiveValidationLost: evidenceSummary.positiveValidationLost,
    negativeEvidenceCoverage: evidenceSummary.negativeEvidenceCoverage,
    negativeEvidenceEarned: evidenceSummary.negativeEvidenceEarned,
    negativeEvidenceLost: evidenceSummary.negativeEvidenceLost,
    rawScore: points.earned,
    band: deriveAutomatedEvidenceBand(evidenceSummary, points),
    points,
    claimBoundary: AUTOMATED_READINESS_CLAIM_BOUNDARY,
    reconstructionDisclosure: reconstructionDisclosure(manifest),
    ledger: {
      protocol: AUTOMATED_READINESS_PROTOCOL,
      ruleVersion: AUTOMATED_EVIDENCE_RULE_VERSION,
      points,
      rules,
    },
    components,
  };
}

export { computeAutomatedReadinessSignal as score };
