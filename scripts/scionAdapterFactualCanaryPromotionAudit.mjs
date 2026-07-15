#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { auditScionAdapterFactualCanaryEvidence } from './lib/scionAdapterCanaryPromotion.mjs';
import { computeScionAdapterPackageIdentity } from './lib/scionBrowserDeviceMatrix.mjs';

function parseArgs(argv) {
  const args = { root: process.cwd() };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--evidence') args.evidencePath = path.resolve(argv[++index] || '');
    else if (arg === '--manifest') args.manifestPath = path.resolve(argv[++index] || '');
    else if (arg === '--root') args.root = path.resolve(argv[++index] || args.root);
    else if (arg === '--output') args.outputPath = path.resolve(argv[++index] || '');
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.help && !args.evidencePath) throw new Error('--evidence is required');
  if (!args.help && !args.manifestPath) throw new Error('--manifest is required');
  return args;
}

export async function runScionAdapterFactualCanaryPromotionAudit({
  root = process.cwd(),
  evidencePath,
  manifestPath,
  outputPath,
} = {}) {
  if (!evidencePath || !manifestPath) throw new Error('evidencePath and manifestPath are required');
  const [evidence, adapterManifest] = await Promise.all([
    fs.readFile(evidencePath, 'utf8').then(JSON.parse),
    fs.readFile(manifestPath, 'utf8').then(JSON.parse),
  ]);
  const adapterPackageIdentitySha256 = computeScionAdapterPackageIdentity(adapterManifest).sha256;
  const report = await auditScionAdapterFactualCanaryEvidence({
    root,
    evidencePath,
    evidence,
    adapterManifest,
    adapterPackageIdentitySha256,
  });
  if (outputPath) {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  }
  return report;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      'Usage: node scripts/scionAdapterFactualCanaryPromotionAudit.mjs --manifest adapter.json --evidence factual-canaries.json [--root repo] [--output report.json]',
    );
    return;
  }
  const report = await runScionAdapterFactualCanaryPromotionAudit(args);
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== 'pass') process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
