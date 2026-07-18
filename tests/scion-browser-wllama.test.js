import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  applyScionBrowserWllamaAdapter,
  completeScionBrowserWllama,
  getScionBrowserWllamaStatus,
  loadScionBrowserWllama,
  probeScionBrowserWllamaAdapter,
  rollbackScionBrowserWllamaAdapter,
  subscribeScionBrowserWllamaStatus,
  unloadScionBrowserWllama,
} from '../src/lib/scionBrowserWllama.js';
import { SCION_GEMMA4_E2B_BASE } from '../src/lib/scionAdapterManifest.js';
import { SCION_ADAPTER_TASK_FAMILIES } from '../src/lib/scionAdapterTaskScope.js';

class FakeWllama {
  static last = null;

  constructor(paths, config) {
    this.paths = paths;
    this.config = config;
    this.loaded = false;
    this.adapter = null;
    this.prompts = [];
    this.baseOutput = 'Base general answer.';
    FakeWllama.last = this;
  }

  async loadModelFromUrl(url, options) {
    this.url = url;
    this.options = options;
    options.progressCallback({ loaded: 50, total: 100 });
    options.progressCallback({ loaded: 100, total: 100 });
    this.loaded = true;
  }

  isModelLoaded() {
    return this.loaded;
  }

  usingWebGPU() {
    return true;
  }

  getModelMetadata() {
    return {
      hparams: { nLayer: 35 },
      meta: { 'general.architecture': 'gemma4', 'general.type': 'model' },
    };
  }

  async getLoraAdapterStatus() {
    return this.adapter || { active: false, path: '', scale: 0, metadata: {} };
  }

  async clearLoraAdapter() {
    this.adapter = null;
  }

  async loadLoraAdapter(_blob, scale) {
    this.adapter = {
      active: true,
      path: 'models/adapter-0.gguf',
      scale,
      metadata: {
        'general.type': 'adapter',
        'adapter.type': 'lora',
        'general.architecture': 'gemma4',
      },
    };
    return this.adapter;
  }

  async createCompletion(prompt) {
    this.prompts.push(prompt);
    return this.adapter ? 'Adapter decision-focused answer.' : this.baseOutput;
  }

  async exit() {
    this.loaded = false;
  }
}

const browser = {
  navigatorLike: { gpu: {} },
  globalLike: { crossOriginIsolated: true, WebAssembly: { Suspending: function Suspending() {} } },
  locationLike: { href: 'https://edutool.dev/workspace' },
  runtimeLoader: vi.fn(async () => ({ Wllama: FakeWllama })),
};

afterEach(async () => {
  await unloadScionBrowserWllama();
  vi.clearAllMocks();
});

