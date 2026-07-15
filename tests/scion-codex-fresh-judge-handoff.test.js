import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildScionBlindReviewPacket } from '../scripts/scionBlindReviewPacket.mjs';
import {
  buildScionCodexFreshJudgeHandoff,
  verifyScionCodexFreshJudgeHandoff,
} from '../scripts/scionCodexFreshJudgeHandoff.mjs';
import {
  completeAndSealScionCodexTrainingReviewPass,
  unsealScionCodexTrainingReviewPass,
  verifyScionSealedCodexReviewEnvelope,
} from '../scripts/scionCodexTrainingPreferences.mjs';

let root = '';

afterEach(async () => {
  if (root) await fs.rm(root, { recursive: true, force: true });
  root = '';
});

function goodMc(overrides = {}) {
  return {
    q: 'Which observation is the strongest evidence for revising the navigation?',
    op: [
      'Three participants fail the same labeled task',
      'One participant likes the color palette',
      'The designer prefers the current layout',
      'A stakeholder requests a larger logo',
    ],
    ai: 0,
    ex: 'Repeated task failure is direct behavioral evidence of a navigation problem.',
    ...overrides,
  };
}

async function buildPacket() {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-fresh-handoff-test-'));
  const source = path.join(root, 'source.jsonl');
  const packetDir = path.join(root, 'packet');
  await fs.writeFile(
    source,
    `${JSON.stringify({
      kind: 'mc-item',
      prompt: 'Write one source-grounded navigation assessment item.',
      left: JSON.stringify(goodMc()),
      right: JSON.stringify(goodMc({ q: 'What should the team consider before revising navigation?' })),
      domain: 'user-experience-design',
      courseGroupId: 'ux-research-studio',
      pairSource: { courseInputSha256: '1'.repeat(64) },
      lessonId: 'lesson-1',
      sourceContext: {
        kernelId: 'ux-source-1',
        term: 'Task-based usability evidence',
        claims: ['Repeated failure on the same task is stronger evidence than one aesthetic preference.'],
        attribution: ['Digital.gov usability guidance'],
        license: 'public-guidance',
      },
    })}\n`,
  );
  await buildScionBlindReviewPacket({ sources: [source], outputDir: packetDir, limit: 1 });
  return packetDir;
}

async function completeDecisions(handoffDir) {
  const template = JSON.parse(await fs.readFile(path.join(handoffDir, 'codex-review-b-a.json'), 'utf8'));
  const decisions = JSON.parse(await fs.readFile(path.join(handoffDir, 'codex-decisions-b-a.json'), 'utf8'));
  decisions.judge.revision = 'codex-fresh-test-2026-07-14';
  decisions.judge.runtime = 'vitest-fresh-task';
  decisions.judge.sessionId = 'fresh-b-a-session';
  decisions.previousOutcomeAvailable = false;
  decisions.contextResetAttestation = true;
  decisions.attestation = true;
  decisions.completedAt = '2026-07-14T12:00:00.000Z';
  const templateByPair = new Map(template.reviews.map((review) => [review.pairId, review]));
  for (const decision of decisions.decisions) {
    const review = templateByPair.get(decision.pairId);
    decision.scorecards = review.presentation.map((artifact) => {
      const winner = artifact.position === 1;
      return {
        position: artifact.position,
        evaluationStatus: 'scored',
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
            ? 'The artifact directly operationalizes repeated task failure as the strongest evidence.'
            : 'The artifact weakens the source claim into a vague consideration prompt.',
        ],
        defects: winner ? [] : ['The stem does not require selecting the strongest source-supported evidence.'],
      };
    });
    decision.preference = {
      scoredBeforePreference: true,
      decision: 'winner',
      winnerPosition: 1,
      rationale:
        'Position one operationalizes the supplied source claim and elicits a more defensible evidence judgment.',
      decisionDefects: ['Position two permits a vague relevance judgment instead of direct evidence selection.'],
    };
  }
  return decisions;
}

