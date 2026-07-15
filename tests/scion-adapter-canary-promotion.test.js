import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import JSZip from 'jszip';
import { afterEach, describe, expect, it } from 'vitest';

import {
  auditScionAdapterFactualCanaryEvidence,
  auditScionAdapterProductionCanaryEvidence,
  SCION_ADAPTER_FACTUAL_CANONICAL_PATHS,
  SCION_ADAPTER_FACTUAL_CLAIM_BOUNDARY,
  SCION_ADAPTER_FACTUAL_PROMOTION_PROTOCOL,
  SCION_ADAPTER_FACTUAL_RUN_PROTOCOL,
  SCION_ADAPTER_FACTUAL_STOPPING_RULE,
  SCION_ADAPTER_PRODUCTION_CANONICAL_PATHS,
  SCION_ADAPTER_PRODUCTION_CLAIM_BOUNDARY,
  SCION_ADAPTER_PRODUCTION_PROMOTION_PROTOCOL,
  SCION_ADAPTER_PRODUCTION_STOPPING_RULE,
  SCION_ADAPTER_RUNTIME_RECEIPT_PROTOCOL,
} from '../scripts/lib/scionAdapterCanaryPromotion.mjs';
import { computeScionAdapterPackageIdentity } from '../scripts/lib/scionBrowserDeviceMatrix.mjs';
import { loadFactualCanaryPacket } from '../scripts/scionFactualCanaryAudit.mjs';

const SOURCE_ROOT = process.cwd();
const NOW = new Date('2026-07-15T15:00:00.000Z');
const roots = [];

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

async function writeBytes(filePath, bytes) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, bytes);
  return sha256(bytes);
}

