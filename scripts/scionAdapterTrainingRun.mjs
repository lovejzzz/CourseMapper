#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

import { computeScionAdapterDatasetIdentity, SCION_ORPO_TRAINING_FORMAT } from './scionAdapterDataset.mjs';
import { SCION_GEMMA4_E2B_BASE } from '../src/lib/scionAdapterManifest.js';

const execFile = promisify(execFileCallback);

export const SCION_TRAINING_RUN_PROTOCOL = 'scion-adapter-training-run-v1';
export const SCION_TRAINING_RESULT_PROTOCOL = 'scion-adapter-training-result-v1';
const SHA256_RE = /^[a-f0-9]{64}$/;
const REVISION_RE = /^[a-f0-9]{40}$/;
const ADAPTER_ID_RE = /^[a-z0-9][a-z0-9._-]{2,79}$/;
const DEFAULT_TOOLCHAIN_POLICY = 'evaluation/scion-adapters/training-toolchain-v1.json';
const DEFAULT_BASE_CONTRACT = 'evaluation/scion-adapters/base-contracts/gemma-4-e2b.json';
const TRAINING_CODE_PATHS = [
  'scripts/scionAdapterDataset.mjs',
  'scripts/scionAdapterPackage.mjs',
  'scripts/scionAdapterTrainingRun.mjs',
  'trellis/tendril/distill/prepare_adapter_base.py',
  'trellis/tendril/distill/run_orpo_g4.sh',
  'trellis/tendril/distill/scion_seeded_mlx_vlm_lora.py',
];
const DATASET_STATUS_BY_LANE = Object.freeze({
  smoke: 'smoke-only',
  research: 'research-ready',
  production: 'ready',
});
const PROMOTION_STATUS_BY_LANE = Object.freeze({ smoke: 'smoke', research: 'research', production: 'candidate' });

export const SCION_ORPO_DEFAULTS = Object.freeze({
  trainingMode: 'orpo',
  split: 'train',
  iterations: 600,
  batchSize: 1,
  learningRate: 0.00002,
  stepsPerReport: 20,
  stepsPerEval: 200,
  stepsPerSave: 100,
  validationBatches: 4,
  maxSequenceLength: 2048,
  gradientCheckpointing: true,
  gradientAccumulationSteps: 2,
  loraRank: 16,
  loraAlpha: 16,
  loraDropout: 0,
  beta: 0.1,
  epsilon: 1e-8,
});

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

