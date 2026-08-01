#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const DEFAULT_OUTPUT_DIR = path.join(ROOT, 'verification-output', 'deep-proof-quality-gate');
const EXTERNAL_PROOF_FIXTURES = String(process.env.EXTERNAL_QUALITY_PROOF_FIXTURES || '').trim();

const QUALITY_GATES = [
  {
    label: 'Blueprint quality matrix',
    command: 'npm',
    args: ['run', 'test:blueprint:quality'],
  },
  {
    label: 'Deliverable quality audit',
    command: 'npm',
    args: ['run', 'audit:deliverables'],
  },
  {
    label: 'Full compiler contract audit',
    command: 'npm',
    args: ['run', 'audit:contract:full'],
    reports: [
      'verification-output/contract-quality-audit/latest.md',
      'verification-output/contract-quality-audit/latest.json',
      'verification-output/gold-sample-quality-audit/latest.md',
      'verification-output/gold-sample-quality-audit/latest.json',
    ],
  },
  {
    label: 'Independent instructor benchmark',
    command: 'npm',
    args: ['run', 'audit:benchmark:strict'],
    reports: [
      'verification-output/independent-benchmark/latest.md',
      'verification-output/independent-benchmark/latest.json',
    ],
  },
  {
    label: 'Grounded authoring benchmark evidence',
    command: 'npm',
    args: ['run', 'audit:algi:hybrid'],
  },
  {
    label: 'Production canary audit',
    command: 'npm',
    args: ['run', 'audit:canary:strict'],
    reports: ['verification-output/production-canary/latest.md', 'verification-output/production-canary/latest.json'],
  },
  {
    label: 'External instructor proof preflight',
    command: 'npm',
    args: [
      'run',
      'audit:expert:preflight',
      ...(EXTERNAL_PROOF_FIXTURES ? ['--', '--fixtures', EXTERNAL_PROOF_FIXTURES] : []),
    ],
    reports: [
      'verification-output/expert-review-quality-audit/latest.md',
      'verification-output/expert-review-quality-audit/latest.json',
    ],
  },
  {
    label: 'Optional proof packet build',
    command: 'npm',
    args: ['run', 'audit:expert:packet'],
    blocking: false,
    reports: [
      'verification-output/external-quality-proof-packet/latest.md',
      'verification-output/external-quality-proof-packet/latest.json',
    ],
  },
];

function parseArgs(argv) {
  const args = {
    mode: process.env.DEEP_PROOF_QUALITY_MODE || 'strict',
    outputDir: DEFAULT_OUTPUT_DIR,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--mode') args.mode = argv[++i] || args.mode;
    else if (arg === '--output') args.outputDir = path.resolve(argv[++i] || args.outputDir);
    else if (arg === '--help' || arg === '-h') args.help = true;
  }
  if (!['strict', 'advisory'].includes(args.mode)) {
    throw new Error(`Unsupported --mode "${args.mode}". Expected "strict" or "advisory".`);
  }
  return args;
}

