#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RELEASE = '0.16.76';
const MODEL_ID = 'google/gemma-4-E2B-it-qat-q4_0-unquantized';
const MODEL_REVISION = '1ca4dd94b623b6e0dd9da00c2239ab84b4f3e5ce';
const EVIDENCE_PATH = 'docs/evidence/SCION_V01676_BASE_FREEZE_ACCEPTANCE.json';
const BENCHMARK_PATH = 'evaluation/scion-adapters/held-out-course-benchmark-v21.json';

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(root, relativePath), 'utf8'));
}

async function sha256File(filePath) {
  const body = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(body).digest('hex');
}

function gitValue(...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : '';
}

function checkZip(filePath) {
  const result = spawnSync('unzip', ['-tqq', filePath], { encoding: 'utf8' });
  return result.status === 0;
}

function addIssue(issues, condition, label) {
  if (!condition) issues.push(label);
}

function zeros(record, fields) {
  return fields.every((field) => Number(record?.[field]) === 0);
}

async function auditCourse({ evidenceCourse, benchmarkCourse, roundPath, round }) {
  const issues = [];
  const courseId = benchmarkCourse.courseId;
  const runDir = path.join(root, roundPath, `${courseId}--native--local`);
  const digestPath = path.join(runDir, 'digest.json');
  const zipPath = path.join(runDir, `${courseId}--native--local-package.zip`);
  const manifestPath = path.join(runDir, 'extracted', 'PACKAGE_MANIFEST.json');
  const [digest, zipStat, zipSha256, manifestSha256] = await Promise.all([
    readJson(path.relative(root, digestPath)),
    fs.stat(zipPath),
    sha256File(zipPath),
    sha256File(manifestPath),
  ]);
  const roundCourse = round.courses.find((course) => course.baseId === courseId);
  const gates = digest.gates || {};

  addIssue(issues, evidenceCourse?.lessons === benchmarkCourse.lessonCount, 'lesson-count-evidence');
  addIssue(issues, digest.run?.lessonCount === benchmarkCourse.lessonCount, 'lesson-count-digest');
  addIssue(issues, roundCourse?.runStatus === 'passed' && roundCourse?.attemptCount === 1, 'round-status');
  addIssue(issues, gates.finalStatus === 'ready', 'final-status');
  addIssue(
    issues,
    gates.qualityStatus === 'graded' && gates.qualityScore >= 99 && gates.qualityGrade === 'A',
    'quality',
  );
  addIssue(
    issues,
    zeros(gates, [
      'blockers',
      'warnings',
      'qualityP0',
      'qualityP1',
      'qualityP2',
      'retryCallCount',
      'repairRetryCallCount',
      'finishRetryCallCount',
      'exportFailed',
      'exportWarnings',
    ]),
    'nonzero-gate',
  );
  addIssue(issues, gates.exportStatus === 'passed' && gates.exportChecked === 38, 'export');
  addIssue(issues, gates.enrichmentCoverage === 1 && gates.compiledWithoutEnrichment === false, 'enrichment');
  addIssue(issues, Array.isArray(gates.flaggedChecks) && gates.flaggedChecks.length === 0, 'flagged-check');
  addIssue(issues, digest.run?.providerCalls === evidenceCourse.providerCalls, 'provider-call-count');
  addIssue(issues, digest.run?.pipelineCalls === evidenceCourse.pipelineCalls, 'pipeline-call-count');
  addIssue(issues, digest.elapsedMs === evidenceCourse.elapsedMs, 'elapsed-time');
  addIssue(issues, zipStat.size === evidenceCourse.zipBytes, 'zip-size');
  addIssue(issues, zipSha256 === evidenceCourse.zipSha256, 'zip-sha256');
  addIssue(issues, manifestSha256 === evidenceCourse.packageManifestSha256, 'package-manifest-sha256');
  addIssue(issues, checkZip(zipPath), 'zip-integrity');
  addIssue(issues, evidenceCourse.courseInputSha256 === benchmarkCourse.courseInputSha256, 'course-input-sha256');
  addIssue(issues, evidenceCourse.sourcePacketSha256 === benchmarkCourse.sourcePacketSha256, 'source-packet-sha256');

  return {
    courseId,
    status: issues.length === 0 ? 'pass' : 'fail',
    issues,
    score: gates.qualityScore,
    grade: gates.qualityGrade,
    providerCalls: digest.run?.providerCalls,
    zipSha256,
    packageManifestSha256: manifestSha256,
  };
}