describe('Scion fresh Codex judge handoff', () => {
  it('builds a B/A-only blank kit with an exact allowlist and no organizer or prior-outcome fields', async () => {
    const packetDir = await buildPacket();
    const handoffDir = path.join(root, 'handoff');
    const receiptOutput = path.join(root, 'receipt.json');
    const built = await buildScionCodexFreshJudgeHandoff({
      packetDir,
      outputDir: handoffDir,
      receiptOutput,
      generatedAt: '2026-07-14T12:00:00.000Z',
    });
    expect(built.manifest).toMatchObject({
      protocol: 'scion-codex-fresh-judge-handoff-v1',
      status: 'fresh-task-ready',
      order: 'B/A',
      selectedCases: 1,
      isolation: {
        organizerMappingIncluded: false,
        priorOutcomeIncluded: false,
        blankOutcomeState: true,
      },
      completion: { plaintextWritten: false, exclusiveOutputs: true, outcomeDisclosure: 'sealed' },
    });
    expect((await fs.readdir(handoffDir)).sort()).toEqual(
      [
        'FRESH_TASK_INSTRUCTIONS.md',
        'codex-decisions-b-a.json',
        'codex-review-b-a.json',
        'handoff-manifest.json',
        'single-model-training-atom-judge-prompt-v2.md',
      ].sort(),
    );
    const raw = await Promise.all(
      (await fs.readdir(handoffDir)).map((file) => fs.readFile(path.join(handoffDir, file), 'utf8')),
    );
    expect(raw.join('\n')).not.toContain('ciphertextBase64');
    expect(raw.join('\n')).not.toContain('"mapping"');
    expect(raw.join('\n')).not.toContain('"sourceRow"');
    const receipt = JSON.parse(await fs.readFile(receiptOutput, 'utf8'));
    await expect(verifyScionCodexFreshJudgeHandoff({ handoffDir, expectedReceipt: receipt })).resolves.toMatchObject({
      valid: true,
      issues: [],
    });
    const staleReceipt = structuredClone(receipt);
    staleReceipt.selectedCases = 2;
    await expect(
      verifyScionCodexFreshJudgeHandoff({ handoffDir, expectedReceipt: staleReceipt }),
    ).resolves.toMatchObject({
      valid: false,
      issues: expect.arrayContaining(['tracked-receipt-mismatch', 'tracked-receipt-mismatch:$.selectedCases']),
    });
  });

  it('rejects added files and preserves them instead of clearing an output directory', async () => {
    const packetDir = await buildPacket();
    const handoffDir = path.join(root, 'handoff');
    await buildScionCodexFreshJudgeHandoff({ packetDir, outputDir: handoffDir });
    const retained = path.join(handoffDir, 'unexpected.key');
    await fs.writeFile(retained, 'must-not-be-deleted');
    await expect(buildScionCodexFreshJudgeHandoff({ packetDir, outputDir: handoffDir })).rejects.toThrow(
      'unowned files',
    );
    await expect(fs.readFile(retained, 'utf8')).resolves.toBe('must-not-be-deleted');
    await expect(verifyScionCodexFreshJudgeHandoff({ handoffDir })).resolves.toMatchObject({
      valid: false,
      issues: expect.arrayContaining(['handoff-file-set']),
    });
  });

  it('fails closed before reading a missing or linked handoff payload', async () => {
    const packetDir = await buildPacket();
    const handoffDir = path.join(root, 'handoff');
    await buildScionCodexFreshJudgeHandoff({ packetDir, outputDir: handoffDir });
    await fs.rm(path.join(handoffDir, 'codex-decisions-b-a.json'));
    await expect(verifyScionCodexFreshJudgeHandoff({ handoffDir })).resolves.toMatchObject({
      valid: false,
      issues: ['handoff-file-set'],
      manifest: null,
    });

    const linkedPayload = path.join(root, 'prohibited-outcome.json');
    await fs.writeFile(linkedPayload, '{"winnerSide":"A"}\n');
    await fs.symlink(linkedPayload, path.join(handoffDir, 'codex-decisions-b-a.json'));
    await expect(verifyScionCodexFreshJudgeHandoff({ handoffDir })).resolves.toMatchObject({
      valid: false,
      issues: ['handoff-nonregular-file'],
      manifest: null,
    });

    const linkedHandoff = path.join(root, 'linked-handoff');
    await fs.symlink(handoffDir, linkedHandoff);
    await expect(verifyScionCodexFreshJudgeHandoff({ handoffDir: linkedHandoff })).resolves.toMatchObject({
      valid: false,
      issues: ['handoff-directory'],
      manifest: null,
    });

    await expect(
      verifyScionCodexFreshJudgeHandoff({ handoffDir: path.join(root, 'missing-handoff') }),
    ).resolves.toMatchObject({ valid: false, issues: ['handoff-directory'], manifest: null });
  });

  it('atomically completes and seals a copied decision file without creating plaintext', async () => {
    const packetDir = await buildPacket();
    const handoffDir = path.join(root, 'handoff');
    await buildScionCodexFreshJudgeHandoff({ packetDir, outputDir: handoffDir });
    const manifest = JSON.parse(await fs.readFile(path.join(handoffDir, 'handoff-manifest.json'), 'utf8'));
    const decisionsFile = path.join(root, 'working-decisions.json');
    const completed = await completeDecisions(handoffDir);
    await fs.writeFile(decisionsFile, `${JSON.stringify(completed, null, 2)}\n`);
    const sealedOutput = path.join(root, 'sealed', 'b-a.json');
    const keyOutput = path.join(root, 'secret', 'b-a.key');
    const identityDriftDecisions = path.join(root, 'identity-drift-decisions.json');
    const drifted = structuredClone(completed);
    drifted.judge.promptSha256 = '0'.repeat(64);
    await fs.writeFile(identityDriftDecisions, `${JSON.stringify(drifted, null, 2)}\n`);
    await expect(
      completeAndSealScionCodexTrainingReviewPass({
        templateFile: path.join(handoffDir, 'codex-review-b-a.json'),
        decisionsFile: identityDriftDecisions,
        sealedOutput: path.join(root, 'identity-drift', 'b-a.json'),
        keyOutput: path.join(root, 'identity-drift', 'b-a.key'),
        expectedTemplateSha256: manifest.files['codex-review-b-a.json'].sha256,
      }),
    ).rejects.toThrow('judge identity does not match');
    await expect(fs.access(path.join(root, 'identity-drift', 'b-a.json'))).rejects.toThrow();
    await expect(fs.access(path.join(root, 'identity-drift', 'b-a.key'))).rejects.toThrow();
    const tamperedTemplate = path.join(root, 'tampered-template.json');
    await fs.copyFile(path.join(handoffDir, 'codex-review-b-a.json'), tamperedTemplate);
    await fs.appendFile(tamperedTemplate, '\n');
    await expect(
      completeAndSealScionCodexTrainingReviewPass({
        templateFile: tamperedTemplate,
        decisionsFile,
        sealedOutput: path.join(root, 'tampered', 'b-a.json'),
        keyOutput: path.join(root, 'tampered', 'b-a.key'),
        expectedTemplateSha256: manifest.files['codex-review-b-a.json'].sha256,
      }),
    ).rejects.toThrow('no longer matches the verified handoff receipt');
    await expect(fs.access(path.join(root, 'tampered', 'b-a.json'))).rejects.toThrow();
    await expect(fs.access(path.join(root, 'tampered', 'b-a.key'))).rejects.toThrow();

    const retainedEnvelope = path.join(root, 'retained', 'b-a.json');
    const rejectedKey = path.join(root, 'retained', 'b-a.key');
    await fs.mkdir(path.dirname(retainedEnvelope), { recursive: true });
    await fs.writeFile(retainedEnvelope, 'retained-envelope');
    await expect(
      completeAndSealScionCodexTrainingReviewPass({
        templateFile: path.join(handoffDir, 'codex-review-b-a.json'),
        decisionsFile,
        sealedOutput: retainedEnvelope,
        keyOutput: rejectedKey,
        expectedTemplateSha256: manifest.files['codex-review-b-a.json'].sha256,
      }),
    ).rejects.toMatchObject({ code: 'EEXIST' });
    await expect(fs.access(rejectedKey)).rejects.toThrow();
    await expect(fs.readFile(retainedEnvelope, 'utf8')).resolves.toBe('retained-envelope');
    const result = await completeAndSealScionCodexTrainingReviewPass({
      templateFile: path.join(handoffDir, 'codex-review-b-a.json'),
      decisionsFile,
      sealedOutput,
      keyOutput,
      expectedTemplateSha256: manifest.files['codex-review-b-a.json'].sha256,
    });
    expect(result).toMatchObject({
      plaintextWritten: false,
      validation: { status: 'structurally-valid-complete', submittedReviews: 1, structuralIssues: [] },
    });
    expect(verifyScionSealedCodexReviewEnvelope(result.envelope)).toEqual({ valid: true, issues: [] });
    expect(JSON.stringify(result.envelope)).not.toContain('winnerPosition');
    expect((await fs.stat(keyOutput)).mode & 0o777).toBe(0o600);
    await expect(fs.access(path.join(root, 'completed-pass.json'))).rejects.toThrow();
    await expect(
      completeAndSealScionCodexTrainingReviewPass({
        templateFile: path.join(handoffDir, 'codex-review-b-a.json'),
        decisionsFile,
        sealedOutput,
        keyOutput,
        expectedTemplateSha256: manifest.files['codex-review-b-a.json'].sha256,
      }),
    ).rejects.toMatchObject({ code: 'EEXIST' });

    const restoredOutput = path.join(root, 'restored', 'b-a.json');
    const restored = await unsealScionCodexTrainingReviewPass({
      packetDir,
      sealedFile: sealedOutput,
      keyFile: keyOutput,
      outputFile: restoredOutput,
    });
    expect(restored.validation).toMatchObject({
      status: 'structurally-valid-complete',
      submittedReviews: 1,
      structuralIssues: [],
    });
  });
});
