import {
  SCION_BROWSER_GEMMA4_GGUF,
  SCION_BROWSER_GEMMA4_GGUF_URL,
  SCION_BROWSER_MAX_NEW_TOKENS,
  SCION_BROWSER_WLLAMA_MODULE_PATH,
  SCION_BROWSER_WLLAMA_RUNTIME_ID,
  SCION_BROWSER_WLLAMA_WASM_PATH,
} from './scionBrowserConstants';
import { formatScionGemma4Messages } from './scionGemma4Prompt';
import { sha256Hex } from './scionAdapterRegistry';

const ACTIVATION_CANARY =
  'Return strict JSON only. Write one music-theory multiple-choice item about 4/4 meter with q, op containing exactly four options, ai, and ex. Add no other fields.';

let runtimeModule = null;
let runtime = null;
let loadingRuntime = null;
let loadPromise = null;
let activeAdapter = null;
let pendingProbe = null;
const statusListeners = new Set();

function initialStatus() {
  return {
    phase: 'idle',
    progress: 0,
    message: 'Scion GGUF runtime has not been loaded.',
    error: null,
    runtime: SCION_BROWSER_GEMMA4_GGUF.runtime,
    trainingBase: SCION_BROWSER_GEMMA4_GGUF.trainingBase,
    activeWeightIdentity: SCION_BROWSER_GEMMA4_GGUF.runtimeArtifact,
    baseIntegrity: {
      expectedSha256: SCION_BROWSER_GEMMA4_GGUF.runtimeArtifact.sha256,
      runtimeCheck: 'metadata-and-pinned-url',
      fullDigestEvidence: 'evaluation/scion-adapters/base-contracts/gemma-4-e2b.json',
    },
    adapter: { mode: 'base-only', active: false, id: null, manifestSha256: null },
  };
}

let status = initialStatus();

function cloneStatus() {
  return structuredClone(status);
}

function publish(patch, onProgress) {
  status = { ...status, ...patch };
  const snapshot = cloneStatus();
  if (typeof onProgress === 'function') {
    try {
      onProgress(snapshot);
    } catch {
      // A progress observer cannot corrupt model state.
    }
  }
  for (const listener of statusListeners) {
    try {
      listener(snapshot);
    } catch {
      // A UI subscriber cannot corrupt model state.
    }
  }
  return snapshot;
}

function runtimeError(code, message, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  return error;
}

function requireBrowserCapabilities({ navigatorLike, globalLike }) {
  if (!navigatorLike?.gpu) {
    throw runtimeError('SCION_WLLAMA_WEBGPU', 'Scion GGUF inference requires WebGPU.');
  }
  if (typeof globalLike?.WebAssembly?.Suspending !== 'function') {
    throw runtimeError('SCION_WLLAMA_JSPI', 'Scion GGUF inference requires WebAssembly JSPI.');
  }
}

function absoluteAsset(path, locationLike) {
  if (!locationLike?.href) throw runtimeError('SCION_WLLAMA_LOCATION', 'Scion runtime requires a page URL.');
  return new URL(path, locationLike.href).href;
}

async function defaultRuntimeLoader(moduleUrl) {
  return import(/* @vite-ignore */ moduleUrl);
}

function validateRuntimeModule(candidate) {
  if (typeof candidate?.Wllama !== 'function') {
    throw runtimeError('SCION_WLLAMA_API', 'The pinned Scion runtime does not export Wllama.');
  }
  return candidate;
}

function validateLoadedBase(candidate) {
  if (!candidate?.isModelLoaded?.()) throw runtimeError('SCION_WLLAMA_MODEL', 'Gemma 4 did not finish loading.');
  if (!candidate?.usingWebGPU?.()) throw runtimeError('SCION_WLLAMA_BACKEND', 'Gemma 4 did not activate WebGPU.');
  const metadata = candidate.getModelMetadata?.();
  const architecture = metadata?.meta?.['general.architecture'];
  const type = metadata?.meta?.['general.type'];
  if (architecture !== 'gemma4' || type !== 'model') {
    throw runtimeError('SCION_WLLAMA_IDENTITY', 'Downloaded GGUF metadata does not identify the pinned Gemma 4 base.');
  }
  return metadata;
}

export function getScionBrowserWllamaStatus() {
  return cloneStatus();
}

export function subscribeScionBrowserWllamaStatus(listener) {
  if (typeof listener !== 'function') return () => {};
  statusListeners.add(listener);
  listener(cloneStatus());
  return () => statusListeners.delete(listener);
}

export function isScionBrowserWllamaReady() {
  return status.phase === 'ready' && Boolean(runtime?.isModelLoaded?.());
}

