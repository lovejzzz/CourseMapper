import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildScionAdapterDataset } from '../scripts/scionAdapterDataset.mjs';
import { buildScionBlindReviewPacket } from '../scripts/scionBlindReviewPacket.mjs';
import {
  buildScionCodexTrainingReviewTemplates,
  ingestScionCodexTrainingReviews,
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

async function completedBatch(file, { sessionId, winnerSide = 'A' } = {}) {
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
      return {
        position: artifact.position,
        anonymousSide: artifact.anonymousSide,
        artifactSha256: artifact.artifactSha256,
        scores: winner
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
          winner
            ? 'The item asks for the direct behavioral evidence named in the neutral source claim.'
            : 'The item weakens the decision by asking what should merely be considered.',
        ],
        defects: winner ? [] : ['The stem does not require selecting the strongest source-supported evidence.'],
      };
    });
    review.preference = {
      scoredBeforePreference: true,
      winnerPosition: review.presentation.find((artifact) => artifact.anonymousSide === winnerSide).position,
      rationale:
        'The winning side operationalizes the supplied source claim and elicits a more defensible evidence judgment.',
      decisionDefects: ['The losing stem permits a vague relevance judgment instead of direct evidence selection.'],
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
  });
  const ba = await completedBatch(path.join(templateDir, 'codex-review-b-a.json'), {
    sessionId: options.sessionB || 'codex-session-b',
    winnerSide: options.winnerB || 'A',
  });
  await fs.writeFile(abPath, JSON.stringify(ab));
  await fs.writeFile(baPath, JSON.stringify(ba));
  return { abPath, baPath, ab, ba };
}

describe('Scion Codex training preferences', () => {
  it('builds separate reversed-order templates from source-backed anonymous cases', async () => {
    const { packet, templates, templateDir } = await buildPacket();
    expect(packet.meta).toMatchObject({ protocol: 'scion-blind-atom-packet-v4', selectedCases: 1 });
    expect(templates.receipt).toMatchObject({
      protocol: 'scion-codex-training-review-v1',
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
    expect(ab).toMatchObject({ humanEvidence: false, independentEvidence: false });
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

    const dataset = await buildScionAdapterDataset({
      sources: [approvedOutput],
      outputDir: path.join(root, 'dataset'),
      allowSmoke: true,
    });
    expect(dataset.manifest).toMatchObject({
      schemaVersion: 3,
      primaryPreferenceEvidence: 'single-model-judge',
      status: 'smoke-only',
      counts: { total: 1, singleModelJudgePairs: 1, singleModelJudgeDomains: 1, blindInstructorPairs: 0 },
      modelJudgeDomainCounts: { 'user-experience-design': 1 },
    });
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
    await fs.writeFile(changed.baPath, JSON.stringify(changed.ba));
    const report = await ingestScionCodexTrainingReviews({
      packetDir,
      reviewFiles: [changed.abPath, changed.baPath],
      approvedOutput: path.join(root, 'tampered.jsonl'),
    });
    expect(report).toMatchObject({ approved: 0, quarantined: 1 });
    expect(report.quarantine[0].issues).toContain('B/A:artifact-bytes-mismatch');
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
