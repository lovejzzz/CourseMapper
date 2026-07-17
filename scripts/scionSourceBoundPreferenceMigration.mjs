#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { verifyScionCodexFreshJudgeWorkbook } from './scionCodexFreshJudgeWorkbook.mjs';

export const SCION_SOURCE_BOUND_MIGRATION_RELEASE = 'v0.16.47';
export const SCION_SOURCE_BOUND_MIGRATION_INPUT =
  'evaluation/scion-adapters/evidence/codex-approved-preferences-v0.16.42.jsonl';
export const SCION_SOURCE_BOUND_MIGRATION_WORKBOOK = 'evaluation/scion-adapters/handoffs/fresh-a-b-workbook-v0.16.41';
export const SCION_SOURCE_BOUND_MIGRATION_WORKBOOK_RECEIPT =
  'evaluation/scion-adapters/evidence/fresh-a-b-workbook-v0.16.41.json';
export const SCION_SOURCE_BOUND_MIGRATION_OUTPUT =
  'evaluation/scion-adapters/evidence/codex-approved-preferences-v0.16.47-seed.jsonl';
export const SCION_SOURCE_BOUND_MIGRATION_RECEIPT =
  'evaluation/scion-adapters/evidence/source-context-migration-v0.16.47.json';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function identity(file, raw) {
  return { path: file, bytes: raw.length, sha256: sha256(raw) };
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function parseJsonl(raw) {
  return raw
    .toString('utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function jsonlBytes(rows) {
  return Buffer.from(rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''));
}

async function readWorkbookReviews(workbookDir) {
  const names = (await fs.readdir(workbookDir)).filter((name) => /^chunk-\d+-review-a-b\.json$/.test(name)).sort();
  const files = await Promise.all(
    names.map(async (name) => {
      const file = path.join(workbookDir, name);
      const raw = await fs.readFile(file);
      return { name, raw, batch: JSON.parse(raw) };
    }),
  );
  return files;
}

export async function buildScionSourceBoundPreferenceMigration() {
  const [inputRaw, workbookReceiptRaw, reviewFiles] = await Promise.all([
    fs.readFile(SCION_SOURCE_BOUND_MIGRATION_INPUT),
    fs.readFile(SCION_SOURCE_BOUND_MIGRATION_WORKBOOK_RECEIPT),
    readWorkbookReviews(SCION_SOURCE_BOUND_MIGRATION_WORKBOOK),
  ]);
  const workbookReceipt = JSON.parse(workbookReceiptRaw);
  const workbookVerification = await verifyScionCodexFreshJudgeWorkbook({
    handoffDir: SCION_SOURCE_BOUND_MIGRATION_WORKBOOK,
    expectedReceipt: workbookReceipt,
  });
  if (!workbookVerification.valid) {
    throw new Error(`Historical source workbook is invalid: ${workbookVerification.issues.join(', ')}`);
  }
  const reviewByPairId = new Map();
  for (const file of reviewFiles) {
    for (const review of file.batch.reviews || []) {
      if (reviewByPairId.has(review.pairId)) throw new Error(`Duplicate workbook pair id: ${review.pairId}`);
      reviewByPairId.set(review.pairId, review);
    }
  }
  const inputRows = parseJsonl(inputRaw);
  const seen = new Set();
  const outputRows = inputRows.map((row) => {
    const pairId = String(row?.reviewPairId || '');
    if (!pairId || seen.has(pairId)) throw new Error(`Invalid or duplicate approved pair id: ${pairId || 'missing'}`);
    seen.add(pairId);
    const review = reviewByPairId.get(pairId);
    if (!review) throw new Error(`Historical workbook is missing approved pair ${pairId}`);
    const sourceContextSha256 = sha256(JSON.stringify(review.sourceContext || null));
    if (
      sourceContextSha256 !== review.sourceContextSha256 ||
      sourceContextSha256 !== row?.preferenceEvidence?.sourceContextSha256
    ) {
      throw new Error(`Source context digest mismatch for ${pairId}`);
    }
    if (review.caseDigest !== row?.preferenceEvidence?.caseDigest) {
      throw new Error(`Case digest mismatch for ${pairId}`);
    }
    return { ...row, sourceContext: review.sourceContext };
  });
  const outputRaw = jsonlBytes(outputRows);
  const receipt = {
    schemaVersion: 1,
    protocol: 'scion-source-bound-preference-migration-v1',
    release: SCION_SOURCE_BOUND_MIGRATION_RELEASE,
    generatedAt: '2026-07-16T21:30:00.000Z',
    status: 'source-context-restored',
    input: { ...identity(SCION_SOURCE_BOUND_MIGRATION_INPUT, inputRaw), rows: inputRows.length },
    workbook: {
      ...identity(SCION_SOURCE_BOUND_MIGRATION_WORKBOOK_RECEIPT, workbookReceiptRaw),
      handoff: SCION_SOURCE_BOUND_MIGRATION_WORKBOOK,
      order: workbookReceipt.order,
      selectedCases: workbookReceipt.selectedCases,
      reviewFiles: reviewFiles.map(({ name, raw, batch }) => ({
        path: path.join(SCION_SOURCE_BOUND_MIGRATION_WORKBOOK, name),
        bytes: raw.length,
        sha256: sha256(raw),
        reviews: batch.reviews?.length || 0,
      })),
    },
    output: { ...identity(SCION_SOURCE_BOUND_MIGRATION_OUTPUT, outputRaw), rows: outputRows.length },
    restoredRows: outputRows.length,
    missingRows: 0,
    changedPreferenceOutcomes: 0,
    changedChosenArtifacts: 0,
    changedRejectedArtifacts: 0,
    promptProtocol: 'source-bound-row-prompt-v1',
    claimBoundary:
      'This deterministic migration restores the exact source context already hash-bound to each approved v0.16.42 preference. It changes no judgment, winner, score, chosen artifact, or rejected artifact and proves no adapter or model win.',
  };
  return { inputRows, outputRows, outputRaw, receipt };
}

export async function writeScionSourceBoundPreferenceMigration() {
  const result = await buildScionSourceBoundPreferenceMigration();
  await fs.mkdir(path.dirname(SCION_SOURCE_BOUND_MIGRATION_OUTPUT), { recursive: true });
  await fs.writeFile(SCION_SOURCE_BOUND_MIGRATION_OUTPUT, result.outputRaw);
  await fs.writeFile(SCION_SOURCE_BOUND_MIGRATION_RECEIPT, jsonBytes(result.receipt));
  return result;
}

export async function auditScionSourceBoundPreferenceMigration() {
  const result = await buildScionSourceBoundPreferenceMigration();
  const [outputRaw, receiptRaw] = await Promise.all([
    fs.readFile(SCION_SOURCE_BOUND_MIGRATION_OUTPUT),
    fs.readFile(SCION_SOURCE_BOUND_MIGRATION_RECEIPT),
  ]);
  const receipt = JSON.parse(receiptRaw);
  const issues = [];
  if (!crypto.timingSafeEqual(outputRaw, result.outputRaw)) issues.push('output-reconstruction');
  if (JSON.stringify(receipt) !== JSON.stringify(result.receipt)) issues.push('receipt-reconstruction');
  if (/\/private\/tmp\/|\/tmp\//.test(JSON.stringify(receipt))) issues.push('temporary-path-leak');
  return { valid: issues.length === 0, issues, rows: result.outputRows.length };
}

async function main() {
  if (process.argv.includes('--write')) {
    const result = await writeScionSourceBoundPreferenceMigration();
    console.log(`Scion source-bound preference migration: ${result.receipt.status}`);
    console.log(`Restored rows: ${result.receipt.restoredRows}`);
    console.log(`Output: ${SCION_SOURCE_BOUND_MIGRATION_OUTPUT}`);
    return;
  }
  const result = await auditScionSourceBoundPreferenceMigration();
  console.log(JSON.stringify(result, null, 2));
  if (!result.valid) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
