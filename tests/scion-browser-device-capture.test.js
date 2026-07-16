import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import JSZip from 'jszip';

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
  auditScionDeviceTraceArchivePrivacy,
  artifactReceipt,
  buildAppleSiliconDeviceRun,
  buildPartialDeviceEvidence,
  buildScionAppleDeviceRunId,
  chromeVersionFromUserAgent,
  sanitizeAppleHardwareProbe,
  sanitizeScionDeviceTraceArchive,
  scionReleaseIdentityFromManifest,
} from '../scripts/lib/scionBrowserDeviceCapture.mjs';
import { auditScionBrowserDeviceMatrix } from '../scripts/lib/scionBrowserDeviceMatrix.mjs';

const HASH = 'a'.repeat(64);
const BASE_OUTPUT = '1'.repeat(64);
const ADAPTER_OUTPUT = '2'.repeat(64);
const PROJECT_DIGEST = '3'.repeat(64);
const PROTOCOL_PATH = 'evaluation/scion-adapters/browser-device-matrix-protocol-v1.json';

function browserManifest() {
  return {
    schemaVersion: SCION_ADAPTER_MANIFEST_SCHEMA_VERSION,
    adapter: { id: 'scion-device-smoke', scionVersion: '0.16.25', format: 'gguf-lora', scale: 16 },
    base: { ...SCION_GEMMA4_E2B_BASE, exactRevisionRequired: true },
    training: {
      method: 'orpo-lora',
      datasetManifestSha256: HASH,
      datasetStatus: 'smoke-only',
      primaryPreferenceEvidence: 'structural-smoke-only',
      pairCount: 101,
      domainCount: 5,
      groupCount: 0,
      modelJudgePairCount: 0,
      modelJudgeDomainCount: 0,
      domainGroupCounts: {},
      modelJudgeDomainCounts: {},
      splitCounts: { train: 101, valid: 0, test: 0 },
      splitDomainCounts: { train: 5, valid: 0, test: 0 },
    },
    files: [
      { path: 'scion-device-smoke.gguf', bytes: 2048, sha256: HASH },
      { path: 'conversion-receipt.json', bytes: 1024, sha256: HASH },
    ],
    runtime: { supported: [SCION_BROWSER_WLLAMA_RUNTIME_ID] },
    conversion: {
      pipeline: SCION_BROWSER_ADAPTER_CONVERSION_PIPELINE,
      sourceAdapterId: 'scion-device-smoke-source',
      sourceManifestSha256: HASH,
      receiptPath: 'conversion-receipt.json',
      converter: {
        id: 'ggml-org/llama.cpp/convert_lora_to_gguf.py',
        revision: SCION_LLAMA_CPP_REVISION,
        sha256: SCION_LLAMA_CPP_LORA_CONVERTER_SHA256,
        outputType: 'f16',
      },
    },
    promotion: { status: 'smoke', promotable: false, evidence: [] },
  };
}

function completion(outputSha256) {
  return {
    completed: true,
    validOutput: true,
    outputSha256,
    firstTokenMs: 500,
    totalMs: 1500,
  };
}

function captureFixture() {
  return {
    browserProbe: { webgpu: true, jspi: true },
    interruptedDownload: { aborted: true, observedBytes: 8 * 1024 * 1024 },
    coldBaseLoad: {
      completed: true,
      webgpuActive: true,
      durationMs: 60000,
      runtimeMetadataArchitecture: 'gemma4',
      runtimeMetadataType: 'model',
    },
    warmBaseLoad: { completed: true, webgpuActive: true, durationMs: 5000 },
    baseCompletion: completion(BASE_OUTPUT),
    adapterInstall: { verification: { valid: true } },
    adapterActivation: {
      status: 'adapter-active',
      durationMs: 2000,
      proof: {
        pass: true,
        native: {
          active: true,
          metadata: {
            'general.type': 'adapter',
            'adapter.type': 'lora',
            'general.architecture': 'gemma4',
          },
        },
      },
    },
    adapterCompletion: completion(ADAPTER_OUTPUT),
    adapterDeactivation: { rollback: { native: { active: false } } },
    rollbackCompletion: completion(BASE_OUTPUT),
    storageRecovery: { completed: true, baseUsableAfterRecovery: true },
    deviceLossRecovery: { completed: true, baseUsableAfterRecovery: true, observedCompletionFailure: true },
    repeatCompletions: [completion(BASE_OUTPUT), completion(BASE_OUTPUT), completion(BASE_OUTPUT)],
    projectDataBeforeSha256: PROJECT_DIGEST,
    projectDataAfterSha256: PROJECT_DIGEST,
  };
}