export async function loadScionBrowserWllama({
  onProgress,
  signal,
  runtimeLoader = defaultRuntimeLoader,
  navigatorLike = globalThis.navigator,
  globalLike = globalThis,
  locationLike = globalThis.location,
  modelUrl = SCION_BROWSER_GEMMA4_GGUF_URL,
  contextSize = 8192,
} = {}) {
  requireBrowserCapabilities({ navigatorLike, globalLike });
  if (status.phase === 'recovery-required') {
    throw runtimeError(
      'SCION_WLLAMA_RECOVERY_REQUIRED',
      'Unload the quarantined Scion runtime before loading the public base again.',
    );
  }
  if (isScionBrowserWllamaReady()) return { runtime, status: cloneStatus() };
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    publish(
      { phase: 'loading-runtime', progress: 0, message: 'Loading the pinned Scion WebGPU runtime…', error: null },
      onProgress,
    );
    const moduleUrl = absoluteAsset(SCION_BROWSER_WLLAMA_MODULE_PATH, locationLike);
    runtimeModule ||= validateRuntimeModule(await runtimeLoader(moduleUrl));
    const wasmUrl = absoluteAsset(SCION_BROWSER_WLLAMA_WASM_PATH, locationLike);
    const candidate = new runtimeModule.Wllama(
      { 'jspi/single-thread/wllama.wasm': wasmUrl },
      { backend: 'webgpu', suppressNativeLog: true },
    );
    loadingRuntime = candidate;
    publish({ phase: 'loading-model', message: 'Downloading the public Gemma 4 base…' }, onProgress);
    await candidate.loadModelFromUrl(modelUrl, {
      useCache: true,
      n_ctx: contextSize,
      seed: 424242,
      signal,
      progressCallback: ({ loaded, total }) => {
        const progress = total > 0 ? Math.min(1, Math.max(0, loaded / total)) : status.progress;
        publish(
          {
            phase: 'loading-model',
            progress,
            message:
              total > 0
                ? progress >= 1
                  ? 'Public Gemma 4 base ready · loading Scion…'
                  : `Downloading the public Gemma 4 base (${Math.floor(progress * 100)}%)…`
                : status.message,
          },
          onProgress,
        );
      },
    });
    const metadata = validateLoadedBase(candidate);
    const nativeAdapter = await candidate.getLoraAdapterStatus();
    if (nativeAdapter?.active) {
      await candidate.clearLoraAdapter();
    }
    runtime = candidate;
    loadingRuntime = null;
    activeAdapter = null;
    pendingProbe = null;
    publish(
      {
        phase: 'ready',
        progress: 1,
        message: 'Scion local Gemma 4 is ready.',
        metadata,
        adapter: { mode: 'base-only', active: false, id: null, manifestSha256: null },
      },
      onProgress,
    );
    return { runtime, status: cloneStatus() };
  })()
    .catch(async (error) => {
      try {
        await loadingRuntime?.exit?.();
      } catch {
        // Preserve the original load failure.
      }
      loadingRuntime = null;
      runtime = null;
      activeAdapter = null;
      pendingProbe = null;
      publish(
        { phase: 'error', progress: 0, message: 'Scion local Gemma 4 could not start.', error: error.message },
        onProgress,
      );
      throw error;
    })
    .finally(() => {
      loadPromise = null;
    });
  return loadPromise;
}

function requireReady() {
  if (status.phase === 'recovery-required') {
    throw runtimeError(
      'SCION_WLLAMA_RECOVERY_REQUIRED',
      'Scion blocked inference because exact base-only rollback was not proven. Unload and reload the runtime.',
    );
  }
  if (!isScionBrowserWllamaReady()) {
    throw runtimeError('SCION_WLLAMA_NOT_READY', 'Load Scion local Gemma 4 before generating.');
  }
  return runtime;
}

export async function completeScionBrowserWllama(
  messages,
  { maxNewTokens = 1024, temperature = 0, topK = 1, topP = 1, seed = 7, signal, onToken } = {},
) {
  const candidate = requireReady();
  const nPredict = Math.min(SCION_BROWSER_MAX_NEW_TOKENS, Math.max(1, Math.floor(maxNewTokens)));
  const prompt = formatScionGemma4Messages(messages);
  const output = await candidate.createCompletion(prompt, {
    nPredict,
    abortSignal: signal,
    onNewToken: typeof onToken === 'function' ? (_token, _piece, currentText) => onToken(currentText) : undefined,
    sampling: { temp: temperature, top_k: topK, top_p: topP, seed },
  });
  return String(output || '').trim();
}

function ggufAdapterFile(manifest, files) {
  if (manifest?.adapter?.format !== 'gguf-lora') {
    throw runtimeError('SCION_WLLAMA_ADAPTER_FORMAT', 'Scion WebGPU requires a GGUF LoRA adapter.');
  }
  const matches = (manifest.files || []).filter((file) => file.path.toLowerCase().endsWith('.gguf'));
  if (matches.length !== 1) {
    throw runtimeError('SCION_WLLAMA_ADAPTER_FILE', 'A Scion browser adapter must contain exactly one GGUF file.');
  }
  const bytes = files?.get(matches[0].path);
  if (!bytes) throw runtimeError('SCION_WLLAMA_ADAPTER_BYTES', 'The verified GGUF adapter bytes are missing.');
  return { descriptor: matches[0], bytes };
}

