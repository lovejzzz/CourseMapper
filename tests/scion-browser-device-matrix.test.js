import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  SCION_ADAPTER_MANIFEST_SCHEMA_VERSION,
  SCION_BROWSER_ADAPTER_CONVERSION_PIPELINE,
  SCION_GEMMA4_E2B_BASE,
  SCION_LLAMA_CPP_LORA_CONVERTER_SHA256,
  SCION_LLAMA_CPP_REVISION,
} from '../src/lib/scionAdapterManifest.js';
import { SCION_BROWSER_GEMMA4_GGUF, SCION_BROWSER_WLLAMA_RUNTIME_ID } from '../src/lib/scionBrowserConstants.js';
import {
  auditScionBrowserDeviceMatrix,
  computeScionAdapterPackageIdentity,
  computeScionBrowserDeviceRunDigest,
  SCION_ADAPTER_PACKAGE_IDENTITY_ALGORITHM,
} from '../scripts/lib/scionBrowserDeviceMatrix.mjs';
import { verifyExternalEvidenceFiles } from '../scripts/scionAdapterPromotionAudit.mjs';

const HASH = 'a'.repeat(64);
const PROTOCOL_PATH = 'evaluation/scion-adapters/browser-device-matrix-protocol-v1.json';
const DOMAINS = ['computer-science', 'geology', 'music-theory', 'user-experience-design', 'world-history'];

function domainCounts(count) {
  return Object.fromEntries(DOMAINS.map((domain) => [domain, count]));
}

function browserManifest() {
  return {
    schemaVersion: SCION_ADAPTER_MANIFEST_SCHEMA_VERSION,
    adapter: { id: 'scion-g4e2b-device-test', scionVersion: '0.16.12', format: 'gguf-lora', scale: 1 },
    base: { ...SCION_GEMMA4_E2B_BASE, exactRevisionRequired: true },
    training: {
      method: 'orpo-lora',
      datasetManifestSha256: HASH,
      datasetStatus: 'ready',
      primaryPreferenceEvidence: 'single-model-judge',
      pairCount: 3000,
      domainCount: 5,
      groupCount: 15,
      modelJudgePairCount: 100,
      modelJudgeDomainCount: 5,
      domainGroupCounts: domainCounts(3),
      modelJudgeDomainCounts: domainCounts(20),
      splitCounts: { train: 1000, valid: 1000, test: 1000 },
      splitDomainCounts: { train: 5, valid: 5, test: 5 },
    },
    files: [
      { path: 'scion-device-test.gguf', bytes: 2048, sha256: HASH },
      { path: 'conversion-receipt.json', bytes: 1024, sha256: HASH },
    ],
    runtime: { supported: [SCION_BROWSER_WLLAMA_RUNTIME_ID] },
    conversion: {
      pipeline: SCION_BROWSER_ADAPTER_CONVERSION_PIPELINE,
      sourceAdapterId: 'scion-g4e2b-mlx-device-test',
      sourceManifestSha256: HASH,
      receiptPath: 'conversion-receipt.json',
      converter: {
        id: 'ggml-org/llama.cpp/convert_lora_to_gguf.py',
        revision: SCION_LLAMA_CPP_REVISION,
        sha256: SCION_LLAMA_CPP_LORA_CONVERTER_SHA256,
        outputType: 'f16',
      },
    },
    promotion: { status: 'candidate', promotable: false, evidence: [] },
  };
}

