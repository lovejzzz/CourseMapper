#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  aggregateScionLessonKernelPairedOrders,
  buildScionLessonKernelTrainingPreferences,
  validateScionLessonKernelJudgeReview,
} from './lib/scionLessonKernelJudge.mjs';
import {
  scionLessonKernelSha256,
  stableScionLessonKernelJson,
  validateScionLessonKernelCampaign,
} from './lib/scionLessonKernelCampaign.mjs';
import { validateScionLessonKernelAdmissionReplay } from './lib/scionLessonKernelAdmissionReplay.mjs';

const OUTPUT = 'evaluation/scion-adapters/evidence/lesson-kernel-pilot-v0.16.56';
const RECEIPT = `${OUTPUT}/receipt.json`;
const GENERATED_AT = '2026-07-19T05:30:00.000Z';
const IMPLEMENTATION_FILES = Object.freeze([
  'scripts/scionLessonKernelCapture.mjs',
  'scripts/scionLessonKernelEvidenceV01656.mjs',
  'scripts/lib/scionLessonKernelCampaign.mjs',
  'scripts/lib/scionLessonKernelJudge.mjs',
  'scripts/lib/scionLessonKernelAdmissionReplay.mjs',
  'src/lib/publicScionProvider.js',
  'src/lib/scionLocalProvider.js',
  'src/lib/scionAnswerKeyAlignment.js',
  'src/lib/scionKeyTermContract.js',
  'src/lib/scenarioContract.js',
]);

const BUNDLES = Object.freeze({
  baseline: {
    campaign: 'evaluation/scion-adapters/lesson-kernel-campaign-v0.16.54.json',
    localCapture: 'verification-output/scion-lesson-kernel-capture-v0.16.54/local.json',
    localReplay: 'verification-output/scion-lesson-kernel-capture-v0.16.54/local-v6-replay.json',
    referenceCapture: 'verification-output/scion-lesson-kernel-capture-v0.16.54/reference.json',
    referenceReplay: 'verification-output/scion-lesson-kernel-capture-v0.16.54/reference-v6-replay.json',
    judge: 'verification-output/scion-lesson-kernel-judge-pilot-v0.16.55',
    judgeUsesReplay: false,
  },
  current: {
    campaign: 'evaluation/scion-adapters/lesson-kernel-campaign-v0.16.56.json',
    localCapture: 'verification-output/scion-lesson-kernel-capture-v0.16.56-final/local.json',
    localReplay: 'verification-output/scion-lesson-kernel-capture-v0.16.56-final/local-v6-replay.json',
    referenceCapture: 'verification-output/scion-lesson-kernel-capture-v0.16.56-final2/reference.json',
    referenceReplay: 'verification-output/scion-lesson-kernel-capture-v0.16.56-final2/reference-v6-replay.json',
    judge: 'verification-output/scion-lesson-kernel-judge-pilot-v0.16.56-final',
    judgeUsesReplay: true,
  },
});

function parseArgs(argv) {
  const args = { build: false, audit: false };
  for (const token of argv) {
    if (token === '--build') args.build = true;
    else if (token === '--audit') args.audit = true;
    else if (token === '--help' || token === '-h') args.help = true;
    else throw new Error(`Unknown lesson-kernel evidence option: ${token}`);
  }
  if (!args.build && !args.audit && !args.help) args.audit = true;
  return args;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
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

async function copyFile(source, target) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
}

async function promoteBundle(name, source) {
  const target = path.join(OUTPUT, name);
  await Promise.all([
    copyFile(source.localCapture, path.join(target, 'local-capture.json')),
    copyFile(source.localReplay, path.join(target, 'local-admission-replay.json')),
    copyFile(source.referenceCapture, path.join(target, 'reference-capture.json')),
    copyFile(source.referenceReplay, path.join(target, 'reference-admission-replay.json')),
  ]);
  const workbook = await readJson(path.join(source.judge, 'workbook.json'));
  if (workbook.batches?.length !== 1) throw new Error(`${name} pilot must contain exactly one judge batch`);
  const batchId = workbook.batches[0].batchId;
  const batchSource = path.join(source.judge, 'batches', batchId);
  const judgeTarget = path.join(target, 'judge');
  await Promise.all([
    copyFile(path.join(source.judge, 'workbook.json'), path.join(judgeTarget, 'workbook.json')),
    copyFile(path.join(batchSource, 'a-b.packet.json'), path.join(judgeTarget, 'a-b.packet.json')),
    copyFile(path.join(batchSource, 'b-a.packet.json'), path.join(judgeTarget, 'b-a.packet.json')),
    copyFile(path.join(batchSource, 'a-b.review.json'), path.join(judgeTarget, 'a-b.review.json')),
    copyFile(path.join(batchSource, 'b-a.review.json'), path.join(judgeTarget, 'b-a.review.json')),
    copyFile(path.join(batchSource, 'paired-order-result.json'), path.join(judgeTarget, 'paired-order-result.json')),
    copyFile(
      path.join(batchSource, 'training-preferences.jsonl'),
      path.join(judgeTarget, 'training-preferences.jsonl'),
    ),
  ]);
}

