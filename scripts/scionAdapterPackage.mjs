#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  SCION_ADAPTER_MANIFEST_SCHEMA_VERSION,
  SCION_GEMMA4_E2B_BASE,
  validateScionAdapterManifest,
} from '../src/lib/scionAdapterManifest.js';

const DEFAULT_FILES = ['adapter_config.json', 'adapters.safetensors'];

const RUNTIME_BY_FORMAT = Object.freeze({
  'mlx-lora-safetensors': ['mlx-vlm'],
  'gguf-lora': ['scion-wllama-webgpu-jspi-v1'],
});

export async function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  const handle = await fs.open(filePath, 'r');
  try {
    for await (const chunk of handle.createReadStream({ autoClose: false })) hash.update(chunk);
  } finally {
    await handle.close();
  }
  return hash.digest('hex');
}

async function inspectFile(root, relativePath) {
  const normalized = String(relativePath || '').replaceAll('\\', '/');
  const absolutePath = path.resolve(root, normalized);
  const relative = path.relative(path.resolve(root), absolutePath).replaceAll('\\', '/');
  if (!relative || relative.startsWith('../') || path.isAbsolute(relative)) {
    throw new Error(`Adapter file escapes its package root: ${relativePath}`);
  }
  const stats = await fs.lstat(absolutePath);
  if (!stats.isFile() || stats.isSymbolicLink())
    throw new Error(`Adapter artifact must be a regular file: ${relative}`);
  return { path: relative, bytes: stats.size, sha256: await sha256File(absolutePath) };
}

