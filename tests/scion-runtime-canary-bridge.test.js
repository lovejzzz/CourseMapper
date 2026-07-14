import { afterEach, describe, expect, it, vi } from 'vitest';

import { installScionRuntimeCanaryBridge, isScionRuntimeCanaryLocation } from '../src/lib/scionRuntimeCanaryBridge.js';
import { armScionRuntimeCanary } from '../src/lib/scionRuntimeCanaryGate.js';
import {
  activateInstalledScionAdapter,
  createScionAdapterMemoryStore,
  deactivateInstalledScionAdapter,
  installScionBrowserAdapter,
  sha256Hex,
  verifyInstalledScionAdapter,
} from '../src/lib/scionAdapterRegistry.js';
import {
  SCION_ADAPTER_MANIFEST_SCHEMA_VERSION,
  SCION_BROWSER_ADAPTER_CONVERSION_PIPELINE,
  SCION_GEMMA4_E2B_BASE,
  SCION_LLAMA_CPP_LORA_CONVERTER_SHA256,
  SCION_LLAMA_CPP_REVISION,
} from '../src/lib/scionAdapterManifest.js';

const encoder = new TextEncoder();

afterEach(() => {
  vi.unstubAllGlobals();
});

function location(href) {
  const url = new URL(href);
  return { href: url.href, hostname: url.hostname };
}

function canaryRuntime({ installError, verificationValid = true } = {}) {
  const adapterBytes = new TextEncoder().encode('bounded canary adapter');
  const manifest = {
    adapter: { id: 'scion-smoke', format: 'gguf-lora' },
    base: { modelId: 'google/gemma-4-E2B-it-qat-q4_0-unquantized', revision: 'd'.repeat(40) },
    files: [{ path: 'scion-smoke.gguf', bytes: adapterBytes.byteLength, sha256: 'a'.repeat(64) }],
    promotion: { status: 'smoke', promotable: false },
  };
  const record = {
    adapterId: 'scion-smoke',
    manifest,
    manifestSha256: 'b'.repeat(64),
    totalBytes: adapterBytes.byteLength,
    files: [{ path: 'scion-smoke.gguf', storageKey: `${'b'.repeat(64)}:scion-smoke.gguf` }],
  };
  const store = { getFile: vi.fn(async () => adapterBytes.buffer) };
  return {
    store,
    record,
    runtime: {
      createScionAdapterMemoryStore: vi.fn(() => store),
      installScionBrowserAdapter: installError
        ? vi.fn(async () => {
            throw installError;
          })
        : vi.fn(async () => record),
      verifyInstalledScionAdapter: vi.fn(async () => ({
        valid: verificationValid,
        issues: verificationValid ? [] : ['cached-file-sha256:scion-smoke.gguf'],
        record,
      })),
      loadScionBrowserWllama: vi.fn(async () => ({ status: 'ready' })),
      completeScionBrowserWllama: vi.fn(),
      applyScionBrowserWllamaAdapter: vi.fn(async () => ({ adapterActive: true, adapterId: 'scion-smoke' })),
      probeScionBrowserWllamaAdapter: vi.fn(async () => ({ pass: true, proofSha256: 'c'.repeat(64) })),
      rollbackScionBrowserWllamaAdapter: vi.fn(async () => ({ restored: true })),
      activateInstalledScionAdapter: vi.fn(async () => ({
        status: 'adapter-active',
        adapterActive: true,
        proof: { pass: true, proofSha256: 'c'.repeat(64) },
      })),
      deactivateInstalledScionAdapter: vi.fn(async () => ({
        status: 'base-only',
        adapterActive: false,
        rollback: { restored: true },
      })),
      unloadScionBrowserWllama: vi.fn(),
      getScionBrowserWllamaStatus: vi.fn(() => ({ phase: 'ready', adapter: { mode: 'base-only' } })),
    },
  };
}

