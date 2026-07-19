#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  replayScionLessonKernelAdmissionReport,
  validateScionLessonKernelAdmissionReplay,
} from './lib/scionLessonKernelAdmissionReplay.mjs';
import { scionLessonKernelSha256 } from './lib/scionLessonKernelCampaign.mjs';

const CAMPAIGN = 'evaluation/scion-adapters/lesson-kernel-campaign-v0.16.54.json';
const CAPTURE_DIR = 'verification-output/scion-lesson-kernel-capture-v0.16.54';
const COMPILER_FILES = [
  'src/lib/publicScionProvider.js',
  'src/lib/scionAnswerKeyAlignment.js',
  'src/lib/scionKeyTermContract.js',
  'src/lib/scionEvidenceContract.js',
  'src/lib/scionContracts.js',
  'src/lib/scenarioContract.js',
];

function parseArgs(argv) {
  const args = { campaign: CAMPAIGN, arm: '', input: '', output: '', generatedAt: new Date().toISOString() };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--campaign') args.campaign = argv[++index] || args.campaign;
    else if (token === '--arm') args.arm = argv[++index] || '';
    else if (token === '--input') args.input = argv[++index] || '';
    else if (token === '--output') args.output = argv[++index] || '';
    else if (token === '--generated-at') args.generatedAt = argv[++index] || args.generatedAt;
    else if (token === '--help' || token === '-h') args.help = true;
    else throw new Error(`Unknown admission replay option: ${token}`);
  }
  if (args.arm && !['local', 'reference'].includes(args.arm)) throw new Error('--arm must be local or reference');
  if (args.arm) {
    args.input ||= `${CAPTURE_DIR}/${args.arm}.json`;
    args.output ||= `${CAPTURE_DIR}/${args.arm}-v6-replay.json`;
  }
  return args;
}

async function sha256File(file) {
  return crypto
    .createHash('sha256')
    .update(await fs.readFile(file))
    .digest('hex');
}

async function atomicWriteJson(file, value) {
  const absolute = path.resolve(file);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  const temporary = `${absolute}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await fs.rename(temporary, absolute);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node scripts/scionLessonKernelAdmissionReplay.mjs --arm local|reference [--generated-at ISO]');
    return;
  }
  if (!args.input || !args.output) throw new Error('Admission replay requires --arm or both --input and --output');
  const [campaign, capture, fileEntries] = await Promise.all([
    fs.readFile(args.campaign, 'utf8').then(JSON.parse),
    fs.readFile(args.input, 'utf8').then(JSON.parse),
    Promise.all(COMPILER_FILES.map(async (file) => [file, await sha256File(file)])),
  ]);
  const compiler = {
    protocol: 'scion-lesson-kernel-compiler-replay-v1',
    policy: {
      keyTermSemanticProfile: 'source-strict-v6',
      artifactPolicy: 'frozen-artifact-replay-only',
      answerPosition: 'preserve-upstream-compiler-repairs',
    },
    files: Object.fromEntries(fileEntries),
  };
  compiler.identitySha256 = scionLessonKernelSha256(compiler);
  const report = replayScionLessonKernelAdmissionReport({
    campaign,
    capture,
    compiler,
    generatedAt: args.generatedAt,
  });
  const validation = validateScionLessonKernelAdmissionReplay(report);
  if (!validation.valid) throw new Error(`Invalid admission replay: ${validation.issues.join(', ')}`);
  await atomicWriteJson(args.output, report);
  console.log(JSON.stringify(report.summary, null, 2));
}

if (import.meta.url === pathToFileURL(path.resolve(process.argv[1] || '')).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
