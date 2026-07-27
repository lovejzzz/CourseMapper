#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const DEFAULT_MANIFEST = 'evaluation/model-comparison/gpt54mini-scion-algi-v1.json';
const ARM_IDS = ['gpt54Mini', 'scion', 'algi'];
const STATUS_IDS = new Set(['completed', 'blocked', 'infrastructure-unavailable']);

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function finite(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, finite(value) ?? minimum));
}

function mean(values = []) {
  const numbers = values.map(finite).filter((value) => value !== null);
  return numbers.length > 0 ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : null;
}

function median(values = []) {
  const numbers = values
    .map(finite)
    .filter((value) => value !== null)
    .sort((left, right) => left - right);
  if (numbers.length === 0) return null;
  const middle = Math.floor(numbers.length / 2);
  return numbers.length % 2 === 0 ? (numbers[middle - 1] + numbers[middle]) / 2 : numbers[middle];
}

function round(value, digits = 2) {
  const number = finite(value);
  if (number === null) return null;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

export function isPublishable(metrics = {}) {
  return (
    finite(metrics.exported) === 1 &&
    finite(metrics.blockers) === 0 &&
    finite(metrics.p0) === 0 &&
    finite(metrics.p1) === 0 &&
    finite(metrics.unsupportedClaims) === 0
  );
}

function operationalBurdenScore(metrics = {}) {
  const durationMs = finite(metrics.durationMs);
  const mandatoryModelBytes = finite(metrics.mandatoryModelBytes);
  const costUsd = finite(metrics.costUsd);
  const speed =
    durationMs === null ? 0 : durationMs <= 120_000 ? 3 : durationMs <= 300_000 ? 2 : durationMs <= 600_000 ? 1 : 0;
  const download =
    mandatoryModelBytes === null ? 0 : mandatoryModelBytes === 0 ? 1 : mandatoryModelBytes <= 1_000_000_000 ? 0.5 : 0;
  const cost = costUsd === null ? 0 : costUsd <= 0.05 ? 1 : costUsd <= 0.25 ? 0.5 : 0;
  return speed + download + cost;
}

/**
 * A transparent utility score, intentionally dominated by the honest
 * readiness score and evidence coverage. Publishability remains a separate
 * gate: a high utility score can never relabel a blocked package as ready.
 */
export function scoreFunctionalRoute(metrics = {}) {
  const readiness = clamp(metrics.readiness, 0, 100) * 0.5;
  const evidenceCoverage = clamp(metrics.evidenceCoverage, 0, 1) * 20;
  const exportSuccess = finite(metrics.exported) === 1 ? 15 : 0;
  const reliability = Math.max(
    0,
    10 -
      clamp(metrics.blockers, 0, 100) * 10 -
      clamp(metrics.p0, 0, 100) * 10 -
      clamp(metrics.p1, 0, 100) * 5 -
      clamp(metrics.unsupportedClaims, 0, 100) * 5,
  );
  const operationalBurden = operationalBurdenScore(metrics);
  return {
    score: round(readiness + evidenceCoverage + exportSuccess + reliability + operationalBurden),
    publishable: isPublishable(metrics),
    dimensions: {
      readiness: round(readiness),
      evidenceCoverage: round(evidenceCoverage),
      exportSuccess,
      reliability: round(reliability),
      operationalBurden: round(operationalBurden),
    },
  };
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = { manifest: DEFAULT_MANIFEST, evidence: '', strict: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--manifest') args.manifest = argv[++index] || args.manifest;
    else if (argv[index] === '--evidence') args.evidence = argv[++index] || '';
    else if (argv[index] === '--strict') args.strict = true;
  }
  return args;
}

function validateManifest(manifest = {}) {
  const issues = [];
  const courses = Array.isArray(manifest.courses) ? manifest.courses : [];
  if (manifest.schemaVersion !== 1) issues.push('manifest-schema-version');
  if (manifest.protocolVersion !== 'course-route-comparison-v1') issues.push('manifest-protocol-version');
  if (!String(manifest.claimBoundary || '').includes('No winner exists')) issues.push('manifest-claim-boundary');
  if (courses.length < Number(manifest.executionContract?.minimumDomains || 6)) issues.push('too-few-courses');
  if (new Set(courses.map((course) => course.domain)).size < 6) issues.push('too-few-domains');
  if (new Set(courses.map((course) => course.id)).size !== courses.length) issues.push('duplicate-course-id');
  if (courses.some((course) => !course.prompt || !/exactly five lessons/i.test(course.prompt))) {
    issues.push('course-input-not-frozen');
  }
  for (const armId of ARM_IDS) {
    if (!manifest.arms?.[armId]?.provider || !manifest.arms?.[armId]?.model) issues.push(`missing-arm:${armId}`);
  }
  const requiredMetrics = new Set(manifest.executionContract?.requiredMetrics || []);
  for (const metric of [
    'readiness',
    'exported',
    'evidenceCoverage',
    'blockers',
    'p0',
    'p1',
    'unsupportedClaims',
    'durationMs',
    'modelLoadMs',
    'mandatoryModelBytes',
    'costUsd',
    'providerCalls',
    'sourceRequests',
    'repairCount',
    'retryCount',
  ]) {
    if (!requiredMetrics.has(metric)) issues.push(`required-metric-missing:${metric}`);
  }
  return issues;
}

function validArtifactDescriptor(artifact) {
  return (
    artifact &&
    typeof artifact.path === 'string' &&
    artifact.path.length > 0 &&
    typeof artifact.sha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(artifact.sha256)
  );
}

function validateMeasuredArm({ issues, courseId, armId, arm, manifest }) {
  if (!arm) {
    issues.push(`${courseId}:missing-arm:${armId}`);
    return null;
  }
  if (!STATUS_IDS.has(arm.status)) issues.push(`${courseId}:${armId}:invalid-status`);
  if (arm.status === 'infrastructure-unavailable') {
    if (!String(arm.reason || '').trim()) issues.push(`${courseId}:${armId}:missing-infrastructure-reason`);
    return null;
  }
  for (const artifactId of manifest.executionContract.requiredArtifacts || []) {
    if (!validArtifactDescriptor(arm.artifacts?.[artifactId])) {
      issues.push(`${courseId}:${armId}:missing-or-invalid-artifact:${artifactId}`);
    }
  }
  const terminalArtifact = finite(arm.metrics?.exported) === 1 ? 'packageZip' : 'terminalReceipt';
  if (!validArtifactDescriptor(arm.artifacts?.[terminalArtifact])) {
    issues.push(`${courseId}:${armId}:missing-or-invalid-artifact:${terminalArtifact}`);
  }
  for (const metricId of manifest.executionContract.requiredMetrics || []) {
    if (finite(arm.metrics?.[metricId]) === null) issues.push(`${courseId}:${armId}:missing-metric:${metricId}`);
  }
  if (arm.status === 'completed' && finite(arm.metrics?.exported) !== 1) {
    issues.push(`${courseId}:${armId}:completed-without-export`);
  }
  if (arm.status === 'blocked' && finite(arm.metrics?.exported) !== 0) {
    issues.push(`${courseId}:${armId}:blocked-with-export`);
  }
  return scoreFunctionalRoute(arm.metrics);
}

export function armSummary(rows = []) {
  const measured = rows.filter((row) => row.scorecard);
  const unavailable = rows.filter((row) => row.status === 'infrastructure-unavailable').length;
  const scores = measured.map((row) => row.scorecard.score);
  const durations = measured.map((row) => row.metrics.durationMs);
  return {
    measuredCases: measured.length,
    infrastructureUnavailableCases: unavailable,
    publishableCases: measured.filter((row) => row.scorecard.publishable).length,
    publishableRate:
      measured.length > 0 ? round(measured.filter((row) => row.scorecard.publishable).length / measured.length) : null,
    meanFunctionalRouteScore: round(mean(scores)),
    medianFunctionalRouteScore: round(median(scores)),
    worstFunctionalRouteScore: scores.length > 0 ? Math.min(...scores) : null,
    medianDurationMs: round(median(durations), 0),
    totalCostUsd:
      measured.length > 0
        ? round(
            measured.reduce((sum, row) => sum + Number(row.metrics.costUsd || 0), 0),
            4,
          )
        : null,
    mandatoryModelBytes:
      measured.length > 0 ? Math.max(0, ...measured.map((row) => Number(row.metrics.mandatoryModelBytes || 0))) : null,
  };
}

export async function auditThreeRouteComparison({
  root = process.cwd(),
  manifestPath = DEFAULT_MANIFEST,
  evidencePath = '',
} = {}) {
  const manifestBytes = await fs.readFile(path.join(root, manifestPath));
  const manifest = JSON.parse(manifestBytes);
  const issues = validateManifest(manifest);
  const manifestSha256 = sha256(manifestBytes);
  if (!evidencePath) {
    return {
      schemaVersion: 1,
      audit: 'course-route-comparison-v1',
      status: issues.length === 0 ? 'ready' : 'fail',
      comparisonComplete: false,
      winner: null,
      manifestPath,
      manifestSha256,
      cases: manifest.courses?.length || 0,
      domains: new Set((manifest.courses || []).map((course) => course.domain)).size,
      blockers: issues.length === 0 ? ['same-commit-evidence-not-recorded'] : issues,
      claimBoundary: manifest.claimBoundary,
    };
  }

  const evidence = JSON.parse(await fs.readFile(path.join(root, evidencePath), 'utf8'));
  if (evidence.benchmarkId !== manifest.id) issues.push('evidence-benchmark-id');
  if (evidence.manifestSha256 !== manifestSha256) issues.push('evidence-manifest-hash');
  if (!/^[a-f0-9]{7,40}$/.test(String(evidence.compilerCommit || ''))) issues.push('evidence-compiler-commit');
  const cases = new Map((evidence.cases || []).map((entry) => [entry.id, entry]));
  if (cases.size !== manifest.courses.length) issues.push('evidence-case-count');

  const rowsByArm = Object.fromEntries(ARM_IDS.map((armId) => [armId, []]));
  for (const course of manifest.courses) {
    const entry = cases.get(course.id);
    if (!entry) {
      issues.push(`missing-case:${course.id}`);
      continue;
    }
    for (const armId of ARM_IDS) {
      const arm = entry.arms?.[armId];
      const scorecard = validateMeasuredArm({ issues, courseId: course.id, armId, arm, manifest });
      rowsByArm[armId].push({
        courseId: course.id,
        status: arm?.status || 'missing',
        metrics: arm?.metrics || {},
        scorecard,
      });
    }
  }

  const summaries = Object.fromEntries(ARM_IDS.map((armId) => [armId, armSummary(rowsByArm[armId])]));
  const minimumCases = Number(manifest.decisionRules?.minimumCompleteCasesPerArm || manifest.courses.length);
  const allArmsAvailable = ARM_IDS.every(
    (armId) => summaries[armId].measuredCases >= minimumCases && summaries[armId].infrastructureUnavailableCases === 0,
  );
  const comparisonComplete = issues.length === 0 && allArmsAvailable;
  const ranked = comparisonComplete
    ? ARM_IDS.slice().sort(
        (left, right) =>
          summaries[right].meanFunctionalRouteScore - summaries[left].meanFunctionalRouteScore ||
          summaries[right].publishableRate - summaries[left].publishableRate,
      )
    : [];

  return {
    schemaVersion: 1,
    audit: 'course-route-comparison-v1',
    status: issues.length > 0 ? 'fail' : comparisonComplete ? 'complete' : 'incomplete',
    comparisonComplete,
    winner: comparisonComplete ? ranked[0] : null,
    manifestPath,
    manifestSha256,
    evidencePath,
    compilerCommit: evidence.compilerCommit || '',
    cases: manifest.courses.length,
    domains: new Set(manifest.courses.map((course) => course.domain)).size,
    summaries,
    blockers: comparisonComplete ? [] : [...issues, ...(!allArmsAvailable ? ['all-arms-not-available'] : [])],
    claimBoundary: manifest.claimBoundary,
    scoreWarning: manifest.scorecard.warning,
  };
}

async function main() {
  const args = parseArgs();
  const report = await auditThreeRouteComparison({
    manifestPath: args.manifest,
    evidencePath: args.evidence,
  });
  console.log(JSON.stringify(report, null, 2));
  if (report.status === 'fail' || (args.strict && !report.comparisonComplete)) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
