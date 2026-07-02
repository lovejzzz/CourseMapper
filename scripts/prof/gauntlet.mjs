#!/usr/bin/env node
/**
 * scripts/prof/gauntlet.mjs — prof:gauntlet (design §6, P4): the pre-launch
 * run that fires every non-live arena over the standing scenarios in one
 * budgeted pass and writes a single launch-bar report. The live semester (A3)
 * stays a separate invocation (it drives a browser); the gauntlet composes the
 * headless arenas — adoption (A1), classroom zero-token (A2), department (A4),
 * adversary (A5), anchor — under one spend cap, then rolls up.
 *
 *   npx vite-node scripts/prof/gauntlet.mjs --budget 40
 *
 * Each arena is a child `prof` invocation so term modes, ledgers, and spend
 * ledgers stay per-term and auditable; the gauntlet aggregates their results.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, '..', '..');

const PLAN = [
  { arena: 'a5', scenario: 'cs-python-adoption', mode: 'instrument', budget: 1 },
  { arena: 'anchor', scenario: 'cs-python-adoption', mode: 'instrument', budget: 1 },
  { arena: 'a2', scenario: 'classroom-research-methods', mode: 'course', budget: 1 },
  { arena: 'a2', scenario: 'classroom-cs-bare', mode: 'course', budget: 1 },
  { arena: 'a1', scenario: 'cs-python-adoption', mode: 'course', budget: 6, universes: 7 },
  { arena: 'a4', scenario: 'cs-python-adoption', mode: 'course', budget: 4 },
];

function runProf(step) {
  return new Promise((resolve) => {
    const args = [
      'vite-node',
      'scripts/prof.mjs',
      '--arena',
      step.arena,
      '--scenario',
      step.scenario,
      '--mode',
      step.mode,
      '--budget',
      String(step.budget),
    ];
    if (step.universes) args.push('--universes', String(step.universes));
    const child = spawn('npx', args, { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => {
      out += d;
      process.stdout.write(d);
    });
    child.stderr.on('data', (d) => {
      out += d;
    });
    child.once('exit', (code) => resolve({ step, code, out }));
  });
}

function parseArgs(argv) {
  const args = { budget: 40 };
  for (let i = 0; i < argv.length; i += 1) if (argv[i] === '--budget') args.budget = Number(argv[++i] || 40);
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.join(repoRoot, 'verification-output', 'prof', `gauntlet-${startedAt}`);
  await fs.mkdir(outDir, { recursive: true });
  console.log(`[gauntlet] ${PLAN.length} arenas, budget cap $${args.budget}`);

  const results = [];
  for (const step of PLAN) {
    console.log(`\n[gauntlet] ===== ${step.arena} / ${step.scenario} (${step.mode}) =====`);
    const result = await runProf(step);
    const match = result.out.match(/result: (\S+)/);
    results.push({ ...step, exit: result.code, resultPath: match ? match[1] : null });
  }

  // Aggregate the per-term result.json files the children wrote.
  const summary = { startedAt, steps: [], totalSpendUsd: 0 };
  for (const row of results) {
    if (!row.resultPath) {
      summary.steps.push({ ...row, spendUsd: null, findings: null });
      continue;
    }
    try {
      const termResult = JSON.parse(
        await fs.readFile(path.join(repoRoot, row.resultPath.replace(/\/[^/]+$/, ''), 'term-result.json'), 'utf8'),
      );
      const spend = termResult.spend?.spentUsd ?? 0;
      summary.totalSpendUsd += spend;
      summary.steps.push({
        arena: row.arena,
        scenario: row.scenario,
        mode: row.mode,
        spendUsd: spend,
        findings: (termResult.findings || []).length,
        teachAsIs: termResult.kpis?.teachAsIs?.mean ?? null,
        anchored: termResult.anchor?.anchored ?? null,
      });
    } catch (error) {
      summary.steps.push({ ...row, error: String(error.message) });
    }
  }

  // Roll up at the end.
  const { collectTerms, rollUp, renderRollUp } = await import('./longitudinal.mjs');
  const rollup = rollUp(await collectTerms(path.join(repoRoot, 'verification-output', 'prof')));
  await fs.writeFile(path.join(outDir, 'gauntlet-summary.json'), JSON.stringify({ summary, rollup }, null, 2));
  await fs.writeFile(path.join(outDir, 'ROLLUP.md'), renderRollUp(rollup));

  const lines = [
    '# Prof Gauntlet — launch-bar report',
    '',
    `_SIMULATED · UNANCHORED · ${startedAt}_`,
    '',
    `Total spend: $${summary.totalSpendUsd.toFixed(2)} of $${args.budget} cap`,
    '',
  ];
  lines.push('| arena | scenario | mode | findings | teach-as-is | spend |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const step of summary.steps) {
    lines.push(
      `| ${step.arena} | ${step.scenario} | ${step.mode} | ${step.findings ?? 'n/a'} | ${step.teachAsIs ?? '—'} | $${(step.spendUsd ?? 0).toFixed(3)} |`,
    );
  }
  await fs.writeFile(path.join(outDir, 'GAUNTLET_REPORT.md'), lines.join('\n'));
  console.log(
    `\n[gauntlet] total spend $${summary.totalSpendUsd.toFixed(2)} · report ${path.relative(repoRoot, path.join(outDir, 'GAUNTLET_REPORT.md'))}`,
  );
}

main().catch((error) => {
  console.error(`[gauntlet] FAILED: ${error.message}`);
  process.exitCode = 1;
});
