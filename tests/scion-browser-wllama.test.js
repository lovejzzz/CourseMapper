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
    this.activeCompletions = 0;
    this.maxActiveCompletions = 0;
    this.completionDelay = 0;
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
    this.activeCompletions += 1;
    this.maxActiveCompletions = Math.max(this.maxActiveCompletions, this.activeCompletions);
    this.prompts.push(prompt);
    try {
      if (this.completionDelay > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.completionDelay));
      }
      return this.adapter ? 'Adapter decision-focused answer.' : this.baseOutput;
    } finally {
      this.activeCompletions -= 1;
    }
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
  vi.restoreAllMocks();
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
    expect(browser.runtimeLoader).toHaveBeenCalledWith('https://edutool.dev/scion/runtime/v2/wllama.js');
    expect(FakeWllama.last.paths).toEqual({
      'jspi/single-thread/wllama.wasm': 'https://edutool.dev/scion/runtime/v1/jspi-single-thread/wllama.wasm',
    });
    expect(FakeWllama.last.config).toMatchObject({
      backend: 'webgpu',
      suppressNativeLog: true,
      logger: expect.objectContaining({ warn: expect.any(Function), error: expect.any(Function) }),
    });
    expect(FakeWllama.last.options.signal).toBe(controller.signal);
    expect(FakeWllama.last.options.n_threads).toBe(1);
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
          entry.phase === 'loading-model' &&
          entry.progress === 1 &&
          /Model ready on this device · preparing Scion/.test(entry.message),
      ),
    ).toBe(true);
    expect(published.map((entry) => entry.phase)).toContain('loading-runtime');
    expect(published.some((entry) => entry.phase === 'loading-model' && entry.progress === 0.5)).toBe(true);
    expect(published.at(-1).phase).toBe('ready');
    unsubscribe();
  });

  it('serializes concurrent browser completions against the single local model instance', async () => {
    await loadScionBrowserWllama(browser);
    FakeWllama.last.completionDelay = 5;

    await expect(
      Promise.all([
        completeScionBrowserWllama('First request.'),
        completeScionBrowserWllama('Second request.'),
        completeScionBrowserWllama('Third request.'),
      ]),
    ).resolves.toEqual(['Base general answer.', 'Base general answer.', 'Base general answer.']);
    expect(FakeWllama.last.maxActiveCompletions).toBe(1);
    expect(FakeWllama.last.prompts).toHaveLength(3);
  });

  it('removes and redownloads one cached Scion model after a proven OPFS read failure', async () => {
    const modelUrl = 'https://huggingface.co/scion/model-00001-of-00005.gguf';
    let cached = true;
    let removals = 0;
    let loads = 0;
    class CacheRepairWllama extends FakeWllama {
      constructor(paths, config) {
        super(paths, config);
        this.modelManager = {
          getModels: vi.fn(async () =>
            cached
              ? [
                  {
                    url: modelUrl,
                    size: 1024,
                    remove: vi.fn(async () => {
                      cached = false;
                      removals += 1;
                    }),
                  },
                ]
              : [],
          ),
        };
      }

      async loadModelFromUrl(url, options) {
        loads += 1;
        if (loads === 1) {
          throw new DOMException(
            "Failed to execute 'read' on 'FileSystemSyncAccessHandle': Failed to read the content",
            'InvalidStateError',
          );
        }
        return super.loadModelFromUrl(url, options);
      }
    }
    const progress = [];

    await expect(
      loadScionBrowserWllama({
        ...browser,
        modelUrl,
        runtimeLoader: vi.fn(async () => ({ Wllama: CacheRepairWllama })),
        onProgress: (entry) => progress.push(entry),
      }),
    ).resolves.toMatchObject({ status: { phase: 'ready' } });

    expect(loads).toBe(2);
    expect(removals).toBe(1);
    expect(progress).toContainEqual(
      expect.objectContaining({
        phase: 'repairing-cache',
        progress: 0,
        message: 'Repairing the local Scion model cache…',
      }),
    );
  });

  it('does not redownload or clear the model for an unrelated load failure', async () => {
    let loads = 0;
    let clears = 0;
    class UnrelatedFailureWllama extends FakeWllama {
      constructor(paths, config) {
        super(paths, config);
        this.modelManager = {
          getModels: vi.fn(async () => [{ url: 'https://example.test/model.gguf', size: 1024 }]),
          clear: vi.fn(async () => {
            clears += 1;
          }),
        };
      }

      async loadModelFromUrl() {
        loads += 1;
        throw new Error('WebGPU device was lost while allocating tensors');
      }
    }

    await expect(
      loadScionBrowserWllama({
        ...browser,
        modelUrl: 'https://example.test/model.gguf',
        runtimeLoader: vi.fn(async () => ({ Wllama: UnrelatedFailureWllama })),
      }),
    ).rejects.toThrow('WebGPU device was lost while allocating tensors');
    expect(loads).toBe(1);
    expect(clears).toBe(0);
  });

  it('restarts once from cached model state after a fatal llama.cpp worker stop', async () => {
    const completion = vi
      .spyOn(FakeWllama.prototype, 'createCompletion')
      .mockRejectedValueOnce(new Error('Received abort signal from llama.cpp; Message: (empty)'))
      .mockResolvedValueOnce('Recovered base answer.');
    await loadScionBrowserWllama(browser);

    await expect(completeScionBrowserWllama('Recover this request.')).resolves.toBe('Recovered base answer.');
    expect(completion).toHaveBeenCalledTimes(2);
    expect(browser.runtimeLoader).toHaveBeenCalledTimes(1);
    expect(getScionBrowserWllamaStatus()).toMatchObject({
      phase: 'ready',
      adapter: { mode: 'base-only', active: false },
    });
  });

  it('recovers an internal AbortError when the caller did not stop the course', async () => {
    const completion = vi
      .spyOn(FakeWllama.prototype, 'createCompletion')
      .mockRejectedValueOnce(new DOMException('', 'AbortError'))
      .mockResolvedValueOnce('Recovered after internal abort.');
    const controller = new AbortController();
    await loadScionBrowserWllama({ ...browser, signal: controller.signal });

    await expect(completeScionBrowserWllama('Continue the course.', { signal: controller.signal })).resolves.toBe(
      'Recovered after internal abort.',
    );
    expect(controller.signal.aborted).toBe(false);
    expect(completion).toHaveBeenCalledTimes(2);
    expect(getScionBrowserWllamaStatus()).toMatchObject({
      phase: 'ready',
      adapter: { mode: 'base-only', active: false },
    });
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
        taskFamily: SCION_ADAPTER_TASK_FAMILIES.SOURCE_GROUNDED_LESSON_KERNEL,
        promptProtocol: 'production-lesson-kernel-prompt-v1',
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
        taskFamily: 'source-grounded-lesson-kernel',
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
