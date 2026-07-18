#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { buildScionAdapterDataset } from './scionAdapterDataset.mjs';

export const SCION_ADAPTER_CORPUS_READINESS_V01647_PROTOCOL = 'scion-adapter-corpus-readiness-v2';
export const SCION_ADAPTER_CORPUS_READINESS_V01647_RELEASE = 'v0.16.47';
export const SCION_ADAPTER_CORPUS_READINESS_V01647_SOURCE =
  'evaluation/scion-adapters/evidence/codex-approved-preferences-v0.16.47-readiness-gap.jsonl';
export const SCION_ADAPTER_CORPUS_READINESS_V01647_CAMPAIGN =
  'evaluation/scion-adapters/evidence/judge-campaign-readiness-gap-v0.16.47.json';
export const SCION_ADAPTER_CORPUS_READINESS_V01647_OUTPUT =
  'evaluation/scion-adapters/evidence/training-corpus-readiness-v0.16.47.json';
// Research authorization was sealed against v1 before any candidate was
// trained. The later implementation-bound v2 ruler governs promotion, not a
// retroactive rewrite of the training-readiness receipt.
const SCION_ADAPTER_TRAINING_READINESS_HELDOUT = 'evaluation/scion-adapters/held-out-course-benchmark-v1.json';

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function stableJson(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function receipt(file, raw) {
  return { path: file, bytes: Buffer.byteLength(raw), sha256: sha256(raw) };
}

function parseArgs(argv) {
  const args = { write: false, output: SCION_ADAPTER_CORPUS_READINESS_V01647_OUTPUT, generatedAt: '' };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--write') args.write = true;
    else if (argv[index] === '--output') args.output = argv[++index];
    else if (argv[index] === '--generated-at') args.generatedAt = argv[++index];
    else throw new Error(`Unknown v0.16.47 corpus-readiness option: ${argv[index]}`);
  }
  return args;
}

function validateCampaignBinding(campaign, sourceReceipt, manifest) {
  const issues = [];
  if (campaign.protocol !== 'scion-readiness-gap-paired-order-campaign-v1') {
    issues.push('campaign-protocol');
  }
  if (campaign.release !== SCION_ADAPTER_CORPUS_READINESS_V01647_RELEASE) issues.push('campaign-release');
  if (campaign.preferenceCountThresholdMet !== true) issues.push('campaign-count-threshold');
  if (campaign.adapterTrainingAuthorized !== false) issues.push('campaign-premature-training-authorization');
  if (campaign.qualifyingTrainingRows !== campaign.approvedCorpus?.rows) issues.push('campaign-row-count');
  if (campaign.approvedCorpus?.path !== sourceReceipt.path) issues.push('campaign-source-path');
  if (campaign.approvedCorpus?.bytes !== sourceReceipt.bytes) issues.push('campaign-source-bytes');
  if (campaign.approvedCorpus?.sha256 !== sourceReceipt.sha256) issues.push('campaign-source-sha256');
  if (manifest.counts.loaded !== campaign.approvedCorpus?.rows) issues.push('dataset-loaded-count');
  if (issues.length > 0) throw new Error(`v0.16.47 campaign/dataset binding failed: ${issues.join(', ')}`);
}