function captureMetrics(report) {
  const calls = report.calls || [];
  return {
    cases: calls.length,
    admitted: calls.filter((call) => call.artifact && call.admission?.needsRetry === false).length,
    retained: calls.filter((call) => call.artifact && call.admission?.needsRetry === true).length,
    retries: calls.reduce((sum, call) => sum + Math.max(0, (call.attempts || []).length - 1), 0),
    durationMs: calls.reduce((sum, call) => sum + Number(call.durationMs || 0), 0),
    issueInstances: calls.reduce((sum, call) => sum + (call.admission?.issues || []).length, 0),
    selectedAttempts: calls.map((call) => call.selectedAttempt || (call.attempts || []).length),
  };
}

function replayMetrics(report) {
  const calls = report.calls || [];
  return {
    cases: calls.length,
    admitted: calls.filter((call) => call.admission?.needsRetry === false).length,
    retained: calls.filter((call) => call.admission?.needsRetry === true).length,
    issueInstances: calls.reduce((sum, call) => sum + (call.admission?.issues || []).length, 0),
    addedIssueCases: calls.filter((call) => {
      const upstream = new Set(call.upstreamAdmission?.issues || []);
      return (call.admission?.issues || []).some((issue) => !upstream.has(issue));
    }).length,
  };
}