export async function auditScionBaseFreezeV01676() {
  const issues = [];
  const [evidence, benchmark, packageJson, benchmarkSha256] = await Promise.all([
    readJson(EVIDENCE_PATH),
    readJson(BENCHMARK_PATH),
    readJson('package.json'),
    sha256File(path.join(root, BENCHMARK_PATH)),
  ]);

  addIssue(issues, packageJson.version === RELEASE && evidence.release === RELEASE, 'release-version');
  addIssue(issues, evidence.judge?.identity === 'Codex', 'judge');
  addIssue(issues, evidence.architecture?.productionRoute === 'base-only', 'production-route');
  addIssue(issues, evidence.architecture?.modelId === MODEL_ID && benchmark.base?.modelId === MODEL_ID, 'model-id');
  addIssue(
    issues,
    evidence.architecture?.modelRevision === MODEL_REVISION && benchmark.base?.revision === MODEL_REVISION,
    'model-revision',
  );
  addIssue(issues, evidence.architecture?.adapterActive === false, 'adapter-active');
  addIssue(issues, evidence.architecture?.weightsChanged === false, 'weights-changed');
  addIssue(issues, evidence.benchmark?.path === BENCHMARK_PATH, 'benchmark-path');
  addIssue(issues, evidence.benchmark?.sha256 === benchmarkSha256, 'benchmark-sha256');
  addIssue(
    issues,
    benchmarkSha256 === '509a82e89936aa5dd070f57b06688e3557eab80e6bd42e9e0c0ee0a4303040c8',
    'benchmark-freeze',
  );
  addIssue(issues, evidence.architecture?.modelContractSha256 === benchmark.base?.contractSha256, 'model-contract');
  addIssue(issues, evidence.grader?.id === benchmark.grader?.id, 'grader-id');
  addIssue(issues, evidence.grader?.sha256 === benchmark.grader?.sha256, 'grader-sha256-evidence');
  addIssue(
    issues,
    evidence.grader?.implementationSha256 === benchmark.grader?.implementationSha256,
    'grader-implementation-receipt',
  );
  addIssue(
    issues,
    (await sha256File(path.join(root, benchmark.grader.path))) === benchmark.grader.sha256,
    'grader-file-sha256',
  );

  const compilerCommit = evidence.architecture?.compilerSnapshotCommit || '';
  addIssue(issues, gitValue('cat-file', '-t', compilerCommit) === 'commit', 'compiler-commit');
  addIssue(
    issues,
    gitValue('rev-parse', `${compilerCommit}^{tree}`) === evidence.architecture?.compilerSnapshotTree,
    'compiler-tree',
  );
  addIssue(issues, gitValue('rev-parse', 'v0.16.75^{}') === evidence.preservedRelease?.commit, 'v0.16.75-immutable');

  const roundPath = evidence.fiveCourseRound?.path || '';
  const round = await readJson(path.join(roundPath, 'round.json'));
  addIssue(issues, round.modelId === 'scion-1' && round.provider === 'local', 'round-route');
  addIssue(issues, round.courses?.length === benchmark.courses?.length, 'round-course-count');
  addIssue(issues, round.spendAbortReason == null, 'round-abort');

  const results = [];
  for (const benchmarkCourse of benchmark.courses || []) {
    const evidenceCourse = evidence.fiveCourseRound?.courses?.find(
      (course) => course.courseId === benchmarkCourse.courseId,
    );
    if (!evidenceCourse) {
      results.push({ courseId: benchmarkCourse.courseId, status: 'fail', issues: ['missing-evidence-course'] });
      continue;
    }
    results.push(await auditCourse({ evidenceCourse, benchmarkCourse, roundPath, round }));
  }
  issues.push(...results.flatMap((result) => result.issues.map((issue) => `${result.courseId}:${issue}`)));

  const aggregate = evidence.fiveCourseRound?.aggregate || {};
  addIssue(issues, evidence.fiveCourseRound?.providerCalls === 41, 'aggregate-provider-calls');
  addIssue(issues, aggregate.exportChecks === 190 && aggregate.structuredVisuals === 589, 'aggregate-artifacts');
  addIssue(
    issues,
    zeros(aggregate, [
      'blockers',
      'warnings',
      'p0',
      'p1',
      'p2',
      'retryCalls',
      'repairRetryCalls',
      'finishRetryCalls',
      'exportFailures',
      'exportWarnings',
    ]),
    'aggregate-nonzero-gate',
  );

  const browserArchive = evidence.coldBrowserProof?.archive || {};
  const browserPath = browserArchive.path;
  const browserStat = await fs.stat(browserPath);
  addIssue(issues, browserStat.size === browserArchive.bytes, 'browser-zip-size');
  addIssue(issues, (await sha256File(browserPath)) === browserArchive.sha256, 'browser-zip-sha256');
  addIssue(issues, checkZip(browserPath), 'browser-zip-integrity');
  addIssue(
    issues,
    evidence.coldBrowserProof?.score >= 99 &&
      evidence.coldBrowserProof?.grade === 'A' &&
      evidence.coldBrowserProof?.providerCalls === 4 &&
      zeros(evidence.coldBrowserProof, ['blockers', 'warnings', 'p0', 'p1', 'p2', 'retryCalls']),
    'browser-proof',
  );
  addIssue(
    issues,
    evidence.coldBrowserProof?.console?.warnings === 0 && evidence.coldBrowserProof?.console?.errors === 0,
    'browser-console',
  );
  addIssue(issues, evidence.coldBrowserProof?.agent?.status === 'passed', 'browser-agent');

  return {
    schemaVersion: 1,
    release: RELEASE,
    status: issues.length === 0 ? 'pass' : 'fail',
    claim: 'exact V21 base-only Scion compiler and browser release freeze; no independent classroom claim',
    issues,
    compilerCommit,
    compilerTree: evidence.architecture?.compilerSnapshotTree,
    benchmarkSha256,
    courseResults: results,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await auditScionBaseFreezeV01676();
    console.log(`Scion V${RELEASE} base-freeze audit: ${result.status}`);
    console.log(`Courses: ${result.courseResults.filter((course) => course.status === 'pass').length}/5`);
    console.log(`Compiler: ${result.compilerCommit} (${result.compilerTree})`);
    console.log(`Benchmark: ${result.benchmarkSha256}`);
    if (result.issues.length > 0) console.error(`Issues: ${result.issues.join(', ')}`);
    process.exitCode = result.status === 'pass' ? 0 : 1;
  } catch (error) {
    console.error(`Scion V${RELEASE} base-freeze audit failed: ${error.message}`);
    process.exitCode = 1;
  }
}
