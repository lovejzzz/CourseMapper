#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { stableScionLessonKernelJson } from './lib/scionLessonKernelCampaign.mjs';

const GENERATED_AT = '2026-07-19T18:40:00.000Z';
const CAMPAIGN = 'evaluation/scion-adapters/lesson-kernel-campaign-v0.16.59.json';
const PRIOR_PREFERENCES = 'evaluation/scion-adapters/evidence/source-ledger-v0.16.59/training-preferences.jsonl';
const OUTPUT = 'evaluation/scion-adapters/evidence/semantic-teacher-v0.16.60';
const RECEIPT = `${OUTPUT}/receipt.json`;
const DIRECTORY_COPIES = Object.freeze([
  ['verification-output/scion-lesson-kernel-teacher-revision-v7-v0.16.60-batch-1', 'teacher/v7-batch-1'],
  ['verification-output/scion-lesson-kernel-teacher-revision-v7-v0.16.60-batch-2', 'teacher/v7-batch-2'],
  ['verification-output/scion-lesson-kernel-teacher-revision-v8-v0.16.60', 'teacher/v8-geology'],
  ['verification-output/scion-lesson-kernel-teacher-judge-v7-v0.16.60-batch-1', 'judge/v7-batch-1'],
  ['verification-output/scion-lesson-kernel-teacher-judge-v7-v0.16.60-batch-2', 'judge/v7-batch-2'],
  ['verification-output/scion-lesson-kernel-teacher-judge-v8-v0.16.60', 'judge/v8-geology'],
  ['verification-output/scion-source-ledger-v0.16.60', 'local-replay'],
]);
const IMPLEMENTATION_FILES = Object.freeze([
  'scripts/lib/scionLessonKernelTeacherRevision.mjs',
  'scripts/scionLessonKernelTeacherRevisionBatches.mjs',
  'scripts/scionLessonKernelTeacherRevisionRunner.mjs',
  'scripts/scionLessonKernelJudgeBatches.mjs',
  'scripts/scionLessonKernelJudgeRunner.mjs',
  'src/lib/scionAnswerKeyAlignment.js',
  'src/lib/publicScionProvider.js',
  'evaluation/scion-adapters/lesson-kernel-teacher-revision-prompt-v7-v0.16.59.md',
  'evaluation/scion-adapters/lesson-kernel-teacher-revision-prompt-v8-v0.16.60.md',
  'evaluation/scion-adapters/lesson-kernel-judge-prompt-v0.16.54.md',
]);
const JUDGE_GROUPS = Object.freeze(['v7-batch-1', 'v7-batch-2', 'v8-geology']);
const TEACHER_GROUPS = Object.freeze(['v7-batch-1', 'v7-batch-2', 'v8-geology']);

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

