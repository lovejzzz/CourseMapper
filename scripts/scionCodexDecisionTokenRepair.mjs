#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const SCION_CODEX_DECISION_TOKEN_REPAIR_PROTOCOL = 'scion-codex-decision-token-repair-v1';

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function bytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function completeScorecard(scorecard) {
  const scores = scorecard?.scores;
  return (
    scorecard?.evaluationStatus === 'scored' &&
    scores &&
    Object.keys(scores).length === 5 &&
    Object.values(scores).every((score) => Number.isInteger(score) && score >= 1 && score <= 5)
  );
}

function validPreference(preference) {
  if (preference?.scoredBeforePreference !== true || typeof preference?.rationale !== 'string') return false;
  if (preference.rationale.length <= 20 || !Array.isArray(preference.decisionDefects)) return false;
  if (preference.decision === 'first-artifact') return preference.winnerPosition === 1;
  if (preference.decision === 'second-artifact') return preference.winnerPosition === 2;
  if (['winner'].includes(preference.decision)) return [1, 2].includes(preference.winnerPosition);
  if (['tie', 'insufficient-evidence'].includes(preference.decision)) return preference.winnerPosition == null;
  return false;
}

export async function normalizeScionCodexDecisionTokens({ decisionsDir, receiptOutput, generatedAt } = {}) {
  if (!decisionsDir || !receiptOutput || !generatedAt || Number.isNaN(Date.parse(generatedAt))) {
    throw new Error('Decision-token normalization requires decisionsDir, receiptOutput, and a valid generatedAt');
  }
  const entries = (await fs.readdir(decisionsDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /^chunk-\d{2}-decisions-(?:a-b|b-a)\.json$/.test(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name));
  if (entries.length === 0) throw new Error('No chunk decision files found for decision-token normalization');

  const files = [];
  let decisionsVisited = 0;
  let repairsApplied = 0;
  for (const entry of entries) {
    const filePath = path.join(decisionsDir, entry.name);
    const before = await fs.readFile(filePath);
    const document = JSON.parse(before);
    let fileRepairs = 0;
    for (const decision of document.decisions || []) {
      decisionsVisited += 1;
      if (!(decision.scorecards || []).every(completeScorecard)) {
        throw new Error(`${entry.name}:${decision.pairId} has incomplete scorecards`);
      }
      if (!validPreference(decision.preference)) {
        throw new Error(`${entry.name}:${decision.pairId} has an invalid or inconsistent preference`);
      }
      if (['first-artifact', 'second-artifact'].includes(decision.preference.decision)) {
        decision.preference.decision = 'winner';
        fileRepairs += 1;
      }
    }
    const after = bytes(document);
    await fs.writeFile(filePath, after);
    files.push({
      file: entry.name,
      beforeSha256: hash(before),
      afterSha256: hash(after),
      decisions: (document.decisions || []).length,
      repairsApplied: fileRepairs,
    });
    repairsApplied += fileRepairs;
  }
  if (repairsApplied === 0) throw new Error('Decision-token normalization found no positional decision labels');
  const receipt = {
    schemaVersion: 1,
    protocol: SCION_CODEX_DECISION_TOKEN_REPAIR_PROTOCOL,
    generatedAt,
    files,
    decisionsVisited,
    repairsApplied,
    repair: {
      field: 'decisions[].preference.decision',
      from: ['first-artifact', 'second-artifact'],
      to: 'winner',
      winnerPositionPrecondition: 'first-artifact requires 1; second-artifact requires 2',
      scoreValuesChanged: false,
      winnerPositionsChanged: false,
      rationalesChanged: false,
      evidenceChanged: false,
      defectsChanged: false,
    },
    claimBoundary:
      'This deterministic schema normalization changes only two positional enum spellings to the canonical winner token after verifying the existing winnerPosition. It does not alter or disclose a score, winner position, rationale, evidence statement, or defect.',
  };
  await fs.mkdir(path.dirname(path.resolve(receiptOutput)), { recursive: true });
  await fs.writeFile(receiptOutput, bytes(receipt));
  return { receipt, receiptOutput: path.resolve(receiptOutput) };
}

function parseArgs(argv) {
  const args = { decisionsDir: '', receiptOutput: '', generatedAt: '' };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--decisions-dir') args.decisionsDir = argv[++index] || '';
    else if (argv[index] === '--receipt') args.receiptOutput = argv[++index] || '';
    else if (argv[index] === '--generated-at') args.generatedAt = argv[++index] || '';
    else throw new Error(`Unknown decision-token normalization option: ${argv[index]}`);
  }
  return args;
}

async function main() {
  const result = await normalizeScionCodexDecisionTokens(parseArgs(process.argv.slice(2)));
  console.log(`Scion decision-token repairs: ${result.receipt.repairsApplied}/${result.receipt.decisionsVisited}`);
  console.log(`Receipt: ${result.receiptOutput}`);
  console.log('Scores and winner positions changed: false');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}
