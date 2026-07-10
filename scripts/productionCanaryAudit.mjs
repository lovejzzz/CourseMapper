#!/usr/bin/env node
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const DEFAULT_POLICY = path.join(ROOT, 'evaluation', 'production-canaries', 'policy.json');
const DEFAULT_OUTPUT_DIR = path.join(ROOT, 'verification-output', 'production-canary');
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}T/.test(String(value || '')) && Number.isFinite(Date.parse(value));
}

function ageInDays(date, now) {
  return Math.max(0, (now.getTime() - new Date(date).getTime()) / 86_400_000);
}

async function verifyRetainedArtifacts(run, policyDir) {
  const rows = [];
  for (const key of ['zip', 'trace', 'consoleLog']) {
    const artifact = run?.evidence?.artifacts?.[key] || {};
    const absolutePath = artifact.path ? path.resolve(policyDir, artifact.path) : '';
    let available = false;
    let observedSha256 = '';
    if (absolutePath) {
      try {
        const bytes = await fs.readFile(absolutePath);
        available = true;
        observedSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
      } catch {
        available = false;
      }
    }
    rows.push({
      key,
      path: artifact.path || '',
      expectedSha256: artifact.sha256 || '',
      observedSha256,
      available,
      hashMatches:
        available && SHA256_PATTERN.test(String(artifact.sha256 || '')) && artifact.sha256 === observedSha256,
    });
  }
  return { artifacts: rows, allMatch: rows.every((row) => row.hashMatches) };
}

export function evaluateCanaryRun(run, policy, now = new Date()) {
  const schemaFindings = [];
  if (!run?.runId) schemaFindings.push('runId is required');
  if (!isIsoDate(run?.generatedAt)) schemaFindings.push('generatedAt must be an ISO timestamp');
  if (!run?.course?.domain) schemaFindings.push('course.domain is required');
  if (!run?.provider?.family) schemaFindings.push('provider.family is required');
  if (run?.provider?.mode !== 'live' || run?.provider?.simulated !== false) {
    schemaFindings.push('provider evidence must be a non-simulated live run');
  }
  for (const [label, value] of [
    ['package.sha256', run?.package?.sha256],
    ['evidence.traceSha256', run?.evidence?.traceSha256],
    ['evidence.consoleLogSha256', run?.evidence?.consoleLogSha256],
  ]) {
    if (!SHA256_PATTERN.test(String(value || ''))) schemaFindings.push(`${label} must be a SHA-256 digest`);
  }

  const operationalFindings = [];
  if (Number(run?.requests?.successful) < policy.minimumSuccessfulRequests) {
    operationalFindings.push('not enough successful provider requests');
  }
  if (Number(run?.requests?.successful) !== Number(run?.requests?.total)) {
    operationalFindings.push('one or more provider requests failed');
  }
  if ((run?.requests?.httpStatuses || []).some((status) => Number(status) < 200 || Number(status) >= 300)) {
    operationalFindings.push('one or more provider requests returned a non-2xx response');
  }
  if (Number(run?.generation?.lessonsProduced) !== Number(run?.course?.lessonCount)) {
    operationalFindings.push('generated lesson count does not match the requested course scope');
  }
  if (Number(run?.generation?.duplicateTopics) > policy.maximumDuplicateTopics) {
    operationalFindings.push('duplicate topic threshold exceeded');
  }
  if (Number(run?.package?.fileCount) < policy.minimumPackageFiles) {
    operationalFindings.push('package file count is below the minimum');
  }
  if (run?.package?.officeStructuralValidation !== 'pass') {
    operationalFindings.push('Office structural validation did not pass');
  }

  const qualityFindings = [];
  if (Number(run?.quality?.score) < policy.minimumQualityScore) qualityFindings.push('quality score is below policy');
  if (Number(run?.quality?.p0) > policy.maximumP0Findings) qualityFindings.push('P0 threshold exceeded');
  if (Number(run?.quality?.p1) > policy.maximumP1Findings) qualityFindings.push('P1 threshold exceeded');

  const evidenceFindings = [];
  const ageDays = isIsoDate(run?.generatedAt) ? ageInDays(run.generatedAt, now) : Infinity;
  if (ageDays > policy.maximumAgeDays) evidenceFindings.push('run is stale');
  if (run?.evidence?.retention?.status !== 'retained') {
    evidenceFindings.push('ZIP, trace, and log are not durably retained');
  }
  if (run?.evidence?.artifactValidation?.allMatch !== true) {
    evidenceFindings.push('retained ZIP, trace, and log are missing or do not match their SHA-256 digests');
  }
  if (run?.evidence?.visualQa?.status !== 'pass' || !isIsoDate(run?.evidence?.visualQa?.reviewedAt)) {
    evidenceFindings.push('fresh rendered visual QA is missing');
  }

  const valid = schemaFindings.length === 0;
  const operationalPass = valid && operationalFindings.length === 0;
  const qualityPass = valid && qualityFindings.length === 0;
  const proofEligible = valid && evidenceFindings.length === 0;
  return {
    runId: run?.runId || '',
    generatedAt: run?.generatedAt || '',
    ageDays: Number.isFinite(ageDays) ? Number(ageDays.toFixed(1)) : null,
    domain: run?.course?.domain || '',
    providerFamily: run?.provider?.family || '',
    valid,
    operationalPass,
    qualityPass,
    proofEligible,
    releasePass: proofEligible && operationalPass && qualityPass,
    schemaFindings,
    operationalFindings,
    qualityFindings,
    evidenceFindings,
    metrics: {
      qualityScore: Number(run?.quality?.score || 0),
      p0: Number(run?.quality?.p0 || 0),
      p1: Number(run?.quality?.p1 || 0),
      successfulRequests: Number(run?.requests?.successful || 0),
      totalRequests: Number(run?.requests?.total || 0),
      packageFiles: Number(run?.package?.fileCount || 0),
    },
  };
}