export async function buildScionAdapterManifest({
  adapterDir,
  adapterId,
  scionVersion,
  datasetManifest,
  output,
  files = DEFAULT_FILES,
  format = 'mlx-lora-safetensors',
  method = 'orpo-lora',
  status = 'candidate',
  evidence = [],
  conversion,
  scale,
  trainingPlan,
  trainingResult,
  trainingProvenance,
} = {}) {
  if (!adapterDir) throw new Error('adapterDir is required');
  if (!datasetManifest) throw new Error('datasetManifest is required');
  const root = path.resolve(adapterDir);
  const datasetPath = path.resolve(datasetManifest);
  const dataset = JSON.parse(await fs.readFile(datasetPath, 'utf8'));
  const requiresTrainingRun = ['research', 'candidate', 'promoted'].includes(status);
  if (requiresTrainingRun && (!trainingPlan || !trainingResult) && !trainingProvenance) {
    throw new Error(`${status} adapters require direct training receipts or inherited training provenance`);
  }
  let trainingRun = null;
  const packageFiles = [...files];
  if (trainingProvenance) {
    if (trainingPlan || trainingResult) throw new Error('Direct and inherited training provenance cannot be combined');
    if (format !== 'gguf-lora')
      throw new Error('Inherited training provenance is only valid for converted GGUF adapters');
    const sourceManifestPath = path.resolve(trainingProvenance.sourceManifest || '');
    const sourceManifestFile = await inspectFile(path.dirname(sourceManifestPath), path.basename(sourceManifestPath));
    const source = JSON.parse(await fs.readFile(sourceManifestPath, 'utf8'));
    const sourceValidation = validateScionAdapterManifest(source);
    if (!sourceValidation.valid) {
      throw new Error(`Inherited source manifest is invalid: ${sourceValidation.issues.join(', ')}`);
    }
    if (source.adapter?.format !== 'mlx-lora-safetensors') {
      throw new Error('Inherited training source must be an MLX LoRA adapter');
    }
    if (!source.training?.run) throw new Error('Inherited training source has no training run');
    if (source.training.datasetManifestSha256 !== (await sha256File(datasetPath))) {
      throw new Error('Inherited training source dataset does not match the converted package dataset');
    }
    if (conversion?.sourceAdapterId !== source.adapter?.id) {
      throw new Error('Conversion source adapter ID does not match inherited training source');
    }
    if (conversion?.sourceManifestSha256 !== sourceManifestFile.sha256) {
      throw new Error('Conversion source manifest digest does not match inherited training source');
    }
    const sourceRoot = path.dirname(sourceManifestPath);
    const sourcePlanPath = path.resolve(sourceRoot, source.training.run.planPath || '');
    const sourceResultPath = path.resolve(sourceRoot, source.training.run.resultPath || '');
    const relativePlan = 'training-plan.json';
    const relativeResult = 'training-result.json';
    const relativeSourceManifest = 'source-adapter-manifest.json';
    const targetPlanPath = path.resolve(root, relativePlan);
    const targetResultPath = path.resolve(root, relativeResult);
    const targetSourceManifestPath = path.resolve(root, relativeSourceManifest);
    for (const [sourcePath, targetPath] of [
      [sourcePlanPath, targetPlanPath],
      [sourceResultPath, targetResultPath],
      [sourceManifestPath, targetSourceManifestPath],
    ]) {
      const sourceFile = await inspectRegularFileForCopy(sourcePath);
      try {
        await fs.copyFile(sourceFile.absolutePath, targetPath, fs.constants.COPYFILE_EXCL);
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
        const targetFile = await inspectRegularFileForCopy(targetPath);
        if (targetFile.sha256 !== sourceFile.sha256)
          throw new Error(`Inherited training file already exists with different bytes: ${targetPath}`);
      }
    }
    const planFile = await inspectFile(root, relativePlan);
    const resultFile = await inspectFile(root, relativeResult);
    const copiedSourceManifest = await inspectFile(root, relativeSourceManifest);
    if (planFile.sha256 !== source.training.run.planSha256) throw new Error('Inherited training plan digest mismatch');
    if (resultFile.sha256 !== source.training.run.resultSha256)
      throw new Error('Inherited training result digest mismatch');
    if (copiedSourceManifest.sha256 !== sourceManifestFile.sha256)
      throw new Error('Inherited source manifest digest mismatch');
    packageFiles.push(relativePlan, relativeResult, relativeSourceManifest);
    trainingRun = {
      ...structuredClone(source.training.run),
      planPath: relativePlan,
      resultPath: relativeResult,
      sourceAdapterId: source.adapter.id,
      sourceManifestPath: relativeSourceManifest,
      sourceManifestSha256: sourceManifestFile.sha256,
    };
  } else if (trainingPlan || trainingResult) {
    if (!trainingPlan || !trainingResult) throw new Error('Training plan and result must be provided together');
    const { verifyScionAdapterTrainingRun } = await import('./scionAdapterTrainingRun.mjs');
    const verified = await verifyScionAdapterTrainingRun({
      planPath: trainingPlan,
      resultPath: trainingResult,
      datasetManifestPath: datasetPath,
      sourceRoot: process.cwd(),
    });
    if (!verified.valid) throw new Error(`Invalid Scion training run: ${verified.issues.join(', ')}`);
    if (verified.plan?.adapter?.id !== adapterId)
      throw new Error('Training plan adapter ID does not match package adapter ID');
    if (verified.plan?.scionVersion !== scionVersion)
      throw new Error('Training plan Scion version does not match package version');
    const expectedLane = status === 'research' ? 'research' : status === 'smoke' ? 'smoke' : 'production';
    if (verified.plan?.lane !== expectedLane)
      throw new Error(`Training plan lane does not match ${status} package status`);
    const relativePlan = path.relative(root, path.resolve(trainingPlan)).replaceAll('\\', '/');
    const relativeResult = path.relative(root, path.resolve(trainingResult)).replaceAll('\\', '/');
    for (const [label, relativePath] of [
      ['plan', relativePlan],
      ['result', relativeResult],
    ]) {
      if (!relativePath || relativePath.startsWith('../') || path.isAbsolute(relativePath)) {
        throw new Error(`Training ${label} must stay inside the adapter package`);
      }
      if (!packageFiles.includes(relativePath)) packageFiles.push(relativePath);
    }
    for (const trainedFile of verified.result?.files || []) {
      const relativePath = String(trainedFile?.path || '').replaceAll('\\', '/');
      if (relativePath && !packageFiles.includes(relativePath)) packageFiles.push(relativePath);
    }
    trainingRun = {
      protocol: verified.plan.protocol,
      lane: verified.plan.lane,
      seed: verified.plan.trainer.seed,
      planPath: relativePlan,
      planSha256: verified.planSha256,
      planIdentitySha256: verified.plan.identity.sha256,
      resultPath: relativeResult,
      resultSha256: verified.resultSha256,
      resultIdentitySha256: verified.result.identity.sha256,
      datasetIdentitySha256: verified.plan.dataset.identitySha256,
      toolchainPolicySha256: verified.plan.toolchain.policySha256,
      repositoryCommit: verified.plan.repository.commit,
      repositoryTree: verified.plan.repository.tree,
      repositoryDirty: false,
    };
  }
  const adapterFiles = await Promise.all(packageFiles.map((file) => inspectFile(root, file)));
  const manifest = {
    schemaVersion: SCION_ADAPTER_MANIFEST_SCHEMA_VERSION,
    adapter: {
      id: adapterId,
      scionVersion,
      format,
      ...(scale == null ? {} : { scale: Number(scale) }),
    },
    base: { ...SCION_GEMMA4_E2B_BASE, exactRevisionRequired: true },
    training: {
      method,
      datasetManifestSha256: await sha256File(datasetPath),
      ...(dataset.identity?.sha256 ? { datasetIdentitySha256: dataset.identity.sha256 } : {}),
      datasetStatus: dataset.status || 'unknown',
      primaryPreferenceEvidence: dataset.primaryPreferenceEvidence || 'unknown',
      pairCount: Number(dataset.counts?.total || 0),
      domainCount: Number(dataset.counts?.domains || 0),
      groupCount: Number(dataset.counts?.groups || 0),
      instructorPairCount: Number(dataset.counts?.blindInstructorPairs || 0),
      instructorDomainCount: Number(dataset.counts?.blindInstructorDomains || 0),
      modelJudgePairCount: Number(dataset.counts?.singleModelJudgePairs || 0),
      modelJudgeDomainCount: Number(dataset.counts?.singleModelJudgeDomains || 0),
      domainGroupCounts:
        dataset.domainGroupCounts && typeof dataset.domainGroupCounts === 'object'
          ? structuredClone(dataset.domainGroupCounts)
          : {},
      instructorDomainCounts:
        dataset.instructorDomainCounts && typeof dataset.instructorDomainCounts === 'object'
          ? structuredClone(dataset.instructorDomainCounts)
          : {},
      modelJudgeDomainCounts:
        dataset.modelJudgeDomainCounts && typeof dataset.modelJudgeDomainCounts === 'object'
          ? structuredClone(dataset.modelJudgeDomainCounts)
          : {},
      splitCounts: {
        train: Number(dataset.counts?.train || 0),
        valid: Number(dataset.counts?.valid || 0),
        test: Number(dataset.counts?.test || 0),
      },
      splitDomainCounts: {
        train: Number(dataset.counts?.trainDomains || 0),
        valid: Number(dataset.counts?.validDomains || 0),
        test: Number(dataset.counts?.testDomains || 0),
      },
      ...(trainingRun ? { run: trainingRun } : {}),
    },
    files: adapterFiles,
    runtime: { supported: RUNTIME_BY_FORMAT[format] || [] },
    promotion: {
      status,
      promotable: status === 'promoted',
      evidence: Array.isArray(evidence) ? evidence.filter(Boolean) : [],
    },
    generatedAt: new Date().toISOString(),
  };
  if (conversion != null) manifest.conversion = structuredClone(conversion);
  const validation = validateScionAdapterManifest(manifest, { requirePromoted: status === 'promoted' });
  if (!validation.valid) throw new Error(`Invalid Scion adapter manifest: ${validation.issues.join(', ')}`);
  const outputPath = path.resolve(output || path.join(root, 'scion-adapter.json'));
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifest, outputPath };
}

