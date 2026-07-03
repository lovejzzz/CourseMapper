#!/usr/bin/env node
// Trellis CLI — docs/TRELLIS.md §15.
//   npm run trellis -- generate --syllabus <path> [--tier draft] [--mock] [--grade] [--budget 5] [--run-id <id>] [--term-start YYYY-MM-DD]
//   npm run trellis -- generate --graph trellis/fixtures/graphs/researchMethods8.mjs [--mock] [--grade]
//   npm run trellis -- replan --run <id> --lock-weeks 1-6 [--drop-lesson lN] [--note "…"]
//   npm run trellis -- cost --run <id>

import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let i = 0; i < rest.length; i += 1) {
    if (!rest[i].startsWith('--')) continue;
    const key = rest[i].slice(2);
    const next = rest[i + 1];
    if (next === undefined || next.startsWith('--')) options[key] = true;
    else {
      options[key] = next;
      i += 1;
    }
  }
  return { command, options };
}

function newRunId(prefix) {
  return `${prefix}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
}

async function cmdGenerate(options) {
  const { runPipeline } = await import('./pipeline.mjs');
  let graph = null;
  let syllabusText = null;
  if (options.graph) {
    const module = await import(pathToFileURL(resolve(options.graph)).href);
    const builder = Object.values(module).find((v) => typeof v === 'function');
    graph = builder();
  } else if (options.syllabus) {
    syllabusText = await readFile(options.syllabus, 'utf8');
  } else {
    throw new Error('generate needs --syllabus <path> or --graph <module>');
  }
  const result = await runPipeline({
    graph,
    syllabusText,
    tier: options.tier ?? 'draft',
    mockVoice: Boolean(options.mock),
    gradePackage: Boolean(options.grade),
    budgetUsd: Number(options.budget ?? 5),
    termStart: options['term-start'] ?? null,
    runId: options['run-id'] ?? newRunId(options.mock ? 'mock' : 'live'),
  });
  console.log(`\nrun: ${result.runId}\npackage: ${result.runDir}/package`);
  console.log(`digest: ${JSON.stringify(result.digest, null, 2)}`);
  console.log(`\n${result.ledger.costTable()}`);
  if (result.grade) {
    console.log(
      `\ngrade: ${result.grade.overall.score}/${result.grade.overall.grade} (P0=${result.grade.stats.p0} P1=${result.grade.stats.p1} P2=${result.grade.stats.p2})`,
    );
  }
}

async function cmdReplan(options) {
  const { replanRun } = await import('./graph/replan.mjs');
  if (!options.run) throw new Error('replan needs --run <runId>');
  const outcome = await replanRun({
    runDir: join('trellis/runs', options.run),
    lockWeeks: options['lock-weeks'] ?? null,
    dropLessonId: options['drop-lesson'] ?? null,
    note: options.note ?? 'replan',
  });
  console.log(JSON.stringify(outcome.summary, null, 2));
}

async function cmdCost(options) {
  if (!options.run) throw new Error('cost needs --run <runId>');
  const ledger = JSON.parse(await readFile(join('trellis/runs', options.run, 'ledger.json'), 'utf8'));
  console.log(JSON.stringify(ledger.totals, null, 2));
}

const { command, options } = parseArgs(process.argv.slice(2));
const commands = { generate: cmdGenerate, replan: cmdReplan, cost: cmdCost };
if (!commands[command]) {
  console.error(`unknown command "${command}" — have: ${Object.keys(commands).join(', ')}`);
  process.exit(1);
}
commands[command](options).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
