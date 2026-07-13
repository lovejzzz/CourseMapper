import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  aggregateQualityReviews,
  analyzeModelComparison,
  bootstrapOrdinalReliability,
  calibrateModelJudge,
  validateQualityReview,
  validateRubric,
} from '../lib/qualityBenchmark.mjs';
import { verifyComparisonScorecards } from '../qualityModelComparison.mjs';

const rubric = JSON.parse(
  readFileSync(new URL('../../evaluation/quality-benchmark/v1/rubric.json', import.meta.url), 'utf8'),
);
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

function makeReview({ id = 'reviewer-1', evidenceClass = 'human-qualified', score = 4, criticalFailures = [] } = {}) {
  const ratings = Object.fromEntries(
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
              location: `${criterion.id} sampled location`,
              observation: `Concrete observed evidence for ${criterion.id} supports this anchored score.`,
            },
          ],
          ...(score % 2
            ? {
                interpolationRationale: `The evidence exceeds anchor ${score - 1} but does not fully satisfy anchor ${score + 1}.`,
              }
            : {}),
        },
      ]),
  );
  return {
    schemaVersion: 2,
    rubricVersion: rubric.rubricVersion,
    caseId: 'heldout-case',
    artifactId: 'package-1',
    artifactType: 'courseMap',
    sourceSha256: HASH_A,
    artifactSha256: HASH_B,
    reviewedAt: '2026-07-13T12:00:00Z',
    evaluator: {
      id,
      evidenceClass,
      qualified: evidenceClass === 'human-qualified',
      independent: evidenceClass === 'human-qualified',
      conflictOfInterest: false,
      domainMatch: evidenceClass === 'human-qualified',
      currentTeachingRole: evidenceClass === 'human-qualified' ? 'Current domain-matched faculty instructor' : '',
      model: evidenceClass === 'model-judge' ? 'test-judge' : '',
      modelRevision: evidenceClass === 'model-judge' ? 'test-judge-2026-07-13' : '',
      promptSha256: evidenceClass === 'model-judge' ? HASH_A : '',
    },
    ratings,
    criticalFailures,
    overall: {
      wouldUse: score >= 3,
      editVerdict: score >= 4 ? 'as-is' : 'minor-edits',
      estimatedEditMinutes: 10,
      notes: 'Test-only review fixture.',
    },
  };
}