export function stableJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256Value(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export async function sha256File(filePath) {
  const digest = crypto.createHash('sha256');
  const handle = await fs.open(filePath, 'r');
  try {
    for await (const chunk of handle.createReadStream({ autoClose: false })) digest.update(chunk);
  } finally {
    await handle.close();
  }
  return digest.digest('hex');
}

function normalizeRelative(value) {
  return String(value || '').replaceAll('\\', '/');
}

function safeRelative(value) {
  const normalized = normalizeRelative(value);
  return (
    normalized &&
    !normalized.startsWith('/') &&
    !/^[a-z]:\//i.test(normalized) &&
    normalized.split('/').every((part) => part && part !== '.' && part !== '..')
  );
}

async function inspectRegularFile(filePath, { allowEmpty = false } = {}) {
  const absolutePath = path.resolve(filePath);
  const stats = await fs.lstat(absolutePath);
  if (!stats.isFile() || stats.isSymbolicLink()) throw new Error(`Regular file required: ${filePath}`);
  if (!allowEmpty && stats.size <= 0) throw new Error(`Non-empty file required: ${filePath}`);
  return { absolutePath, bytes: stats.size, sha256: await sha256File(absolutePath) };
}

async function readRegularJson(filePath) {
  await inspectRegularFile(filePath);
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid JSON file ${filePath}: ${error?.message || error}`);
  }
}

function requireExactObject(actual, expected, prefix, issues) {
  for (const [key, value] of Object.entries(expected || {})) {
    if (actual?.[key] !== value) issues.push(`${prefix}.${key}`);
  }
}

export function assessScionTrainingToolchain(policy, receipt) {
  const issues = [];
  if (policy?.schemaVersion !== 1 || policy?.protocol !== 'scion-mlx-orpo-toolchain-v1') {
    issues.push('policy-identity');
  }
  if (receipt?.schemaVersion !== 1 || receipt?.protocol !== 'scion-mlx-orpo-toolchain-receipt-v1') {
    issues.push('receipt-identity');
  }
  requireExactObject(receipt?.platform, policy?.platform, 'platform', issues);
  requireExactObject(receipt?.packages, policy?.packages, 'packages', issues);
  for (const [moduleName, expected] of Object.entries(policy?.modules || {})) {
    requireExactObject(receipt?.modules?.[moduleName], expected, `modules.${moduleName}`, issues);
  }
  return { valid: issues.length === 0, issues };
}

async function verifySourceReceipts(manifest, sourceRoot) {
  const issues = [];
  const receipts = Array.isArray(manifest?.sourceReceipts) ? manifest.sourceReceipts : [];
  if (receipts.length !== (Array.isArray(manifest?.sources) ? manifest.sources.length : 0)) {
    issues.push('source-receipt-count');
  }
  for (const receipt of receipts) {
    const sourcePath = path.isAbsolute(receipt?.path || '')
      ? path.resolve(receipt.path)
      : path.resolve(sourceRoot, receipt?.path || '');
    if (receipt?.status === 'missing') {
      try {
        await fs.lstat(sourcePath);
        issues.push(`source-now-exists:${receipt?.path}`);
      } catch (error) {
        if (error?.code !== 'ENOENT') issues.push(`source-unreadable:${receipt?.path}`);
      }
      continue;
    }
    if (receipt?.status !== 'verified') {
      issues.push(`source-status:${receipt?.path}`);
      continue;
    }
    try {
      const actual = await inspectRegularFile(sourcePath, { allowEmpty: true });
      if (actual.bytes !== receipt.bytes) issues.push(`source-bytes:${receipt.path}`);
      if (actual.sha256 !== receipt.sha256) issues.push(`source-sha256:${receipt.path}`);
    } catch {
      issues.push(`source-unavailable:${receipt?.path}`);
    }
  }
  return issues;
}

export async function verifyScionAdapterDatasetForTraining({ manifestPath, lane, sourceRoot = process.cwd() } = {}) {
  if (!DATASET_STATUS_BY_LANE[lane]) throw new Error(`Unknown training lane: ${lane || 'missing'}`);
  const manifestFile = await inspectRegularFile(manifestPath);
  const manifest = await readRegularJson(manifestFile.absolutePath);
  const datasetDir = path.dirname(manifestFile.absolutePath);
  const issues = [];
  if (manifest?.schemaVersion !== 3) issues.push('dataset-schema-version');
  if (stableJson(manifest?.trainingFormat) !== stableJson(SCION_ORPO_TRAINING_FORMAT)) {
    issues.push('dataset-training-format');
  }
  if (manifest?.status !== DATASET_STATUS_BY_LANE[lane]) {
    issues.push(`dataset-status:${manifest?.status || 'missing'}!=${DATASET_STATUS_BY_LANE[lane]}`);
  }
  if (lane === 'production' && manifest?.promotable !== true) issues.push('production-dataset-not-promotable');
  if (lane !== 'production' && manifest?.promotable !== false) issues.push(`${lane}-dataset-must-not-promote`);
  if (manifest?.primaryPreferenceEvidence !== 'single-model-judge') issues.push('primary-preference-evidence');
  if (manifest?.leakage?.groupOverlapCount !== 0) issues.push('dataset-group-leakage');
  const expectedIdentity = computeScionAdapterDatasetIdentity(manifest);
  if (manifest?.identity?.protocol !== 'scion-adapter-dataset-identity-v1') issues.push('dataset-identity-protocol');
  if (manifest?.identity?.sha256 !== expectedIdentity) issues.push('dataset-identity-sha256');
  const splitFiles = {};
  let splitRows = 0;
  for (const split of ['train', 'valid', 'test']) {
    const expected = manifest?.files?.[split];
    const relativePath = normalizeRelative(expected?.path);
    if (!safeRelative(relativePath)) {
      issues.push(`${split}-path`);
      continue;
    }
    const absolutePath = path.resolve(datasetDir, relativePath);
    const relative = normalizeRelative(path.relative(datasetDir, absolutePath));
    if (!relative || relative.startsWith('../') || path.isAbsolute(relative)) {
      issues.push(`${split}-path-escape`);
      continue;
    }
    try {
      const actual = await inspectRegularFile(absolutePath, { allowEmpty: true });
      const text = await fs.readFile(absolutePath, 'utf8');
      const lines = text
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      for (const line of lines) JSON.parse(line);
      if (actual.bytes !== expected?.bytes) issues.push(`${split}-bytes`);
      if (actual.sha256 !== expected?.sha256) issues.push(`${split}-sha256`);
      if (lines.length !== expected?.rows) issues.push(`${split}-rows`);
      if (lines.length !== manifest?.counts?.[split]) issues.push(`${split}-count`);
      splitRows += lines.length;
      splitFiles[split] = { path: relativePath, bytes: actual.bytes, sha256: actual.sha256, rows: lines.length };
    } catch (error) {
      issues.push(`${split}-unavailable:${error?.code || 'invalid'}`);
    }
  }
  if (splitRows !== manifest?.counts?.total) issues.push('dataset-total-count');
  const profile = lane === 'production' ? 'production' : lane === 'research' ? 'research' : null;
  if (profile && (manifest?.gate?.profiles?.[profile]?.issues || []).length > 0) issues.push(`${profile}-gate-issues`);
  issues.push(...(await verifySourceReceipts(manifest, sourceRoot)));
  return {
    valid: issues.length === 0,
    issues,
    manifest,
    manifestPath: manifestFile.absolutePath,
    manifestSha256: manifestFile.sha256,
    identitySha256: expectedIdentity,
    files: splitFiles,
  };
}

async function inspectRepository(codeRoot) {
  const cwd = path.resolve(codeRoot);
  const [{ stdout: status }, { stdout: commit }, { stdout: tree }] = await Promise.all([
    execFile('git', ['status', '--porcelain', '--untracked-files=all'], { cwd }),
    execFile('git', ['rev-parse', 'HEAD^{commit}'], { cwd }),
    execFile('git', ['rev-parse', 'HEAD^{tree}'], { cwd }),
  ]);
  return {
    commit: commit.trim(),
    tree: tree.trim(),
    dirty: Boolean(status.trim()),
    dirtyEntries: status.trim().split('\n').filter(Boolean).slice(0, 20),
  };
}

function validateRepository(repository) {
  const issues = [];
  if (!REVISION_RE.test(repository?.commit || '')) issues.push('repository-commit');
  if (!REVISION_RE.test(repository?.tree || '')) issues.push('repository-tree');
  if (repository?.dirty !== false) issues.push('repository-dirty');
  return issues;
}

function validateHyperparameters(hyperparameters, lane, seed) {
  const issues = [];
  const positiveIntegers = [
    'iterations',
    'batchSize',
    'stepsPerReport',
    'stepsPerEval',
    'stepsPerSave',
    'validationBatches',
    'maxSequenceLength',
    'gradientAccumulationSteps',
    'loraRank',
  ];
  for (const key of positiveIntegers) {
    if (!Number.isSafeInteger(hyperparameters?.[key]) || hyperparameters[key] <= 0)
      issues.push(`hyperparameter:${key}`);
  }
  for (const key of ['learningRate', 'loraAlpha', 'beta', 'epsilon']) {
    if (!Number.isFinite(hyperparameters?.[key]) || hyperparameters[key] <= 0) issues.push(`hyperparameter:${key}`);
  }
  if (
    !Number.isFinite(hyperparameters?.loraDropout) ||
    hyperparameters.loraDropout < 0 ||
    hyperparameters.loraDropout >= 1
  ) {
    issues.push('hyperparameter:loraDropout');
  }
  if (hyperparameters?.trainingMode !== 'orpo') issues.push('hyperparameter:trainingMode');
  if (hyperparameters?.split !== 'train') issues.push('hyperparameter:split');
  if (hyperparameters?.gradientCheckpointing !== true) issues.push('hyperparameter:gradientCheckpointing');
  if (lane === 'smoke' && hyperparameters?.iterations !== 10) issues.push('smoke-iterations');
  if (lane !== 'smoke' && hyperparameters?.iterations < 100) issues.push(`${lane}-iterations`);
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) issues.push('seed');
  return issues;
}

function trainerArgs(hyperparameters) {
  const args = [
    '--model-path',
    '{BASE_SNAPSHOT}',
    '--dataset',
    '{DATASET_DIR}',
    '--split',
    hyperparameters.split,
    '--train-mode',
    hyperparameters.trainingMode,
    '--iters',
    String(hyperparameters.iterations),
    '--batch-size',
    String(hyperparameters.batchSize),
    '--learning-rate',
    String(hyperparameters.learningRate),
    '--steps-per-report',
    String(hyperparameters.stepsPerReport),
    '--steps-per-eval',
    String(hyperparameters.stepsPerEval),
    '--steps-per-save',
    String(hyperparameters.stepsPerSave),
    '--val-batches',
    String(hyperparameters.validationBatches),
    '--max-seq-length',
    String(hyperparameters.maxSequenceLength),
  ];
  if (hyperparameters.gradientCheckpointing) args.push('--grad-checkpoint');
  args.push(
    '--gradient-accumulation-steps',
    String(hyperparameters.gradientAccumulationSteps),
    '--lora-rank',
    String(hyperparameters.loraRank),
    '--lora-alpha',
    String(hyperparameters.loraAlpha),
    '--lora-dropout',
    String(hyperparameters.loraDropout),
    '--beta',
    String(hyperparameters.beta),
    '--eps',
    String(hyperparameters.epsilon),
    '--output-path',
    '{OUTPUT_DIR}',
  );
  return args;
}

function trainingPlanIdentityPayload(plan) {
  return {
    protocol: plan?.protocol,
    lane: plan?.lane,
    scionVersion: plan?.scionVersion,
    repository: plan?.repository,
    base: plan?.base,
    dataset: plan?.dataset,
    toolchain: plan?.toolchain,
    trainer: plan?.trainer,
  };
}

export function computeScionAdapterTrainingPlanIdentity(plan) {
  return sha256Value(stableJson(trainingPlanIdentityPayload(plan)));
}

function trainingResultIdentityPayload(result) {
  return {
    protocol: result?.protocol,
    planSha256: result?.planSha256,
    planIdentitySha256: result?.planIdentitySha256,
    adapterId: result?.adapterId,
    files: result?.files,
    log: result?.log || null,
  };
}

export function computeScionAdapterTrainingResultIdentity(result) {
  return sha256Value(stableJson(trainingResultIdentityPayload(result)));
}

async function inspectTrainingCode(codeRoot) {
  const records = [];
  for (const relativePath of TRAINING_CODE_PATHS) {
    const file = await inspectRegularFile(path.resolve(codeRoot, relativePath));
    records.push({ path: relativePath, bytes: file.bytes, sha256: file.sha256 });
  }
  return records;
}

async function verifyBaseContract(baseContractPath, baseSnapshotPath) {
  const contractFile = await inspectRegularFile(baseContractPath);
  const contract = await readRegularJson(contractFile.absolutePath);
  const issues = [];
  requireExactObject(contract?.trainingBase, SCION_GEMMA4_E2B_BASE, 'trainingBase', issues);
  if (contract?.trainingBase?.public !== true) issues.push('trainingBase.public');
  if (contract?.trainingBase?.gated !== false) issues.push('trainingBase.gated');
  const snapshotStats = await fs.lstat(baseSnapshotPath);
  if (!snapshotStats.isDirectory() || snapshotStats.isSymbolicLink()) issues.push('base-snapshot-directory');
  if (path.basename(path.resolve(baseSnapshotPath)) !== SCION_GEMMA4_E2B_BASE.revision) {
    issues.push('base-snapshot-revision');
  }
  return {
    valid: issues.length === 0,
    issues,
    contractSha256: contractFile.sha256,
    snapshotRevision: path.basename(path.resolve(baseSnapshotPath)),
  };
}

export async function createScionAdapterTrainingPlan({
  lane,
  datasetManifestPath,
  baseSnapshotPath,
  toolchainReceipt,
  outputRoot,
  codeRoot = process.cwd(),
  scionVersion,
  seed = 16031,
  iterations,
  generatedAt = new Date().toISOString(),
  repository,
  toolchainPolicyPath = path.resolve(codeRoot, DEFAULT_TOOLCHAIN_POLICY),
  baseContractPath = path.resolve(codeRoot, DEFAULT_BASE_CONTRACT),
} = {}) {
  if (!DATASET_STATUS_BY_LANE[lane]) throw new Error(`Unknown training lane: ${lane || 'missing'}`);
  if (!outputRoot) throw new Error('outputRoot is required');
  if (!baseSnapshotPath) throw new Error('baseSnapshotPath is required');
  const dataset = await verifyScionAdapterDatasetForTraining({
    manifestPath: datasetManifestPath,
    lane,
    sourceRoot: codeRoot,
  });
  if (!dataset.valid) throw new Error(`Training dataset failed verification: ${dataset.issues.join(', ')}`);
  const policyFile = await inspectRegularFile(toolchainPolicyPath);
  const policy = await readRegularJson(policyFile.absolutePath);
  const toolchainAssessment = assessScionTrainingToolchain(policy, toolchainReceipt);
  if (!toolchainAssessment.valid) {
    throw new Error(`Training toolchain failed verification: ${toolchainAssessment.issues.join(', ')}`);
  }
  const base = await verifyBaseContract(baseContractPath, baseSnapshotPath);
  if (!base.valid) throw new Error(`Training base failed verification: ${base.issues.join(', ')}`);
  const repositoryReceipt = repository || (await inspectRepository(codeRoot));
  const repositoryIssues = validateRepository(repositoryReceipt);
  if (repositoryIssues.length > 0)
    throw new Error(`Training repository failed verification: ${repositoryIssues.join(', ')}`);
  const packageJson = JSON.parse(await fs.readFile(path.resolve(codeRoot, 'package.json'), 'utf8'));
  const resolvedScionVersion = scionVersion || packageJson.version;
  const hyperparameters = {
    ...SCION_ORPO_DEFAULTS,
    iterations: iterations == null ? (lane === 'smoke' ? 10 : SCION_ORPO_DEFAULTS.iterations) : Number(iterations),
  };
  const hyperparameterIssues = validateHyperparameters(hyperparameters, lane, Number(seed));
  if (hyperparameterIssues.length > 0)
    throw new Error(`Training parameters failed verification: ${hyperparameterIssues.join(', ')}`);
  const codeFiles = await inspectTrainingCode(codeRoot);
  const plan = {
    schemaVersion: 1,
    protocol: SCION_TRAINING_RUN_PROTOCOL,
    status: 'planned',
    lane,
    scionVersion: resolvedScionVersion,
    startedAt: generatedAt,
    repository: {
      commit: repositoryReceipt.commit,
      tree: repositoryReceipt.tree,
      dirty: false,
    },
    base: {
      ...SCION_GEMMA4_E2B_BASE,
      exactRevisionRequired: true,
      contractSha256: base.contractSha256,
      snapshotRevision: base.snapshotRevision,
    },
    dataset: {
      manifestSha256: dataset.manifestSha256,
      identitySha256: dataset.identitySha256,
      status: dataset.manifest.status,
      primaryPreferenceEvidence: dataset.manifest.primaryPreferenceEvidence,
      counts: {
        total: dataset.manifest.counts.total,
        domains: dataset.manifest.counts.domains,
        groups: dataset.manifest.counts.groups,
        train: dataset.manifest.counts.train,
        valid: dataset.manifest.counts.valid,
        test: dataset.manifest.counts.test,
      },
      files: dataset.files,
    },
    toolchain: {
      policySha256: policyFile.sha256,
      receipt: toolchainReceipt,
    },
    trainer: {
      entrypoint: 'trellis/tendril/distill/scion_seeded_mlx_vlm_lora.py',
      seed: Number(seed),
      hyperparameters,
      command: [
        '{PYTHON}',
        'trellis/tendril/distill/scion_seeded_mlx_vlm_lora.py',
        '--scion-seed',
        String(seed),
        '--',
        ...trainerArgs(hyperparameters),
      ],
      codeFiles,
    },
  };
  const identitySha256 = computeScionAdapterTrainingPlanIdentity(plan);
  const adapterId = `scion-g4e2b-${lane}-${identitySha256.slice(0, 16)}`;
  if (!ADAPTER_ID_RE.test(adapterId)) throw new Error('Derived adapter ID is invalid');
  plan.identity = { algorithm: 'sha256-canonical-training-plan-v1', sha256: identitySha256 };
  plan.adapter = { id: adapterId, promotionStatus: PROMOTION_STATUS_BY_LANE[lane] };
  const outputDir = path.resolve(outputRoot, adapterId);
  try {
    const entries = await fs.readdir(outputDir);
    if (entries.length > 0) throw new Error(`Training output already exists and is not empty: ${outputDir}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  await fs.mkdir(outputDir, { recursive: true });
  const planPath = path.join(outputDir, 'training-plan.json');
  await fs.writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, { flag: 'wx' });
  return { plan, planPath, outputDir, adapterId, planSha256: await sha256File(planPath) };
}

