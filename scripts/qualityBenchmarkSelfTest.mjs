#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  aggregateQualityReviews,
  analyzeModelComparison,
  bootstrapOrdinalReliability,
  calibrateModelJudge,
  validateQualityReview,
  validateRubric,
} from './lib/qualityBenchmark.mjs';

const rubric = JSON.parse(
  fs.readFileSync(new URL('../evaluation/quality-benchmark/v1/rubric.json', import.meta.url), 'utf8'),
);
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

function makeReview({
  id = 'faculty-a',
  caseId = 'heldout-case',
  artifactId = 'heldout-package',
  evidenceClass = 'human-qualified',
  score = 4,
  criticalFailures = [],
} = {}) {
  const qualified = evidenceClass === 'human-qualified';
  return {
    schemaVersion: 2,
    rubricVersion: rubric.rubricVersion,
    caseId,
    artifactId,
    artifactType: 'package',
    sourceSha256: HASH_A,
    artifactSha256: HASH_B,
    reviewedAt: '2026-07-13T12:00:00Z',
    evaluator: {
      id,
      evidenceClass,
      qualified,
      independent: qualified,
      conflictOfInterest: false,
      domainMatch: qualified,
      currentTeachingRole: qualified ? 'Current domain-matched faculty instructor' : '',
      model: evidenceClass === 'model-judge' ? 'test-judge' : '',
      modelRevision: evidenceClass === 'model-judge' ? 'test-judge-2026-07-13' : '',
      promptSha256: evidenceClass === 'model-judge' ? HASH_A : '',
    },
    ratings: Object.fromEntries(
      rubric.dimensions
        .flatMap((dimension) => dimension.criteria)
        .map((criterion) => [
          criterion.id,
          {
            state: 'scored',
            score,
            confidence: 'high',
            evidence: [
              {
                artifact: 'package.zip',
                location: criterion.id,
                observation: `Concrete test-only artifact evidence for ${criterion.id} supports the declared anchor.`,
              },
            ],
            ...(score % 2
              ? { interpolationRationale: 'The evidence falls between the adjacent observable anchors.' }
              : {}),
          },
        ]),
    ),
    criticalFailures,
    overall: {
      wouldUse: score >= 3,
      editVerdict: score >= 4 ? 'as-is' : 'minor-edits',
      estimatedEditMinutes: 10,
      notes: 'Software self-test fixture only; not human evidence.',
    },
  };
}

