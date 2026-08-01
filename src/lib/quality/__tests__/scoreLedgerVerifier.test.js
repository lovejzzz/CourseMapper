import { describe, expect, it } from 'vitest';
import { computeAutomatedReadinessSignal } from '../automatedReadinessSignal.js';
import {
  buildEncodedDefectConformanceLedger,
  ENCODED_DEFECT_CONFORMANCE_DIMENSION_WEIGHTS,
} from '../conformanceScoreLedger.js';
import { grade, GRADER_VERSION } from '../deepQualityGrader.js';
import { createMemoryFileProvider } from '../fileProviders.js';
import { verifyScoreLedger } from '../scoreLedgerVerifier.js';

function fixture() {
  const readiness = computeAutomatedReadinessSignal({
    course: { prompt: 'Use this exact lesson sequence: 1) Evidence; 2) Decision.' },
    lessonTitles: ['Evidence', 'Decision'],
    conformance: { scores: { structure: 100, format: 100, identity: 100 } },
    texture: { score: 90 },
  });
  const gradingScope = { algorithm: 'scope-v1', sha256: 'scope-hash' };
  const evidenceArtifacts = { algorithm: 'artifacts-v1', rootSha256: 'artifact-root' };
  const dimensions = Object.fromEntries(
    Object.entries(ENCODED_DEFECT_CONFORMANCE_DIMENSION_WEIGHTS).map(([dimension, weight]) => {
      const earned = dimension === 'texture' ? 90 : 100;
      return [
        dimension,
        {
          constructId: `encodedDefectConformance.${dimension}`,
          status: dimension === 'texture' ? 'evaluated-metric' : 'negative-evidence-only',
          weight,
          points: { potential: 100, earned, lost: 100 - earned, unobserved: 0 },
          coverage:
            dimension === 'texture'
              ? { mode: 'positive-and-negative-metric', positiveValidation: true }
              : { mode: 'negative-evidence-only', positiveValidation: false, encodedFindings: 0 },
          deductions:
            dimension === 'texture'
              ? [
                  {
                    ruleId: 'DQC.TEXTURE.VISIBLE_UNIT_METRIC',
                    ruleVersion: '1.15.0',
                    type: 'metric-result',
                    predicate: { operator: 'texture-score', expected: 100, actual: earned },
                    before: 100,
                    after: earned,
                    effectivePointsLost: 100 - earned,
                  },
                ]
              : [],
        },
      ];
    }),
  );
  const totalWeight = Object.values(ENCODED_DEFECT_CONFORMANCE_DIMENSION_WEIGHTS).reduce(
    (sum, weight) => sum + weight,
    0,
  );
  const weightedExact =
    Object.entries(dimensions).reduce((sum, [, row]) => sum + row.points.earned * row.weight, 0) / totalWeight;
  const conformanceScore = Math.round(weightedExact);
  const encodedDefectConformance = {
    protocol: 'coursemapper-encoded-defect-conformance-ledger-v1',
    graderVersion: '1.15.0',
    construct: 'encoded-package-defect-conformance',
    dimensions,
    overall: {
      totalWeight,
      weightedExact: Number(weightedExact.toFixed(6)),
      beforeAdjustments: conformanceScore,
      score: conformanceScore,
      adjustments: [],
    },
  };
  return {
    gradingScope,
    evidenceArtifacts,
    quality: {
      score: conformanceScore,
      grade: conformanceScore >= 90 ? 'A' : 'B',
      findingCounts: { p0: 0, p1: 0, p2: 0 },
      dimensions: Object.fromEntries(
        Object.entries(dimensions).map(([dimension, row]) => [dimension, row.points.earned]),
      ),
      readiness,
    },
    ledger: {
      protocol: 'coursemapper-score-ledger-v1',
      deterministicPackageEvidence: readiness.ledger,
      encodedDefectConformance,
      bindings: { gradingScope, evidenceArtifacts },
    },
  };
}

