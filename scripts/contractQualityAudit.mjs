#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  DEFAULT_GOLD_SAMPLES,
  buildGoldSampleQualityAudit,
  closeHybridPipelineAuditRuntime,
  selectGoldSamples,
  writeGoldSampleQualityAudit,
} from './goldSampleQualityAudit.mjs';

const ROOT = process.cwd();
const DEFAULT_OUTPUT_DIR = path.join(ROOT, 'verification-output', 'contract-quality-audit');
const LEGACY_OUTPUT_DIR = path.join(ROOT, 'verification-output', 'gold-sample-quality-audit');

export const PR_CONTRACT_SAMPLE_IDS = [
  'gold-research-methods-short-5',
  'gold-research-methods-semester-14',
  'gold-interaction-design-studio-8',
  'gold-clinical-placement-8',
  'gold-biology-lab-8',
  'gold-online-writing-workshop-8',
  'gold-quantitative-problem-set-8',
  'gold-lecture-exam-8',
  'gold-programming-lab-8',
  'gold-business-strategy-case-8',
  'gold-teacher-preparation-8',
  'gold-sparse-assessment-resilience-8',
];

const IMPACT_RULES = [
  {
    pattern: /scripts\/(?:goldSampleQualityAudit|contractQualityAudit)\.mjs|scripts\/__tests__\/goldSampleQualityAudit/,
    all: true,
  },
  {
    pattern: /src\/lib\/(?:courseBlueprintCompiler|courseGraph|compiledLanguageFinalizer|courseIR)/,
    sampleIds: [
      'gold-quantitative-problem-set-8',
      'gold-lecture-exam-8',
      'gold-programming-lab-8',
      'gold-clinical-judgment-8',
      'gold-multi-section-seminar-8',
    ],
  },
  {
    pattern: /src\/lib\/(?:knowledge|source|genome)/,
    sampleIds: ['gold-interaction-design-studio-8', 'gold-information-literacy-8', 'gold-community-health-8'],
  },
  {
    pattern: /src\/(?:lib|hooks)\/(?:.*export|package|docx|pptx|xlsx|useDeliverables)/i,
    sampleIds: ['gold-biology-lab-8', 'gold-online-writing-workshop-8', 'gold-interaction-design-studio-8'],
  },
  {
    pattern: /src\/lib\/(?:quality|deepQualityGrader|textureMetric|contentQuality)/,
    sampleIds: ['gold-creative-writing-8', 'gold-business-strategy-case-8', 'gold-counseling-practice-8'],
  },
];

