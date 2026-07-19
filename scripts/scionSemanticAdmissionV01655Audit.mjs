#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { summarizeScionSemanticAdmissionRows } from './scionSemanticAdmissionV2Audit.mjs';

const RELEASE = 'v0.16.55';
const GENERATED_AT = '2026-07-19T08:40:00.000Z';
const PRODUCTION_PROFILE = 'source-strict-v6';
const FROZEN_PROFILE = 'source-strict-v4';
const CORPUS = 'evaluation/scion-adapters/evidence/codex-approved-preferences-v0.16.47.jsonl';
const JUDGE_CAMPAIGN = 'evaluation/scion-adapters/evidence/judge-campaign-v0.16.47.json';
const PREVIOUS_RECEIPT = 'evaluation/scion-adapters/evidence/semantic-admission-v2-v0.16.50.json';
const RECEIPT = 'evaluation/scion-adapters/evidence/semantic-admission-v2-v0.16.55.json';
const IMPLEMENTATION = [
  'src/lib/scionAnswerKeyAlignment.js',
  'src/lib/scionPreferenceGate.js',
  'src/lib/scionKeyTermContract.js',
  'src/lib/itemAdmissionLint.js',
  'src/lib/scionPasses.js',
  'src/lib/publicScionProvider.js',
  'src/lib/blueprintEnrichmentPass.js',
  'scripts/lib/scionSourceCapture.mjs',
];

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function canonical(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function stableSummary(summary) {
  return {
    rows: summary.rows,
    preferredEligible: summary.strict.preferredEligible,
    preferredRegressions: summary.strict.preferredRegressions,
    rejectedDetected: summary.strict.rejectedDetected,
    preferredOnlyMargins: summary.strict.preferredOnlyMargins,
    byDomain: summary.strict.byDomain,
    byKind: summary.strict.byKind,
    rejectedIssueHistogram: summary.strict.rejectedIssueHistogram,
  };
}

export async function buildScionSemanticAdmissionV01655Audit({ cwd = process.cwd() } = {}) {
  const root = path.resolve(cwd);
  const [corpusRaw, campaignRaw, previousRaw, implementation] = await Promise.all([
    fs.readFile(path.join(root, CORPUS), 'utf8'),
    fs.readFile(path.join(root, JUDGE_CAMPAIGN), 'utf8'),
    fs.readFile(path.join(root, PREVIOUS_RECEIPT), 'utf8'),
    Promise.all(
      IMPLEMENTATION.map(async (file) => {
        const raw = await fs.readFile(path.join(root, file));
        return { path: file, bytes: raw.length, sha256: sha256(raw) };
      }),
    ),
  ]);
  const campaign = JSON.parse(campaignRaw);
  const previous = JSON.parse(previousRaw);
  const rows = corpusRaw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map(JSON.parse);
  const currentRows = rows.filter((row) => row.reviewPacketId === campaign.packet.packetId);
  const historicalRows = rows.filter((row) => row.reviewPacketId !== campaign.packet.packetId);

  const production = summarizeScionSemanticAdmissionRows(rows, PRODUCTION_PROFILE);
  const frozen = summarizeScionSemanticAdmissionRows(rows, FROZEN_PROFILE);
  const productionCurrentCampaign = summarizeScionSemanticAdmissionRows(currentRows, PRODUCTION_PROFILE);
  const productionHistoricalCore = summarizeScionSemanticAdmissionRows(historicalRows, PRODUCTION_PROFILE);
  const previousDetected = Number(previous?.allStablePreferences?.strict?.rejectedDetected || 0);
  const previousPreferredRegressions = Number(previous?.allStablePreferences?.strict?.preferredRegressions || 0);

  const assertions = {
    corpusBound:
      campaign.approvedCorpus.path === CORPUS &&
      campaign.approvedCorpus.sha256 === sha256(corpusRaw) &&
      campaign.approvedCorpus.rows === rows.length,
    exactStableLossCorpus: rows.length === 78,
    currentProductionDetectsEveryStableLoss:
      production.strict.rejectedDetected === 78 && production.strict.preferredOnlyMargins === 78,
    currentProductionPreservesEveryPreferredArtifact:
      production.strict.preferredEligible === 78 && production.strict.preferredRegressions === 0,
    exactProductionKindCoverage:
      production.strict.byKind['key-term']?.rejectedDetected === 34 &&
      production.strict.byKind['mc-item']?.rejectedDetected === 44,
    exactProductionCampaignCoverage:
      productionCurrentCampaign.rows === 32 &&
      productionCurrentCampaign.strict.rejectedDetected === 32 &&
      productionCurrentCampaign.strict.preferredRegressions === 0,
    exactProductionHistoricalCoreCoverage:
      productionHistoricalCore.rows === 46 &&
      productionHistoricalCore.strict.rejectedDetected === 46 &&
      productionHistoricalCore.strict.preferredRegressions === 0,
    productionRetainsFrozenRuler:
      production.strict.rejectedDetected === frozen.strict.rejectedDetected &&
      production.strict.preferredRegressions === frozen.strict.preferredRegressions,
    previousReceiptBound:
      previous.release === 'v0.16.50' && previousDetected === 78 && previousPreferredRegressions === 0,
  };
  const failures = Object.entries(assertions)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  if (failures.length > 0) {
    throw new Error(
      `Scion v0.16.55 semantic admission audit failed: ${failures.join(', ')}; observed=${JSON.stringify({
        production: stableSummary(production),
        frozen: stableSummary(frozen),
      })}`,
    );
  }

  return {
    schemaVersion: 1,
    protocol: 'scion-semantic-admission-current-production-replay-v1',
    release: RELEASE,
    generatedAt: GENERATED_AT,
    status: 'current-production-profile-bound-on-frozen-losses',
    profiles: {
      production: PRODUCTION_PROFILE,
      frozenComparison: FROZEN_PROFILE,
    },
    evidence: {
      approvedCorpus: {
        path: CORPUS,
        bytes: Buffer.byteLength(corpusRaw),
        sha256: sha256(corpusRaw),
        rows: rows.length,
      },
      judgeCampaign: {
        path: JUDGE_CAMPAIGN,
        bytes: Buffer.byteLength(campaignRaw),
        sha256: sha256(campaignRaw),
        packetId: campaign.packet.packetId,
      },
      previousReceipt: {
        path: PREVIOUS_RECEIPT,
        bytes: Buffer.byteLength(previousRaw),
        sha256: sha256(previousRaw),
        release: previous.release,
      },
      implementation,
    },
    production: stableSummary(production),
    frozenComparison: stableSummary(frozen),
    currentCampaign: stableSummary(productionCurrentCampaign),
    historicalCore: stableSummary(productionHistoricalCore),
    deltasFromV01650: {
      stableLossesDetected: production.strict.rejectedDetected - previousDetected,
      preferredRegressions: production.strict.preferredRegressions - previousPreferredRegressions,
    },
    assertions,
    interpretation:
      'The current source-strict-v6 production gate retains the frozen source-strict-v4 result: all 78 judged losing atoms are rejected, all 78 preferred counterparts remain eligible, and the result holds across every represented domain and both key-term and multiple-choice families.',
    claimBoundary:
      'This is retrospective deterministic replay on already judged source atoms. It proves current production-profile detection and preferred-artifact preservation on that frozen surface, not unseen precision, fresh retry success, human review, classroom outcomes, adapter quality, or paid-reference parity. No model call is made and no response text is rewritten.',
  };
}

export async function runScionSemanticAdmissionV01655Audit({ cwd = process.cwd(), write = false } = {}) {
  const report = await buildScionSemanticAdmissionV01655Audit({ cwd });
  const output = path.resolve(cwd, RECEIPT);
  const serialized = canonical(report);
  if (write) {
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, serialized);
  } else if ((await fs.readFile(output, 'utf8')) !== serialized) {
    throw new Error('Tracked v0.16.55 semantic admission receipt is stale');
  }
  return { report, output, wrote: write };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if ([...args].some((arg) => arg !== '--write')) throw new Error('Unknown v0.16.55 semantic admission option');
  const result = await runScionSemanticAdmissionV01655Audit({ write: args.has('--write') });
  console.log(
    `Scion semantic admission ${PRODUCTION_PROFILE}: ${result.report.production.rejectedDetected}/78 stable losses detected; ${result.report.production.preferredRegressions} preferred regressions.`,
  );
  console.log(`${result.wrote ? 'Wrote' : 'Verified'}: ${path.relative(process.cwd(), result.output)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}
