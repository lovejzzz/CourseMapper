import { describe, expect, it, vi } from 'vitest';

import {
  SCION_ADAPTER_MANIFEST_MAX_BYTES,
  activateInstalledScionAdapter,
  createScionAdapterMemoryStore,
  deactivateInstalledScionAdapter,
  installScionBrowserAdapter,
  sha256Hex,
  verifyInstalledScionAdapter,
} from '../src/lib/scionAdapterRegistry.js';
import { SCION_ADAPTER_MANIFEST_SCHEMA_VERSION, SCION_GEMMA4_E2B_BASE } from '../src/lib/scionAdapterManifest.js';

const encoder = new TextEncoder();
const MANIFEST_URL = 'https://models.edutool.dev/scion/scion-g4e2b-v1/manifest.json';
const TRAINING_DOMAINS = ['computer-science', 'geology', 'music-theory', 'user-experience-design', 'world-history'];

function binaryResponse(
  bytes,
  { status = 200, chunks, contentLength, includeBody = true, onGetReader, onRead, onCancel, onArrayBuffer } = {},
) {
  const value = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const streamChunks = (chunks || [value]).map((chunk) =>
    chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk),
  );
  const declaredLength = contentLength === undefined ? value.byteLength : contentLength;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name) =>
        String(name).toLowerCase() === 'content-length' && declaredLength != null ? String(declaredLength) : null,
    },
    ...(includeBody
      ? {
          body: {
            getReader() {
              onGetReader?.();
              let index = 0;
              return {
                async read() {
                  onRead?.(index);
                  if (index >= streamChunks.length) return { done: true, value: undefined };
                  return { done: false, value: streamChunks[index++] };
                },
                async cancel() {
                  onCancel?.();
                  index = streamChunks.length;
                },
                releaseLock() {},
              };
            },
          },
        }
      : {}),
    arrayBuffer: async () => {
      onArrayBuffer?.();
      return value.slice().buffer;
    },
  };
}

async function fixture(adapterId = 'scion-g4e2b-v1') {
  const adapterBytes = encoder.encode(`adapter-weights:${adapterId}`);
  const adapterSha256 = await sha256Hex(adapterBytes);
  const trainingPlanBytes = encoder.encode(`{"adapterId":"${adapterId}","kind":"training-plan"}\n`);
  const trainingResultBytes = encoder.encode(`{"adapterId":"${adapterId}","kind":"training-result"}\n`);
  const trainingPlanSha256 = await sha256Hex(trainingPlanBytes);
  const trainingResultSha256 = await sha256Hex(trainingResultBytes);
  const manifest = {
    schemaVersion: SCION_ADAPTER_MANIFEST_SCHEMA_VERSION,
    adapter: { id: adapterId, scionVersion: '0.16.7', format: 'mlx-lora-safetensors' },
    base: { ...SCION_GEMMA4_E2B_BASE, exactRevisionRequired: true },
    training: {
      method: 'orpo-lora',
      datasetManifestSha256: 'd'.repeat(64),
      datasetIdentitySha256: 'c'.repeat(64),
      datasetStatus: 'ready',
      primaryPreferenceEvidence: 'single-model-judge',
      pairCount: 3200,
      domainCount: 5,
      groupCount: 15,
      modelJudgePairCount: 100,
      modelJudgeDomainCount: 5,
      domainGroupCounts: Object.fromEntries(TRAINING_DOMAINS.map((domain) => [domain, 3])),
      modelJudgeDomainCounts: Object.fromEntries(TRAINING_DOMAINS.map((domain) => [domain, 20])),
      splitCounts: { train: 1200, valid: 1000, test: 1000 },
      splitDomainCounts: { train: 5, valid: 5, test: 5 },
      taskScope: {
        protocol: 'scion-adapter-task-scope-v1',
        mode: 'allowlist',
        families: [{ id: 'lesson-kernel', rows: 3200 }],
        unclassifiedPolicy: 'base-only',
        compositePolicy: 'exact-family-only',
        identity: { algorithm: 'sha256-canonical-scion-adapter-task-scope-v1', sha256: '6'.repeat(64) },
      },
      run: {
        protocol: 'scion-adapter-training-run-v1',
        lane: 'production',
        seed: 16031,
        planPath: 'training-plan.json',
        planSha256: trainingPlanSha256,
        planIdentitySha256: '1'.repeat(64),
        resultPath: 'training-result.json',
        resultSha256: trainingResultSha256,
        resultIdentitySha256: '2'.repeat(64),
        datasetIdentitySha256: 'c'.repeat(64),
        toolchainPolicySha256: '3'.repeat(64),
        repositoryCommit: '4'.repeat(40),
        repositoryTree: '5'.repeat(40),
        repositoryDirty: false,
      },
    },
    files: [
      { path: 'adapters.safetensors', bytes: adapterBytes.byteLength, sha256: adapterSha256 },
      { path: 'training-plan.json', bytes: trainingPlanBytes.byteLength, sha256: trainingPlanSha256 },
      { path: 'training-result.json', bytes: trainingResultBytes.byteLength, sha256: trainingResultSha256 },
    ],
    runtime: { supported: ['mlx-vlm'] },
    promotion: {
      status: 'promoted',
      promotable: true,
      evidence: [{ type: 'promotion-audit', status: 'pass', sha256: 'e'.repeat(64) }],
    },
  };
  const manifestBytes = encoder.encode(`${JSON.stringify(manifest, null, 2)}\n`);
  const manifestSha256 = await sha256Hex(manifestBytes);
  return {
    adapterBytes,
    trainingPlanBytes,
    trainingResultBytes,
    manifest,
    manifestBytes,
    manifestSha256,
  };
}

