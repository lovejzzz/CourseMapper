#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { inspectEvidenceRecord, sha256Bytes } from './lib/evidenceRecord.mjs';

const DEFAULT_MANIFEST = 'evaluation/algi/algi-scion-hybrid-benchmark-v1.json';

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
  if (manifest.protocolVersion !== 'algi-scion-grounded-authoring-v1') issues.push('manifest-protocol-version');
  if (!String(manifest.claimBoundary || '').includes('not a result')) issues.push('manifest-claim-boundary');
  if (courses.length < Number(manifest.executionContract?.minimumDomains || 5)) issues.push('too-few-courses');
  if (new Set(courses.map((course) => course.domain)).size < 5) issues.push('too-few-domains');
  if (new Set(courses.map((course) => course.id)).size !== courses.length) issues.push('duplicate-course-id');
  if (courses.some((course) => !course.prompt || !/exactly five lessons/i.test(course.prompt))) {
    issues.push('course-input-not-frozen');
  }
  const rules = manifest.promotionRules || {};
  for (const key of [
    'hybridCoverageMinimum',
    'hybridP0Maximum',
    'hybridP1Maximum',
    'hybridUnsupportedClaimsMaximum',
    'hybridBlockersMaximum',
    'minimumHybridBlindWins',
    'maximumHybridBlindLosses',
    'minimumMedianQualityDelta',
    'maximumMedianDurationRatio',
  ]) {
    if (!Number.isFinite(Number(rules[key]))) issues.push(`promotion-rule-missing:${key}`);
  }
  return issues;
}

function requiredMetric(arm, key, label, issues) {
  const value = Number(arm?.metrics?.[key]);
  if (!Number.isFinite(value)) {
    issues.push(`${label}:missing-finite-metric:${key}`);
    return null;
  }
  return value;
}