function streamingResponse(bytes, arrayBufferFallbacks) {
  const value = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return {
    ok: true,
    status: 200,
    headers: { get: (name) => (String(name).toLowerCase() === 'content-length' ? String(value.byteLength) : null) },
    body: {
      getReader() {
        let sent = false;
        return {
          async read() {
            if (sent) return { done: true, value: undefined };
            sent = true;
            return { done: false, value };
          },
          async cancel() {},
          releaseLock() {},
        };
      },
    },
    async arrayBuffer() {
      arrayBufferFallbacks.push(value.byteLength);
      throw new Error('unchecked arrayBuffer fallback used');
    },
  };
}

async function realRegistryCanaryFixture() {
  const adapterBytes = encoder.encode('real registry gguf smoke bytes');
  const receiptBytes = encoder.encode('{"conversion":"receipt"}\n');
  const manifest = {
    schemaVersion: SCION_ADAPTER_MANIFEST_SCHEMA_VERSION,
    adapter: { id: 'scion-real-registry-smoke', scionVersion: '0.16.24', format: 'gguf-lora', scale: 16 },
    base: { ...SCION_GEMMA4_E2B_BASE, exactRevisionRequired: true },
    training: { method: 'orpo-lora-smoke', datasetManifestSha256: 'd'.repeat(64) },
    files: [
      { path: 'scion-smoke.gguf', bytes: adapterBytes.byteLength, sha256: await sha256Hex(adapterBytes) },
      { path: 'conversion-receipt.json', bytes: receiptBytes.byteLength, sha256: await sha256Hex(receiptBytes) },
    ],
    runtime: { supported: ['scion-wllama-webgpu-jspi-v1'] },
    conversion: {
      pipeline: SCION_BROWSER_ADAPTER_CONVERSION_PIPELINE,
      sourceAdapterId: 'scion-real-registry-source',
      sourceManifestSha256: 'e'.repeat(64),
      receiptPath: 'conversion-receipt.json',
      converter: {
        id: 'ggml-org/llama.cpp/convert_lora_to_gguf.py',
        revision: SCION_LLAMA_CPP_REVISION,
        sha256: SCION_LLAMA_CPP_LORA_CONVERTER_SHA256,
        outputType: 'f16',
      },
    },
    promotion: { status: 'smoke', promotable: false },
  };
  const manifestBytes = encoder.encode(`${JSON.stringify(manifest, null, 2)}\n`);
  return {
    adapterBytes,
    receiptBytes,
    manifest,
    manifestBytes,
    manifestSha256: await sha256Hex(manifestBytes),
  };
}