describe('Scion WebGPU GGUF runtime', () => {
  it('loads the pinned same-origin runtime and formats Gemma 4 itself', async () => {
    const progress = [];
    const published = [];
    const unsubscribe = subscribeScionBrowserWllamaStatus((entry) => published.push(entry));
    const controller = new AbortController();
    await loadScionBrowserWllama({
      ...browser,
      signal: controller.signal,
      onProgress: (entry) => progress.push(entry),
    });
    const output = await completeScionBrowserWllama('Explain formative assessment.', { maxNewTokens: 32 });

    expect(output).toBe('Base general answer.');
    expect(browser.runtimeLoader).toHaveBeenCalledWith('https://edutool.dev/scion/runtime/v1/wllama.js');
    expect(FakeWllama.last.paths).toEqual({
      'jspi/single-thread/wllama.wasm': 'https://edutool.dev/scion/runtime/v1/jspi-single-thread/wllama.wasm',
    });
    expect(FakeWllama.last.config).toMatchObject({ backend: 'webgpu' });
    expect(FakeWllama.last.options.signal).toBe(controller.signal);
    expect(FakeWllama.last.prompts.at(-1)).toBe('<|turn>user\nExplain formative assessment.<turn|>\n<|turn>model\n');
    expect(getScionBrowserWllamaStatus()).toMatchObject({
      phase: 'ready',
      progress: 1,
      adapter: { mode: 'base-only', active: false },
    });
    expect(progress.some((entry) => entry.phase === 'loading-model' && entry.progress === 0.5)).toBe(true);
    expect(
      progress.some(
        (entry) =>
          entry.phase === 'loading-model' && entry.progress === 1 && /base ready · loading Scion/.test(entry.message),
      ),
    ).toBe(true);
    expect(published.map((entry) => entry.phase)).toContain('loading-runtime');
    expect(published.some((entry) => entry.phase === 'loading-model' && entry.progress === 0.5)).toBe(true);
    expect(published.at(-1).phase).toBe('ready');
    unsubscribe();
  });

  it('requires native metadata plus changed inference before reporting an adapter active', async () => {
    await loadScionBrowserWllama(browser);
    const adapterBytes = new TextEncoder().encode('fake gguf lora');
    const manifest = {
      adapter: { id: 'scion-candidate', format: 'gguf-lora' },
      files: [{ path: 'scion-candidate.gguf', bytes: adapterBytes.byteLength, sha256: 'a'.repeat(64) }],
    };
    const activation = await applyScionBrowserWllamaAdapter({
      adapterId: 'scion-candidate',
      manifest,
      manifestSha256: 'b'.repeat(64),
      files: new Map([['scion-candidate.gguf', adapterBytes.buffer]]),
    });
    expect(activation).toMatchObject({ adapterActive: true, adapterId: 'scion-candidate' });
    expect(getScionBrowserWllamaStatus().adapter).toMatchObject({
      mode: 'adapter-pending-proof',
      active: false,
    });

    const proof = await probeScionBrowserWllamaAdapter({
      adapterId: 'scion-candidate',
      manifestSha256: 'b'.repeat(64),
      baseRevision: SCION_GEMMA4_E2B_BASE.revision,
    });
    expect(proof).toMatchObject({
      pass: true,
      adapterActive: true,
      adapterId: 'scion-candidate',
      outputChanged: true,
      native: { active: true },
    });
    expect(proof.proofSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(getScionBrowserWllamaStatus().adapter).toMatchObject({ mode: 'adapter-active', active: true });

    await expect(rollbackScionBrowserWllamaAdapter()).resolves.toMatchObject({
      restored: true,
      baseOutput: 'Base general answer.',
    });
    expect(getScionBrowserWllamaStatus().adapter).toMatchObject({ mode: 'base-only', active: false });
  });

  it('uses a proven adapter only for declared task families and proves base fallback for all others', async () => {
    await loadScionBrowserWllama(browser);
    const adapterBytes = new TextEncoder().encode('fake scoped gguf lora');
    const manifest = {
      adapter: { id: 'scion-scoped', format: 'gguf-lora' },
      training: {
        pairCount: 10,
        taskScope: {
          protocol: 'scion-adapter-task-scope-v1',
          mode: 'allowlist',
          families: [{ id: SCION_ADAPTER_TASK_FAMILIES.SOURCE_MC_ITEM_ATOM, rows: 10 }],
          unclassifiedPolicy: 'base-only',
          compositePolicy: 'exact-family-only',
          identity: {
            algorithm: 'sha256-canonical-scion-adapter-task-scope-v1',
            sha256: 'c'.repeat(64),
          },
        },
      },
      files: [{ path: 'scion-scoped.gguf', bytes: adapterBytes.byteLength, sha256: 'a'.repeat(64) }],
    };
    await applyScionBrowserWllamaAdapter({
      adapterId: 'scion-scoped',
      manifest,
      manifestSha256: 'b'.repeat(64),
      files: new Map([['scion-scoped.gguf', adapterBytes.buffer]]),
    });
    await probeScionBrowserWllamaAdapter({
      adapterId: 'scion-scoped',
      manifestSha256: 'b'.repeat(64),
      baseRevision: SCION_GEMMA4_E2B_BASE.revision,
    });

    const routes = [];
    await expect(
      completeScionBrowserWllama('Write one item.', {
        taskFamily: SCION_ADAPTER_TASK_FAMILIES.SOURCE_MC_ITEM_ATOM,
        onAdapterRoute: (route) => routes.push(route),
      }),
    ).resolves.toBe('Adapter decision-focused answer.');
    await expect(
      completeScionBrowserWllama('Write a full lesson.', {
        taskFamily: SCION_ADAPTER_TASK_FAMILIES.LESSON_KERNEL,
        onAdapterRoute: (route) => routes.push(route),
      }),
    ).resolves.toBe('Base general answer.');
    await expect(
      completeScionBrowserWllama('Write one more item.', {
        taskFamily: SCION_ADAPTER_TASK_FAMILIES.SOURCE_MC_ITEM_ATOM,
        onAdapterRoute: (route) => routes.push(route),
      }),
    ).resolves.toBe('Adapter decision-focused answer.');

    expect(routes).toEqual([
      expect.objectContaining({
        protocol: 'scion-adapter-runtime-route-v1',
        mode: 'adapter',
        taskFamily: 'source-mc-item-atom',
        nativeAdapterActive: true,
      }),
      expect.objectContaining({
        mode: 'base-only',
        taskFamily: 'lesson-kernel',
        reason: 'task-family-out-of-scope',
        nativeAdapterActive: false,
      }),
      expect.objectContaining({ mode: 'adapter', nativeAdapterActive: true }),
    ]);
  });

  it('fails before loading when WebGPU is absent', async () => {
    await expect(loadScionBrowserWllama({ ...browser, navigatorLike: {} })).rejects.toMatchObject({
      code: 'SCION_WLLAMA_WEBGPU',
    });
  });

  it('quarantines a native adapter that has no verified installed identity', async () => {
    await loadScionBrowserWllama(browser);
    await FakeWllama.last.loadLoraAdapter(new Blob(['unbound']), 1);

    await expect(
      completeScionBrowserWllama('Do not trust this adapter.', {
        taskFamily: SCION_ADAPTER_TASK_FAMILIES.LESSON_KERNEL,
      }),
    ).rejects.toMatchObject({ code: 'SCION_WLLAMA_UNBOUND_ADAPTER' });
    expect(getScionBrowserWllamaStatus()).toMatchObject({
      phase: 'recovery-required',
      adapter: { mode: 'recovery-required', active: null },
    });
  });

  it('quarantines inference after rollback drift until the runtime is unloaded and reloaded', async () => {
    await loadScionBrowserWllama(browser);
    const adapterBytes = new TextEncoder().encode('fake gguf lora');
    const manifest = {
      adapter: { id: 'scion-candidate', format: 'gguf-lora' },
      files: [{ path: 'scion-candidate.gguf', bytes: adapterBytes.byteLength, sha256: 'a'.repeat(64) }],
    };
    await applyScionBrowserWllamaAdapter({
      adapterId: 'scion-candidate',
      manifest,
      manifestSha256: 'b'.repeat(64),
      files: new Map([['scion-candidate.gguf', adapterBytes.buffer]]),
    });
    FakeWllama.last.baseOutput = 'Drifted base answer.';

    await expect(rollbackScionBrowserWllamaAdapter()).rejects.toMatchObject({ code: 'SCION_WLLAMA_ROLLBACK' });
    expect(getScionBrowserWllamaStatus()).toMatchObject({
      phase: 'recovery-required',
      adapter: {
        mode: 'recovery-required',
        active: null,
        id: 'scion-candidate',
        manifestSha256: 'b'.repeat(64),
        nativeState: 'unknown',
      },
    });
    await expect(completeScionBrowserWllama('Continue generating.')).rejects.toMatchObject({
      code: 'SCION_WLLAMA_RECOVERY_REQUIRED',
    });
    await expect(loadScionBrowserWllama(browser)).rejects.toMatchObject({
      code: 'SCION_WLLAMA_RECOVERY_REQUIRED',
    });

    await unloadScionBrowserWllama();
    await loadScionBrowserWllama(browser);
    await expect(completeScionBrowserWllama('Continue generating.')).resolves.toBe('Base general answer.');
    expect(getScionBrowserWllamaStatus()).toMatchObject({
      phase: 'ready',
      adapter: { mode: 'base-only', active: false },
    });
  });
});
