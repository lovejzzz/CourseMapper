import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  auditScionAdapterSingleModelJudgeEvidence,
  SCION_ADAPTER_JUDGE_CLAIM_BOUNDARY,
  SCION_ADAPTER_JUDGE_PROMOTION_PROTOCOL,
} from '../scripts/lib/scionAdapterJudgePromotion.mjs';
import { computeScionAdapterPackageIdentity } from '../scripts/lib/scionBrowserDeviceMatrix.mjs';
import { aggregateQualityReviews, flattenRubric } from '../scripts/lib/qualityBenchmark.mjs';

const SOURCE_ROOT = process.cwd();
const CANONICAL_PATHS = {
  qualityManifest: 'evaluation/quality-benchmark/v1/manifest.json',
  rubric: 'evaluation/quality-benchmark/v1/rubric.json',
  judgePrompt: 'evaluation/quality-benchmark/v1/single-model-judge-prompt-v1.md',
  heldOutCourseBenchmark: 'evaluation/scion-adapters/held-out-course-benchmark-v1.json',
};
const DIMENSIONS = [
  'instructional-alignment',
  'accuracy-source-fidelity',
  'assessment-feedback',
  'teaching-learning-usability',
  'student-clarity-support',
  'inclusion-accessibility',
  'integrity-safety-rights',
  'professional-craft',
  'cross-artifact-coherence',
];

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

async function writeJson(filePath, value) {
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, bytes);
  return sha256(bytes);
}

async function copyCanonical(root) {
  const hashes = {};
  for (const [key, relativePath] of Object.entries(CANONICAL_PATHS)) {
    const destination = path.join(root, relativePath);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    const bytes = await fs.readFile(path.join(SOURCE_ROOT, relativePath));
    await fs.writeFile(destination, bytes);
    hashes[key] = sha256(bytes);
  }
  return hashes;
}