describe('Scion runtime canary bridge', () => {
  it('does not load the heavy bridge on a production origin', () => {
    const loadBridge = vi.fn();
    expect(
      armScionRuntimeCanary({
        locationLike: location('https://edutool.dev/?scion-runtime-canary=1'),
        globalLike: {},
        loadBridge,
      }),
    ).toBeNull();
    expect(loadBridge).not.toHaveBeenCalled();
  });

  it('can be enabled only on an explicit localhost canary URL', () => {
    expect(isScionRuntimeCanaryLocation(location('http://127.0.0.1:4179/?scion-runtime-canary=1'))).toBe(true);
    expect(isScionRuntimeCanaryLocation(location('http://localhost:4179/?scion-runtime-canary=1'))).toBe(true);
    expect(isScionRuntimeCanaryLocation(location('http://127.0.0.1:4179/'))).toBe(false);
    expect(isScionRuntimeCanaryLocation(location('https://edutool.dev/?scion-runtime-canary=1'))).toBe(false);
  });

  it('exposes only the bounded runtime proof API', async () => {
    const globalLike = {};
    const loadRuntime = vi.fn(async () => ({
      loadScionBrowserWllama: vi.fn(),
      completeScionBrowserWllama: vi.fn(),
      applyScionBrowserWllamaAdapter: vi.fn(),
      probeScionBrowserWllamaAdapter: vi.fn(),
      rollbackScionBrowserWllamaAdapter: vi.fn(),
      unloadScionBrowserWllama: vi.fn(),
      getScionBrowserWllamaStatus: vi.fn(),
      validateScionAdapterManifest: vi.fn(),
      sha256Hex: vi.fn(),
      internalSecret: 'not exposed',
    }));
    const ready = installScionRuntimeCanaryBridge({
      locationLike: location('http://127.0.0.1:4179/?scion-runtime-canary=1'),
      globalLike,
      loadRuntime,
    });
    const api = await ready;
    expect(api).toBe(globalLike.__scionRuntimeCanary);
    expect(Object.keys(globalLike.__scionRuntimeCanary).sort()).toEqual(
      [
        'applyAdapter',
        'complete',
        'load',
        'probeAdapter',
        'rollbackAdapter',
        'runAdapterCanary',
        'status',
        'unload',
      ].sort(),
    );
    expect(globalLike.__scionRuntimeCanary.internalSecret).toBeUndefined();
  });

  it('routes the real adapter canary through the bounded verified registry', async () => {
    const globalLike = {};
    const fixture = canaryRuntime();
    const api = await installScionRuntimeCanaryBridge({
      locationLike: location('http://127.0.0.1:4179/?scion-runtime-canary=1'),
      globalLike,
      loadRuntime: async () => fixture.runtime,
    });

    const result = await api.runAdapterCanary({
      manifestUrl: 'https://models.edutool.dev/scion/manifest.json',
      expectedManifestSha256: 'b'.repeat(64),
      baseRevision: 'd'.repeat(40),
    });

    expect(fixture.runtime.installScionBrowserAdapter).toHaveBeenCalledWith({
      manifestUrl: 'https://models.edutool.dev/scion/manifest.json',
      expectedManifestSha256: 'b'.repeat(64),
      store: fixture.store,
      requirePromoted: false,
    });
    expect(fixture.runtime.verifyInstalledScionAdapter).toHaveBeenCalledWith({
      adapterId: 'scion-smoke',
      store: fixture.store,
      requirePromoted: false,
    });
    expect(fixture.runtime.activateInstalledScionAdapter).toHaveBeenCalledWith(
      expect.objectContaining({
        adapterId: 'scion-smoke',
        runtimeId: 'scion-wllama-webgpu-jspi-v1',
        baseModelId: 'google/gemma-4-E2B-it-qat-q4_0-unquantized',
        baseRevision: 'd'.repeat(40),
        store: fixture.store,
        applyAdapter: fixture.runtime.applyScionBrowserWllamaAdapter,
        probeAdapter: fixture.runtime.probeScionBrowserWllamaAdapter,
        rollbackAdapter: fixture.runtime.rollbackScionBrowserWllamaAdapter,
        requirePromoted: false,
      }),
    );
    expect(fixture.runtime.deactivateInstalledScionAdapter).toHaveBeenCalledWith({
      store: fixture.store,
      rollbackAdapter: fixture.runtime.rollbackScionBrowserWllamaAdapter,
    });
    expect(result).toMatchObject({
      status: 'pass-mechanical-only',
      promotionEligible: false,
      delivery: {
        mode: 'bounded-registry',
        streamed: true,
        registryVerified: true,
        atomicInstall: true,
        totalBytes: fixture.record.totalBytes,
        fileCount: 1,
      },
    });
  });

  it('runs the complete canary through the real streaming registry and lifecycle coordinator', async () => {
    const currentFixture = await realRegistryCanaryFixture();
    const manifestUrl = 'https://models.edutool.dev/scion/manifest.json';
    const arrayBufferFallbacks = [];
    const fetchImpl = vi.fn(async (url) => {
      if (url === manifestUrl) return streamingResponse(currentFixture.manifestBytes, arrayBufferFallbacks);
      if (url === new URL('scion-smoke.gguf', manifestUrl).href) {
        return streamingResponse(currentFixture.adapterBytes, arrayBufferFallbacks);
      }
      if (url === new URL('conversion-receipt.json', manifestUrl).href) {
        return streamingResponse(currentFixture.receiptBytes, arrayBufferFallbacks);
      }
      return { ok: false, status: 404 };
    });
    vi.stubGlobal('fetch', fetchImpl);
    const applyAdapter = vi.fn(async ({ adapterId }) => ({ adapterActive: true, adapterId }));
    const probeAdapter = vi.fn(async ({ adapterId, manifestSha256, baseRevision }) => ({
      pass: true,
      adapterActive: true,
      adapterId,
      manifestSha256,
      baseRevision,
      proofSha256: 'f'.repeat(64),
    }));
    const rollbackAdapter = vi.fn(async () => ({ restored: true, baseOutput: 'exact base output' }));
    const runtime = {
      createScionAdapterMemoryStore,
      installScionBrowserAdapter,
      verifyInstalledScionAdapter,
      activateInstalledScionAdapter,
      deactivateInstalledScionAdapter,
      loadScionBrowserWllama: vi.fn(async () => ({ status: 'ready' })),
      completeScionBrowserWllama: vi.fn(),
      applyScionBrowserWllamaAdapter: applyAdapter,
      probeScionBrowserWllamaAdapter: probeAdapter,
      rollbackScionBrowserWllamaAdapter: rollbackAdapter,
      unloadScionBrowserWllama: vi.fn(),
      getScionBrowserWllamaStatus: vi.fn(() => ({ phase: 'ready', adapter: { mode: 'base-only' } })),
    };
    const api = await installScionRuntimeCanaryBridge({
      locationLike: location('http://127.0.0.1:4179/?scion-runtime-canary=1'),
      globalLike: {},
      loadRuntime: async () => runtime,
    });

    const result = await api.runAdapterCanary({
      manifestUrl,
      expectedManifestSha256: currentFixture.manifestSha256,
      baseRevision: SCION_GEMMA4_E2B_BASE.revision,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(arrayBufferFallbacks).toEqual([]);
    expect(applyAdapter).toHaveBeenCalledOnce();
    expect(probeAdapter).toHaveBeenCalledOnce();
    expect(rollbackAdapter).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      status: 'pass-mechanical-only',
      promotionEligible: false,
      manifestSha256: currentFixture.manifestSha256,
      delivery: {
        mode: 'bounded-registry',
        streamed: true,
        registryVerified: true,
        atomicInstall: true,
        totalBytes: currentFixture.adapterBytes.byteLength + currentFixture.receiptBytes.byteLength,
        fileCount: 2,
      },
      activation: { status: 'adapter-active', adapterActive: true, proof: { pass: true } },
      rollback: { restored: true, baseOutput: 'exact base output' },
    });
  });

  it('never loads the model when bounded registry installation fails', async () => {
    const globalLike = {};
    const failure = Object.assign(new Error('stream overrun'), { code: 'SCION_ADAPTER_STREAM_OVERRUN' });
    const fixture = canaryRuntime({ installError: failure });
    const api = await installScionRuntimeCanaryBridge({
      locationLike: location('http://localhost:4179/?scion-runtime-canary=1'),
      globalLike,
      loadRuntime: async () => fixture.runtime,
    });

    await expect(
      api.runAdapterCanary({
        manifestUrl: 'https://models.edutool.dev/scion/manifest.json',
        expectedManifestSha256: 'b'.repeat(64),
        baseRevision: 'd'.repeat(40),
      }),
    ).rejects.toMatchObject({ code: 'SCION_ADAPTER_STREAM_OVERRUN' });
    expect(fixture.runtime.verifyInstalledScionAdapter).not.toHaveBeenCalled();
    expect(fixture.runtime.loadScionBrowserWllama).not.toHaveBeenCalled();
    expect(fixture.runtime.activateInstalledScionAdapter).not.toHaveBeenCalled();
  });
});
