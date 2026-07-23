#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

import { assessProjectedKernelCoverage } from '../src/lib/blueprintEnrichmentPass.js';
import { compactLessonKernelSchemaProfile } from '../src/lib/scionContracts.js';
import { completeNativeKernelSurfaces, parseNativePassBResponse } from '../src/lib/nativeGraphAuthoring.js';
import {
  assessPublicScionKernelResponse,
  publicScionAdmissionRisk,
  publicScionFactContractIssues,
  repairPublicScionJson,
} from '../src/lib/publicScionProvider.js';
import { scionFactContractForLesson } from '../src/lib/scionEvidenceContract.js';
import { SCION_GEMMA4_E2B_BASE } from '../src/lib/scionAdapterManifest.js';

const execFile = promisify(execFileCallback);

export const SCION_CHECKPOINT_PROBE_PROTOCOL = 'scion-adapter-checkpoint-semantic-probe-v1';
const SHA256_RE = /^[a-f0-9]{64}$/;

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  const handle = await fs.open(filePath, 'r');
  try {
    for await (const chunk of handle.createReadStream({ autoClose: false })) hash.update(chunk);
  } finally {
    await handle.close();
  }
  return hash.digest('hex');
}

function extractJsonArrayAfter(text, marker) {
  const source = String(text || '');
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) return [];
  const arrayStart = source.indexOf('[', markerIndex + marker.length);
  if (arrayStart < 0) return [];
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = arrayStart; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === '[') depth += 1;
    else if (character === ']') {
      depth -= 1;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(source.slice(arrayStart, index + 1));
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      }
    }
  }
  return [];
}

export function splitProductionTrainingPrompt(prompt) {
  const text = String(prompt || '');
  const boundary = text.indexOf('\n\nCOURSE:');
  if (boundary < 0) return { system: '', user: text };
  return { system: text.slice(0, boundary), user: text.slice(boundary + 2) };
}

export function extractCheckpointProbePrompt(prompt) {
  const text = String(prompt || '');
  const lessons = extractJsonArrayAfter(text, 'LESSONS TO AUTHOR:').filter(
    (lesson) => lesson && typeof lesson === 'object' && lesson.lessonId,
  );
  const course = text.match(/^COURSE:\s*(.+)$/im)?.[1]?.trim() || 'Unknown course';
  const factContracts = lessons.map((lesson) => scionFactContractForLesson(lesson));
  const factCounts = [...new Set(factContracts.map((contract) => contract.factCount))];
  const valid =
    lessons.length === 1 &&
    factContracts.every(
      (contract) => contract.mode === 'numbered-source-ledger-v1' && contract.factCount >= 3 && contract.factCount <= 5,
    ) &&
    factCounts.length === 1;
  const assessmentPrompt = valid
    ? `Course: ${course}\nLessons:\n${JSON.stringify(lessons)}\nReturn ONLY valid JSON matching the kernel shape from the instructions.`
    : '';
  return {
    valid,
    course,
    lessons,
    expectedLessonIds: lessons.map((lesson) => lesson.lessonId),
    factCount: factCounts[0] || 0,
    assessmentPrompt,
  };
}

function issueFamily(issue) {
  const value = String(issue || '');
  if (/fact-\d+:source-fact-ledger-mismatch|facts-count|duplicate-facts/.test(value)) return 'fact-ledger';
  if (/duplicate-option|multiple-source-supported-options|explanation-key-conflict/.test(value)) return 'assessment';
  if (/scenario/.test(value)) return 'scenario';
  if (/key-term|definition|example|misconception|correction|repeats/.test(value)) return 'terminology';
  if (/invalid-json|missing-lesson/.test(value)) return 'envelope';
  return 'other';
}