async function buildFixture({ reuseJudgeSessionAcrossOrders = false } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-judge-promotion-'));
  const hashes = await copyCanonical(root);
  const heldOut = JSON.parse(await fs.readFile(path.join(root, CANONICAL_PATHS.heldOutCourseBenchmark), 'utf8'));
  const rubric = JSON.parse(await fs.readFile(path.join(root, CANONICAL_PATHS.rubric), 'utf8'));
  const adapterManifest = {
    adapter: { id: 'scion-g4e2b-test-adapter', scale: 1 },
    base: { modelId: heldOut.base.modelId, revision: heldOut.base.revision },
  };
  const adapterPackageIdentitySha256 = computeScionAdapterPackageIdentity(adapterManifest).sha256;
  const judge = {
    model: 'openai/codex',
    modelRevision: 'gpt-5.4-session-judge-revision',
    promptSha256: hashes.judgePrompt,
    evidenceProtocol: 'recomputable-two-order-v1',
    requiredPassesPerTrial: 2,
    requiredOrders: ['A/B', 'B/A'],
  };
  const paidReference = {
    id: 'scion-paid-reference-gpt-5.4-mini',
    provider: 'openai',
    model: 'gpt-5.4-mini',
    modelRevision: 'gpt-5.4-mini-2026-06-15',
    route: 'responses-api',
    reasoningEffort: 'low',
  };
  const scorecardDir = path.join(root, 'comparisons', 'scorecards');
  await fs.mkdir(scorecardDir, { recursive: true });

  const sessions = {
    'A/B': 'codex-judge-a-b-session',
    'B/A': reuseJudgeSessionAcrossOrders ? 'codex-judge-a-b-session' : 'codex-judge-b-a-session',
  };
  const makeReview = ({ caseId, sourceSha256, artifactSha256, ratingScore, order }) => ({
    schemaVersion: 2,
    rubricVersion: '1.0.0',
    caseId,
    artifactId: `anonymous-${artifactSha256.slice(0, 16)}`,
    artifactType: 'package',
    sourceSha256,
    artifactSha256,
    reviewedAt: order === 'A/B' ? '2026-07-13T12:00:00Z' : '2026-07-13T13:00:00Z',
    evaluator: {
      id: sessions[order],
      evidenceClass: 'model-judge',
      qualified: false,
      independent: false,
      conflictOfInterest: false,
      domainMatch: false,
      currentTeachingRole: '',
      model: judge.model,
      modelRevision: judge.modelRevision,
      promptSha256: judge.promptSha256,
    },
    ratings: Object.fromEntries(
      flattenRubric(rubric).map((criterion) => [
        criterion.id,
        {
          state: 'scored',
          score: ratingScore,
          confidence: 'high',
          evidence: [
            {
              artifact: 'Anonymous course package',
              location: `${criterion.id} representative inspected section`,
              observation: `The bound package provides concrete evidence for ${criterion.id} at rubric anchor ${ratingScore}.`,
            },
          ],
          ...(![0, 2, 4].includes(ratingScore)
            ? {
                interpolationRationale: `The evidence is consistently between the adjacent anchors for ${criterion.id}.`,
              }
            : {}),
        },
      ]),
    ),
    criticalFailures: [],
    overall: {
      wouldUse: ratingScore >= 3,
      editVerdict: ratingScore >= 4 ? 'minor-edits' : ratingScore >= 3 ? 'major-edits' : 'cannot-use',
      estimatedEditMinutes: ratingScore >= 4 ? 15 : ratingScore >= 3 ? 60 : 180,
      notes: 'Concrete bound review retained so every aggregate score can be recomputed from the frozen rubric.',
    },
  });

  const scoreEvidence = async ({
    caseId,
    sourceSha256,
    artifactSha256,
    side,
    trialIndex,
    ratingScore,
    initialLabel,
  }) => {
    const benchmarkCase = {
      id: caseId,
      split: 'heldout',
      source: { sha256: sourceSha256, verified: true },
      exportVerified: true,
    };
    const orders = ['A/B', 'B/A'];
    const reviews = orders.map((order) => makeReview({ caseId, sourceSha256, artifactSha256, ratingScore, order }));
    const stem = `${caseId}-${trialIndex}-${side}`;
    const reviewBundlePath = `scorecards/${stem}-reviews.json`;
    const reviewBundleSha256 = await writeJson(path.join(root, 'comparisons', reviewBundlePath), reviews);
    const passScorecards = [];
    for (const [reviewIndex, order] of orders.entries()) {
      const scorecard = aggregateQualityReviews([reviews[reviewIndex]], rubric, {
        benchmarkCase,
        bootstrapSamples: 100,
      });
      const scorecardPath = `scorecards/${stem}-${order === 'A/B' ? 'a-b' : 'b-a'}.json`;
      const scorecardSha256 = await writeJson(path.join(root, 'comparisons', scorecardPath), scorecard);
      passScorecards.push({
        order,
        reviewerId: sessions[order],
        sessionId: sessions[order],
        reviewIndex,
        scoredAt: reviews[reviewIndex].reviewedAt,
        presentedLabel: order === 'B/A' ? (initialLabel === 'A' ? 'B' : 'A') : initialLabel,
        scorecardPath,
        scorecardSha256,
        reportedScore: scorecard.scores.reportedScore,
        dimensionScores: Object.fromEntries(scorecard.dimensions.map((dimension) => [dimension.id, dimension.score])),
      });
    }
    const scorecard = aggregateQualityReviews(reviews, rubric, { benchmarkCase, bootstrapSamples: 100 });
    const scorecardPath = `scorecards/${stem}-aggregate.json`;
    const scorecardSha256 = await writeJson(path.join(root, 'comparisons', scorecardPath), scorecard);
    return {
      benchmarkScore: scorecard.scores.reportedScore,
      dimensionScores: Object.fromEntries(scorecard.dimensions.map((dimension) => [dimension.id, dimension.score])),
      scoreEvidence: {
        rubricVersion: '1.0.0',
        rubricSha256: hashes.rubric,
        scorecardSha256,
        scorecardPath,
        evidenceClass: 'model-judge',
        validationTier: 'model-provisional',
        aggregationBootstrapSamples: 100,
        model: judge.model,
        modelRevision: judge.modelRevision,
        promptSha256: judge.promptSha256,
        sourceSha256,
        artifactSha256,
        reviewBundlePath,
        reviewBundleSha256,
        passScorecards,
      },
    };
  };

  const candidateOutputs = new Map();
  for (const course of heldOut.courses) {
    for (let trialIndex = 1; trialIndex <= 10; trialIndex += 1) {
      const key = `${course.courseId}\0${trialIndex}`;
      const outputSha256 = sha256(`candidate:${key}`);
      const initialLabel = trialIndex % 2 ? 'A' : 'B';
      const scored = await scoreEvidence({
        caseId: course.courseId,
        sourceSha256: course.sourcePacketSha256,
        artifactSha256: outputSha256,
        side: 'candidate',
        trialIndex,
        ratingScore: 4,
        initialLabel,
      });
      candidateOutputs.set(key, {
        modelId: adapterManifest.adapter.id,
        status: 'success',
        outputSha256,
        latencyMs: 900,
        costUsd: 0,
        providerCalls: 40,
        retryCount: 0,
        benchmarkScore: scored.benchmarkScore,
        dimensionScores: scored.dimensionScores,
        compilerBurden: { scionCalls: 40, repairCalls: 1, rejectedAtoms: 1, recoveredAtoms: 1 },
        scoreEvidence: scored.scoreEvidence,
      });
    }
  }

  const makeComparison = async (role) => {
    const isBase = role === 'adapter-vs-base';
    const controlId = isBase ? 'scion-base-only' : paidReference.id;
    const controlRatingScore = isBase ? 2 : 3;
    const models = [
      {
        id: adapterManifest.adapter.id,
        provider: 'local-browser',
        model: adapterManifest.base.modelId,
        revision: adapterManifest.base.revision,
        promptSha256: '1'.repeat(64),
        configurationSha256: '2'.repeat(64),
        parameters: {
          adapterActive: true,
          adapterId: adapterManifest.adapter.id,
          adapterPackageIdentitySha256,
          adapterScale: 1,
        },
        compilerCommit: 'abcdef1234567890',
        graderVersion: 'quality-benchmark-v1',
      },
      isBase
        ? {
            id: controlId,
            provider: 'local-browser',
            model: adapterManifest.base.modelId,
            revision: adapterManifest.base.revision,
            promptSha256: '1'.repeat(64),
            configurationSha256: '3'.repeat(64),
            parameters: { adapterActive: false },
            compilerCommit: 'abcdef1234567890',
            graderVersion: 'quality-benchmark-v1',
          }
        : {
            id: controlId,
            provider: paidReference.provider,
            model: paidReference.model,
            revision: paidReference.modelRevision,
            promptSha256: '1'.repeat(64),
            configurationSha256: '4'.repeat(64),
            parameters: { route: paidReference.route, reasoningEffort: paidReference.reasoningEffort },
            compilerCommit: 'abcdef1234567890',
            graderVersion: 'quality-benchmark-v1',
          },
    ];
    const trials = [];
    for (const course of heldOut.courses) {
      for (let trialIndex = 1; trialIndex <= 10; trialIndex += 1) {
        const key = `${course.courseId}\0${trialIndex}`;
        const candidate = structuredClone(candidateOutputs.get(key));
        const controlHash = sha256(`${role}:control:${key}`);
        const candidateLabel = trialIndex % 2 ? 'A' : 'B';
        const controlLabel = candidateLabel === 'A' ? 'B' : 'A';
        const controlScored = await scoreEvidence({
          caseId: course.courseId,
          sourceSha256: course.sourcePacketSha256,
          artifactSha256: controlHash,
          side: isBase ? 'base' : 'paid',
          trialIndex,
          ratingScore: controlRatingScore,
          initialLabel: controlLabel,
        });
        trials.push({
          caseId: course.courseId,
          split: 'heldout',
          deliverableType: 'course-package',
          trialIndex,
          seed: `${course.courseId}-generation-${trialIndex}`,
          sourceSha256: course.sourcePacketSha256,
          matchedInputSha256: course.courseInputSha256,
          matchedSettingsSha256: '5'.repeat(64),
          randomization: {
            candidateLabel,
            controlLabel,
            seed: `${role}-${course.courseId}-blind-${trialIndex}`,
            method: 'seeded permutation before reversed-order judge passes',
          },
          outputs: {
            candidate,
            control: {
              modelId: controlId,
              status: 'success',
              outputSha256: controlHash,
              latencyMs: 1000,
              costUsd: isBase ? 0 : 0.01,
              providerCalls: isBase ? 50 : 1,
              retryCount: 0,
              benchmarkScore: controlScored.benchmarkScore,
              dimensionScores: controlScored.dimensionScores,
              compilerBurden: {
                scionCalls: isBase ? 50 : 45,
                repairCalls: 2,
                rejectedAtoms: 2,
                recoveredAtoms: 1,
              },
              scoreEvidence: controlScored.scoreEvidence,
            },
          },
          preferences: ['A/B', 'B/A'].map((order) => {
            const winnerLabel = order === 'B/A' ? (candidateLabel === 'A' ? 'B' : 'A') : candidateLabel;
            const loserLabel = winnerLabel === 'A' ? 'B' : 'A';
            const candidatePass = candidate.scoreEvidence.passScorecards.find((row) => row.order === order);
            const controlPass = controlScored.scoreEvidence.passScorecards.find((row) => row.order === order);
            return {
              reviewerId: sessions[order],
              sessionId: sessions[order],
              evidenceClass: 'model-judge',
              model: judge.model,
              modelRevision: judge.modelRevision,
              promptSha256: judge.promptSha256,
              blinded: true,
              preference: winnerLabel,
              order,
              rationale:
                'The winning anonymous package has stronger bound rubric evidence while the other package needs substantial revision.',
              reviewedAt: order === 'A/B' ? '2026-07-13T12:05:00Z' : '2026-07-13T13:05:00Z',
              candidateArtifactSha256: candidate.outputSha256,
              controlArtifactSha256: controlHash,
              candidateScorecardSha256: candidatePass.scorecardSha256,
              controlScorecardSha256: controlPass.scorecardSha256,
              scoredBeforePreference: true,
              decisionEvidence: [
                {
                  kind: 'defect',
                  artifactLabel: loserLabel,
                  artifactSha256: controlHash,
                  dimensionId: 'accuracy-source-fidelity',
                  location: 'Anonymous package > representative source-bearing lesson',
                  observation:
                    'The losing package provides materially weaker source fidelity and would require substantial instructor correction.',
                },
              ],
            };
          }),
        });
      }
    }
    return {
      schemaVersion: 1,
      comparisonId: `${role}-held-out-v1`,
      protocolVersion: '1.0.0',
      createdAt: '2026-07-13T11:00:00Z',
      preregistration: {
        frozenAt: '2026-07-13T10:00:00Z',
        analysisPlanSha256: hashes.qualityManifest,
        corpusManifestSha256: hashes.heldOutCourseBenchmark,
        minimumTrialsPerCase: 10,
        primaryPreferenceEvidence: 'single-model-judge',
        modelJudge: judge,
        caseIds: heldOut.courses.map((course) => course.courseId),
        stoppingRule: 'Run every declared case and trial without inspecting any observed outcome.',
        exclusionPolicy: 'Retain all attempts and report every failure separately from successful quality.',
      },
      environment: { compilerCommit: 'abcdef1234567890', dirtyTree: false },
      candidateId: adapterManifest.adapter.id,
      controlId,
      models,
      trials,
    };
  };

  const comparisons = {};
  for (const role of ['adapter-vs-base', 'adapter-vs-paid-reference']) {
    const comparison = await makeComparison(role);
    const relativePath = `comparisons/${role}.json`;
    const filePath = path.join(root, relativePath);
    const fileSha256 = await writeJson(filePath, comparison);
    comparisons[role] = { comparison, filePath, relativePath, sha256: fileSha256 };
  }
  const evidence = {
    schemaVersion: 1,
    protocolVersion: SCION_ADAPTER_JUDGE_PROMOTION_PROTOCOL,
    benchmarkProtocol: 'honest-quality-benchmark-v1',
    claimBoundary: SCION_ADAPTER_JUDGE_CLAIM_BOUNDARY,
    benchmark: Object.fromEntries(
      Object.entries(CANONICAL_PATHS).map(([key, relativePath]) => [key, { path: relativePath, sha256: hashes[key] }]),
    ),
    adapter: {
      id: adapterManifest.adapter.id,
      packageIdentitySha256: adapterPackageIdentitySha256,
      baseRevision: adapterManifest.base.revision,
      scale: 1,
    },
    base: { id: 'scion-base-only', model: adapterManifest.base.modelId, revision: adapterManifest.base.revision },
    paidReference,
    comparisons: Object.entries(comparisons).map(([role, row]) => ({
      role,
      path: path.relative(root, row.filePath).replaceAll('\\', '/'),
      sha256: row.sha256,
    })),
  };
  const evidencePath = path.join(root, 'single-model-judge.json');
  await writeJson(evidencePath, evidence);
  return { root, adapterManifest, adapterPackageIdentitySha256, evidence, evidencePath, comparisons };
}