async function replacementFixture(currentFixture, content) {
  const adapterBytes = encoder.encode(content);
  const manifest = structuredClone(currentFixture.manifest);
  manifest.files[0] = {
    ...manifest.files[0],
    bytes: adapterBytes.byteLength,
    sha256: await sha256Hex(adapterBytes),
  };
  const manifestBytes = encoder.encode(`${JSON.stringify(manifest, null, 2)}\n`);
  const manifestSha256 = await sha256Hex(manifestBytes);
  return {
    adapterBytes,
    trainingPlanBytes: currentFixture.trainingPlanBytes,
    trainingResultBytes: currentFixture.trainingResultBytes,
    manifest,
    manifestBytes,
    manifestSha256,
  };
}

function fetchFixture({
  manifestBytes,
  adapterBytes,
  trainingPlanBytes,
  trainingResultBytes,
  fileOverride,
  manifestOptions,
  fileOptions,
} = {}) {
  return vi.fn(async (url) => {
    if (url === MANIFEST_URL) return binaryResponse(manifestBytes, manifestOptions);
    if (url === new URL('adapters.safetensors', MANIFEST_URL).href) {
      return binaryResponse(fileOverride || adapterBytes, fileOptions);
    }
    if (url === new URL('training-plan.json', MANIFEST_URL).href) {
      return binaryResponse(trainingPlanBytes || new Uint8Array());
    }
    if (url === new URL('training-result.json', MANIFEST_URL).href) {
      return binaryResponse(trainingResultBytes || new Uint8Array());
    }
    return binaryResponse(new Uint8Array(), { status: 404 });
  });
}

async function installFixture(store, currentFixture) {
  return installScionBrowserAdapter({
    manifestUrl: MANIFEST_URL,
    expectedManifestSha256: currentFixture.manifestSha256,
    fetchImpl: fetchFixture(currentFixture),
    store,
  });
}

