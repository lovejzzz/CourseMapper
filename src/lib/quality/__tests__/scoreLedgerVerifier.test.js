import { describe, expect, it } from 'vitest';
import { computeAutomatedReadinessSignal } from '../automatedReadinessSignal.js';
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
  const encodedDefectConformance = {
    protocol: 'coursemapper-encoded-defect-conformance-ledger-v1',
    graderVersion: '1.15.0',
    dimensions: {
      structure: {
        status: 'negative-evidence-only',
        weight: 1,
        points: { potential: 100, earned: 100, lost: 0, unobserved: 0 },
        deductions: [],
      },
      texture: {
        status: 'evaluated-metric',
        weight: 1,
        points: { potential: 100, earned: 90, lost: 10, unobserved: 0 },
        deductions: [{ ruleId: 'texture', before: 100, after: 90, effectivePointsLost: 10 }],
      },
    },
    overall: { score: 95, adjustments: [] },
  };
  return {
    gradingScope,
    evidenceArtifacts,
    quality: { score: 95, readiness },
    ledger: {
      protocol: 'coursemapper-score-ledger-v1',
      deterministicPackageEvidence: readiness.ledger,
      encodedDefectConformance,
      bindings: { gradingScope, evidenceArtifacts },
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

  it('distinguishes stale grader scope from unverifiable legacy data', async () => {
    const value = fixture();
    expect((await verifyScoreLedger({ ...value, currentGraderVersion: '1.16.0' })).status).toBe(
      'stale-regrade-required',
    );
    expect((await verifyScoreLedger({ ledger: null })).status).toBe('unverifiable-legacy');
  });
});