async function digestFile(filePath) {
  const bytes = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

async function artifactReceipts(root, runId, requiredTypes) {
  const directory = path.join(root, 'artifacts');
  await fs.mkdir(directory, { recursive: true });
  return Promise.all(
    requiredTypes.map(async (type) => {
      const relativePath = `artifacts/${runId}-${type}.json`;
      const contents = Buffer.from(JSON.stringify({ runId, type, retained: true }));
      await fs.writeFile(path.join(root, relativePath), contents);
      return {
        type,
        path: relativePath,
        bytes: contents.byteLength,
        sha256: crypto.createHash('sha256').update(contents).digest('hex'),
      };
    }),
  );
}

function hardwareFor(profileId) {
  if (profileId === 'integrated-8gb') {
    return { systemMemoryGiB: 12, gpuClass: 'integrated', gpuVendor: 'Intel', gpuModel: 'Iris Xe' };
  }
  if (profileId === 'integrated-16gb') {
    return { systemMemoryGiB: 16, gpuClass: 'integrated', gpuVendor: 'AMD', gpuModel: 'Radeon 780M' };
  }
  if (profileId === 'discrete-8gb') {
    return {
      systemMemoryGiB: 32,
      gpuClass: 'discrete',
      gpuVendor: 'NVIDIA',
      gpuModel: 'RTX 4060',
      dedicatedGpuMemoryGiB: 8,
    };
  }
  return { systemMemoryGiB: 24, gpuClass: 'apple-silicon', gpuVendor: 'Apple', gpuModel: 'M4 Pro' };
}

async function validRun({ root, profile, manifest, protocol }) {
  const runId = `device-${profile.id}`;
  const identity = computeScionAdapterPackageIdentity(manifest).sha256;
  const hardware = hardwareFor(profile.id);
  const browserFamily = profile.browserFamilies[0];
  const run = {
    runId,
    observedAt: '2026-07-13T18:00:00.000Z',
    deviceProfile: profile.id,
    identity: {
      adapterIdentitySha256: identity,
      adapterId: manifest.adapter.id,
      adapterScale: manifest.adapter.scale,
      trainingBaseRevision: manifest.base.revision,
      browserBaseRevision: SCION_BROWSER_GEMMA4_GGUF.runtimeArtifact.revision,
      runtimeId: SCION_BROWSER_WLLAMA_RUNTIME_ID,
    },
    environment: {
      browser: {
        family: browserFamily,
        version: browserFamily === 'edge' ? '140.0.1000.1' : '140.0.7339.1',
        userAgent: `${browserFamily} device qualification fixture`,
      },
      os: { family: profile.id === 'apple-silicon-16gb' ? 'macOS' : 'Windows', version: '26.0', architecture: 'arm64' },
      hardware,
    },
    measurements: {
      peakBrowserWorkingSetMiB: profile.id === 'integrated-8gb' ? 6000 : 7000,
      ...(profile.id === 'discrete-8gb' ? { peakGpuMemoryMiB: 6000 } : {}),
    },
    checks: {
      capability: { webgpu: true, jspi: true },
      coldBaseLoad: {
        completed: true,
        directPinnedPublicUrl: true,
        modelBackendRequired: false,
        baseSha256Verified: true,
        baseSha256: SCION_BROWSER_GEMMA4_GGUF.runtimeArtifact.sha256,
        runtimeMetadataArchitecture: 'gemma4',
        runtimeMetadataType: 'model',
        downloadedBytes: SCION_BROWSER_GEMMA4_GGUF.runtimeArtifact.bytes,
        reportedTotalBytes: SCION_BROWSER_GEMMA4_GGUF.runtimeArtifact.bytes,
        durationMs: 60000,
      },
      warmBaseLoad: { completed: true, durationMs: 5000 },
      baseCompletion: {
        completed: true,
        validOutput: true,
        outputSha256: '1'.repeat(64),
        firstTokenMs: 500,
        totalMs: 2000,
      },
      adapterIntegrity: { digestMatched: true, manifestVerified: true, adapterSha256: HASH },
      adapterActivation: {
        completed: true,
        nativeAdapterActive: true,
        nativeMetadataMatched: true,
        nativeMetadata: { generalType: 'adapter', adapterType: 'lora', architecture: 'gemma4' },
        outputChangedAtManifestScale: true,
        durationMs: 1500,
      },
      adapterCompletion: {
        completed: true,
        validOutput: true,
        outputSha256: '2'.repeat(64),
        firstTokenMs: 550,
        totalMs: 2100,
      },
      rollback: {
        completed: true,
        nativeAdapterInactive: true,
        exactBaseOutputRestored: true,
        projectDataUnchanged: true,
        outputSha256: '1'.repeat(64),
        projectDataBeforeSha256: '3'.repeat(64),
        projectDataAfterSha256: '3'.repeat(64),
      },
      recovery: {
        interruptedDownload: {
          completed: true,
          baseUsableAfterRecovery: true,
          method: 'network-abort-resume',
        },
        storagePressure: {
          completed: true,
          baseUsableAfterRecovery: true,
          method: 'cache-eviction-redownload',
        },
        deviceLoss: {
          completed: true,
          baseUsableAfterRecovery: true,
          method: 'webgpu-device-destroy-reload',
        },
      },
      repeatCompletion: { attempts: 3, completed: 3, validOutputs: 3 },
    },
    artifacts: await artifactReceipts(root, runId, protocol.requiredArtifactTypes),
  };
  run.runDigestSha256 = computeScionBrowserDeviceRunDigest(run);
  return run;
}

async function matrixFixture(root, manifest, protocol, protocolSha256) {
  return {
    schemaVersion: 1,
    evidenceType: 'scion-browser-device-matrix',
    protocolVersion: protocol.protocolVersion,
    protocolSha256,
    adapterIdentityAlgorithm: SCION_ADAPTER_PACKAGE_IDENTITY_ALGORITHM,
    adapterIdentitySha256: computeScionAdapterPackageIdentity(manifest).sha256,
    adapterId: manifest.adapter.id,
    adapterScale: manifest.adapter.scale,
    trainingBaseRevision: manifest.base.revision,
    browserBaseRevision: SCION_BROWSER_GEMMA4_GGUF.runtimeArtifact.revision,
    runtimeId: SCION_BROWSER_WLLAMA_RUNTIME_ID,
    generatedAt: '2026-07-13T19:00:00.000Z',
    runs: await Promise.all(
      protocol.requiredDeviceProfiles.map((profile) => validRun({ root, profile, manifest, protocol })),
    ),
  };
}

describe('Scion browser device matrix', () => {
  let root;
  let protocol;
  let protocolSha256;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-device-matrix-'));
    protocol = JSON.parse(await fs.readFile(PROTOCOL_PATH, 'utf8'));
    protocolSha256 = await digestFile(PROTOCOL_PATH);
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('passes only a four-profile Chrome/Edge matrix with exact activation, recovery, memory, and artifacts', async () => {
    const manifest = browserManifest();
    const evidencePath = path.join(root, 'matrix.json');
    const evidence = await matrixFixture(root, manifest, protocol, protocolSha256);
    await fs.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
    await expect(
      auditScionBrowserDeviceMatrix({
        protocol,
        protocolSha256,
        evidence,
        evidencePath,
        adapterManifest: manifest,
      }),
    ).resolves.toMatchObject({
      status: 'pass',
      promotionEligible: true,
      runCount: 4,
      passingRunCount: 4,
      passingDeviceProfiles: ['apple-silicon-16gb', 'discrete-8gb', 'integrated-16gb', 'integrated-8gb'],
      issues: [],
    });
  });

  it('blocks a correctly rehashed run when storage recovery is missing', async () => {
    const manifest = browserManifest();
    const evidencePath = path.join(root, 'matrix.json');
    const evidence = await matrixFixture(root, manifest, protocol, protocolSha256);
    const run = evidence.runs.find((entry) => entry.deviceProfile === 'integrated-8gb');
    run.checks.recovery.storagePressure.completed = false;
    run.runDigestSha256 = computeScionBrowserDeviceRunDigest(run);
    const report = await auditScionBrowserDeviceMatrix({
      protocol,
      protocolSha256,
      evidence,
      evidencePath,
      adapterManifest: manifest,
    });
    expect(report).toMatchObject({ status: 'blocked', promotionEligible: false });
    expect(report.issues).toContain('run:device-integrated-8gb:storage-pressure-recovery');
    expect(report.issues).toContain('missing-device-profile:integrated-8gb');
  });

  it('blocks artifact mutation even when every claimed browser check stays true', async () => {
    const manifest = browserManifest();
    const evidencePath = path.join(root, 'matrix.json');
    const evidence = await matrixFixture(root, manifest, protocol, protocolSha256);
    const artifact = evidence.runs[0].artifacts[0];
    await fs.appendFile(path.join(root, artifact.path), 'tampered');
    const report = await auditScionBrowserDeviceMatrix({
      protocol,
      protocolSha256,
      evidence,
      evidencePath,
      adapterManifest: manifest,
    });
    expect(report.status).toBe('blocked');
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('artifact-bytes-mismatch'),
        expect.stringContaining('artifact-sha256-mismatch'),
      ]),
    );
  });

  it('derives adapter effect and rollback from output digests instead of trusting pass booleans', async () => {
    const manifest = browserManifest();
    const evidencePath = path.join(root, 'matrix.json');
    const evidence = await matrixFixture(root, manifest, protocol, protocolSha256);
    const run = evidence.runs.find((entry) => entry.deviceProfile === 'apple-silicon-16gb');
    run.checks.adapterCompletion.outputSha256 = run.checks.baseCompletion.outputSha256;
    run.checks.rollback.outputSha256 = '4'.repeat(64);
    run.runDigestSha256 = computeScionBrowserDeviceRunDigest(run);
    const report = await auditScionBrowserDeviceMatrix({
      protocol,
      protocolSha256,
      evidence,
      evidencePath,
      adapterManifest: manifest,
    });
    expect(report.status).toBe('blocked');
    expect(report.issues).toEqual(
      expect.arrayContaining([
        'run:device-apple-silicon-16gb:adapter-output-unchanged',
        'run:device-apple-silicon-16gb:rollback',
      ]),
    );
  });

  it('makes promotion reject a hash-correct but semantically incomplete device file', async () => {
    const manifest = browserManifest();
    const evidencePath = path.join(root, 'matrix.json');
    const evidence = await matrixFixture(root, manifest, protocol, protocolSha256);
    evidence.runs = evidence.runs.slice(0, 1);
    await fs.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
    const evidenceFiles = {};
    for (const type of ['factual-canaries', 'single-model-judge', 'production-canaries']) {
      const filePath = path.join(root, `${type}.json`);
      await fs.writeFile(filePath, `${JSON.stringify({ type, status: 'pass' })}\n`);
      evidenceFiles[type] = filePath;
    }
    manifest.promotion.evidence = [
      ...Object.entries(evidenceFiles).map(([type, filePath]) => ({
        type,
        status: 'pass',
        path: filePath,
        sha256: null,
      })),
      {
        type: 'browser-device-matrix',
        status: 'pass',
        path: evidencePath,
        sha256: await digestFile(evidencePath),
      },
    ];
    for (const entry of manifest.promotion.evidence) {
      if (!entry.sha256) entry.sha256 = await digestFile(entry.path);
    }
    const verification = await verifyExternalEvidenceFiles(manifest);
    expect(verification['single-model-judge']).toMatchObject({
      verified: false,
      reason: 'semantic-audit-failed',
      semanticAudit: { status: 'blocked', promotionEligible: false },
    });
    expect(verification['browser-device-matrix']).toMatchObject({
      verified: false,
      reason: 'semantic-audit-failed',
      expectedSha256: await digestFile(evidencePath),
      actualSha256: await digestFile(evidencePath),
      semanticAudit: { status: 'blocked', promotionEligible: false },
    });
    expect(verification['browser-device-matrix'].semanticAudit.issues).toEqual(
      expect.arrayContaining([
        'missing-device-profile:integrated-16gb',
        'missing-device-profile:discrete-8gb',
        'missing-device-profile:apple-silicon-16gb',
      ]),
    );
  });
});