function comparisonFixture() {
  const deltas = [4, 2, -1, 3, 1, 0];
  return {
    schemaVersion: 1,
    comparisonId: 'software-self-test-only',
    protocolVersion: '1.0.0',
    createdAt: '2026-07-13T11:00:00Z',
    preregistration: {
      frozenAt: '2026-07-13T10:00:00Z',
      analysisPlanSha256: HASH_A,
      corpusManifestSha256: HASH_B,
      minimumTrialsPerCase: 3,
      requiredQualifiedPreferencesPerTrial: 2,
      caseIds: ['case-a', 'case-b'],
      stoppingRule: 'Run every declared case and trial without looking at observed results.',
      exclusionPolicy: 'Retain all attempts and report failures separately from successful quality.',
    },
    environment: { compilerCommit: '20c2f81', dirtyTree: false },
    candidateId: 'candidate',
    controlId: 'control',
    models: [
      {
        id: 'candidate',
        provider: 'test-provider',
        model: 'candidate-model',
        revision: 'candidate-revision',
        promptSha256: HASH_A,
        configurationSha256: HASH_A,
        parameters: { temperature: 0 },
        compilerCommit: '20c2f81',
        graderVersion: 'quality-benchmark-v1',
      },
      {
        id: 'control',
        provider: 'test-provider',
        model: 'control-model',
        revision: 'control-revision',
        promptSha256: HASH_A,
        configurationSha256: HASH_A,
        parameters: { temperature: 0 },
        compilerCommit: '20c2f81',
        graderVersion: 'quality-benchmark-v1',
      },
    ],
    trials: deltas.map((delta, index) => ({
      caseId: index < 3 ? 'case-a' : 'case-b',
      split: 'heldout',
      deliverableType: index % 2 ? 'assignments' : 'courseMap',
      trialIndex: index + 1,
      seed: `generation-${index}`,
      sourceSha256: index < 3 ? 'c'.repeat(64) : 'd'.repeat(64),
      matchedInputSha256: index < 3 ? '1'.repeat(64) : '2'.repeat(64),
      matchedSettingsSha256: 'f'.repeat(64),
      randomization: {
        candidateLabel: index % 2 ? 'A' : 'B',
        controlLabel: index % 2 ? 'B' : 'A',
        seed: `blind-${index}`,
        method: 'seeded random permutation before review assignment',
      },
      outputs: {
        candidate: {
          modelId: 'candidate',
          status: 'success',
          outputSha256: (index + 1).toString(16).repeat(64),
          latencyMs: 1200 + index,
          costUsd: 0.02,
          providerCalls: 2,
          retryCount: 0,
          benchmarkScore: 80 + delta,
          dimensionScores: { 'instructional-alignment': 82 + delta },
          compilerBurden: { scionCalls: 8, repairCalls: 1, rejectedAtoms: 2, recoveredAtoms: 1 },
          scoreEvidence: {
            rubricVersion: '1.0.0',
            rubricSha256: 'e'.repeat(64),
            scorecardSha256: String((index % 8) + 1).repeat(64),
            scorecardPath: `scorecards/candidate-${index}.json`,
            evidenceClass: 'human-qualified',
            validationTier: 'independently-validated',
            sourceSha256: index < 3 ? 'c'.repeat(64) : 'd'.repeat(64),
            artifactSha256: (index + 1).toString(16).repeat(64),
          },
        },
        control: {
          modelId: 'control',
          status: 'success',
          outputSha256: (index + 9).toString(16).repeat(64),
          latencyMs: 1000 + index,
          costUsd: 0.01,
          providerCalls: 1,
          retryCount: 0,
          benchmarkScore: 80,
          dimensionScores: { 'instructional-alignment': 82 },
          compilerBurden: { scionCalls: 10, repairCalls: 2, rejectedAtoms: 3, recoveredAtoms: 1 },
          scoreEvidence: {
            rubricVersion: '1.0.0',
            rubricSha256: 'e'.repeat(64),
            scorecardSha256: String(((index + 3) % 8) + 1).repeat(64),
            scorecardPath: `scorecards/control-${index}.json`,
            evidenceClass: 'human-qualified',
            validationTier: 'independently-validated',
            sourceSha256: index < 3 ? 'c'.repeat(64) : 'd'.repeat(64),
            artifactSha256: (index + 9).toString(16).repeat(64),
          },
        },
      },
      preferences: [0, 1].map((reviewerIndex) => ({
        reviewerId: `qualified-${index}-${reviewerIndex}`,
        evidenceClass: 'human-qualified',
        qualified: true,
        independent: true,
        conflictOfInterest: false,
        domainMatch: true,
        currentTeachingRole: 'Current domain-matched faculty instructor',
        blinded: true,
        preference: index === 5 ? 'tie' : index % 2 ? 'A' : 'B',
        rationale: 'The selected packet has more specific and better aligned artifact evidence.',
        reviewedAt: '2026-07-13T12:00:00Z',
        candidateArtifactSha256: (index + 1).toString(16).repeat(64),
        controlArtifactSha256: (index + 9).toString(16).repeat(64),
      })),
    })),
  };
}

function verifiedScorecards(comparison) {
  return comparison.trials.flatMap((trial) =>
    ['candidate', 'control'].map((side) => trial.outputs[side].scoreEvidence?.scorecardSha256).filter(Boolean),
  );
}

