import { describe, expect, it } from 'vitest';

import {
  PR_CONTRACT_SAMPLE_IDS,
  selectContractSamples,
  selectImpactedContractSampleIds,
} from '../contractQualityAudit.mjs';
import { buildIndependentBenchmarkSummary, evaluateBenchmarkCase } from '../independentBenchmarkAudit.mjs';
import { buildProductionCanarySummary, evaluateCanaryRun } from '../productionCanaryAudit.mjs';
import { buildEvaluationSystemSummary } from '../evaluationSystemAudit.mjs';

const SHA = 'a'.repeat(64);
const DIMENSIONS = [
  'instructional-alignment',
  'teachability',
  'assessment-authenticity',
  'feedback-and-revision',
  'student-readiness',
  'source-fidelity',
];

const benchmarkPolicy = {
  targetCases: 8,
  minimumCompletedCases: 6,
  minimumUsableRate: 0.8,
  minimumModalities: 4,
  requiredScopes: [5, 8, 14],
  maximumMedianEditMinutesPerLesson: 15,
  maximumDimensionSpread: 1.5,
  dimensions: DIMENSIONS,
};

function review(reviewerId, overrides = {}) {
  return {
    caseId: 'case-1',
    reviewerId,
    reviewerRole: 'external-instructor',
    independent: true,
    conflictOfInterest: false,
    reviewedAt: '2026-07-10',
    reviewedPackageVersion: '0.16.1',
    sourceSha256: SHA,
    packageSha256: SHA,
    wouldTeach: true,
    minimalEditVerdict: 'minor-edits',
    estimatedEditMinutes: 60,
    requiredEdits: [
      {
        artifact: 'Lesson plan',
        location: 'Lesson 3',
        change: 'Clarify the student submission sequence.',
        reason: 'The current sequence leaves the handoff ambiguous.',
      },
    ],
    dimensionScores: Object.fromEntries(
      DIMENSIONS.map((dimension) => [
        dimension,
        { score: 4, evidence: `Concrete classroom evidence for ${dimension} and the reviewed materials.` },
      ]),
    ),
    ...overrides,
  };
}

function benchmarkCase(overrides = {}) {
  return {
    id: 'case-1',
    title: 'Case 1',
    scope: 8,
    modality: 'studio',
    status: 'reviewed',
    source: { available: true, observedSha256: SHA, hashMatches: true },
    package: { available: true, observedSha256: SHA, hashMatches: true, appVersion: '0.16.1' },
    ...overrides,
  };
}

const canaryPolicy = {
  maximumAgeDays: 45,
  minimumCompletedRuns: 3,
  minimumDomains: 2,
  requiredProviderFamilies: ['public-scion'],
  minimumQualityScore: 85,
  maximumP0Findings: 0,
  maximumP1Findings: 0,
  maximumDuplicateTopics: 0,
  minimumSuccessfulRequests: 1,
  minimumPackageFiles: 10,
};

function canaryRun(id, domain = 'studio') {
  return {
    runId: id,
    generatedAt: '2026-07-09T12:00:00.000Z',
    course: { domain, lessonCount: 8 },
    provider: { family: 'public-scion', mode: 'live', simulated: false },
    requests: { total: 2, successful: 2, httpStatuses: [200, 200] },
    generation: { lessonsProduced: 8, duplicateTopics: 0 },
    package: { sha256: SHA, fileCount: 30, officeStructuralValidation: 'pass' },
    quality: { score: 92, p0: 0, p1: 0 },
    evidence: {
      traceSha256: SHA,
      consoleLogSha256: SHA,
      retention: { status: 'retained' },
      visualQa: { status: 'pass', reviewedAt: '2026-07-10T12:00:00.000Z' },
      artifactValidation: { allMatch: true },
    },
  };
}

function tier(status, extra = {}) {
  return { summary: { status, ...extra } };
}