export function summarizeCheckpointCases(cases = []) {
  const issueCounts = {};
  const issueFamilyCounts = {};
  let exactFactLedgerCases = 0;
  let admittedCases = 0;
  let usableCases = 0;
  let completeCases = 0;
  let highRiskCases = 0;
  let outputCharacters = 0;
  let durationMs = 0;
  for (const record of cases) {
    if (record.factIssues?.length === 0) exactFactLedgerCases += 1;
    if (record.admitted === true) admittedCases += 1;
    if (record.projectedCoverage?.usable === true) usableCases += 1;
    if (record.projectedCoverage?.complete === true) completeCases += 1;
    if (Number(record.admissionRisk?.highRiskIssues) > 0) highRiskCases += 1;
    outputCharacters += Number(record.outputCharacters) || 0;
    durationMs += Number(record.durationMs) || 0;
    for (const issue of record.issues || []) {
      issueCounts[issue] = Number(issueCounts[issue] || 0) + 1;
      const family = issueFamily(issue);
      issueFamilyCounts[family] = Number(issueFamilyCounts[family] || 0) + 1;
    }
  }
  const totalCases = cases.length;
  const rate = (count) => (totalCases > 0 ? Number((count / totalCases).toFixed(4)) : 0);
  const promotionPreflight =
    totalCases > 0 &&
    exactFactLedgerCases === totalCases &&
    admittedCases === totalCases &&
    usableCases === totalCases &&
    highRiskCases === 0;
  return {
    totalCases,
    exactFactLedgerCases,
    admittedCases,
    usableCases,
    completeCases,
    highRiskCases,
    exactFactLedgerRate: rate(exactFactLedgerCases),
    admissionRate: rate(admittedCases),
    usableRate: rate(usableCases),
    completeRate: rate(completeCases),
    issueCount: Object.values(issueCounts).reduce((sum, count) => sum + count, 0),
    issueCounts: Object.fromEntries(Object.entries(issueCounts).sort(([left], [right]) => left.localeCompare(right))),
    issueFamilyCounts: Object.fromEntries(
      Object.entries(issueFamilyCounts).sort(([left], [right]) => left.localeCompare(right)),
    ),
    durationMs,
    meanDurationMs: totalCases > 0 ? Math.round(durationMs / totalCases) : 0,
    outputCharacters,
    meanOutputCharacters: totalCases > 0 ? Math.round(outputCharacters / totalCases) : 0,
    promotionPreflight,
    claimBoundary:
      'This task-shaped probe can reject a checkpoint before browser canaries. It cannot promote an adapter or prove whole-package quality.',
  };
}

function projectedCoverage(responseText, probe) {
  try {
    const parsed = parseNativePassBResponse(responseText, {
      prompt: { lessons: probe.lessons },
      expectedLessonIds: probe.expectedLessonIds,
    });
    const coverages = probe.expectedLessonIds.map((lessonId) => {
      const payload = parsed.kernels[lessonId];
      if (!payload) return { usable: false, complete: false, score: 0 };
      const lesson = probe.lessons.find((entry) => entry.lessonId === lessonId) || {};
      return assessProjectedKernelCoverage(
        completeNativeKernelSurfaces(payload, {
          title: lesson.title,
          sections: [{ topicSection: lesson.topics, learningObjectives: lesson.objectives }],
        }),
      );
    });
    return {
      usable: coverages.every((coverage) => coverage.usable),
      complete: coverages.every((coverage) => coverage.complete),
      score: coverages.reduce((sum, coverage) => sum + (Number(coverage.score) || 0), 0),
    };
  } catch {
    return { usable: false, complete: false, score: 0 };
  }
}

async function readJsonLines(filePath) {
  const text = await fs.readFile(filePath, 'utf8');
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`${filePath}:${index + 1}: ${error.message}`);
      }
    });
}

async function inspectAdapter(adapterDir) {
  const root = path.resolve(adapterDir);
  const files = [];
  for (const relativePath of ['adapter_config.json', 'adapters.safetensors']) {
    const absolutePath = path.join(root, relativePath);
    const stats = await fs.lstat(absolutePath);
    if (!stats.isFile() || stats.isSymbolicLink() || stats.size <= 0) {
      throw new Error(`Checkpoint adapter file must be a non-empty regular file: ${absolutePath}`);
    }
    files.push({ path: relativePath, bytes: stats.size, sha256: await sha256File(absolutePath) });
  }
  return { root, files };
}

