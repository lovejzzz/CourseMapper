#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { assessScionKeyTerm, assessScionMcItem } from '../src/lib/scionPreferenceGate.js';

const RELEASE = 'v0.16.50';
const GENERATED_AT = '2026-07-18T00:30:00.000Z';
const CORPUS = 'evaluation/scion-adapters/evidence/codex-approved-preferences-v0.16.47.jsonl';
const JUDGE_CAMPAIGN = 'evaluation/scion-adapters/evidence/judge-campaign-v0.16.47.json';
const RECEIPT = 'evaluation/scion-adapters/evidence/semantic-admission-v2-v0.16.50.json';
const PREVIOUS_RECEIPT = 'evaluation/scion-adapters/evidence/semantic-admission-v2-v0.16.49.json';
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

export function summarizeScionSemanticAdmissionRows(rows, semanticProfile = 'source-strict-v4') {
  const evaluated = rows.map((row) => ({
    row,
    legacyChosen: assess(row, 'chosen', 'legacy'),
    legacyRejected: assess(row, 'rejected', 'legacy'),
    strictChosen: assess(row, 'chosen', semanticProfile),
    strictRejected: assess(row, 'rejected', semanticProfile),
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
  const all = summarizeScionSemanticAdmissionRows(rows);
  const currentCampaign = summarizeScionSemanticAdmissionRows(currentRows);
  const historicalCore = summarizeScionSemanticAdmissionRows(historicalRows);
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
      previous.release === 'v0.16.49' &&
      previous.allStablePreferences.strict.rejectedDetected === 68 &&
      all.strict.rejectedDetected === 78 &&
      all.strict.preferredOnlyMargins === 78 &&
      all.strict.byKind['key-term'].rejectedDetected === 34 &&
      all.strict.byKind['mc-item'].rejectedDetected === 44 &&
      detectionDelta === 10 &&
      all.strict.rejectedDetected > all.legacy.rejectedDetected,
    currentCampaignDetection:
      currentCampaign.strict.rejectedDetected === 32 && currentCampaign.strict.preferredRegressions === 0,
    historicalCoreDetection:
      historicalCore.rows === 46 &&
      historicalCore.strict.rejectedDetected === 46 &&
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
    protocol: 'scion-semantic-admission-v4-replay-v1',
    release: RELEASE,
    generatedAt: GENERATED_AT,
    status: 'judge-informed-key-term-coherence-complete-on-frozen-losses',
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
      'The source-strict-v4 compiler profile closes the ten remaining key-term gaps by checking whether each misconception, correction, example, and definition stays aligned with the cited source and with the other fields. On the frozen 78-loss replay this adds ten key-term detections, reaches 78/78 total detections, and keeps all 78 preferred counterparts eligible.',
    claimBoundary:
      'This retrospective replay proves deterministic detection lift on 78 already judged stable losses with zero rejection of their preferred counterparts. The corpus informed these rules, so 78/78 is not unseen precision or held-out effect evidence. The gate does not rewrite response text or prove retry success. Evidence comes from one anonymous, hash-bound Codex judge campaign and is not independent human, classroom, adapter-quality, or paid-reference-parity evidence; burden and fresh-package behavior remain separate gates.',
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
