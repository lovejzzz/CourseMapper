#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { assessScionKeyTerm, assessScionMcItem } from '../src/lib/scionPreferenceGate.js';

const RELEASE = 'v0.16.49';
const GENERATED_AT = '2026-07-17T11:15:00.000Z';
const CORPUS = 'evaluation/scion-adapters/evidence/codex-approved-preferences-v0.16.47.jsonl';
const JUDGE_CAMPAIGN = 'evaluation/scion-adapters/evidence/judge-campaign-v0.16.47.json';
const RECEIPT = 'evaluation/scion-adapters/evidence/semantic-admission-v2-v0.16.49.json';
const PREVIOUS_RECEIPT = 'evaluation/scion-adapters/evidence/semantic-admission-v2-v0.16.48.json';
const IMPLEMENTATION = [
  'src/lib/scionAnswerKeyAlignment.js',
  'src/lib/scionPreferenceGate.js',
  'src/lib/scionKeyTermContract.js',
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

function histogram(values) {
  return Object.fromEntries(
    [...new Set(values)].sort().map((value) => [value, values.filter((entry) => entry === value).length]),
  );
}

function assess(row, side, semanticProfile) {
  const artifact = JSON.parse(row[side]);
  if (row.kind === 'mc-item') {
    return assessScionMcItem(artifact, {
      sourceClaims: row.sourceContext?.claims || [],
      semanticProfile,
    });
  }
  return assessScionKeyTerm(artifact, {
    knownFacts: row.sourceContext?.claims || [],
    sourceTerm: row.sourceContext?.term || '',
    semanticProfile,
  });
}

function summarize(rows) {
  const evaluated = rows.map((row) => ({
    row,
    legacyChosen: assess(row, 'chosen', 'legacy'),
    legacyRejected: assess(row, 'rejected', 'legacy'),
    strictChosen: assess(row, 'chosen', 'source-strict-v3'),
    strictRejected: assess(row, 'rejected', 'source-strict-v3'),
  }));
  const caught = evaluated.filter((entry) => !entry.strictRejected.eligible);
  const preferredRegressions = evaluated.filter((entry) => !entry.strictChosen.eligible);
  const margins = evaluated.filter((entry) => entry.strictChosen.eligible && !entry.strictRejected.eligible);
  const domains = [...new Set(rows.map((row) => row.domain))].sort();
  const kinds = [...new Set(rows.map((row) => row.kind))].sort();
  return {
    rows: rows.length,
    legacy: {
      preferredEligible: evaluated.filter((entry) => entry.legacyChosen.eligible).length,
      rejectedDetected: evaluated.filter((entry) => !entry.legacyRejected.eligible).length,
    },
    strict: {
      preferredEligible: evaluated.filter((entry) => entry.strictChosen.eligible).length,
      preferredRegressions: preferredRegressions.length,
      rejectedDetected: caught.length,
      preferredOnlyMargins: margins.length,
      rejectedIssueHistogram: histogram(caught.flatMap((entry) => entry.strictRejected.issues)),
      byDomain: Object.fromEntries(
        domains.map((domain) => {
          const subset = evaluated.filter((entry) => entry.row.domain === domain);
          return [
            domain,
            {
              rows: subset.length,
              rejectedDetected: subset.filter((entry) => !entry.strictRejected.eligible).length,
              preferredRegressions: subset.filter((entry) => !entry.strictChosen.eligible).length,
            },
          ];
        }),
      ),
      byKind: Object.fromEntries(
        kinds.map((kind) => {
          const subset = evaluated.filter((entry) => entry.row.kind === kind);
          return [
            kind,
            {
              rows: subset.length,
              rejectedDetected: subset.filter((entry) => !entry.strictRejected.eligible).length,
              preferredRegressions: subset.filter((entry) => !entry.strictChosen.eligible).length,
            },
          ];
        }),
      ),
    },
  };
}

export async function buildScionSemanticAdmissionV2Audit({ cwd = process.cwd() } = {}) {
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
  const all = summarize(rows);
  const currentCampaign = summarize(currentRows);
  const historicalCore = summarize(historicalRows);
  const detectionDelta = all.strict.rejectedDetected - previous.allStablePreferences.strict.rejectedDetected;
  const assertions = {
    corpusBound:
      campaign.approvedCorpus.path === CORPUS &&
      campaign.approvedCorpus.sha256 === sha256(corpusRaw) &&
      campaign.approvedCorpus.rows === rows.length,
    exactStableLossCorpus: rows.length === 78,
    exactCurrentCampaignRows: currentRows.length === 32,
    noPreferredArtifactRegression: all.strict.preferredRegressions === 0,
    stableLossDetectionLift:
      previous.release === 'v0.16.48' &&
      previous.allStablePreferences.strict.rejectedDetected === 64 &&
      all.strict.rejectedDetected === 68 &&
      all.strict.preferredOnlyMargins === 68 &&
      all.strict.byKind['key-term'].rejectedDetected === 24 &&
      all.strict.byKind['mc-item'].rejectedDetected === 44 &&
      detectionDelta === 4 &&
      all.strict.rejectedDetected > all.legacy.rejectedDetected,
    currentCampaignDetection:
      currentCampaign.strict.rejectedDetected === 26 && currentCampaign.strict.preferredRegressions === 0,
    historicalCoreDetection:
      historicalCore.rows === 46 &&
      historicalCore.strict.rejectedDetected === 42 &&
      historicalCore.strict.preferredRegressions === 0,
  };
  const failures = Object.entries(assertions)
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (failures.length > 0) {
    throw new Error(
      `Semantic admission v2 audit failed: ${failures.join(', ')}; observed=${JSON.stringify({
        allDetected: all.strict.rejectedDetected,
        allMargins: all.strict.preferredOnlyMargins,
        keyTermsDetected: all.strict.byKind['key-term']?.rejectedDetected,
        currentDetected: currentCampaign.strict.rejectedDetected,
        historicalDetected: historicalCore.strict.rejectedDetected,
        preferredRegressions: all.strict.preferredRegressions,
      })}`,
    );
  }

  return {
    schemaVersion: 1,
    protocol: 'scion-semantic-admission-v3-replay-v1',
    release: RELEASE,
    generatedAt: GENERATED_AT,
    status: 'judge-informed-semantic-admission-improved',
    evidence: {
      approvedCorpus: {
        path: CORPUS,
        bytes: Buffer.byteLength(corpusRaw),
        sha256: sha256(corpusRaw),
        rows: rows.length,
      },
      judgeCampaign: { path: JUDGE_CAMPAIGN, bytes: Buffer.byteLength(campaignRaw), sha256: sha256(campaignRaw) },
      currentPacketId: campaign.packet.packetId,
      previousRelease: {
        path: PREVIOUS_RECEIPT,
        bytes: Buffer.byteLength(previousRaw),
        sha256: sha256(previousRaw),
        release: previous.release,
        rejectedDetected: previous.allStablePreferences.strict.rejectedDetected,
      },
      implementation,
    },
    allStablePreferences: all,
    currentCampaign,
    historicalCore,
    deltas: {
      stableLossesDetected: detectionDelta,
      keyTermLossesDetected:
        all.strict.byKind['key-term'].rejectedDetected -
        previous.allStablePreferences.strict.byKind['key-term'].rejectedDetected,
      mcItemLossesDetected:
        all.strict.byKind['mc-item'].rejectedDetected -
        previous.allStablePreferences.strict.byKind['mc-item'].rejectedDetected,
      stableLossesRemaining: rows.length - all.strict.rejectedDetected,
      historicalCoreLossesRemaining: historicalRows.length - historicalCore.strict.rejectedDetected,
      preferredRegressions: all.strict.preferredRegressions,
    },
    assertions,
    interpretation:
      'The judge-informed compiler profile now retries MC explanations that label every distractor but never teach the keyed answer, detects broad source-supported answer ambiguity, and rejects compact misconception text that merely repeats a known fact. On the frozen 78-loss replay this adds four detections—one key-term loss and three MC losses—without rejecting a preferred artifact.',
    claimBoundary:
      'This retrospective replay proves deterministic detection lift on 78 already judged stable losses with zero rejection of their preferred counterparts. It does not rewrite response text or prove retry success. The evidence comes from one anonymous, hash-bound Codex judge campaign and is not independent human, held-out classroom, adapter-quality, or unseen-output precision evidence; burden and fresh-package behavior remain separate gates.',
  };
}

export async function runScionSemanticAdmissionV2Audit({ cwd = process.cwd(), write = false } = {}) {
  const report = await buildScionSemanticAdmissionV2Audit({ cwd });
  const output = path.resolve(cwd, RECEIPT);
  if (write) {
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, canonical(report));
  } else {
    const tracked = await fs.readFile(output, 'utf8');
    if (tracked !== canonical(report)) throw new Error('Tracked semantic admission v2 receipt is stale');
  }
  return { report, output, wrote: write };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if ([...args].some((arg) => arg !== '--write')) throw new Error('Unknown semantic admission v2 option');
  const result = await runScionSemanticAdmissionV2Audit({ write: args.has('--write') });
  console.log(
    `Scion semantic admission v2: ${result.report.allStablePreferences.strict.rejectedDetected}/78 stable losses detected; ${result.report.allStablePreferences.strict.preferredRegressions} preferred regressions.`,
  );
  console.log(`${result.wrote ? 'Wrote' : 'Verified'}: ${path.relative(process.cwd(), result.output)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}