const tests = [
  [
    'rubric inventory and weights',
    () => {
      assert.deepEqual(validateRubric(rubric), {
        valid: true,
        issues: [],
        weightTotal: 100,
        criterionCount: 26,
        deliverableCount: 23,
      });
    },
  ],
  [
    'explicit evidence-state validation',
    () => {
      const review = makeReview();
      delete review.ratings.IA1;
      assert.equal(validateQualityReview(review, rubric).valid, false);
    },
  ],
  [
    'model evidence cap',
    () => {
      const report = aggregateQualityReviews([makeReview({ evidenceClass: 'model-judge', id: 'judge-a' })], rubric);
      assert.equal(report.scores.uncappedProfileScore, 100);
      assert.equal(report.scores.reportedScore, 79);
    },
  ],
  [
    'non-compensable failure cap',
    () => {
      const failure = {
        id: 'fabricated-source',
        criterionId: 'SF3',
        evidence: {
          artifact: 'syllabus.docx',
          location: 'reference 4',
          observation: 'The cited identifier names a nonexistent work and does not resolve.',
        },
      };
      const report = aggregateQualityReviews(
        [
          makeReview({ id: 'faculty-a', criticalFailures: [failure] }),
          makeReview({ id: 'faculty-b', criticalFailures: [failure] }),
        ],
        rubric,
        { benchmarkCase: { id: 'heldout-case', split: 'heldout', source: { verified: true }, exportVerified: true } },
      );
      assert.equal(report.scores.reportedScore, 59);
    },
  ],
  [
    'perfect score reservation',
    () => {
      const report = aggregateQualityReviews(
        [makeReview({ id: 'faculty-a' }), makeReview({ id: 'faculty-b' })],
        rubric,
        { benchmarkCase: { id: 'heldout-case', split: 'heldout', source: { verified: true }, exportVerified: true } },
      );
      assert.equal(report.validation.tier, 'independently-validated');
      assert.equal(report.scores.perfectScoreEligible, true);
      assert.equal(report.scores.reportedScore, 100);
    },
  ],
  [
    'independent evidence cannot be inflated by duplicate or partial reviewers',
    () => {
      const complete = makeReview({ id: 'faculty-a' });
      const partial = makeReview({ id: 'faculty-b' });
      for (const criterionId of Object.keys(partial.ratings).slice(0, 6)) {
        partial.ratings[criterionId] = {
          state: 'not-evaluated',
          score: null,
          confidence: 'low',
          evidence: [],
          rationale: 'This criterion was not inspected in the bounded review session.',
        };
      }
      const partialReport = aggregateQualityReviews([complete, partial], rubric);
      assert.equal(partialReport.validation.tier, 'human-reviewed-disputed');
      assert.equal(partialReport.validation.independentCoveragePass, false);
      const duplicateReport = aggregateQualityReviews([complete, makeReview({ id: 'faculty-a' })], rubric);
      assert.equal(duplicateReport.validation.uniqueQualifiedReviewerCount, 1);
      assert.ok(
        duplicateReport.reviewValidationIssues.some((issue) => issue.includes('duplicate human-qualified review')),
      );
    },
  ],
  [
    'ordinal reliability and interval',
    () => {
      const result = bootstrapOrdinalReliability(
        [
          [4, 4],
          [3, 3],
          [2, 3],
          [1, 2],
          [0, 0],
        ],
        { samples: 200, seed: 'self-test' },
      );
      assert.equal(result.exactAgreement, 0.6);
      assert.equal(result.adjacentAgreement, 1);
      assert.equal(result.interval95.every(Number.isFinite), true);
    },
  ],
  [
    'model-judge calibration',
    () => {
      const reviews = [];
      for (const caseId of ['calibration-a', 'calibration-b']) {
        reviews.push(makeReview({ id: `${caseId}-faculty-a`, caseId, artifactId: `${caseId}-package` }));
        reviews.push(makeReview({ id: `${caseId}-faculty-b`, caseId, artifactId: `${caseId}-package` }));
        reviews.push(
          makeReview({ id: `${caseId}-judge`, caseId, artifactId: `${caseId}-package`, evidenceClass: 'model-judge' }),
        );
      }
      const result = calibrateModelJudge(reviews, rubric, {
        minimumCases: 2,
        minimumPairedCriteria: 52,
        bootstrapSamples: 100,
      });
      assert.equal(result.status, 'calibrated-for-observed-scope');
      assert.equal(result.agreement.meanAbsoluteError, 0);
      const mixed = reviews.map((review, index) => {
        if (review.evaluator.evidenceClass !== 'model-judge' || index < 3) return review;
        return {
          ...review,
          evaluator: { ...review.evaluator, modelRevision: 'different-judge-revision' },
        };
      });
      assert.equal(
        calibrateModelJudge(mixed, rubric, {
          minimumCases: 2,
          minimumPairedCriteria: 52,
          bootstrapSamples: 100,
        }).status,
        'mixed-model-judge-identities',
      );
    },
  ],
  [
    'matched comparison effects and uncertainty',
    () => {
      const comparison = comparisonFixture();
      const report = analyzeModelComparison(comparison, {
        bootstrapSamples: 500,
        verifiedScorecardSha256s: verifiedScorecards(comparison),
      });
      assert.equal(report.status, 'measured-for-declared-scope');
      assert.deepEqual(report.issues, []);
      assert.equal(report.absoluteScoreEffect.candidateMinusControlMean.estimate, 1.5);
      assert.deepEqual(
        {
          count: report.qualifiedPairwisePreference.count,
          wins: report.qualifiedPairwisePreference.wins,
          losses: report.qualifiedPairwisePreference.losses,
          ties: report.qualifiedPairwisePreference.ties,
        },
        { count: 12, wins: 10, losses: 0, ties: 2 },
      );
      assert.equal(report.operations.candidate.totalCostUsd, 0.12);
      assert.equal(report.operations.candidateMinusControlCompilerBurden.scionCalls.estimate, -2);
    },
  ],
  [
    'comparison anti-inflation checks',
    () => {
      const comparison = comparisonFixture();
      comparison.trials[1].trialIndex = comparison.trials[0].trialIndex;
      comparison.trials[2].outputs.candidate.modelId = 'control';
      delete comparison.trials[3].outputs.candidate.scoreEvidence;
      const report = analyzeModelComparison(comparison, {
        bootstrapSamples: 100,
        verifiedScorecardSha256s: verifiedScorecards(comparison),
      });
      assert.equal(report.status, 'invalid');
      assert.ok(report.issues.some((issue) => issue.includes('duplicates a case/trial row')));
      assert.ok(report.issues.some((issue) => issue.includes('candidate output modelId must equal candidateId')));
      assert.ok(report.issues.some((issue) => issue.includes('benchmarkScore requires a byte-verified scorecard')));
    },
  ],
];

for (const [name, test] of tests) {
  test();
  console.log(`pass - ${name}`);
}
console.log(`Quality benchmark self-test: ${tests.length}/${tests.length} passed`);
