#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const DEFAULT_MANIFEST = 'evaluation/algi/algi-research-first-benchmark-v1.json';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function median(values = []) {
  const numbers = values
    .map(Number)
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  if (numbers.length === 0) return null;
  const middle = Math.floor(numbers.length / 2);
  return numbers.length % 2 === 0 ? (numbers[middle - 1] + numbers[middle]) / 2 : numbers[middle];
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
  if (manifest.protocolVersion !== 'algi-research-first-course-intelligence-v1') {
    issues.push('manifest-protocol-version');
  }
  if (!String(manifest.claimBoundary || '').includes('not evidence')) issues.push('manifest-claim-boundary');
  if (courses.length < Number(manifest.executionContract?.minimumDomains || 8)) issues.push('too-few-courses');
  if (new Set(courses.map((course) => course.domain)).size < 8) issues.push('too-few-domains');
  if (new Set(courses.map((course) => course.id)).size !== courses.length) issues.push('duplicate-course-id');
  if (courses.some((course) => !course.prompt || !/exactly five lessons/i.test(course.prompt))) {
    issues.push('course-input-not-frozen');
  }
  const requiredMetrics = new Set(manifest.executionContract?.requiredMetrics || []);
  for (const metric of [
    'coverage',
    'quality',
    'p0',
    'p1',
    'unsupportedClaims',
    'blockers',
    'durationMs',
    'mandatoryModelBytes',
    'sourceRequests',
    'evidenceClaims',
    'evidenceSources',
    'evidenceProviders',
  ]) {
    if (!requiredMetrics.has(metric)) issues.push(`required-metric-missing:${metric}`);
  }
  const rules = manifest.viabilityRules || {};
  for (const key of [
    'algiCoverageMinimum',
    'algiP0Maximum',
    'algiP1Maximum',
    'algiUnsupportedClaimsMaximum',
    'algiBlockersMaximum',
    'algiMandatoryModelBytesMaximum',
    'algiSourceRequestsMaximum',
    'algiEvidenceSourcesMinimum',
    'algiEvidenceProvidersMinimum',
    'cachedSourceRequestsMaximum',
    'cachedMandatoryModelBytesMaximum',
    'minimumQualityWithinTwoPointsOfScion',
    'maximumMedianColdDurationRatio',
    'maximumMedianWarmDurationRatio',
  ]) {
    if (!Number.isFinite(Number(rules[key]))) issues.push(`viability-rule-missing:${key}`);
  }
  return issues;
}

function metric(arm, key) {
  return Number(arm?.metrics?.[key]);
}

function checkArmArtifacts({ issues, courseId, armId, arm, manifest }) {
  if (!arm) {
    issues.push(`${courseId}:missing-arm:${armId}`);
    return;
  }
  for (const artifact of manifest.executionContract.requiredArtifactsPerArm || []) {
    if (!arm?.artifacts?.[artifact]) issues.push(`${courseId}:${armId}:missing-artifact:${artifact}`);
  }
  for (const name of manifest.executionContract.requiredMetrics || []) {
    if (!Number.isFinite(metric(arm, name))) issues.push(`${courseId}:${armId}:missing-metric:${name}`);
  }
}

