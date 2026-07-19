#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  aggregateScionLessonKernelPairedOrders,
  buildScionLessonKernelTrainingPreferences,
  validateScionLessonKernelBlindWorkbook,
  validateScionLessonKernelJudgeReview,
} from './lib/scionLessonKernelJudge.mjs';
import {
  scionLessonKernelSha256,
  stableScionLessonKernelJson,
  validateScionLessonKernelCampaign,
} from './lib/scionLessonKernelCampaign.mjs';
import { validateScionLessonKernelAdmissionReplay } from './lib/scionLessonKernelAdmissionReplay.mjs';
import { validateScionLessonKernelExpansionBatch } from './lib/scionLessonKernelExpansionBatch.mjs';

const OUTPUT = 'evaluation/scion-adapters/evidence/lesson-kernel-expansion-v0.16.57';
const RECEIPT = `${OUTPUT}/receipt.json`;
const CAMPAIGN = 'evaluation/scion-adapters/lesson-kernel-campaign-v0.16.56.json';
const SELECTION = 'evaluation/scion-adapters/lesson-kernel-expansion-batch-v0.16.57.json';
const CAPTURE_SOURCE = 'verification-output/scion-lesson-kernel-capture-v0.16.57-batch01';
const JUDGE_SOURCE = 'verification-output/scion-lesson-kernel-judge-v0.16.57-batch01';
const GENERATED_AT = '2026-07-19T20:30:00.000Z';
const IMPLEMENTATION_FILES = Object.freeze([
  'scripts/scionLessonKernelExpansionEvidenceV01657.mjs',
  'scripts/scionLessonKernelExpansionBatchV01657.mjs',
  'scripts/scionLessonKernelJudgeBatches.mjs',
  'scripts/lib/scionLessonKernelExpansionBatch.mjs',
  'scripts/lib/scionLessonKernelJudge.mjs',
  'scripts/lib/scionLessonKernelAdmissionReplay.mjs',
  'src/lib/publicScionProvider.js',
  'src/lib/scionKeyTermContract.js',
]);