async function repositoryReceipt(cwd) {
  const [{ stdout: commit }, { stdout: tree }, { stdout: status }] = await Promise.all([
    execFile('git', ['rev-parse', 'HEAD^{commit}'], { cwd }),
    execFile('git', ['rev-parse', 'HEAD^{tree}'], { cwd }),
    execFile('git', ['status', '--porcelain', '--untracked-files=all'], { cwd }),
  ]);
  return { commit: commit.trim(), tree: tree.trim(), dirty: Boolean(status.trim()) };
}

function parseArgs(argv) {
  const args = { maxCases: Infinity, label: 'checkpoint' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dataset') args.datasetPath = path.resolve(argv[++index] || '');
    else if (arg === '--adapter-dir') args.adapterDir = path.resolve(argv[++index] || '');
    else if (arg === '--replay-report') args.replayReportPath = path.resolve(argv[++index] || '');
    else if (arg === '--output') args.outputPath = path.resolve(argv[++index] || '');
    else if (arg === '--label') args.label = String(argv[++index] || '').trim();
    else if (arg === '--max-cases') args.maxCases = Number(argv[++index]);
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.help && !args.datasetPath) throw new Error('--dataset is required');
  if (!args.help && !args.replayReportPath && !args.adapterDir) throw new Error('--adapter-dir is required');
  if (!args.help && !args.outputPath) throw new Error('--output is required');
  if (!args.help && (!Number.isFinite(args.maxCases) || args.maxCases <= 0)) args.maxCases = Infinity;
  return args;
}

function assessCheckpointResponse({ row, response, prior = {} }) {
  const prompt = String(row?.chosen?.[0]?.content || '');
  const probe = extractCheckpointProbePrompt(prompt);
  if (!probe.valid) throw new Error(`Dataset row ${Number(prior.index) || '?'} is not an exact source-ledger task`);
  const rawText = String(response || '');
  const repaired = repairPublicScionJson(rawText, { userPrompt: probe.assessmentPrompt });
  const assessment = assessPublicScionKernelResponse(repaired.text, probe.assessmentPrompt, 'blueprintEnrichment');
  return {
    ...prior,
    domain: row?.provenance?.domain || prior.domain || null,
    pairSha256: row?.provenance?.pairSha256 || prior.pairSha256 || null,
    course: probe.course,
    lessonId: probe.expectedLessonIds[0],
    outputCharacters: rawText.length,
    outputSha256: sha256(rawText),
    repairCount: repaired.repairs.length,
    admitted: assessment.needsRetry !== true,
    issues: assessment.issues || [],
    factIssues: publicScionFactContractIssues(assessment),
    admissionRisk: publicScionAdmissionRisk(assessment),
    projectedCoverage: projectedCoverage(repaired.text, probe),
    response: rawText,
  };
}

