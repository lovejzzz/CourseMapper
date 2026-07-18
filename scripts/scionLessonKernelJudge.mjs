#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  SCION_LESSON_KERNEL_JUDGE_REVIEW_PROTOCOL,
  aggregateScionLessonKernelPairedOrders,
  buildScionLessonKernelBlindPacket,
  buildScionLessonKernelTrainingPreferences,
  validateScionLessonKernelBlindPacket,
  validateScionLessonKernelJudgeReview,
} from './lib/scionLessonKernelJudge.mjs';

const CAMPAIGN = 'evaluation/scion-adapters/lesson-kernel-campaign-v0.16.54.json';
const CAPTURE_DIR = 'verification-output/scion-lesson-kernel-capture-v0.16.54';
const JUDGE_DIR = 'verification-output/scion-lesson-kernel-judge-v0.16.54';
const PROMPT = 'evaluation/scion-adapters/lesson-kernel-judge-prompt-v0.16.54.md';

function parseArgs(argv) {
  const args = {
    build: false,
    audit: false,
    ingest: false,
    campaign: CAMPAIGN,
    local: `${CAPTURE_DIR}/local.json`,
    reference: `${CAPTURE_DIR}/reference.json`,
    output: JUDGE_DIR,
    prompt: PROMPT,
    abReview: `${JUDGE_DIR}/a-b.review.json`,
    baReview: `${JUDGE_DIR}/b-a.review.json`,
    result: `${JUDGE_DIR}/paired-order-result.json`,
    preferences: `${JUDGE_DIR}/training-preferences.jsonl`,
    generatedAt: '2026-07-18T16:30:00.000Z',
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
    else if (token === '--ab-review') args.abReview = argv[++index] || args.abReview;
    else if (token === '--ba-review') args.baReview = argv[++index] || args.baReview;
    else if (token === '--result') args.result = argv[++index] || args.result;
    else if (token === '--preferences') args.preferences = argv[++index] || args.preferences;
    else if (token === '--generated-at') args.generatedAt = argv[++index] || args.generatedAt;
    else if (token === '--help' || token === '-h') args.help = true;
    else throw new Error(`Unknown lesson-kernel judge option: ${token}`);
  }
  if (![args.build, args.audit, args.ingest].some(Boolean) && !args.help) args.audit = true;
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

function packetPath(output, order) {
  return path.join(output, order === 'A/B' ? 'a-b.packet.json' : 'b-a.packet.json');
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

function taskInstructions(packet, promptFile, templateFile) {
  return `Use only ${promptFile}, ${packetPath('.', packet.order)}, and ${templateFile}. Read the judge prompt, score every anonymous case, and fill the review template. Do not inspect the repository, capture reports, the other order, prior outcomes, or any organizer mapping. Set a fresh unique sessionId and the three attestations only if they are true. Return valid JSON only in the completed review file.\n`;
}

async function loadInputs(args) {
  const [campaign, localReport, referenceReport, promptRaw] = await Promise.all([
    readJson(args.campaign),
    readJson(args.local),
    readJson(args.reference),
    fs.readFile(args.prompt),
  ]);
  if (localReport.campaignIdentity?.sha256 !== campaign.identity?.sha256) {
    throw new Error('Local capture does not match the judge campaign identity');
  }
  if (referenceReport.campaignIdentity?.sha256 !== campaign.identity?.sha256) {
    throw new Error('Reference capture does not match the judge campaign identity');
  }
  return { campaign, localReport, referenceReport, promptRaw };
}

async function build(args) {
  const inputs = await loadInputs(args);
  const promptIdentity = promptSha256(inputs.promptRaw);
  const packets = {};
  for (const order of ['A/B', 'B/A']) {
    const packet = buildScionLessonKernelBlindPacket({
      ...inputs,
      order,
      promptPath: args.prompt,
      promptSha256: promptIdentity,
      generatedAt: args.generatedAt,
    });
    const validation = validateScionLessonKernelBlindPacket(packet);
    if (!validation.valid) throw new Error(`Invalid ${order} packet: ${validation.issues.join(', ')}`);
    packets[order] = packet;
    const stem = order === 'A/B' ? 'a-b' : 'b-a';
    await atomicWriteJson(packetPath(args.output, order), packet);
    await atomicWriteJson(path.join(args.output, `${stem}.review.template.json`), reviewTemplate(packet));
    await fs.writeFile(
      path.join(args.output, `${stem}.TASK.txt`),
      taskInstructions(packet, path.resolve(args.prompt), path.resolve(args.output, `${stem}.review.template.json`)),
    );
  }
  const local = new Map(inputs.localReport.calls.map((call) => [call.caseId, call]));
  const reference = new Map(inputs.referenceReport.calls.map((call) => [call.caseId, call]));
  await atomicWriteJson(path.join(args.output, 'organizer-map.json'), {
    schemaVersion: 1,
    protocol: 'scion-lesson-kernel-organizer-map-v1',
    campaignIdentity: inputs.campaign.identity,
    cases: packets['A/B'].cases.map((entry) => ({
      caseId: entry.caseId,
      pairId: entry.pairId,
      localArtifactSha256: local.get(entry.caseId).artifactSha256,
      referenceArtifactSha256: reference.get(entry.caseId).artifactSha256,
    })),
    allowedJudgeInputs: [args.prompt, packetPath(args.output, 'A/B'), packetPath(args.output, 'B/A')],
    claimBoundary: 'This mapping is organizer-only and must never be available inside either judge session.',
  });
  return packets;
}

async function audit(args) {
  const inputs = await loadInputs(args);
  const abPacket = await readJson(packetPath(args.output, 'A/B'));
  const baPacket = await readJson(packetPath(args.output, 'B/A'));
  const issues = [
    ...validateScionLessonKernelBlindPacket(abPacket).issues.map((issue) => `A/B:${issue}`),
    ...validateScionLessonKernelBlindPacket(baPacket).issues.map((issue) => `B/A:${issue}`),
  ];
  const expectedPromptSha = promptSha256(inputs.promptRaw);
  if (abPacket.prompt?.sha256 !== expectedPromptSha || baPacket.prompt?.sha256 !== expectedPromptSha) {
    issues.push('prompt-sha256');
  }
  const baById = new Map(baPacket.cases.map((entry) => [entry.caseId, entry]));
  for (const abCase of abPacket.cases) {
    const baCase = baById.get(abCase.caseId);
    if (!baCase) {
      issues.push(`reverse-case:${abCase.caseId}`);
      continue;
    }
    if (
      abCase.artifacts.A.artifactSha256 !== baCase.artifacts.B.artifactSha256 ||
      abCase.artifacts.B.artifactSha256 !== baCase.artifacts.A.artifactSha256
    ) {
      issues.push(`reverse-order:${abCase.caseId}`);
    }
  }
  if (issues.length > 0) throw new Error(`Lesson-kernel judge audit failed: ${[...new Set(issues)].join(', ')}`);
  return { 'A/B': abPacket, 'B/A': baPacket, abPacket, baPacket };
}

async function ingest(args) {
  const inputs = await loadInputs(args);
  const { abPacket, baPacket } = await audit(args);
  const [abReview, baReview] = await Promise.all([readJson(args.abReview), readJson(args.baReview)]);
  for (const [order, review, packet] of [
    ['A/B', abReview, abPacket],
    ['B/A', baReview, baPacket],
  ]) {
    const validation = validateScionLessonKernelJudgeReview(review, packet);
    if (!validation.valid) throw new Error(`Invalid ${order} review: ${validation.issues.join(', ')}`);
  }
  const result = aggregateScionLessonKernelPairedOrders({
    abPacket,
    baPacket,
    abReview,
    baReview,
    localReport: inputs.localReport,
    referenceReport: inputs.referenceReport,
    generatedAt: args.generatedAt,
  });
  if (result.status !== 'paired-orders-complete') {
    throw new Error(`Paired-order result is invalid: ${result.issues.join(', ')}`);
  }
  await atomicWriteJson(args.result, result);
  const preferences = buildScionLessonKernelTrainingPreferences({
    aggregate: result,
    campaign: inputs.campaign,
    localReport: inputs.localReport,
    referenceReport: inputs.referenceReport,
  });
  await atomicWriteJsonl(args.preferences, preferences);
  return result;
}

function printHelp() {
  process.stdout.write(
    `Scion lesson-kernel blind judge\n\n  --build   Build anonymous A/B and B/A packets\n  --audit   Verify packet identity and reversal\n  --ingest  Validate two completed reviews and aggregate stable preferences\n`,
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return printHelp();
  let packets;
  if (args.build) packets = await build(args);
  if (args.audit) packets = await audit(args);
  let result;
  if (args.ingest) result = await ingest(args);
  if (result) process.stdout.write(`${JSON.stringify(result.summary, null, 2)}\n`);
  else if (packets) {
    process.stdout.write(
      `Scion lesson-kernel judge packets: ${packets['A/B'].cases.length} cases, exact A/B + B/A reversal verified\n`,
    );
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url)
  main().catch((error) => {
    process.stderr.write(`${error?.stack || error}\n`);
    process.exitCode = 1;
  });
