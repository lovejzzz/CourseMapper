#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { auditScionBrowserDeviceMatrix } from './lib/scionBrowserDeviceMatrix.mjs';

const DEFAULT_PROTOCOL = 'evaluation/scion-adapters/browser-device-matrix-protocol-v1.json';
const DEFAULT_OUTPUT = 'verification-output/scion-browser-device-matrix/latest.json';

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function sha256File(filePath) {
  const bytes = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

export async function runScionBrowserDeviceMatrixAudit({
  manifestPath,
  evidencePath,
  protocolPath = DEFAULT_PROTOCOL,
  outputPath = DEFAULT_OUTPUT,
} = {}) {
  if (!manifestPath) throw new Error('--manifest is required');
  if (!evidencePath) throw new Error('--evidence is required');
  const [adapterManifest, evidence, protocol, protocolSha256] = await Promise.all([
    readJson(manifestPath),
    readJson(evidencePath),
    readJson(protocolPath),
    sha256File(protocolPath),
  ]);
  const report = await auditScionBrowserDeviceMatrix({
    protocol,
    protocolSha256,
    evidence,
    evidencePath,
    adapterManifest,
  });
  report.generatedAt = new Date().toISOString();
  report.inputs = { manifestPath, evidencePath, protocolPath };
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

function parseArgs(argv) {
  const args = { protocolPath: DEFAULT_PROTOCOL, outputPath: DEFAULT_OUTPUT };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--manifest') args.manifestPath = argv[++index];
    else if (arg === '--evidence') args.evidencePath = argv[++index];
    else if (arg === '--protocol') args.protocolPath = argv[++index];
    else if (arg === '--output') args.outputPath = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  runScionBrowserDeviceMatrixAudit(parseArgs(process.argv.slice(2)))
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
      if (report.status !== 'pass') process.exitCode = 1;
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
