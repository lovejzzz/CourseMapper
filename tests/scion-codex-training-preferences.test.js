import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildScionAdapterDataset } from '../scripts/scionAdapterDataset.mjs';
import { buildScionBlindReviewPacket } from '../scripts/scionBlindReviewPacket.mjs';
import {
  applyScionCodexTrainingDecisions,
  buildScionCodexTrainingReviewTemplates,
  ingestScionCodexSealedTrainingReviews,
  ingestScionCodexTrainingReviews,
  sealScionCodexTrainingReviewPass,
  unsealScionCodexTrainingReviewPass,
  validateScionCodexTrainingReviewPass,
  verifyScionCodexJudgeCampaignReceipt,
  verifyScionSealedCodexReviewEnvelope,
} from '../scripts/scionCodexTrainingPreferences.mjs';
import { assessCorpusRow } from '../scripts/scionPreferenceCorpusAudit.mjs';
import { validateScionCodexTrainingPreferenceEvidence } from '../src/lib/scionCodexTrainingEvidence.js';

let root = '';

afterEach(async () => {
  if (root) await fs.rm(root, { recursive: true, force: true });
  root = '';
});

function goodMc(overrides = {}) {
  return {
    q: 'Which evidence most directly supports revising the prototype navigation?',
    op: [
      'Three participants fail the same labeled task',
      'One participant says the colors look pleasant',
      'The designer prefers the original navigation',
      'A stakeholder requests a larger project logo',
    ],
    ai: 0,
    ex: 'Repeated task failure is direct behavioral evidence, whereas the other options do not demonstrate a navigation breakdown.',
    ...overrides,
  };
}

async function buildPacket() {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-codex-training-'));
  const source = path.join(root, 'source.jsonl');
  const packetDir = path.join(root, 'packet');
  await fs.writeFile(
    source,
    `${JSON.stringify({
      kind: 'mc-item',
      prompt: 'Write one source-grounded navigation assessment item.',
      left: JSON.stringify(goodMc()),
      right: JSON.stringify(
        goodMc({ q: 'Which observation should the design team consider before revising navigation?' }),
      ),
      domain: 'user-experience-design',
      courseGroupId: 'ux-research-studio',
      pairSource: { courseInputSha256: '1'.repeat(64) },
      lessonId: 'lesson-1',
      sourceContext: {
        kernelId: 'ux-source-1',
        term: 'Task-based usability evidence',
        claims: ['Repeated failure on the same task is stronger navigation evidence than a single taste preference.'],
        attribution: ['Digital.gov usability guidance'],
        license: 'public-guidance',
      },
    })}\n`,
  );
  const packet = await buildScionBlindReviewPacket({ sources: [source], outputDir: packetDir, limit: 1 });
  const templateDir = path.join(root, 'templates');
  const templates = await buildScionCodexTrainingReviewTemplates({ packetDir, outputDir: templateDir });
  return { packet, packetDir, templateDir, templates };
}

async function completedBatch(file, { sessionId, winnerSide = 'A', decision = 'winner' } = {}) {
  const batch = JSON.parse(await fs.readFile(file, 'utf8'));
  batch.judge.revision = 'codex-test-revision-2026-07-14';
  batch.judge.runtime = 'vitest-isolated-session';
  batch.judge.sessionId = sessionId;
  batch.previousOutcomeAvailable = false;
  batch.contextResetAttestation = true;
  batch.attestation = true;
  batch.completedAt = '2026-07-14T05:00:00.000Z';
  for (const review of batch.reviews) {
    review.scorecards = review.presentation.map((artifact) => {
      const winner = artifact.anonymousSide === winnerSide;
      const insufficient = decision === 'insufficient-evidence';
      const tied = decision === 'tie';
      return {
        position: artifact.position,
        anonymousSide: artifact.anonymousSide,
        artifactSha256: artifact.artifactSha256,
        evaluationStatus: insufficient ? 'insufficient-evidence' : 'scored',
        scores: insufficient
          ? {
              factualCorrectness: null,
              sourceFidelity: null,
              teachability: null,
              coherence: null,
              taskQuality: null,
            }
          : winner || tied
            ? {
                factualCorrectness: 5,
                sourceFidelity: 5,
                teachability: 5,
                coherence: 5,
                taskQuality: 5,
              }
            : {
                factualCorrectness: 4,
                sourceFidelity: 4,
                teachability: 4,
                coherence: 4,
                taskQuality: 3,
              },
        evidence: [
          insufficient
            ? 'The supplied bytes do not provide enough evidence for a defensible atom-level comparison.'
            : winner
              ? 'The item asks for the direct behavioral evidence named in the neutral source claim.'
              : 'The item weakens the decision by asking what should merely be considered.',
        ],
        defects: insufficient
          ? ['The available evidence cannot support a reliable score for this artifact.']
          : winner || tied
            ? []
            : ['The stem does not require selecting the strongest source-supported evidence.'],
      };
    });
    review.preference = {
      scoredBeforePreference: true,
      decision,
      winnerPosition:
        decision === 'winner'
          ? review.presentation.find((artifact) => artifact.anonymousSide === winnerSide).position
          : null,
      rationale:
        decision === 'winner'
          ? 'The winning side operationalizes the supplied source claim and elicits a more defensible evidence judgment.'
          : decision === 'tie'
            ? 'Both anonymous artifacts are equally accurate, source-grounded, coherent, teachable, and useful as written.'
            : 'The available source or artifact evidence is insufficient for a defensible comparative preference decision.',
      decisionDefects:
        decision === 'winner'
          ? ['The losing stem permits a vague relevance judgment instead of direct evidence selection.']
          : decision === 'tie'
            ? ['Neither artifact has a concrete quality advantage that would justify manufacturing a winner.']
            : ['The evidence boundary prevents reliable comparative scoring and therefore prevents a preference.'],
    };
  }
  return batch;
}