describe('quality benchmark rubric and scoring', () => {
  it('covers the complete versioned construct and specialized inventory', () => {
    const result = validateRubric(rubric);
    expect(result).toMatchObject({ valid: true, weightTotal: 100, criterionCount: 26, deliverableCount: 23 });
  });

  it('requires explicit evidence states and evaluator provenance', () => {
    const review = makeReview();
    delete review.ratings.IA1;
    review.evaluator.currentTeachingRole = '';
    const result = validateQualityReview(review, rubric);
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('human-qualified evidence requires'),
        expect.stringContaining('IA1 rating is missing'),
      ]),
    );
  });

  it('caps a perfect model-judge profile at provisional 79', () => {
    const report = aggregateQualityReviews([makeReview({ evidenceClass: 'model-judge' })], rubric);
    expect(report.validation.tier).toBe('model-provisional');
    expect(report.scores.uncappedProfileScore).toBe(100);
    expect(report.scores.reportedScore).toBe(79);
    expect(report.scores.caps).toContainEqual({ source: 'evidence-tier:model-provisional', cap: 79 });
  });

  it('applies a non-compensable critical-failure cap', () => {
    const criticalFailures = [
      {
        id: 'fabricated-source',
        criterionId: 'SF3',
        evidence: {
          artifact: 'syllabus.docx',
          location: 'References item 4',
          observation: 'The cited identifier does not resolve and names a nonexistent work.',
        },
      },
    ];
    const report = aggregateQualityReviews(
      [makeReview({ id: 'faculty-a', criticalFailures }), makeReview({ id: 'faculty-b', criticalFailures })],
      rubric,
      {
        benchmarkCase: { id: 'heldout-case', split: 'heldout', source: { verified: true }, exportVerified: true },
      },
    );
    expect(report.scores.uncappedProfileScore).toBe(100);
    expect(report.scores.reportedScore).toBe(59);
    expect(report.scores.band.label).toBe('not-publishable');
  });

  it('reserves 100 for reliable, complete, verified held-out human evidence', () => {
    const report = aggregateQualityReviews([makeReview({ id: 'faculty-a' }), makeReview({ id: 'faculty-b' })], rubric, {
      benchmarkCase: { id: 'heldout-case', split: 'heldout', source: { verified: true }, exportVerified: true },
    });
    expect(report.validation.tier).toBe('independently-validated');
    expect(report.validation.reliabilityPass).toBe(true);
    expect(report.scores.perfectScoreEligible).toBe(true);
    expect(report.scores.reportedScore).toBe(100);
  });

  it('rejects duplicate reviewers and partial second-reviewer coverage as independent validation', () => {
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
    expect(partialReport.validation).toMatchObject({
      tier: 'human-reviewed-disputed',
      independentCoveragePass: false,
    });
    const duplicateReport = aggregateQualityReviews([complete, makeReview({ id: 'faculty-a' })], rubric);
    expect(duplicateReport.validation.uniqueQualifiedReviewerCount).toBe(1);
    expect(duplicateReport.reviewValidationIssues).toEqual(
      expect.arrayContaining([expect.stringContaining('duplicate human-qualified review')]),
    );
  });

  it('reports ordinal agreement and uncertainty instead of score spread alone', () => {
    const reliability = bootstrapOrdinalReliability(
      [
        [4, 4],
        [3, 3],
        [2, 3],
        [1, 2],
        [0, 0],
      ],
      { samples: 200, seed: 'test' },
    );
    expect(reliability.unitCount).toBe(5);
    expect(reliability.pairCount).toBe(5);
    expect(reliability.exactAgreement).toBe(0.6);
    expect(reliability.adjacentAgreement).toBe(1);
    expect(reliability.interval95.every(Number.isFinite)).toBe(true);
  });

  it('calibrates a model judge only against paired qualified-human consensus', () => {
    const reviews = [];
    for (const caseId of ['calibration-a', 'calibration-b']) {
      for (const id of ['faculty-a', 'faculty-b']) {
        const review = makeReview({ id });
        review.caseId = caseId;
        review.artifactId = `${caseId}-package`;
        reviews.push(review);
      }
      const model = makeReview({ id: `judge-${caseId}`, evidenceClass: 'model-judge' });
      model.caseId = caseId;
      model.artifactId = `${caseId}-package`;
      reviews.push(model);
    }
    const result = calibrateModelJudge(reviews, rubric, {
      minimumCases: 2,
      minimumPairedCriteria: 52,
      bootstrapSamples: 100,
    });
    expect(result.status).toBe('calibrated-for-observed-scope');
    expect(result.evidence).toMatchObject({ caseCount: 2, pairedCriterionCount: 52 });
    expect(result.agreement).toMatchObject({ meanAbsoluteError: 0, signedBias: 0, withinOneRate: 1 });

    const secondJudge = makeReview({ id: 'judge-other', evidenceClass: 'model-judge' });
    secondJudge.caseId = 'calibration-b';
    secondJudge.artifactId = 'calibration-b-package';
    secondJudge.evaluator.modelRevision = 'different-judge-revision';
    const mixed = calibrateModelJudge([...reviews, secondJudge], rubric, {
      minimumCases: 2,
      minimumPairedCriteria: 52,
      bootstrapSamples: 100,
    });
    expect(mixed.status).toBe('mixed-model-judge-identities');
  });
});