describe('Scion browser adapter registry', () => {
  it('installs only hash-bound promoted manifests and atomically verified files', async () => {
    const store = createScionAdapterMemoryStore();
    const currentFixture = await fixture();
    const progress = [];
    const midpoint = Math.floor(currentFixture.adapterBytes.byteLength / 2);
    const record = await installScionBrowserAdapter({
      manifestUrl: MANIFEST_URL,
      expectedManifestSha256: currentFixture.manifestSha256,
      fetchImpl: fetchFixture({
        ...currentFixture,
        fileOptions: {
          chunks: [currentFixture.adapterBytes.slice(0, midpoint), currentFixture.adapterBytes.slice(midpoint)],
        },
      }),
      store,
      onProgress: (entry) => progress.push(entry),
    });

    expect(record).toMatchObject({
      adapterId: 'scion-g4e2b-v1',
      manifestSha256: currentFixture.manifestSha256,
      state: 'installed',
      totalBytes:
        currentFixture.adapterBytes.byteLength +
        currentFixture.trainingPlanBytes.byteLength +
        currentFixture.trainingResultBytes.byteLength,
    });
    await expect(verifyInstalledScionAdapter({ adapterId: record.adapterId, store })).resolves.toMatchObject({
      valid: true,
      issues: [],
    });
    expect(progress.filter((entry) => entry.phase === 'downloading')).toHaveLength(4);
    expect(progress[0].progress).toBeGreaterThan(0);
    expect(progress[0].progress).toBeLessThan(1);
    expect(progress.at(-1)).toMatchObject({ phase: 'installed', progress: 1 });
  });

  it('reuses an exact verified cached install without downloading adapter files again', async () => {
    const store = createScionAdapterMemoryStore();
    const currentFixture = await fixture();
    await installFixture(store, currentFixture);
    const fetchImpl = fetchFixture(currentFixture);
    const progress = [];

    const record = await installScionBrowserAdapter({
      manifestUrl: MANIFEST_URL,
      expectedManifestSha256: currentFixture.manifestSha256,
      fetchImpl,
      store,
      onProgress: (entry) => progress.push(entry),
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(MANIFEST_URL, { cache: 'no-store', credentials: 'omit' });
    expect(record.manifestSha256).toBe(currentFixture.manifestSha256);
    expect(progress).toEqual([
      expect.objectContaining({ phase: 'cached', adapterId: currentFixture.manifest.adapter.id, progress: 1 }),
    ]);
  });

  it('rejects a parsed cached manifest that no longer matches its original hash-bound bytes', async () => {
    const store = createScionAdapterMemoryStore();
    const currentFixture = await fixture();
    await installFixture(store, currentFixture);
    const tamperedRecord = await store.getAdapter(currentFixture.manifest.adapter.id);
    tamperedRecord.manifest.adapter.scionVersion = '9.9.9';
    const tamperedStore = { ...store, getAdapter: vi.fn(async () => structuredClone(tamperedRecord)) };

    await expect(
      verifyInstalledScionAdapter({ adapterId: currentFixture.manifest.adapter.id, store: tamperedStore }),
    ).resolves.toMatchObject({
      valid: false,
      issues: expect.arrayContaining(['cached-manifest-record-mismatch', 'cached-record-scion-version']),
    });
  });

  it('rejects manifest substitution before any adapter file is requested', async () => {
    const store = createScionAdapterMemoryStore();
    const currentFixture = await fixture();
    const fetchImpl = fetchFixture(currentFixture);

    await expect(
      installScionBrowserAdapter({
        manifestUrl: MANIFEST_URL,
        expectedManifestSha256: '0'.repeat(64),
        fetchImpl,
        store,
      }),
    ).rejects.toMatchObject({ code: 'SCION_ADAPTER_MANIFEST_HASH' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await expect(store.listAdapters()).resolves.toEqual([]);
  });

  it('does not commit a partial install when a downloaded file fails integrity', async () => {
    const store = createScionAdapterMemoryStore();
    const currentFixture = await fixture();
    const tamperedBytes = currentFixture.adapterBytes.slice();
    tamperedBytes[0] ^= 0xff;
    const fetchImpl = fetchFixture({ ...currentFixture, fileOverride: tamperedBytes });

    await expect(
      installScionBrowserAdapter({
        manifestUrl: MANIFEST_URL,
        expectedManifestSha256: currentFixture.manifestSha256,
        fetchImpl,
        store,
      }),
    ).rejects.toMatchObject({ code: 'SCION_ADAPTER_FILE_INTEGRITY' });
    await expect(store.listAdapters()).resolves.toEqual([]);
  });

  it('does not commit an earlier verified file when a later file fails', async () => {
    const store = createScionAdapterMemoryStore();
    const commitAdapter = vi.spyOn(store, 'commitAdapter');
    const currentFixture = await fixture();
    const receiptBytes = encoder.encode('conversion receipt');
    const manifest = structuredClone(currentFixture.manifest);
    manifest.files.push({
      path: 'conversion-receipt.json',
      bytes: receiptBytes.byteLength,
      sha256: await sha256Hex(receiptBytes),
    });
    const manifestBytes = encoder.encode(`${JSON.stringify(manifest, null, 2)}\n`);
    const manifestSha256 = await sha256Hex(manifestBytes);
    const tamperedReceipt = receiptBytes.slice();
    tamperedReceipt[0] ^= 0xff;
    const fetchImpl = vi.fn(async (url) => {
      if (url === MANIFEST_URL) return binaryResponse(manifestBytes);
      if (url === new URL('adapters.safetensors', MANIFEST_URL).href) {
        return binaryResponse(currentFixture.adapterBytes);
      }
      if (url === new URL('training-plan.json', MANIFEST_URL).href) {
        return binaryResponse(currentFixture.trainingPlanBytes);
      }
      if (url === new URL('training-result.json', MANIFEST_URL).href) {
        return binaryResponse(currentFixture.trainingResultBytes);
      }
      if (url === new URL('conversion-receipt.json', MANIFEST_URL).href) {
        return binaryResponse(tamperedReceipt);
      }
      return binaryResponse(new Uint8Array(), { status: 404 });
    });

    await expect(
      installScionBrowserAdapter({
        manifestUrl: MANIFEST_URL,
        expectedManifestSha256: manifestSha256,
        fetchImpl,
        store,
      }),
    ).rejects.toMatchObject({ code: 'SCION_ADAPTER_FILE_INTEGRITY' });
    expect(fetchImpl).toHaveBeenCalledTimes(5);
    expect(commitAdapter).not.toHaveBeenCalled();
    await expect(store.listAdapters()).resolves.toEqual([]);
  });

  it('rejects a declared file length mismatch before opening the response stream', async () => {
    const store = createScionAdapterMemoryStore();
    const currentFixture = await fixture();
    const onGetReader = vi.fn();

    await expect(
      installScionBrowserAdapter({
        manifestUrl: MANIFEST_URL,
        expectedManifestSha256: currentFixture.manifestSha256,
        fetchImpl: fetchFixture({
          ...currentFixture,
          fileOptions: {
            contentLength: currentFixture.adapterBytes.byteLength + 1,
            onGetReader,
          },
        }),
        store,
      }),
    ).rejects.toMatchObject({ code: 'SCION_ADAPTER_CONTENT_LENGTH' });
    expect(onGetReader).not.toHaveBeenCalled();
    await expect(store.listAdapters()).resolves.toEqual([]);
  });

  it('cancels a headerless stream that exceeds the manifest byte contract', async () => {
    const store = createScionAdapterMemoryStore();
    const currentFixture = await fixture();
    const onCancel = vi.fn();

    await expect(
      installScionBrowserAdapter({
        manifestUrl: MANIFEST_URL,
        expectedManifestSha256: currentFixture.manifestSha256,
        fetchImpl: fetchFixture({
          ...currentFixture,
          fileOptions: {
            contentLength: null,
            chunks: [currentFixture.adapterBytes, new Uint8Array([1])],
            onCancel,
          },
        }),
        store,
      }),
    ).rejects.toMatchObject({ code: 'SCION_ADAPTER_STREAM_OVERRUN' });
    expect(onCancel).toHaveBeenCalledOnce();
    await expect(store.listAdapters()).resolves.toEqual([]);
  });

  it('rejects a headerless stream that ends before the manifest byte contract', async () => {
    const store = createScionAdapterMemoryStore();
    const currentFixture = await fixture();

    await expect(
      installScionBrowserAdapter({
        manifestUrl: MANIFEST_URL,
        expectedManifestSha256: currentFixture.manifestSha256,
        fetchImpl: fetchFixture({
          ...currentFixture,
          fileOptions: {
            contentLength: null,
            chunks: [currentFixture.adapterBytes.slice(0, -1)],
          },
        }),
        store,
      }),
    ).rejects.toMatchObject({ code: 'SCION_ADAPTER_STREAM_TRUNCATED' });
    await expect(store.listAdapters()).resolves.toEqual([]);
  });

  it('never falls back to an unbounded arrayBuffer response', async () => {
    const store = createScionAdapterMemoryStore();
    const currentFixture = await fixture();
    const onArrayBuffer = vi.fn();

    await expect(
      installScionBrowserAdapter({
        manifestUrl: MANIFEST_URL,
        expectedManifestSha256: currentFixture.manifestSha256,
        fetchImpl: fetchFixture({
          ...currentFixture,
          fileOptions: { includeBody: false, onArrayBuffer },
        }),
        store,
      }),
    ).rejects.toMatchObject({ code: 'SCION_ADAPTER_STREAM_REQUIRED' });
    expect(onArrayBuffer).not.toHaveBeenCalled();
    await expect(store.listAdapters()).resolves.toEqual([]);
  });

  it('rejects an oversized manifest from headers before opening its stream', async () => {
    const store = createScionAdapterMemoryStore();
    const onGetReader = vi.fn();
    const fetchImpl = vi.fn(async () =>
      binaryResponse(new Uint8Array(), {
        contentLength: SCION_ADAPTER_MANIFEST_MAX_BYTES + 1,
        onGetReader,
      }),
    );

    await expect(
      installScionBrowserAdapter({
        manifestUrl: MANIFEST_URL,
        expectedManifestSha256: '0'.repeat(64),
        fetchImpl,
        store,
      }),
    ).rejects.toMatchObject({ code: 'SCION_ADAPTER_SIZE_LIMIT' });
    expect(onGetReader).not.toHaveBeenCalled();
    await expect(store.listAdapters()).resolves.toEqual([]);
  });

  it('keeps a verified adapter installed but inactive on a base-only browser runtime', async () => {
    const store = createScionAdapterMemoryStore();
    const currentFixture = await fixture();
    await installFixture(store, currentFixture);
    const applyAdapter = vi.fn();

    const result = await activateInstalledScionAdapter({
      adapterId: currentFixture.manifest.adapter.id,
      runtimeId: 'transformers-js-webgpu',
      baseModelId: SCION_GEMMA4_E2B_BASE.modelId,
      baseRevision: SCION_GEMMA4_E2B_BASE.revision,
      store,
      applyAdapter,
      probeAdapter: vi.fn(),
    });

    expect(result).toMatchObject({ status: 'base-only', adapterActive: false });
    expect(applyAdapter).not.toHaveBeenCalled();
    await expect(store.getActivationState()).resolves.toMatchObject({ mode: 'base-only', active: null });
  });

  it('marks an adapter active only after exact runtime and inference proof', async () => {
    const store = createScionAdapterMemoryStore();
    const currentFixture = await fixture();
    await installFixture(store, currentFixture);
    const applyAdapter = vi.fn(async () => ({ adapterActive: true, adapterId: currentFixture.manifest.adapter.id }));
    const probeAdapter = vi.fn(async () => ({
      pass: true,
      adapterActive: true,
      adapterId: currentFixture.manifest.adapter.id,
      manifestSha256: currentFixture.manifestSha256,
      baseRevision: SCION_GEMMA4_E2B_BASE.revision,
      proofSha256: 'f'.repeat(64),
    }));

    const result = await activateInstalledScionAdapter({
      adapterId: currentFixture.manifest.adapter.id,
      runtimeId: 'mlx-vlm',
      baseModelId: SCION_GEMMA4_E2B_BASE.modelId,
      baseRevision: SCION_GEMMA4_E2B_BASE.revision,
      store,
      applyAdapter,
      probeAdapter,
    });

    expect(result).toMatchObject({
      status: 'adapter-active',
      adapterActive: true,
      active: {
        adapterId: currentFixture.manifest.adapter.id,
        manifestSha256: currentFixture.manifestSha256,
        proofSha256: 'f'.repeat(64),
      },
    });
    expect(applyAdapter.mock.calls[0][0].files.get('adapters.safetensors')).toBeInstanceOf(ArrayBuffer);
    await expect(store.getActivationState()).resolves.toMatchObject({
      mode: 'adapter-active',
      active: { adapterId: currentFixture.manifest.adapter.id },
      lastKnownGood: { adapterId: currentFixture.manifest.adapter.id },
    });
  });

  it('returns registry state to base-only only after exact runtime rollback proof', async () => {
    const store = createScionAdapterMemoryStore();
    const currentFixture = await fixture();
    await installFixture(store, currentFixture);
    await activateInstalledScionAdapter({
      adapterId: currentFixture.manifest.adapter.id,
      runtimeId: 'mlx-vlm',
      baseModelId: SCION_GEMMA4_E2B_BASE.modelId,
      baseRevision: SCION_GEMMA4_E2B_BASE.revision,
      store,
      applyAdapter: async () => ({ adapterActive: true, adapterId: currentFixture.manifest.adapter.id }),
      probeAdapter: async () => ({
        pass: true,
        adapterActive: true,
        adapterId: currentFixture.manifest.adapter.id,
        manifestSha256: currentFixture.manifestSha256,
        baseRevision: SCION_GEMMA4_E2B_BASE.revision,
        proofSha256: 'f'.repeat(64),
      }),
    });
    const rollbackAdapter = vi.fn(async () => ({ restored: true, baseOutput: 'exact base output' }));

    const result = await deactivateInstalledScionAdapter({ store, rollbackAdapter });

    expect(result).toMatchObject({
      status: 'base-only',
      adapterActive: false,
      rollback: { restored: true, baseOutput: 'exact base output' },
      previousActive: { adapterId: currentFixture.manifest.adapter.id },
    });
    expect(rollbackAdapter).toHaveBeenCalledWith({
      active: expect.objectContaining({ adapterId: currentFixture.manifest.adapter.id }),
    });
    await expect(store.getActivationState()).resolves.toMatchObject({
      mode: 'base-only',
      active: null,
      lastKnownGood: { adapterId: currentFixture.manifest.adapter.id },
    });
  });

  it('quarantines registry state when deactivation lacks exact rollback proof', async () => {
    const store = createScionAdapterMemoryStore();
    const currentFixture = await fixture();
    await installFixture(store, currentFixture);
    await activateInstalledScionAdapter({
      adapterId: currentFixture.manifest.adapter.id,
      runtimeId: 'mlx-vlm',
      baseModelId: SCION_GEMMA4_E2B_BASE.modelId,
      baseRevision: SCION_GEMMA4_E2B_BASE.revision,
      store,
      applyAdapter: async () => ({ adapterActive: true, adapterId: currentFixture.manifest.adapter.id }),
      probeAdapter: async () => ({
        pass: true,
        adapterActive: true,
        adapterId: currentFixture.manifest.adapter.id,
        manifestSha256: currentFixture.manifestSha256,
        baseRevision: SCION_GEMMA4_E2B_BASE.revision,
        proofSha256: 'f'.repeat(64),
      }),
    });
    const previousState = await store.getActivationState();

    await expect(
      deactivateInstalledScionAdapter({ store, rollbackAdapter: async () => ({ restored: false }) }),
    ).rejects.toMatchObject({ code: 'SCION_ADAPTER_ROLLBACK_PROOF' });
    await expect(store.getActivationState()).resolves.toMatchObject({
      mode: 'recovery-required',
      active: null,
      lastKnownGood: previousState.lastKnownGood,
      failure: {
        adapterId: currentFixture.manifest.adapter.id,
        code: 'SCION_ADAPTER_ROLLBACK_PROOF',
        runtimeMayBeModified: true,
        previousActive: previousState.active,
      },
    });
  });

  it('rejects a different manifest under an active adapter ID before downloading replacement files', async () => {
    const store = createScionAdapterMemoryStore();
    const currentFixture = await fixture();
    await installFixture(store, currentFixture);
    await activateInstalledScionAdapter({
      adapterId: currentFixture.manifest.adapter.id,
      runtimeId: 'mlx-vlm',
      baseModelId: SCION_GEMMA4_E2B_BASE.modelId,
      baseRevision: SCION_GEMMA4_E2B_BASE.revision,
      store,
      applyAdapter: async () => ({ adapterActive: true, adapterId: currentFixture.manifest.adapter.id }),
      probeAdapter: async () => ({
        pass: true,
        adapterActive: true,
        adapterId: currentFixture.manifest.adapter.id,
        manifestSha256: currentFixture.manifestSha256,
        baseRevision: SCION_GEMMA4_E2B_BASE.revision,
        proofSha256: 'f'.repeat(64),
      }),
    });
    const previousState = await store.getActivationState();
    const replacement = await replacementFixture(currentFixture, 'different-adapter-weights');
    const fetchImpl = fetchFixture(replacement);

    await expect(
      installScionBrowserAdapter({
        manifestUrl: MANIFEST_URL,
        expectedManifestSha256: replacement.manifestSha256,
        fetchImpl,
        store,
      }),
    ).rejects.toMatchObject({
      code: 'SCION_ADAPTER_ACTIVE_REPLACEMENT',
      adapterId: currentFixture.manifest.adapter.id,
      activeManifestSha256: currentFixture.manifestSha256,
      requestedManifestSha256: replacement.manifestSha256,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await expect(store.getAdapter(currentFixture.manifest.adapter.id)).resolves.toMatchObject({
      manifestSha256: currentFixture.manifestSha256,
    });
    await expect(store.getActivationState()).resolves.toEqual(previousState);
  });

  it('trusts the active runtime digest rather than a missing cached record when guarding replacement', async () => {
    const store = createScionAdapterMemoryStore();
    const requestedFixture = await fixture();
    const activeManifestSha256 = 'a'.repeat(64);
    await store.setActivationState({
      mode: 'adapter-active',
      active: {
        adapterId: requestedFixture.manifest.adapter.id,
        manifestSha256: activeManifestSha256,
      },
      lastKnownGood: null,
      history: [],
    });
    const fetchImpl = fetchFixture(requestedFixture);

    await expect(
      installScionBrowserAdapter({
        manifestUrl: MANIFEST_URL,
        expectedManifestSha256: requestedFixture.manifestSha256,
        fetchImpl,
        store,
      }),
    ).rejects.toMatchObject({
      code: 'SCION_ADAPTER_ACTIVE_REPLACEMENT',
      adapterId: requestedFixture.manifest.adapter.id,
      activeManifestSha256,
      requestedManifestSha256: requestedFixture.manifestSha256,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await expect(store.getAdapter(requestedFixture.manifest.adapter.id)).resolves.toBeNull();
  });

  it('restores the last known-good registry state when a new proof fails', async () => {
    const store = createScionAdapterMemoryStore();
    const currentFixture = await fixture();
    await installFixture(store, currentFixture);
    const activation = {
      adapterId: currentFixture.manifest.adapter.id,
      runtimeId: 'mlx-vlm',
      baseModelId: SCION_GEMMA4_E2B_BASE.modelId,
      baseRevision: SCION_GEMMA4_E2B_BASE.revision,
      store,
      applyAdapter: async () => ({ adapterActive: true, adapterId: currentFixture.manifest.adapter.id }),
    };
    await activateInstalledScionAdapter({
      ...activation,
      probeAdapter: async () => ({
        pass: true,
        adapterActive: true,
        adapterId: currentFixture.manifest.adapter.id,
        manifestSha256: currentFixture.manifestSha256,
        baseRevision: SCION_GEMMA4_E2B_BASE.revision,
        proofSha256: 'f'.repeat(64),
      }),
    });
    const previousState = await store.getActivationState();
    const rollbackAdapter = vi.fn();

    await expect(
      activateInstalledScionAdapter({
        ...activation,
        probeAdapter: async () => ({ pass: false }),
        rollbackAdapter,
      }),
    ).rejects.toMatchObject({ code: 'SCION_ADAPTER_PROBE_FAILED', rollbackSucceeded: true });
    expect(rollbackAdapter).toHaveBeenCalledWith(
      expect.objectContaining({
        failedAdapterId: currentFixture.manifest.adapter.id,
        previousState: expect.objectContaining({ mode: 'adapter-active' }),
      }),
    );
    await expect(store.getActivationState()).resolves.toEqual(previousState);
  });

  it('quarantines registry state when failed activation cannot prove rollback', async () => {
    const store = createScionAdapterMemoryStore();
    const currentFixture = await fixture();
    await installFixture(store, currentFixture);
    const activation = {
      adapterId: currentFixture.manifest.adapter.id,
      runtimeId: 'mlx-vlm',
      baseModelId: SCION_GEMMA4_E2B_BASE.modelId,
      baseRevision: SCION_GEMMA4_E2B_BASE.revision,
      store,
      applyAdapter: async () => ({ adapterActive: true, adapterId: currentFixture.manifest.adapter.id }),
    };
    await activateInstalledScionAdapter({
      ...activation,
      probeAdapter: async () => ({
        pass: true,
        adapterActive: true,
        adapterId: currentFixture.manifest.adapter.id,
        manifestSha256: currentFixture.manifestSha256,
        baseRevision: SCION_GEMMA4_E2B_BASE.revision,
        proofSha256: 'f'.repeat(64),
      }),
    });
    const previousState = await store.getActivationState();

    await expect(
      activateInstalledScionAdapter({
        ...activation,
        probeAdapter: async () => ({ pass: false }),
        rollbackAdapter: async () => {
          throw new Error('runtime rollback failed');
        },
      }),
    ).rejects.toMatchObject({ code: 'SCION_ADAPTER_PROBE_FAILED', rollbackSucceeded: false });
    await expect(store.getActivationState()).resolves.toMatchObject({
      mode: 'recovery-required',
      active: null,
      lastKnownGood: previousState.lastKnownGood,
      history: previousState.history,
      failure: {
        adapterId: currentFixture.manifest.adapter.id,
        code: 'SCION_ADAPTER_PROBE_FAILED',
        runtimeMayBeModified: true,
        previousActive: previousState.active,
      },
    });
  });
});