async function writeCompletedBatches(templateDir, options = {}) {
  const abPath = path.join(root, 'completed-a-b.json');
  const baPath = path.join(root, 'completed-b-a.json');
  const ab = await completedBatch(path.join(templateDir, 'codex-review-a-b.json'), {
    sessionId: options.sessionA || 'codex-session-a',
    winnerSide: options.winnerA || 'A',
    decision: options.decisionA || options.decision || 'winner',
  });
  const ba = await completedBatch(path.join(templateDir, 'codex-review-b-a.json'), {
    sessionId: options.sessionB || 'codex-session-b',
    winnerSide: options.winnerB || 'A',
    decision: options.decisionB || options.decision || 'winner',
  });
  await fs.writeFile(abPath, JSON.stringify(ab));
  await fs.writeFile(baPath, JSON.stringify(ba));
  return { abPath, baPath, ab, ba };
}

async function sealCompletedBatches(packetDir, templateDir, options = {}) {
  const completed = await writeCompletedBatches(templateDir, options);
  const abSealed = path.join(root, 'sealed', 'a-b.sealed.json');
  const baSealed = path.join(root, 'sealed', 'b-a.sealed.json');
  const abKey = path.join(root, 'keys', 'a-b.key');
  const baKey = path.join(root, 'keys', 'b-a.key');
  await sealScionCodexTrainingReviewPass({
    packetDir,
    reviewFile: completed.abPath,
    sealedOutput: abSealed,
    keyOutput: abKey,
    deletePlaintext: true,
  });
  await sealScionCodexTrainingReviewPass({
    packetDir,
    reviewFile: completed.baPath,
    sealedOutput: baSealed,
    keyOutput: baKey,
    deletePlaintext: true,
  });
  return { ...completed, abSealed, baSealed, abKey, baKey };
}

