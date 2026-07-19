#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { buildScionSemanticAdmissionV01655Audit } from './scionSemanticAdmissionV01655Audit.mjs';
import { replayScionLessonKernelAdmissionReport } from './lib/scionLessonKernelAdmissionReplay.mjs';
import { stableScionLessonKernelJson } from './lib/scionLessonKernelCampaign.mjs';
import { scionLessonKernelSha256 } from './lib/scionLessonKernelCampaign.mjs';

const GENERATED_AT = '2026-07-19T16:30:00.000Z';
const CAMPAIGN = 'evaluation/scion-adapters/lesson-kernel-campaign-v0.16.59.json';
const OUTPUT = 'evaluation/scion-adapters/evidence/source-ledger-v0.16.59';
const RECEIPT = `${OUTPUT}/receipt.json`;
const FILE_COPIES = Object.freeze([
  ['verification-output/scion-lesson-kernel-capture-v0.16.59-cli-pilot/reference.json', 'pilot/legacy-reference.json'],
  [
    'verification-output/scion-lesson-kernel-capture-v0.16.59-ledger-pilot/reference.json',
    'pilot/source-ledger-reference.json',
  ],
  ['verification-output/scion-lesson-kernel-capture-v0.16.59-cross-domain/local.json', 'batch-1/local-capture.json'],
  [
    'verification-output/scion-lesson-kernel-capture-v0.16.59-cross-domain/reference.json',
    'batch-1/reference-capture.json',
  ],
  ['verification-output/scion-lesson-kernel-capture-v0.16.59-cross-domain-2/local.json', 'batch-2/local-capture.json'],
  [
    'verification-output/scion-lesson-kernel-capture-v0.16.59-cross-domain-2/reference.json',
    'batch-2/reference-capture.json',
  ],
]);
const DIR_COPIES = Object.freeze([
  ['verification-output/scion-lesson-kernel-judge-v0.16.59-cross-domain', 'batch-1/judge'],
  ['verification-output/scion-lesson-kernel-judge-v0.16.59-cross-domain-2', 'batch-2/judge'],
]);
const IMPLEMENTATION_FILES = Object.freeze([
  'scripts/lib/scionLessonKernelCampaign.mjs',
  'scripts/scionLessonKernelCapture.mjs',
  'scripts/scionLessonKernelAdmissionReplay.mjs',
  'src/lib/scionEvidenceContract.js',
  'src/lib/scionContracts.js',
  'src/lib/scionLocalProvider.js',
  'src/lib/scionPassB.js',
  'src/lib/publicScionProvider.js',
  'src/lib/scionAnswerKeyAlignment.js',
  'src/lib/scionKeyTermContract.js',
  'src/lib/scenarioContract.js',
  'src/lib/itemAdmissionLint.js',
  'src/lib/blueprintEnrichmentPass.js',
  'src/lib/courseBlueprintCompiler.js',
  'src/hooks/useDeliverables.js',
]);
const REPLAY_COMPILER_FILES = Object.freeze([
  'src/lib/publicScionProvider.js',
  'src/lib/scionAnswerKeyAlignment.js',
  'src/lib/scionKeyTermContract.js',
  'src/lib/scionEvidenceContract.js',
  'src/lib/scionContracts.js',
  'src/lib/scenarioContract.js',
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

async function copyEvidence() {
  await fs.mkdir(OUTPUT, { recursive: true });
  for (const [source, destination] of FILE_COPIES) {
    const target = path.join(OUTPUT, destination);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(source, target);
  }
  for (const [source, destination] of DIR_COPIES) {
    await fs.cp(source, path.join(OUTPUT, destination), { recursive: true, force: true });
  }
  const [campaign, compilerFiles] = await Promise.all([
    readJson(CAMPAIGN),
    Promise.all(REPLAY_COMPILER_FILES.map(async (file) => [file, await sha256File(file)])),
  ]);
  const compiler = {
    protocol: 'scion-lesson-kernel-compiler-replay-v1',
    policy: {
      keyTermSemanticProfile: 'source-strict-v6',
      artifactPolicy: 'frozen-artifact-replay-only',
      answerPosition: 'preserve-upstream-compiler-repairs',
    },
    files: Object.fromEntries(compilerFiles),
  };
  compiler.identitySha256 = scionLessonKernelSha256(compiler);
  const currentReferenceAdmissions = new Set();
  for (const number of [1, 2]) {
    for (const arm of ['local', 'reference']) {
      const capture = await readJson(path.join(OUTPUT, `batch-${number}/${arm}-capture.json`));
      const replay = replayScionLessonKernelAdmissionReport({
        campaign,
        capture,
        compiler,
        generatedAt: GENERATED_AT,
      });
      await atomicWriteJson(path.join(OUTPUT, `batch-${number}/${arm}-current-replay.json`), replay);
      if (arm === 'reference') {
        replay.calls
          .filter((call) => !call.admission.needsRetry)
          .forEach((call) => currentReferenceAdmissions.add(call.caseId));
      }
    }
  }
  const judgedPreferences = [
    ...(await readJsonl(path.join(OUTPUT, 'batch-1/judge/training-preferences.jsonl'))),
    ...(await readJsonl(path.join(OUTPUT, 'batch-2/judge/training-preferences.jsonl'))),
  ];
  const preferences = judgedPreferences.filter((row) => currentReferenceAdmissions.has(row.caseId));
  await fs.writeFile(
    path.join(OUTPUT, 'training-preferences.jsonl'),
    `${preferences.map((row) => JSON.stringify(row)).join('\n')}\n`,
  );
}

async function evidenceFileHashes() {
  const files = [];
  async function visit(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (absolute !== path.resolve(RECEIPT) && !absolute.endsWith('.TASK.txt')) files.push(absolute);
    }
  }
  await visit(path.resolve(OUTPUT));
  files.sort();
  return Object.fromEntries(
    await Promise.all(files.map(async (file) => [path.relative(OUTPUT, file), await sha256File(file)])),
  );
}

function captureMetrics(capture) {
  return {
    calls: capture.calls.length,
    attempts: capture.calls.reduce((sum, call) => sum + call.attempts.length, 0),
    admitted: capture.calls.filter((call) => !call.admission.needsRetry).length,
    retained: capture.calls.filter((call) => call.admission.needsRetry).length,
    durationMs: capture.calls.reduce((sum, call) => sum + Number(call.durationMs || 0), 0),
  };
}

function exactSourceLedger(campaignById, replay) {
  return replay.calls.every((call) => {
    const sourceClaims = campaignById.get(call.caseId)?.sourceContext?.claims || [];
    const normalize = (values) =>
      (Array.isArray(values) ? values : []).map((value) =>
        String(value || '')
          .replace(/\s+/g, ' ')
          .trim(),
      );
    return (
      stableScionLessonKernelJson(normalize(call.artifact?.facts)) ===
      stableScionLessonKernelJson(normalize(sourceClaims))
    );
  });
}

export async function buildScionSourceLedgerV01659Audit({ cwd = process.cwd() } = {}) {
  const root = path.resolve(cwd);
  const resolve = (file) => path.join(root, file);
  const [campaign, legacy, ledger, semantic, implementation, files] = await Promise.all([
    readJson(resolve(CAMPAIGN)),
    readJson(resolve(`${OUTPUT}/pilot/legacy-reference.json`)),
    readJson(resolve(`${OUTPUT}/pilot/source-ledger-reference.json`)),
    buildScionSemanticAdmissionV01655Audit({ cwd: root }),
    Promise.all(IMPLEMENTATION_FILES.map(async (file) => [file, await sha256File(resolve(file))])),
    evidenceFileHashes(),
  ]);
  const batches = await Promise.all(
    [1, 2].map(async (number) => {
      const base = resolve(`${OUTPUT}/batch-${number}`);
      return {
        localCapture: await readJson(path.join(base, 'local-capture.json')),
        referenceCapture: await readJson(path.join(base, 'reference-capture.json')),
        localReplay: await readJson(path.join(base, 'local-current-replay.json')),
        referenceReplay: await readJson(path.join(base, 'reference-current-replay.json')),
        judge: await readJson(path.join(base, 'judge/paired-order-workbook-result.json')),
        preferences: await readJsonl(path.join(base, 'judge/training-preferences.jsonl')),
      };
    }),
  );
  const trainingPreferences = await readJsonl(resolve(`${OUTPUT}/training-preferences.jsonl`));
  const campaignById = new Map(campaign.cases.map((entry) => [entry.caseId, entry]));
  const allLocalCalls = batches.flatMap((batch) => batch.localReplay.calls);
  const allReferenceCalls = batches.flatMap((batch) => batch.referenceReplay.calls);
  const trainingCaseIds = new Set(trainingPreferences.map((row) => row.caseId));
  const trainingDomains = [...new Set([...trainingCaseIds].map((caseId) => campaignById.get(caseId)?.domain))].sort();
  const allReferenceWins = batches.reduce((sum, batch) => sum + batch.judge.summary.referenceWins, 0);
  const allStablePreferences = batches.reduce((sum, batch) => sum + batch.judge.summary.stablePreferences, 0);
  const qualifiedRemainAdmitted = [...trainingCaseIds].every((caseId) => {
    const call = allReferenceCalls.find((entry) => entry.caseId === caseId);
    return call && !call.admission.needsRetry;
  });
  const assertions = {
    campaignBreadth:
      campaign.cases.length === 148 &&
      new Set(campaign.cases.map((entry) => entry.courseGroupId)).size === 25 &&
      new Set(campaign.cases.map((entry) => entry.domain)).size === 7,
    pilotFactLedgerDelta:
      legacy.calls.length === 1 &&
      legacy.calls[0].attempts.length === 3 &&
      legacy.calls[0].admission.needsRetry === true &&
      ledger.calls.length === 1 &&
      ledger.calls[0].attempts.length === 1 &&
      ledger.calls[0].admission.needsRetry === false,
    sevenDomainPairedCoverage:
      allLocalCalls.length === 7 &&
      allReferenceCalls.length === 7 &&
      new Set(allReferenceCalls.map((call) => campaignById.get(call.caseId)?.domain)).size === 7,
    exactSourceLedgerPreserved: batches.every(
      (batch) =>
        exactSourceLedger(campaignById, batch.localReplay) && exactSourceLedger(campaignById, batch.referenceReplay),
    ),
    currentCompilerSelectivity:
      allLocalCalls.filter((call) => !call.admission.needsRetry).length === 0 &&
      allReferenceCalls.filter((call) => !call.admission.needsRetry).length === 2,
    pairedJudgeResult:
      allReferenceWins === 7 &&
      allStablePreferences === 3 &&
      batches.every((batch) => batch.judge.status === 'paired-orders-complete' && batch.judge.pendingBatches === 0),
    firstQualifiedLessonRows:
      trainingPreferences.length === 2 &&
      new Set(trainingPreferences.map((row) => row.pairId)).size === 2 &&
      trainingDomains.join('|') === 'computer-science|user-experience-design' &&
      qualifiedRemainAdmitted,
    frozenLossReplay:
      semantic.production.rejectedDetected === 78 &&
      semantic.historicalCore.rejectedDetected === 46 &&
      semantic.production.preferredRegressions === 0,
  };
  const failures = Object.entries(assertions)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  if (failures.length) throw new Error(`Scion v0.16.59 source-ledger audit failed: ${failures.join(', ')}`);

  const report = {
    schemaVersion: 1,
    protocol: 'scion-source-ledger-and-semantic-admission-v1',
    release: 'v0.16.59',
    generatedAt: GENERATED_AT,
    status: 'first-score-qualified-lesson-preferences',
    implementation: Object.fromEntries(implementation),
    evidenceFiles: files,
    campaign: {
      path: CAMPAIGN,
      identitySha256: campaign.identity.sha256,
      cases: campaign.cases.length,
      courseGroups: new Set(campaign.cases.map((entry) => entry.courseGroupId)).size,
      domains: new Set(campaign.cases.map((entry) => entry.domain)).size,
      promptPolicy: campaign.promptPolicy,
    },
    sourceLedgerPilot: {
      before: captureMetrics(legacy),
      after: captureMetrics(ledger),
      interpretation:
        'On the bounded minor-scale source pilot, compiler-owned exact source facts reduced the paid reference from three retained attempts to one admitted attempt while removing invented filler facts.',
    },
    crossDomain: {
      pairs: allLocalCalls.length,
      domains: 7,
      localCurrentAdmission: {
        admitted: allLocalCalls.filter((call) => !call.admission.needsRetry).length,
        rejected: allLocalCalls.filter((call) => call.admission.needsRetry).length,
      },
      referenceCurrentAdmission: {
        admitted: allReferenceCalls.filter((call) => !call.admission.needsRetry).length,
        rejected: allReferenceCalls.filter((call) => call.admission.needsRetry).length,
      },
      pairedJudge: {
        referenceWins: allReferenceWins,
        scoreQualifiedBeforeCurrentReplay: allStablePreferences,
        model: batches[0].judge.judge,
        reversedOrderSessions: batches.reduce((sum, batch) => sum + batch.judge.reviewedBatches * 2, 0),
      },
      trainingPreferences: {
        rows: trainingPreferences.length,
        domains: trainingDomains,
        caseIds: [...trainingCaseIds].sort(),
        currentCompilerAdmitted: qualifiedRemainAdmitted,
      },
    },
    frozenRegression: {
      stableLossesDetected: semantic.production.rejectedDetected,
      historicalCoreDetected: semantic.historicalCore.rejectedDetected,
      preferredRegressions: semantic.production.preferredRegressions,
    },
    assertions,
    claimBoundary:
      'This is deterministic current-compiler replay plus same-identity model-judge evidence from seven bounded source-ledger pairs. Three judged winners cleared the earlier score and admission boundary; the stricter current replay retains two as training-eligible full-lesson preferences. This is not human, instructor, classroom, independent-judge, adapter-improvement, held-out, or production-win evidence.',
  };
  report.identity = { algorithm: 'sha256-canonical-json', sha256: sha256(stableScionLessonKernelJson(report)) };
  return report;
}

export async function runScionSourceLedgerV01659Audit({ build = false, cwd = process.cwd() } = {}) {
  const root = path.resolve(cwd);
  if (build) await copyEvidence();
  const report = await buildScionSourceLedgerV01659Audit({ cwd: root });
  const receipt = path.join(root, RECEIPT);
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (build) await atomicWriteJson(receipt, report);
  else if ((await fs.readFile(receipt, 'utf8')) !== serialized)
    throw new Error('Tracked v0.16.59 source-ledger receipt is stale');
  return { report, receipt };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if ([...args].some((arg) => !['--build', '--audit'].includes(arg)))
    throw new Error('Unknown source-ledger audit option');
  const result = await runScionSourceLedgerV01659Audit({ build: args.has('--build') });
  console.log(
    `Scion source ledger: ${result.report.crossDomain.pairedJudge.referenceWins}/7 reference wins; ${result.report.crossDomain.trainingPreferences.rows} score-qualified rows.`,
  );
  console.log(`Verified: ${path.relative(process.cwd(), result.receipt)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}
