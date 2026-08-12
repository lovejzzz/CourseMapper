import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { evaluateVerifiedCoherentDraftV1 } from '../lib/verifiedCoherentDraftV1.mjs';

const policy = JSON.parse(
  fs.readFileSync(path.resolve('evaluation/output-quality/verified-coherent-draft-v1.policy.json'), 'utf8'),
);
const HASH = 'a'.repeat(64);

function passingRun(id, disciplineClass, lessonScope, inputCondition, externallySuppliedCourse = false) {
  return {
    id,
    disciplineClass,
    lessonScope,
    inputCondition,
    externallySuppliedCourse,
    visualAnalysisRequiredLessons: disciplineClass === 'visual' ? [1, 2, 3, 4, 5] : [],
    fresh: true,
    preregisteredAt: '2026-08-04T17:00:00.000Z',
    generatedAt: '2026-08-04T18:00:00.000Z',
    hashBindings: [
      ...policy.perRun.requiredHashBindings.map((type) => ({ type, sha256: HASH })),
      ...(disciplineClass === 'visual' ? [{ type: 'functional-visual-audit', sha256: HASH }] : []),
    ],
    promotionEvidence: {
      protocol: 'coursemapper-verified-coherent-draft-derived-evidence-v1',
      receiptSha256: HASH,
      packageSha256: HASH,
      derivationIssues: [],
      claimReviewReceiptSha256: HASH,
      benchmarkReviewReceiptSha256: HASH,
    },
    artifactFamilies: policy.perRun.requiredArtifactFamilies.map((familyId) => ({
      id: familyId,
      openable: true,
      sha256: HASH,
    })),
    findings: { p0: 0, p1: 0 },
    conformanceScore: 94,
    formatScore: 100,
    postDraftAdmission: {
      protocol: policy.perRun.postDraftAdmissionProtocol,
      passed: true,
      promotionEligible: true,
      receiptSha256: HASH,
      sourceGroundedLessonCount: lessonScope,
    },
    claimVerification: Object.fromEntries([
      ...policy.perRun.verifyAllClaimCategories.map((category) => [
        category,
        { applicabilityStatus: 'applicable', total: 2, verified: 2 },
      ]),
      ['stratifiedFactualClaims', { total: 10, verified: 10 }],
    ]),
    renderAudit: {
      protocol: policy.perRun.renderAuditProtocol,
      passed: true,
      receiptSha256: HASH,
      fileSha256: HASH,
      evidenceBundleSha256: HASH,
      childReceiptCount: 10,
      renderedRasterCount: 10,
    },
    accessibilityAudit: {
      protocol: policy.perRun.accessibilityAuditProtocol,
      passed: true,
      receiptSha256: HASH,
      fileSha256: HASH,
      evidenceType: 'structural-static',
      certification: false,
    },
    functionalVisuals: {
      protocol: policy.perRun.functionalVisualAuditProtocol,
      passed: true,
      receiptSha256: HASH,
      fileSha256: HASH,
      requiredLessons: disciplineClass === 'visual' ? 5 : 0,
      requiredLessonNumbers: disciplineClass === 'visual' ? [1, 2, 3, 4, 5] : [],
      functionalLessons: disciplineClass === 'visual' ? 4 : 0,
    },
    operationQualifiedEvidence:
      disciplineClass === 'quantitative-procedural'
        ? {
            protocol: policy.perRun.operationQualifiedEvidenceProtocol,
            summary: { status: 'passed', demandedLessonCount: 3, completeLessonCount: 3 },
          }
        : null,
    qualityBenchmark: {
      rubricVersion: '1.0.0',
      evidenceTier: 'model-provisional',
      reportedScore: 77,
      coverage: 0.96,
      dimensions: {
        'instructional-alignment': 76,
        'accuracy-source-fidelity': 76,
        'assessment-feedback': 78,
        'teaching-learning-usability': 77,
        'student-clarity-support': 76,
        'inclusion-accessibility': 75,
        'integrity-safety-rights': 80,
        'cross-artifact-coherence': 75,
        'professional-craft': 76,
      },
      reviewOrders: ['forward', 'reverse'],
      criticalFailures: [],
    },
  };
}