function parseArgs(argv) {
  const args = {
    profile: 'full',
    outputDir: DEFAULT_OUTPUT_DIR,
    changedFrom: process.env.CONTRACT_CHANGED_BASE || '',
    sampleIds: [],
    progress: true,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--profile') args.profile = argv[++index] || args.profile;
    else if (arg === '--output') args.outputDir = path.resolve(argv[++index] || args.outputDir);
    else if (arg === '--changed-from') args.changedFrom = argv[++index] || '';
    else if (arg === '--sample' || arg === '--samples') {
      args.sampleIds.push(
        ...String(argv[++index] || '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      );
    } else if (arg === '--no-progress') args.progress = false;
    else if (arg === '--help' || arg === '-h') args.help = true;
  }
  if (!['pr', 'full'].includes(args.profile)) {
    throw new Error(`Unsupported contract profile "${args.profile}". Expected "pr" or "full".`);
  }
  return args;
}

function readChangedFiles(changedFrom) {
  const base = String(changedFrom || '').trim();
  try {
    const gitArgs = base ? ['diff', '--name-only', `${base}...HEAD`] : ['diff', '--name-only', 'HEAD^', 'HEAD'];
    return execFileSync('git', gitArgs, { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .map((value) => value.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function selectImpactedContractSampleIds(changedFiles = []) {
  const selected = new Set();
  for (const file of changedFiles) {
    for (const rule of IMPACT_RULES) {
      if (!rule.pattern.test(file)) continue;
      if (rule.all) return DEFAULT_GOLD_SAMPLES.map((sample) => sample.id);
      for (const sampleId of rule.sampleIds || []) selected.add(sampleId);
    }
  }
  return [...selected];
}

export function selectContractSamples({ profile = 'full', sampleIds = [], changedFiles = [] } = {}) {
  if (sampleIds.length > 0) return selectGoldSamples({ sampleIds });
  if (profile === 'full') return DEFAULT_GOLD_SAMPLES;
  const ids = new Set(PR_CONTRACT_SAMPLE_IDS);
  for (const sampleId of selectImpactedContractSampleIds(changedFiles)) ids.add(sampleId);
  return selectGoldSamples({ sampleIds: [...ids] });
}

function scopeCoverage(samples) {
  const scopes = [...new Set(samples.map((sample) => Number(sample.scope)).filter(Number.isFinite))].sort(
    (a, b) => a - b,
  );
  const missingScopes = [5, 8, 14].filter((scope) => !scopes.includes(scope));
  return { scopes, missingScopes, status: missingScopes.length === 0 ? 'pass' : 'fail' };
}

export function buildContractSummary(payload, { profile, changedFiles, samples }) {
  const coverage = scopeCoverage(samples);
  const status = payload.summary.status === 'pass' && coverage.status === 'pass' ? 'pass' : 'fail';
  return {
    status,
    profile,
    fixtureCount: samples.length,
    totalAvailableFixtures: DEFAULT_GOLD_SAMPLES.length,
    scopeCoverage: coverage,
    changedFiles,
    compilerStatus: payload.summary.status,
    blockers: payload.summary.blockers + coverage.missingScopes.length,
    warnings: payload.summary.warnings,
    claimBoundary:
      'This suite verifies deterministic compiler and package contracts. It is not independent evidence of classroom quality.',
  };
}

function renderMarkdown(report) {
  const resultRows = report.results.map(
    (result) =>
      `| ${result.sampleId} | ${result.scope ?? ''} | ${result.summary.status} | ${result.summary.minQuality ?? ''} | ${result.summary.minExcellence ?? ''} | ${result.summary.blockerCount ?? 0} | ${result.summary.warningCount ?? 0} |`,
  );
  return [
    '# Compiler Contract Audit',
    '',
    `Generated: ${report.meta.generatedAt}`,
    `Profile: ${report.summary.profile}`,
    `Status: ${report.summary.status}`,
    `Fixtures: ${report.summary.fixtureCount}/${report.summary.totalAvailableFixtures}`,
    `Scope coverage: ${report.summary.scopeCoverage.status} (${report.summary.scopeCoverage.scopes.join(', ')})`,
    '',
    `> ${report.summary.claimBoundary}`,
    '',
    '## Fixture Matrix',
    '',
    '| Fixture | Scope | Status | Quality | Excellence | Blockers | Warnings |',
    '| --- | ---: | --- | ---: | ---: | ---: | ---: |',
    ...resultRows,
    '',
    '## Change Selection',
    '',
    ...(report.summary.changedFiles.length > 0
      ? report.summary.changedFiles.map((file) => `- ${file}`)
      : ['- No changed-file expansion was available; the profile baseline was used.']),
    '',
    'The legacy `audit:gold` command and report remain available for compatibility. New CI and release policy should use the contract profile names.',
    '',
  ].join('\n');
}

async function writeReport(report, outputDir) {
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`);
  await fs.writeFile(path.join(outputDir, 'latest.md'), `${renderMarkdown(report)}\n`);
}

export async function runContractQualityAudit(options = {}) {
  const profile = options.profile || 'full';
  const changedFiles = options.changedFiles || readChangedFiles(options.changedFrom);
  const samples = selectContractSamples({
    profile,
    sampleIds: options.sampleIds || [],
    changedFiles,
  });
  const payload = await buildGoldSampleQualityAudit({
    samples,
    onProgress: options.onProgress,
    requiredScopes: profile === 'full' && !(options.sampleIds || []).length ? [5, 8, 14] : [],
  });
  const summary = buildContractSummary(payload, { profile, changedFiles, samples });
  const report = {
    meta: {
      ...payload.meta,
      evaluationRole: 'compiler-contract',
      independentHumanEvidence: false,
    },
    summary,
    results: payload.results,
    auditFindings: payload.auditFindings || [],
  };
  await writeReport(report, options.outputDir || DEFAULT_OUTPUT_DIR);
  await writeGoldSampleQualityAudit(payload, LEGACY_OUTPUT_DIR);
  return report;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      'Usage: node scripts/contractQualityAudit.mjs [--profile pr|full] [--changed-from SHA] [--sample IDS] [--output DIR]',
    );
    return;
  }
  try {
    const report = await runContractQualityAudit({
      ...args,
      changedFiles: readChangedFiles(args.changedFrom),
      onProgress: args.progress
        ? (event) => {
            if (event?.type === 'sample:start') console.log(`[contract] start ${event.sampleId}`);
            if (event?.type === 'sample:done') console.log(`[contract] ${event.status} ${event.sampleId}`);
          }
        : null,
    });
    console.log(`Compiler contract audit: ${report.summary.status}`);
    console.log(`Profile: ${report.summary.profile}`);
    console.log(`Fixtures: ${report.summary.fixtureCount}/${report.summary.totalAvailableFixtures}`);
    console.log(`Report: ${path.join(args.outputDir, 'latest.md')}`);
    if (report.summary.status !== 'pass') process.exitCode = 1;
  } finally {
    await closeHybridPipelineAuditRuntime();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
