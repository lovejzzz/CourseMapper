#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { closeHybridPipelineAuditRuntime } from './goldSampleQualityAudit.mjs';
import { runContractQualityAudit } from './contractQualityAudit.mjs';
import { runIndependentBenchmarkAudit } from './independentBenchmarkAudit.mjs';
import { runProductionCanaryAudit } from './productionCanaryAudit.mjs';
import { runQualityBenchmarkAudit } from './qualityBenchmarkAudit.mjs';

const ROOT = process.cwd();
const DEFAULT_OUTPUT_DIR = path.join(ROOT, 'verification-output', 'evaluation-system');

const PROFILE_POLICY = {
  pr: {
    contractProfile: 'pr',
    requiredTiers: ['contract', 'qualityBenchmark'],
    purpose: 'Fast representative contract coverage plus the versioned benchmark protocol and corpus integrity.',
  },
  main: {
    contractProfile: 'full',
    requiredTiers: ['contract', 'qualityBenchmark'],
    purpose:
      'All deterministic compiler fixtures plus benchmark protocol and corpus integrity; independent proof remains advisory.',
  },
  release: {
    contractProfile: 'full',
    requiredTiers: ['contract', 'qualityBenchmark', 'independentBenchmark', 'productionCanary'],
    purpose:
      'Release proof requires contract, held-out benchmark validation, independent instructor review, and retained real-provider evidence.',
  },
};

export function buildEvaluationSystemSummary(tiers, profile) {
  const policy = PROFILE_POLICY[profile];
  if (!policy) throw new Error(`Unsupported evaluation profile "${profile}"`);
  const tierStatuses = Object.fromEntries(Object.entries(tiers).map(([key, report]) => [key, report.summary.status]));
  const failedRequiredTiers = policy.requiredTiers.filter((key) => tierStatuses[key] !== 'pass');
  const independentlyValidated =
    tierStatuses.contract === 'pass' &&
    tierStatuses.qualityBenchmark === 'pass' &&
    tierStatuses.independentBenchmark === 'pass' &&
    tierStatuses.productionCanary === 'pass';
  const claimStatus = independentlyValidated
    ? 'independently-validated-for-declared-scope'
    : tierStatuses.contract === 'pass'
      ? 'compiler-contract-only'
      : 'contract-failed';
  return {
    status: failedRequiredTiers.length === 0 ? 'pass' : 'fail',
    profile,
    purpose: policy.purpose,
    requiredTiers: policy.requiredTiers,
    failedRequiredTiers,
    tierStatuses,
    claimStatus,
    independentlyValidated,
    claimBoundary:
      claimStatus === 'independently-validated-for-declared-scope'
        ? 'Contract, held-out rubric evidence, independent instructor, and retained live-provider evidence all satisfy the declared benchmark scope.'
        : 'Passing fixtures alone permits a compiler-contract claim, not a claim that instructors can use the output with minimal edits.',
  };
}

function renderMarkdown(report) {
  const rows = [
    ['Compiler contract', 'contract', report.tiers.contract.summary.fixtureCount],
    ['Evidence-aware quality benchmark', 'qualityBenchmark', report.tiers.qualityBenchmark.summary.validCorpusCases],
    [
      'Independent instructor benchmark',
      'independentBenchmark',
      report.tiers.independentBenchmark.summary.completedCases,
    ],
    ['Production canaries', 'productionCanary', report.tiers.productionCanary.summary.proofEligibleRuns],
  ].map(([label, key, evidence]) => {
    const required = report.summary.requiredTiers.includes(key) ? 'yes' : 'advisory';
    return `| ${label} | ${report.summary.tierStatuses[key]} | ${required} | ${evidence} |`;
  });
  return [
    '# Layered Evaluation System',
    '',
    `Generated: ${report.meta.generatedAt}`,
    `Profile: ${report.summary.profile}`,
    `Status: ${report.summary.status}`,
    `Claim status: ${report.summary.claimStatus}`,
    '',
    `> ${report.summary.claimBoundary}`,
    '',
    '| Tier | Status | Required for profile | Evidence count |',
    '| --- | --- | --- | ---: |',
    ...rows,
    '',
    'Detailed reports:',
    '',
    '- `verification-output/contract-quality-audit/latest.md`',
    '- `verification-output/quality-benchmark/latest.md`',
    '- `verification-output/independent-benchmark/latest.md`',
    '- `verification-output/production-canary/latest.md`',
    '',
  ].join('\n');
}

async function writeReport(report, outputDir) {
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`);
  await fs.writeFile(path.join(outputDir, 'latest.md'), `${renderMarkdown(report)}\n`);
}

export async function runEvaluationSystemAudit({
  profile = 'main',
  changedFrom = '',
  changedFiles,
  outputDir = DEFAULT_OUTPUT_DIR,
  contractSampleIds = [],
  progress = true,
} = {}) {
  const policy = PROFILE_POLICY[profile];
  if (!policy) throw new Error(`Unsupported evaluation profile "${profile}"`);
  try {
    const contract = await runContractQualityAudit({
      profile: policy.contractProfile,
      changedFrom,
      changedFiles,
      sampleIds: contractSampleIds,
      onProgress: progress
        ? (event) => {
            if (event?.type === 'sample:start') console.log(`[evaluation:contract] start ${event.sampleId}`);
            if (event?.type === 'sample:done') {
              console.log(`[evaluation:contract] ${event.status} ${event.sampleId}`);
            }
          }
        : null,
    });
    const independentBenchmark = await runIndependentBenchmarkAudit({
      mode: profile === 'release' ? 'strict' : 'advisory',
    });
    const qualityBenchmark = await runQualityBenchmarkAudit({
      mode: profile === 'release' ? 'validation' : 'structure',
      unlockHeldout: profile === 'release' && process.env.QUALITY_BENCHMARK_UNLOCK_HELDOUT === 'true',
    });
    const productionCanary = await runProductionCanaryAudit({ mode: profile === 'release' ? 'strict' : 'advisory' });
    const tiers = { contract, qualityBenchmark, independentBenchmark, productionCanary };
    const report = {
      meta: { generatedAt: new Date().toISOString(), profile, schemaVersion: 1 },
      summary: buildEvaluationSystemSummary(tiers, profile),
      tiers,
    };
    await writeReport(report, outputDir);
    return report;
  } finally {
    await closeHybridPipelineAuditRuntime();
  }
}

function parseArgs(argv) {
  const args = {
    profile: 'main',
    changedFrom: process.env.CONTRACT_CHANGED_BASE || '',
    outputDir: DEFAULT_OUTPUT_DIR,
    contractSampleIds: [],
    progress: true,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--profile') args.profile = argv[++index] || args.profile;
    else if (arg === '--changed-from') args.changedFrom = argv[++index] || '';
    else if (arg === '--output') args.outputDir = path.resolve(argv[++index] || args.outputDir);
    else if (arg === '--sample' || arg === '--samples') {
      args.contractSampleIds.push(
        ...String(argv[++index] || '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      );
    } else if (arg === '--no-progress') args.progress = false;
    else if (arg === '--help' || arg === '-h') args.help = true;
  }
  if (!PROFILE_POLICY[args.profile]) throw new Error('Expected --profile pr|main|release');
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node scripts/evaluationSystemAudit.mjs [--profile pr|main|release] [--changed-from SHA]');
    return;
  }
  const report = await runEvaluationSystemAudit(args);
  console.log(`Layered evaluation: ${report.summary.status}`);
  console.log(`Claim status: ${report.summary.claimStatus}`);
  console.log(`Report: ${path.join(args.outputDir, 'latest.md')}`);
  if (report.summary.status !== 'pass') process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