async function writeJson(filePath, value) {
  return writeBytes(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function canonicalBindings(paths) {
  return Object.fromEntries(
    await Promise.all(
      Object.entries(paths).map(async ([key, relativePath]) => [
        key,
        { path: relativePath, sha256: sha256(await fs.readFile(path.join(SOURCE_ROOT, relativePath))) },
      ]),
    ),
  );
}

function adapterManifest() {
  return {
    schemaVersion: 2,
    adapter: { id: 'scion-g4e2b-quality-v1', scionVersion: '0.16.30', format: 'gguf-lora', scale: 1 },
    base: {
      modelId: 'google/gemma-4-E2B-it-qat-q4_0-unquantized',
      revision: '1ca4dd94b623b6e0dd9da00c2239ab84b4f3e5ce',
      architecture: 'gemma4',
      role: 'instruction',
      exactRevisionRequired: true,
    },
    training: { datasetManifestSha256: 'd'.repeat(64), pairCount: 3200 },
    files: [{ path: 'adapter.gguf', bytes: 50_000_000, sha256: 'e'.repeat(64) }],
    runtime: { supported: ['scion-wllama-webgpu-jspi-v1'] },
    promotion: { status: 'candidate', promotable: false, evidence: [] },
  };
}

function runtime(manifest, packageIdentity) {
  return {
    providerFamily: 'public-scion',
    runtimeId: 'scion-wllama-webgpu-jspi-v1',
    modelId: manifest.base.modelId,
    baseRevision: manifest.base.revision,
    adapterActive: true,
    nativeAdapterActive: true,
    adapterId: manifest.adapter.id,
    adapterPackageIdentitySha256: packageIdentity,
    adapterScale: manifest.adapter.scale,
    manifestVerified: true,
    packageIdentityVerified: true,
    nativeMetadata: { generalType: 'adapter', adapterType: 'lora', architecture: 'gemma4' },
  };
}

async function buildFactualFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-factual-promotion-'));
  roots.push(root);
  const manifest = adapterManifest();
  const packageIdentity = computeScionAdapterPackageIdentity(manifest).sha256;
  const packet = await loadFactualCanaryPacket();
  const packetSha256 = sha256(JSON.stringify(packet));
  const runBindings = [];
  const modes = ['cold', 'cold', 'source-grounded', 'source-grounded'];
  for (let index = 0; index < modes.length; index += 1) {
    const mode = modes[index];
    const id = `${mode}-${(index % 2) + 1}`;
    const answers = packet.cases.map((entry) => entry.answerIndex);
    const run = {
      schemaVersion: 1,
      protocolVersion: SCION_ADAPTER_FACTUAL_RUN_PROTOCOL,
      runId: id,
      mode,
      observedAt: `2026-07-15T12:0${index + 1}:00.000Z`,
      canaryPacketSha256: packetSha256,
      runtime: runtime(manifest, packageIdentity),
      request: { caseCount: 25, batchSize: 1, totalRequests: 25, successfulRequests: 25 },
      response: { answers, rawAnswers: packet.cases.map((entry) => entry.options[entry.answerIndex]) },
    };
    const relativePath = `runs/${id}.json`;
    runBindings.push({ id, mode, path: relativePath, sha256: await writeJson(path.join(root, relativePath), run) });
  }
  const evidence = {
    schemaVersion: 1,
    protocolVersion: SCION_ADAPTER_FACTUAL_PROMOTION_PROTOCOL,
    claimBoundary: SCION_ADAPTER_FACTUAL_CLAIM_BOUNDARY,
    canonical: await canonicalBindings(SCION_ADAPTER_FACTUAL_CANONICAL_PATHS),
    canaryPacketSha256: packetSha256,
    adapter: {
      id: manifest.adapter.id,
      packageIdentitySha256: packageIdentity,
      baseModelId: manifest.base.modelId,
      baseRevision: manifest.base.revision,
      scale: manifest.adapter.scale,
    },
    campaign: {
      status: 'complete',
      startedAt: '2026-07-15T12:00:00.000Z',
      completedAt: '2026-07-15T12:10:00.000Z',
      stoppingRule: SCION_ADAPTER_FACTUAL_STOPPING_RULE,
    },
    runs: runBindings,
  };
  const evidencePath = path.join(root, 'factual-canaries.json');
  await writeJson(evidencePath, evidence);
  return { root, manifest, packageIdentity, packet, evidence, evidencePath };
}

async function auditFactual(fixture) {
  return auditScionAdapterFactualCanaryEvidence({
    root: SOURCE_ROOT,
    evidencePath: fixture.evidencePath,
    evidence: fixture.evidence,
    adapterManifest: fixture.manifest,
    adapterPackageIdentitySha256: fixture.packageIdentity,
  });
}

async function buildZip(runId, appVersion) {
  const zip = new JSZip();
  zip.file(
    'PACKAGE_MANIFEST.json',
    `${JSON.stringify({
      appVersion,
      readiness: { status: 'ready', blockers: 0, warnings: 0 },
      quality: { score: 99, findingCounts: { p0: 0, p1: 0, p2: 0 } },
    })}\n`,
  );
  for (let index = 1; index <= 9; index += 1) zip.file(`deliverables/${runId}-${index}.txt`, `artifact ${index}`);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' });
}

async function buildProductionFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-production-promotion-'));
  roots.push(root);
  const manifest = adapterManifest();
  const packageIdentity = computeScionAdapterPackageIdentity(manifest).sha256;
  const bindings = [];
  for (let index = 0; index < 3; index += 1) {
    const id = `production-run-${index + 1}`;
    const traceRunId = `trace-${index + 1}`;
    const artifactRoot = path.join(root, 'artifacts', id);
    const zipPath = path.join(artifactRoot, 'package.zip');
    const tracePath = path.join(artifactRoot, 'trace.json');
    const consolePath = path.join(artifactRoot, 'console.log');
    const receiptPath = path.join(artifactRoot, 'runtime-receipt.json');
    const packageSha256 = await writeBytes(zipPath, await buildZip(id, manifest.adapter.scionVersion));
    const trace = {
      appVersion: manifest.adapter.scionVersion,
      runId: traceRunId,
      gates: {
        finalStatus: 'ready',
        exportStatus: 'passed',
        qualityScore: 99,
        qualityP0: 0,
        qualityP1: 0,
        qualityP2: 0,
      },
    };
    const traceSha256 = await writeJson(tracePath, trace);
    const consoleLogSha256 = await writeBytes(consolePath, `Scion adapter run ${id} completed\n`);
    const receipt = {
      schemaVersion: 1,
      protocolVersion: SCION_ADAPTER_RUNTIME_RECEIPT_PROTOCOL,
      runId: id,
      capturedAt: `2026-07-15T13:0${index + 4}:00.000Z`,
      runtime: runtime(manifest, packageIdentity),
      artifacts: { packageSha256, traceSha256, consoleLogSha256 },
    };
    const runtimeReceiptSha256 = await writeJson(receiptPath, receipt);
    const run = {
      runId: id,
      traceRunId,
      generatedAt: `2026-07-15T13:0${index + 1}:00.000Z`,
      app: { version: manifest.adapter.scionVersion, commit: `${index + 1}`.repeat(40), dirtyTree: false },
      course: { title: `Canary ${index + 1}`, domain: index === 1 ? 'music-theory' : 'studio-lab', lessonCount: 12 },
      provider: { family: 'public-scion', mode: 'live', simulated: false },
      runtime: runtime(manifest, packageIdentity),
      requests: { total: 3, successful: 3, httpStatuses: [200, 200, 200] },
      generation: { lessonsProduced: 12, duplicateTopics: 0 },
      package: { sha256: packageSha256, fileCount: 10, officeStructuralValidation: 'pass' },
      quality: { score: 99, p0: 0, p1: 0, p2: 0 },
      evidence: {
        traceSha256,
        consoleLogSha256,
        runtimeReceiptSha256,
        retention: { status: 'retained' },
        visualQa: {
          status: 'pass',
          reviewerClass: 'codex',
          reviewedAt: `2026-07-15T13:0${index + 5}:00.000Z`,
        },
        artifacts: {
          zip: { path: path.relative(root, zipPath), sha256: packageSha256 },
          trace: { path: path.relative(root, tracePath), sha256: traceSha256 },
          consoleLog: { path: path.relative(root, consolePath), sha256: consoleLogSha256 },
          runtimeReceipt: { path: path.relative(root, receiptPath), sha256: runtimeReceiptSha256 },
        },
      },
    };
    const relativePath = `runs/${id}.json`;
    bindings.push({ id, path: relativePath, sha256: await writeJson(path.join(root, relativePath), run) });
  }
  const evidence = {
    schemaVersion: 1,
    protocolVersion: SCION_ADAPTER_PRODUCTION_PROMOTION_PROTOCOL,
    claimBoundary: SCION_ADAPTER_PRODUCTION_CLAIM_BOUNDARY,
    canonical: await canonicalBindings(SCION_ADAPTER_PRODUCTION_CANONICAL_PATHS),
    adapter: {
      id: manifest.adapter.id,
      packageIdentitySha256: packageIdentity,
      baseModelId: manifest.base.modelId,
      baseRevision: manifest.base.revision,
      scale: manifest.adapter.scale,
    },
    campaign: {
      status: 'complete',
      startedAt: '2026-07-15T13:00:00.000Z',
      completedAt: '2026-07-15T13:10:00.000Z',
      stoppingRule: SCION_ADAPTER_PRODUCTION_STOPPING_RULE,
    },
    runs: bindings,
  };
  const evidencePath = path.join(root, 'production-canaries.json');
  await writeJson(evidencePath, evidence);
  return { root, manifest, packageIdentity, evidence, evidencePath };
}

