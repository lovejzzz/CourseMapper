#!/usr/bin/env node
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { validateScionLessonKernelJudgeReview } from './lib/scionLessonKernelJudge.mjs';

const OUTPUT_DIR = 'verification-output/scion-lesson-kernel-judge-batches-v0.16.54';

function parseArgs(argv) {
  const args = {
    output: OUTPUT_DIR,
    model: 'gpt-5.6-sol',
    reasoning: 'xhigh',
    concurrency: 2,
    limit: 0,
    includePartial: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--output') args.output = argv[++index] || args.output;
    else if (token === '--model') args.model = argv[++index] || args.model;
    else if (token === '--reasoning') args.reasoning = argv[++index] || args.reasoning;
    else if (token === '--concurrency') args.concurrency = Number(argv[++index] || 0);
    else if (token === '--limit') args.limit = Number(argv[++index] || 0);
    else if (token === '--include-partial') args.includePartial = true;
    else if (token === '--help' || token === '-h') args.help = true;
    else throw new Error(`Unknown lesson-kernel judge runner option: ${token}`);
  }
  if (!Number.isInteger(args.concurrency) || args.concurrency < 1 || args.concurrency > 4) {
    throw new Error('--concurrency must be an integer from 1 through 4');
  }
  if (!Number.isInteger(args.limit) || args.limit < 0) throw new Error('--limit must be a non-negative integer');
  return args;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function existingReviewIsValid(file, packet) {
  try {
    const review = await readJson(file);
    return validateScionLessonKernelJudgeReview(review, packet).valid;
  } catch {
    return false;
  }
}

async function atomicWriteJson(file, value) {
  const absolute = path.resolve(file);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  const temporary = `${absolute}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await fs.rename(temporary, absolute);
}

async function codexVersion(codex) {
  return new Promise((resolve, reject) => {
    const child = spawn(codex, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let error = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (error += chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(output.trim());
      else reject(new Error(`Codex CLI preflight failed (${code}): ${error.trim()}`));
    });
  });
}

async function runCommand(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`Codex judge failed (${code}): ${(stderr || stdout).slice(-2000)}`));
    });
  });
}

async function runTask(task, args, codex, runtimeVersion) {
  const stem = task.order === 'A/B' ? 'a-b' : 'b-a';
  const sourceDir = path.join(args.output, 'batches', task.batchId);
  const targetReview = path.join(sourceDir, `${stem}.review.json`);
  const packet = await readJson(path.join(sourceDir, `${stem}.packet.json`));
  if (await existingReviewIsValid(targetReview, packet)) {
    console.log(`[scion-judge] ${task.batchId} ${task.order}: valid review already exists`);
    return { status: 'resumed', task };
  }

  const cleanroom = await fs.mkdtemp(path.join(os.tmpdir(), `scion-${task.batchId}-${stem}-`));
  const sessionId = `scion-v01654-${task.batchId}-${stem}-${crypto.randomUUID()}`;
  try {
    await Promise.all([
      fs.copyFile(path.join(sourceDir, 'judge-prompt.md'), path.join(cleanroom, 'judge-prompt.md')),
      fs.copyFile(path.join(sourceDir, `${stem}.packet.json`), path.join(cleanroom, 'packet.json')),
      fs.copyFile(path.join(sourceDir, `${stem}.review.template.json`), path.join(cleanroom, 'review.template.json')),
      fs.copyFile(path.join(sourceDir, 'review.schema.json'), path.join(cleanroom, 'review.schema.json')),
    ]);
    const instructions = [
      'Use only judge-prompt.md, packet.json, review.template.json, and review.schema.json in this cleanroom.',
      'Read the judge prompt and score every anonymous case in packet.json.',
      'Do not inspect parent directories, the repository, capture reports, another order, prior outcomes, or any organizer mapping.',
      `Set sessionId exactly to ${sessionId}.`,
      `Set judge exactly to ${JSON.stringify({ model: args.model, revision: runtimeVersion, runtime: 'codex-cli-ephemeral-isolated-cleanroom' })}.`,
      'Set all three attestations true only after following those restrictions.',
      'Return the completed review as valid JSON matching review.schema.json. Do not include markdown.',
    ].join(' ');
    await runCommand(
      codex,
      [
        'exec',
        '--ephemeral',
        '--ignore-user-config',
        '--ignore-rules',
        '--skip-git-repo-check',
        '--sandbox',
        'read-only',
        '-m',
        args.model,
        '-c',
        `model_reasoning_effort="${args.reasoning}"`,
        '--output-schema',
        'review.schema.json',
        '-o',
        'review.json',
        instructions,
      ],
      { cwd: cleanroom, env: process.env },
    );
    const review = await readJson(path.join(cleanroom, 'review.json'));
    const validation = validateScionLessonKernelJudgeReview(review, packet);
    if (!validation.valid) {
      throw new Error(`Invalid ${task.batchId} ${task.order} judge output: ${validation.issues.join(', ')}`);
    }
    await atomicWriteJson(targetReview, review);
    console.log(`[scion-judge] ${task.batchId} ${task.order}: ${packet.cases.length} cases complete`);
    return { status: 'completed', task };
  } finally {
    await fs.rm(cleanroom, { recursive: true, force: true });
  }
}

async function runPool(tasks, concurrency, handler) {
  const results = [];
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const index = next;
      next += 1;
      results[index] = await handler(tasks[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      'Usage: node scripts/scionLessonKernelJudgeRunner.mjs [--model gpt-5.6-sol] [--reasoning xhigh] [--concurrency 2] [--limit N] [--include-partial]',
    );
    return;
  }
  const codex = process.env.CODEX_CLI || path.join(os.homedir(), '.local', 'bin', 'codex');
  const runtimeVersion = await codexVersion(codex);
  const manifest = await readJson(path.join(args.output, 'workbook.json'));
  const eligibleBatches = (manifest.batches || []).filter((batch) => batch.sealed || args.includePartial);
  let tasks = eligibleBatches.flatMap((batch) => ['A/B', 'B/A'].map((order) => ({ batchId: batch.batchId, order })));
  if (args.limit > 0) tasks = tasks.slice(0, args.limit);
  const results = await runPool(tasks, args.concurrency, (task) => runTask(task, args, codex, runtimeVersion));
  const completed = results.filter((result) => result.status === 'completed').length;
  const resumed = results.filter((result) => result.status === 'resumed').length;
  console.log(
    `Scion lesson-kernel judge runner: ${completed} completed / ${resumed} resumed / ${tasks.length} eligible order sessions`,
  );
}

if (import.meta.url === pathToFileURL(path.resolve(process.argv[1] || '')).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
