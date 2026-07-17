#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { assessScionKeyTerm, assessScionMcItem } from '../src/lib/scionPreferenceGate.js';

const RELEASE = 'v0.16.48';
const GENERATED_AT = '2026-07-17T09:20:00.000Z';
const CANDIDATES = 'evaluation/scion-review-candidates-course-group-breadth-v0.16.47.jsonl';
const RECEIPT = 'evaluation/scion-adapters/evidence/source-grounding-burden-v0.16.48.json';
const IMPLEMENTATION = ['src/lib/scionKeyTermContract.js', 'src/lib/scionPreferenceGate.js', 'src/lib/scionPasses.js'];

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
  return row.kind === 'mc-item'
    ? assessScionMcItem(artifact, { sourceClaims: row.sourceContext.claims, semanticProfile: 'strict' })
    : assessScionKeyTerm(artifact, {
        knownFacts: row.sourceContext.claims,
        sourceTerm: row.sourceContext.term,
        semanticProfile,
      });
}

function summarize(rows, side) {
  const evaluated = rows.map((row) => ({
    row,
    previous: assess(row, side, 'strict'),
    current: assess(row, side, 'source-strict'),
  }));
  const newlyRejected = evaluated.filter((entry) => entry.previous.eligible && !entry.current.eligible);
  return {
    rows: rows.length,
    previousEligible: evaluated.filter((entry) => entry.previous.eligible).length,
    currentEligible: evaluated.filter((entry) => entry.current.eligible).length,
    additionalRetrySeats: newlyRejected.length,
    newIssueHistogram: histogram(newlyRejected.flatMap((entry) => entry.current.issues)),
    additionalRetrySeatsByDomain: histogram(newlyRejected.map((entry) => entry.row.domain)),
    additionalRetrySeatsByKind: histogram(newlyRejected.map((entry) => entry.row.kind)),
    newlyRejected: newlyRejected.map((entry) => ({
      candidateSha256: sha256(entry.row[side]),
      sourceContextSha256: sha256(JSON.stringify(entry.row.sourceContext)),
      domain: entry.row.domain,
      kind: entry.row.kind,
      issues: entry.current.issues,
    })),
  };
}

export async function buildScionSourceGroundingBurdenV01648({ cwd = process.cwd() } = {}) {
  const root = path.resolve(cwd);
  const raw = await fs.readFile(path.join(root, CANDIDATES), 'utf8');
  const rows = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map(JSON.parse);
  const candidate = summarize(rows, 'left');
  const reference = summarize(rows, 'right');
  const implementation = await Promise.all(
    IMPLEMENTATION.map(async (file) => {
      const bytes = await fs.readFile(path.join(root, file));
      return { path: file, bytes: bytes.length, sha256: sha256(bytes) };
    }),
  );
  const assertions = {
    exactFrozenSurface: rows.length === 91,
    exactPreviousReplay: candidate.previousEligible === 88 && reference.previousEligible === 85,
    measuredCompilerBurden:
      candidate.currentEligible === 80 &&
      candidate.additionalRetrySeats === 8 &&
      reference.currentEligible === 83 &&
      reference.additionalRetrySeats === 2,
    sourceGroundingTargetsOnlyKeyTerms:
      candidate.additionalRetrySeatsByKind['key-term'] === 8 && reference.additionalRetrySeatsByKind['key-term'] === 2,
  };
  const failures = Object.entries(assertions)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  if (failures.length > 0) {
    throw new Error(`Scion source-grounding burden audit failed: ${failures.join(', ')}`);
  }
  return {
    schemaVersion: 1,
    protocol: 'scion-source-grounded-key-term-burden-replay-v1',
    release: RELEASE,
    generatedAt: GENERATED_AT,
    status: 'measured-retry-burden',
    evidence: {
      candidates: { path: CANDIDATES, bytes: Buffer.byteLength(raw), sha256: sha256(raw), rows: rows.length },
      orientation: {
        left: 'Scion base plus compiler recovery (Gemma 4 E2B)',
        right: 'GPT-5.4-mini',
        boundBy: 'pairSource model labels retained on every row',
      },
      implementation,
    },
    candidate,
    reference,
    assertions,
    interpretation:
      'On 91 retained cross-domain candidate pairs, the new source-grounding layer sends 8 additional Scion key-term seats and 2 additional GPT-5.4-mini key-term seats to regeneration. This is the expected quality cost of refusing generic or source-untraceable terminology; the shared compiler benefits both model routes, while the smaller local model receives more corrective work.',
    claimBoundary:
      'This is deterministic replay on previously sampled, unjudged candidate atoms. It measures admission and estimated retry-seat burden, not actual retry success, model-call count, latency, blind preference, factual correctness, classroom outcomes, or adapter quality. Fresh browser compilation is required before release.',
  };
}

export async function runScionSourceGroundingBurdenV01648({ cwd = process.cwd(), write = false } = {}) {
  const report = await buildScionSourceGroundingBurdenV01648({ cwd });
  const output = path.resolve(cwd, RECEIPT);
  if (write) await fs.writeFile(output, canonical(report));
  else if ((await fs.readFile(output, 'utf8')) !== canonical(report)) {
    throw new Error('Tracked source-grounding burden receipt is stale');
  }
  return { report, output, wrote: write };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if ([...args].some((arg) => arg !== '--write')) throw new Error('Unknown source-grounding burden option');
  const result = await runScionSourceGroundingBurdenV01648({ write: args.has('--write') });
  console.log(
    `Scion source grounding: +${result.report.candidate.additionalRetrySeats} local and +${result.report.reference.additionalRetrySeats} reference retry seats across 91 frozen pairs.`,
  );
  console.log(`${result.wrote ? 'Wrote' : 'Verified'}: ${path.relative(process.cwd(), result.output)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}