async function readVerifiedPlan(planPath) {
  const planFile = await inspectRegularFile(planPath);
  const plan = await readRegularJson(planFile.absolutePath);
  const issues = [];
  if (plan?.schemaVersion !== 1 || plan?.protocol !== SCION_TRAINING_RUN_PROTOCOL) issues.push('plan-identity');
  if (plan?.status !== 'planned') issues.push('plan-status');
  const expectedIdentity = computeScionAdapterTrainingPlanIdentity(plan);
  if (plan?.identity?.algorithm !== 'sha256-canonical-training-plan-v1') issues.push('plan-identity-algorithm');
  if (plan?.identity?.sha256 !== expectedIdentity) issues.push('plan-identity-sha256');
  if (!ADAPTER_ID_RE.test(plan?.adapter?.id || '')) issues.push('plan-adapter-id');
  if (plan?.adapter?.id !== `scion-g4e2b-${plan?.lane}-${expectedIdentity.slice(0, 16)}`) {
    issues.push('plan-derived-adapter-id');
  }
  issues.push(...validateRepository(plan?.repository));
  issues.push(...validateHyperparameters(plan?.trainer?.hyperparameters, plan?.lane, plan?.trainer?.seed));
  return { valid: issues.length === 0, issues, plan, planPath: planFile.absolutePath, planSha256: planFile.sha256 };
}

