#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { auditScionBrowserDeviceMatrix } from './lib/scionBrowserDeviceMatrix.mjs';
import { auditScionDeviceTraceArchivePrivacy, sha256File } from './lib/scionBrowserDeviceCapture.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_EVIDENCE_DIR = 'evaluation/scion-adapters/evidence/browser-device-apple-silicon-v0.16.25';
const DEFAULT_PROTOCOL = 'evaluation/scion-adapters/browser-device-matrix-protocol-v1.json';
const EXPECTED_ISSUES = [
  'missing-device-profile:discrete-8gb',
  'missing-device-profile:integrated-16gb',
  'missing-device-profile:integrated-8gb',
].sort();

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

export async function auditScionAppleSiliconDeviceEvidence({
  evidenceDir = DEFAULT_EVIDENCE_DIR,
  protocolPath = DEFAULT_PROTOCOL,
} = {}) {
  const absoluteEvidenceDir = path.resolve(root, evidenceDir);
  const absoluteProtocolPath = path.resolve(root, protocolPath);
  const manifestPath = path.join(absoluteEvidenceDir, 'adapter-manifest.json');
  const evidencePath = path.join(absoluteEvidenceDir, 'device-matrix.json');
  const receiptPath = path.join(absoluteEvidenceDir, 'capture-receipt.json');
  const [manifest, evidence, receipt, protocol, manifestSha256, protocolSha256] = await Promise.all([
    readJson(manifestPath),
    readJson(evidencePath),
    readJson(receiptPath),
    readJson(absoluteProtocolPath),
    sha256File(manifestPath),
    sha256File(absoluteProtocolPath),
  ]);
  const audit = await auditScionBrowserDeviceMatrix({
    protocol,
    protocolSha256,
    evidence,
    evidencePath,
    adapterManifest: manifest,
  });
  const issues = [];
  if (receipt?.schemaVersion !== 1 || receipt?.release !== 'v0.16.25') issues.push('receipt-release');
  if (receipt?.status !== 'pass-one-profile-matrix-incomplete' || receipt?.promotionEligible !== false) {
    issues.push('receipt-status');
  }
  if (receipt?.adapterManifestSha256 !== manifestSha256) issues.push('receipt-manifest-sha256');
  if (receipt?.protocolSha256 !== protocolSha256) issues.push('receipt-protocol-sha256');
  if (evidence?.promotionEligible !== false) issues.push('evidence-promotion-status');
  if (!Array.isArray(evidence?.nonClaims) || evidence.nonClaims.length < 3) issues.push('evidence-nonclaims');
  if (audit.status !== 'blocked' || audit.promotionEligible !== false) issues.push('matrix-status');
  if (audit.runCount !== 1 || audit.passingRunCount !== 1) issues.push('apple-run-count');
  if (audit.passingDeviceProfiles.join(',') !== 'apple-silicon-16gb') issues.push('apple-profile-status');
  if (JSON.stringify([...audit.issues].sort()) !== JSON.stringify(EXPECTED_ISSUES))
    issues.push('unexpected-matrix-gap');
  const run = evidence?.runs?.[0];
  if (run?.checks?.recovery?.interruptedDownload?.target !== 'pinned-public-base') {
    issues.push('network-recovery-target');
  }
  if (run?.checks?.recovery?.storagePressure?.target !== 'separate-browser-adapter') {
    issues.push('storage-recovery-target');
  }
  if (run?.checks?.recovery?.deviceLoss?.method !== 'browser-gpu-process-restart') {
    issues.push('device-loss-method');
  }
  const traceArtifact = run?.artifacts?.find((artifact) => artifact?.type === 'browser-trace');
  if (!traceArtifact?.path) {
    issues.push('trace-privacy-missing');
  } else {
    const tracePrivacy = await auditScionDeviceTraceArchivePrivacy({
      tracePath: path.join(absoluteEvidenceDir, traceArtifact.path),
    });
    issues.push(...tracePrivacy.issues.map((issue) => `trace-privacy:${issue}`));
  }
  return {
    schemaVersion: 1,
    audit: 'scion-apple-silicon-device-evidence',
    status: issues.length === 0 ? 'pass-one-profile-matrix-incomplete' : 'blocked',
    promotionEligible: false,
    passingDeviceProfiles: audit.passingDeviceProfiles,
    missingDeviceProfiles: ['integrated-8gb', 'integrated-16gb', 'discrete-8gb'],
    issues,
    matrixAudit: audit,
  };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--evidence-dir') args.evidenceDir = argv[++index];
    else if (arg === '--protocol') args.protocolPath = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  auditScionAppleSiliconDeviceEvidence(parseArgs(process.argv.slice(2)))
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
      if (report.status !== 'pass-one-profile-matrix-incomplete') process.exitCode = 1;
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
