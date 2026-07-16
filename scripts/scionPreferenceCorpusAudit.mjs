#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { assessScionPreferencePair } from '../src/lib/scionPreferenceGate.js';

const DEFAULT_SOURCES = [
  'trellis/tendril/distill/data-g4-orpo/train.jsonl',
  'trellis/tendril/distill/data-g4-orpo/app-flywheel.jsonl',
  'evaluation/scion-reviewed-preferences.jsonl',
];
const DEFAULT_OUTPUT = 'trellis/tendril/distill/data-g4-orpo/curated/train.jsonl';
const DEFAULT_REPORT = 'verification-output/scion-preference-corpus';

function parseJson(value) {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function modelJudgeBindingIssues(row, chosenRaw, rejectedRaw) {
  if (row?.preferenceEvidence?.kind !== 'single-model-judge-preference') return [];
  const evidence = row.preferenceEvidence;
  const issues = [];
  if (evidence.chosenArtifactSha256 !== sha256(JSON.stringify(chosenRaw))) {
    issues.push('model-judge-chosen-artifact-binding');
  }
  if (evidence.rejectedArtifactSha256 !== sha256(JSON.stringify(rejectedRaw))) {
    issues.push('model-judge-rejected-artifact-binding');
  }
  const trainingPairSha256 = sha256(
    JSON.stringify({
      kind: row.kind,
      prompt: row.prompt,
      chosen: row.chosen,
      rejected: row.rejected,
      domain: row.domain || row?.context?.domain,
      courseGroupSha256: row.courseGroupSha256 || row?.context?.courseGroupSha256,
    }),
  );
  if (evidence.trainingPairSha256 !== trainingPairSha256) {
    issues.push('model-judge-training-pair-binding');
  }
  return issues;
}

function pairKind(row) {
  if (['lesson', 'mc-item', 'key-term'].includes(row?.kind)) return row.kind;
  if (row?.pass && row?.chosen && row?.rejected) return 'mc-item';
  return '';
}

export function assessCorpusRow(row, source = '', { semanticAdmission = true } = {}) {
  const kind = pairKind(row);
  const issues = [];
  const chosenRaw = parseJson(row?.chosen);
  const rejectedRaw = parseJson(row?.rejected);
  if (!kind) issues.push('unsupported-or-missing-kind');
  if (!cleanPrompt(row?.prompt)) issues.push('missing-training-prompt');
  if (!chosenRaw) issues.push('chosen-not-json');
  if (!rejectedRaw) issues.push('rejected-not-json');
  if (chosenRaw && rejectedRaw) issues.push(...modelJudgeBindingIssues(row, chosenRaw, rejectedRaw));
  if (issues.length > 0) return { eligible: false, kind: kind || 'unknown', issues, source };

  const chosen = kind === 'lesson' ? (chosenRaw?.lessons?.[0] ?? chosenRaw) : chosenRaw;
  const rejected = kind === 'lesson' ? (rejectedRaw?.lessons?.[0] ?? rejectedRaw) : rejectedRaw;
  const result = assessScionPreferencePair(
    {
      kind,
      chosen,
      rejected,
      preferenceEvidence: row.preferenceEvidence,
    },
    { semanticAdmission },
  );
  return { ...result, kind, source };
}

function cleanPrompt(value) {
  return String(value ?? '').trim();
}

export function buildCorpusSummary(results) {
  const reasonCounts = {};
  const byKind = {};
  for (const result of results) {
    const bucket = (byKind[result.kind] = byKind[result.kind] ?? { total: 0, eligible: 0, quarantined: 0 });
    bucket.total += 1;
    if (result.eligible) bucket.eligible += 1;
    else bucket.quarantined += 1;
    for (const issue of result.issues || []) reasonCounts[issue] = (reasonCounts[issue] || 0) + 1;
  }
  const eligible = results.filter((result) => result.eligible).length;
  return {
    status: eligible === results.length && eligible > 0 ? 'pass' : 'quarantined',
    total: results.length,
    eligible,
    quarantined: results.length - eligible,
    eligibleRate: results.length > 0 ? Number((eligible / results.length).toFixed(4)) : 0,
    byKind,
    reasonCounts: Object.fromEntries(Object.entries(reasonCounts).sort((left, right) => right[1] - left[1])),
    trainingBoundary:
      'Only rows with pair-level verified preference evidence and a contract-clean chosen response enter the curated training split.',
  };
}

function renderMarkdown(report) {
  const kindRows = Object.entries(report.summary.byKind).map(
    ([kind, row]) => `| ${kind} | ${row.total} | ${row.eligible} | ${row.quarantined} |`,
  );
  const reasons = Object.entries(report.summary.reasonCounts).map(([reason, count]) => `- ${reason}: ${count}`);
  return [
    '# Scion Preference Corpus Audit',
    '',
    `Generated: ${report.meta.generatedAt}`,
    `Status: ${report.summary.status}`,
    `Eligible: ${report.summary.eligible}/${report.summary.total}`,
    `Quarantined: ${report.summary.quarantined}`,
    '',
    `> ${report.summary.trainingBoundary}`,
    '',
    '| Pair kind | Total | Eligible | Quarantined |',
    '| --- | ---: | ---: | ---: |',
    ...kindRows,
    '',
    '## Quarantine reasons',
    '',
    ...(reasons.length > 0 ? reasons : ['- none']),
    '',
    'The raw files are evidence ledgers, not training splits. The curated JSONL is the only input allowed by the ORPO launcher.',
    '',
  ].join('\n');
}

async function readRows(source) {
  try {
    const raw = await fs.readFile(source, 'utf8');
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => ({ row: JSON.parse(line), source, line: index + 1 }));
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

async function readProjectRepairs(projectPath) {
  try {
    const project = JSON.parse(await fs.readFile(projectPath, 'utf8'));
    const graph = parseJson(project?.courseGraphJson) || project?.courseGraph || null;
    const repairs = Array.isArray(graph?.enrichmentOverlay?.semanticRepairs)
      ? graph.enrichmentOverlay.semanticRepairs
      : [];
    return repairs.map((row, index) => ({ row, source: projectPath, line: `semanticRepair:${index + 1}` }));
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

export async function runScionPreferenceCorpusAudit({
  sources = DEFAULT_SOURCES,
  projects = [],
  output = DEFAULT_OUTPUT,
  reportDir = DEFAULT_REPORT,
} = {}) {
  const loaded = (await Promise.all([...sources.map(readRows), ...projects.map(readProjectRepairs)])).flat();
  const assessed = loaded.map(({ row, source, line }) => ({ row, line, result: assessCorpusRow(row, source) }));
  const accepted = assessed.filter((entry) => entry.result.eligible);
  const quarantined = assessed.filter((entry) => !entry.result.eligible);
  const summary = buildCorpusSummary(assessed.map((entry) => entry.result));
  const report = {
    meta: { generatedAt: new Date().toISOString(), sources, projects, output },
    summary,
    quarantine: quarantined.map(({ line, result }) => ({
      source: result.source,
      line,
      kind: result.kind,
      issues: result.issues,
    })),
  };

  await Promise.all([fs.mkdir(path.dirname(output), { recursive: true }), fs.mkdir(reportDir, { recursive: true })]);
  await Promise.all([
    fs.writeFile(output, accepted.map(({ row }) => JSON.stringify(row)).join('\n') + (accepted.length ? '\n' : '')),
    fs.writeFile(path.join(reportDir, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`),
    fs.writeFile(path.join(reportDir, 'latest.md'), `${renderMarkdown(report)}\n`),
  ]);
  return report;
}

function parseArgs(argv) {
  const args = { sources: [], projects: [], output: DEFAULT_OUTPUT, reportDir: DEFAULT_REPORT };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--source') args.sources.push(argv[++index]);
    else if (arg === '--project') args.projects.push(argv[++index]);
    else if (arg === '--output') args.output = argv[++index] || args.output;
    else if (arg === '--report') args.reportDir = argv[++index] || args.reportDir;
  }
  if (args.sources.length === 0) args.sources = DEFAULT_SOURCES;
  return args;
}

async function main() {
  const report = await runScionPreferenceCorpusAudit(parseArgs(process.argv.slice(2)));
  console.log(`Scion preference corpus: ${report.summary.eligible}/${report.summary.total} eligible`);
  console.log(`Quarantined: ${report.summary.quarantined}`);
  console.log(`Report: ${path.join(parseArgs(process.argv.slice(2)).reportDir, 'latest.md')}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