describe('Scion real browser device capture', () => {
  let root;
  let protocol;
  let protocolSha256;
  let artifacts;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-device-capture-'));
    protocol = JSON.parse(await fs.readFile(PROTOCOL_PATH, 'utf8'));
    protocolSha256 = crypto
      .createHash('sha256')
      .update(await fs.readFile(PROTOCOL_PATH))
      .digest('hex');
    artifacts = [];
    for (const type of ['browser-trace', 'console-log', 'hardware-probe', 'runtime-snapshot']) {
      const filePath = path.join(root, 'artifacts', `${type}.json`);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, JSON.stringify({ type, synthetic: true }));
      artifacts.push(await artifactReceipt({ evidenceDir: root, type, filePath }));
    }
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('sanitizes the Apple hardware receipt and parses a four-part Chrome version', () => {
    const probe = sanitizeAppleHardwareProbe({
      hardware: { chip: 'Apple M4 Max', systemMemoryGiB: 48, cpuCoreCount: 16, gpuCoreCount: 40, serial: 'secret' },
      os: { family: 'macOS', version: '26.0', architecture: 'arm64', uuid: 'secret' },
      browserProbe: {
        userAgent: 'Mozilla/5.0 Chrome/140.0.7339.1 Safari/537.36',
        hardwareConcurrency: 16,
        gpu: { vendor: 'apple', architecture: 'metal', device: '', description: '' },
      },
    });
    expect(chromeVersionFromUserAgent(probe.browser.userAgent)).toBe('140.0.7339.1');
    expect(probe).toMatchObject({
      profile: 'apple-silicon-16gb',
      hardware: { systemMemoryGiB: 48, gpuClass: 'apple-silicon', gpuModel: 'Apple M4 Max' },
    });
    expect(JSON.stringify(probe)).not.toContain('secret');
  });

  it('derives release and run identities from the exact adapter manifest version', () => {
    const manifest = browserManifest();
    manifest.adapter.scionVersion = '0.16.39';
    expect(scionReleaseIdentityFromManifest(manifest)).toEqual({
      version: '0.16.39',
      release: 'v0.16.39',
      runSlug: 'v01639',
    });
    expect(buildScionAppleDeviceRunId({ manifest, observedAt: '2026-07-16T07:30:45.000Z' })).toBe(
      'apple-silicon-v01639-20260716073045',
    );
    manifest.adapter.scionVersion = 'not-a-version';
    expect(() => scionReleaseIdentityFromManifest(manifest)).toThrow('Scion version is invalid');
  });

  it('scrubs local workspace, profile, and home paths from Playwright trace text', async () => {
    const tracePath = path.join(root, 'trace.zip');
    const workspaceRoot = '/Users/example/Documents/CourseMapper';
    const profileDir = '/Users/example/.cache/scion-device-profile';
    const zip = new JSZip();
    zip.file('trace.trace', `${workspaceRoot}/node_modules/test.js\nuserDataDir=${profileDir}`);
    zip.file(
      'trace.network',
      JSON.stringify({
        type: 'resource-snapshot',
        snapshot: {
          request: { url: 'file:///Users/example/Downloads/source.pdf', cookies: [], headers: [] },
          response: { cookies: [], headers: [] },
        },
      }),
    );
    zip.file('resources/binary.dat', Buffer.from([0, 1, 2, 3]));
    await fs.writeFile(tracePath, await zip.generateAsync({ type: 'nodebuffer' }));

    expect(await auditScionDeviceTraceArchivePrivacy({ tracePath })).toEqual({
      issues: expect.arrayContaining(['trace.network:local-absolute-path', 'trace.trace:local-absolute-path']),
    });

    const result = await sanitizeScionDeviceTraceArchive({
      tracePath,
      workspaceRoot,
      profileDir,
      homeDir: '/Users/example',
    });
    const sanitized = await JSZip.loadAsync(await fs.readFile(tracePath));
    const text = [
      await sanitized.file('trace.trace').async('string'),
      await sanitized.file('trace.network').async('string'),
    ].join('\n');

    expect(result.replacementCount).toBe(3);
    expect(text).toContain('<workspace>');
    expect(text).toContain('<isolated-chrome-profile>');
    expect(text).toContain('<home>/Downloads/source.pdf');
    expect(text).not.toContain('/Users/example');
    expect(await sanitized.file('resources/binary.dat').async('nodebuffer')).toEqual(Buffer.from([0, 1, 2, 3]));
    expect(await auditScionDeviceTraceArchivePrivacy({ tracePath })).toEqual({ issues: [] });
  });

  it('builds one hash-bound passing Apple run while honestly leaving the other profiles blocked', async () => {
    const manifest = browserManifest();
    const hardwareProbe = sanitizeAppleHardwareProbe({
      hardware: { chip: 'Apple M4 Max', systemMemoryGiB: 48, cpuCoreCount: 16, gpuCoreCount: 40 },
      os: { family: 'macOS', version: '26.0', architecture: 'arm64' },
      browserProbe: {
        userAgent: 'Mozilla/5.0 Chrome/140.0.7339.1 Safari/537.36',
        hardwareConcurrency: 16,
        gpu: {},
      },
    });
    const run = buildAppleSiliconDeviceRun({
      runId: 'apple-silicon-v01625-test',
      observedAt: '2026-07-14T20:00:00.000Z',
      manifest,
      hardwareProbe,
      capture: captureFixture(),
      artifacts,
      peakBrowserWorkingSetMiB: 7000,
      baseSha256: SCION_BROWSER_GEMMA4_GGUF.runtimeArtifact.sha256,
    });
    const evidence = buildPartialDeviceEvidence({
      protocolSha256,
      manifest,
      generatedAt: '2026-07-14T21:00:00.000Z',
      runs: [run],
    });
    const evidencePath = path.join(root, 'device-matrix.json');
    await fs.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
    const audit = await auditScionBrowserDeviceMatrix({
      protocol,
      protocolSha256,
      evidence,
      evidencePath,
      adapterManifest: manifest,
    });
    expect(audit).toMatchObject({
      status: 'blocked',
      promotionEligible: false,
      runCount: 1,
      passingRunCount: 1,
      passingDeviceProfiles: ['apple-silicon-16gb'],
      issues: expect.arrayContaining([
        'missing-device-profile:integrated-8gb',
        'missing-device-profile:integrated-16gb',
        'missing-device-profile:discrete-8gb',
      ]),
    });
  });

  it('rejects a receipt that cannot restore the exact base output', () => {
    const capture = captureFixture();
    capture.rollbackCompletion.outputSha256 = ADAPTER_OUTPUT;
    expect(() =>
      buildAppleSiliconDeviceRun({
        runId: 'apple-silicon-v01625-bad-rollback',
        observedAt: '2026-07-14T20:00:00.000Z',
        manifest: browserManifest(),
        hardwareProbe: sanitizeAppleHardwareProbe({
          hardware: { chip: 'Apple M4 Max', systemMemoryGiB: 48 },
          os: { family: 'macOS', version: '26.0', architecture: 'arm64' },
          browserProbe: { userAgent: 'Chrome/140.0.7339.1', gpu: {} },
        }),
        capture,
        artifacts,
        peakBrowserWorkingSetMiB: 7000,
        baseSha256: SCION_BROWSER_GEMMA4_GGUF.runtimeArtifact.sha256,
      }),
    ).toThrow('Rollback did not restore exact base output');
  });
});
