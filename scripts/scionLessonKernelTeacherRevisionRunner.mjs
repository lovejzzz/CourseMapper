#!/usr/bin/env node
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { validateScionLessonKernelTeacherRevisionResult } from './lib/scionLessonKernelTeacherRevision.mjs';

const OUTPUT_DIR = 'verification-output/scion-lesson-kernel-teacher-revision-v0.16.54';
const SESSION_TIMEOUT_MS = 20 * 60 * 1000;

function parseArgs(argv) {
  const args = {
    output: OUTPUT_DIR,
    model: 'gpt-5.6-sol',
    reasoning: 'xhigh',
    concurrency: 2,
    limit: 0,
    batches: [],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--output') args.output = argv[++index] || args.output;
    else if (token === '--model') args.model = argv[++index] || args.model;
    else if (token === '--reasoning') args.reasoning = argv[++index] || args.reasoning;
    else if (token === '--concurrency') args.concurrency = Number(argv[++index] || 0);
    else if (token === '--limit') args.limit = Number(argv[++index] || 0);
    else if (token === '--batch') args.batches.push(argv[++index] || '');
    else if (token === '--help' || token === '-h') args.help = true;
    else throw new Error(`Unknown teacher revision runner option: ${token}`);
  }
  if (!Number.isInteger(args.concurrency) || args.concurrency < 1 || args.concurrency > 4) {
    throw new Error('--concurrency must be an integer from 1 through 4');
  }
  if (!Number.isInteger(args.limit) || args.limit < 0) throw new Error('--limit must be a non-negative integer');
  if (args.batches.some((batchId) => !batchId)) throw new Error('--batch requires a batch id');
  return args;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function atomicWriteJson(file, value) {
  const absolute = path.resolve(file);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  const temporary = `${absolute}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await fs.rename(temporary, absolute);
}

async function resultIsValid(file, packet) {
  try {
    return validateScionLessonKernelTeacherRevisionResult(await readJson(file), packet).valid;
  } catch {
    return false;
  }
}

async function codexVersion(codex) {
  return new Promise((resolve, reject) => {
    const child = spawn(codex, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`Codex CLI preflight failed (${code}): ${stderr.trim()}`));
    });
  });
}

async function runCommand(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let forceKill = null;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      forceKill = setTimeout(() => child.kill('SIGKILL'), 5_000);
    }, SESSION_TIMEOUT_MS);
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', (error) => {
      clearTimeout(timeout);
      if (forceKill) clearTimeout(forceKill);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (forceKill) clearTimeout(forceKill);
      if (timedOut) reject(new Error(`Codex teacher revision timed out after ${SESSION_TIMEOUT_MS / 60_000} minutes`));
      else if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`Codex teacher revision failed (${code}): ${(stderr || stdout).slice(-2000)}`));
    });
  });
}

async function runTask(task, args, codex, runtimeVersion) {
  const sourceDir = path.join(args.output, 'batches', task.batchId);
  const packet = await readJson(path.join(sourceDir, 'packet.json'));
  const target = path.join(sourceDir, 'result.json');
  if (await resultIsValid(target, packet)) {
    console.log(`[scion-teacher] ${task.batchId}: valid revision already exists`);
    return { status: 'resumed', task };
  }
  const cleanroom = await fs.mkdtemp(path.join(os.tmpdir(), `scion-teacher-${task.batchId}-`));
  const sessionId = `scion-v01654-teacher-${task.batchId}-${crypto.randomUUID()}`;
  const reviser = { model: args.model, revision: runtimeVersion, runtime: 'codex-cli-ephemeral-source-cleanroom' };
  try {
    await Promise.all([
      fs.copyFile(path.join(sourceDir, 'teacher-prompt.md'), path.join(cleanroom, 'teacher-prompt.md')),
      fs.copyFile(path.join(sourceDir, 'packet.json'), path.join(cleanroom, 'packet.json')),
      fs.copyFile(path.join(sourceDir, 'result.schema.json'), path.join(cleanroom, 'result.schema.json')),
    ]);
    const instructions = [
      'Use only teacher-prompt.md, packet.json, and result.schema.json in this cleanroom.',
      'Read the source-bound revision prompt and revise every case in packet.json.',
      'Do not inspect parent directories, the repository, local-model artifacts, provider identities, or training data.',
      `Set packetSha256 exactly to ${packet.identity.sha256}.`,
      `Set sessionId exactly to ${sessionId}.`,
      `Set reviser exactly to ${JSON.stringify(reviser)}.`,
      'Set all attestations true only after using no factual information beyond each supplied sourceContext.claims array.',
      'Return valid JSON matching result.schema.json with one revision for every packet case. Do not include markdown.',
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
        'result.schema.json',
        '-o',
        'result.json',
        instructions,
      ],
      { cwd: cleanroom, env: process.env },
    );
    const result = await readJson(path.join(cleanroom, 'result.json'));
    const validation = validateScionLessonKernelTeacherRevisionResult(result, packet);
    if (!validation.valid) throw new Error(`Invalid teacher result ${task.batchId}: ${validation.issues.join(', ')}`);
    await atomicWriteJson(target, result);
    console.log(`[scion-teacher] ${task.batchId}: ${packet.cases.length} revisions complete`);
    return { status: 'completed', task };
  } finally {
    await fs.rm(cleanroom, { recursive: true, force: true });
  }
}

async function runPool(tasks, concurrency, handler) {
  let next = 0;
  const results = [];
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
      'Usage: node scripts/scionLessonKernelTeacherRevisionRunner.mjs [--concurrency 2] [--limit N] [--batch batch-id]',
    );
    return;
  }
  const codex = process.env.CODEX_CLI || path.join(os.homedir(), '.local', 'bin', 'codex');
  const runtimeVersion = await codexVersion(codex);
  const manifest = await readJson(path.join(args.output, 'workbook.json'));
  let tasks = (manifest.batches || []).map((entry) => ({ batchId: entry.batchId }));
  if (args.batches.length > 0) {
    const selected = new Set(args.batches);
    tasks = tasks.filter((task) => selected.has(task.batchId));
    const found = new Set(tasks.map((task) => task.batchId));
    const missing = [...selected].filter((batchId) => !found.has(batchId));
    if (missing.length > 0) throw new Error(`Unknown teacher revision batch: ${missing.join(', ')}`);
  }
  if (args.limit > 0) tasks = tasks.slice(0, args.limit);
  const results = await runPool(tasks, args.concurrency, (task) => runTask(task, args, codex, runtimeVersion));
  console.log(
    `Scion teacher revision runner: ${results.filter((entry) => entry.status === 'completed').length} completed / ${results.filter((entry) => entry.status === 'resumed').length} resumed / ${tasks.length} sessions`,
  );
}

if (import.meta.url === pathToFileURL(path.resolve(process.argv[1] || '')).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
