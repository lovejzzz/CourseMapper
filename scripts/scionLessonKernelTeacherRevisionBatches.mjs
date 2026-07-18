#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  SCION_LESSON_KERNEL_TEACHER_REPORT_PROTOCOL,
  buildScionLessonKernelTeacherRevisionPacket,
  buildScionLessonKernelTeacherRevisionSchema,
  compileScionLessonKernelTeacherRevisionResult,
  validateScionLessonKernelTeacherRevisionPacket,
  validateScionLessonKernelTeacherRevisionResult,
} from './lib/scionLessonKernelTeacherRevision.mjs';
import { scionLessonKernelSha256 } from './lib/scionLessonKernelCampaign.mjs';

const CAMPAIGN = 'evaluation/scion-adapters/lesson-kernel-campaign-v0.16.54.json';
const REFERENCE_REPORT = 'verification-output/scion-lesson-kernel-capture-v0.16.54/reference.json';
const JUDGE_DIR = 'verification-output/scion-lesson-kernel-judge-batches-v0.16.54';
const OUTPUT_DIR = 'verification-output/scion-lesson-kernel-teacher-revision-v0.16.54';
const PROMPT = 'evaluation/scion-adapters/lesson-kernel-teacher-revision-prompt-v0.16.54.md';
const MANIFEST_PROTOCOL = 'scion-lesson-kernel-teacher-revision-workbook-v1';

function parseArgs(argv) {
  const args = {
    campaign: CAMPAIGN,
    referenceReport: REFERENCE_REPORT,
    judgeDir: JUDGE_DIR,
    output: OUTPUT_DIR,
    prompt: PROMPT,
    excludeAdmittedReport: '',
    excludeQualifiedResult: '',
    maxCases: 0,
    generatedAt: new Date().toISOString(),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--build') args.build = true;
    else if (token === '--ingest') args.ingest = true;
    else if (token === '--reference-report') args.referenceReport = argv[++index] || '';
    else if (token === '--output') args.output = argv[++index] || args.output;
    else if (token === '--prompt') args.prompt = argv[++index] || args.prompt;
    else if (token === '--exclude-admitted-report') {
      args.excludeAdmittedReport = argv[++index] || '';
    } else if (token === '--exclude-qualified-result') {
      args.excludeQualifiedResult = argv[++index] || '';
    } else if (token === '--max-cases') args.maxCases = Number(argv[++index] || 0);
    else if (token === '--generated-at') args.generatedAt = argv[++index] || args.generatedAt;
    else if (token === '--help' || token === '-h') args.help = true;
    else throw new Error(`Unknown teacher revision option: ${token}`);
  }
  if (!args.build && !args.ingest && !args.help) args.build = true;
  if (!Number.isInteger(args.maxCases) || args.maxCases < 0) {
    throw new Error('--max-cases must be a non-negative integer');
  }
  return args;
}