async function loadEvidenceBundle(name, source) {
  const root = path.join(OUTPUT, name);
  const [
    campaign,
    localCapture,
    localReplay,
    referenceCapture,
    referenceReplay,
    workbook,
    abPacket,
    baPacket,
    abReview,
    baReview,
    pairedResult,
  ] = await Promise.all([
    readJson(source.campaign),
    readJson(path.join(root, 'local-capture.json')),
    readJson(path.join(root, 'local-admission-replay.json')),
    readJson(path.join(root, 'reference-capture.json')),
    readJson(path.join(root, 'reference-admission-replay.json')),
    readJson(path.join(root, 'judge', 'workbook.json')),
    readJson(path.join(root, 'judge', 'a-b.packet.json')),
    readJson(path.join(root, 'judge', 'b-a.packet.json')),
    readJson(path.join(root, 'judge', 'a-b.review.json')),
    readJson(path.join(root, 'judge', 'b-a.review.json')),
    readJson(path.join(root, 'judge', 'paired-order-result.json')),
  ]);
  const validation = validateScionLessonKernelCampaign(campaign);
  if (!validation.valid) throw new Error(`${name} campaign invalid: ${validation.issues.join(', ')}`);
  for (const [label, report] of [
    ['local', localCapture],
    ['reference', referenceCapture],
  ]) {
    if (report.campaignIdentity?.sha256 !== campaign.identity.sha256) {
      throw new Error(`${name} ${label} capture campaign identity mismatch`);
    }
  }
  for (const [label, report] of [
    ['local', localReplay],
    ['reference', referenceReplay],
  ]) {
    const replayValidation = validateScionLessonKernelAdmissionReplay(report);
    if (!replayValidation.valid)
      throw new Error(`${name} ${label} replay invalid: ${replayValidation.issues.join(', ')}`);
  }
  for (const [label, review, packet] of [
    ['A/B', abReview, abPacket],
    ['B/A', baReview, baPacket],
  ]) {
    const reviewValidation = validateScionLessonKernelJudgeReview(review, packet);
    if (!reviewValidation.valid)
      throw new Error(`${name} ${label} review invalid: ${reviewValidation.issues.join(', ')}`);
  }
  if (abReview.sessionId === baReview.sessionId) throw new Error(`${name} judge sessions were reused`);
  if (workbook.campaignIdentity?.sha256 !== campaign.identity.sha256) {
    throw new Error(`${name} judge workbook campaign identity mismatch`);
  }
  const localForJudge = source.judgeUsesReplay ? localReplay : localCapture;
  const referenceForJudge = source.judgeUsesReplay ? referenceReplay : referenceCapture;
  const rebuiltResult = aggregateScionLessonKernelPairedOrders({
    abPacket,
    baPacket,
    abReview,
    baReview,
    localReport: localForJudge,
    referenceReport: referenceForJudge,
    generatedAt: pairedResult.generatedAt,
  });
  if (rebuiltResult.identity.sha256 !== pairedResult.identity.sha256) {
    throw new Error(`${name} paired-order result no longer reproduces`);
  }
  const preferences = buildScionLessonKernelTrainingPreferences({
    aggregate: pairedResult,
    campaign,
    localReport: localForJudge,
    referenceReport: referenceForJudge,
  });
  const storedPreferences = (await fs.readFile(path.join(root, 'judge', 'training-preferences.jsonl'), 'utf8'))
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(JSON.parse);
  if (stableScionLessonKernelJson(preferences) !== stableScionLessonKernelJson(storedPreferences)) {
    throw new Error(`${name} training preferences no longer reproduce`);
  }
  return {
    campaign,
    localCapture,
    localReplay,
    referenceCapture,
    referenceReplay,
    pairedResult,
    preferences,
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

async function buildReceipt(generatedAt) {
  const [baseline, current, implementationEntries, evidenceFileNames] = await Promise.all([
    loadEvidenceBundle('baseline', BUNDLES.baseline),
    loadEvidenceBundle('current', BUNDLES.current),
    Promise.all(IMPLEMENTATION_FILES.map(async (file) => [file, await sha256File(file)])),
    listEvidenceFiles(OUTPUT),
  ]);
  const evidenceEntries = await Promise.all(
    evidenceFileNames.map(async (file) => [file, await sha256File(path.join(OUTPUT, file))]),
  );
  const receipt = {
    schemaVersion: 1,
    protocol: 'scion-lesson-kernel-pilot-evidence-v1',
    generatedAt,
    implementation: Object.fromEntries(implementationEntries),
    evidenceFiles: Object.fromEntries(evidenceEntries),
    campaigns: {
      baseline: {
        path: BUNDLES.baseline.campaign,
        identitySha256: baseline.campaign.identity.sha256,
        evaluatorMetadata: 'included-legacy',
      },
      current: {
        path: BUNDLES.current.campaign,
        identitySha256: current.campaign.identity.sha256,
        promptPolicy: current.campaign.promptPolicy,
      },
    },
    baseline: {
      localCapture: captureMetrics(baseline.localCapture),
      localCurrentReplay: replayMetrics(baseline.localReplay),
      referenceCapture: captureMetrics(baseline.referenceCapture),
      referenceCurrentReplay: replayMetrics(baseline.referenceReplay),
      judge: baseline.pairedResult.summary,
      trainingPreferences: baseline.preferences.length,
    },
    current: {
      localCapture: captureMetrics(current.localCapture),
      localCurrentReplay: replayMetrics(current.localReplay),
      referenceCapture: captureMetrics(current.referenceCapture),
      referenceCurrentReplay: replayMetrics(current.referenceReplay),
      judge: current.pairedResult.summary,
      trainingPreferences: current.preferences.length,
    },
    measuredDelta: {
      localRuntimeMs:
        captureMetrics(current.localCapture).durationMs - captureMetrics(baseline.localCapture).durationMs,
      localRetryCount: captureMetrics(current.localCapture).retries - captureMetrics(baseline.localCapture).retries,
      baselineArtifactsNewlyRejectedByCurrentCompiler:
        captureMetrics(baseline.localCapture).admitted - replayMetrics(baseline.localReplay).admitted,
      currentTaskMatchedStablePreferences: current.preferences.length,
    },
    claimBoundary:
      'This is three-case, single-model-judge pilot evidence. It proves deterministic detector and orchestration behavior on the captured artifacts only. It does not prove aggregate Scion quality, unseen precision, human preference, statistical significance, adapter improvement, or adapter activation.',
  };
  receipt.identity = {
    algorithm: 'sha256-canonical-json',
    sha256: scionLessonKernelSha256(receipt),
  };
  return receipt;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node scripts/scionLessonKernelEvidenceV01656.mjs [--build|--audit]');
    return;
  }
  if (args.build) {
    await Promise.all(Object.entries(BUNDLES).map(([name, source]) => promoteBundle(name, source)));
    await atomicWriteJson(RECEIPT, await buildReceipt(GENERATED_AT));
  }
  const tracked = await readJson(RECEIPT);
  const rebuilt = await buildReceipt(tracked.generatedAt);
  if (stableScionLessonKernelJson(rebuilt) !== stableScionLessonKernelJson(tracked)) {
    throw new Error('Tracked lesson-kernel pilot evidence is stale');
  }
  console.log(
    `Scion lesson-kernel pilot: ${tracked.current.judge.stablePreferences} stable preferences / ${tracked.current.trainingPreferences} training-qualified / ${tracked.current.judge.unstable} unstable.`,
  );
  console.log(`Verified: ${RECEIPT}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