function fixtureWithIdentityFinding() {
  const value = fixture();
  const finding = {
    id: 'identity-p1-1',
    ruleId: 'DQC.IDENTITY.EXAMPLE',
    ruleVersion: '1.15.0',
    dimension: 'identity',
    severity: 'P1',
    pointsLost: 8,
    evidenceTier: 'deterministic-text-pattern',
    reason: 'A reproduced identity defect is present.',
    action: 'Repair the identity defect and regrade.',
    file: 'Assignment Briefs/Lesson 01.docx',
    evidence: 'forged identity',
  };
  const dimensions = { ...value.quality.dimensions, identity: 92 };
  const readiness = computeAutomatedReadinessSignal({
    course: { prompt: 'Use this exact lesson sequence: 1) Evidence; 2) Decision.' },
    lessonTitles: ['Evidence', 'Decision'],
    conformance: { scores: dimensions },
    texture: { score: 90 },
  });
  const conformance = buildEncodedDefectConformanceLedger({
    scores: dimensions,
    findings: [finding],
    texture: { score: 90, evidence: null },
    stats: { p0: 0, p1: 1, p2: 0 },
    dimensionWeights: ENCODED_DEFECT_CONFORMANCE_DIMENSION_WEIGHTS,
    graderVersion: '1.15.0',
  });
  return {
    ...value,
    findings: [finding],
    quality: {
      score: conformance.overall.score,
      grade: 'B',
      findingCounts: { p0: 0, p1: 1, p2: 0 },
      dimensions,
      readiness,
    },
    ledger: {
      ...value.ledger,
      deterministicPackageEvidence: readiness.ledger,
      encodedDefectConformance: conformance,
    },
  };
}

