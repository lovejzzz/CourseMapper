import { describe, expect, it, vi } from 'vitest';

import {
  activateInstalledScionAdapter,
  createScionAdapterMemoryStore,
  installScionBrowserAdapter,
  sha256Hex,
  verifyInstalledScionAdapter,
} from '../src/lib/scionAdapterRegistry.js';
import { SCION_ADAPTER_MANIFEST_SCHEMA_VERSION, SCION_GEMMA4_E2B_BASE } from '../src/lib/scionAdapterManifest.js';

const encoder = new TextEncoder();
const MANIFEST_URL = 'https://models.edutool.dev/scion/scion-g4e2b-v1/manifest.json';
const TRAINING_DOMAINS = ['computer-science', 'geology', 'music-theory', 'user-experience-design', 'world-history'];

function binaryResponse(bytes, { status = 200 } = {}) {
  const value = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return {
    ok: status >= 200 && status < 300,
    status,
    arrayBuffer: async () => value.slice().buffer,
  };
}

async function fixture(adapterId = 'scion-g4e2b-v1') {
  const adapterBytes = encoder.encode(`adapter-weights:${adapterId}`);
  const adapterSha256 = await sha256Hex(adapterBytes);
  const manifest = {
    schemaVersion: SCION_ADAPTER_MANIFEST_SCHEMA_VERSION,
    adapter: { id: adapterId, scionVersion: '0.16.7', format: 'mlx-lora-safetensors' },
    base: { ...SCION_GEMMA4_E2B_BASE, exactRevisionRequired: true },
    training: {
      method: 'orpo-lora',
      datasetManifestSha256: 'd'.repeat(64),
      datasetStatus: 'ready',
      pairCount: 3200,
      domainCount: 5,
      groupCount: 15,
      instructorPairCount: 100,
      instructorDomainCount: 5,
      domainGroupCounts: Object.fromEntries(TRAINING_DOMAINS.map((domain) => [domain, 3])),
      instructorDomainCounts: Object.fromEntries(TRAINING_DOMAINS.map((domain) => [domain, 20])),
      splitCounts: { train: 1200, valid: 1000, test: 1000 },
      splitDomainCounts: { train: 5, valid: 5, test: 5 },
    },
    files: [{ path: 'adapters.safetensors', bytes: adapterBytes.byteLength, sha256: adapterSha256 }],
    runtime: { supported: ['mlx-vlm'] },
    promotion: {
      status: 'promoted',
      promotable: true,
      evidence: [{ type: 'promotion-audit', status: 'pass', sha256: 'e'.repeat(64) }],
    },
  };
  const manifestBytes = encoder.encode(`${JSON.stringify(manifest, null, 2)}\n`);
  const manifestSha256 = await sha256Hex(manifestBytes);
  return { adapterBytes, manifest, manifestBytes, manifestSha256 };
}

function fetchFixture({ manifestBytes, adapterBytes, fileOverride } = {}) {
  return vi.fn(async (url) => {
    if (url === MANIFEST_URL) return binaryResponse(manifestBytes);
    if (url === new URL('adapters.safetensors', MANIFEST_URL).href) {
      return binaryResponse(fileOverride || adapterBytes);
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
    const record = await installScionBrowserAdapter({
      manifestUrl: MANIFEST_URL,
      expectedManifestSha256: currentFixture.manifestSha256,
      fetchImpl: fetchFixture(currentFixture),
      store,
      onProgress: (entry) => progress.push(entry),
    });

    expect(record).toMatchObject({
      adapterId: 'scion-g4e2b-v1',
      manifestSha256: currentFixture.manifestSha256,
      state: 'installed',
      totalBytes: currentFixture.adapterBytes.byteLength,
    });
    await expect(verifyInstalledScionAdapter({ adapterId: record.adapterId, store })).resolves.toMatchObject({
      valid: true,
      issues: [],
    });
    expect(progress.at(-1)).toMatchObject({ phase: 'installed', progress: 1 });
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
    const fetchImpl = fetchFixture({ ...currentFixture, fileOverride: encoder.encode('tampered') });

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
});