async function copyEvidence(root) {
  const output = path.join(root, OUTPUT);
  await fs.rm(output, { recursive: true, force: true });
  await fs.mkdir(output, { recursive: true });
  for (const [source, destination] of DIRECTORY_COPIES) {
    await fs.cp(path.join(root, source), path.join(output, destination), { recursive: true, force: true });
  }
  const preferences = (
    await Promise.all(
      JUDGE_GROUPS.map((group) => readJsonl(path.join(output, 'judge', group, 'training-preferences.jsonl'))),
    )
  ).flat();
  await fs.writeFile(
    path.join(output, 'training-preferences.jsonl'),
    `${preferences.map((row) => JSON.stringify(row)).join('\n')}\n`,
  );
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

async function pairedResults(root, group, workbook) {
  const base = path.join(root, OUTPUT, 'judge', group, 'batches');
  return (
    await Promise.all(
      (workbook.batchResults || []).map((entry) =>
        readJson(path.join(base, entry.batchId, 'paired-order-result.json')),
      ),
    )
  ).flatMap((aggregate) => aggregate.results || []);
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

function judgeMetrics(rows) {
  const orderScores = rows.flatMap((row) => row.preferenceEvidence.scoreQualification.orders || []);
  const dimensions = [
    'sourceFidelity',
    'knowledgePrecision',
    'scenarioReadiness',
    'assessmentCorrectness',
    'choiceDiscriminability',
    'feedbackInstructionality',
    'internalCoherence',
  ];
  return Object.fromEntries(
    dimensions.map((dimension) => [
      dimension,
      Number(
        (
          orderScores.reduce((sum, order) => sum + Number(order.winnerScores?.[dimension] || 0), 0) /
          Math.max(1, orderScores.length)
        ).toFixed(2),
      ),
    ]),
  );
}

export async function buildScionSemanticTeacherV01660Audit({ cwd = process.cwd() } = {}) {
  const root = path.resolve(cwd);
  const [campaign, priorRows, newRows, implementation, files, teacherReports, judgeWorkbooks] = await Promise.all([
    readJson(path.join(root, CAMPAIGN)),
    readJsonl(path.join(root, PRIOR_PREFERENCES)),
    readJsonl(path.join(root, OUTPUT, 'training-preferences.jsonl')),
    Promise.all(IMPLEMENTATION_FILES.map(async (file) => [file, await sha256File(path.join(root, file))])),
    evidenceFileHashes(root),
    Promise.all(
      TEACHER_GROUPS.map((group) => readJson(path.join(root, OUTPUT, 'teacher', group, 'teacher-report.json'))),
    ),
    Promise.all(
      JUDGE_GROUPS.map((group) =>
        readJson(path.join(root, OUTPUT, 'judge', group, 'paired-order-workbook-result.json')),
      ),
    ),
  ]);
  const groupedResults = await Promise.all(
    JUDGE_GROUPS.map((group, index) => pairedResults(root, group, judgeWorkbooks[index])),
  );
  const judgedResults = groupedResults.flat();
  const priorCaseIds = new Set(priorRows.map((row) => row.caseId));
  const newCaseIds = new Set(newRows.map((row) => row.caseId));
  const cumulativeCaseIds = new Set([...priorCaseIds, ...newCaseIds]);
  const campaignById = new Map(campaign.cases.map((entry) => [entry.caseId, entry]));
  const domains = [...new Set([...cumulativeCaseIds].map((caseId) => campaignById.get(caseId)?.domain))].sort();
  const teacherSessions = teacherReports.flatMap((report) =>
    (report.calls || []).map((call) => call.revisionEvidence?.sessionId),
  );
  const judgeSessions = judgeWorkbooks.flatMap((workbook) =>
    (workbook.batchResults || []).flatMap((entry) => Object.values(entry.sessions || {})),
  );
  const v7Results = [...groupedResults[0], ...groupedResults[1]];
  const v8Results = groupedResults[2];
  const localReplayCalls = (
    await Promise.all(
      [1, 2].map((number) =>
        readJson(path.join(root, OUTPUT, 'local-replay', `batch-${number}`, 'local-current-replay.json')),
      ),
    )
  ).flatMap((report) => report.calls || []);
  const assertions = {
    campaignIdentity:
      campaign.identity?.sha256 === '6a5a6bb8679b012986f068bfbf599b87e1ed99cc21cfe308f9df19db677b57b0' &&
      teacherReports.every((report) => report.campaignIdentity?.sha256 === campaign.identity.sha256) &&
      judgeWorkbooks.every((report) => report.campaignIdentity?.sha256 === campaign.identity.sha256),
    sourceCleanroomSessions:
      teacherSessions.length === 6 && new Set(teacherSessions).size === 6 && teacherSessions.every(Boolean),
    pairedOrderSessions:
      judgeSessions.length === 6 && new Set(judgeSessions).size === 6 && judgeSessions.every(Boolean),
    compilerAdmission:
      teacherReports.reduce((sum, report) => sum + report.summary.compilerAdmitted, 0) === 6 &&
      teacherReports.every((report) => report.summary.compilerRejected === 0),
    firstPassSelectivity:
      v7Results.length === 5 &&
      v7Results.every((result) => result.stable && result.stableWinner === 'reference') &&
      v7Results.filter((result) => result.trainingEligible).length === 4 &&
      v7Results.filter((result) => !result.trainingEligible).length === 1,
    targetedSecondPass:
      v8Results.length === 1 &&
      v8Results[0].caseId === 'scion-kernel-018581469357c98b43195802' &&
      v8Results[0].trainingEligible === true,
    fiveQualifiedRows:
      newRows.length === 5 &&
      newCaseIds.size === 5 &&
      newRows.every(
        (row) =>
          row.trainingEligible === true &&
          row.preferenceEvidence?.stable === true &&
          row.preferenceEvidence?.scoreQualification?.qualified === true &&
          row.preferenceEvidence.scoreQualification.winnerCriticalDefects.length === 0 &&
          exactChosenFacts(row),
      ),
    sevenDomainCumulativeRuler: priorRows.length === 2 && cumulativeCaseIds.size === 7 && domains.length === 7,
    frozenBaseRemainsRejected:
      localReplayCalls.length === 7 && localReplayCalls.every((call) => call.admission?.needsRetry === true),
  };
  const failures = Object.entries(assertions)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  if (failures.length) throw new Error(`Scion v0.16.60 semantic-teacher audit failed: ${failures.join(', ')}`);

  const report = {
    schemaVersion: 1,
    protocol: 'scion-source-grounded-semantic-teacher-evidence-v1',
    release: 'v0.16.60',
    generatedAt: GENERATED_AT,
    status: 'five-new-score-qualified-full-lesson-preferences',
    implementation: Object.fromEntries(implementation),
    evidenceFiles: files,
    campaign: {
      path: CAMPAIGN,
      identitySha256: campaign.identity.sha256,
      cases: campaign.cases.length,
      courseGroups: new Set(campaign.cases.map((entry) => entry.courseGroupId)).size,
      domains: new Set(campaign.cases.map((entry) => entry.domain)).size,
    },
    revisionLane: {
      model: teacherReports[0].reviser,
      isolatedSessions: teacherSessions.length,
      authoredCandidates: teacherReports.reduce((sum, report) => sum + report.summary.cases, 0),
      compilerAdmitted: teacherReports.reduce((sum, report) => sum + report.summary.compilerAdmitted, 0),
      firstPassQualified: 4,
      targetedSecondPassQualified: 1,
    },
    pairedJudge: {
      model: judgeWorkbooks[0].judge,
      isolatedOrderSessions: judgeSessions.length,
      stableReferenceWins: judgedResults.filter((result) => result.stable && result.stableWinner === 'reference')
        .length,
      scoreQualifiedRows: newRows.length,
      winnerScoreAverages: judgeMetrics(newRows),
      minimumWinnerScore: Math.min(
        ...newRows.flatMap((row) =>
          row.preferenceEvidence.scoreQualification.orders.map((order) => order.winnerMinimumScore),
        ),
      ),
      minimumTotalScoreMargin: Math.min(
        ...newRows.flatMap((row) =>
          row.preferenceEvidence.scoreQualification.orders.map((order) => order.totalScoreMargin),
        ),
      ),
      winnerCriticalDefects: newRows.reduce(
        (sum, row) => sum + row.preferenceEvidence.scoreQualification.winnerCriticalDefects.length,
        0,
      ),
    },
    trainingPreferences: {
      priorQualifiedRows: priorRows.length,
      newQualifiedRows: newRows.length,
      cumulativeQualifiedRows: cumulativeCaseIds.size,
      cumulativeDomains: domains,
      newCaseIds: [...newCaseIds].sort(),
      exactSourceLedgerPreserved: newRows.every(exactChosenFacts),
    },
    compilerFinding: {
      issue:
        'Negated inverse comparisons and scattered relation vocabulary could be misread as two affirmatively supported options.',
      resolution:
        'Negative reversal clauses are excluded and non-exact lexical support now requires ordered semantic-token coverage.',
      trueDualAnswerRegressionStillDetected: true,
    },
    assertions,
    claimBoundary:
      'These are source-constrained teacher candidates and same-identity model-judge preferences from separate isolated sessions across both A/B orders. They are not human, instructor, classroom, independent-judge, held-out-adapter, production-win, or model-weight-improvement evidence. The public Gemma 4 E2B base remains unchanged and no Scion adapter is trained or active.',
  };
  report.identity = {
    algorithm: 'sha256-canonical-json',
    sha256: sha256(stableScionLessonKernelJson(report)),
  };
  return report;
}

export async function runScionSemanticTeacherV01660Audit({ build = false, cwd = process.cwd() } = {}) {
  const root = path.resolve(cwd);
  if (build) await copyEvidence(root);
  const report = await buildScionSemanticTeacherV01660Audit({ cwd: root });
  const receipt = path.join(root, RECEIPT);
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (build) await atomicWriteJson(receipt, report);
  else if ((await fs.readFile(receipt, 'utf8')) !== serialized) {
    throw new Error('Tracked v0.16.60 semantic-teacher receipt is stale');
  }
  return { report, receipt };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if ([...args].some((arg) => !['--build', '--audit'].includes(arg))) {
    throw new Error('Unknown semantic-teacher audit option');
  }
  const result = await runScionSemanticTeacherV01660Audit({ build: args.has('--build') });
  console.log(
    `Scion semantic teacher: ${result.report.trainingPreferences.newQualifiedRows}/5 new qualified rows; ${result.report.trainingPreferences.cumulativeQualifiedRows} cumulative.`,
  );
  console.log(`Verified: ${path.relative(process.cwd(), result.receipt)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}
