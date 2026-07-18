#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  assessScionAdapterTaskScopeAgainstBenchmark,
  validateScionHeldoutBenchmark,
} from './scionAdapterPairedEvidence.mjs';
import { scionAdapterTaskScopePayload, validateScionAdapterTaskScope } from '../src/lib/scionAdapterTaskScope.js';

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function stableJson(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function auditScionAdapterTaskScope({ dataset, benchmark, generatedAt = new Date().toISOString() } = {}) {
  const scopeValidation = validateScionAdapterTaskScope(dataset?.taskScope, { expectedRows: dataset?.counts?.total });
  const expectedScopeIdentity = sha256(stableJson(scionAdapterTaskScopePayload(dataset?.taskScope)));
  const benchmarkValidation = validateScionHeldoutBenchmark(benchmark);
  const adapterManifest = {
    training: { pairCount: dataset?.counts?.total, taskScope: dataset?.taskScope },
  };
  const courseBenchmark = assessScionAdapterTaskScopeAgainstBenchmark(benchmark, adapterManifest);
  const issues = [
    ...scopeValidation.issues,
    ...(dataset?.taskScope?.identity?.sha256 === expectedScopeIdentity ? [] : ['task-scope-identity-mismatch']),
    ...benchmarkValidation.issues.map((issue) => `benchmark:${issue}`),
  ];
  return {
    schemaVersion: 1,
    protocol: 'scion-adapter-task-scope-audit-v1',
    generatedAt,
    status: issues.length === 0 ? 'pass' : 'fail',
    issues: [...new Set(issues)],
    dataset: {
      identitySha256: dataset?.identity?.sha256 || null,
      admittedRows: Number(dataset?.counts?.total) || 0,
      taskScope: dataset?.taskScope || null,
      sourceReceipts: dataset?.sourceReceipts || [],
      admissionPolicy: dataset?.admissionPolicy || null,
      trainingFormat: dataset?.trainingFormat || null,
      holdoutBoundary: dataset?.holdoutBoundary || null,
    },
    benchmark: {
      id: benchmark?.id || null,
      runtimeTaskPolicy: benchmark?.runtimeTaskPolicy || null,
    },
    courseBenchmark: {
      ...courseBenchmark,
      claim: courseBenchmark.eligible
        ? 'The declared training families are eligible for request-routed whole-course evaluation.'
        : 'This corpus may train only its declared atom families; it cannot support a whole-course adapter claim.',
    },
  };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--dataset') args.datasetPath = argv[++index];
    else if (argv[index] === '--benchmark') args.benchmarkPath = argv[++index];
    else if (argv[index] === '--output') args.outputPath = argv[++index];
    else if (argv[index] === '--generated-at') args.generatedAt = argv[++index];
    else if (argv[index] === '--dataset-label') args.datasetLabel = argv[++index];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.datasetPath || !args.benchmarkPath) throw new Error('--dataset and --benchmark are required');
  const [datasetText, benchmarkText] = await Promise.all([
    fs.readFile(args.datasetPath, 'utf8'),
    fs.readFile(args.benchmarkPath, 'utf8'),
  ]);
  const report = auditScionAdapterTaskScope({
    dataset: JSON.parse(datasetText),
    benchmark: JSON.parse(benchmarkText),
    generatedAt: args.generatedAt,
  });
  report.inputs = {
    datasetPath: args.datasetLabel || args.datasetPath,
    datasetManifestSha256: sha256(datasetText),
    benchmarkPath: args.benchmarkPath,
    benchmarkManifestSha256: sha256(benchmarkText),
  };
  const text = `${JSON.stringify(report, null, 2)}\n`;
  if (args.outputPath) {
    await fs.mkdir(path.dirname(path.resolve(args.outputPath)), { recursive: true });
    await fs.writeFile(args.outputPath, text);
  } else {
    process.stdout.write(text);
  }
  if (report.status !== 'pass') process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