describe('Scion Codex training preferences', () => {
  it('builds separate reversed-order templates from source-backed anonymous cases', async () => {
    const { packet, templates, templateDir } = await buildPacket();
    expect(packet.meta).toMatchObject({ protocol: 'scion-blind-atom-packet-v4', selectedCases: 1 });
    expect(templates.receipt).toMatchObject({
      schemaVersion: 2,
      protocol: 'scion-codex-training-review-v2',
      selectedCases: 1,
      excludedMissingSourceContext: 0,
      requiredOrders: ['A/B', 'B/A'],
      requiredFreshSessions: 2,
      scoreBeforePreference: true,
    });
    const ab = JSON.parse(await fs.readFile(path.join(templateDir, 'codex-review-a-b.json'), 'utf8'));
    const ba = JSON.parse(await fs.readFile(path.join(templateDir, 'codex-review-b-a.json'), 'utf8'));
    expect(ab.reviews[0].presentation.map((artifact) => artifact.anonymousSide)).toEqual(['A', 'B']);
    expect(ba.reviews[0].presentation.map((artifact) => artifact.anonymousSide)).toEqual(['B', 'A']);
    expect(ab.reviews[0]).toMatchObject({
      sourceContext: {
        term: 'Task-based usability evidence',
        claims: ['Repeated failure on the same task is stronger navigation evidence than a single taste preference.'],
      },
      evidenceScope: {
        unit: 'source-bound-training-atom',
        excludedConstructs: expect.arrayContaining(['export-integrity', 'compiler-burden', 'device-runtime']),
      },
    });
    expect(ab.judge).toMatchObject({
      promptPath: 'evaluation/quality-benchmark/v1/single-model-training-atom-judge-prompt-v2.md',
      promptSha256: '0f062d551af9e2704892e5f1ebdf9b4c66a6d79de6ac1c9cf39b7cb4fa15ecd7',
    });
    expect(ab).toMatchObject({ humanEvidence: false, independentEvidence: false });

    const retainedEvidence = path.join(templateDir, 'sealed-evidence', 'retained.key');
    await fs.mkdir(path.dirname(retainedEvidence), { recursive: true });
    await fs.writeFile(retainedEvidence, 'must-survive-template-regeneration');
    await buildScionCodexTrainingReviewTemplates({ packetDir: path.join(root, 'packet'), outputDir: templateDir });
    await expect(fs.readFile(retainedEvidence, 'utf8')).resolves.toBe('must-survive-template-regeneration');
  });

  it('ingests one stable scoring-first Codex preference and binds every pass and scorecard', async () => {
    const { packetDir, templateDir } = await buildPacket();
    const { abPath, baPath } = await writeCompletedBatches(templateDir);
    const approvedOutput = path.join(root, 'approved.jsonl');
    const report = await ingestScionCodexTrainingReviews({
      packetDir,
      reviewFiles: [baPath, abPath],
      approvedOutput,
    });
    expect(report).toMatchObject({
      reviewedCases: 1,
      approved: 1,
      quarantined: 0,
      orders: ['A/B', 'B/A'],
      claimBoundary: expect.stringContaining('single-model'),
    });
    const row = JSON.parse((await fs.readFile(approvedOutput, 'utf8')).trim());
    expect(assessCorpusRow(row)).toMatchObject({ eligible: true, issues: [] });
    expect(validateScionCodexTrainingPreferenceEvidence(row.preferenceEvidence)).toMatchObject({
      valid: true,
      issues: [],
    });
    expect(row.preferenceEvidence).toMatchObject({
      kind: 'single-model-judge-preference',
      stable: true,
      scoredBeforePreference: true,
      humanEvidence: false,
      independentEvidence: false,
      orders: ['A/B', 'B/A'],
      passHashes: [expect.stringMatching(/^[a-f0-9]{64}$/), expect.stringMatching(/^[a-f0-9]{64}$/)],
      scorecardHashes: expect.arrayContaining([expect.stringMatching(/^[a-f0-9]{64}$/)]),
      trainingPairSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      winnerMinimumScores: {
        factualCorrectness: 5,
        sourceFidelity: 5,
        teachability: 5,
        coherence: 5,
        taskQuality: 5,
      },
    });
    expect(row.sourceContext).toMatchObject({
      kernelId: expect.any(String),
      claims: expect.any(Array),
    });
    expect(crypto.createHash('sha256').update(JSON.stringify(row.sourceContext)).digest('hex')).toBe(
      row.preferenceEvidence.sourceContextSha256,
    );

    const dataset = await buildScionAdapterDataset({
      sources: [approvedOutput],
      outputDir: path.join(root, 'dataset'),
      allowSmoke: true,
    });
    expect(dataset.manifest).toMatchObject({
      schemaVersion: 4,
      primaryPreferenceEvidence: 'single-model-judge',
      status: 'smoke-only',
      counts: { total: 1, singleModelJudgePairs: 1, singleModelJudgeDomains: 1, blindInstructorPairs: 0 },
      modelJudgeDomainCounts: { 'user-experience-design': 1 },
      sourceGroundingPolicy: {
        requiredForModelJudge: true,
        promptEmbeddingEnabled: true,
        sourceBoundModelJudgePairs: 1,
        unboundAdmittedModelJudgePairs: 0,
      },
    });
    const trainingRows = (
      await Promise.all(
        ['train', 'valid', 'test'].map((split) => fs.readFile(path.join(root, 'dataset', `${split}.jsonl`), 'utf8')),
      )
    )
      .join('')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(JSON.parse);
    expect(trainingRows).toHaveLength(1);
    expect(trainingRows[0].chosen[0].content).toContain('Source context:');
    expect(trainingRows[0].chosen[0].content).toContain(row.sourceContext.claims[0]);
    expect(trainingRows[0].chosen[0].content).not.toContain(row.sourceContext.sourcePacketSha256);
    expect(trainingRows[0].provenance).toMatchObject({
      promptProtocol: 'source-bound-row-prompt-v1',
      sourceContextSha256: row.preferenceEvidence.sourceContextSha256,
    });
  });

  it('uses the losing scorecards as concrete decision-defect evidence when the preference array is empty', async () => {
    const { packetDir, templateDir } = await buildPacket();
    const batches = await writeCompletedBatches(templateDir);
    for (const batch of [batches.ab, batches.ba]) batch.reviews[0].preference.decisionDefects = [];
    await fs.writeFile(batches.abPath, JSON.stringify(batches.ab));
    await fs.writeFile(batches.baPath, JSON.stringify(batches.ba));
    const approvedOutput = path.join(root, 'scorecard-defect-fallback.jsonl');

    const report = await ingestScionCodexTrainingReviews({
      packetDir,
      reviewFiles: [batches.abPath, batches.baPath],
      approvedOutput,
    });

    expect(report).toMatchObject({ approved: 1, quarantined: 0, analysis: { stableWinners: 1 } });
    const row = JSON.parse((await fs.readFile(approvedOutput, 'utf8')).trim());
    expect(row.preferenceEvidence.decisionDefects).toEqual([
      expect.stringMatching(/^A\/B: /),
      expect.stringMatching(/^B\/A: /),
    ]);
    expect(validateScionCodexTrainingPreferenceEvidence(row.preferenceEvidence)).toMatchObject({
      valid: true,
      issues: [],
    });
  });

  it('still quarantines a winner when neither the preference nor losing scorecard records a defect', async () => {
    const { packetDir, templateDir } = await buildPacket();
    const batches = await writeCompletedBatches(templateDir);
    for (const batch of [batches.ab, batches.ba]) {
      const review = batch.reviews[0];
      review.preference.decisionDefects = [];
      review.scorecards[review.preference.winnerPosition === 1 ? 1 : 0].defects = [];
    }
    await fs.writeFile(batches.abPath, JSON.stringify(batches.ab));
    await fs.writeFile(batches.baPath, JSON.stringify(batches.ba));

    const report = await ingestScionCodexTrainingReviews({
      packetDir,
      reviewFiles: [batches.abPath, batches.baPath],
      approvedOutput: path.join(root, 'missing-defects.jsonl'),
    });

    expect(report).toMatchObject({ approved: 0, quarantined: 1 });
    expect(report.quarantine[0].issues).toEqual(['A/B:loser-defects-empty', 'B/A:loser-defects-empty']);
  });

  it('analyzes but never approves cross-order results when judge revision and runtime drift together', async () => {
    const { packetDir, templateDir } = await buildPacket();
    const { abPath, baPath } = await writeCompletedBatches(templateDir);
    const ba = JSON.parse(await fs.readFile(baPath, 'utf8'));
    ba.judge.revision = 'codex-test-revision-2026-07-15';
    ba.judge.runtime = 'vitest-updated-runtime';
    await fs.writeFile(baPath, JSON.stringify(ba));
    const approvedOutput = path.join(root, 'cross-revision-approved.jsonl');

    const report = await ingestScionCodexTrainingReviews({
      packetDir,
      reviewFiles: [abPath, baPath],
      approvedOutput,
    });

    expect(report).toMatchObject({
      reviewedCases: 1,
      approved: 0,
      quarantined: 1,
      judgeIdentityCompatible: false,
      analysis: {
        status: 'analysis-only-judge-identity-confounded',
        stableWinners: 1,
        stableTies: 0,
        crossOrderAgreement: 1,
        agreementRate: 1,
      },
      claimBoundary: expect.stringContaining('no training preference is approved'),
    });
    expect(report.quarantine).toEqual([expect.objectContaining({ issues: ['cross-order-judge-identity-drift'] })]);
    await expect(fs.readFile(approvedOutput, 'utf8')).resolves.toBe('');
  });

  it('ingests two distinct sealed orders entirely in memory and emits only qualified corpus evidence', async () => {
    const { packetDir, templateDir } = await buildPacket();
    const sealed = await sealCompletedBatches(packetDir, templateDir);
    const approvedOutput = path.join(root, 'sealed-approved.jsonl');
    const reportOutput = path.join(root, 'tracked-evidence', 'sealed-ingestion.json');
    const report = await ingestScionCodexSealedTrainingReviews({
      packetDir,
      sealedFiles: [sealed.baSealed, sealed.abSealed],
      keyFiles: [sealed.baKey, sealed.abKey],
      approvedOutput,
      reportOutput,
    });
    expect(report.reportPath).toBe(reportOutput);
    expect(report).toMatchObject({
      reviewedCases: 1,
      approved: 1,
      quarantined: 0,
      orders: ['A/B', 'B/A'],
      inputMode: 'sealed-dual-order',
      plaintextWrittenByIngestion: false,
      plaintextWritten: false,
      outcomeDisclosure: 'combined-after-two-sealed-orders',
      sealedInputs: [
        {
          order: 'A/B',
          envelopeSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          keySha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          plaintextSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          reviewCount: 1,
          validationStatus: 'structurally-valid-complete',
        },
        {
          order: 'B/A',
          envelopeSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          keySha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          plaintextSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          reviewCount: 1,
          validationStatus: 'structurally-valid-complete',
        },
      ],
    });
    await expect(fs.access(sealed.abPath)).rejects.toThrow();
    await expect(fs.access(sealed.baPath)).rejects.toThrow();
    const row = JSON.parse((await fs.readFile(approvedOutput, 'utf8')).trim());
    expect(assessCorpusRow(row)).toMatchObject({ eligible: true, issues: [] });
    const persistedReport = JSON.parse(await fs.readFile(report.reportPath, 'utf8'));
    expect(persistedReport).toMatchObject({
      inputMode: 'sealed-dual-order',
      plaintextWrittenByIngestion: false,
      approved: 1,
      quarantined: 0,
    });
    expect(JSON.stringify(persistedReport)).not.toContain('winnerPosition');
  });

  it('requires a complete distinct sealed pair and leaves existing outputs untouched when either key fails', async () => {
    const { packetDir, templateDir } = await buildPacket();
    const sealed = await sealCompletedBatches(packetDir, templateDir);
    const approvedOutput = path.join(root, 'retained-approved.jsonl');
    const retainedReport = path.join(packetDir, 'organizer', 'codex-ingestion-report.json');
    await fs.writeFile(approvedOutput, 'retained-corpus-bytes\n');
    await fs.writeFile(retainedReport, 'retained-report-bytes\n');
    await expect(
      ingestScionCodexSealedTrainingReviews({
        packetDir,
        sealedFiles: [sealed.abSealed],
        keyFiles: [sealed.abKey],
        approvedOutput,
      }),
    ).rejects.toThrow('exactly two envelopes and two keys');
    await expect(
      ingestScionCodexSealedTrainingReviews({
        packetDir,
        sealedFiles: [sealed.abSealed, sealed.baSealed],
        keyFiles: [sealed.abKey, sealed.abKey],
        approvedOutput,
      }),
    ).rejects.toThrow('two distinct key files');

    const copiedEnvelope = path.join(root, 'sealed', 'copied-a-b.json');
    const copiedKey = path.join(root, 'keys', 'copied-a-b.key');
    await fs.copyFile(sealed.abSealed, copiedEnvelope);
    await fs.copyFile(sealed.abKey, copiedKey);
    await expect(
      ingestScionCodexSealedTrainingReviews({
        packetDir,
        sealedFiles: [sealed.abSealed, copiedEnvelope],
        keyFiles: [sealed.abKey, copiedKey],
        approvedOutput,
      }),
    ).rejects.toThrow('two distinct envelope identities');

    await expect(
      ingestScionCodexSealedTrainingReviews({
        packetDir,
        sealedFiles: [sealed.abSealed, sealed.baSealed],
        keyFiles: [sealed.baKey, sealed.abKey],
        approvedOutput,
      }),
    ).rejects.toThrow('key mismatch');

    const invalidKey = path.join(root, 'keys', 'invalid-b-a.key');
    await fs.writeFile(invalidKey, 'not-a-canonical-key\n');
    await expect(
      ingestScionCodexSealedTrainingReviews({
        packetDir,
        sealedFiles: [sealed.abSealed, sealed.baSealed],
        keyFiles: [sealed.abKey, invalidKey],
        approvedOutput,
      }),
    ).rejects.toThrow('key mismatch');
    await expect(fs.readFile(approvedOutput, 'utf8')).resolves.toBe('retained-corpus-bytes\n');
    await expect(fs.readFile(retainedReport, 'utf8')).resolves.toBe('retained-report-bytes\n');
  });

  it('quarantines position-sensitive decisions instead of manufacturing consensus', async () => {
    const { packetDir, templateDir } = await buildPacket();
    const { abPath, baPath } = await writeCompletedBatches(templateDir, { winnerA: 'A', winnerB: 'B' });
    const report = await ingestScionCodexTrainingReviews({
      packetDir,
      reviewFiles: [abPath, baPath],
      approvedOutput: path.join(root, 'position-sensitive.jsonl'),
    });
    expect(report).toMatchObject({ approved: 0, quarantined: 1 });
    expect(report.quarantine[0].issues).toContain('position-sensitive-model-judge');
  });

  it('preserves stable ties and insufficient evidence without creating training preferences', async () => {
    const tied = await buildPacket();
    const tiedBatches = await writeCompletedBatches(tied.templateDir, { decision: 'tie' });
    for (const batch of [tiedBatches.ab, tiedBatches.ba]) {
      batch.reviews[0].scorecards[0].scores.taskQuality = 4;
      batch.reviews[0].preference.decisionDefects = [];
    }
    await fs.writeFile(tiedBatches.abPath, JSON.stringify(tiedBatches.ab));
    await fs.writeFile(tiedBatches.baPath, JSON.stringify(tiedBatches.ba));
    const tiedReport = await ingestScionCodexTrainingReviews({
      packetDir: tied.packetDir,
      reviewFiles: [tiedBatches.abPath, tiedBatches.baPath],
      approvedOutput: path.join(root, 'ties.jsonl'),
    });
    expect(tiedReport).toMatchObject({ approved: 0, quarantined: 1 });
    expect(tiedReport.quarantine[0].issues).toEqual(['stable-tie-model-judge']);

    await fs.rm(root, { recursive: true, force: true });
    root = '';
    const insufficient = await buildPacket();
    const insufficientBatches = await writeCompletedBatches(insufficient.templateDir, {
      decision: 'insufficient-evidence',
    });
    for (const batch of [insufficientBatches.ab, insufficientBatches.ba]) {
      for (const card of batch.reviews[0].scorecards) {
        card.evaluationStatus = 'scored';
        card.scores = {
          factualCorrectness: 3,
          sourceFidelity: 3,
          teachability: 3,
          coherence: 3,
          taskQuality: 3,
        };
      }
      batch.reviews[0].preference.decisionDefects = [];
    }
    await fs.writeFile(insufficientBatches.abPath, JSON.stringify(insufficientBatches.ab));
    await fs.writeFile(insufficientBatches.baPath, JSON.stringify(insufficientBatches.ba));
    const insufficientReport = await ingestScionCodexTrainingReviews({
      packetDir: insufficient.packetDir,
      reviewFiles: [insufficientBatches.abPath, insufficientBatches.baPath],
      approvedOutput: path.join(root, 'insufficient.jsonl'),
    });
    expect(insufficientReport).toMatchObject({ approved: 0, quarantined: 1 });
    expect(insufficientReport.quarantine[0].issues).toEqual(['insufficient-evidence-model-judge']);
  });

  it('retains a no-margin relative winner as non-qualifying evidence instead of rewriting the decision', async () => {
    const { packetDir, templateDir } = await buildPacket();
    const batches = await writeCompletedBatches(templateDir);
    for (const batch of [batches.ab, batches.ba]) {
      const review = batch.reviews[0];
      const winnerCard = review.scorecards[review.preference.winnerPosition - 1];
      const loserCard = review.scorecards[review.preference.winnerPosition === 1 ? 1 : 0];
      winnerCard.scores = Object.fromEntries(Object.keys(winnerCard.scores).map((dimension) => [dimension, 4]));
      loserCard.scores = structuredClone(winnerCard.scores);
    }
    await fs.writeFile(batches.abPath, JSON.stringify(batches.ab));
    await fs.writeFile(batches.baPath, JSON.stringify(batches.ba));

    const firstPass = await validateScionCodexTrainingReviewPass({ packetDir, reviewFile: batches.abPath });
    expect(firstPass).toMatchObject({ status: 'structurally-valid-complete', structuralIssues: [] });
    expect(firstPass.qualificationIssues).toEqual([
      expect.stringContaining('winning-side-without-positive-score-margin'),
    ]);

    const report = await ingestScionCodexTrainingReviews({
      packetDir,
      reviewFiles: [batches.abPath, batches.baPath],
      approvedOutput: path.join(root, 'no-margin.jsonl'),
    });
    expect(report).toMatchObject({ approved: 0, quarantined: 1 });
    expect(report.quarantine[0].issues).toEqual(
      expect.arrayContaining([
        'A/B:winning-side-without-positive-score-margin',
        'B/A:winning-side-without-positive-score-margin',
      ]),
    );
  });

  it('validates, seals, verifies, and restores one complete pass without disclosing its outcomes', async () => {
    const { packetDir, templateDir } = await buildPacket();
    const templateFile = path.join(templateDir, 'codex-review-a-b.json');
    const decisionsFile = path.join(root, 'decisions.json');
    const reviewFile = path.join(root, 'completed-pass.json');
    const sealedOutput = path.join(root, 'sealed', 'a-b.json');
    const keyOutput = path.join(root, 'secret', 'a-b.key');
    const restoredOutput = path.join(root, 'restored', 'a-b.json');
    const completed = await completedBatch(templateFile, {
      sessionId: 'sealed-session-a',
    });
    const templateRaw = await fs.readFile(templateFile);
    await fs.writeFile(
      decisionsFile,
      JSON.stringify({
        schemaVersion: 1,
        protocol: 'scion-codex-training-decisions-v1',
        templateSha256: crypto.createHash('sha256').update(templateRaw).digest('hex'),
        order: 'A/B',
        judge: completed.judge,
        previousOutcomeAvailable: false,
        contextResetAttestation: true,
        attestation: true,
        completedAt: completed.completedAt,
        decisions: completed.reviews.map((review) => ({
          pairId: review.pairId,
          scorecards: review.scorecards.map(({ position, evaluationStatus, scores, evidence, defects }) => ({
            position,
            evaluationStatus,
            scores,
            evidence,
            defects,
          })),
          preference: review.preference,
        })),
      }),
    );
    const applied = await applyScionCodexTrainingDecisions({
      packetDir,
      templateFile,
      decisionsFile,
      outputFile: reviewFile,
    });
    expect(applied.validation).toMatchObject({ status: 'structurally-valid-complete', submittedReviews: 1 });

    const validation = await validateScionCodexTrainingReviewPass({ packetDir, reviewFile });
    expect(validation).toMatchObject({
      status: 'structurally-valid-complete',
      expectedReviews: 1,
      submittedReviews: 1,
      structuralIssues: [],
    });
    const sealed = await sealScionCodexTrainingReviewPass({
      packetDir,
      reviewFile,
      sealedOutput,
      keyOutput,
      deletePlaintext: true,
    });
    expect(verifyScionSealedCodexReviewEnvelope(sealed.envelope)).toEqual({ valid: true, issues: [] });
    expect(sealed.envelope).not.toHaveProperty('outcomes');
    expect(JSON.stringify(sealed.envelope)).not.toContain('winnerPosition');
    await expect(fs.access(reviewFile)).rejects.toThrow();
    expect((await fs.stat(keyOutput)).mode & 0o777).toBe(0o600);
    const envelopeRaw = await fs.readFile(sealedOutput);
    const receipt = {
      schemaVersion: 1,
      protocol: 'scion-codex-judge-campaign-receipt-v1',
      status: 'first-order-sealed',
      packet: { ...sealed.envelope.sourcePacket, sourceBackedCases: 1 },
      reviewProtocol: sealed.envelope.reviewProtocol,
      requiredOrders: ['A/B', 'B/A'],
      completedOrders: ['A/B'],
      completedOrderBatches: 1,
      completedPerCasePasses: 1,
      requiredPerCasePasses: 2,
      remainingPerCasePasses: 1,
      stablePreferences: 0,
      approvedTrainingPairs: 0,
      qualifyingTrainingRows: 0,
      outcomeDisclosure: 'sealed',
      trackedDecryptionKey: false,
      keyCustody: {
        status: 'local-roundtrip-verified-at-release',
        trackedCopies: 0,
        localCopies: 2,
        fileMode: '0600',
        recoverableInFreshClone: false,
        plaintextSha256: sealed.envelope.plaintextSha256,
      },
      sealedEnvelope: {
        sha256: crypto.createHash('sha256').update(envelopeRaw).digest('hex'),
        reviewCount: 1,
        validationStatus: 'structurally-valid-complete',
      },
      judgePrompt: {
        path: sealed.envelope.judge.promptPath,
        sha256: sealed.envelope.judge.promptSha256,
      },
      claimBoundary: 'One outcome-sealed single-model Codex pass proves no stable preference.',
    };
    expect(verifyScionCodexJudgeCampaignReceipt(receipt, sealed.envelope, envelopeRaw)).toEqual({
      valid: true,
      issues: [],
    });
    expect(
      verifyScionCodexJudgeCampaignReceipt({ ...receipt, stablePreferences: 1 }, sealed.envelope, envelopeRaw),
    ).toMatchObject({ valid: false, issues: ['stablePreferences'] });
    expect(
      verifyScionCodexJudgeCampaignReceipt(
        { ...receipt, keyCustody: { ...receipt.keyCustody, localCopies: 1 } },
        sealed.envelope,
        envelopeRaw,
      ),
    ).toMatchObject({ valid: false, issues: ['key-custody-local-copies'] });

    const restored = await unsealScionCodexTrainingReviewPass({
      packetDir,
      sealedFile: sealedOutput,
      keyFile: keyOutput,
      outputFile: restoredOutput,
    });
    expect(restored.validation).toMatchObject({ status: 'structurally-valid-complete', submittedReviews: 1 });
    expect(JSON.parse(await fs.readFile(restoredOutput, 'utf8'))).toEqual(completed);

    const metadataTamperedOutput = path.join(root, 'sealed', 'metadata-tampered.json');
    const metadataTamperedEnvelope = structuredClone(sealed.envelope);
    metadataTamperedEnvelope.judge.runtime = 'tampered-but-well-formed-runtime';
    await fs.writeFile(metadataTamperedOutput, JSON.stringify(metadataTamperedEnvelope));
    expect(verifyScionSealedCodexReviewEnvelope(metadataTamperedEnvelope)).toEqual({ valid: true, issues: [] });
    await expect(
      unsealScionCodexTrainingReviewPass({
        packetDir,
        sealedFile: metadataTamperedOutput,
        keyFile: keyOutput,
        outputFile: path.join(root, 'restored', 'metadata-tampered.json'),
      }),
    ).rejects.toThrow('metadata does not match decrypted review bytes');

    const tamperedEnvelope = structuredClone(sealed.envelope);
    tamperedEnvelope.ciphertextBase64 = `${tamperedEnvelope.ciphertextBase64.slice(0, -2)}AA`;
    expect(verifyScionSealedCodexReviewEnvelope(tamperedEnvelope)).toMatchObject({
      valid: false,
      issues: expect.arrayContaining(['ciphertext-sha256']),
    });
  });

  it('rejects reused sessions and quarantines changed anonymous artifact bytes', async () => {
    const { packetDir, templateDir } = await buildPacket();
    const reused = await writeCompletedBatches(templateDir, {
      sessionA: 'same-codex-session',
      sessionB: 'same-codex-session',
    });
    await expect(
      ingestScionCodexTrainingReviews({
        packetDir,
        reviewFiles: [reused.abPath, reused.baPath],
        approvedOutput: path.join(root, 'reused.jsonl'),
      }),
    ).rejects.toThrow('distinct session ids');

    const changed = await writeCompletedBatches(templateDir);
    changed.ba.reviews[0].presentation[0].artifact.q = 'A tampered question that was not in the frozen packet.';
    changed.ba.reviews[0].sourceContext.claims[0] = 'A tampered source claim that was never supplied.';
    await fs.writeFile(changed.baPath, JSON.stringify(changed.ba));
    const report = await ingestScionCodexTrainingReviews({
      packetDir,
      reviewFiles: [changed.abPath, changed.baPath],
      approvedOutput: path.join(root, 'tampered.jsonl'),
    });
    expect(report).toMatchObject({ approved: 0, quarantined: 1 });
    expect(report.quarantine[0].issues).toContain('B/A:artifact-bytes-mismatch');
    expect(report.quarantine[0].issues).toContain('B/A:source-context-bytes-mismatch');
  });

  it('detects corpus-byte tampering after a valid review and reports omitted cases', async () => {
    const { packetDir, templateDir } = await buildPacket();
    const { abPath, baPath, ab, ba } = await writeCompletedBatches(templateDir);
    const approvedOutput = path.join(root, 'approved-for-tamper-test.jsonl');
    await ingestScionCodexTrainingReviews({ packetDir, reviewFiles: [abPath, baPath], approvedOutput });
    const row = JSON.parse((await fs.readFile(approvedOutput, 'utf8')).trim());
    row.prompt = 'A changed prompt that was never judged.';
    expect(assessCorpusRow(row)).toMatchObject({
      eligible: false,
      issues: expect.arrayContaining(['model-judge-training-pair-binding']),
    });

    ab.reviews = [];
    ba.reviews = [];
    await fs.writeFile(abPath, JSON.stringify(ab));
    await fs.writeFile(baPath, JSON.stringify(ba));
    await expect(
      ingestScionCodexTrainingReviews({
        packetDir,
        reviewFiles: [abPath, baPath],
        approvedOutput: path.join(root, 'omitted.jsonl'),
      }),
    ).rejects.toThrow('reviews-empty');
  });
});
