import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import {
  buildScionAdapterDataset,
  computeScionAdapterDatasetIdentity,
  SCION_ORPO_TRAINING_FORMAT,
} from '../scripts/scionAdapterDataset.mjs';
import {
  assessScionTrainingToolchain,
  completeScionAdapterTrainingRun,
  createScionAdapterTrainingPlan,
  sha256File,
  verifyScionAdapterTrainingRun,
} from '../scripts/scionAdapterTrainingRun.mjs';
import { buildScionAdapterManifest, verifyScionAdapterPackage } from '../scripts/scionAdapterPackage.mjs';
import { SCION_GEMMA4_E2B_BASE } from '../src/lib/scionAdapterManifest.js';

const execFile = promisify(execFileCallback);
let root = '';

afterEach(async () => {
  if (root) await fs.rm(root, { recursive: true, force: true });
  root = '';
});

function sourceRow() {
  return {
    kind: 'mc-item',
    prompt: 'Write one grounded assessment item about prototype evidence.',
    chosen: {
      q: 'Which observation most directly supports revising the prototype navigation?',
      op: [
        'Three participants fail the same labeled task',
        'One participant likes the color palette',
        'The designer prefers the original navigation',
        'A stakeholder asks for a larger logo',
      ],
      ai: 0,
      ex: 'Repeated task failure is direct behavioral evidence; the other observations do not demonstrate a navigation breakdown.',
    },
    rejected: {
      q: 'Which observation should be considered?',
      op: ['Repeated answer', 'Repeated answer', 'Alternative C', 'Alternative D'],
      ai: 0,
      ex: 'The answer is obvious.',
    },
    context: { domain: 'user-experience-design', courseId: 'ux-training-101' },
  };
}

async function toolchainReceipt() {
  const policy = JSON.parse(await fs.readFile('evaluation/scion-adapters/training-toolchain-v1.json', 'utf8'));
  return {
    schemaVersion: 1,
    protocol: 'scion-mlx-orpo-toolchain-receipt-v1',
    platform: policy.platform,
    packages: policy.packages,
    modules: policy.modules,
  };
}

async function buildSmokeDataset(outputDir, generatedAt = '2026-07-15T00:00:00.000Z') {
  const source = path.join(root, 'source.jsonl');
  await fs.writeFile(source, `${JSON.stringify(sourceRow())}\n`);
  return buildScionAdapterDataset({
    sources: [source],
    outputDir,
    allowSmoke: true,
    generatedAt,
  });
}

async function createPlanFixture() {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-training-run-'));
  const dataset = await buildSmokeDataset(path.join(root, 'dataset'));
  const baseSnapshotPath = path.join(root, SCION_GEMMA4_E2B_BASE.revision);
  await fs.mkdir(baseSnapshotPath);
  const result = await createScionAdapterTrainingPlan({
    lane: 'smoke',
    datasetManifestPath: dataset.manifestPath,
    baseSnapshotPath,
    toolchainReceipt: await toolchainReceipt(),
    outputRoot: path.join(root, 'adapters'),
    codeRoot: process.cwd(),
    scionVersion: '0.16.31',
    seed: 16031,
    generatedAt: '2026-07-15T01:00:00.000Z',
    repository: { commit: 'a'.repeat(40), tree: 'b'.repeat(40), dirty: false },
  });
  return { dataset, ...result };
}

