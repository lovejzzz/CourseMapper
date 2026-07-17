#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const SCION_CODEX_DECISION_TEMPLATE_REPAIR_PROTOCOL = 'scion-codex-decision-template-repair-v1';

function hashBytes(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function decisionFilePattern(name) {
  const match = name.match(/^chunk-(\d{2})-decisions-(a-b|b-a)\.json$/);
  return match ? { chunk: match[1], orderSlug: match[2] } : null;
}

export async function normalizeScionCodexDecisionTemplateHashes({
  decisionsDir,
  templateDir,
  receiptOutput,
  generatedAt,
} = {}) {
  if (!decisionsDir || !templateDir || !receiptOutput || !generatedAt || Number.isNaN(Date.parse(generatedAt))) {
    throw new Error(
      'Template normalization requires decisionsDir, templateDir, receiptOutput, and a valid generatedAt',
    );
  }
  const entries = (await fs.readdir(decisionsDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && decisionFilePattern(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name));
  if (entries.length === 0) throw new Error('No chunk decision files found for template normalization');

  const files = [];
  let repairsApplied = 0;
  let decisionsVisited = 0;
  for (const entry of entries) {
    const identity = decisionFilePattern(entry.name);
    const decisionPath = path.join(decisionsDir, entry.name);
    const templatePath = path.join(templateDir, entry.name);
    const [beforeRaw, templateRaw] = await Promise.all([fs.readFile(decisionPath), fs.readFile(templatePath)]);
    const document = JSON.parse(beforeRaw.toString('utf8'));
    const template = JSON.parse(templateRaw.toString('utf8'));
    const documentPairIds = (document.decisions || []).map((decision) => decision.pairId);
    const templatePairIds = (template.decisions || []).map((decision) => decision.pairId);
    if (
      document.protocol !== 'scion-codex-training-decisions-v1' ||
      template.protocol !== document.protocol ||
      document.order !== template.order ||
      !same(documentPairIds, templatePairIds) ||
      !/^[a-f0-9]{64}$/.test(String(template.templateSha256 || ''))
    ) {
      throw new Error(`${entry.name} does not match its canonical workbook template`);
    }
    decisionsVisited += documentPairIds.length;
    const beforeTemplateSha256 = document.templateSha256;
    const expectedTemplateSha256 = template.templateSha256;
    const repaired = beforeTemplateSha256 !== expectedTemplateSha256;
    if (repaired) {
      document.templateSha256 = expectedTemplateSha256;
      repairsApplied += 1;
    }
    const afterRaw = repaired ? jsonBytes(document) : beforeRaw;
    if (repaired) await fs.writeFile(decisionPath, afterRaw);
    files.push({
      file: entry.name,
      chunk: identity.chunk,
      order: document.order,
      beforeSha256: hashBytes(beforeRaw),
      afterSha256: hashBytes(afterRaw),
      canonicalTemplateFile: path.basename(templatePath),
      canonicalTemplateFileSha256: hashBytes(templateRaw),
      beforeTemplateSha256,
      expectedTemplateSha256,
      decisions: documentPairIds.length,
      repaired,
    });
  }

  const receipt = {
    schemaVersion: 1,
    protocol: SCION_CODEX_DECISION_TEMPLATE_REPAIR_PROTOCOL,
    generatedAt,
    files,
    templatesVisited: files.length,
    decisionsVisited,
    repairsApplied,
    repair: {
      field: 'templateSha256',
      source: 'same-name canonical blank decision template in the audited workbook',
      judgmentFieldsChanged: false,
      scoreValuesChanged: false,
      preferencesChanged: false,
      evidenceChanged: false,
      defectsChanged: false,
    },
    claimBoundary:
      'This deterministic repair binds each completed decision document to its same-chunk canonical blank template. It does not alter or disclose a score, preference, winner, rationale, evidence statement, or defect.',
  };
  await fs.mkdir(path.dirname(path.resolve(receiptOutput)), { recursive: true });
  await fs.writeFile(receiptOutput, jsonBytes(receipt));
  return { receipt, receiptOutput: path.resolve(receiptOutput) };
}

function parseArgs(argv) {
  const args = { decisionsDir: '', templateDir: '', receiptOutput: '', generatedAt: '' };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--decisions-dir') args.decisionsDir = argv[++index] || '';
    else if (argv[index] === '--template-dir') args.templateDir = argv[++index] || '';
    else if (argv[index] === '--receipt') args.receiptOutput = argv[++index] || '';
    else if (argv[index] === '--generated-at') args.generatedAt = argv[++index] || '';
    else throw new Error(`Unknown template normalization option: ${argv[index]}`);
  }
  return args;
}

async function main() {
  const result = await normalizeScionCodexDecisionTemplateHashes(parseArgs(process.argv.slice(2)));
  console.log(`Scion decision-template repairs: ${result.receipt.repairsApplied}/${result.receipt.templatesVisited}`);
  console.log(`Receipt: ${result.receiptOutput}`);
  console.log('Outcome disclosure: none');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}
