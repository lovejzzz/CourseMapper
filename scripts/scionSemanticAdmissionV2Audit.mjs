#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { assessScionKeyTerm, assessScionMcItem } from '../src/lib/scionPreferenceGate.js';

const RELEASE = 'v0.16.47';
const GENERATED_AT = '2026-07-16T22:15:00.000Z';
const CORPUS = 'evaluation/scion-adapters/evidence/codex-approved-preferences-v0.16.47.jsonl';
const JUDGE_CAMPAIGN = 'evaluation/scion-adapters/evidence/judge-campaign-v0.16.47.json';
const RECEIPT = 'evaluation/scion-adapters/evidence/semantic-admission-v2-v0.16.47.json';
const IMPLEMENTATION = [
  'src/lib/scionAnswerKeyAlignment.js',
  'src/lib/scionPreferenceGate.js',
  'src/lib/scionKeyTermContract.js',
  'src/lib/scionPasses.js',
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
    semanticProfile,
  });
}

function summarize(rows) {
  const evaluated = rows.map((row) => ({
    row,
    legacyChosen: assess(row, 'chosen', 'legacy'),
    legacyRejected: assess(row, 'rejected', 'legacy'),
    strictChosen: assess(row, 'chosen', 'strict'),
    strictRejected: assess(row, 'rejected', 'strict'),
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
  const [corpusRaw, campaignRaw, implementation] = await Promise.all([
    fs.readFile(path.join(root, CORPUS), 'utf8'),
    fs.readFile(path.join(root, JUDGE_CAMPAIGN), 'utf8'),
    Promise.all(
      IMPLEMENTATION.map(async (file) => {
        const raw = await fs.readFile(path.join(root, file));
        return { path: file, bytes: raw.length, sha256: sha256(raw) };
      }),
    ),
  ]);
  const campaign = JSON.parse(campaignRaw);
  const rows = corpusRaw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map(JSON.parse);
  const currentRows = rows.filter((row) => row.reviewPacketId === campaign.packet.packetId);
  const all = summarize(rows);
  const currentCampaign = summarize(currentRows);
  const assertions = {
    corpusBound:
      campaign.approvedCorpus.path === CORPUS &&
      campaign.approvedCorpus.sha256 === sha256(corpusRaw) &&
      campaign.approvedCorpus.rows === rows.length,
    exactStableLossCorpus: rows.length === 78,
    exactCurrentCampaignRows: currentRows.length === 32,
    noPreferredArtifactRegression: all.strict.preferredRegressions === 0,
    stableLossDetectionLift:
      all.strict.rejectedDetected === 50 &&
      all.strict.preferredOnlyMargins === 50 &&
      all.strict.rejectedDetected > all.legacy.rejectedDetected,
    currentCampaignDetection:
      currentCampaign.strict.rejectedDetected === 20 && currentCampaign.strict.preferredRegressions === 0,
  };
  const failures = Object.entries(assertions)
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (failures.length > 0) throw new Error(`Semantic admission v2 audit failed: ${failures.join(', ')}`);

  return {
    schemaVersion: 1,
    protocol: 'scion-semantic-admission-v2-replay-v1',
    release: RELEASE,
    generatedAt: GENERATED_AT,
    status: 'stable-loss-detection-improved',
    evidence: {
      approvedCorpus: {
        path: CORPUS,
        bytes: Buffer.byteLength(corpusRaw),
        sha256: sha256(corpusRaw),
        rows: rows.length,
      },
      judgeCampaign: { path: JUDGE_CAMPAIGN, bytes: Buffer.byteLength(campaignRaw), sha256: sha256(campaignRaw) },
      currentPacketId: campaign.packet.packetId,
      implementation,
    },
    allStablePreferences: all,
    currentCampaign,
    assertions,
    claimBoundary:
      'This retrospective replay proves deterministic detection lift on 78 already judged stable losses with zero rejection of their preferred counterparts. It is not an independent, human, held-out, classroom, or adapter-quality result; unseen-output precision remains a separate gate.',
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
