#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { assessCorpusRow } from './scionPreferenceCorpusAudit.mjs';
import { sha256File } from './scionAdapterPackage.mjs';

const DEFAULT_SOURCES = [
  'trellis/tendril/distill/data-g4-orpo/train.jsonl',
  'trellis/tendril/distill/data-g4-orpo/app-flywheel.jsonl',
  'evaluation/scion-reviewed-preferences.jsonl',
];
const DEFAULT_OUTPUT = 'trellis/tendril/distill/data-g4-orpo/curated';

function normalize(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

function stableHash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function parsed(value) {
  if (value && typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function pairFingerprint(row) {
  return stableHash(
    JSON.stringify({
      kind: row.kind || row.pass || '',
      prompt: normalize(row.prompt),
      chosen: parsed(row.chosen),
      rejected: parsed(row.rejected),
    }),
  );
}

function inferDomain(row) {
  return normalize(row?.context?.domain || row?.context?.discipline || row?.domain || 'unknown').toLowerCase();
}

function explicitGroupIdentity(row) {
  const context = row?.context || {};
  return normalize(
    context.courseId ||
      context.projectId ||
      context.courseName ||
      context.course ||
      row.courseId ||
      row.projectId ||
      row.courseName,
  ).toLowerCase();
}

function splitForGroup(group) {
  const bucket = Number.parseInt(stableHash(group).slice(0, 8), 16) % 100;
  if (bucket < 10) return 'test';
  if (bucket < 20) return 'valid';
  return 'train';
}

async function readJsonl(source) {
  try {
    const text = await fs.readFile(source, 'utf8');
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => ({ row: JSON.parse(line), source, line: index + 1 }));
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

export async function buildScionAdapterDataset({
  sources = DEFAULT_SOURCES,
  outputDir = DEFAULT_OUTPUT,
  minimumPairs = 3000,
  minimumDomains = 5,
  allowSmoke = false,
} = {}) {
  const loaded = (await Promise.all(sources.map(readJsonl))).flat();
  const eligible = [];
  const quarantine = [];
  const seen = new Set();
  for (const entry of loaded) {
    const assessment = assessCorpusRow(entry.row, entry.source);
    if (!assessment.eligible) {
      quarantine.push({ source: entry.source, line: entry.line, issues: assessment.issues });
      continue;
    }
    const domain = inferDomain(entry.row);
    const groupIdentity = explicitGroupIdentity(entry.row);
    const identityIssues = [
      ...(domain === 'unknown' ? ['missing-domain'] : []),
      ...(!groupIdentity ? ['missing-course-group'] : []),
    ];
    if (identityIssues.length > 0) {
      quarantine.push({ source: entry.source, line: entry.line, issues: identityIssues });
      continue;
    }
    const fingerprint = pairFingerprint(entry.row);
    if (seen.has(fingerprint)) {
      quarantine.push({ source: entry.source, line: entry.line, issues: ['duplicate-pair'] });
      continue;
    }
    seen.add(fingerprint);
    const group = `${domain}:${groupIdentity}`;
    eligible.push({ ...entry, fingerprint, group, domain, split: splitForGroup(group) });
  }

  const splitRows = { train: [], valid: [], test: [] };
  for (const entry of eligible) splitRows[entry.split].push(entry.row);
  const domains = [...new Set(eligible.map((entry) => entry.domain).filter((domain) => domain !== 'unknown'))].sort();
  const groups = [...new Set(eligible.map((entry) => entry.group))];
  const splitGroups = Object.fromEntries(
    Object.keys(splitRows).map((split) => [
      split,
      [...new Set(eligible.filter((entry) => entry.split === split).map((entry) => entry.group))].sort(),
    ]),
  );
  const leakage = Object.entries(splitGroups).flatMap(([split, values]) =>
    values.flatMap((group) =>
      Object.entries(splitGroups)
        .filter(([otherSplit, otherValues]) => otherSplit !== split && otherValues.includes(group))
        .map(([otherSplit]) => ({ group, splits: [split, otherSplit].sort() })),
    ),
  );

  const gateIssues = [];
  if (eligible.length < minimumPairs) gateIssues.push(`verified-pairs:${eligible.length}<${minimumPairs}`);
  if (domains.length < minimumDomains) gateIssues.push(`domains:${domains.length}<${minimumDomains}`);
  for (const split of ['train', 'valid', 'test']) if (splitRows[split].length === 0) gateIssues.push(`${split}-empty`);
  if (leakage.length > 0) gateIssues.push('group-leakage');
  const status = gateIssues.length === 0 ? 'ready' : allowSmoke && eligible.length > 0 ? 'smoke-only' : 'blocked';

  const absoluteOutput = path.resolve(outputDir);
  await fs.mkdir(absoluteOutput, { recursive: true });
  const fileNames = { train: 'train.jsonl', valid: 'valid.jsonl', test: 'test.jsonl' };
  for (const [split, fileName] of Object.entries(fileNames)) {
    const text = splitRows[split].map((row) => JSON.stringify(row)).join('\n');
    await fs.writeFile(path.join(absoluteOutput, fileName), text ? `${text}\n` : '');
  }
  const files = {};
  for (const [split, fileName] of Object.entries(fileNames)) {
    const filePath = path.join(absoluteOutput, fileName);
    const stats = await fs.stat(filePath);
    files[split] = {
      path: fileName,
      bytes: stats.size,
      sha256: await sha256File(filePath),
      rows: splitRows[split].length,
    };
  }
  const manifest = {
    schemaVersion: 1,
    status,
    promotable: status === 'ready',
    generatedAt: new Date().toISOString(),
    sources,
    counts: {
      loaded: loaded.length,
      total: eligible.length,
      quarantined: quarantine.length,
      domains: domains.length,
      groups: groups.length,
      train: splitRows.train.length,
      valid: splitRows.valid.length,
      test: splitRows.test.length,
    },
    domains,
    gate: { minimumPairs, minimumDomains, issues: gateIssues },
    leakage: { groupOverlapCount: leakage.length, overlaps: leakage },
    files,
    quarantine,
  };
  const manifestPath = path.join(absoluteOutput, 'dataset-manifest.json');
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifest, manifestPath };
}

function parseArgs(argv) {
  const args = { sources: [], outputDir: DEFAULT_OUTPUT, minimumPairs: 3000, minimumDomains: 5 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--source') args.sources.push(argv[++index]);
    else if (arg === '--output') args.outputDir = argv[++index];
    else if (arg === '--minimum-pairs') args.minimumPairs = Number(argv[++index]);
    else if (arg === '--minimum-domains') args.minimumDomains = Number(argv[++index]);
    else if (arg === '--allow-smoke') args.allowSmoke = true;
  }
  if (args.sources.length === 0) args.sources = DEFAULT_SOURCES;
  return args;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await buildScionAdapterDataset(options);
  console.log(`Scion adapter dataset: ${result.manifest.status}`);
  console.log(`Eligible: ${result.manifest.counts.total}/${result.manifest.counts.loaded}`);
  console.log(`Splits: ${result.manifest.counts.train}/${result.manifest.counts.valid}/${result.manifest.counts.test}`);
  console.log(`Manifest: ${result.manifestPath}`);
  if (result.manifest.status === 'blocked') process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