async function inspectRegularFileForCopy(filePath) {
  const absolutePath = path.resolve(filePath);
  const stats = await fs.lstat(absolutePath);
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size <= 0) {
    throw new Error(`Inherited training artifact must be a non-empty regular file: ${filePath}`);
  }
  return { absolutePath, bytes: stats.size, sha256: await sha256File(absolutePath) };
}

export async function verifyScionAdapterPackage({ manifestPath, adapterDir, requirePromoted = false } = {}) {
  if (!manifestPath) throw new Error('manifestPath is required');
  const absoluteManifest = path.resolve(manifestPath);
  const manifest = JSON.parse(await fs.readFile(absoluteManifest, 'utf8'));
  const validation = validateScionAdapterManifest(manifest, { requirePromoted });
  const root = path.resolve(adapterDir || path.dirname(absoluteManifest));
  const fileResults = [];
  for (const expected of Array.isArray(manifest.files) ? manifest.files : []) {
    try {
      const actual = await inspectFile(root, expected.path);
      const issues = [];
      if (actual.bytes !== expected.bytes) issues.push('bytes-mismatch');
      if (actual.sha256 !== expected.sha256) issues.push('sha256-mismatch');
      fileResults.push({ path: expected.path, valid: issues.length === 0, issues, expected, actual });
    } catch (error) {
      fileResults.push({
        path: expected?.path || '',
        valid: false,
        issues: ['file-unavailable'],
        error: String(error?.message || error),
      });
    }
  }
  const issues = [
    ...validation.issues,
    ...fileResults.flatMap((file) => file.issues.map((issue) => `${file.path}:${issue}`)),
  ];
  return {
    status: issues.length === 0 ? 'pass' : 'fail',
    valid: issues.length === 0,
    issues,
    manifestPath: absoluteManifest,
    adapterDir: root,
    adapterId: manifest.adapter?.id || null,
    base: manifest.base || null,
    files: fileResults,
  };
}

