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

async function buildFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-judge-promotion-'));
  const hashes = await copyCanonical(root);
  const heldOut = JSON.parse(await fs.readFile(path.join(root, CANONICAL_PATHS.heldOutCourseBenchmark), 'utf8'));
  const adapterManifestSha256 = 'c'.repeat(64);
  const adapterManifest = {
    adapter: { id: 'scion-g4e2b-test-adapter', scale: 1 },
    base: { modelId: heldOut.base.modelId, revision: heldOut.base.revision },
  };
  const judge = {
    model: 'openai/codex',
    modelRevision: 'gpt-5.4-session-judge-revision',
    promptSha256: hashes.judgePrompt,
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

  const scoreEvidence = async ({ caseId, sourceSha256, artifactSha256, side, trialIndex, score }) => {
    const relative = `scorecards/${caseId}-${trialIndex}-${side}.json`;
    const scorecard = {
      rubricVersion: '1.0.0',
      caseId,
      sourceSha256,
      artifactSha256,
      validation: {
        selectedEvidenceClass: 'model-judge',
        tier: 'model-provisional',
        modelJudgeIdentity: {
          model: judge.model,
          modelRevision: judge.modelRevision,
          promptSha256: judge.promptSha256,
        },
      },
      scores: { reportedScore: score },
      dimensions: DIMENSIONS.map((id) => ({ id, score })),
      reviewValidationIssues: [],
    };
    const scorecardSha256 = await writeJson(path.join(root, 'comparisons', relative), scorecard);
    return {
      rubricVersion: '1.0.0',
      rubricSha256: hashes.rubric,
      scorecardSha256,
      scorecardPath: relative,
      evidenceClass: 'model-judge',
      validationTier: 'model-provisional',
      model: judge.model,
      modelRevision: judge.modelRevision,
      promptSha256: judge.promptSha256,
      sourceSha256,
      artifactSha256,
    };
  };

  const candidateOutputs = new Map();
  for (const course of heldOut.courses) {
    for (let trialIndex = 1; trialIndex <= 10; trialIndex += 1) {
      const key = `${course.courseId}\0${trialIndex}`;
      const outputSha256 = sha256(`candidate:${key}`);
      candidateOutputs.set(key, {
        modelId: adapterManifest.adapter.id,
        status: 'success',
        outputSha256,
        latencyMs: 900,
        costUsd: 0,
        providerCalls: 40,
        retryCount: 0,
        benchmarkScore: 79,
        dimensionScores: Object.fromEntries(DIMENSIONS.map((id) => [id, 79])),
        compilerBurden: { scionCalls: 40, repairCalls: 1, rejectedAtoms: 1, recoveredAtoms: 1 },
        scoreEvidence: await scoreEvidence({
          caseId: course.courseId,
          sourceSha256: course.sourcePacketSha256,
          artifactSha256: outputSha256,
          side: 'candidate',
          trialIndex,
          score: 79,
        }),
      });
    }
  }

  const makeComparison = async (role) => {
    const isBase = role === 'adapter-vs-base';
    const controlId = isBase ? 'scion-base-only' : paidReference.id;
    const controlScore = isBase ? 68 : 70;
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
          adapterManifestSha256,
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
        const controlEvidence = await scoreEvidence({
          caseId: course.courseId,
          sourceSha256: course.sourcePacketSha256,
          artifactSha256: controlHash,
          side: isBase ? 'base' : 'paid',
          trialIndex,
          score: controlScore,
        });
        const candidateLabel = trialIndex % 2 ? 'A' : 'B';
        const controlLabel = candidateLabel === 'A' ? 'B' : 'A';
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
              benchmarkScore: controlScore,
              dimensionScores: Object.fromEntries(DIMENSIONS.map((id) => [id, controlScore])),
              compilerBurden: {
                scionCalls: isBase ? 50 : 45,
                repairCalls: 2,
                rejectedAtoms: 2,
                recoveredAtoms: 1,
              },
              scoreEvidence: controlEvidence,
            },
          },
          preferences: ['A/B', 'B/A'].map((order, passIndex) => ({
            reviewerId: `${role}-${course.courseId}-${trialIndex}-pass-${passIndex + 1}`,
            evidenceClass: 'model-judge',
            model: judge.model,
            modelRevision: judge.modelRevision,
            promptSha256: judge.promptSha256,
            blinded: true,
            preference: candidateLabel,
            order,
            rationale: 'The candidate has stronger bound scores across accuracy, alignment, usability, and coherence.',
            reviewedAt: '2026-07-13T12:00:00Z',
            candidateArtifactSha256: candidate.outputSha256,
            controlArtifactSha256: controlHash,
            candidateScorecardSha256: candidate.scoreEvidence.scorecardSha256,
            controlScorecardSha256: controlEvidence.scorecardSha256,
            scoredBeforePreference: true,
          })),
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
      manifestSha256: adapterManifestSha256,
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
  return { root, adapterManifest, adapterManifestSha256, evidence, evidencePath, comparisons };
}

async function audit(fixture) {
  return auditScionAdapterSingleModelJudgeEvidence({
    root: fixture.root,
    evidencePath: fixture.evidencePath,
    evidence: fixture.evidence,
    adapterManifest: fixture.adapterManifest,
    adapterManifestSha256: fixture.adapterManifestSha256,
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