export function buildProductionCanarySummary(runResults, policy) {
  const eligible = runResults.filter((run) => run.proofEligible);
  const domains = [...new Set(eligible.map((run) => run.domain).filter(Boolean))];
  const providers = [...new Set(eligible.map((run) => run.providerFamily).filter(Boolean))];
  const missingProviders = policy.requiredProviderFamilies.filter((provider) => !providers.includes(provider));
  const evidenceComplete =
    eligible.length >= policy.minimumCompletedRuns &&
    domains.length >= policy.minimumDomains &&
    missingProviders.length === 0;
  const releasePass = evidenceComplete && eligible.every((run) => run.releasePass);
  return {
    status: evidenceComplete ? (releasePass ? 'pass' : 'fail') : 'unverified',
    recordedRuns: runResults.length,
    proofEligibleRuns: eligible.length,
    operationalPassRuns: runResults.filter((run) => run.operationalPass).length,
    releasePassRuns: eligible.filter((run) => run.releasePass).length,
    requiredRuns: policy.minimumCompletedRuns,
    domains,
    requiredDomains: policy.minimumDomains,
    providers,
    missingProviders,
    evidenceComplete,
    claimBoundary:
      'A production-quality claim requires recent retained ZIP, trace, log, and rendered visual QA from real providers across multiple course domains.',
  };
}

function renderMarkdown(report) {
  const rows = report.runs.map(
    (run) =>
      `| ${run.runId} | ${run.domain} | ${run.providerFamily} | ${run.operationalPass ? 'pass' : 'fail'} | ${run.qualityPass ? 'pass' : 'fail'} | ${run.proofEligible ? 'yes' : 'no'} | ${run.releasePass ? 'pass' : 'not-ready'} |`,
  );
  return [
    '# Production Canary Audit',
    '',
    `Generated: ${report.meta.generatedAt}`,
    `Mode: ${report.meta.mode}`,
    `Status: ${report.summary.status}`,
    `Recorded runs: ${report.summary.recordedRuns}`,
    `Proof-eligible runs: ${report.summary.proofEligibleRuns}/${report.summary.requiredRuns}`,
    `Domains: ${report.summary.domains.join(', ') || 'none'} (${report.summary.requiredDomains} required)`,
    '',
    `> ${report.summary.claimBoundary}`,
    '',
    '| Run | Domain | Provider | Operational | Quality | Retained + Visual | Release |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
    '## Evidence gaps',
    '',
    ...report.runs.flatMap((run) => {
      const findings = [
        ...run.schemaFindings,
        ...run.operationalFindings,
        ...run.qualityFindings,
        ...run.evidenceFindings,
      ];
      return findings.length > 0 ? findings.map((finding) => `- ${run.runId}: ${finding}`) : [`- ${run.runId}: none`];
    }),
    '',
  ].join('\n');
}

export async function runProductionCanaryAudit({
  policyPath = DEFAULT_POLICY,
  outputDir = DEFAULT_OUTPUT_DIR,
  mode = 'advisory',
  now = new Date(),
} = {}) {
  const absolutePolicyPath = path.resolve(policyPath);
  const policy = JSON.parse(await fs.readFile(absolutePolicyPath, 'utf8'));
  const policyDir = path.dirname(absolutePolicyPath);
  const runs = [];
  for (const runFile of policy.runs || []) {
    const run = JSON.parse(await fs.readFile(path.resolve(policyDir, runFile), 'utf8'));
    run.evidence = {
      ...run.evidence,
      artifactValidation: await verifyRetainedArtifacts(run, policyDir),
    };
    runs.push(run);
  }
  const results = runs.map((run) => evaluateCanaryRun(run, policy, now));
  const report = {
    meta: { generatedAt: now.toISOString(), mode, schemaVersion: policy.schemaVersion },
    summary: buildProductionCanarySummary(results, policy),
    runs: results,
  };
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`);
  await fs.writeFile(path.join(outputDir, 'latest.md'), `${renderMarkdown(report)}\n`);
  return report;
}

function parseArgs(argv) {
  const args = { policyPath: DEFAULT_POLICY, outputDir: DEFAULT_OUTPUT_DIR, mode: 'advisory' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--policy') args.policyPath = path.resolve(argv[++index] || args.policyPath);
    else if (arg === '--output') args.outputDir = path.resolve(argv[++index] || args.outputDir);
    else if (arg === '--mode') args.mode = argv[++index] || args.mode;
    else if (arg === '--help' || arg === '-h') args.help = true;
  }
  if (!['advisory', 'strict'].includes(args.mode)) throw new Error('Expected --mode advisory|strict');
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node scripts/productionCanaryAudit.mjs [--mode advisory|strict] [--policy FILE]');
    return;
  }
  const report = await runProductionCanaryAudit(args);
  console.log(`Production canary audit: ${report.summary.status}`);
  console.log(`Proof-eligible runs: ${report.summary.proofEligibleRuns}/${report.summary.requiredRuns}`);
  console.log(`Report: ${path.join(args.outputDir, 'latest.md')}`);
  if (args.mode === 'strict' && report.summary.status !== 'pass') process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