export async function completeScionAdapterTrainingRun({
  planPath,
  completedAt = new Date().toISOString(),
  output,
} = {}) {
  const verifiedPlan = await readVerifiedPlan(planPath);
  if (!verifiedPlan.valid) throw new Error(`Training plan failed verification: ${verifiedPlan.issues.join(', ')}`);
  const outputDir = path.dirname(verifiedPlan.planPath);
  const files = [];
  for (const relativePath of ['adapter_config.json', 'adapters.safetensors']) {
    const file = await inspectRegularFile(path.join(outputDir, relativePath));
    files.push({ path: relativePath, bytes: file.bytes, sha256: file.sha256 });
  }
  let log = null;
  try {
    const logFile = await inspectRegularFile(path.join(outputDir, 'training.log'), { allowEmpty: true });
    log = {
      path: 'training.log',
      bytes: logFile.bytes,
      sha256: logFile.sha256,
      retainedLocally: true,
      includedInPackage: false,
    };
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const startedAtMs = Date.parse(verifiedPlan.plan.startedAt);
  const completedAtMs = Date.parse(completedAt);
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(completedAtMs) || completedAtMs < startedAtMs) {
    throw new Error('Training completion time must be at or after the plan start time');
  }
  const result = {
    schemaVersion: 1,
    protocol: SCION_TRAINING_RESULT_PROTOCOL,
    status: 'completed',
    adapterId: verifiedPlan.plan.adapter.id,
    planSha256: verifiedPlan.planSha256,
    planIdentitySha256: verifiedPlan.plan.identity.sha256,
    completedAt,
    durationMs: completedAtMs - startedAtMs,
    files,
    ...(log ? { log } : {}),
  };
  result.identity = {
    algorithm: 'sha256-canonical-training-result-v1',
    sha256: computeScionAdapterTrainingResultIdentity(result),
  };
  const resultPath = path.resolve(output || path.join(outputDir, 'training-result.json'));
  if (path.dirname(resultPath) !== outputDir)
    throw new Error('Training result must stay inside the adapter output directory');
  await fs.writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
  return { result, resultPath, resultSha256: await sha256File(resultPath) };
}