describe('score ledger verification', () => {
  it('produces an immutable projection only after replaying both ledgers', async () => {
    const value = fixture();
    const result = await verifyScoreLedger({ ...value, currentGraderVersion: '1.15.0' });
    expect(result.status).toBe('verified');
    expect(result.projection.deterministicPackageEvidence.earned).toBe(value.quality.readiness.score);
    expect(Object.isFrozen(result.projection)).toBe(true);
  });

  it('rejects tampered point arithmetic and artifact roots', async () => {
    const tamperedPoints = fixture();
    tamperedPoints.ledger.deterministicPackageEvidence.rules[0].points.earned += 1;
    expect((await verifyScoreLedger({ ...tamperedPoints, currentGraderVersion: '1.15.0' })).status).toBe('invalid');

    const tamperedArtifacts = fixture();
    expect(
      (
        await verifyScoreLedger({
          ...tamperedArtifacts,
          currentGraderVersion: '1.15.0',
          evidenceArtifacts: { ...tamperedArtifacts.evidenceArtifacts, rootSha256: 'changed' },
        })
      ).status,
    ).toBe('invalid');
  });

  it('rejects forged bands, ceilings, decomposition, and evidence polarity', async () => {
    for (const [field, value] of [
      ['band', 'strong-positive-deterministic-evidence'],
      ['attainableMaxScore', 100],
      ['evidenceCeiling', 100],
      ['positiveValidationEarned', 59],
      ['negativeEvidenceEarned', 0],
    ]) {
      const tampered = fixture();
      tampered.quality.readiness[field] = value;
      expect((await verifyScoreLedger({ ...tampered, currentGraderVersion: '1.15.0' })).status).toBe('invalid');
    }

    const polarityTamper = fixture();
    const integrityRule = polarityTamper.ledger.deterministicPackageEvidence.rules.find(
      (rule) => rule.ruleId === 'DPK.PACKAGE.INTEGRITY',
    );
    integrityRule.evidencePolarity = 'positive-metric';
    expect((await verifyScoreLedger({ ...polarityTamper, currentGraderVersion: '1.15.0' })).status).toBe('invalid');
  });

  it('rejects a balanced attempt to promote unobserved grounding into scored evidence', async () => {
    const tampered = fixture();
    const grounding = tampered.ledger.deterministicPackageEvidence.rules.find(
      (rule) => rule.ruleId === 'DPK.EVIDENCE.RENDERED_CLAIM_SUPPORT',
    );
    grounding.status = 'evaluated';
    grounding.evidencePolarity = 'positive-metric';
    grounding.points = { max: 25, earned: 25, lost: 0, unobserved: 0 };
    tampered.ledger.deterministicPackageEvidence.points.earned += 25;
    tampered.ledger.deterministicPackageEvidence.points.unobserved -= 25;
    tampered.quality.readiness.score += 25;
    tampered.quality.readiness.points.earned += 25;
    tampered.quality.readiness.points.unobserved -= 25;
    tampered.quality.readiness.evaluatedCoverage += 25;
    tampered.quality.readiness.attainableMaxScore += 25;
    tampered.quality.readiness.evidenceCeiling += 25;
    expect((await verifyScoreLedger({ ...tampered, currentGraderVersion: '1.15.0' })).status).toBe('invalid');
  });

  it('replays rule earnings and the displayed component projection', async () => {
    const forgedEarnings = fixture();
    const curriculum = forgedEarnings.ledger.deterministicPackageEvidence.rules.find(
      (rule) => rule.ruleId === 'DPK.CURRICULUM.ORDERED_SEQUENCE',
    );
    curriculum.points.earned -= 1;
    curriculum.points.lost += 1;
    expect((await verifyScoreLedger({ ...forgedEarnings, currentGraderVersion: '1.15.0' })).status).toBe('invalid');

    const forgedComponent = fixture();
    forgedComponent.quality.readiness.components.evidenceGrounding.status = 'evaluated';
    forgedComponent.quality.readiness.components.evidenceGrounding.score = 100;
    expect((await verifyScoreLedger({ ...forgedComponent, currentGraderVersion: '1.15.0' })).status).toBe('invalid');
  });

  it('rejects dropped, reweighted, unknown, and predicate-forged rule schemas', async () => {
    const dropped = fixture();
    dropped.ledger.deterministicPackageEvidence.rules.pop();
    expect((await verifyScoreLedger({ ...dropped, currentGraderVersion: '1.15.0' })).status).toBe('invalid');

    const reweighted = fixture();
    reweighted.ledger.deterministicPackageEvidence.rules[0].points.max = 50;
    expect((await verifyScoreLedger({ ...reweighted, currentGraderVersion: '1.15.0' })).status).toBe('invalid');

    const unknown = fixture();
    unknown.ledger.deterministicPackageEvidence.rules[1].ruleId = 'DPK.UNKNOWN.UNOBSERVED';
    expect((await verifyScoreLedger({ ...unknown, currentGraderVersion: '1.15.0' })).status).toBe('invalid');

    const forgedPredicate = fixture();
    forgedPredicate.ledger.deterministicPackageEvidence.rules[0].predicate.actual.orderedMatched = 0;
    expect((await verifyScoreLedger({ ...forgedPredicate, currentGraderVersion: '1.15.0' })).status).toBe('invalid');

    const demotedIntegrity = fixture();
    const integrity = demotedIntegrity.ledger.deterministicPackageEvidence.rules.find(
      (rule) => rule.ruleId === 'DPK.PACKAGE.INTEGRITY',
    );
    integrity.status = 'unobserved';
    integrity.evidencePolarity = 'unobserved';
    integrity.points = { max: 15, earned: 0, lost: 0, unobserved: 15 };
    expect((await verifyScoreLedger({ ...demotedIntegrity, currentGraderVersion: '1.15.0' })).status).toBe('invalid');
  });

  it('pins the encoded-conformance dimension schema and metric replay', async () => {
    const droppedDimension = fixture();
    delete droppedDimension.ledger.encodedDefectConformance.dimensions.format;
    expect((await verifyScoreLedger({ ...droppedDimension, currentGraderVersion: '1.15.0' })).status).toBe('invalid');

    const reweightedDimension = fixture();
    reweightedDimension.ledger.encodedDefectConformance.dimensions.texture.weight = 100;
    expect((await verifyScoreLedger({ ...reweightedDimension, currentGraderVersion: '1.15.0' })).status).toBe(
      'invalid',
    );

    const forgedMetric = fixture();
    forgedMetric.ledger.encodedDefectConformance.dimensions.texture.deductions[0].predicate.actual = 100;
    expect((await verifyScoreLedger({ ...forgedMetric, currentGraderVersion: '1.15.0' })).status).toBe('invalid');

    const forgedDimensionDisplay = fixture();
    forgedDimensionDisplay.quality.dimensions.texture = 100;
    expect((await verifyScoreLedger({ ...forgedDimensionDisplay, currentGraderVersion: '1.15.0' })).status).toBe(
      'invalid',
    );

    const forgedGrade = fixture();
    forgedGrade.quality.grade = 'F';
    expect((await verifyScoreLedger({ ...forgedGrade, currentGraderVersion: '1.15.0' })).status).toBe('invalid');
  });

  it('rejects negative deductions and finding-count divergence', async () => {
    const negativeDeduction = fixture();
    const identity = negativeDeduction.ledger.encodedDefectConformance.dimensions.identity;
    identity.deductions = [
      {
        ruleId: 'DQC.FORGED.BONUS',
        ruleVersion: '1.15.0',
        findingId: 'forged-bonus',
        type: 'encoded-defect-deduction',
        predicate: { operator: 'finding-present', expected: false, actual: true },
        before: 100,
        after: 110,
        nominalPointsLost: -10,
        effectivePointsLost: -10,
        severity: 'P2',
      },
    ];
    identity.coverage = { mode: 'negative-evidence-only', positiveValidation: false, encodedFindings: 1 };
    identity.points = { potential: 100, earned: 110, lost: -10, unobserved: 0 };
    expect((await verifyScoreLedger({ ...negativeDeduction, currentGraderVersion: '1.15.0' })).status).toBe('invalid');

    const forgedCounts = fixture();
    forgedCounts.quality.findingCounts.p1 = 1;
    expect((await verifyScoreLedger({ ...forgedCounts, currentGraderVersion: '1.15.0' })).status).toBe('invalid');
  });

  it('requires every encoded deduction to match an independent canonical finding', async () => {
    const value = fixtureWithIdentityFinding();
    expect((await verifyScoreLedger({ ...value, currentGraderVersion: '1.15.0' })).status).toBe('verified');

    const removedFindingDeduction = structuredClone(value);
    const identity = removedFindingDeduction.ledger.encodedDefectConformance.dimensions.identity;
    identity.deductions = [];
    identity.coverage.encodedFindings = 0;
    expect((await verifyScoreLedger({ ...removedFindingDeduction, currentGraderVersion: '1.15.0' })).status).toBe(
      'invalid',
    );
  });

  it('self-verifies a real grader result containing a texture finding', async () => {
    const assignmentPath = 'Assignment Briefs/Lesson 02 - Meiosis and Gamete Formation - Assignment Briefs.txt';
    const repeatedTitle = 'Meiosis and Gamete Formation';
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          lessonScope: [2],
          readiness: { status: 'ready', blockers: 0 },
          files: [{ path: assignmentPath, featureId: 'assignments' }],
        }),
        [assignmentPath]: [
          'Course Map L2',
          ...Array.from({ length: 10 }, (_, index) => `${repeatedTitle} instruction ${index + 1} uses evidence.`),
        ].join('\n'),
      }),
      course: { title: 'Introduction to Genetics', featureIds: ['assignments'] },
      honesty: { pipeline: { judgment: 'compiler-verified fixture' } },
    });
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ dimension: 'texture', severity: 'P2' }),
        expect.objectContaining({ dimension: 'texture', severity: 'P1' }),
      ]),
    );
    expect(result.texture.score).toBeLessThan(60);

    const verified = await verifyScoreLedger({
      ledger: result.scoreLedger,
      quality: {
        score: result.overall.score,
        grade: result.overall.grade,
        findingCounts: { p0: result.stats.p0, p1: result.stats.p1, p2: result.stats.p2 },
        dimensions: result.scores,
        readiness: result.readiness,
        texture: { score: result.texture.score },
      },
      findings: result.findings,
      currentGraderVersion: GRADER_VERSION,
    });
    expect(verified.status, verified.reason).toBe('verified');
  });

  it('distinguishes stale grader scope from unverifiable legacy data', async () => {
    const value = fixture();
    expect((await verifyScoreLedger({ ...value, currentGraderVersion: '1.16.0' })).status).toBe(
      'stale-regrade-required',
    );
    expect((await verifyScoreLedger({ ledger: null })).status).toBe('unverifiable-legacy');
  });
});