describe('Scion adapter training receipts', () => {
  it('keeps the twin-run smoke receipt metadata-only and permanently outside quality claims', async () => {
    const evidencePath = 'evaluation/scion-adapters/evidence/seeded-training-smoke-v0.16.31.json';
    const text = await fs.readFile(evidencePath, 'utf8');
    const evidence = JSON.parse(text);

    expect(evidence).toMatchObject({
      status: 'pass-mechanics-only',
      source: { dirty: false },
      dataset: {
        status: 'smoke-only',
        promotable: false,
        counts: { eligible: 76, singleModelJudgePairs: 0 },
      },
      replay: {
        independentOutputRoots: 2,
        samePlanIdentity: true,
        sameAdapterConfig: true,
        sameAdapterWeights: true,
        sameTrainingMetrics: true,
        sameValidationMetrics: true,
        adapterWeights: {
          bytes: 105459677,
          sha256: '6bc70b0f74dc3586a6b9c1b646a005eab6a0262d6f20399c082e261a1522b8cb',
        },
        runs: [{ label: 'primary' }, { label: 'separate-output-root-replay' }],
      },
      verification: {
        weightsStoredInRepository: false,
        weightsDeployed: false,
        adapterActivated: false,
      },
      claimBoundary: {
        qualityEvidence: false,
        researchEvidence: false,
        productionEvidence: false,
        adapterVersusBaseWin: false,
        paidReferenceParity: false,
      },
    });
    expect(text).not.toContain('/Users/');
    expect(new Set(evidence.replay.runs.map((run) => run.manifestSha256)).size).toBe(2);
    expect(new Set(evidence.replay.runs.map((run) => run.localLog.sha256)).size).toBe(2);
  });

  it('keeps dataset identity stable across generation timestamps while binding source and split bytes', async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-dataset-identity-'));
    const first = await buildSmokeDataset(path.join(root, 'first'), '2026-07-15T00:00:00.000Z');
    const second = await buildSmokeDataset(path.join(root, 'second'), '2026-07-16T00:00:00.000Z');

    expect(first.manifest.generatedAt).not.toBe(second.manifest.generatedAt);
    expect(first.manifest.identity).toEqual(second.manifest.identity);
    expect(first.manifest.identity.sha256).toBe(computeScionAdapterDatasetIdentity(first.manifest));
    expect(first.manifest.sourceReceipts).toEqual([
      expect.objectContaining({
        status: 'verified',
        bytes: expect.any(Number),
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    ]);
    expect(await sha256File(first.manifestPath)).not.toBe(await sha256File(second.manifestPath));
  });

  it('writes one conditional conversation schema across every Hugging Face split', async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-orpo-schema-'));
    const dataset = await buildSmokeDataset(path.join(root, 'dataset'), '2026-07-15T00:00:00.000Z');

    expect(dataset.manifest.trainingFormat).toEqual(SCION_ORPO_TRAINING_FORMAT);
    for (const split of ['train', 'valid', 'test']) {
      const text = await fs.readFile(path.join(root, 'dataset', `${split}.jsonl`), 'utf8');
      const rows = text
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      for (const row of rows) {
        expect(Object.keys(row).sort()).toEqual(['chosen', 'provenance', 'rejected']);
        expect(row.chosen).toEqual([
          { role: 'user', content: expect.any(String) },
          { role: 'assistant', content: expect.any(String) },
        ]);
        expect(row.rejected[0]).toEqual(row.chosen[0]);
        expect(row.rejected[1]).toEqual({ role: 'assistant', content: expect.any(String) });
        expect(row.provenance).toEqual({
          pairSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          sourceIndex: 0,
          sourceLine: 1,
          split,
          domain: 'user-experience-design',
          courseGroupSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          domainSource: 'row',
          pairKind: 'mc-item',
          preferenceEvidenceKind: 'deterministic-contract-margin',
          preferenceEvidenceScope: 'non-semantic-contract-only',
        });
      }
    }
  });

  it('creates a derived adapter identity from exact data, code, base, toolchain, seed, and explicit ORPO parameters', async () => {
    const fixture = await createPlanFixture();

    expect(fixture.plan).toMatchObject({
      protocol: 'scion-adapter-training-run-v1',
      status: 'planned',
      lane: 'smoke',
      adapter: { id: fixture.adapterId, promotionStatus: 'smoke' },
      repository: { commit: 'a'.repeat(40), tree: 'b'.repeat(40), dirty: false },
      base: { ...SCION_GEMMA4_E2B_BASE, exactRevisionRequired: true },
      dataset: {
        manifestSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        identitySha256: fixture.dataset.manifest.identity.sha256,
      },
      trainer: {
        seed: 16031,
        hyperparameters: {
          trainingMode: 'orpo',
          validationSplit: 'validation',
          iterations: 10,
          batchSize: 1,
          learningRate: 0.00002,
          gradientCheckpointing: true,
          gradientAccumulationSteps: 2,
          loraRank: 16,
          beta: 0.1,
        },
        command: expect.arrayContaining([
          '--scion-seed',
          '16031',
          '--scion-validation-split',
          'validation',
          '--batch-size',
          '1',
          '--grad-checkpoint',
          '--gradient-accumulation-steps',
          '2',
          '--lora-rank',
          '16',
          '--beta',
          '0.1',
        ]),
      },
      identity: { sha256: expect.stringMatching(/^[a-f0-9]{64}$/) },
    });
    expect(fixture.adapterId).toBe(`scion-g4e2b-smoke-${fixture.plan.identity.sha256.slice(0, 16)}`);
  });

  it('completes and verifies a byte-bound run, then rejects weight or dataset mutation', async () => {
    const fixture = await createPlanFixture();
    await fs.writeFile(path.join(fixture.outputDir, 'adapter_config.json'), '{"rank":16}\n');
    await fs.writeFile(path.join(fixture.outputDir, 'adapters.safetensors'), Buffer.from('seeded-adapter-weights'));
    await fs.writeFile(path.join(fixture.outputDir, 'training.log'), 'loss=0.25\n');
    const completed = await completeScionAdapterTrainingRun({
      planPath: fixture.planPath,
      completedAt: '2026-07-15T01:01:00.000Z',
    });

    await expect(
      verifyScionAdapterTrainingRun({
        planPath: fixture.planPath,
        resultPath: completed.resultPath,
        datasetManifestPath: fixture.dataset.manifestPath,
      }),
    ).resolves.toMatchObject({ valid: true, status: 'pass', issues: [] });

    await fs.appendFile(path.join(fixture.outputDir, 'adapters.safetensors'), '-tampered');
    const weightMutation = await verifyScionAdapterTrainingRun({
      planPath: fixture.planPath,
      resultPath: completed.resultPath,
      datasetManifestPath: fixture.dataset.manifestPath,
    });
    expect(weightMutation.valid).toBe(false);
    expect(weightMutation.issues).toContain('result-file-sha256:adapters.safetensors');

    await fs.writeFile(path.join(fixture.dataset.manifestPath, '..', 'test.jsonl'), `${JSON.stringify(sourceRow())}\n`);
    const datasetMutation = await verifyScionAdapterTrainingRun({
      planPath: fixture.planPath,
      resultPath: completed.resultPath,
      datasetManifestPath: fixture.dataset.manifestPath,
    });
    expect(datasetMutation.valid).toBe(false);
    expect(datasetMutation.issues).toContain('dataset:test-sha256');
  });

  it('rejects a drifting toolchain, dirty code tree, and linked adapter output', async () => {
    const receipt = await toolchainReceipt();
    const policy = JSON.parse(await fs.readFile('evaluation/scion-adapters/training-toolchain-v1.json', 'utf8'));
    receipt.packages['mlx-vlm'] = '0.6.4';
    expect(assessScionTrainingToolchain(policy, receipt)).toMatchObject({
      valid: false,
      issues: ['packages.mlx-vlm'],
    });

    root = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-training-refusal-'));
    const dataset = await buildSmokeDataset(path.join(root, 'dataset'));
    const baseSnapshotPath = path.join(root, SCION_GEMMA4_E2B_BASE.revision);
    await fs.mkdir(baseSnapshotPath);
    await expect(
      createScionAdapterTrainingPlan({
        lane: 'smoke',
        datasetManifestPath: dataset.manifestPath,
        baseSnapshotPath,
        toolchainReceipt: await toolchainReceipt(),
        outputRoot: path.join(root, 'adapters'),
        codeRoot: process.cwd(),
        repository: { commit: 'a'.repeat(40), tree: 'b'.repeat(40), dirty: true },
      }),
    ).rejects.toThrow('repository-dirty');

    const fixture = await createPlanFixture();
    await fs.writeFile(path.join(fixture.outputDir, 'real-weights'), 'weights');
    await fs.writeFile(path.join(fixture.outputDir, 'adapter_config.json'), '{"rank":16}\n');
    await fs.symlink('real-weights', path.join(fixture.outputDir, 'adapters.safetensors'));
    await expect(completeScionAdapterTrainingRun({ planPath: fixture.planPath })).rejects.toThrow(
      'Regular file required',
    );
  });

  it('seeds both trainer random sources before forwarding the exact MLX arguments', async () => {
    const { stdout } = await execFile('python3', [
      'trellis/tendril/distill/scion_seeded_mlx_vlm_lora.py',
      '--self-test',
    ]);
    expect(JSON.parse(stdout)).toEqual({
      forwarded: ['--train-mode', 'orpo'],
      seed: 16031,
      status: 'pass',
      validationSplit: 'validation',
    });
  });

  it('carries the verified MLX training chain into a separately packaged browser GGUF', async () => {
    const fixture = await createPlanFixture();
    await fs.writeFile(path.join(fixture.outputDir, 'adapter_config.json'), '{"rank":16}\n');
    await fs.writeFile(path.join(fixture.outputDir, 'adapters.safetensors'), Buffer.from('seeded-source-weights'));
    const completed = await completeScionAdapterTrainingRun({
      planPath: fixture.planPath,
      completedAt: '2026-07-15T01:01:00.000Z',
    });
    const source = await buildScionAdapterManifest({
      adapterDir: fixture.outputDir,
      adapterId: fixture.adapterId,
      scionVersion: '0.16.31',
      datasetManifest: fixture.dataset.manifestPath,
      trainingPlan: fixture.planPath,
      trainingResult: completed.resultPath,
      status: 'smoke',
    });
    const browserDir = path.join(root, 'browser');
    await fs.mkdir(browserDir);
    const browserId = `${fixture.adapterId}-browser`;
    await fs.writeFile(path.join(browserDir, `${browserId}.gguf`), Buffer.alloc(2048, 7));
    await fs.writeFile(path.join(browserDir, 'conversion-receipt.json'), '{"status":"pass"}\n');
    const sourceManifestSha256 = await sha256File(source.outputPath);
    const conversion = {
      pipeline: 'mlx-lora-to-peft-to-gguf-v1',
      sourceAdapterId: fixture.adapterId,
      sourceManifestSha256,
      receiptPath: 'conversion-receipt.json',
      converter: {
        id: 'ggml-org/llama.cpp/convert_lora_to_gguf.py',
        revision: '5ec717d1256e34558a44dc09adf1e6e16f2e2682',
        sha256: '7e82b74442df2faab81c30e7d83614d10905294cec92092ec2a1749700d1a378',
        outputType: 'f16',
      },
    };
    const browser = await buildScionAdapterManifest({
      adapterDir: browserDir,
      adapterId: browserId,
      scionVersion: '0.16.31',
      datasetManifest: fixture.dataset.manifestPath,
      files: [`${browserId}.gguf`, 'conversion-receipt.json'],
      format: 'gguf-lora',
      status: 'smoke',
      scale: 1,
      conversion,
      trainingProvenance: { sourceManifest: source.outputPath },
    });

    expect(browser.manifest.training.run).toMatchObject({
      lane: 'smoke',
      sourceAdapterId: fixture.adapterId,
      sourceManifestPath: 'source-adapter-manifest.json',
      sourceManifestSha256,
    });
    expect(browser.manifest.files.map((file) => file.path)).toEqual(
      expect.arrayContaining([
        'training-plan.json',
        'training-result.json',
        'source-adapter-manifest.json',
        `${browserId}.gguf`,
      ]),
    );
    await expect(verifyScionAdapterPackage({ manifestPath: browser.outputPath })).resolves.toMatchObject({
      valid: true,
      status: 'pass',
    });
  });
});
