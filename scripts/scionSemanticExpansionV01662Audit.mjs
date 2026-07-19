#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { stableScionLessonKernelJson } from './lib/scionLessonKernelCampaign.mjs';

const GENERATED_AT = '2026-07-19T22:40:00.000Z';
const OUTPUT = 'evaluation/scion-adapters/evidence/semantic-expansion-v0.16.62';
const RECEIPT = `${OUTPUT}/receipt.json`;
const SELECTION = 'evaluation/scion-adapters/lesson-kernel-expansion-batch-v0.16.62.json';
const PRIOR_PREFERENCE_FILE =
  'evaluation/scion-adapters/evidence/semantic-expansion-v0.16.61/cumulative-training-preferences.jsonl';
const DIRECTORY_COPIES = Object.freeze([
  ['verification-output/scion-lesson-kernel-capture-v0.16.62-expansion-3', 'capture'],
  ['verification-output/scion-lesson-kernel-judge-v0.16.62-expansion-3', 'judge/direct'],
  ['verification-output/scion-lesson-kernel-teacher-revision-v8-v0.16.62-expansion-3-pass-1', 'teacher/pass-1'],
  ['verification-output/scion-lesson-kernel-teacher-judge-v8-v0.16.62-expansion-3-pass-1', 'judge/teacher-pass-1'],
  ['verification-output/scion-lesson-kernel-teacher-revision-v8-v0.16.62-expansion-3-pass-2', 'teacher/pass-2'],
  ['verification-output/scion-lesson-kernel-teacher-judge-v8-v0.16.62-expansion-3-pass-2', 'judge/teacher-pass-2'],
  [
    'verification-output/scion-lesson-kernel-teacher-revision-v8-v0.16.62-expansion-3-pass-3',
    'teacher/notation-diagnostic',
  ],
  [
    'verification-output/scion-lesson-kernel-teacher-revision-v8-v0.16.62-expansion-3-judge-repair',
    'teacher/economics-quarantined',
  ],
]);
const IMPLEMENTATION_FILES = Object.freeze([
  'scripts/scionLessonKernelCapture.mjs',
  'scripts/lib/scionBatchRunnerPool.mjs',
  'scripts/lib/scionLessonKernelExpansionBatchV3.mjs',
  'scripts/scionLessonKernelExpansionBatchV01662.mjs',
  'scripts/lib/scionLessonKernelTeacherRevision.mjs',
  'scripts/scionLessonKernelTeacherRevisionBatches.mjs',
  'scripts/scionLessonKernelTeacherRevisionRunner.mjs',
  'scripts/scionLessonKernelTeacherReportMerge.mjs',
  'scripts/scionLessonKernelAdmissionReplay.mjs',
  'scripts/scionLessonKernelJudgeBatches.mjs',
  'scripts/scionLessonKernelJudgeRunner.mjs',
  'src/lib/scionAnswerKeyAlignment.js',
  'src/lib/scionKeyTermContract.js',
  'src/lib/scionPreferenceGate.js',
  'src/lib/publicScionProvider.js',
  'src/lib/scenarioContract.js',
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
  const prior = uniqueRows(await readJsonl(path.join(root, PRIOR_PREFERENCE_FILE)));
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

function teacherSessions(report) {
  return (report.calls || []).map((call) => call.revisionEvidence?.sessionId).filter(Boolean);
}

export async function buildScionSemanticExpansionV01662Audit({ cwd = process.cwd() } = {}) {
  const root = path.resolve(cwd);
  const resolve = (file) => path.join(root, file);
  const [
    selection,
    local,
    reference,
    localReplay,
    referenceReplay,
    directJudge,
    pass1Teacher,
    pass1Judge,
    pass2Teacher,
    pass2Judge,
    notationDiagnostic,
    quarantinedTeacher,
  ] = await Promise.all([
    readJson(resolve(SELECTION)),
    readJson(resolve(`${OUTPUT}/capture/local.json`)),
    readJson(resolve(`${OUTPUT}/capture/reference.json`)),
    readJson(resolve(`${OUTPUT}/capture/local-current-replay.json`)),
    readJson(resolve(`${OUTPUT}/capture/reference-current-replay.json`)),
    readJson(resolve(`${OUTPUT}/judge/direct/paired-order-workbook-result.json`)),
    readJson(resolve(`${OUTPUT}/teacher/pass-1/teacher-report.json`)),
    readJson(resolve(`${OUTPUT}/judge/teacher-pass-1/paired-order-workbook-result.json`)),
    readJson(resolve(`${OUTPUT}/teacher/pass-2/teacher-report.json`)),
    readJson(resolve(`${OUTPUT}/judge/teacher-pass-2/paired-order-workbook-result.json`)),
    readJson(resolve(`${OUTPUT}/teacher/notation-diagnostic/teacher-report.json`)),
    readJson(resolve(`${OUTPUT}/teacher/economics-quarantined/teacher-report.json`)),
  ]);
  const [expansionRows, cumulativeRows, implementation, files] = await Promise.all([
    readJsonl(resolve(`${OUTPUT}/training-preferences.jsonl`)),
    readJsonl(resolve(`${OUTPUT}/cumulative-training-preferences.jsonl`)),
    Promise.all(IMPLEMENTATION_FILES.map(async (file) => [file, await sha256File(resolve(file))])),
    evidenceFileHashes(root),
  ]);
  const judgeReports = [directJudge, pass1Judge, pass2Judge];
  const judgeSessions = judgeReports.flatMap(orderSessions);
  const revisionSessions = [pass1Teacher, pass2Teacher, notationDiagnostic, quarantinedTeacher].flatMap(
    teacherSessions,
  );
  const expansionCaseIds = new Set(expansionRows.map((row) => row.caseId));
  const cumulativeCaseIds = new Set(cumulativeRows.map((row) => row.caseId));
  const selectedCaseIds = new Set(selection.cases.map((entry) => entry.caseId));
  const quarantinedCaseId = quarantinedTeacher.calls?.[0]?.caseId;
  const resolvedCaseIds = new Set([...expansionCaseIds, quarantinedCaseId].filter(Boolean));
  const assertions = {
    capacityAwareSelection:
      selection.summary?.batch?.cases === 56 &&
      selection.summary?.batch?.courseGroups === 20 &&
      selection.summary?.batch?.sourceKernels === 51 &&
      selection.summary?.batch?.newSourceKernels === 25 &&
      Object.keys(selection.summary?.batch?.domains || {}).length === 7 &&
      selection.summary?.batch?.allFailureFamiliesCovered === true,
    completeCampaignSurface:
      selection.summary?.cumulativeSelectedCampaignSurface?.cases === 105 &&
      selection.summary?.cumulativeSelectedCampaignSurface?.courseGroups === 25 &&
      selection.summary?.cumulativeSelectedCampaignSurface?.sourceKernels === 72,
    frozenCapture:
      local.calls?.length === 56 &&
      reference.calls?.length === 56 &&
      local.model?.id === 'google/gemma-4-E2B-it-qat-q4_0-unquantized' &&
      local.model?.revision === '1ca4dd94b623b6e0dd9da00c2239ab84b4f3e5ce' &&
      local.model?.route === 'mlx-vlm-base-only' &&
      local.calls.every((call) => call.attempts?.every((attempt) => attempt.receipt?.adapterActive === false)),
    currentCompilerReplay:
      localReplay.summary?.replayAdmitted === 5 &&
      localReplay.summary?.replayRejected === 51 &&
      referenceReplay.summary?.replayAdmitted === 52 &&
      referenceReplay.summary?.replayRejected === 4 &&
      referenceReplay.summary?.addedIssueCases === 0,
    directJudge:
      directJudge.status === 'paired-orders-complete' &&
      directJudge.summary?.pairs === 56 &&
      directJudge.summary?.referenceWins === 56 &&
      directJudge.summary?.localWins === 0 &&
      directJudge.summary?.unstable === 0 &&
      directJudge.summary?.stablePreferences === 46,
    targetedRepair:
      pass1Teacher.summary?.cases === 11 &&
      pass1Teacher.summary?.compilerAdmitted === 7 &&
      pass1Teacher.summary?.compilerRejected === 4 &&
      pass2Teacher.summary?.cases === 4 &&
      pass2Teacher.summary?.compilerAdmitted === 3 &&
      pass2Teacher.summary?.compilerRejected === 1 &&
      notationDiagnostic.summary?.cases === 1 &&
      quarantinedTeacher.summary?.cases === 1 &&
      quarantinedTeacher.summary?.compilerRejected === 1,
    repairedJudgment:
      pass1Judge.summary?.pairs === 7 &&
      pass1Judge.summary?.referenceWins === 7 &&
      pass1Judge.summary?.stablePreferences === 7 &&
      pass2Judge.summary?.pairs === 3 &&
      pass2Judge.summary?.referenceWins === 3 &&
      pass2Judge.summary?.stablePreferences === 2,
    independentSessions:
      judgeSessions.length === 26 &&
      new Set(judgeSessions).size === 26 &&
      judgeSessions.every(Boolean) &&
      revisionSessions.length === 17 &&
      new Set(revisionSessions).size === 17,
    fiftyFiveQualifiedRows:
      expansionRows.length === 55 &&
      expansionCaseIds.size === 55 &&
      expansionRows.every(
        (row) =>
          row.trainingEligible === true &&
          row.preferenceEvidence?.stable === true &&
          row.preferenceEvidence?.scoreQualification?.qualified === true &&
          row.preferenceEvidence.scoreQualification.winnerCriticalDefects.length === 0 &&
          exactChosenFacts(row),
      ),
    oneCaseQuarantined:
      Boolean(quarantinedCaseId) &&
      !expansionCaseIds.has(quarantinedCaseId) &&
      selectedCaseIds.size === 56 &&
      resolvedCaseIds.size === 56 &&
      [...selectedCaseIds].every((caseId) => resolvedCaseIds.has(caseId)),
    oneHundredTwoRowRuler:
      cumulativeRows.length === 102 &&
      cumulativeCaseIds.size === 102 &&
      new Set(cumulativeRows.map((row) => row.domain)).size === 7 &&
      cumulativeRows.every(exactChosenFacts),
  };
  const failures = Object.entries(assertions)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  if (failures.length) throw new Error(`Scion v0.16.62 semantic-expansion audit failed: ${failures.join(', ')}`);

  const report = {
    schemaVersion: 1,
    protocol: 'scion-source-grounded-semantic-expansion-evidence-v3',
    release: 'v0.16.62',
    generatedAt: GENERATED_AT,
    status: 'one-hundred-two-qualified-full-lesson-preferences',
    implementation: Object.fromEntries(implementation),
    evidenceFiles: files,
    selection: {
      path: SELECTION,
      identitySha256: selection.identity.sha256,
      cases: selection.summary.batch.cases,
      domains: selection.summary.batch.domains,
      courseGroups: selection.summary.batch.courseGroups,
      sourceKernels: selection.summary.batch.sourceKernels,
      newSourceKernels: selection.summary.batch.newSourceKernels,
      allFailureFamiliesCovered: selection.summary.batch.allFailureFamiliesCovered,
      cumulativeSurface: selection.summary.cumulativeSelectedCampaignSurface,
    },
    capture: {
      local: {
        calls: local.calls.length,
        admittedAtCapture: local.calls.filter((call) => call.admission.needsRetry === false).length,
        admittedByCurrentCompiler: localReplay.summary.replayAdmitted,
        retries: local.calls.reduce((sum, call) => sum + Math.max(0, call.attempts.length - 1), 0),
        durationMs: local.calls.reduce((sum, call) => sum + Number(call.durationMs || 0), 0),
        adapterActive: false,
      },
      reference: {
        calls: reference.calls.length,
        admittedAtCapture: reference.calls.filter((call) => call.admission.needsRetry === false).length,
        admittedByCurrentCompiler: referenceReplay.summary.replayAdmitted,
        retries: reference.calls.reduce((sum, call) => sum + Math.max(0, call.attempts.length - 1), 0),
        durationMs: reference.calls.reduce((sum, call) => sum + Number(call.durationMs || 0), 0),
        concurrency: 4,
      },
    },
    evaluation: {
      directPairs: directJudge.summary.pairs,
      directReferenceWins: directJudge.summary.referenceWins,
      directQualified: directJudge.summary.stablePreferences,
      firstRepairQualified: pass1Judge.summary.stablePreferences,
      secondRepairQualified: pass2Judge.summary.stablePreferences,
      expansionQualified: expansionRows.length,
      quarantinedCases: 1,
      judgeOrderSessions: judgeSessions.length,
      teacherRevisionSessions: revisionSessions.length,
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
      progressPercent: 102,
      domains: [...new Set(cumulativeRows.map((row) => row.domain))].sort(),
      exactSourceLedgerPreserved: cumulativeRows.every(exactChosenFacts),
      expansionCaseIds: [...expansionCaseIds].sort(),
      quarantinedCaseIds: [quarantinedCaseId],
    },
    compilerDiscovery: {
      issue: 'notation-omitted-from-scenario-evidence-kinds',
      regression: 'two named notations now satisfy the inspectable-evidence contract',
      referenceReplayBefore: 51,
      referenceReplayAfter: referenceReplay.summary.replayAdmitted,
      directQualifiedBefore: 45,
      directQualifiedAfter: directJudge.summary.stablePreferences,
    },
    efficiency: {
      referenceCaptureConcurrency: 4,
      atomicCheckpointWrites: true,
      capacityAwareSelector: true,
      reversedOrderJudgeBatches: true,
      teacherCallsLimitedToUnqualifiedReferenceWinners: true,
      unresolvedRepairQuarantinedWithoutJudgeSpend: true,
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

export async function runScionSemanticExpansionV01662Audit({ build = false, cwd = process.cwd() } = {}) {
  const root = path.resolve(cwd);
  if (build) await copyEvidence(root);
  const report = await buildScionSemanticExpansionV01662Audit({ cwd: root });
  const receipt = path.join(root, RECEIPT);
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (build) await atomicWriteJson(receipt, report);
  else if ((await fs.readFile(receipt, 'utf8')) !== serialized) {
    throw new Error('Tracked v0.16.62 semantic-expansion receipt is stale');
  }
  return { report, receipt };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if ([...args].some((arg) => !['--build', '--audit'].includes(arg))) {
    throw new Error('Unknown semantic-expansion audit option');
  }
  const result = await runScionSemanticExpansionV01662Audit({ build: args.has('--build') });
  console.log(
    `Scion semantic expansion: ${result.report.trainingPreferences.expansionQualifiedRows}/56 new rows; ${result.report.trainingPreferences.cumulativeQualifiedRows}/100 cumulative.`,
  );
  console.log(`Verified: ${path.relative(process.cwd(), result.receipt)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}