export async function buildScionAdapterCorpusReadinessV01647({ generatedAt } = {}) {
  if (!generatedAt || !Number.isFinite(Date.parse(generatedAt))) {
    throw new Error('v0.16.47 corpus readiness requires a stable generatedAt timestamp');
  }
  const [sourceRaw, campaignRaw] = await Promise.all([
    fs.readFile(SCION_ADAPTER_CORPUS_READINESS_V01647_SOURCE, 'utf8'),
    fs.readFile(SCION_ADAPTER_CORPUS_READINESS_V01647_CAMPAIGN, 'utf8'),
  ]);
  const source = receipt(SCION_ADAPTER_CORPUS_READINESS_V01647_SOURCE, sourceRaw);
  const campaign = JSON.parse(campaignRaw);
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-v01647-corpus-readiness-'));
  try {
    const { manifest } = await buildScionAdapterDataset({
      sources: [SCION_ADAPTER_CORPUS_READINESS_V01647_SOURCE],
      outputDir: temporary,
      heldoutBenchmarkPath: SCION_ADAPTER_TRAINING_READINESS_HELDOUT,
      allowResearch: true,
      allowSmoke: true,
      generatedAt,
      semanticAdmission: true,
      semanticProfile: 'strict',
      allowFirstSentenceLexicalCue: true,
      sourceBoundPrompt: true,
      requireSourceBoundModelJudge: true,
      legacyTrainingContract: false,
    });
    validateCampaignBinding(campaign, source, manifest);
    const researchIssues = manifest.gate.profiles.research.issues;
    const researchTrainingAuthorized =
      campaign.preferenceCountThresholdMet === true &&
      manifest.status === 'research-ready' &&
      researchIssues.length === 0;
    const value = {
      schemaVersion: 2,
      protocol: SCION_ADAPTER_CORPUS_READINESS_V01647_PROTOCOL,
      release: SCION_ADAPTER_CORPUS_READINESS_V01647_RELEASE,
      generatedAt,
      status: researchTrainingAuthorized ? 'research-training-authorized' : 'research-training-blocked',
      sources: {
        approvedPreferences: source,
        judgeCampaign: receipt(SCION_ADAPTER_CORPUS_READINESS_V01647_CAMPAIGN, campaignRaw),
      },
      dataset: {
        identity: manifest.identity,
        status: manifest.status,
        promotable: manifest.promotable,
        counts: manifest.counts,
        domains: manifest.domains,
        modelJudgeDomainCounts: manifest.modelJudgeDomainCounts,
        domainGroupCounts: manifest.domainGroupCounts,
        domainTaskGroupCounts: manifest.domainTaskGroupCounts,
        domainSourceKernelCounts: manifest.domainSourceKernelCounts,
        sourceGroundingPolicy: manifest.sourceGroundingPolicy,
        sourceLicensePolicy: manifest.sourceLicensePolicy,
        holdoutBoundary: manifest.holdoutBoundary,
        splitIdentity: manifest.splitIdentity,
        trainingFormat: manifest.trainingFormat,
        taskScope: manifest.taskScope,
        strictQuarantine: manifest.quarantine,
        gateProfiles: manifest.gate.profiles,
      },
      judgeEvidence: {
        evidenceClass: campaign.evidenceClass,
        completedOrders: campaign.completedOrders,
        completedPerCasePasses: campaign.completedPerCasePasses,
        newStablePreferences: campaign.newStablePreferences,
        qualifyingTrainingRows: campaign.qualifyingTrainingRows,
        minimumResearchPreferences: campaign.minimumResearchPreferences,
        preferenceCountThresholdMet: campaign.preferenceCountThresholdMet,
        stableWinnerByModel: campaign.analysis?.stableWinnerByModel,
        agreementRate: campaign.analysis?.agreementRate,
      },
      authorization: {
        researchTrainingAuthorized,
        adapterPromotionAuthorized: false,
        productionTrainingAuthorized: false,
        blockers: researchIssues,
        nextGate: researchTrainingAuthorized
          ? 'Run a reproducible research-only adapter training attempt, then evaluate the exact adapter against base-only Scion on the frozen held-out benchmark.'
          : 'Add stable preferences from new course groups in under-covered domains, then rebuild this strict gate. Do not train yet.',
      },
      claimBoundary:
        'Passing the 100-row count is necessary but not sufficient. This receipt enforces strict semantic admission, source binding, task and kernel diversity, license disclosure, and a frozen holdout firewall. It is single-model-judge evidence and proves no adapter win or production readiness.',
    };
    value.identity = {
      algorithm: 'sha256-canonical-scion-adapter-corpus-readiness-v2',
      sha256: sha256(stableJson(value)),
    };
    return value;
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const expected = args.write ? null : JSON.parse(await fs.readFile(args.output, 'utf8'));
  const generatedAt = args.generatedAt || expected?.generatedAt;
  const observed = await buildScionAdapterCorpusReadinessV01647({ generatedAt });
  if (args.write) {
    await fs.mkdir(path.dirname(args.output), { recursive: true });
    await fs.writeFile(args.output, `${JSON.stringify(observed, null, 2)}\n`);
  } else if (stableJson(observed) !== stableJson(expected)) {
    throw new Error('Tracked v0.16.47 corpus-readiness evidence does not match a fresh strict rebuild');
  }
  console.log(
    `Scion v0.16.47 corpus readiness: ${observed.status}; ${observed.dataset.counts.total}/${observed.dataset.counts.loaded} strict rows; ${observed.authorization.blockers.length} research blockers.`,
  );
  console.log(`Evidence: ${args.output}`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  main().catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}