export function chunkScionTeacherRevisionResults(results = [], maxCases = 0) {
  if (!Number.isInteger(maxCases) || maxCases < 0) throw new Error('maxCases must be a non-negative integer');
  if (maxCases === 0 || results.length <= maxCases) return results.length > 0 ? [results] : [];
  const chunks = [];
  for (let index = 0; index < results.length; index += maxCases) {
    chunks.push(results.slice(index, index + maxCases));
  }
  return chunks;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function readJsonIfExists(file) {
  try {
    return await readJson(file);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function atomicWriteJson(file, value) {
  const absolute = path.resolve(file);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  const temporary = `${absolute}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await fs.rename(temporary, absolute);
}

async function loadInputs(args) {
  const [campaign, referenceReport, judgeWorkbook, promptRaw, excludeAdmittedReport, excludeQualifiedResult] =
    await Promise.all([
      readJson(args.campaign),
      readJson(args.referenceReport),
      readJson(path.join(args.judgeDir, 'workbook.json')),
      fs.readFile(args.prompt, 'utf8'),
      args.excludeAdmittedReport ? readJson(args.excludeAdmittedReport) : null,
      args.excludeQualifiedResult ? readJson(args.excludeQualifiedResult) : null,
    ]);
  return {
    campaign,
    referenceReport,
    judgeWorkbook,
    promptRaw,
    prompt: { path: args.prompt, sha256: crypto.createHash('sha256').update(promptRaw).digest('hex') },
    excludeAdmittedReport,
    excludeQualifiedResult,
  };
}

async function qualifiedResults(args, workbookResult) {
  if (!workbookResult) return [];
  if (!workbookResult.batchResults?.length) return workbookResult.results || [];
  const root = path.dirname(args.excludeQualifiedResult);
  const aggregates = await Promise.all(
    workbookResult.batchResults.map((entry) =>
      readJson(path.join(root, 'batches', entry.batchId, 'paired-order-result.json')),
    ),
  );
  return aggregates.flatMap((aggregate) => aggregate.results || []);
}

async function build(args) {
  const inputs = await loadInputs(args);
  const excludedCaseIds = new Set(
    (inputs.excludeAdmittedReport?.calls || [])
      .filter((call) => call.admission?.needsRetry === false)
      .map((call) => call.caseId),
  );
  for (const result of await qualifiedResults(args, inputs.excludeQualifiedResult)) {
    if (result.trainingEligible) excludedCaseIds.add(result.caseId);
  }
  const batches = [];
  for (const entry of inputs.judgeWorkbook.batches || []) {
    const aggregatePath = path.join(args.judgeDir, 'batches', entry.batchId, 'paired-order-result.json');
    const aggregate = await readJsonIfExists(aggregatePath);
    if (!aggregate) continue;
    const eligibleResults = (aggregate.results || []).filter((result) => !excludedCaseIds.has(result.caseId));
    const chunks = chunkScionTeacherRevisionResults(eligibleResults, args.maxCases);
    for (const [chunkIndex, results] of chunks.entries()) {
      const batchId =
        chunks.length === 1 ? entry.batchId : `${entry.batchId}-part-${String(chunkIndex + 1).padStart(2, '0')}`;
      const packet = buildScionLessonKernelTeacherRevisionPacket({
        batchId,
        campaign: inputs.campaign,
        aggregate: { ...aggregate, results },
        referenceReport: inputs.referenceReport,
        prompt: inputs.prompt,
        generatedAt: args.generatedAt,
      });
      if (packet.cases.length === 0) continue;
      const validation = validateScionLessonKernelTeacherRevisionPacket(packet);
      if (!validation.valid) throw new Error(`Invalid teacher packet ${batchId}: ${validation.issues.join(', ')}`);
      const directory = path.join(args.output, 'batches', batchId);
      const schema = buildScionLessonKernelTeacherRevisionSchema(packet);
      await Promise.all([
        atomicWriteJson(path.join(directory, 'packet.json'), packet),
        atomicWriteJson(path.join(directory, 'result.schema.json'), schema),
        fs
          .mkdir(directory, { recursive: true })
          .then(() => fs.writeFile(path.join(directory, 'teacher-prompt.md'), inputs.promptRaw)),
      ]);
      batches.push({
        batchId,
        cases: packet.cases.length,
        packetSha256: packet.identity.sha256,
      });
    }
  }
  const manifest = {
    schemaVersion: 1,
    protocol: MANIFEST_PROTOCOL,
    generatedAt: args.generatedAt,
    campaignIdentity: inputs.campaign.identity,
    judgeWorkbookSha256: inputs.judgeWorkbook.identity?.sha256,
    prompt: inputs.prompt,
    revisionSource: {
      path: args.referenceReport,
      reportSha256: inputs.referenceReport.identity?.sha256 || null,
      protocol: inputs.referenceReport.protocol || null,
      arm: inputs.referenceReport.arm || inputs.referenceReport.calls?.[0]?.arm || null,
    },
    maxCasesPerBatch: args.maxCases || null,
    ...(args.excludeAdmittedReport || args.excludeQualifiedResult
      ? {
          exclusion: {
            admittedReportPath: args.excludeAdmittedReport || null,
            admittedReportSha256: inputs.excludeAdmittedReport?.identity?.sha256 || null,
            qualifiedResultPath: args.excludeQualifiedResult || null,
            qualifiedResultSha256: inputs.excludeQualifiedResult?.identity?.sha256 || null,
            excludedCases: excludedCaseIds.size,
          },
        }
      : {}),
    batches,
    cases: batches.reduce((sum, entry) => sum + entry.cases, 0),
    claimBoundary:
      'This workbook authorizes source-bound model revision only. Each revised artifact still requires deterministic compiler admission and a fresh anonymous paired-order judgment.',
  };
  manifest.identity = {
    algorithm: 'sha256-canonical-json',
    sha256: scionLessonKernelSha256({ ...manifest, identity: undefined }),
  };
  await atomicWriteJson(path.join(args.output, 'workbook.json'), manifest);
  return manifest;
}

async function ingest(args) {
  const inputs = await loadInputs(args);
  const manifest = await readJson(path.join(args.output, 'workbook.json'));
  const sessions = new Set();
  let reviserIdentity = null;
  const calls = [];
  const batchReports = [];
  let pendingBatches = 0;
  for (const entry of manifest.batches || []) {
    const directory = path.join(args.output, 'batches', entry.batchId);
    const [packet, result] = await Promise.all([
      readJson(path.join(directory, 'packet.json')),
      readJsonIfExists(path.join(directory, 'result.json')),
    ]);
    if (!result) {
      pendingBatches += 1;
      continue;
    }
    const validation = validateScionLessonKernelTeacherRevisionResult(result, packet);
    if (!validation.valid) throw new Error(`Invalid teacher result ${entry.batchId}: ${validation.issues.join(', ')}`);
    if (sessions.has(result.sessionId)) throw new Error(`Teacher revision session reused: ${result.sessionId}`);
    sessions.add(result.sessionId);
    const identity = JSON.stringify(result.reviser);
    if (reviserIdentity && identity !== reviserIdentity) throw new Error(`Teacher reviser changed in ${entry.batchId}`);
    reviserIdentity ||= identity;
    const report = compileScionLessonKernelTeacherRevisionResult({
      result,
      packet,
      campaign: inputs.campaign,
    });
    await atomicWriteJson(path.join(directory, 'compiled-report.json'), report);
    calls.push(...report.calls);
    batchReports.push({
      batchId: entry.batchId,
      packetSha256: entry.packetSha256,
      resultSha256: report.resultSha256,
      reportSha256: report.identity.sha256,
      summary: report.summary,
    });
  }
  const report = {
    schemaVersion: 1,
    protocol: SCION_LESSON_KERNEL_TEACHER_REPORT_PROTOCOL,
    campaignIdentity: inputs.campaign.identity,
    workbookSha256: manifest.identity.sha256,
    reviser: reviserIdentity ? JSON.parse(reviserIdentity) : null,
    calls,
    batchReports,
    summary: {
      cases: calls.length,
      compilerAdmitted: calls.filter((call) => call.admission.needsRetry === false).length,
      compilerRejected: calls.filter((call) => call.admission.needsRetry === true).length,
      completedBatches: batchReports.length,
      pendingBatches,
    },
    claimBoundary:
      'These source-constrained model revisions are compiler candidates only. They are not human evidence, judge preferences, adapter wins, or training authorization.',
  };
  report.identity = {
    algorithm: 'sha256-canonical-json',
    sha256: scionLessonKernelSha256({ ...report, identity: undefined }),
  };
  await atomicWriteJson(path.join(args.output, 'teacher-report.json'), report);
  return report;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      'Usage: node scripts/scionLessonKernelTeacherRevisionBatches.mjs [--build|--ingest] [--reference-report file] [--prompt file] [--exclude-admitted-report file] [--exclude-qualified-result file] [--max-cases N]',
    );
    return;
  }
  if (args.build) {
    const manifest = await build(args);
    console.log(`Scion teacher revision workbook: ${manifest.cases} cases / ${manifest.batches.length} batches`);
  }
  if (args.ingest) {
    const report = await ingest(args);
    console.log(JSON.stringify(report.summary, null, 2));
  }
}

if (import.meta.url === pathToFileURL(path.resolve(process.argv[1] || '')).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
