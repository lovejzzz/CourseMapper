#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { validateScionAdapterManifest } from '../src/lib/scionAdapterManifest.js';
import { auditScionAppleSiliconDeviceEvidence } from './scionBrowserDeviceEvidenceAudit.mjs';
import { sha256File } from './lib/scionBrowserDeviceCapture.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_EVIDENCE_DIR = 'evaluation/scion-adapters/evidence/exact-lineage-browser-v0.16.39';
const DEFAULT_TRAINING_EVIDENCE = 'evaluation/scion-adapters/evidence/seeded-training-smoke-v0.16.31.json';
const SHA256 = /^[a-f0-9]{64}$/;
const EXPECTED_PROVENANCE = [
  'conversion-receipt.json',
  'source-adapter-manifest.json',
  'training-plan.json',
  'training-result.json',
];

function clean(value) {
  return String(value ?? '').trim();
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

function fileByPath(manifest, filePath) {
  return (manifest?.files || []).find((file) => clean(file?.path) === filePath);
}

async function verifyRetainedFile({ evidenceDir, manifest, filePath, issues }) {
  const expected = fileByPath(manifest, filePath);
  if (!expected) {
    issues.push(`manifest-file-missing:${filePath}`);
    return null;
  }
  try {
    const absolutePath = path.join(evidenceDir, filePath);
    const stats = await fs.lstat(absolutePath);
    const sha256 = await sha256File(absolutePath);
    if (!stats.isFile() || stats.isSymbolicLink()) issues.push(`retained-file-type:${filePath}`);
    if (stats.size !== expected.bytes) issues.push(`retained-file-bytes:${filePath}`);
    if (sha256 !== expected.sha256) issues.push(`retained-file-sha256:${filePath}`);
    return { path: filePath, bytes: stats.size, sha256 };
  } catch {
    issues.push(`retained-file-unavailable:${filePath}`);
    return null;
  }
}

export async function auditScionExactAdapterLineage({
  evidenceDir = DEFAULT_EVIDENCE_DIR,
  trainingEvidencePath = DEFAULT_TRAINING_EVIDENCE,
} = {}) {
  const absoluteEvidenceDir = path.resolve(root, evidenceDir);
  const absoluteTrainingEvidence = path.resolve(root, trainingEvidencePath);
  const manifestPath = path.join(absoluteEvidenceDir, 'adapter-manifest.json');
  const sourceManifestPath = path.join(absoluteEvidenceDir, 'source-adapter-manifest.json');
  const conversionPath = path.join(absoluteEvidenceDir, 'conversion-receipt.json');
  const trainingPlanPath = path.join(absoluteEvidenceDir, 'training-plan.json');
  const trainingResultPath = path.join(absoluteEvidenceDir, 'training-result.json');
  const captureReceiptPath = path.join(absoluteEvidenceDir, 'capture-receipt.json');
  const deviceEvidencePath = path.join(absoluteEvidenceDir, 'device-matrix.json');
  const [
    manifest,
    sourceManifest,
    conversion,
    trainingPlan,
    trainingResult,
    captureReceipt,
    deviceEvidence,
    trainingEvidence,
    deviceAudit,
  ] = await Promise.all([
    readJson(manifestPath),
    readJson(sourceManifestPath),
    readJson(conversionPath),
    readJson(trainingPlanPath),
    readJson(trainingResultPath),
    readJson(captureReceiptPath),
    readJson(deviceEvidencePath),
    readJson(absoluteTrainingEvidence),
    auditScionAppleSiliconDeviceEvidence({ evidenceDir }),
  ]);
  const issues = [];
  const manifestValidation = validateScionAdapterManifest(manifest);
  const sourceValidation = validateScionAdapterManifest(sourceManifest);
  if (!manifestValidation.valid) issues.push(...manifestValidation.issues.map((issue) => `browser-manifest:${issue}`));
  if (!sourceValidation.valid) issues.push(...sourceValidation.issues.map((issue) => `source-manifest:${issue}`));
  if (
    manifest?.adapter?.scionVersion !== '0.16.39' ||
    manifest?.adapter?.format !== 'gguf-lora' ||
    manifest?.adapter?.scale !== 16
  ) {
    issues.push('browser-adapter-identity');
  }
  if (manifest?.promotion?.status !== 'smoke' || manifest?.promotion?.promotable !== false) {
    issues.push('browser-adapter-claim-status');
  }
  if (sourceManifest?.promotion?.status !== 'smoke' || sourceManifest?.promotion?.promotable !== false) {
    issues.push('source-adapter-claim-status');
  }
  if (
    trainingEvidence?.protocol !== 'scion-seeded-training-smoke-evidence-v1' ||
    trainingEvidence?.status !== 'pass-mechanics-only' ||
    trainingEvidence?.claimBoundary?.qualityEvidence !== false
  ) {
    issues.push('training-evidence-boundary');
  }
  if (
    manifest?.training?.datasetStatus !== 'smoke-only' ||
    manifest?.training?.modelJudgePairCount !== 0 ||
    manifest?.training?.run?.lane !== 'smoke' ||
    manifest?.training?.run?.repositoryDirty !== false
  ) {
    issues.push('browser-training-boundary');
  }

  const retained = [];
  for (const filePath of EXPECTED_PROVENANCE) {
    const receipt = await verifyRetainedFile({
      evidenceDir: absoluteEvidenceDir,
      manifest,
      filePath,
      issues,
    });
    if (receipt) retained.push(receipt);
  }
  const retainedDeclared = (captureReceipt?.retainedAdapterProvenance || []).map((entry) => clean(entry?.path)).sort();
  if (JSON.stringify(retainedDeclared) !== JSON.stringify([...EXPECTED_PROVENANCE].sort())) {
    issues.push('capture-retained-provenance');
  }

  const sourceManifestSha256 = await sha256File(sourceManifestPath);
  const conversionSha256 = await sha256File(conversionPath);
  const trainingPlanSha256 = await sha256File(trainingPlanPath);
  const trainingResultSha256 = await sha256File(trainingResultPath);
  const primaryTrainingRun = trainingEvidence?.replay?.runs?.find((run) => run?.label === 'primary');
  if (
    !SHA256.test(sourceManifestSha256) ||
    sourceManifestSha256 !== primaryTrainingRun?.manifestSha256 ||
    sourceManifestSha256 !== manifest?.conversion?.sourceManifestSha256 ||
    sourceManifestSha256 !== manifest?.training?.run?.sourceManifestSha256 ||
    sourceManifestSha256 !== conversion?.source?.adapterManifestSha256
  ) {
    issues.push('source-manifest-lineage');
  }
  if (
    trainingPlanSha256 !== trainingEvidence?.replay?.runs?.[0]?.planSha256 ||
    trainingPlanSha256 !== sourceManifest?.training?.run?.planSha256 ||
    trainingPlanSha256 !== trainingResult?.planSha256 ||
    trainingPlan?.identity?.sha256 !== trainingResult?.planIdentitySha256
  ) {
    issues.push('training-plan-lineage');
  }
  if (
    trainingResultSha256 !== trainingEvidence?.replay?.runs?.[0]?.resultSha256 ||
    trainingResultSha256 !== sourceManifest?.training?.run?.resultSha256 ||
    trainingResult?.identity?.sha256 !== sourceManifest?.training?.run?.resultIdentitySha256
  ) {
    issues.push('training-result-lineage');
  }
  const sourceWeights = fileByPath(sourceManifest, 'adapters.safetensors');
  if (
    sourceWeights?.bytes !== trainingEvidence?.replay?.adapterWeights?.bytes ||
    sourceWeights?.sha256 !== trainingEvidence?.replay?.adapterWeights?.sha256
  ) {
    issues.push('training-weights-lineage');
  }
  if (
    conversionSha256 !== fileByPath(manifest, 'conversion-receipt.json')?.sha256 ||
    conversion?.conversion !== manifest?.conversion?.pipeline ||
    conversion?.converter?.revision !== manifest?.conversion?.converter?.revision ||
    conversion?.converter?.sha256 !== manifest?.conversion?.converter?.sha256
  ) {
    issues.push('conversion-lineage');
  }
  const gguf = (manifest?.files || []).find((file) => clean(file?.path).endsWith('.gguf'));
  const deviceRun = deviceEvidence?.runs?.[0];
  if (
    !gguf ||
    gguf.bytes !== conversion?.output?.file?.bytes ||
    gguf.sha256 !== conversion?.output?.file?.sha256 ||
    gguf.sha256 !== deviceRun?.checks?.adapterIntegrity?.adapterSha256 ||
    deviceRun?.checks?.adapterIntegrity?.digestMatched !== true
  ) {
    issues.push('browser-artifact-lineage');
  }
  if (
    captureReceipt?.release !== 'v0.16.39' ||
    !clean(captureReceipt?.runId).startsWith('apple-silicon-v01639-') ||
    captureReceipt?.promotionEligible !== false
  ) {
    issues.push('capture-release-identity');
  }
  if (deviceAudit.status !== 'pass-one-profile-matrix-incomplete' || deviceAudit.issues.length !== 0) {
    issues.push(...deviceAudit.issues.map((issue) => `device:${issue}`));
    if (deviceAudit.issues.length === 0) issues.push('device-audit-status');
  }
  try {
    await fs.access(path.join(absoluteEvidenceDir, clean(gguf?.path)));
    issues.push('adapter-weights-must-remain-external');
  } catch {
    // The browser adapter is intentionally distributed separately, not committed to the app repository.
  }
  try {
    await fs.access(path.join(absoluteEvidenceDir, 'adapters.safetensors'));
    issues.push('training-weights-must-remain-external');
  } catch {
    // The source weights remain in the external reproducible training cache.
  }

  return {
    schemaVersion: 1,
    audit: 'scion-exact-adapter-lineage',
    release: 'v0.16.39',
    status: issues.length === 0 ? 'pass-exact-smoke-lineage-one-profile' : 'fail',
    promotionEligible: false,
    qualityEvidence: false,
    adapterId: manifest?.adapter?.id || null,
    sourceAdapterId: sourceManifest?.adapter?.id || null,
    browserArtifact: gguf || null,
    retainedProvenance: retained,
    deviceStatus: deviceAudit.status,
    passingDeviceProfiles: deviceAudit.passingDeviceProfiles,
    missingDeviceProfiles: deviceAudit.missingDeviceProfiles,
    issues,
    claimBoundary:
      'This proves one exact smoke adapter lineage from deterministic training receipts through GGUF conversion and one real Apple Silicon browser lifecycle. It does not prove educational quality, a held-out win, paid-reference parity, or the remaining three device profiles.',
  };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--evidence-dir') args.evidenceDir = argv[++index];
    else if (arg === '--training-evidence') args.trainingEvidencePath = argv[++index];
    else throw new Error(`Unknown exact-lineage option: ${arg}`);
  }
  return args;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  auditScionExactAdapterLineage(parseArgs(process.argv.slice(2)))
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
      if (report.status !== 'pass-exact-smoke-lineage-one-profile') process.exitCode = 1;
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