describe('layered evaluation system', () => {
  it('uses a 12-case PR baseline spanning short, standard, and semester scopes', () => {
    const selected = selectContractSamples({ profile: 'pr' });
    expect(selected).toHaveLength(12);
    expect(selected.map((sample) => sample.id)).toEqual(PR_CONTRACT_SAMPLE_IDS);
    expect(new Set(selected.map((sample) => sample.scope))).toEqual(new Set([5, 8, 14]));
  });

  it('expands contract coverage from impacted compiler surfaces', () => {
    const impacted = selectImpactedContractSampleIds(['src/lib/courseBlueprintCompiler.js']);
    expect(impacted).toContain('gold-programming-lab-8');
    expect(
      selectContractSamples({ profile: 'pr', changedFiles: ['src/lib/courseBlueprintCompiler.js'] }).length,
    ).toBeGreaterThan(12);
    expect(selectImpactedContractSampleIds(['scripts/contractQualityAudit.mjs'])).toHaveLength(40);
  });

  it('accepts a retained package only after two valid independent instructors agree it is usable', () => {
    const result = evaluateBenchmarkCase(
      benchmarkCase(),
      [review('faculty-alpha'), review('faculty-beta')],
      benchmarkPolicy,
    );
    expect(result).toMatchObject({
      sourceReady: true,
      packageReady: true,
      complete: true,
      agreementPass: true,
      usable: true,
      validReviewCount: 2,
    });
  });

  it('does not count reviews when the exact package is not retained', () => {
    const result = evaluateBenchmarkCase(
      benchmarkCase({ package: { available: false, observedSha256: '', hashMatches: null } }),
      [review('faculty-alpha'), review('faculty-beta')],
      benchmarkPolicy,
    );
    expect(result).toMatchObject({ packageReady: false, complete: false, usable: false });
  });

  it('marks completed instructor evidence unusable when one instructor requires major edits', () => {
    const result = evaluateBenchmarkCase(
      benchmarkCase(),
      [review('faculty-alpha'), review('faculty-beta', { wouldTeach: false, minimalEditVerdict: 'major-edits' })],
      benchmarkPolicy,
    );
    expect(result).toMatchObject({ complete: true, usable: false });
  });

  it('keeps an incomplete independent benchmark explicitly unverified', () => {
    const oneCase = evaluateBenchmarkCase(
      benchmarkCase(),
      [review('faculty-alpha'), review('faculty-beta')],
      benchmarkPolicy,
    );
    expect(buildIndependentBenchmarkSummary([oneCase], benchmarkPolicy).status).toBe('unverified');
  });

  it('records live operational evidence without treating missing retained artifacts as release proof', () => {
    const run = canaryRun('run-1');
    run.evidence.retention.status = 'hash-only-local';
    run.evidence.artifactValidation.allMatch = false;
    run.evidence.visualQa = { status: 'structural-only', reviewedAt: '' };
    const result = evaluateCanaryRun(run, canaryPolicy, new Date('2026-07-10T12:00:00.000Z'));
    expect(result).toMatchObject({ operationalPass: true, proofEligible: false, releasePass: false });
  });

  it('passes production proof only with three eligible runs across two domains', () => {
    const results = [
      evaluateCanaryRun(canaryRun('run-1', 'studio'), canaryPolicy, new Date('2026-07-10T12:00:00.000Z')),
      evaluateCanaryRun(canaryRun('run-2', 'laboratory'), canaryPolicy, new Date('2026-07-10T12:00:00.000Z')),
      evaluateCanaryRun(canaryRun('run-3', 'studio'), canaryPolicy, new Date('2026-07-10T12:00:00.000Z')),
    ];
    expect(buildProductionCanarySummary(results, canaryPolicy)).toMatchObject({
      status: 'pass',
      proofEligibleRuns: 3,
      evidenceComplete: true,
    });
  });

  it('allows advisory profiles to pass with a bounded contract claim but blocks release', () => {
    const tiers = {
      contract: tier('pass', { fixtureCount: 40 }),
      qualityBenchmark: tier('pass', { validCorpusCases: 12 }),
      independentBenchmark: tier('unverified', { completedCases: 0 }),
      productionCanary: tier('unverified', { proofEligibleRuns: 0 }),
    };
    expect(buildEvaluationSystemSummary(tiers, 'main')).toMatchObject({
      status: 'pass',
      claimStatus: 'compiler-contract-only',
    });
    expect(buildEvaluationSystemSummary(tiers, 'release')).toMatchObject({
      status: 'fail',
      claimStatus: 'compiler-contract-only',
      failedRequiredTiers: ['independentBenchmark', 'productionCanary'],
    });
  });

  it('bounds a fully passing release claim to the declared evaluation scope', () => {
    const tiers = {
      contract: tier('pass', { fixtureCount: 40 }),
      qualityBenchmark: tier('pass', { validCorpusCases: 12 }),
      independentBenchmark: tier('pass', { completedCases: 8 }),
      productionCanary: tier('pass', { proofEligibleRuns: 3 }),
    };
    expect(buildEvaluationSystemSummary(tiers, 'release')).toMatchObject({
      status: 'pass',
      claimStatus: 'independently-validated-for-declared-scope',
      independentlyValidated: true,
    });
  });
});
