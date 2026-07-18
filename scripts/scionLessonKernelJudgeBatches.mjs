#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  SCION_LESSON_KERNEL_JUDGE_REVIEW_PROTOCOL,
  aggregateScionLessonKernelPairedOrders,
  buildScionLessonKernelBlindWorkbook,
  buildScionLessonKernelTrainingPreferences,
  validateScionLessonKernelBlindWorkbook,
  validateScionLessonKernelJudgeReview,
} from './lib/scionLessonKernelJudge.mjs';
import { scionLessonKernelSha256, stableScionLessonKernelJson } from './lib/scionLessonKernelCampaign.mjs';

const CAMPAIGN = 'evaluation/scion-adapters/lesson-kernel-campaign-v0.16.54.json';
const CAPTURE_DIR = 'verification-output/scion-lesson-kernel-capture-v0.16.54';
const OUTPUT_DIR = 'verification-output/scion-lesson-kernel-judge-batches-v0.16.54';
const PROMPT = 'evaluation/scion-adapters/lesson-kernel-judge-prompt-v0.16.54.md';
const RESULT_PROTOCOL = 'scion-lesson-kernel-paired-order-workbook-result-v1';

function parseArgs(argv) {
  const args = {
    build: false,
    audit: false,
    ingest: false,
    campaign: CAMPAIGN,
    local: `${CAPTURE_DIR}/local.json`,
    reference: `${CAPTURE_DIR}/reference.json`,
    output: OUTPUT_DIR,
    prompt: PROMPT,
    chunkSize: 6,
    generatedAt: '2026-07-18T20:00:00.000Z',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--build') args.build = true;
    else if (token === '--audit') args.audit = true;
    else if (token === '--ingest') args.ingest = true;
    else if (token === '--campaign') args.campaign = argv[++index] || args.campaign;
    else if (token === '--local') args.local = argv[++index] || args.local;
    else if (token === '--reference') args.reference = argv[++index] || args.reference;
    else if (token === '--output') args.output = argv[++index] || args.output;
    else if (token === '--prompt') args.prompt = argv[++index] || args.prompt;
    else if (token === '--chunk-size') args.chunkSize = Number(argv[++index] || 0);
    else if (token === '--generated-at') args.generatedAt = argv[++index] || args.generatedAt;
    else if (token === '--help' || token === '-h') args.help = true;
    else throw new Error(`Unknown lesson-kernel batch judge option: ${token}`);
  }
  if (![args.build, args.audit, args.ingest].some(Boolean) && !args.help) args.audit = true;
  if (!Number.isInteger(args.chunkSize) || args.chunkSize < 1 || args.chunkSize > 12) {
    throw new Error('--chunk-size must be an integer from 1 through 12');
  }
  return args;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function atomicWriteJson(file, value) {
  const absolute = path.resolve(file);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  const temporary = `${absolute}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await fs.rename(temporary, absolute);
}

async function atomicWriteJsonl(file, rows) {
  const absolute = path.resolve(file);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  const temporary = `${absolute}.${process.pid}.tmp`;
  await fs.writeFile(temporary, rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''));
  await fs.rename(temporary, absolute);
}

function promptSha256(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function batchDir(output, batchId) {
  return path.join(output, 'batches', batchId);
}

function stemForOrder(order) {
  return order === 'A/B' ? 'a-b' : 'b-a';
}

function reviewTemplate(packet) {
  return {
    schemaVersion: 1,
    protocol: SCION_LESSON_KERNEL_JUDGE_REVIEW_PROTOCOL,
    order: packet.order,
    packetSha256: packet.identity.sha256,
    sessionId: '',
    judge: { model: '', revision: '', runtime: '' },
    completedAt: '',
    attestations: {
      anonymousArtifactsOnly: false,
      otherOrderUnavailable: false,
      organizerMappingUnavailable: false,
    },
    decisions: packet.cases.map((entry) => structuredClone(entry.decisionSkeleton)),
  };
}

function taskInstructions(order) {
  const stem = stemForOrder(order);
  return `Use only judge-prompt.md, ${stem}.packet.json, ${stem}.review.template.json, and review.schema.json in this directory. Score every anonymous case. Do not inspect the repository, capture reports, the other order, prior outcomes, or any organizer mapping. Set a fresh unique sessionId and the three attestations only if true. Return valid JSON only.\n`;
}

async function loadInputs(args) {
  const [campaign, localReport, referenceReport, promptRaw] = await Promise.all([
    readJson(args.campaign),
    readJson(args.local),
    readJson(args.reference),
    fs.readFile(args.prompt),
  ]);
  if (localReport.campaignIdentity?.sha256 !== campaign.identity?.sha256) {
    throw new Error('Local capture does not match the batch judge campaign identity');
  }
  if (referenceReport.campaignIdentity?.sha256 !== campaign.identity?.sha256) {
    throw new Error('Reference capture does not match the batch judge campaign identity');
  }
  return { campaign, localReport, referenceReport, promptRaw };
}

async function build(args) {
  const inputs = await loadInputs(args);
  const workbook = buildScionLessonKernelBlindWorkbook({
    ...inputs,
    promptPath: args.prompt,
    promptSha256: promptSha256(inputs.promptRaw),
    generatedAt: args.generatedAt,
    chunkSize: args.chunkSize,
  });
  const validation = validateScionLessonKernelBlindWorkbook(workbook);
  if (!validation.valid) throw new Error(`Invalid lesson-kernel judge workbook: ${validation.issues.join(', ')}`);
  await atomicWriteJson(path.join(args.output, 'workbook.json'), workbook.manifest);
  const schemaRaw = await fs.readFile('evaluation/scion-adapters/lesson-kernel-judge-review-v0.16.54.schema.json');
  for (const batch of workbook.batches) {
    const directory = batchDir(args.output, batch.batchId);
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, 'judge-prompt.md'), inputs.promptRaw);
    await fs.writeFile(path.join(directory, 'review.schema.json'), schemaRaw);
    for (const order of ['A/B', 'B/A']) {
      const stem = stemForOrder(order);
      await atomicWriteJson(path.join(directory, `${stem}.packet.json`), batch.packets[order]);
      await atomicWriteJson(path.join(directory, `${stem}.review.template.json`), reviewTemplate(batch.packets[order]));
      await fs.writeFile(path.join(directory, `${stem}.TASK.txt`), taskInstructions(order));
    }
  }
  return workbook;
}

async function audit(args) {
  const inputs = await loadInputs(args);
  const manifest = await readJson(path.join(args.output, 'workbook.json'));
  if (manifest.prompt?.sha256 !== promptSha256(inputs.promptRaw)) throw new Error('Workbook prompt identity drift');
  const batches = [];
  for (const declared of manifest.batches || []) {
    const directory = batchDir(args.output, declared.batchId);
    const packets = {
      'A/B': await readJson(path.join(directory, 'a-b.packet.json')),
      'B/A': await readJson(path.join(directory, 'b-a.packet.json')),
    };
    batches.push({
      batchId: declared.batchId,
      index: declared.index,
      caseIds: declared.caseIds,
      sealed: declared.sealed,
      packets,
    });
  }
  const workbook = { manifest, batches };
  const validation = validateScionLessonKernelBlindWorkbook(workbook);
  if (!validation.valid) throw new Error(`Lesson-kernel judge workbook audit failed: ${validation.issues.join(', ')}`);
  return { inputs, workbook };
}

async function ingest(args) {
  const { inputs, workbook } = await audit(args);
  const sessions = new Set();
  let judgeIdentity = null;
  const preferences = [];
  const batchResults = [];
  for (const batch of workbook.batches) {
    const directory = batchDir(args.output, batch.batchId);
    const [abReview, baReview] = await Promise.all([
      readJson(path.join(directory, 'a-b.review.json')),
      readJson(path.join(directory, 'b-a.review.json')),
    ]);
    for (const [order, review] of [
      ['A/B', abReview],
      ['B/A', baReview],
    ]) {
      const validation = validateScionLessonKernelJudgeReview(review, batch.packets[order]);
      if (!validation.valid) {
        throw new Error(`Invalid ${batch.batchId} ${order} review: ${validation.issues.join(', ')}`);
      }
      if (sessions.has(review.sessionId)) throw new Error(`Judge session reused across workbook: ${review.sessionId}`);
      sessions.add(review.sessionId);
      const identity = stableScionLessonKernelJson(review.judge);
      if (judgeIdentity && identity !== judgeIdentity) throw new Error(`Judge identity changed in ${batch.batchId}`);
      judgeIdentity ||= identity;
    }
    const result = aggregateScionLessonKernelPairedOrders({
      abPacket: batch.packets['A/B'],
      baPacket: batch.packets['B/A'],
      abReview,
      baReview,
      localReport: inputs.localReport,
      referenceReport: inputs.referenceReport,
      generatedAt: args.generatedAt,
    });
    if (result.status !== 'paired-orders-complete') {
      throw new Error(`Invalid paired result for ${batch.batchId}: ${result.issues.join(', ')}`);
    }
    const batchPreferences = buildScionLessonKernelTrainingPreferences({
      aggregate: result,
      campaign: inputs.campaign,
      localReport: inputs.localReport,
      referenceReport: inputs.referenceReport,
    });
    await atomicWriteJson(path.join(directory, 'paired-order-result.json'), result);
    await atomicWriteJsonl(path.join(directory, 'training-preferences.jsonl'), batchPreferences);
    preferences.push(...batchPreferences);
    batchResults.push({
      batchId: batch.batchId,
      aggregateSha256: result.identity.sha256,
      sessions: result.sessions,
      summary: result.summary,
    });
  }
  const summary = batchResults.reduce(
    (total, entry) => {
      for (const key of Object.keys(total)) total[key] += Number(entry.summary[key] || 0);
      return total;
    },
    { pairs: 0, stablePreferences: 0, localWins: 0, referenceWins: 0, unstable: 0 },
  );
  const result = {
    schemaVersion: 1,
    protocol: RESULT_PROTOCOL,
    generatedAt: args.generatedAt,
    status: 'paired-orders-complete',
    workbookSha256: workbook.manifest.identity.sha256,
    campaignIdentity: inputs.campaign.identity,
    judge: JSON.parse(judgeIdentity),
    batchResults,
    summary,
    claimBoundary:
      'These are same-identity model-judge preferences from isolated bounded A/B and B/A sessions. They are not human, instructor, independent, classroom, heldout-adapter, or production-win evidence.',
  };
  result.identity = {
    algorithm: 'sha256-canonical-json',
    sha256: scionLessonKernelSha256({ ...result, identity: undefined }),
  };
  await atomicWriteJson(path.join(args.output, 'paired-order-workbook-result.json'), result);
  await atomicWriteJsonl(path.join(args.output, 'training-preferences.jsonl'), preferences);
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      'Usage: node scripts/scionLessonKernelJudgeBatches.mjs [--build|--audit|--ingest] [--chunk-size 1..12]',
    );
    return;
  }
  let workbook;
  if (args.build) workbook = await build(args);
  if (args.audit) ({ workbook } = await audit(args));
  const result = args.ingest ? await ingest(args) : null;
  if (result) console.log(JSON.stringify(result.summary, null, 2));
  else if (workbook) {
    console.log(
      `Scion lesson-kernel judge workbook: ${workbook.manifest.caseCount} cases / ${workbook.manifest.batches.length} isolated batches / chunk size ${workbook.manifest.chunkSize}`,
    );
  }
}

if (import.meta.url === pathToFileURL(path.resolve(process.argv[1] || '')).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