function formatDuration(ms) {
  const seconds = Math.max(0, Math.round(Number(ms || 0) / 1000));
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remaining}s` : `${remaining}s`;
}

function escapeGithubCommandValue(value) {
  return String(value).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}

function emitWarning(message) {
  console.warn(message);
  if (process.env.GITHUB_ACTIONS === 'true') {
    console.log(`::warning title=Deep proof advisory::${escapeGithubCommandValue(message)}`);
  }
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function existingReports(reports = []) {
  const rows = [];
  for (const report of reports) {
    const absolutePath = path.resolve(ROOT, report);
    if (await fileExists(absolutePath)) {
      rows.push(path.relative(ROOT, absolutePath));
    }
  }
  return rows;
}

function runGate(gate) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    console.log(`\n[deep-proof:quality] start ${gate.label}`);
    const child = spawn(gate.command, gate.args, {
      cwd: ROOT,
      env: process.env,
      stdio: 'inherit',
    });

    child.on('error', (error) => {
      resolve({
        ...gate,
        status: 'fail',
        exitCode: 1,
        error: error.message,
        durationMs: Date.now() - startedAt,
      });
    });

    child.on('close', (code, signal) => {
      const durationMs = Date.now() - startedAt;
      const exitCode = code ?? 1;
      const status = exitCode === 0 ? 'pass' : gate.blocking === false ? 'unverified' : 'fail';
      console.log(`[deep-proof:quality] ${status} ${gate.label} elapsed=${formatDuration(durationMs)}`);
      resolve({
        ...gate,
        status,
        exitCode,
        signal,
        durationMs,
      });
    });
  });
}

function renderMarkdown(payload) {
  const gateRows = payload.gates.map(
    (gate) =>
      `| ${gate.label} | ${gate.status} | ${gate.blocking ? 'yes' : 'evidence only'} | ${gate.exitCode} | ${formatDuration(gate.durationMs)} | ${
        gate.existingReports.length > 0 ? gate.existingReports.join('<br>') : ''
      } |`,
  );
  const failedRows = payload.gates
    .filter((gate) => gate.blocking && gate.status !== 'pass')
    .map((gate) => `- ${gate.label}: exit ${gate.exitCode}${gate.signal ? `, signal ${gate.signal}` : ''}`);
  const evidenceRows = payload.gates
    .filter((gate) => !gate.blocking && gate.status !== 'pass')
    .map((gate) => `- ${gate.label}: ${gate.status}; no external quality claim is allowed.`);

  return [
    '# Deep Proof Quality Gate',
    '',
    `Generated: ${payload.meta.generatedAt}`,
    `Mode: ${payload.meta.mode}`,
    `Status: ${payload.summary.status}`,
    `Failed gates: ${payload.summary.failedCount}`,
    `Unverified evidence boundaries: ${payload.summary.evidenceGapCount}`,
    '',
    'Schedule policy: advisory mode records educational-quality regressions as reports and warnings. Strict mode is used for manual pre-release checks and release branches. External human evidence remains visible but non-blocking until the project has qualified independent reviewers; it never supports a quality claim while unverified.',
    '',
    '## Gates',
    '',
    '| Gate | Status | Release Blocking | Exit Code | Duration | Reports |',
    '| --- | --- | --- | ---: | ---: | --- |',
    ...gateRows,
    '',
    '## Failures',
    '',
    ...(failedRows.length > 0 ? failedRows : ['- None.']),
    '',
    '## Evidence boundaries',
    '',
    ...(evidenceRows.length > 0 ? evidenceRows : ['- None.']),
    '',
  ].join('\n');
}

async function writeReport(payload, outputDir) {
  await fs.mkdir(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'latest.json');
  const markdownPath = path.join(outputDir, 'latest.md');
  await fs.writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  await fs.writeFile(markdownPath, `${renderMarkdown(payload)}\n`);
  return { jsonPath, markdownPath };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node scripts/deepProofQualityGate.mjs [--mode strict|advisory] [--output DIR]');
    return;
  }

  const startedAt = Date.now();
  const results = [];
  for (const gate of QUALITY_GATES) {
    const result = await runGate(gate);
    result.blocking = gate.blocking !== false;
    if (!result.blocking && result.status !== 'pass') result.status = 'unverified';
    result.existingReports = await existingReports(gate.reports);
    results.push(result);
  }

  const failed = results.filter((result) => result.blocking && result.status !== 'pass');
  const evidenceGaps = results.filter((result) => !result.blocking && result.status !== 'pass');
  const payload = {
    meta: {
      generatedAt: new Date().toISOString(),
      mode: args.mode,
      elapsedMs: Date.now() - startedAt,
    },
    summary: {
      status: failed.length > 0 ? 'fail' : 'pass',
      gateCount: results.length,
      failedCount: failed.length,
      evidenceGapCount: evidenceGaps.length,
      advisory: args.mode === 'advisory',
    },
    gates: results.map((result) => ({
      label: result.label,
      command: [result.command, ...result.args].join(' '),
      status: result.status,
      blocking: result.blocking,
      exitCode: result.exitCode,
      signal: result.signal || null,
      durationMs: result.durationMs,
      existingReports: result.existingReports || [],
      error: result.error || null,
    })),
  };

  const paths = await writeReport(payload, args.outputDir);
  console.log(`\nDeep proof quality gate: ${payload.summary.status}`);
  console.log(`Mode: ${args.mode}`);
  console.log(`Report: ${paths.markdownPath}`);

  if (failed.length > 0 && args.mode === 'advisory') {
    emitWarning(
      `Educational quality advisory found ${failed.length} failing gate(s); reports were saved without failing the scheduled workflow.`,
    );
  } else if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