function parseArgs(argv) {
  const args = { files: [], evidence: [], status: 'candidate', format: 'mlx-lora-safetensors', method: 'orpo-lora' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--adapter-dir') args.adapterDir = argv[++index];
    else if (arg === '--adapter-id') args.adapterId = argv[++index];
    else if (arg === '--scion-version') args.scionVersion = argv[++index];
    else if (arg === '--dataset-manifest') args.datasetManifest = argv[++index];
    else if (arg === '--output') args.output = argv[++index];
    else if (arg === '--file') args.files.push(argv[++index]);
    else if (arg === '--format') args.format = argv[++index];
    else if (arg === '--scale') args.scale = argv[++index];
    else if (arg === '--method') args.method = argv[++index];
    else if (arg === '--status') args.status = argv[++index];
    else if (arg === '--evidence') args.evidence.push(argv[++index]);
    else if (arg === '--training-plan') args.trainingPlan = argv[++index];
    else if (arg === '--training-result') args.trainingResult = argv[++index];
    else if (arg === '--verify') args.verify = argv[++index];
    else if (arg === '--require-promoted') args.requirePromoted = true;
  }
  if (args.files.length === 0) delete args.files;
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.verify) {
    const report = await verifyScionAdapterPackage({
      manifestPath: args.verify,
      adapterDir: args.adapterDir,
      requirePromoted: args.requirePromoted,
    });
    console.log(JSON.stringify(report, null, 2));
    if (!report.valid) process.exitCode = 1;
    return;
  }
  const result = await buildScionAdapterManifest(args);
  console.log(`Scion adapter manifest: ${result.outputPath}`);
  console.log(`Adapter: ${result.manifest.adapter.id}`);
  console.log(`Base: ${result.manifest.base.modelId}@${result.manifest.base.revision}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