function parseArgs(argv) {
  const args = { build: false, audit: false };
  for (const token of argv) {
    if (token === '--build') args.build = true;
    else if (token === '--audit') args.audit = true;
    else if (token === '--help' || token === '-h') args.help = true;
    else throw new Error(`Unknown lesson-kernel expansion evidence option: ${token}`);
  }
  if (!args.build && !args.audit && !args.help) args.audit = true;
  return args;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function readJsonl(file) {
  const raw = await fs.readFile(file, 'utf8');
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(JSON.parse);
}

async function sha256File(file) {
  return crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
}

async function atomicWriteJson(file, value) {
  const absolute = path.resolve(file);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  const temporary = `${absolute}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await fs.rename(temporary, absolute);
}

async function copyFile(source, target) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
}

function makePortable(value) {
  if (Array.isArray(value)) return value.map(makePortable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, makePortable(nested)]));
  }
  if (typeof value !== 'string') return value;
  return value
    .replace(/\/Users\/[^/]+\/\.cache\/coursemapper\//g, () => '$COURSEMAPPER_CACHE/')
    .replace(/\/Users\/[^/]+\/(?:[^/\s"]+\/)*CourseMapper[^/\s"]*\//g, () => '$REPO/')
    .replace(/\/Users\/[^/]+\//g, () => '$HOME/');
}

async function copyPortableJson(source, target, { replay = false } = {}) {
  const raw = await fs.readFile(source, 'utf8');
  const portable = makePortable(JSON.parse(raw));
  portable.portability = {
    localPathsRedacted: true,
    sourceFileSha256: scionLessonKernelSha256(raw),
    replacements: ['$COURSEMAPPER_CACHE', '$REPO', '$HOME'],
  };
  if (replay) {
    const identityPayload = structuredClone(portable);
    delete identityPayload.identitySha256;
    portable.identitySha256 = scionLessonKernelSha256(identityPayload);
  }
  await atomicWriteJson(target, portable);
}

async function promoteEvidence() {
  const workbook = await readJson(path.join(JUDGE_SOURCE, 'workbook.json'));
  await Promise.all([
    copyFile(SELECTION, path.join(OUTPUT, 'selection.json')),
    copyPortableJson(path.join(CAPTURE_SOURCE, 'local.json'), path.join(OUTPUT, 'local-capture.json')),
    copyPortableJson(
      path.join(CAPTURE_SOURCE, 'local-v7-replay.json'),
      path.join(OUTPUT, 'local-admission-replay.json'),
      { replay: true },
    ),
    copyFile(path.join(CAPTURE_SOURCE, 'reference.json'), path.join(OUTPUT, 'reference-capture.json')),
    copyFile(
      path.join(CAPTURE_SOURCE, 'reference-v7-replay.json'),
      path.join(OUTPUT, 'reference-admission-replay.json'),
    ),
    copyFile(path.join(JUDGE_SOURCE, 'workbook.json'), path.join(OUTPUT, 'judge', 'workbook.json')),
    copyFile(
      path.join(JUDGE_SOURCE, 'paired-order-workbook-result.json'),
      path.join(OUTPUT, 'judge', 'paired-order-workbook-result.json'),
    ),
    copyFile(
      path.join(JUDGE_SOURCE, 'training-preferences.jsonl'),
      path.join(OUTPUT, 'judge', 'training-preferences.jsonl'),
    ),
  ]);
  await Promise.all(
    workbook.batches.flatMap((batch) => {
      const source = path.join(JUDGE_SOURCE, 'batches', batch.batchId);
      const target = path.join(OUTPUT, 'judge', 'batches', batch.batchId);
      return [
        'a-b.packet.json',
        'b-a.packet.json',
        'a-b.review.json',
        'b-a.review.json',
        'paired-order-result.json',
        'training-preferences.jsonl',
      ].map((file) => copyFile(path.join(source, file), path.join(target, file)));
    }),
  );
}

function captureMetrics(report) {
  const calls = report.calls || [];
  return {
    cases: calls.length,
    admitted: calls.filter((call) => call.artifact && call.admission?.needsRetry === false).length,
    retained: calls.filter((call) => call.artifact && call.admission?.needsRetry === true).length,
    durationMs: calls.reduce((sum, call) => sum + Number(call.durationMs || 0), 0),
    issueInstances: calls.reduce((sum, call) => sum + (call.admission?.issues || []).length, 0),
  };
}

function replayMetrics(report) {
  const calls = report.calls || [];
  return {
    cases: calls.length,
    admitted: calls.filter((call) => call.artifact && call.admission?.needsRetry === false).length,
    retained: calls.filter((call) => call.artifact && call.admission?.needsRetry === true).length,
    issueInstances: calls.reduce((sum, call) => sum + (call.admission?.issues || []).length, 0),
  };
}

async function listEvidenceFiles(directory, prefix = '') {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.join(prefix, entry.name);
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listEvidenceFiles(absolute, relative)));
    else if (relative !== 'receipt.json') files.push(relative);
  }
  return files.sort();
}

async function loadAndValidateEvidence() {
  const [
    campaign,
    selection,
    localCapture,
    localReplay,
    referenceCapture,
    referenceReplay,
    workbookManifest,
    workbookResult,
  ] =
    await Promise.all([
      readJson(CAMPAIGN),
      readJson(path.join(OUTPUT, 'selection.json')),
      readJson(path.join(OUTPUT, 'local-capture.json')),
      readJson(path.join(OUTPUT, 'local-admission-replay.json')),
      readJson(path.join(OUTPUT, 'reference-capture.json')),
      readJson(path.join(OUTPUT, 'reference-admission-replay.json')),
      readJson(path.join(OUTPUT, 'judge', 'workbook.json')),
      readJson(path.join(OUTPUT, 'judge', 'paired-order-workbook-result.json')),
    ]);

  const campaignValidation = validateScionLessonKernelCampaign(campaign);
  if (!campaignValidation.valid) throw new Error(`Campaign invalid: ${campaignValidation.issues.join(', ')}`);
  const selectionValidation = validateScionLessonKernelExpansionBatch(selection, campaign);
  if (!selectionValidation.valid) throw new Error(`Selection invalid: ${selectionValidation.issues.join(', ')}`);
  for (const [label, report] of [
    ['local', localCapture],
    ['reference', referenceCapture],
  ]) {
    if (report.campaignIdentity?.sha256 !== campaign.identity.sha256) {
      throw new Error(`${label} capture campaign identity mismatch`);
    }
  }
  for (const [label, report] of [
    ['local', localReplay],
    ['reference', referenceReplay],
  ]) {
    const validation = validateScionLessonKernelAdmissionReplay(report);
    if (!validation.valid) throw new Error(`${label} replay invalid: ${validation.issues.join(', ')}`);
  }
  const selectedCaseIds = selection.cases.map((entry) => entry.caseId).sort();
  for (const [label, report] of [
    ['local replay', localReplay],
    ['reference replay', referenceReplay],
  ]) {
    const reportCaseIds = (report.calls || []).map((entry) => entry.caseId).sort();
    if (stableScionLessonKernelJson(reportCaseIds) !== stableScionLessonKernelJson(selectedCaseIds)) {
      throw new Error(`${label} does not match the selected 14-case batch`);
    }
  }
  const workbook = {
    manifest: workbookManifest,
    batches: await Promise.all(
      workbookManifest.batches.map(async (batch) => {
        const directory = path.join(OUTPUT, 'judge', 'batches', batch.batchId);
        return {
          ...batch,
          packets: {
            'A/B': await readJson(path.join(directory, 'a-b.packet.json')),
            'B/A': await readJson(path.join(directory, 'b-a.packet.json')),
          },
        };
      }),
    ),
  };
  const workbookValidation = validateScionLessonKernelBlindWorkbook(workbook);
  if (!workbookValidation.valid) throw new Error(`Workbook invalid: ${workbookValidation.issues.join(', ')}`);
  if (!workbook.manifest.sparseComplete || workbook.manifest.caseCount !== selection.cases.length) {
    throw new Error('Workbook must be complete for the bounded selected batch');
  }

  const sessions = new Set();
  let judgeIdentity = null;
  const batchResults = [];
  const allPreferences = [];
  for (const batch of workbook.batches) {
    const directory = path.join(OUTPUT, 'judge', 'batches', batch.batchId);
    const [abPacket, baPacket, abReview, baReview, pairedResult, storedPreferences] = await Promise.all([
      readJson(path.join(directory, 'a-b.packet.json')),
      readJson(path.join(directory, 'b-a.packet.json')),
      readJson(path.join(directory, 'a-b.review.json')),
      readJson(path.join(directory, 'b-a.review.json')),
      readJson(path.join(directory, 'paired-order-result.json')),
      readJsonl(path.join(directory, 'training-preferences.jsonl')),
    ]);
    for (const [label, review, packet] of [
      ['A/B', abReview, abPacket],
      ['B/A', baReview, baPacket],
    ]) {
      const validation = validateScionLessonKernelJudgeReview(review, packet);
      if (!validation.valid) throw new Error(`${batch.batchId} ${label} review invalid: ${validation.issues.join(', ')}`);
      if (sessions.has(review.sessionId)) throw new Error(`Judge session reused: ${review.sessionId}`);
      sessions.add(review.sessionId);
      const identity = stableScionLessonKernelJson(review.judge);
      if (judgeIdentity && judgeIdentity !== identity) throw new Error('Judge identity changed across the batch');
      judgeIdentity ||= identity;
    }
    const rebuiltResult = aggregateScionLessonKernelPairedOrders({
      abPacket,
      baPacket,
      abReview,
      baReview,
      localReport: localReplay,
      referenceReport: referenceReplay,
      generatedAt: pairedResult.generatedAt,
    });
    if (rebuiltResult.identity.sha256 !== pairedResult.identity.sha256) {
      throw new Error(`${batch.batchId} paired result no longer reproduces`);
    }
    const rebuiltPreferences = buildScionLessonKernelTrainingPreferences({
      aggregate: pairedResult,
      campaign,
      localReport: localReplay,
      referenceReport: referenceReplay,
    });
    if (stableScionLessonKernelJson(rebuiltPreferences) !== stableScionLessonKernelJson(storedPreferences)) {
      throw new Error(`${batch.batchId} preferences no longer reproduce`);
    }
    allPreferences.push(...storedPreferences);
    batchResults.push({ batchId: batch.batchId, identitySha256: pairedResult.identity.sha256, summary: pairedResult.summary });
  }

  const rootPreferences = await readJsonl(path.join(OUTPUT, 'judge', 'training-preferences.jsonl'));
  if (stableScionLessonKernelJson(rootPreferences) !== stableScionLessonKernelJson(allPreferences)) {
    throw new Error('Workbook preferences do not match the batch preferences');
  }
  if (workbookResult.status !== 'paired-orders-complete' || workbookResult.pendingBatches !== 0) {
    throw new Error('Paired-order workbook is not complete for the selected batch');
  }
  if (workbookResult.reviewedBatches !== workbook.batches.length || workbookResult.evaluatedCases !== selection.cases.length) {
    throw new Error('Paired-order workbook coverage is incomplete');
  }
  for (const result of batchResults) {
    const aggregate = workbookResult.batchResults.find((entry) => entry.batchId === result.batchId);
    if (!aggregate || aggregate.aggregateSha256 !== result.identitySha256) {
      throw new Error(`${result.batchId} is missing from the workbook aggregate`);
    }
  }
  return {
    campaign,
    selection,
    localCapture,
    localReplay,
    referenceCapture,
    referenceReplay,
    workbook,
    workbookResult,
    preferences: rootPreferences,
    judge: judgeIdentity ? JSON.parse(judgeIdentity) : null,
  };
}

async function buildReceipt(generatedAt) {
  const [evidence, implementationEntries, evidenceFiles] = await Promise.all([
    loadAndValidateEvidence(),
    Promise.all(IMPLEMENTATION_FILES.map(async (file) => [file, await sha256File(file)])),
    listEvidenceFiles(OUTPUT),
  ]);
  const evidenceEntries = await Promise.all(
    evidenceFiles.map(async (file) => [file, await sha256File(path.join(OUTPUT, file))]),
  );
  const receipt = {
    schemaVersion: 1,
    protocol: 'scion-lesson-kernel-expansion-evidence-v1',
    generatedAt,
    status: 'diagnostic-complete-zero-training-rows',
    implementation: Object.fromEntries(implementationEntries),
    evidenceFiles: Object.fromEntries(evidenceEntries),
    campaign: { path: CAMPAIGN, identitySha256: evidence.campaign.identity.sha256 },
    selection: {
      path: SELECTION,
      identitySha256: evidence.selection.identity.sha256,
      summary: evidence.selection.summary,
    },
    local: {
      capture: captureMetrics(evidence.localCapture),
      currentReplay: replayMetrics(evidence.localReplay),
    },
    reference: {
      capture: captureMetrics(evidence.referenceCapture),
      currentReplay: replayMetrics(evidence.referenceReplay),
    },
    judge: {
      ...evidence.workbookResult.summary,
      reviewedBatches: evidence.workbookResult.reviewedBatches,
      pendingBatches: evidence.workbookResult.pendingBatches,
      evaluatedCases: evidence.workbookResult.evaluatedCases,
      identity: evidence.judge,
    },
    trainingPreferences: evidence.preferences.length,
    claimBoundary:
      'The 14-case, seven-domain diagnostic shows a stable paid-reference preference over the captured local base artifacts, but every winner fails the strict score qualification and zero rows enter training. This is single-model-judge diagnostic evidence, not human, instructor, classroom, aggregate-quality, adapter, held-out, or production-win evidence.',
  };
  receipt.identity = { algorithm: 'sha256-canonical-json', sha256: scionLessonKernelSha256(receipt) };
  return receipt;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node scripts/scionLessonKernelExpansionEvidenceV01657.mjs [--build|--audit]');
    return;
  }
  if (args.build) {
    await promoteEvidence();
    await atomicWriteJson(RECEIPT, await buildReceipt(GENERATED_AT));
  }
  const tracked = await readJson(RECEIPT);
  const rebuilt = await buildReceipt(tracked.generatedAt);
  if (stableScionLessonKernelJson(rebuilt) !== stableScionLessonKernelJson(tracked)) {
    throw new Error('Tracked lesson-kernel expansion evidence is stale');
  }
  console.log(
    `Scion expansion evidence: ${tracked.judge.referenceWins}/${tracked.judge.pairs} reference wins / ${tracked.trainingPreferences} training-qualified rows.`,
  );
  console.log(`Verified: ${RECEIPT}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