function campaign() {
  return {
    protocol: 'coursemapper-verified-coherent-draft-v1',
    runs: [
      passingRun('visual-5', 'visual', 5, 'prompt-only'),
      passingRun('quant-8', 'quantitative-procedural', 8, 'attached-source', true),
      passingRun('language-14', 'text-language', 14, 'prompt-only'),
    ],
  };
}

describe('Verified Coherent Draft v1 promotion contract', () => {
  it('earns the checkpoint only when all three independently pass', () => {
    const result = evaluateVerifiedCoherentDraftV1(campaign(), policy);
    expect(result).toMatchObject({ earned: true, status: 'earned' });
    expect(result.runResults.every((run) => run.passed)).toBe(true);
    expect(result.texture.status).toBe('advisory');
  });

  it('refuses a campaign missing external evidence and order-reversed review', () => {
    const input = campaign();
    input.runs.forEach((run) => {
      run.externallySuppliedCourse = false;
    });
    input.runs[2].qualityBenchmark.reviewOrders = ['forward'];
    const result = evaluateVerifiedCoherentDraftV1(input, policy);
    expect(result.earned).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('missing externally supplied course'),
        expect.stringContaining('order-reversed model reviews'),
      ]),
    );
  });

  it('does not average a weak package into a passing campaign', () => {
    const input = campaign();
    input.runs[1].qualityBenchmark.reportedScore = 74;
    const result = evaluateVerifiedCoherentDraftV1(input, policy);
    expect(result.earned).toBe(false);
    expect(result.runResults.find((run) => run.id === 'quant-8').passed).toBe(false);
  });

  it('does not punish an honestly supported score above the provisional target band', () => {
    const input = campaign();
    input.runs[0].qualityBenchmark.reportedScore = 84;
    expect(evaluateVerifiedCoherentDraftV1(input, policy).earned).toBe(true);
  });

  it('fails closed when a reviewer omits a required rubric dimension', () => {
    const input = campaign();
    delete input.runs[2].qualityBenchmark.dimensions['student-clarity-support'];
    const result = evaluateVerifiedCoherentDraftV1(input, policy);
    expect(result.earned).toBe(false);
    expect(result.runResults[2].issues).toContainEqual(
      expect.stringContaining('required benchmark dimension student-clarity-support'),
    );
  });

  it('withholds a quantitative run whose Apply/Calculate lessons lack executable evidence', () => {
    const input = campaign();
    input.runs[1].operationQualifiedEvidence.summary.completeLessonCount = 2;
    const result = evaluateVerifiedCoherentDraftV1(input, policy);
    expect(result.earned).toBe(false);
    expect(result.runResults[1].issues).toContainEqual(
      expect.stringContaining('operation-qualified quantitative evidence'),
    );
  });

  it('cannot waive preregistered visual lessons by omitting functional receipt counts', () => {
    const input = campaign();
    input.runs[0].functionalVisuals = {
      protocol: policy.perRun.functionalVisualAuditProtocol,
      passed: true,
      receiptSha256: HASH,
      requiredLessons: 0,
      requiredLessonNumbers: [],
      functionalLessons: 0,
    };
    const result = evaluateVerifiedCoherentDraftV1(input, policy);
    expect(result.earned).toBe(false);
    expect(result.runResults[0].issues).toEqual(
      expect.arrayContaining([expect.stringContaining('preregistered visual-analysis lessons')]),
    );
  });

  it('rejects caller-authored passing counts without derived promotion evidence', () => {
    const input = campaign();
    delete input.runs[0].promotionEvidence;
    const result = evaluateVerifiedCoherentDraftV1(input, policy);
    expect(result.earned).toBe(false);
    expect(result.runResults[0].issues).toEqual(
      expect.arrayContaining([expect.stringContaining('package-bound builder')]),
    );
  });
});
