#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  buildScionLessonKernelExpansionBatchV2,
  validateScionLessonKernelExpansionBatchV2,
} from './lib/scionLessonKernelExpansionBatchV2.mjs';
import { scionLessonKernelSha256, stableScionLessonKernelJson } from './lib/scionLessonKernelCampaign.mjs';

const DEFAULT_CAMPAIGN = 'evaluation/scion-adapters/lesson-kernel-campaign-v0.16.59.json';
const DEFAULT_OUTPUT = 'evaluation/scion-adapters/lesson-kernel-expansion-batch-v0.16.61.json';
const DEFAULT_EXCLUSIONS = Object.freeze([
  'evaluation/scion-adapters/evidence/source-ledger-v0.16.59/batch-1/local-capture.json',
  'evaluation/scion-adapters/evidence/source-ledger-v0.16.59/batch-2/local-capture.json',
  'evaluation/scion-adapters/evidence/semantic-expansion-v0.16.60/capture/local.json',
]);
const DEFAULT_GENERATED_AT = '2026-07-19T19:00:00.000Z';

export function parseArgs(argv) {
  const args = {
    mode: 'audit',
    campaign: DEFAULT_CAMPAIGN,
    output: DEFAULT_OUTPUT,
    exclusions: [...DEFAULT_EXCLUSIONS],
    batchSize: 28,
    generatedAt: DEFAULT_GENERATED_AT,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--write') args.mode = 'write';
    else if (token === '--audit') args.mode = 'audit';
    else if (token === '--campaign') args.campaign = argv[++index] || args.campaign;
    else if (token === '--output') args.output = argv[++index] || args.output;
    else if (token === '--exclude-report') args.exclusions.push(argv[++index] || '');
    else if (token === '--batch-size') args.batchSize = Number.parseInt(argv[++index] || '', 10);
    else if (token === '--generated-at') args.generatedAt = argv[++index] || args.generatedAt;
    else if (token === '--help' || token === '-h') args.help = true;
    else throw new Error(`Unknown expansion batch option: ${token}`);
  }
  if (args.exclusions.some((entry) => !entry)) throw new Error('--exclude-report requires a path');
  return args;
}

async function sha256File(file) {
  return crypto
    .createHash('sha256')
    .update(await fs.readFile(file))
    .digest('hex');
}

async function readExclusionSource(file) {
  const raw = await fs.readFile(file, 'utf8');
  const report = JSON.parse(raw);
  return {
    receipt: { path: file, fileSha256: scionLessonKernelSha256(raw) },
    caseIds: (report.calls || []).map((entry) => entry.caseId),
  };
}

async function atomicWriteJson(file, value) {
  const absolute = path.resolve(file);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  const temporary = `${absolute}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await fs.rename(temporary, absolute);
}

export async function buildScionLessonKernelExpansionBatchV01661(args, tracked) {
  const [campaignRaw, selectorImplementationSha256, ...exclusionSources] = await Promise.all([
    fs.readFile(args.campaign, 'utf8'),
    sha256File('scripts/lib/scionLessonKernelExpansionBatchV2.mjs'),
    ...args.exclusions.map(readExclusionSource),
  ]);
  const campaign = JSON.parse(campaignRaw);
  const batch = buildScionLessonKernelExpansionBatchV2({
    campaign,
    campaignPath: args.campaign,
    campaignFileSha256: scionLessonKernelSha256(campaignRaw),
    excludedCaseIds: [...new Set(exclusionSources.flatMap((entry) => entry.caseIds))],
    exclusionSources: exclusionSources.map((entry) => entry.receipt),
    batchSize: tracked?.selectionPolicy?.batchSize ?? args.batchSize,
    generatedAt: tracked?.generatedAt ?? args.generatedAt,
    selectorImplementationSha256,
  });
  return { campaign, batch };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      'Usage: node scripts/scionLessonKernelExpansionBatchV01661.mjs [--write|--audit] [--batch-size N] [--exclude-report file]',
    );
    return;
  }
  const tracked = args.mode === 'audit' ? JSON.parse(await fs.readFile(args.output, 'utf8')) : undefined;
  const { campaign, batch } = await buildScionLessonKernelExpansionBatchV01661(args, tracked);
  const validation = validateScionLessonKernelExpansionBatchV2(batch, campaign);
  if (!validation.valid) throw new Error(`Invalid expansion batch: ${validation.issues.join(', ')}`);
  if (args.mode === 'write') await atomicWriteJson(args.output, batch);
  else if (stableScionLessonKernelJson(batch) !== stableScionLessonKernelJson(tracked)) {
    throw new Error('Tracked expansion batch does not match deterministic rebuild');
  }
  console.log(
    JSON.stringify(
      {
        status: args.mode === 'write' ? 'written' : 'verified',
        batch: batch.summary.batch,
        cumulativeSelectedCampaignSurface: batch.summary.cumulativeSelectedCampaignSurface,
      },
      null,
      2,
    ),
  );
}

if (import.meta.url === pathToFileURL(path.resolve(process.argv[1] || '')).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