export async function verifyScionAdapterTrainingRun({ planPath, resultPath, datasetManifestPath, sourceRoot } = {}) {
  const plan = await readVerifiedPlan(planPath);
  const issues = [...plan.issues];
  let result = null;
  let resultFile = null;
  try {
    resultFile = await inspectRegularFile(resultPath);
    result = await readRegularJson(resultFile.absolutePath);
    if (result?.schemaVersion !== 1 || result?.protocol !== SCION_TRAINING_RESULT_PROTOCOL)
      issues.push('result-identity');
    if (result?.status !== 'completed') issues.push('result-status');
    if (result?.adapterId !== plan?.plan?.adapter?.id) issues.push('result-adapter-id');
    if (result?.planSha256 !== plan?.planSha256) issues.push('result-plan-sha256');
    if (result?.planIdentitySha256 !== plan?.plan?.identity?.sha256) issues.push('result-plan-identity-sha256');
    const expectedResultIdentity = computeScionAdapterTrainingResultIdentity(result);
    if (result?.identity?.algorithm !== 'sha256-canonical-training-result-v1') issues.push('result-identity-algorithm');
    if (result?.identity?.sha256 !== expectedResultIdentity) issues.push('result-identity-sha256');
    const outputDir = path.dirname(resultFile.absolutePath);
    for (const expected of Array.isArray(result?.files) ? result.files : []) {
      if (!safeRelative(expected?.path)) {
        issues.push('result-file-path');
        continue;
      }
      const absolutePath = path.resolve(outputDir, expected.path);
      const relative = normalizeRelative(path.relative(outputDir, absolutePath));
      if (!relative || relative.startsWith('../') || path.isAbsolute(relative)) {
        issues.push(`result-file-escape:${expected.path}`);
        continue;
      }
      try {
        const actual = await inspectRegularFile(absolutePath, { allowEmpty: expected.path === 'training.log' });
        if (actual.bytes !== expected.bytes) issues.push(`result-file-bytes:${expected.path}`);
        if (actual.sha256 !== expected.sha256) issues.push(`result-file-sha256:${expected.path}`);
      } catch {
        issues.push(`result-file-unavailable:${expected?.path}`);
      }
    }
    if (result?.log) {
      const expected = result.log;
      if (
        expected.path !== 'training.log' ||
        expected.retainedLocally !== true ||
        expected.includedInPackage !== false
      ) {
        issues.push('result-log-contract');
      } else {
        try {
          const actual = await inspectRegularFile(path.join(outputDir, expected.path), { allowEmpty: true });
          if (actual.bytes !== expected.bytes) issues.push('result-log-bytes');
          if (actual.sha256 !== expected.sha256) issues.push('result-log-sha256');
        } catch {
          issues.push('result-log-unavailable');
        }
      }
    }
  } catch (error) {
    issues.push(`result-unavailable:${error?.code || 'invalid'}`);
  }
  let dataset = null;
  if (datasetManifestPath && plan?.plan?.lane) {
    dataset = await verifyScionAdapterDatasetForTraining({
      manifestPath: datasetManifestPath,
      lane: plan.plan.lane,
      sourceRoot,
    });
    issues.push(...dataset.issues.map((issue) => `dataset:${issue}`));
    if (dataset.manifestSha256 !== plan.plan.dataset?.manifestSha256) issues.push('dataset:manifest-sha256');
    if (dataset.identitySha256 !== plan.plan.dataset?.identitySha256) issues.push('dataset:identity-sha256');
  }
  return {
    valid: issues.length === 0,
    status: issues.length === 0 ? 'pass' : 'fail',
    issues: [...new Set(issues)],
    plan: plan.plan,
    planSha256: plan.planSha256,
    result,
    resultSha256: resultFile?.sha256 || null,
    dataset,
  };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--plan') args.mode = 'plan';
    else if (arg === '--complete') args.mode = 'complete';
    else if (arg === '--verify') args.mode = 'verify';
    else if (arg === '--audit-contract') args.mode = 'audit-contract';
    else if (arg === '--audit-toolchain') args.mode = 'audit-toolchain';
    else if (arg === '--lane') args.lane = argv[++index];
    else if (arg === '--dataset-manifest') args.datasetManifestPath = argv[++index];
    else if (arg === '--base-snapshot') args.baseSnapshotPath = argv[++index];
    else if (arg === '--toolchain-receipt') args.toolchainReceiptPath = argv[++index];
    else if (arg === '--toolchain-policy') args.toolchainPolicyPath = argv[++index];
    else if (arg === '--base-contract') args.baseContractPath = argv[++index];
    else if (arg === '--output-root') args.outputRoot = argv[++index];
    else if (arg === '--plan-file') args.planPath = argv[++index];
    else if (arg === '--result-file') args.resultPath = argv[++index];
    else if (arg === '--seed') args.seed = Number(argv[++index]);
    else if (arg === '--iterations') args.iterations = Number(argv[++index]);
    else if (arg === '--python') args.python = argv[++index];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.mode === 'audit-contract') {
    const codeRoot = process.cwd();
    const policy = await readRegularJson(path.resolve(codeRoot, DEFAULT_TOOLCHAIN_POLICY));
    const policyIssues = [];
    if (policy?.schemaVersion !== 1 || policy?.protocol !== 'scion-mlx-orpo-toolchain-v1') {
      policyIssues.push('policy-identity');
    }
    for (const value of Object.values(policy?.modules || {})) {
      if (!SHA256_RE.test(value?.sha256 || '')) policyIssues.push('policy-module-sha256');
    }
    const wrapperPath = path.resolve(codeRoot, 'trellis/tendril/distill/scion_seeded_mlx_vlm_lora.py');
    const { stdout } = await execFile(args.python || 'python3', [wrapperPath, '--self-test'], { cwd: codeRoot });
    const selfTest = JSON.parse(stdout);
    if (
      selfTest?.status !== 'pass' ||
      selfTest?.seed !== 16031 ||
      stableJson(selfTest?.forwarded) !== stableJson(['--train-mode', 'orpo'])
    ) {
      policyIssues.push('seed-wrapper-self-test');
    }
    const launcher = await fs.readFile(path.resolve(codeRoot, 'trellis/tendril/distill/run_orpo_g4.sh'), 'utf8');
    for (const required of [
      'scion_seeded_mlx_vlm_lora.py',
      'scionAdapterTrainingRun.mjs --complete',
      '--verify',
      '--training-plan',
      '--training-result',
    ]) {
      if (!launcher.includes(required)) policyIssues.push(`launcher-missing:${required.replaceAll('\n', ' ')}`);
    }
    if (launcher.includes('-m mlx_vlm.lora')) policyIssues.push('launcher-bypasses-seed-wrapper');
    const report = {
      status: policyIssues.length === 0 ? 'pass' : 'fail',
      valid: policyIssues.length === 0,
      issues: policyIssues,
      policy: DEFAULT_TOOLCHAIN_POLICY,
      wrapperSelfTest: selfTest,
    };
    console.log(JSON.stringify(report, null, 2));
    if (!report.valid) process.exitCode = 1;
    return;
  }
  if (args.mode === 'audit-toolchain') {
    const codeRoot = process.cwd();
    const python =
      args.python ||
      process.env.SCION_TRAIN_PYTHON ||
      path.join(process.env.HOME || '', '.cache/coursemapper/venv-g4/bin/python');
    const wrapperPath = path.resolve(codeRoot, 'trellis/tendril/distill/scion_seeded_mlx_vlm_lora.py');
    const { stdout } = await execFile(python, [wrapperPath, '--inspect-toolchain'], { cwd: codeRoot });
    const receipt = JSON.parse(stdout);
    const policyPath = path.resolve(codeRoot, args.toolchainPolicyPath || DEFAULT_TOOLCHAIN_POLICY);
    const policy = await readRegularJson(policyPath);
    const assessment = assessScionTrainingToolchain(policy, receipt);
    const report = {
      status: assessment.valid ? 'pass' : 'fail',
      valid: assessment.valid,
      issues: assessment.issues,
      python,
      policySha256: await sha256File(policyPath),
      receipt,
    };
    console.log(JSON.stringify(report, null, 2));
    if (!report.valid) process.exitCode = 1;
    return;
  }
  if (args.mode === 'plan') {
    if (!args.toolchainReceiptPath) throw new Error('--toolchain-receipt is required');
    const toolchainReceipt = await readRegularJson(args.toolchainReceiptPath);
    const result = await createScionAdapterTrainingPlan({ ...args, toolchainReceipt });
    console.log(
      JSON.stringify({
        status: 'planned',
        adapterId: result.adapterId,
        outputDir: result.outputDir,
        planPath: result.planPath,
        planSha256: result.planSha256,
      }),
    );
    return;
  }
  if (args.mode === 'complete') {
    const result = await completeScionAdapterTrainingRun(args);
    console.log(
      JSON.stringify({ status: 'completed', resultPath: result.resultPath, resultSha256: result.resultSha256 }),
    );
    return;
  }
  if (args.mode === 'verify') {
    const result = await verifyScionAdapterTrainingRun(args);
    console.log(JSON.stringify(result, null, 2));
    if (!result.valid) process.exitCode = 1;
    return;
  }
  throw new Error('Choose exactly one of --plan, --complete, or --verify');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(`REFUSING: ${error?.message || error}`);
    process.exitCode = 1;
  });
}
