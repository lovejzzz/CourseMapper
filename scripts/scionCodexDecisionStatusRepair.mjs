#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const SCION_CODEX_DECISION_STATUS_REPAIR_PROTOCOL = 'scion-codex-decision-status-repair-v1';

function hashBytes(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function hasCompleteNumericScores(scorecard) {
  const scores = scorecard?.scores;
  return (
    scores &&
    typeof scores === 'object' &&
    Object.keys(scores).length === 5 &&
    Object.values(scores).every((score) => Number.isInteger(score) && score >= 1 && score <= 5)
  );
}

export async function normalizeScionCodexDecisionStatuses({ decisionsDir, receiptOutput, generatedAt } = {}) {
  if (!decisionsDir || !receiptOutput || !generatedAt || Number.isNaN(Date.parse(generatedAt))) {
    throw new Error('Status normalization requires decisionsDir, receiptOutput, and a valid generatedAt');
  }
  const entries = (await fs.readdir(decisionsDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /^chunk-\d{2}-decisions-(?:a-b|b-a)\.json$/.test(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name));
  if (entries.length === 0) throw new Error('No chunk decision files found for status normalization');

  const files = [];
  let scorecardsVisited = 0;
  let repairsApplied = 0;
  for (const entry of entries) {
    const filePath = path.join(decisionsDir, entry.name);
    const beforeRaw = await fs.readFile(filePath);
    const document = JSON.parse(beforeRaw.toString('utf8'));
    let fileRepairs = 0;
    for (const decision of document.decisions || []) {
      for (const scorecard of decision.scorecards || []) {
        scorecardsVisited += 1;
        if (!hasCompleteNumericScores(scorecard)) {
          throw new Error(`${entry.name} contains a scorecard without five complete numeric scores`);
        }
        if (scorecard.evaluationStatus === 'complete') {
          scorecard.evaluationStatus = 'scored';
          fileRepairs += 1;
        } else if (scorecard.evaluationStatus !== 'scored') {
          throw new Error(`${entry.name} contains unsupported evaluationStatus ${scorecard.evaluationStatus}`);
        }
      }
    }
    if (fileRepairs === 0) throw new Error(`${entry.name} contains no complete-to-scored repair`);
    const afterRaw = jsonBytes(document);
    await fs.writeFile(filePath, afterRaw);
    files.push({
      file: entry.name,
      beforeSha256: hashBytes(beforeRaw),
      afterSha256: hashBytes(afterRaw),
      scorecards: (document.decisions || []).reduce((sum, decision) => sum + (decision.scorecards || []).length, 0),
      repairsApplied: fileRepairs,
    });
    repairsApplied += fileRepairs;
  }

  const receipt = {
    schemaVersion: 1,
    protocol: SCION_CODEX_DECISION_STATUS_REPAIR_PROTOCOL,
    generatedAt,
    files,
    scorecardsVisited,
    repairsApplied,
    repair: {
      field: 'scorecards[].evaluationStatus',
      from: 'complete',
      to: 'scored',
      precondition: 'exactly five integer scores in the inclusive range 1..5',
      scoreValuesChanged: false,
      preferencesChanged: false,
      evidenceChanged: false,
      defectsChanged: false,
    },
    claimBoundary:
      'This deterministic repair changes only an unsupported completion-status label after complete numeric scoring. It does not alter or disclose a score, preference, winner, rationale, evidence statement, or defect.',
  };
  await fs.mkdir(path.dirname(path.resolve(receiptOutput)), { recursive: true });
  await fs.writeFile(receiptOutput, jsonBytes(receipt));
  return { receipt, receiptOutput: path.resolve(receiptOutput) };
}

function parseArgs(argv) {
  const args = { decisionsDir: '', receiptOutput: '', generatedAt: '' };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--decisions-dir') args.decisionsDir = argv[++index] || '';
    else if (argv[index] === '--receipt') args.receiptOutput = argv[++index] || '';
    else if (argv[index] === '--generated-at') args.generatedAt = argv[++index] || '';
  }
  return args;
}

async function main() {
  const result = await normalizeScionCodexDecisionStatuses(parseArgs(process.argv.slice(2)));
  console.log(`Scion decision-status repairs: ${result.receipt.repairsApplied}`);
  console.log(`Receipt: ${result.receiptOutput}`);
  console.log('Outcome disclosure: none');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
