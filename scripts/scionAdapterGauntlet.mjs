#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SCION_MODEL_ID,
  buildScionGauntletSummary,
  parseScionGauntletArgs,
  repoRoot,
  latestCrucibleRound,
  runCrucibleForScion,
  startLocalScionServer,
  writeScionGauntletReport,
} from './lib/scionGauntlet.mjs';

const ADAPTER_GAUNTLET_ROOT = path.join(repoRoot, 'verification-output', 'scion-adapter-gauntlet');
const DEFAULT_BASELINE = 6.08;

function timestampId(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function usage() {
  return [
    'Usage:',
    '  node scripts/scionAdapterGauntlet.mjs --adapter trellis/tendril/distill/adapters-scion [--courses music-theory] [--judge]',
    '',
    'Runs: local adapter server, constrained-JSON smoke, Crucible gauntlet, optional advisory judge vs mini baseline.',
  ].join('\n');
}

async function smokeConstrainedJson(endpoint, model) {
  const response = await fetch(`${endpoint}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: 60,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: 'Return {"ok":true} only.' }],
    }),
  });
  const payload = await response.json().catch(() => ({}));
  const text = payload?.choices?.[0]?.message?.content || '';
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* reported below */
  }
  return {
    passed: response.ok && parsed?.ok === true,
    status: response.status,
    text: String(text).slice(0, 200),
    constrainedTier: payload?.constrained || '',
    finishReason: payload?.choices?.[0]?.finish_reason || '',
  };
}

function latestExtractedDir(summary) {
  const first = summary.entries?.[0];
  if (!first?.courseId) return '';
  return path.join(summary.roundDir, first.courseId, 'extracted');
}

async function runJudge({ packageDir, title, lessonCount, seats, baseline }) {
  if (!packageDir) return { skipped: true, reason: 'no package dir' };
  const args = ['vite-node', 'trellis/advisoryJudge.mjs', packageDir, title, String(lessonCount), String(seats)];
  const raw = await new Promise((resolve, reject) => {
    const child = spawn('npx', args, { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code) reject(new Error(stderr || `judge exited ${code}`));
      else resolve(stdout);
    });
  });
  const parsed = JSON.parse(raw);
  const mean = Number(parsed?.overall?.mean);
  return {
    skipped: false,
    baseline,
    mean,
    beatsBaseline: Number.isFinite(mean) && mean > baseline,
    result: parsed,
  };
}

async function writeAdapterReport(summary) {
  const reportDir = path.join(ADAPTER_GAUNTLET_ROOT, summary.label);
  await fs.mkdir(reportDir, { recursive: true });
  const jsonPath = path.join(reportDir, 'report.json');
  const mdPath = path.join(reportDir, 'report.md');
  const lines = [
    `# Scion Adapter Gauntlet - ${summary.label}`,
    '',
    `- Adapter: ${summary.adapter}`,
    `- Model: ${summary.modelId}`,
    `- Status: ${summary.passed ? 'PASS' : 'FAIL'}`,
    `- Smoke JSON: ${summary.smoke.passed ? 'PASS' : 'FAIL'} (${summary.smoke.status}, finish ${summary.smoke.finishReason || 'n/a'})`,
    `- Compiler gauntlet: ${summary.compiler.evaluation.passed ? 'PASS' : 'FAIL'}`,
  ];
  if (summary.judge?.skipped) {
    lines.push(`- Judge: skipped (${summary.judge.reason})`);
  } else if (summary.judge) {
    lines.push(
      `- Judge: mean ${summary.judge.mean ?? 'n/a'} vs mini baseline ${summary.judge.baseline} (${summary.judge.beatsBaseline ? 'BEATS' : 'does not beat'})`,
    );
  }
  lines.push('', `Compiler report: ${summary.compilerReportPath || 'n/a'}`, '');
  await fs.writeFile(jsonPath, `${JSON.stringify(summary, null, 2)}\n`);
  await fs.writeFile(mdPath, `${lines.join('\n')}\n`);
  await fs.mkdir(ADAPTER_GAUNTLET_ROOT, { recursive: true });
  await fs.writeFile(path.join(ADAPTER_GAUNTLET_ROOT, 'latest.json'), `${JSON.stringify(summary, null, 2)}\n`);
  await fs.writeFile(path.join(ADAPTER_GAUNTLET_ROOT, 'latest.md'), `${lines.join('\n')}\n`);
  return { reportDir, jsonPath, mdPath };
}

async function main(argv = process.argv.slice(2)) {
  const options = parseScionGauntletArgs(argv);
  if (options.help) {
    console.log(usage());
    return 0;
  }
  if (!options.adapter) {
    console.error(usage());
    console.error('\nMissing --adapter.');
    return 2;
  }

  const adapter = path.isAbsolute(options.adapter) ? options.adapter : path.resolve(repoRoot, options.adapter);
  const model = options.model || SCION_MODEL_ID;
  const courses = options.courses || 'music-theory';
  const label = options.label || `adapter-${path.basename(adapter)}-${timestampId()}`;
  const serverLogPath = path.join(ADAPTER_GAUNTLET_ROOT, label, 'local-model.log');
  let server = null;
  try {
    server = await startLocalScionServer({ adapter, model, logPath: serverLogPath });
    const smoke = await smokeConstrainedJson(server.endpoint, model);
    const runResult = await runCrucibleForScion({
      courses,
      provider: 'local',
      model,
      concurrency: Number(options.concurrency) || 1,
      externalServer: true,
      serverLogPath,
    });
    const roundDir = await latestCrucibleRound();
    const compiler = await buildScionGauntletSummary({ roundDir, courses, provider: 'local', modelId: model, label });
    compiler.crucibleRun = runResult;
    const compilerPaths = await writeScionGauntletReport(compiler, {
      outputRoot: path.join(ADAPTER_GAUNTLET_ROOT, label, 'compiler'),
    });
    const judge = options.judge
      ? await runJudge({
          packageDir: latestExtractedDir(compiler),
          title: options.title || 'Music Theory Fundamentals',
          lessonCount: Number(options.lessons) || 7,
          seats: Number(options.seats) || 5,
          baseline: Number(options.baseline) || DEFAULT_BASELINE,
        })
      : { skipped: true, reason: 'pass --judge to spend judge seats' };
    const passed = smoke.passed && compiler.evaluation.passed && (judge.skipped || judge.beatsBaseline);
    const summary = {
      label,
      adapter,
      modelId: model,
      courses,
      smoke,
      compiler,
      compilerReportPath: compilerPaths.mdPath,
      judge,
      passed,
    };
    const paths = await writeAdapterReport(summary);
    console.log(`[scion-adapter-gauntlet] ${passed ? 'PASS' : 'FAIL'} ${paths.mdPath}`);
    if (runResult.exitCode !== 0) return runResult.exitCode;
    return passed ? 0 : 1;
  } finally {
    await server?.stop?.();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => {
    process.exitCode = code;
  });
}

export { main, smokeConstrainedJson };