export async function auditAlgiResearchFirstBenchmark({
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
      audit: 'algi-research-first-benchmark-v1',
      status: issues.length === 0 ? 'ready' : 'fail',
      viabilityProven: false,
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
  if (!String(evidence.compilerCommit || '').match(/^[a-f0-9]{7,40}$/)) issues.push('evidence-compiler-commit');
  const byCase = new Map((evidence.cases || []).map((entry) => [entry.id, entry]));
  if (byCase.size !== manifest.courses.length) issues.push('evidence-case-count');

  const coldRatios = [];
  const warmRatios = [];
  let qualityWithinTwo = 0;
  const rules = manifest.viabilityRules || {};
  for (const course of manifest.courses || []) {
    const entry = byCase.get(course.id);
    if (!entry) {
      issues.push(`missing-case:${course.id}`);
      continue;
    }
    for (const armId of ['algiResearch', 'algiCached', 'scionModelOnly']) {
      checkArmArtifacts({ issues, courseId: course.id, armId, arm: entry.arms?.[armId], manifest });
    }
    const algi = entry.arms?.algiResearch;
    const cached = entry.arms?.algiCached;
    const scion = entry.arms?.scionModelOnly;
    if (metric(algi, 'coverage') < rules.algiCoverageMinimum) issues.push(`${course.id}:algi-coverage`);
    if (metric(algi, 'p0') > rules.algiP0Maximum) issues.push(`${course.id}:algi-p0`);
    if (metric(algi, 'p1') > rules.algiP1Maximum) issues.push(`${course.id}:algi-p1`);
    if (metric(algi, 'unsupportedClaims') > rules.algiUnsupportedClaimsMaximum) {
      issues.push(`${course.id}:algi-unsupported-claims`);
    }
    if (metric(algi, 'blockers') > rules.algiBlockersMaximum) issues.push(`${course.id}:algi-blockers`);
    if (metric(algi, 'mandatoryModelBytes') > rules.algiMandatoryModelBytesMaximum) {
      issues.push(`${course.id}:algi-model-bytes`);
    }
    if (metric(algi, 'sourceRequests') > rules.algiSourceRequestsMaximum) {
      issues.push(`${course.id}:algi-source-requests`);
    }
    if (metric(algi, 'evidenceSources') < rules.algiEvidenceSourcesMinimum) {
      issues.push(`${course.id}:algi-evidence-sources`);
    }
    if (metric(algi, 'evidenceProviders') < rules.algiEvidenceProvidersMinimum) {
      issues.push(`${course.id}:algi-evidence-providers`);
    }
    if (metric(cached, 'sourceRequests') > rules.cachedSourceRequestsMaximum) {
      issues.push(`${course.id}:cache-network-regression`);
    }
    if (metric(cached, 'mandatoryModelBytes') > rules.cachedMandatoryModelBytesMaximum) {
      issues.push(`${course.id}:cache-model-bytes`);
    }
    if (metric(algi, 'quality') >= metric(scion, 'quality') - 2) qualityWithinTwo += 1;
    coldRatios.push(metric(algi, 'durationMs') / Math.max(1, metric(scion, 'durationMs')));
    warmRatios.push(metric(cached, 'durationMs') / Math.max(1, metric(algi, 'durationMs')));
  }
  const medianColdDurationRatio = median(coldRatios);
  const medianWarmDurationRatio = median(warmRatios);
  if (qualityWithinTwo < rules.minimumQualityWithinTwoPointsOfScion) issues.push('quality-within-two');
  if (!(medianColdDurationRatio <= rules.maximumMedianColdDurationRatio)) issues.push('median-cold-duration-ratio');
  if (!(medianWarmDurationRatio <= rules.maximumMedianWarmDurationRatio)) issues.push('median-warm-duration-ratio');

  return {
    schemaVersion: 1,
    audit: 'algi-research-first-benchmark-v1',
    status: issues.length === 0 ? 'pass' : 'fail',
    viabilityProven: issues.length === 0,
    manifestPath,
    manifestSha256,
    evidencePath,
    compilerCommit: evidence.compilerCommit || '',
    cases: manifest.courses.length,
    domains: new Set(manifest.courses.map((course) => course.domain)).size,
    summary: { qualityWithinTwo, medianColdDurationRatio, medianWarmDurationRatio },
    blockers: issues,
    claimBoundary: manifest.claimBoundary,
  };
}

async function main() {
  const args = parseArgs();
  const report = await auditAlgiResearchFirstBenchmark({
    manifestPath: args.manifest,
    evidencePath: args.evidence,
  });
  console.log(JSON.stringify(report, null, 2));
  if (report.status === 'fail' || (args.strict && !report.viabilityProven)) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