export async function auditAlgiScionHybridBenchmark({
  root = process.cwd(),
  manifestPath = DEFAULT_MANIFEST,
  evidencePath = '',
} = {}) {
  const manifestBytes = await fs.readFile(path.join(root, manifestPath));
  const manifest = JSON.parse(manifestBytes);
  const issues = validateManifest(manifest);
  const manifestSha256 = sha256Bytes(manifestBytes);
  if (!evidencePath) {
    return {
      schemaVersion: 1,
      audit: 'algi-scion-hybrid-benchmark-v1',
      status: issues.length === 0 ? 'ready' : 'fail',
      promotionEligible: false,
      manifestPath,
      manifestSha256,
      cases: manifest.courses?.length || 0,
      domains: new Set((manifest.courses || []).map((course) => course.domain)).size,
      blockers: issues.length === 0 ? ['paired-evidence-not-recorded'] : issues,
      claimBoundary: manifest.claimBoundary,
    };
  }

  const evidence = JSON.parse(await fs.readFile(path.join(root, evidencePath), 'utf8'));
  if (evidence.benchmarkId !== manifest.id) issues.push('evidence-benchmark-id');
  if (evidence.manifestSha256 !== manifestSha256) issues.push('evidence-manifest-hash');
  if (!String(evidence.compilerCommit || '').match(/^[a-f0-9]{7,40}$/)) issues.push('evidence-compiler-commit');
  const expectedCaseIds = new Set(manifest.courses.map((course) => course.id));
  const evidenceCases = Array.isArray(evidence.cases) ? evidence.cases : [];
  const observedCaseIds = evidenceCases.map((entry) => entry?.id).filter(Boolean);
  const byCase = new Map(evidenceCases.map((entry) => [entry?.id, entry]));
  if (evidenceCases.length !== manifest.courses.length || byCase.size !== manifest.courses.length) {
    issues.push('evidence-case-count');
  }
  if (observedCaseIds.some((caseId) => !expectedCaseIds.has(caseId))) issues.push('evidence-unexpected-case');

  const judge = evidence.judge || {};
  if (!String(judge.identity || '').trim()) issues.push('evidence-judge-identity');
  if (judge.blinded !== true) issues.push('evidence-judge-not-blinded');
  if (!String(judge.attestation || '').trim() || String(judge.attestation).trim().length < 20) {
    issues.push('evidence-judge-attestation');
  }
  const randomizedOrders = Array.isArray(judge.randomizedOrders) ? judge.randomizedOrders : [];
  const orderByCase = new Map(randomizedOrders.map((entry) => [entry?.caseId, entry?.armOrder]));
  if (randomizedOrders.length !== manifest.courses.length || orderByCase.size !== manifest.courses.length) {
    issues.push('evidence-randomized-order-count');
  }

  let wins = 0;
  let losses = 0;
  const qualityDeltas = [];
  const durationRatios = [];
  for (const course of manifest.courses) {
    const entry = byCase.get(course.id);
    if (!entry) {
      issues.push(`missing-case:${course.id}`);
      continue;
    }
    const randomizedOrder = orderByCase.get(course.id);
    if (
      !Array.isArray(randomizedOrder) ||
      randomizedOrder.length !== 3 ||
      new Set(randomizedOrder).size !== 3 ||
      randomizedOrder.some((armId) => !['algi', 'scion', 'hybrid'].includes(armId))
    ) {
      issues.push(`${course.id}:invalid-randomized-order`);
    }
    for (const armId of ['algi', 'scion', 'hybrid']) {
      const arm = entry.arms?.[armId];
      if (!arm) issues.push(`${course.id}:missing-arm:${armId}`);
      for (const artifact of manifest.executionContract.requiredArtifactsPerArm || []) {
        const artifactRecord = arm?.artifacts?.[artifact];
        const inspection = await inspectEvidenceRecord(artifactRecord, { root });
        if (!inspection.ok) {
          issues.push(`${course.id}:${armId}:invalid-artifact:${artifact}:${inspection.issues.join('+') || 'unknown'}`);
        }
      }
    }
    const hybrid = entry.arms?.hybrid;
    const scion = entry.arms?.scion;
    const rules = manifest.promotionRules;
    const hybridCoverage = requiredMetric(hybrid, 'coverage', `${course.id}:hybrid`, issues);
    const hybridP0 = requiredMetric(hybrid, 'p0', `${course.id}:hybrid`, issues);
    const hybridP1 = requiredMetric(hybrid, 'p1', `${course.id}:hybrid`, issues);
    const hybridUnsupportedClaims = requiredMetric(hybrid, 'unsupportedClaims', `${course.id}:hybrid`, issues);
    const hybridBlockers = requiredMetric(hybrid, 'blockers', `${course.id}:hybrid`, issues);
    const hybridModelCalls = requiredMetric(hybrid, 'modelCalls', `${course.id}:hybrid`, issues);
    const scionModelCalls = requiredMetric(scion, 'modelCalls', `${course.id}:scion`, issues);
    const hybridQuality = requiredMetric(hybrid, 'quality', `${course.id}:hybrid`, issues);
    const scionQuality = requiredMetric(scion, 'quality', `${course.id}:scion`, issues);
    const hybridDuration = requiredMetric(hybrid, 'durationMs', `${course.id}:hybrid`, issues);
    const scionDuration = requiredMetric(scion, 'durationMs', `${course.id}:scion`, issues);
    if (hybridCoverage !== null && hybridCoverage < rules.hybridCoverageMinimum) {
      issues.push(`${course.id}:hybrid-coverage`);
    }
    if (hybridP0 !== null && hybridP0 > rules.hybridP0Maximum) issues.push(`${course.id}:hybrid-p0`);
    if (hybridP1 !== null && hybridP1 > rules.hybridP1Maximum) issues.push(`${course.id}:hybrid-p1`);
    if (hybridUnsupportedClaims !== null && hybridUnsupportedClaims > rules.hybridUnsupportedClaimsMaximum) {
      issues.push(`${course.id}:hybrid-unsupported-claims`);
    }
    if (hybridBlockers !== null && hybridBlockers > rules.hybridBlockersMaximum) {
      issues.push(`${course.id}:hybrid-blockers`);
    }
    if (hybridModelCalls !== null && scionModelCalls !== null && hybridModelCalls > scionModelCalls) {
      issues.push(`${course.id}:hybrid-call-regression`);
    }
    if (entry.blindWinner === 'hybrid') wins += 1;
    else if (entry.blindWinner === 'scion') losses += 1;
    else if (entry.blindWinner !== 'tie') issues.push(`${course.id}:invalid-blind-winner`);
    if (hybridQuality !== null && scionQuality !== null) qualityDeltas.push(hybridQuality - scionQuality);
    if (hybridDuration !== null && scionDuration !== null) {
      durationRatios.push(hybridDuration / Math.max(1, scionDuration));
    }
  }
  const medianQualityDelta = median(qualityDeltas);
  const medianDurationRatio = median(durationRatios);
  const rules = manifest.promotionRules || {};
  if (wins < rules.minimumHybridBlindWins) issues.push('too-few-hybrid-wins');
  if (losses > rules.maximumHybridBlindLosses) issues.push('too-many-hybrid-losses');
  if (!(medianQualityDelta >= rules.minimumMedianQualityDelta)) issues.push('median-quality-delta');
  if (!(medianDurationRatio <= rules.maximumMedianDurationRatio)) issues.push('median-duration-ratio');

  return {
    schemaVersion: 1,
    audit: 'algi-scion-hybrid-benchmark-v1',
    status: issues.length === 0 ? 'pass' : 'fail',
    promotionEligible: issues.length === 0,
    manifestPath,
    manifestSha256,
    evidencePath,
    compilerCommit: evidence.compilerCommit || '',
    cases: manifest.courses.length,
    domains: new Set(manifest.courses.map((course) => course.domain)).size,
    summary: { wins, losses, medianQualityDelta, medianDurationRatio },
    blockers: issues,
    claimBoundary: manifest.claimBoundary,
  };
}

async function main() {
  const args = parseArgs();
  const report = await auditAlgiScionHybridBenchmark({
    manifestPath: args.manifest,
    evidencePath: args.evidence,
  });
  console.log(JSON.stringify(report, null, 2));
  if (report.status === 'fail' || (args.strict && !report.promotionEligible)) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
