#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { auditScionAdapterSingleModelJudgeEvidence } from './lib/scionAdapterJudgePromotion.mjs';
import { sha256File } from './scionAdapterPackage.mjs';

function parseArgs(argv) {
  const args = { root: process.cwd(), bootstrapSamples: 5000 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--evidence') args.evidencePath = path.resolve(argv[++index] || '');
    else if (arg === '--manifest') args.manifestPath = path.resolve(argv[++index] || '');
    else if (arg === '--root') args.root = path.resolve(argv[++index] || args.root);
    else if (arg === '--output') args.outputPath = path.resolve(argv[++index] || '');
    else if (arg === '--bootstrap-samples') args.bootstrapSamples = Number(argv[++index] || args.bootstrapSamples);
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.help && !args.evidencePath) throw new Error('--evidence is required');
  if (!args.help && !args.manifestPath) throw new Error('--manifest is required');
  if (!Number.isInteger(args.bootstrapSamples) || args.bootstrapSamples < 100) {
    throw new Error('--bootstrap-samples must be an integer of at least 100');
  }
  return args;
}

export async function runScionAdapterJudgePromotionAudit({
  root = process.cwd(),
  evidencePath,
  manifestPath,
  outputPath,
  bootstrapSamples = 5000,
} = {}) {
  if (!evidencePath) throw new Error('evidencePath is required');
  if (!manifestPath) throw new Error('manifestPath is required');
  const [evidence, adapterManifest, adapterManifestSha256] = await Promise.all([
    fs.readFile(evidencePath, 'utf8').then(JSON.parse),
    fs.readFile(manifestPath, 'utf8').then(JSON.parse),
    sha256File(manifestPath),
  ]);
  const report = await auditScionAdapterSingleModelJudgeEvidence({
    root,
    evidencePath,
    evidence,
    adapterManifest,
    adapterManifestSha256,
    bootstrapSamples,
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
      'Usage: node scripts/scionAdapterJudgePromotionAudit.mjs --manifest adapter.json --evidence single-model-judge.json [--root repo] [--output report.json]',
    );
    return;
  }
  const report = await runScionAdapterJudgePromotionAudit(args);
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== 'pass') process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
