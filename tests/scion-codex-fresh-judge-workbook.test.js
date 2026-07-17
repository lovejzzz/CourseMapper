import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildScionBlindReviewPacket } from '../scripts/scionBlindReviewPacket.mjs';
import { buildScionCodexFreshJudgeHandoff } from '../scripts/scionCodexFreshJudgeHandoff.mjs';
import {
  auditTrackedWorkbook,
  buildScionCodexFreshJudgeWorkbook,
  completeAndSealScionCodexFreshJudgeWorkbook,
  verifyScionCodexFreshJudgeWorkbook,
} from '../scripts/scionCodexFreshJudgeWorkbook.mjs';
import {
  buildScionCodexTrainingReviewTemplates,
  sealScionCodexTrainingReviewPass,
  unsealScionCodexTrainingReviewPass,
  verifyScionSealedCodexReviewEnvelope,
} from '../scripts/scionCodexTrainingPreferences.mjs';

let root = '';

afterEach(async () => {
  if (root) await fs.rm(root, { recursive: true, force: true });
  root = '';
});

function goodMc(index, overrides = {}) {
  return {
    q: `Which observation ${index} is the strongest evidence for revising the navigation?`,
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

async function buildPacket(count = 5) {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-fresh-workbook-test-'));
  const source = path.join(root, 'source.jsonl');
  const packetDir = path.join(root, 'packet');
  const rows = Array.from({ length: count }, (_, index) => ({
    kind: 'mc-item',
    prompt: `Write source-grounded navigation assessment item ${index + 1}.`,
    left: JSON.stringify(goodMc(index + 1)),
    right: JSON.stringify(
      goodMc(index + 1, { q: `What should the team consider before revising navigation ${index + 1}?` }),
    ),
    domain: 'user-experience-design',
    courseGroupId: `ux-research-studio-${index + 1}`,
    pairSource: {
      courseInputSha256: String(index + 1)
        .repeat(64)
        .slice(0, 64),
    },
    lessonId: `lesson-${index + 1}`,
    sourceContext: {
      kernelId: `ux-source-${index + 1}`,
      term: `Task-based usability evidence ${index + 1}`,
      claims: ['Repeated failure on the same task is stronger evidence than one aesthetic preference.'],
      attribution: ['Digital.gov usability guidance'],
      license: 'public-guidance',
    },
  }));
  await fs.writeFile(source, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
  await buildScionBlindReviewPacket({ sources: [source], outputDir: packetDir, limit: count });
  return packetDir;
}

async function buildWorkbook(count = 5, chunkSize = 2) {
  const packetDir = await buildPacket(count);
  const handoffDir = path.join(root, 'workbook');
  const receiptOutput = path.join(root, 'receipt.json');
  const built = await buildScionCodexFreshJudgeWorkbook({
    packetDir,
    outputDir: handoffDir,
    receiptOutput,
    generatedAt: '2026-07-14T16:00:00.000Z',
    chunkSize,
  });
  return { packetDir, handoffDir, receiptOutput, built };
}

async function buildPriorSealedAb(packetDir, identity = {}) {
  const templateDir = path.join(root, 'prior-templates');
  await buildScionCodexTrainingReviewTemplates({ packetDir, outputDir: templateDir });
  const completedPath = path.join(root, 'prior-completed-a-b.json');
  const batch = JSON.parse(await fs.readFile(path.join(templateDir, 'codex-review-a-b.json'), 'utf8'));
  batch.judge.revision = identity.revision || 'codex-fresh-workbook-test-2026-07-14';
  batch.judge.runtime = identity.runtime || 'vitest-fresh-workbook';
  batch.judge.sessionId = identity.sessionId || 'prior-a-b-session';
  batch.previousOutcomeAvailable = false;
  batch.contextResetAttestation = true;
  batch.attestation = true;
  batch.completedAt = '2026-07-14T15:30:00.000Z';
  for (const review of batch.reviews) {
    review.scorecards = review.presentation.map((artifact) => ({
      position: artifact.position,
      anonymousSide: artifact.anonymousSide,
      artifactSha256: artifact.artifactSha256,
      evaluationStatus: 'scored',
      scores:
        artifact.position === 1
          ? { factualCorrectness: 5, sourceFidelity: 5, teachability: 5, coherence: 5, taskQuality: 5 }
          : { factualCorrectness: 4, sourceFidelity: 4, teachability: 4, coherence: 4, taskQuality: 3 },
      evidence: ['The score is grounded in the supplied anonymous artifact and neutral source context.'],
      defects:
        artifact.position === 1 ? [] : ['The losing artifact is less direct and less useful for the declared task.'],
    }));
    review.preference = {
      scoredBeforePreference: true,
      decision: 'winner',
      winnerPosition: 1,
      rationale: 'Position one is more direct, source-grounded, coherent, teachable, and useful for the declared task.',
      decisionDefects: ['Position two weakens the source-grounded task into a less direct response.'],
    };
  }
  await fs.writeFile(completedPath, `${JSON.stringify(batch, null, 2)}\n`);
  const sealedOutput = path.join(root, 'prior-sealed', 'a-b.sealed.json');
  await sealScionCodexTrainingReviewPass({
    packetDir,
    reviewFile: completedPath,
    sealedOutput,
    keyOutput: path.join(root, 'prior-secret', 'a-b.key'),
  });
  return sealedOutput;
}

async function writeCompletedWorkingDecisions(handoffDir, manifest, { sessionByChunk = {} } = {}) {
  const decisionsDir = path.join(root, 'working-decisions');
  await fs.mkdir(decisionsDir, { recursive: true });
  for (const chunk of manifest.chunks) {
    const template = JSON.parse(await fs.readFile(path.join(handoffDir, chunk.templateFile), 'utf8'));
    const decisions = JSON.parse(await fs.readFile(path.join(handoffDir, chunk.decisionsFile), 'utf8'));
    decisions.judge.revision =
      manifest.requiredJudgeIdentity?.identity?.revision || 'codex-fresh-workbook-test-2026-07-14';
    decisions.judge.runtime = manifest.requiredJudgeIdentity?.identity?.runtime || 'vitest-fresh-workbook';
    decisions.judge.sessionId = sessionByChunk[chunk.id] || 'one-fresh-b-a-session';
    decisions.previousOutcomeAvailable = false;
    decisions.contextResetAttestation = true;
    decisions.attestation = true;
    decisions.completedAt = '2026-07-14T16:30:00.000Z';
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
    await fs.writeFile(path.join(decisionsDir, chunk.decisionsFile), `${JSON.stringify(decisions, null, 2)}\n`);
  }
  return decisionsDir;
}

describe('Scion fresh Codex judge workbook', () => {
  it('builds hash-bound interleaved chunks that reconstruct the canonical blank B/A pass', async () => {
    const { handoffDir, receiptOutput, built } = await buildWorkbook();
    expect(built.manifest).toMatchObject({
      protocol: 'scion-codex-fresh-judge-workbook-v1',
      release: 'v0.16.30',
      status: 'fresh-task-ready',
      order: 'B/A',
      selectedCases: 5,
      schedule: {
        chunkSize: 2,
        chunkCount: 3,
        assignment: 'original-index-modulo-chunk-count',
        sameFreshSessionRequired: true,
      },
      completion: { plaintextWritten: false, exclusiveOutputs: true, outcomeDisclosure: 'sealed' },
    });
    expect(built.manifest.chunks.map((chunk) => chunk.reviewIndices)).toEqual([[0, 3], [1, 4], [2]]);
    expect(built.manifest.chunks.map((chunk) => chunk.caseCount)).toEqual([2, 2, 1]);
    expect(built.manifest.chunks.map((chunk) => chunk.domainCounts)).toEqual([
      { 'user-experience-design': 2 },
      { 'user-experience-design': 2 },
      { 'user-experience-design': 1 },
    ]);
    const receipt = JSON.parse(await fs.readFile(receiptOutput, 'utf8'));
    const verification = await verifyScionCodexFreshJudgeWorkbook({ handoffDir, expectedReceipt: receipt });
    expect(verification).toMatchObject({ valid: true, issues: [] });
    expect(verification.fullTemplateRaw).toBeInstanceOf(Buffer);
    expect(JSON.parse(verification.fullTemplateRaw.toString('utf8')).reviews).toHaveLength(5);
    const allRaw = await Promise.all(
      (await fs.readdir(handoffDir)).map((fileName) => fs.readFile(path.join(handoffDir, fileName), 'utf8')),
    );
    expect(allRaw.join('\n')).not.toContain('ciphertextBase64');
    expect(allRaw.join('\n')).not.toContain('"mapping"');
    expect(allRaw.join('\n')).not.toContain('"sourceRow"');
    expect(allRaw.join('\n')).toContain('same exact judge revision, runtime, fresh session ID');
  });

  it('builds an A/B-only first-order workbook with an explicit selectable Codex launch profile', async () => {
    const packetDir = await buildPacket(5);
    const handoffDir = path.join(root, 'first-order-workbook');
    const receiptOutput = path.join(root, 'first-order-receipt.json');
    const declaredJudgeIdentity = {
      model: 'openai/codex',
      revision: 'gpt-5.5@xhigh',
      runtime: 'codex-desktop',
      promptPath: 'evaluation/quality-benchmark/v1/single-model-training-atom-judge-prompt-v2.md',
      promptSha256: '0f062d551af9e2704892e5f1ebdf9b4c66a6d79de6ac1c9cf39b7cb4fa15ecd7',
    };
    const declaredJudgeLaunchProfile = {
      modelId: 'gpt-5.5',
      reasoningEffort: 'xhigh',
      runtime: 'codex-desktop',
      identityRevision: 'gpt-5.5@xhigh',
      selectionMode: 'explicit-codex-thread-launch',
      internalBuildRevisionAvailable: false,
    };
    const built = await buildScionCodexFreshJudgeWorkbook({
      packetDir,
      outputDir: handoffDir,
      receiptOutput,
      generatedAt: '2026-07-15T22:00:00.000Z',
      chunkSize: 2,
      order: 'A/B',
      release: 'v0.16.36',
      declaredJudgeIdentity,
      declaredJudgeLaunchProfile,
    });
    expect(built.manifest).toMatchObject({
      release: 'v0.16.36',
      order: 'A/B',
      selectedCases: 5,
      requiredJudgeIdentity: {
        source: 'declared-first-order-judge-identity',
        order: 'A/B',
        identity: declaredJudgeIdentity,
        launchProfile: declaredJudgeLaunchProfile,
      },
      isolation: {
        organizerMappingIncluded: false,
        priorOutcomeIncluded: false,
        blankOutcomeState: true,
      },
    });
    expect(built.manifest.chunks.every((chunk) => chunk.templateFile.endsWith('-review-a-b.json'))).toBe(true);
    expect(built.manifest.chunks.every((chunk) => chunk.decisionsFile.endsWith('-decisions-a-b.json'))).toBe(true);
    const verification = await verifyScionCodexFreshJudgeWorkbook({
      handoffDir,
      expectedReceipt: built.manifest,
    });
    expect(verification).toMatchObject({ valid: true, issues: [] });
    const canonical = JSON.parse(verification.fullTemplateRaw.toString('utf8'));
    expect(canonical.order).toBe('A/B');
    expect(
      canonical.reviews.every((review) => review.presentation.map((item) => item.anonymousSide).join('/') === 'A/B'),
    ).toBe(true);
    const allNames = await fs.readdir(handoffDir);
    expect(allNames.some((name) => name.includes('review-b-a') || name.includes('decisions-b-a'))).toBe(false);
    const instructions = await fs.readFile(path.join(handoffDir, 'FRESH_TASK_INSTRUCTIONS.md'), 'utf8');
    expect(instructions).toContain('If any identity is unavailable or different, stop before judgment');
    expect(instructions).toContain('model `gpt-5.5` and reasoning effort `xhigh` selected explicitly');
    expect(instructions).toContain('not a claim about an unexposed provider build revision');
    expect(instructions).toContain('Do not unseal, ingest, or begin the B/A order');

    const decisionsDir = await writeCompletedWorkingDecisions(handoffDir, built.manifest);
    await expect(
      completeAndSealScionCodexFreshJudgeWorkbook({
        handoffDir,
        expectedReceipt: built.manifest,
        decisionsDir,
        sealedOutput: path.join(root, 'first-order-sealed', 'a-b.json'),
        keyOutput: path.join(root, 'first-order-secret', 'a-b.key'),
      }),
    ).resolves.toMatchObject({ combinedPlaintextWritten: false, canonicalReviewCount: 5 });

    for (const chunk of built.manifest.chunks) {
      const decisionsPath = path.join(decisionsDir, chunk.decisionsFile);
      const decisions = JSON.parse(await fs.readFile(decisionsPath, 'utf8'));
      decisions.judge.runtime = 'different-codex-runtime';
      await fs.writeFile(decisionsPath, `${JSON.stringify(decisions, null, 2)}\n`);
    }
    await expect(
      completeAndSealScionCodexFreshJudgeWorkbook({
        handoffDir,
        expectedReceipt: built.manifest,
        decisionsDir,
        sealedOutput: path.join(root, 'drifted-first-order-sealed', 'a-b.json'),
        keyOutput: path.join(root, 'drifted-first-order-secret', 'a-b.key'),
      }),
    ).rejects.toThrow('does not match the declared first-order identity');
  });

  it('audits an exact packet-backed CLI workbook and emits runtime-accurate clean-room instructions', async () => {
    const packetDir = await buildPacket(5);
    const handoffDir = path.join(root, 'cli-first-order-workbook');
    const receiptOutput = path.join(root, 'cli-first-order-receipt.json');
    const declaredJudgeIdentity = {
      model: 'openai/codex',
      revision: 'gpt-5.6-luna@max',
      runtime: 'codex-cli-0.144.2',
      promptPath: 'evaluation/quality-benchmark/v1/single-model-training-atom-judge-prompt-v2.md',
      promptSha256: '0f062d551af9e2704892e5f1ebdf9b4c66a6d79de6ac1c9cf39b7cb4fa15ecd7',
    };
    const instructionRouting = {
      workingDecisionsDir: 'verification-output/campaign-specific-decisions',
      sealedOutput: 'evaluation/scion-adapters/evidence/campaign-specific-a-b.sealed.json',
      keyOutput: '~/.codex/scion-secrets/CourseMapper/campaign-specific-a-b.key',
      handoffDir: 'evaluation/scion-adapters/handoffs/campaign-specific-a-b',
      receiptFile: 'evaluation/scion-adapters/evidence/campaign-specific-a-b.json',
    };
    await buildScionCodexFreshJudgeWorkbook({
      packetDir,
      outputDir: handoffDir,
      receiptOutput,
      generatedAt: '2026-07-16T12:00:00.000Z',
      chunkSize: 2,
      order: 'A/B',
      release: 'v0.16.41',
      declaredJudgeIdentity,
      declaredJudgeLaunchProfile: {
        modelId: 'gpt-5.6-luna',
        reasoningEffort: 'max',
        runtime: 'codex-cli-0.144.2',
        identityRevision: 'gpt-5.6-luna@max',
        selectionMode: 'explicit-codex-thread-launch',
        internalBuildRevisionAvailable: false,
      },
      instructionRouting,
    });

    await expect(auditTrackedWorkbook(receiptOutput, handoffDir, packetDir)).resolves.toMatchObject({
      valid: true,
      issues: [],
    });
    const instructions = await fs.readFile(path.join(handoffDir, 'FRESH_TASK_INSTRUCTIONS.md'), 'utf8');
    expect(instructions).toContain('Start one new ephemeral Codex CLI task');
    expect(instructions).toContain('runtime `codex-cli-0.144.2` exactly');
    expect(instructions).toContain(instructionRouting.workingDecisionsDir);
    expect(instructions).toContain(instructionRouting.sealedOutput);
    expect(instructions).toContain(instructionRouting.keyOutput);
    expect(instructions).toContain(`--handoff ${instructionRouting.handoffDir}`);
    expect(instructions).toContain(`--receipt ${instructionRouting.receiptFile}`);
    expect(instructions).not.toContain('Start a newly created Codex Desktop task');
  });

  it('refuses to build a first-order workbook without a predeclared judge identity', async () => {
    const packetDir = await buildPacket(2);
    await expect(
      buildScionCodexFreshJudgeWorkbook({
        packetDir,
        outputDir: path.join(root, 'unbound-first-order-workbook'),
        order: 'A/B',
        release: 'v0.16.35',
      }),
    ).rejects.toThrow('requires a declared judge identity before scoring');
  });

  it('refuses a new first-order campaign without a verifiable launch profile or with a relabeled profile', async () => {
    const packetDir = await buildPacket(2);
    const declaredJudgeIdentity = {
      model: 'openai/codex',
      revision: 'gpt-5.5@xhigh',
      runtime: 'codex-desktop',
      promptPath: 'evaluation/quality-benchmark/v1/single-model-training-atom-judge-prompt-v2.md',
      promptSha256: '0f062d551af9e2704892e5f1ebdf9b4c66a6d79de6ac1c9cf39b7cb4fa15ecd7',
    };
    await expect(
      buildScionCodexFreshJudgeWorkbook({
        packetDir,
        outputDir: path.join(root, 'profile-missing-first-order-workbook'),
        order: 'A/B',
        release: 'v0.16.36',
        declaredJudgeIdentity,
      }),
    ).rejects.toThrow('requires an explicit Codex launch profile before scoring');

    await expect(
      buildScionCodexFreshJudgeWorkbook({
        packetDir,
        outputDir: path.join(root, 'profile-mismatch-first-order-workbook'),
        order: 'A/B',
        release: 'v0.16.36',
        declaredJudgeIdentity,
        declaredJudgeLaunchProfile: {
          modelId: 'gpt-5.6-luna',
          reasoningEffort: 'xhigh',
          runtime: 'codex-desktop',
          identityRevision: 'gpt-5.6-luna@xhigh',
          selectionMode: 'explicit-codex-thread-launch',
          internalBuildRevisionAvailable: false,
        },
      }),
    ).rejects.toThrow('judge-launch-profile-identity-mismatch');

    await expect(
      buildScionCodexFreshJudgeWorkbook({
        packetDir,
        outputDir: path.join(root, 'profile-unsupported-reasoning-workbook'),
        order: 'A/B',
        release: 'v0.16.36',
        declaredJudgeIdentity: {
          ...declaredJudgeIdentity,
          revision: 'gpt-5.5@ultra',
        },
        declaredJudgeLaunchProfile: {
          modelId: 'gpt-5.5',
          reasoningEffort: 'ultra',
          runtime: 'codex-desktop',
          identityRevision: 'gpt-5.5@ultra',
          selectionMode: 'explicit-codex-thread-launch',
          internalBuildRevisionAvailable: false,
        },
      }),
    ).rejects.toThrow('judge-launch-profile-reasoning-effort');
  });

  it('rebuilds from the frozen canonical handoff and reports the exact receipt field that drifted', async () => {
    const packetDir = await buildPacket(5);
    const canonicalHandoffDir = path.join(root, 'frozen-canonical-handoff');
    const canonicalHandoffReceipt = path.join(root, 'frozen-canonical-receipt.json');
    await buildScionCodexFreshJudgeHandoff({
      packetDir,
      outputDir: canonicalHandoffDir,
      receiptOutput: canonicalHandoffReceipt,
      generatedAt: '2026-07-14T15:00:00.000Z',
    });
    await fs.rm(packetDir, { recursive: true, force: true });

    const handoffDir = path.join(root, 'rebuilt-workbook');
    const rebuilt = await buildScionCodexFreshJudgeWorkbook({
      canonicalHandoffDir,
      canonicalHandoffReceipt,
      outputDir: handoffDir,
      generatedAt: '2026-07-15T07:00:00.000Z',
      chunkSize: 2,
    });
    expect(rebuilt.manifest).toMatchObject({ selectedCases: 5, release: 'v0.16.30' });

    const staleReceipt = structuredClone(rebuilt.manifest);
    staleReceipt.selectedCases = 6;
    await expect(
      verifyScionCodexFreshJudgeWorkbook({ handoffDir, expectedReceipt: staleReceipt }),
    ).resolves.toMatchObject({
      valid: false,
      issues: expect.arrayContaining(['tracked-receipt-mismatch', 'tracked-receipt-mismatch:$.selectedCases']),
    });
  });

  it('rejects added, missing, changed, and linked workbook inputs without deleting unknown files', async () => {
    const { packetDir, handoffDir, built } = await buildWorkbook();
    const manifestPath = path.join(handoffDir, 'workbook-manifest.json');
    const originalManifest = await fs.readFile(manifestPath);
    const outcomeBearingManifest = JSON.parse(originalManifest.toString('utf8'));
    outcomeBearingManifest.winnerSide = 'A';
    await fs.writeFile(manifestPath, `${JSON.stringify(outcomeBearingManifest, null, 2)}\n`);
    await expect(verifyScionCodexFreshJudgeWorkbook({ handoffDir })).resolves.toMatchObject({
      valid: false,
      issues: expect.arrayContaining(['forbidden-field:$.manifest.winnerSide']),
    });
    await fs.writeFile(manifestPath, originalManifest);

    const extraIdentityManifest = JSON.parse(originalManifest.toString('utf8'));
    extraIdentityManifest.files['undeclared-outcome.json'] = { bytes: 2, sha256: '0'.repeat(64) };
    await fs.writeFile(manifestPath, `${JSON.stringify(extraIdentityManifest, null, 2)}\n`);
    await expect(verifyScionCodexFreshJudgeWorkbook({ handoffDir })).resolves.toMatchObject({
      valid: false,
      issues: expect.arrayContaining(['manifest-files-set']),
    });
    await fs.writeFile(manifestPath, originalManifest);

    const linkedWorkbook = path.join(root, 'linked-workbook');
    await fs.symlink(handoffDir, linkedWorkbook);
    await expect(verifyScionCodexFreshJudgeWorkbook({ handoffDir: linkedWorkbook })).resolves.toMatchObject({
      valid: false,
      issues: ['workbook-directory'],
    });
    await expect(
      verifyScionCodexFreshJudgeWorkbook({ handoffDir: path.join(root, 'missing-workbook') }),
    ).resolves.toMatchObject({ valid: false, issues: ['workbook-directory'] });

    const retained = path.join(handoffDir, 'unexpected.key');
    await fs.writeFile(retained, 'must-not-be-deleted');
    await expect(buildScionCodexFreshJudgeWorkbook({ packetDir, outputDir: handoffDir, chunkSize: 2 })).rejects.toThrow(
      'unowned files',
    );
    await expect(fs.readFile(retained, 'utf8')).resolves.toBe('must-not-be-deleted');
    await expect(verifyScionCodexFreshJudgeWorkbook({ handoffDir })).resolves.toMatchObject({
      valid: false,
      issues: expect.arrayContaining(['workbook-file-set']),
    });

    await fs.rm(retained);
    const firstTemplate = built.manifest.chunks[0].templateFile;
    await fs.rm(path.join(handoffDir, firstTemplate));
    const prohibited = path.join(root, 'prohibited-outcome.json');
    await fs.writeFile(prohibited, '{"winnerSide":"A"}\n');
    await fs.symlink(prohibited, path.join(handoffDir, firstTemplate));
    await expect(verifyScionCodexFreshJudgeWorkbook({ handoffDir })).resolves.toMatchObject({
      valid: false,
      issues: expect.arrayContaining(['workbook-nonregular-file']),
      fullTemplateRaw: null,
    });
  });

  it('assembles one canonical pass in memory and seals it without a combined plaintext file', async () => {
    const { packetDir, handoffDir, built } = await buildWorkbook();
    const decisionsDir = await writeCompletedWorkingDecisions(handoffDir, built.manifest);
    const sealedOutput = path.join(root, 'sealed', 'b-a.json');
    const keyOutput = path.join(root, 'secret', 'b-a.key');
    const result = await completeAndSealScionCodexFreshJudgeWorkbook({
      handoffDir,
      expectedReceipt: built.manifest,
      decisionsDir,
      sealedOutput,
      keyOutput,
    });
    expect(result).toMatchObject({
      chunkCount: 3,
      canonicalReviewCount: 5,
      combinedPlaintextWritten: false,
      plaintextWritten: false,
      validation: { status: 'structurally-valid-complete', submittedReviews: 5, structuralIssues: [] },
    });
    expect(verifyScionSealedCodexReviewEnvelope(result.envelope)).toEqual({ valid: true, issues: [] });
    expect(JSON.stringify(result.envelope)).not.toContain('winnerPosition');
    expect((await fs.stat(keyOutput)).mode & 0o777).toBe(0o600);
    await expect(fs.access(path.join(root, 'combined-completed-pass.json'))).rejects.toThrow();
    const restoredOutput = path.join(root, 'restored', 'b-a.json');
    const restored = await unsealScionCodexTrainingReviewPass({
      packetDir,
      sealedFile: sealedOutput,
      keyFile: keyOutput,
      outputFile: restoredOutput,
    });
    expect(restored.validation).toMatchObject({
      status: 'structurally-valid-complete',
      submittedReviews: 5,
      structuralIssues: [],
    });
  });

  it('pins public first-order judge metadata and rejects revision drift before sealing the reverse order', async () => {
    const packetDir = await buildPacket(3);
    const priorSealedEnvelope = await buildPriorSealedAb(packetDir);
    const handoffDir = path.join(root, 'identity-pinned-workbook');
    const built = await buildScionCodexFreshJudgeWorkbook({
      packetDir,
      priorSealedEnvelope,
      outputDir: handoffDir,
      chunkSize: 2,
      generatedAt: '2026-07-14T16:00:00.000Z',
    });
    expect(built.manifest.requiredJudgeIdentity).toMatchObject({
      source: 'sealed-first-order-envelope-metadata',
      order: 'A/B',
      identity: {
        model: 'openai/codex',
        revision: 'codex-fresh-workbook-test-2026-07-14',
        runtime: 'vitest-fresh-workbook',
      },
      priorSessionId: 'prior-a-b-session',
    });
    const instructions = await fs.readFile(path.join(handoffDir, 'FRESH_TASK_INSTRUCTIONS.md'), 'utf8');
    expect(instructions).toContain('stop before judgment');
    const decisionsDir = await writeCompletedWorkingDecisions(handoffDir, built.manifest);
    await expect(
      completeAndSealScionCodexFreshJudgeWorkbook({
        handoffDir,
        expectedReceipt: built.manifest,
        decisionsDir,
        sealedOutput: path.join(root, 'identity-pinned-sealed', 'b-a.json'),
        keyOutput: path.join(root, 'identity-pinned-secret', 'b-a.key'),
      }),
    ).resolves.toMatchObject({ combinedPlaintextWritten: false });

    for (const chunk of built.manifest.chunks) {
      const decisionsPath = path.join(decisionsDir, chunk.decisionsFile);
      const decisions = JSON.parse(await fs.readFile(decisionsPath, 'utf8'));
      decisions.judge.revision = 'codex-updated-revision-2026-07-15';
      await fs.writeFile(decisionsPath, `${JSON.stringify(decisions, null, 2)}\n`);
    }
    await expect(
      completeAndSealScionCodexFreshJudgeWorkbook({
        handoffDir,
        expectedReceipt: built.manifest,
        decisionsDir,
        sealedOutput: path.join(root, 'drifted-sealed', 'b-a.json'),
        keyOutput: path.join(root, 'drifted-secret', 'b-a.key'),
      }),
    ).rejects.toThrow('does not match the sealed first-order identity');
  });

  it('derives a selectable v0.16.42 B/A launch profile and reconstructs only with the exact sealed first order', async () => {
    const packetDir = await buildPacket(5);
    const priorSealedEnvelope = await buildPriorSealedAb(packetDir, {
      revision: 'gpt-5.6-luna@max',
      runtime: 'codex-cli-0.144.2',
      sessionId: 'sealed-first-order-session',
    });
    const handoffDir = path.join(root, 'v0.16.42-reverse-workbook');
    const receiptOutput = path.join(root, 'v0.16.42-reverse-receipt.json');
    const built = await buildScionCodexFreshJudgeWorkbook({
      packetDir,
      priorSealedEnvelope,
      outputDir: handoffDir,
      receiptOutput,
      chunkSize: 2,
      generatedAt: '2026-07-16T15:00:00.000Z',
      order: 'B/A',
      release: 'v0.16.42',
    });

    expect(built.manifest).toMatchObject({
      release: 'v0.16.42',
      order: 'B/A',
      selectedCases: 5,
      requiredJudgeIdentity: {
        source: 'sealed-first-order-envelope-metadata',
        order: 'A/B',
        priorSessionId: 'sealed-first-order-session',
        identity: {
          model: 'openai/codex',
          revision: 'gpt-5.6-luna@max',
          runtime: 'codex-cli-0.144.2',
        },
        launchProfile: {
          modelId: 'gpt-5.6-luna',
          reasoningEffort: 'max',
          runtime: 'codex-cli-0.144.2',
          identityRevision: 'gpt-5.6-luna@max',
          selectionMode: 'explicit-codex-thread-launch',
          internalBuildRevisionAvailable: false,
        },
      },
    });
    const instructions = await fs.readFile(path.join(handoffDir, 'FRESH_TASK_INSTRUCTIONS.md'), 'utf8');
    expect(instructions).toContain('The 5-case B/A pass');
    expect(instructions).toContain('Start one new ephemeral Codex CLI task');
    expect(instructions).toContain('fresh-b-a-working-v0.16.42');
    expect(instructions).toContain('fresh-b-a-workbook-v0.16.42');
    expect(instructions).toContain('v0.16.42-b-a.sealed.json');
    expect(instructions).not.toContain('128-case');
    expect(instructions).not.toContain('v0.16.30-b-a');

    await expect(auditTrackedWorkbook(receiptOutput, handoffDir, packetDir)).resolves.toMatchObject({
      valid: false,
      issues: ['reconstruction:prior-sealed-envelope-required'],
    });
    await expect(
      auditTrackedWorkbook(receiptOutput, handoffDir, packetDir, priorSealedEnvelope),
    ).resolves.toMatchObject({ valid: true, issues: [] });
  });

  it('refuses a new B/A campaign when the sealed identity cannot be relaunched honestly', async () => {
    const packetDir = await buildPacket(2);
    const priorSealedEnvelope = await buildPriorSealedAb(packetDir);
    await expect(
      buildScionCodexFreshJudgeWorkbook({
        packetDir,
        priorSealedEnvelope,
        outputDir: path.join(root, 'unselectable-reverse-workbook'),
        order: 'B/A',
        release: 'v0.16.42',
      }),
    ).rejects.toThrow('cannot derive a selectable launch profile');
  });

  it('fails before outputs on partial work, extra files, or cross-chunk session drift', async () => {
    const { handoffDir, built } = await buildWorkbook();
    const decisionsDir = await writeCompletedWorkingDecisions(handoffDir, built.manifest, {
      sessionByChunk: { 'chunk-02': 'different-fresh-session' },
    });
    const sealedOutput = path.join(root, 'retained', 'b-a.json');
    const keyOutput = path.join(root, 'retained', 'b-a.key');
    await fs.mkdir(path.dirname(sealedOutput), { recursive: true });
    await fs.writeFile(sealedOutput, 'retained-envelope-bytes');
    await expect(
      completeAndSealScionCodexFreshJudgeWorkbook({
        handoffDir,
        expectedReceipt: built.manifest,
        decisionsDir,
        sealedOutput,
        keyOutput,
      }),
    ).rejects.toThrow('same fresh judge session');
    await expect(fs.readFile(sealedOutput, 'utf8')).resolves.toBe('retained-envelope-bytes');
    await expect(fs.access(keyOutput)).rejects.toThrow();

    const linkedDecisions = path.join(root, 'linked-working-decisions');
    await fs.symlink(decisionsDir, linkedDecisions);
    await expect(
      completeAndSealScionCodexFreshJudgeWorkbook({
        handoffDir,
        expectedReceipt: built.manifest,
        decisionsDir: linkedDecisions,
        sealedOutput,
        keyOutput,
      }),
    ).rejects.toThrow('regular non-linked directory');

    await fs.rm(path.join(decisionsDir, built.manifest.chunks[2].decisionsFile));
    await expect(
      completeAndSealScionCodexFreshJudgeWorkbook({
        handoffDir,
        expectedReceipt: built.manifest,
        decisionsDir,
        sealedOutput,
        keyOutput,
      }),
    ).rejects.toThrow('exactly one completed file');
    await fs.writeFile(path.join(decisionsDir, 'unexpected.json'), '{}\n');
    await expect(
      completeAndSealScionCodexFreshJudgeWorkbook({
        handoffDir,
        expectedReceipt: built.manifest,
        decisionsDir,
        sealedOutput,
        keyOutput,
      }),
    ).rejects.toThrow('exactly one completed file');
    await expect(fs.readFile(sealedOutput, 'utf8')).resolves.toBe('retained-envelope-bytes');
    await expect(fs.access(keyOutput)).rejects.toThrow();
  });

  it('preserves pre-existing exclusive outputs and removes only a newly created orphan key', async () => {
    const { handoffDir, built } = await buildWorkbook();
    const decisionsDir = await writeCompletedWorkingDecisions(handoffDir, built.manifest);

    const existingKey = path.join(root, 'existing-key', 'b-a.key');
    const absentEnvelope = path.join(root, 'existing-key', 'b-a.json');
    await fs.mkdir(path.dirname(existingKey), { recursive: true });
    await fs.writeFile(existingKey, 'retained-key-bytes');
    await expect(
      completeAndSealScionCodexFreshJudgeWorkbook({
        handoffDir,
        expectedReceipt: built.manifest,
        decisionsDir,
        sealedOutput: absentEnvelope,
        keyOutput: existingKey,
      }),
    ).rejects.toMatchObject({ code: 'EEXIST' });
    await expect(fs.readFile(existingKey, 'utf8')).resolves.toBe('retained-key-bytes');
    await expect(fs.access(absentEnvelope)).rejects.toThrow();

    const existingEnvelope = path.join(root, 'existing-envelope', 'b-a.json');
    const orphanKey = path.join(root, 'existing-envelope', 'b-a.key');
    await fs.mkdir(path.dirname(existingEnvelope), { recursive: true });
    await fs.writeFile(existingEnvelope, 'retained-envelope-bytes');
    await expect(
      completeAndSealScionCodexFreshJudgeWorkbook({
        handoffDir,
        expectedReceipt: built.manifest,
        decisionsDir,
        sealedOutput: existingEnvelope,
        keyOutput: orphanKey,
      }),
    ).rejects.toMatchObject({ code: 'EEXIST' });
    await expect(fs.readFile(existingEnvelope, 'utf8')).resolves.toBe('retained-envelope-bytes');
    await expect(fs.access(orphanKey)).rejects.toThrow();
  });
});