async function deterministicCanary() {
  return completeScionBrowserWllama(ACTIVATION_CANARY, { maxNewTokens: 64, temperature: 0, topK: 1, topP: 1 });
}

export async function applyScionBrowserWllamaAdapter({ adapterId, manifest, manifestSha256, files } = {}) {
  const candidate = requireReady();
  const { descriptor, bytes } = ggufAdapterFile(manifest, files);
  if ((await candidate.getLoraAdapterStatus())?.active) await candidate.clearLoraAdapter();
  const baseOutput = await deterministicCanary();
  const activation = await candidate.loadLoraAdapter(new Blob([bytes]), Number(manifest?.adapter?.scale || 1));
  if (
    activation?.active !== true ||
    activation?.metadata?.['general.type'] !== 'adapter' ||
    activation?.metadata?.['adapter.type'] !== 'lora' ||
    activation?.metadata?.['general.architecture'] !== 'gemma4'
  ) {
    await candidate.clearLoraAdapter();
    throw runtimeError('SCION_WLLAMA_ADAPTER_NATIVE_PROOF', 'Native runtime did not confirm a Gemma 4 LoRA adapter.');
  }
  activeAdapter = { adapterId, manifestSha256, descriptor, activation };
  pendingProbe = { adapterId, manifestSha256, baseOutput };
  publish({
    adapter: { mode: 'adapter-pending-proof', active: false, id: adapterId, manifestSha256 },
  });
  return { adapterActive: true, adapterId, native: activation };
}

export async function probeScionBrowserWllamaAdapter({ adapterId, manifestSha256, baseRevision } = {}) {
  const candidate = requireReady();
  const native = await candidate.getLoraAdapterStatus();
  const adapterOutput = await deterministicCanary();
  const matchesPending = pendingProbe?.adapterId === adapterId && pendingProbe?.manifestSha256 === manifestSha256;
  const outputChanged = matchesPending && adapterOutput !== pendingProbe.baseOutput;
  const payload = {
    runtimeId: SCION_BROWSER_WLLAMA_RUNTIME_ID,
    adapterId,
    manifestSha256,
    baseRevision,
    native,
    baseOutput: pendingProbe?.baseOutput || null,
    adapterOutput,
    outputChanged,
  };
  const proofSha256 = await sha256Hex(new TextEncoder().encode(JSON.stringify(payload)));
  const pass =
    matchesPending && native?.active === true && native?.metadata?.['general.type'] === 'adapter' && outputChanged;
  if (pass) {
    publish({ adapter: { mode: 'adapter-active', active: true, id: adapterId, manifestSha256, proofSha256 } });
  }
  return { pass, adapterActive: pass, adapterId, manifestSha256, baseRevision, proofSha256, outputChanged, native };
}

export async function rollbackScionBrowserWllamaAdapter() {
  const candidate = requireReady();
  const failedIdentity = activeAdapter || pendingProbe;
  const expectedBaseOutput = pendingProbe?.baseOutput || null;
  try {
    await candidate.clearLoraAdapter();
    const native = await candidate.getLoraAdapterStatus();
    const baseOutput = expectedBaseOutput == null ? null : await deterministicCanary();
    const restored = native?.active === false && (expectedBaseOutput == null || baseOutput === expectedBaseOutput);
    if (!restored) {
      throw runtimeError('SCION_WLLAMA_ROLLBACK', 'Scion could not prove restoration of base-only inference.');
    }
    activeAdapter = null;
    pendingProbe = null;
    publish({ adapter: { mode: 'base-only', active: false, id: null, manifestSha256: null } });
    return { restored: true, native, baseOutput };
  } catch (error) {
    activeAdapter = null;
    pendingProbe = null;
    publish({
      phase: 'recovery-required',
      progress: 0,
      message: 'Scion blocked inference until the local runtime is unloaded and reloaded.',
      error: error?.message || 'Exact base-only rollback was not proven.',
      adapter: {
        mode: 'recovery-required',
        active: null,
        id: failedIdentity?.adapterId || null,
        manifestSha256: failedIdentity?.manifestSha256 || null,
        nativeState: 'unknown',
      },
    });
    throw error;
  }
}

export async function unloadScionBrowserWllama() {
  if (loadingRuntime?.exit) await loadingRuntime.exit();
  if (runtime?.exit) await runtime.exit();
  loadingRuntime = null;
  runtime = null;
  runtimeModule = null;
  loadPromise = null;
  activeAdapter = null;
  pendingProbe = null;
  status = initialStatus();
  const snapshot = cloneStatus();
  for (const listener of statusListeners) {
    try {
      listener(snapshot);
    } catch {
      // A UI subscriber cannot corrupt model state.
    }
  }
}

export function getActiveScionBrowserWllamaAdapter() {
  return activeAdapter ? structuredClone(activeAdapter) : null;
}