async function audit(fixture) {
  return auditScionAdapterSingleModelJudgeEvidence({
    root: fixture.root,
    evidencePath: fixture.evidencePath,
    evidence: fixture.evidence,
    adapterManifest: fixture.adapterManifest,
    adapterPackageIdentitySha256: fixture.adapterPackageIdentitySha256,
    bootstrapSamples: 200,
  });
}

const roots = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe('Scion adapter single-model-judge promotion evidence', () => {
  it('keeps the published handoff template bound to the canonical ruler', async () => {
    const template = JSON.parse(
      await fs.readFile(path.join(SOURCE_ROOT, 'evaluation/scion-adapters/single-model-judge-promotion.template.json')),
    );
    expect(template.protocolVersion).toBe(SCION_ADAPTER_JUDGE_PROMOTION_PROTOCOL);
    expect(template.claimBoundary).toBe(SCION_ADAPTER_JUDGE_CLAIM_BOUNDARY);
    expect(template.adapter.packageIdentitySha256).toContain('PROMOTION_INDEPENDENT');
    expect(template.adapter.manifestSha256).toBeUndefined();
    for (const [key, relativePath] of Object.entries(CANONICAL_PATHS)) {
      const bytes = await fs.readFile(path.join(SOURCE_ROOT, relativePath));
      expect(template.benchmark[key]).toEqual({ path: relativePath, sha256: sha256(bytes) });
    }
  });

  it('accepts only a complete, byte-bound, reversed-order comparison against base and paid reference', async () => {
    const fixture = await buildFixture();
    roots.push(fixture.root);
    const report = await audit(fixture);
    expect(report.status).toBe('pass');
    expect(report.promotionEligible).toBe(true);
    expect(report.issues).toEqual([]);
    expect(report.comparisons).toHaveLength(2);
    expect(report.comparisons.every((row) => row.report.scoreOrderEffect.trialCount === 50)).toBe(true);
    expect(report.comparisons.every((row) => row.report.singleModelJudgePreference.judgeSessionCount === 2)).toBe(true);
  });

  it('rejects a hash-refreshed scorecard that cannot be recomputed from complete rubric reviews', async () => {
    const fixture = await buildFixture();
    roots.push(fixture.root);
    const row = fixture.comparisons['adapter-vs-base'];
    const output = row.comparison.trials[0].outputs.candidate;
    const hollow = {
      rubricVersion: '1.0.0',
      caseId: row.comparison.trials[0].caseId,
      sourceSha256: row.comparison.trials[0].sourceSha256,
      artifactSha256: output.outputSha256,
      validation: {
        selectedEvidenceClass: 'model-judge',
        tier: 'model-provisional',
        modelJudgeIdentity: {
          model: output.scoreEvidence.model,
          modelRevision: output.scoreEvidence.modelRevision,
          promptSha256: output.scoreEvidence.promptSha256,
        },
      },
      scores: { reportedScore: output.benchmarkScore },
      dimensions: DIMENSIONS.map((id) => ({ id, score: output.dimensionScores[id] })),
      reviewValidationIssues: [],
    };
    const scorecardPath = path.join(path.dirname(row.filePath), output.scoreEvidence.scorecardPath);
    output.scoreEvidence.scorecardSha256 = await writeJson(scorecardPath, hollow);
    row.sha256 = await writeJson(row.filePath, row.comparison);
    fixture.evidence.comparisons.find((entry) => entry.role === 'adapter-vs-base').sha256 = row.sha256;
    const report = await audit(fixture);
    expect(report.status).toBe('blocked');
    expect(
      report.issues.some((issue) => issue.includes('cannot be reproduced from both bound order-specific reviews')),
    ).toBe(true);
  });

  it('rejects one judge session reused across both presentation orders', async () => {
    const fixture = await buildFixture({ reuseJudgeSessionAcrossOrders: true });
    roots.push(fixture.root);
    const report = await audit(fixture);
    expect(report.status).toBe('blocked');
    expect(report.issues).toEqual(
      expect.arrayContaining([
        'adapter-vs-base:judge-order-sessions-must-be-two-distinct-isolated-runs',
        'adapter-vs-paid-reference:judge-order-sessions-must-be-two-distinct-isolated-runs',
      ]),
    );
  });

  it('rejects a winner without structured artifact-bound decision evidence', async () => {
    const fixture = await buildFixture();
    roots.push(fixture.root);
    const row = fixture.comparisons['adapter-vs-base'];
    delete row.comparison.trials[0].preferences[0].decisionEvidence;
    row.sha256 = await writeJson(row.filePath, row.comparison);
    fixture.evidence.comparisons.find((entry) => entry.role === 'adapter-vs-base').sha256 = row.sha256;
    const report = await audit(fixture);
    expect(report.status).toBe('blocked');
    expect(report.issues).toEqual(
      expect.arrayContaining(['adapter-vs-base:mandarin:trial-1:A/B:decision-evidence-missing']),
    );
  });

  it('unblinds the B/A label reversal instead of counting the same visible label as the same winner', async () => {
    const fixture = await buildFixture();
    roots.push(fixture.root);
    const row = fixture.comparisons['adapter-vs-base'];
    const trial = row.comparison.trials[0];
    const reverse = trial.preferences.find((preference) => preference.order === 'B/A');
    reverse.preference = trial.randomization.candidateLabel;
    const reversedCandidateLabel = trial.randomization.candidateLabel === 'A' ? 'B' : 'A';
    reverse.decisionEvidence = [
      {
        kind: 'defect',
        artifactLabel: reversedCandidateLabel,
        artifactSha256: trial.outputs.candidate.outputSha256,
        dimensionId: 'accuracy-source-fidelity',
        location: 'Anonymous package > representative source-bearing lesson',
        observation: 'The reversed-order candidate package contains the concrete defect behind the changed decision.',
      },
    ];
    row.sha256 = await writeJson(row.filePath, row.comparison);
    fixture.evidence.comparisons.find((entry) => entry.role === 'adapter-vs-base').sha256 = row.sha256;
    const report = await audit(fixture);
    expect(report.status).toBe('blocked');
    const baseReport = report.comparisons.find((comparison) => comparison.role === 'adapter-vs-base').report;
    expect(baseReport.singleModelJudgePreference.positionSensitiveOrIncompleteTrials).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ caseId: 'mandarin', trialIndex: 1, reason: 'position-sensitive-outcome' }),
      ]),
    );
  });

  it('rejects a hashable status object that contains no semantic comparison evidence', async () => {
    const fixture = await buildFixture();
    roots.push(fixture.root);
    fixture.evidence = { type: 'single-model-judge', status: 'pass' };
    const report = await audit(fixture);
    expect(report.status).toBe('blocked');
    expect(report.issues).toEqual(
      expect.arrayContaining([
        'evidence-schema-version',
        'evidence-protocol-version',
        'required-comparison-set-mismatch',
      ]),
    );
  });

  it('rejects missing reverse-order judgment even when the comparison file hash is refreshed', async () => {
    const fixture = await buildFixture();
    roots.push(fixture.root);
    const row = fixture.comparisons['adapter-vs-base'];
    row.comparison.trials[0].preferences.pop();
    row.sha256 = await writeJson(row.filePath, row.comparison);
    fixture.evidence.comparisons.find((entry) => entry.role === 'adapter-vs-base').sha256 = row.sha256;
    const report = await audit(fixture);
    expect(report.status).toBe('blocked');
    expect(report.issues).toEqual(
      expect.arrayContaining([
        'adapter-vs-base:mandarin:trial-1:requires-exact-reversed-order-pair',
        'adapter-vs-base:single-judge-completeness-failed',
      ]),
    );
  });

  it('rejects source substitution, incomplete dimensions, and unbalanced candidate placement', async () => {
    const fixture = await buildFixture();
    roots.push(fixture.root);
    const row = fixture.comparisons['adapter-vs-base'];
    const firstCase = row.comparison.trials.filter((trial) => trial.caseId === 'mandarin');
    firstCase[0].sourceSha256 = '0'.repeat(64);
    delete firstCase[1].outputs.candidate.dimensionScores['professional-craft'];
    firstCase[1].randomization.candidateLabel = 'A';
    firstCase[1].randomization.controlLabel = 'B';
    row.sha256 = await writeJson(row.filePath, row.comparison);
    fixture.evidence.comparisons.find((entry) => entry.role === 'adapter-vs-base').sha256 = row.sha256;
    const report = await audit(fixture);
    expect(report.status).toBe('blocked');
    expect(report.issues).toEqual(
      expect.arrayContaining([
        'adapter-vs-base:mandarin:candidate-side-not-balanced',
        'adapter-vs-base:mandarin:trial-1:source-sha256-mismatch',
        'adapter-vs-base:mandarin:trial-2:candidate:dimension-set-mismatch',
      ]),
    );
  });

  it('rejects a floating paid alias and candidate artifacts that are not reused across controls', async () => {
    const fixture = await buildFixture();
    roots.push(fixture.root);
    fixture.evidence.paidReference.modelRevision = 'gpt-5.4-mini';
    const row = fixture.comparisons['adapter-vs-paid-reference'];
    row.comparison.trials[0].outputs.candidate.outputSha256 = '9'.repeat(64);
    row.sha256 = await writeJson(row.filePath, row.comparison);
    fixture.evidence.comparisons.find((entry) => entry.role === 'adapter-vs-paid-reference').sha256 = row.sha256;
    const report = await audit(fixture);
    expect(report.status).toBe('blocked');
    expect(report.issues).toEqual(
      expect.arrayContaining([
        'paid-reference-binding-mismatch',
        'adapter-vs-paid-reference:control-model-identity-mismatch',
        'mandarin:1:candidate-outputSha256-not-reused',
      ]),
    );
  });
});
