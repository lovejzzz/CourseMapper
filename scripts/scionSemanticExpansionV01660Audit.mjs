#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { stableScionLessonKernelJson } from './lib/scionLessonKernelCampaign.mjs';

const GENERATED_AT = '2026-07-19T20:00:00.000Z';
const OUTPUT = 'evaluation/scion-adapters/evidence/semantic-expansion-v0.16.60';
const RECEIPT = `${OUTPUT}/receipt.json`;
const SELECTION = 'evaluation/scion-adapters/lesson-kernel-expansion-batch-v0.16.60.json';
const PRIOR_PREFERENCE_FILES = Object.freeze([
  'evaluation/scion-adapters/evidence/source-ledger-v0.16.59/training-preferences.jsonl',
  'evaluation/scion-adapters/evidence/semantic-teacher-v0.16.60/training-preferences.jsonl',
]);
const DIRECTORY_COPIES = Object.freeze([
  ['verification-output/scion-lesson-kernel-capture-v0.16.60-expansion-1', 'capture'],
  ['verification-output/scion-lesson-kernel-judge-v0.16.60-expansion-1', 'judge/direct'],
  ['verification-output/scion-lesson-kernel-teacher-revision-v8-v0.16.60-expansion-1', 'teacher/pass-1'],
  ['verification-output/scion-lesson-kernel-teacher-judge-v8-v0.16.60-expansion-1-pass-1', 'judge/teacher-pass-1'],
  ['verification-output/scion-lesson-kernel-teacher-revision-v8-v0.16.60-expansion-1-pass-2', 'teacher/pass-2'],
  ['verification-output/scion-lesson-kernel-teacher-judge-v8-v0.16.60-expansion-1-pass-2', 'judge/teacher-pass-2'],
]);
const IMPLEMENTATION_FILES = Object.freeze([
  'scripts/scionLessonKernelCapture.mjs',
  'scripts/lib/scionBatchRunnerPool.mjs',
  'scripts/lib/scionLessonKernelExpansionBatch.mjs',
  'scripts/scionLessonKernelExpansionBatchV01657.mjs',
  'scripts/lib/scionLessonKernelTeacherRevision.mjs',
  'scripts/scionLessonKernelTeacherRevisionBatches.mjs',
  'scripts/scionLessonKernelTeacherRevisionRunner.mjs',
  'scripts/scionLessonKernelJudgeBatches.mjs',
  'scripts/scionLessonKernelJudgeRunner.mjs',
  'src/lib/scionAnswerKeyAlignment.js',
  'src/lib/publicScionProvider.js',
  'evaluation/scion-adapters/lesson-kernel-teacher-revision-prompt-v8-v0.16.60.md',
]);
const EXPANSION_PREFERENCE_FILES = Object.freeze([
  'judge/direct/training-preferences.jsonl',
  'judge/teacher-pass-1/training-preferences.jsonl',
  'judge/teacher-pass-2/training-preferences.jsonl',
]);

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function sha256File(file) {
  return sha256(await fs.readFile(file));
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function readJsonl(file) {
  return (await fs.readFile(file, 'utf8'))
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map(JSON.parse);
}

async function atomicWriteJson(file, value) {
  const absolute = path.resolve(file);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  const temporary = `${absolute}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await fs.rename(temporary, absolute);
}

function uniqueRows(rows) {
  const byCase = new Map();
  for (const row of rows) {
    if (byCase.has(row.caseId)) throw new Error(`Duplicate training preference: ${row.caseId}`);
    byCase.set(row.caseId, row);
  }
  return [...byCase.values()].sort((left, right) => left.caseId.localeCompare(right.caseId));
}

async function writeJsonl(file, rows) {
  await fs.writeFile(file, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
}

async function copyEvidence(root) {
  const output = path.join(root, OUTPUT);
  await fs.rm(output, { recursive: true, force: true });
  await fs.mkdir(output, { recursive: true });
  for (const [source, destination] of DIRECTORY_COPIES) {
    await fs.cp(path.join(root, source), path.join(output, destination), { recursive: true, force: true });
  }
  const expansion = uniqueRows(
    (await Promise.all(EXPANSION_PREFERENCE_FILES.map((file) => readJsonl(path.join(output, file))))).flat(),
  );
  const prior = uniqueRows(
    (await Promise.all(PRIOR_PREFERENCE_FILES.map((file) => readJsonl(path.join(root, file))))).flat(),
  );
  await writeJsonl(path.join(output, 'training-preferences.jsonl'), expansion);
  await writeJsonl(path.join(output, 'cumulative-training-preferences.jsonl'), uniqueRows([...prior, ...expansion]));
}

async function evidenceFileHashes(root) {
  const output = path.join(root, OUTPUT);
  const files = [];
  async function visit(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (absolute !== path.join(root, RECEIPT) && !absolute.endsWith('.TASK.txt')) files.push(absolute);
    }
  }
  await visit(output);
  files.sort();
  return Object.fromEntries(
    await Promise.all(files.map(async (file) => [path.relative(output, file), await sha256File(file)])),
  );
}

function exactChosenFacts(row) {
  try {
    const chosen = JSON.parse(row.chosen);
    return (
      stableScionLessonKernelJson(chosen.lessons?.[0]?.facts || []) ===
      stableScionLessonKernelJson(row.sourceContext?.claims || [])
    );
  } catch {
    return false;
  }
}

function orderSessions(workbook) {
  return (workbook.batchResults || []).flatMap((entry) => Object.values(entry.sessions || {}));
}

export async function buildScionSemanticExpansionV01660Audit({ cwd = process.cwd() } = {}) {
  const root = path.resolve(cwd);
  const resolve = (file) => path.join(root, file);
  const [selection, local, reference, directJudge, pass1Teacher, pass1Judge, pass2Teacher, pass2Judge] =
    await Promise.all([
      readJson(resolve(SELECTION)),
      readJson(resolve(`${OUTPUT}/capture/local.json`)),
      readJson(resolve(`${OUTPUT}/capture/reference.json`)),
      readJson(resolve(`${OUTPUT}/judge/direct/paired-order-workbook-result.json`)),
      readJson(resolve(`${OUTPUT}/teacher/pass-1/teacher-report.json`)),
      readJson(resolve(`${OUTPUT}/judge/teacher-pass-1/paired-order-workbook-result.json`)),
      readJson(resolve(`${OUTPUT}/teacher/pass-2/teacher-report.json`)),
      readJson(resolve(`${OUTPUT}/judge/teacher-pass-2/paired-order-workbook-result.json`)),
    ]);
  const [expansionRows, cumulativeRows, implementation, files] = await Promise.all([
    readJsonl(resolve(`${OUTPUT}/training-preferences.jsonl`)),
    readJsonl(resolve(`${OUTPUT}/cumulative-training-preferences.jsonl`)),
    Promise.all(IMPLEMENTATION_FILES.map(async (file) => [file, await sha256File(resolve(file))])),
    evidenceFileHashes(root),
  ]);
  const judgeReports = [directJudge, pass1Judge, pass2Judge];
  const sessions = judgeReports.flatMap(orderSessions);
  const expansionCaseIds = new Set(expansionRows.map((row) => row.caseId));
  const cumulativeCaseIds = new Set(cumulativeRows.map((row) => row.caseId));
  const assertions = {
    balancedSelection:
      selection.summary?.cases === 14 &&
      selection.summary?.courseGroups === 14 &&
      Object.values(selection.summary?.domains || {}).every((count) => count === 2) &&
      selection.summary?.allFailureFamiliesCovered === true,
    frozenCapture:
      local.calls?.length === 14 &&
      reference.calls?.length === 14 &&
      local.model?.id === 'google/gemma-4-E2B-it-qat-q4_0-unquantized' &&
      local.model?.route === 'mlx-vlm-base-only' &&
      local.calls.every((call) => call.attempts?.every((attempt) => attempt.receipt?.adapterActive === false)),
    selectiveAdmission:
      local.calls.filter((call) => call.admission?.needsRetry === false).length === 1 &&
      reference.calls.filter((call) => call.admission?.needsRetry === false).length === 8,
    directJudge:
      directJudge.status === 'paired-orders-complete' &&
      directJudge.summary?.pairs === 14 &&
      directJudge.summary?.referenceWins === 13 &&
      directJudge.summary?.unstable === 1 &&
      directJudge.summary?.stablePreferences === 7,
    targetedRepair:
      pass1Teacher.summary?.cases === 6 &&
      pass1Teacher.summary?.compilerAdmitted === 3 &&
      pass1Teacher.summary?.compilerRejected === 3 &&
      pass2Teacher.summary?.cases === 3 &&
      pass2Teacher.summary?.compilerAdmitted === 3 &&
      pass2Teacher.summary?.compilerRejected === 0,
    repairedJudgment:
      pass1Judge.summary?.pairs === 3 &&
      pass1Judge.summary?.stablePreferences === 3 &&
      pass2Judge.summary?.pairs === 3 &&
      pass2Judge.summary?.stablePreferences === 3,
    independentOrderSessions: sessions.length === 12 && new Set(sessions).size === 12 && sessions.every(Boolean),
    thirteenQualifiedRows:
      expansionRows.length === 13 &&
      expansionCaseIds.size === 13 &&
      expansionRows.every(
        (row) =>
          row.trainingEligible === true &&
          row.preferenceEvidence?.stable === true &&
          row.preferenceEvidence?.scoreQualification?.qualified === true &&
          row.preferenceEvidence.scoreQualification.winnerCriticalDefects.length === 0 &&
          exactChosenFacts(row),
      ),
    unstableQuarantined:
      !expansionCaseIds.has('scion-kernel-25bc83b68703532aa5564e43') && directJudge.summary?.unstable === 1,
    twentyRowRuler:
      cumulativeRows.length === 20 &&
      cumulativeCaseIds.size === 20 &&
      new Set(cumulativeRows.map((row) => row.domain)).size === 7,
  };
  const failures = Object.entries(assertions)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  if (failures.length) throw new Error(`Scion v0.16.60 semantic-expansion audit failed: ${failures.join(', ')}`);

  const report = {
    schemaVersion: 1,
    protocol: 'scion-source-grounded-semantic-expansion-evidence-v1',
    release: 'v0.16.60',
    generatedAt: GENERATED_AT,
    status: 'twenty-qualified-full-lesson-preferences',
    implementation: Object.fromEntries(implementation),
    evidenceFiles: files,
    selection: {
      path: SELECTION,
      identitySha256: selection.identity.sha256,
      cases: selection.summary.cases,
      domains: selection.summary.domains,
      courseGroups: selection.summary.courseGroups,
      allFailureFamiliesCovered: selection.summary.allFailureFamiliesCovered,
    },
    capture: {
      local: {
        calls: local.calls.length,
        admitted: local.calls.filter((call) => call.admission.needsRetry === false).length,
        retained: local.calls.filter((call) => call.admission.needsRetry === true).length,
        retries: local.calls.reduce((sum, call) => sum + Math.max(0, call.attempts.length - 1), 0),
        durationMs: local.calls.reduce((sum, call) => sum + Number(call.durationMs || 0), 0),
        adapterActive: false,
      },
      reference: {
        calls: reference.calls.length,
        admitted: reference.calls.filter((call) => call.admission.needsRetry === false).length,
        retained: reference.calls.filter((call) => call.admission.needsRetry === true).length,
        retries: reference.calls.reduce((sum, call) => sum + Math.max(0, call.attempts.length - 1), 0),
        durationMs: reference.calls.reduce((sum, call) => sum + Number(call.durationMs || 0), 0),
        concurrency: 4,
      },
    },
    evaluation: {
      directQualified: 7,
      firstRepairQualified: 3,
      secondRepairQualified: 3,
      expansionQualified: expansionRows.length,
      quarantinedOrderUnstable: 1,
      judgeOrderSessions: sessions.length,
      winnerCriticalDefects: expansionRows.reduce(
        (sum, row) => sum + row.preferenceEvidence.scoreQualification.winnerCriticalDefects.length,
        0,
      ),
    },
    trainingPreferences: {
      priorQualifiedRows: cumulativeRows.length - expansionRows.length,
      expansionQualifiedRows: expansionRows.length,
      cumulativeQualifiedRows: cumulativeRows.length,
      targetRows: 100,
      progressPercent: 20,
      domains: [...new Set(cumulativeRows.map((row) => row.domain))].sort(),
      exactSourceLedgerPreserved: cumulativeRows.every(exactChosenFacts),
      expansionCaseIds: [...expansionCaseIds].sort(),
    },
    efficiency: {
      referenceCaptureConcurrency: 4,
      atomicCheckpointWrites: true,
      teacherCallsLimitedToStableIneligibleWinners: true,
      unstablePairsExcludedWithoutRepairSpend: true,
    },
    assertions,
    claimBoundary:
      'These are source-constrained same-identity model-teacher and model-judge preferences from separate isolated sessions with reversed-order controls. They are not human, instructor, classroom, independent-judge, held-out-adapter, production-win, or model-weight-improvement evidence. The public Gemma 4 E2B base remained unmodified and no Scion adapter was trained or active.',
  };
  report.identity = {
    algorithm: 'sha256-canonical-json',
    sha256: sha256(stableScionLessonKernelJson(report)),
  };
  return report;
}

export async function runScionSemanticExpansionV01660Audit({ build = false, cwd = process.cwd() } = {}) {
  const root = path.resolve(cwd);
  if (build) await copyEvidence(root);
  const report = await buildScionSemanticExpansionV01660Audit({ cwd: root });
  const receipt = path.join(root, RECEIPT);
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (build) await atomicWriteJson(receipt, report);
  else if ((await fs.readFile(receipt, 'utf8')) !== serialized) {
    throw new Error('Tracked v0.16.60 semantic-expansion receipt is stale');
  }
  return { report, receipt };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if ([...args].some((arg) => !['--build', '--audit'].includes(arg))) {
    throw new Error('Unknown semantic-expansion audit option');
  }
  const result = await runScionSemanticExpansionV01660Audit({ build: args.has('--build') });
  console.log(
    `Scion semantic expansion: ${result.report.trainingPreferences.expansionQualifiedRows}/14 new rows; ${result.report.trainingPreferences.cumulativeQualifiedRows}/100 cumulative.`,
  );
  console.log(`Verified: ${path.relative(process.cwd(), result.receipt)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}