function comparisonFixture() {
  const deltas = [4, 2, -1, 3, 1, 0];
  return {
    schemaVersion: 1,
    comparisonId: 'test-only-comparison',
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
        method: 'seeded random permutation before assignment',
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
        rationale: 'The selected packet gives more specific and better aligned artifact evidence.',
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

describe('controlled model comparison', () => {
  it('binds every reported score to exact scorecard bytes and matching scorecard content', async () => {
    const fixture = comparisonFixture();
    fixture.trials = [fixture.trials[0]];
    const directory = await mkdtemp(path.join(tmpdir(), 'coursemapper-quality-scorecards-'));
    try {
      for (const side of ['candidate', 'control']) {
        const output = fixture.trials[0].outputs[side];
        const evidence = output.scoreEvidence;
        const scorecard = {
          rubricVersion: evidence.rubricVersion,
          caseId: fixture.trials[0].caseId,
          sourceSha256: evidence.sourceSha256,
          artifactSha256: output.outputSha256,
          validation: {
            selectedEvidenceClass: evidence.evidenceClass,
            tier: evidence.validationTier,
          },
          scores: { reportedScore: output.benchmarkScore },
          dimensions: Object.entries(output.dimensionScores).map(([id, score]) => ({ id, score })),
          reviewValidationIssues: [],
        };
        const bytes = `${JSON.stringify(scorecard, null, 2)}\n`;
        const scorecardPath = path.join(directory, `${side}.json`);
        await writeFile(scorecardPath, bytes);
        evidence.scorecardPath = `${side}.json`;
        evidence.scorecardSha256 = createHash('sha256').update(bytes).digest('hex');
      }

      const verified = await verifyComparisonScorecards(fixture, { baseDir: directory });
      expect(verified.issues).toEqual([]);
      expect(verified.verifiedScorecardSha256s).toHaveLength(2);

      const candidateEvidence = fixture.trials[0].outputs.candidate.scoreEvidence;
      const candidatePath = path.join(directory, candidateEvidence.scorecardPath);
      await writeFile(candidatePath, `${await readFile(candidatePath, 'utf8')} `);
      const tamperedBytes = await verifyComparisonScorecards(fixture, { baseDir: directory });
      expect(tamperedBytes.issues).toContain('case-a/trial-1/candidate scorecard hash mismatch');

      const scorecard = JSON.parse(await readFile(candidatePath, 'utf8'));
      scorecard.scores.reportedScore -= 1;
      const mismatchedContent = `${JSON.stringify(scorecard, null, 2)}\n`;
      await writeFile(candidatePath, mismatchedContent);
      candidateEvidence.scorecardSha256 = createHash('sha256').update(mismatchedContent).digest('hex');
      const contentCheck = await verifyComparisonScorecards(fixture, { baseDir: directory });
      expect(contentCheck.issues).toContain(
        'case-a/trial-1/candidate scorecard content does not match the declared score, dimensions, artifact, or evidence tier',
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('reports paired effects, uncertainty, preference ties, and operations', () => {
    const comparison = comparisonFixture();
    const report = analyzeModelComparison(comparison, {
      bootstrapSamples: 500,
      verifiedScorecardSha256s: verifiedScorecards(comparison),
    });
    expect(report.status).toBe('measured-for-declared-scope');
    expect(report.issues).toEqual([]);
    expect(report.absoluteScoreEffect.candidateMinusControlMean.estimate).toBe(1.5);
    expect(report.qualifiedPairwisePreference).toMatchObject({
      count: 12,
      wins: 10,
      losses: 0,
      ties: 2,
      effectiveWinRate: 0.917,
    });
    expect(report.qualifiedPairwisePreference.wilson95.every(Number.isFinite)).toBe(true);
    expect(report.operations.candidate.totalCostUsd).toBe(0.12);
    expect(report.operations.candidateMinusControlCompilerBurden.scionCalls.estimate).toBe(-2);
  });

  it('keeps model-judge preferences advisory', () => {
    const fixture = comparisonFixture();
    fixture.trials[0].preferences[0] = {
      reviewerId: 'judge-model',
      evidenceClass: 'model-judge',
      blinded: true,
      preference: 'B',
      order: 'A/B',
      rationale: 'The second packet has more complete evidence and clearer alignment.',
      reviewedAt: '2026-07-13T12:00:00Z',
      candidateArtifactSha256: fixture.trials[0].outputs.candidate.outputSha256,
      controlArtifactSha256: fixture.trials[0].outputs.control.outputSha256,
    };
    const report = analyzeModelComparison(fixture, {
      bootstrapSamples: 100,
      verifiedScorecardSha256s: verifiedScorecards(fixture),
    });
    expect(report.qualifiedPairwisePreference.count).toBe(11);
    expect(report.advisoryModelJudge.count).toBe(1);
    expect(report.advisoryModelJudge.usableForPrimaryClaim).toBe(false);
  });

  it('rejects duplicated favorable trials, swapped model arms, and unbound scores', () => {
    const fixture = comparisonFixture();
    fixture.trials[1].trialIndex = fixture.trials[0].trialIndex;
    fixture.trials[2].outputs.candidate.modelId = 'control';
    delete fixture.trials[3].outputs.candidate.scoreEvidence;
    const report = analyzeModelComparison(fixture, {
      bootstrapSamples: 100,
      verifiedScorecardSha256s: verifiedScorecards(fixture),
    });
    expect(report.status).toBe('invalid');
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('duplicates a case/trial row'),
        expect.stringContaining('candidate output modelId must equal candidateId'),
        expect.stringContaining('benchmarkScore requires a byte-verified scorecard'),
      ]),
    );
  });
});