export async function replayScionAdapterCheckpointProbe({
  replayReportPath,
  datasetPath,
  outputPath,
  generatedAt = new Date().toISOString(),
} = {}) {
  const [source, rows, datasetSha256, repository] = await Promise.all([
    fs.readFile(replayReportPath, 'utf8').then(JSON.parse),
    readJsonLines(datasetPath),
    sha256File(datasetPath),
    repositoryReceipt(process.cwd()),
  ]);
  if (source?.protocol !== SCION_CHECKPOINT_PROBE_PROTOCOL || !Array.isArray(source?.cases)) {
    throw new Error('Replay source is not a Scion checkpoint semantic probe');
  }
  if (source?.dataset?.sha256 !== datasetSha256) throw new Error('Replay dataset bytes do not match the source report');
  const cases = source.cases.map((record, index) => {
    const row = rows[index];
    if (!row || row?.provenance?.pairSha256 !== record?.pairSha256) {
      throw new Error(`Replay dataset identity mismatch at case ${index + 1}`);
    }
    return assessCheckpointResponse({ row, response: record.response, prior: record });
  });
  const report = {
    ...source,
    generatedAt,
    replay: {
      sourcePath: path.resolve(replayReportPath),
      sourceSha256: await sha256File(replayReportPath),
      repository,
      modelCalls: 0,
      reason: 'Reassess retained raw checkpoint outputs under the current semantic admission code.',
    },
    dataset: { ...source.dataset, path: path.resolve(datasetPath), sha256: datasetSha256 },
    summary: summarizeCheckpointCases(cases),
    cases,
  };
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

export async function runScionAdapterCheckpointProbe({
  datasetPath,
  adapterDir,
  outputPath,
  label = 'checkpoint',
  maxCases = Infinity,
  generatedAt = new Date().toISOString(),
} = {}) {
  const [adapter, datasetSha256, repository] = await Promise.all([
    inspectAdapter(adapterDir),
    sha256File(datasetPath),
    repositoryReceipt(process.cwd()),
  ]);
  process.env.SCION_MODEL = SCION_GEMMA4_E2B_BASE.modelId;
  process.env.SCION_MODEL_REVISION = SCION_GEMMA4_E2B_BASE.revision;
  process.env.SCION_ADAPTERS = adapter.root;
  delete process.env.G4_ADAPTERS;
  const { sGenerate, stopS } = await import('../trellis/tendril/sModel.mjs');
  const rows = (await readJsonLines(datasetPath)).slice(0, maxCases);
  const cases = [];
  try {
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const prompt = String(row?.chosen?.[0]?.content || '');
      const probe = extractCheckpointProbePrompt(prompt);
      if (!probe.valid) throw new Error(`Dataset row ${index + 1} is not an exact one-lesson source-ledger task`);
      const split = splitProductionTrainingPrompt(prompt);
      const schema = compactLessonKernelSchemaProfile({
        expectedLessonIds: probe.expectedLessonIds,
        factCount: probe.factCount,
      }).schema;
      const startedAt = Date.now();
      const generation = await sGenerate(
        {
          system: split.system,
          user: split.user,
          task: 'items',
          maxTokens: 2400,
          temperature: 0,
          schema,
          adapterMode: 'adapter',
        },
        { timeoutMs: 1_200_000, includeMetadata: true },
      );
      const durationMs = Date.now() - startedAt;
      const rawText = String(generation?.text || '');
      const record = assessCheckpointResponse({
        row,
        response: rawText,
        prior: {
          index: index + 1,
          durationMs,
          constrained: generation?.constrained || null,
          adapterMode: generation?.adapterMode || null,
          nativeAdapterActive: generation?.nativeAdapterActive === true,
          adapterScale: Number.isFinite(Number(generation?.adapterScale)) ? Number(generation.adapterScale) : null,
        },
      });
      cases.push(record);
      process.stderr.write(
        `${label} ${index + 1}/${rows.length} ${record.domain}/${record.lessonId}: ` +
          `${record.admitted ? 'admitted' : `${record.issues.length} issue(s)`}, ${durationMs}ms\n`,
      );
    }
  } finally {
    stopS();
  }
  const report = {
    schemaVersion: 1,
    protocol: SCION_CHECKPOINT_PROBE_PROTOCOL,
    generatedAt,
    label,
    repository,
    base: SCION_GEMMA4_E2B_BASE,
    adapter,
    dataset: { path: path.resolve(datasetPath), sha256: datasetSha256, rows: rows.length },
    summary: summarizeCheckpointCases(cases),
    cases,
  };
  if (!SHA256_RE.test(datasetSha256)) throw new Error('Dataset receipt is invalid');
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      'Usage: vite-node --script scripts/scionAdapterCheckpointProbe.mjs --dataset test.jsonl --adapter-dir checkpoint --output report.json [--label checkpoint-100] [--max-cases N]\n       vite-node --script scripts/scionAdapterCheckpointProbe.mjs --dataset test.jsonl --replay-report prior.json --output replay.json',
    );
    return;
  }
  const report = args.replayReportPath
    ? await replayScionAdapterCheckpointProbe(args)
    : await runScionAdapterCheckpointProbe(args);
  console.log(JSON.stringify({ output: args.outputPath, label: report.label, summary: report.summary }, null, 2));
  if (!report.summary.promotionPreflight) process.exitCode = 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(`REFUSING: ${error?.stack || error}`);
    process.exitCode = 1;
  });
}
