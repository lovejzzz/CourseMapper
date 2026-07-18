#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { buildScionAdapterDataset } from './scionAdapterDataset.mjs';
import { sha256File } from './scionAdapterPackage.mjs';
import { auditScionAdapterTaskScope } from './scionAdapterTaskScopeAudit.mjs';

const EVIDENCE_PATH = 'evaluation/scion-adapters/evidence/task-scope-audit-v0.16.53.json';

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stable(value[key])]),
  );
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function main() {
  const expected = JSON.parse(await fs.readFile(EVIDENCE_PATH, 'utf8'));
  const benchmarkPath = expected.inputs.benchmarkPath;
  const benchmarkText = await fs.readFile(benchmarkPath, 'utf8');
  const benchmark = JSON.parse(benchmarkText);
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-task-scope-audit-'));
  try {
    const built = await buildScionAdapterDataset({
      sources: expected.dataset.sourceReceipts.map((receipt) => receipt.path),
      outputDir,
      heldoutBenchmarkPath: benchmarkPath,
      generatedAt: expected.generatedAt,
      allowResearch: true,
      semanticProfile: expected.dataset.admissionPolicy.semanticProfile,
    });
    const actual = auditScionAdapterTaskScope({
      dataset: built.manifest,
      benchmark,
      generatedAt: expected.generatedAt,
    });
    actual.inputs = {
      datasetPath: expected.inputs.datasetPath,
      datasetManifestSha256: await sha256File(built.manifestPath),
      benchmarkPath,
      benchmarkManifestSha256: sha256(benchmarkText),
    };
    const valid = JSON.stringify(stable(actual)) === JSON.stringify(stable(expected));
    const report = {
      status: valid ? 'pass' : 'fail',
      valid,
      evidencePath: EVIDENCE_PATH,
      datasetIdentitySha256: actual.dataset.identitySha256,
      taskScopeIdentitySha256: actual.dataset.taskScope?.identity?.sha256 || null,
      wholeCourseAdapterEligible: actual.courseBenchmark.eligible,
      missingAdapterFamilies: actual.courseBenchmark.missingAdapterFamilies,
    };
    console.log(JSON.stringify(report, null, 2));
    if (!valid) process.exitCode = 1;
  } finally {
    await fs.rm(outputDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