async function auditProduction(fixture) {
  return auditScionAdapterProductionCanaryEvidence({
    root: SOURCE_ROOT,
    evidencePath: fixture.evidencePath,
    evidence: fixture.evidence,
    adapterManifest: fixture.manifest,
    adapterPackageIdentitySha256: fixture.packageIdentity,
    now: NOW,
  });
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe('Scion adapter semantic canary promotion evidence', () => {
  it('keeps both handoff templates bound to their canonical policies', async () => {
    for (const [templatePath, canonicalPaths] of [
      ['evaluation/scion-adapters/factual-canary-promotion.template.json', SCION_ADAPTER_FACTUAL_CANONICAL_PATHS],
      ['evaluation/scion-adapters/production-canary-promotion.template.json', SCION_ADAPTER_PRODUCTION_CANONICAL_PATHS],
    ]) {
      const template = JSON.parse(await fs.readFile(path.join(SOURCE_ROOT, templatePath), 'utf8'));
      for (const [key, relativePath] of Object.entries(canonicalPaths)) {
        expect(template.canonical[key]).toEqual({
          path: relativePath,
          sha256: sha256(await fs.readFile(path.join(SOURCE_ROOT, relativePath))),
        });
      }
    }
  });

  it('accepts four exact adapter factual runs only after recomputing every answer', async () => {
    const fixture = await buildFactualFixture();
    const report = await auditFactual(fixture);
    expect(report).toMatchObject({ status: 'pass', promotionEligible: true });
    expect(report.runs).toHaveLength(4);
    expect(report.runs.every((run) => run.report.correct === 25)).toBe(true);
  });

  it('rejects a refreshed factual artifact whose answers miss the declared floor', async () => {
    const fixture = await buildFactualFixture();
    const binding = fixture.evidence.runs[0];
    const runPath = path.join(fixture.root, binding.path);
    const run = JSON.parse(await fs.readFile(runPath, 'utf8'));
    for (let index = 0; index < 3; index += 1) {
      run.response.answers[index] = (run.response.answers[index] + 1) % 4;
      run.response.rawAnswers[index] = fixture.packet.cases[index].options[run.response.answers[index]];
    }
    binding.sha256 = await writeJson(runPath, run);
    const report = await auditFactual(fixture);
    expect(report.status).toBe('blocked');
    expect(report.issues).toContain('run:cold-1:factual-floor');
  });

  it('rejects factual endpoint relabeling and a repeated run artifact', async () => {
    const fixture = await buildFactualFixture();
    const first = fixture.evidence.runs[0];
    const runPath = path.join(fixture.root, first.path);
    const run = JSON.parse(await fs.readFile(runPath, 'utf8'));
    run.runtime.adapterId = 'different-adapter';
    first.sha256 = await writeJson(runPath, run);
    fixture.evidence.runs[1].path = first.path;
    fixture.evidence.runs[1].sha256 = first.sha256;
    const report = await auditFactual(fixture);
    expect(report.status).toBe('blocked');
    expect(report.issues).toEqual(expect.arrayContaining(['duplicate-run-artifact', 'run:cold-1:runtime:adapter-id']));
  });

  it('accepts exactly three retained semantic production canaries across two domains', async () => {
    const fixture = await buildProductionFixture();
    const report = await auditProduction(fixture);
    expect(report).toMatchObject({
      status: 'pass',
      promotionEligible: true,
      summary: { status: 'pass', proofEligibleRuns: 3, domains: ['studio-lab', 'music-theory'] },
    });
    expect(report.runs.every((run) => run.releasePass)).toBe(true);
  });

  it('rejects a refreshed production summary that disagrees with the retained package', async () => {
    const fixture = await buildProductionFixture();
    const binding = fixture.evidence.runs[0];
    const runPath = path.join(fixture.root, binding.path);
    const run = JSON.parse(await fs.readFile(runPath, 'utf8'));
    run.quality.score = 100;
    binding.sha256 = await writeJson(runPath, run);
    const report = await auditProduction(fixture);
    expect(report.status).toBe('blocked');
    expect(report.issues).toEqual(
      expect.arrayContaining([
        'run:production-run-1:trace-semantic-binding',
        'run:production-run-1:package-semantic-binding',
      ]),
    );
  });

  it('rejects path traversal, missing adapter receipts, and legacy hash-only pass objects', async () => {
    const fixture = await buildProductionFixture();
    const binding = fixture.evidence.runs[0];
    const runPath = path.join(fixture.root, binding.path);
    const run = JSON.parse(await fs.readFile(runPath, 'utf8'));
    run.evidence.artifacts.trace.path = '../escaped-trace.json';
    delete run.runtime.adapterPackageIdentitySha256;
    binding.sha256 = await writeJson(runPath, run);
    const report = await auditProduction(fixture);
    expect(report.status).toBe('blocked');
    expect(report.issues).toEqual(
      expect.arrayContaining([
        'run:production-run-1:artifact-integrity',
        'run:production-run-1:runtime:adapter-package-identity',
      ]),
    );

    const dummy = await auditScionAdapterProductionCanaryEvidence({
      root: SOURCE_ROOT,
      evidencePath: fixture.evidencePath,
      evidence: { type: 'production-canaries', status: 'pass' },
      adapterManifest: fixture.manifest,
      adapterPackageIdentitySha256: fixture.packageIdentity,
      now: NOW,
    });
    expect(dummy).toMatchObject({ status: 'blocked', promotionEligible: false });
    expect(dummy.issues).toEqual(expect.arrayContaining(['evidence-schema-version', 'evidence-protocol-version']));
  });

  it('uses a stable package identity that does not include mutable promotion attestations', () => {
    const manifest = adapterManifest();
    const before = computeScionAdapterPackageIdentity(manifest).sha256;
    manifest.promotion.evidence.push({
      type: 'factual-canaries',
      status: 'pass',
      path: 'factual.json',
      sha256: 'f'.repeat(64),
    });
    const after = computeScionAdapterPackageIdentity(manifest).sha256;
    expect(after).toBe(before);
  });
});
