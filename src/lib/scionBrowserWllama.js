import {
  SCION_BROWSER_GEMMA4_GGUF,
  SCION_BROWSER_GEMMA4_DOWNLOAD_LABEL,
  SCION_BROWSER_GEMMA4_GGUF_URL,
  SCION_BROWSER_MAX_NEW_TOKENS,
  SCION_BROWSER_WLLAMA_MODULE_PATH,
  SCION_BROWSER_WLLAMA_RUNTIME_ID,
  SCION_BROWSER_WLLAMA_WASM_PATH,
} from './scionBrowserConstants';
import { formatScionGemma4Messages } from './scionGemma4Prompt';
import { sha256Hex } from './scionAdapterRegistry';
import { normalizeScionAdapterTaskFamily, resolveScionAdapterTaskRoute } from './scionAdapterTaskScope';
import { requireScionLocalModelCapability } from './scionDeviceCapability';

const ACTIVATION_CANARY =
  'Return strict JSON only. Write one music-theory multiple-choice item about 4/4 meter with q, op containing exactly four options, ai, and ex. Add no other fields.';

let runtimeModule = null;
let runtime = null;
let loadingRuntime = null;
let loadPromise = null;
let loadAbortController = null;
let activeAdapter = null;
let pendingProbe = null;
let completionTail = Promise.resolve();
let runtimeLoadOptions = null;
const statusListeners = new Set();
const EXPECTED_WEBGPU_RUNTIME_WARNING_RE =
  /(?:multi-threads are not supported|missing paths to multi-thread build|falling back single-thread|disabling multi-threading when using webgpu backend)/i;
const SCION_MODEL_STORAGE_HEADROOM_BYTES = 512 * 1024 * 1024;
const SCION_MODEL_STORAGE_ERROR_RE =
  /(?:browser storage is full|quotaexceeded|not enough space|no space|4294967288|wrote -8 of)/i;
const SCION_MODEL_CACHE_ERROR_RE =
  /(?:model file not found|failed to open file|model may be invalid|cached \d+ bytes but expected|opfs worker: wrote|filesystemsyncaccesshandle.+failed to read)/i;
const SCION_MODEL_TRANSIENT_ACTIVATION_ERROR_RE =
  /(?:ggml_webgpu[^\n]*queue wait timed out|queue wait timed out after \d+\s*ms|webgpu[^\n]*(?:device lost|internal error))/i;

// wllama emits CPU-thread fallback warnings before it applies its WebGPU
// backend choice. Scion deliberately ships only the JSPI single-thread WASM
// because WebGPU disables CPU multithreading anyway. Filter those expected,
// non-actionable messages while preserving every other runtime warning/error.
const scionRuntimeLogger = {
  debug: () => {},
  log: (...args) => console.log(...args),
  info: (...args) => console.info(...args),
  warn: (...args) => {
    if (EXPECTED_WEBGPU_RUNTIME_WARNING_RE.test(args.map(String).join(' '))) return;
    console.warn(...args);
  },
  error: (...args) => console.error(...args),
};

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
    storage: null,
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

function errorMessage(error) {
  return String(error?.message || error || '');
}

function diagnosticMessage(error) {
  const messages = [];
  const visited = new Set();
  let current = error;
  while (current && !visited.has(current) && messages.length < 4) {
    visited.add(current);
    const message = errorMessage(current).trim();
    if (message && !messages.includes(message)) messages.push(message);
    current = current.cause;
  }
  return messages.join(' → ');
}

function abortError() {
  return new DOMException('Aborted', 'AbortError');
}

function forwardAbort(sourceSignal, targetController) {
  if (!sourceSignal || !targetController) return () => {};
  const abortTarget = () => targetController.abort(sourceSignal.reason);
  if (sourceSignal.aborted) abortTarget();
  else sourceSignal.addEventListener?.('abort', abortTarget, { once: true });
  return () => sourceSignal.removeEventListener?.('abort', abortTarget);
}

export function classifyScionBrowserModelLoadError(error) {
  const detail = diagnosticMessage(error);
  if (SCION_MODEL_STORAGE_ERROR_RE.test(detail)) {
    return {
      code: 'SCION_WLLAMA_STORAGE_FULL',
      kind: 'storage-full',
      clearCache: true,
      message:
        `Scion needs ${SCION_BROWSER_GEMMA4_DOWNLOAD_LABEL} of browser storage plus working space. ` +
        'Free at least 4 GB on this device, then try again. The incomplete model download was removed.',
    };
  }
  if (SCION_MODEL_CACHE_ERROR_RE.test(detail)) {
    return {
      code: 'SCION_WLLAMA_CACHE_INCOMPLETE',
      kind: 'cache-incomplete',
      clearCache: true,
      message: 'Scion removed an incomplete local model download. Try again to download a clean copy.',
    };
  }
  if (SCION_MODEL_TRANSIENT_ACTIVATION_ERROR_RE.test(detail)) {
    return {
      code: 'SCION_WLLAMA_ACTIVATION_TRANSIENT',
      kind: 'activation-transient',
      clearCache: false,
      message: 'Scion took longer than the WebGPU queue allowed while activating the downloaded model.',
    };
  }
  return {
    code: error?.code || 'SCION_WLLAMA_LOAD',
    kind: 'other',
    clearCache: false,
    message: detail || 'Scion local Gemma 4 could not start.',
  };
}

export async function estimateScionBrowserModelStorage(navigatorLike = globalThis.navigator) {
  try {
    const estimate = await navigatorLike?.storage?.estimate?.();
    const quota = Number(estimate?.quota);
    const usage = Number(estimate?.usage);
    if (!Number.isFinite(quota) || !Number.isFinite(usage)) return null;
    return {
      quota,
      usage,
      available: Math.max(0, quota - usage),
      required: SCION_BROWSER_GEMMA4_GGUF.browserDelivery.bytes + SCION_MODEL_STORAGE_HEADROOM_BYTES,
    };
  } catch {
    return null;
  }
}

async function clearCandidateModelCache(candidate) {
  try {
    await candidate?.modelManager?.clear?.();
    return true;
  } catch {
    try {
      await candidate?.cacheManager?.clear?.();
      return true;
    } catch {
      return false;
    }
  }
}

async function removeCandidateModelCache(candidate, modelUrl) {
  try {
    const models = (await candidate?.modelManager?.getModels?.({ includeInvalid: true })) || [];
    const model = models.find((entry) => entry?.url === modelUrl);
    if (model?.remove) {
      await model.remove();
      return true;
    }
  } catch {
    // Fall through to the runtime-owned cache. Scion currently stores only
    // the pinned public base in this namespace, so this remains app-scoped.
  }
  return clearCandidateModelCache(candidate);
}

async function hasCachedCandidateModel(candidate, modelUrl) {
  try {
    const models = (await candidate?.modelManager?.getModels?.()) || [];
    return models.some((model) => model?.url === modelUrl && model?.size > 0);
  } catch {
    // A split download without every metadata record makes ModelManager throw
    // while enumerating it. Remove that poisoned set before starting again.
    await clearCandidateModelCache(candidate);
    return false;
  }
}

function isFatalWllamaError(error, signal) {
  // Only the caller's signal means the user actually stopped the course.
  // llama.cpp can also surface an AbortError when its worker stops internally
  // (sometimes with an empty message). Treat that as a recoverable runtime
  // failure so the cached model is restarted instead of canceling every
  // lesson queued behind the failed completion.
  if (signal?.aborted) return false;
  if (error?.name === 'AbortError') return true;
  return /(?:received abort signal from llama\.cpp|cannot find waiting task with callbackid|null function|runtimeerror:\s*unreachable)/i.test(
    String(error?.message || error || ''),
  );
}

function enqueueCompletion(task, signal) {
  const previous = completionTail.catch(() => {});
  let release;
  completionTail = new Promise((resolve) => {
    release = resolve;
  });
  return (async () => {
    await previous;
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    try {
      return await task();
    } finally {
      release();
    }
  })();
}

async function exitRuntime(candidate) {
  try {
    await candidate?.exit?.();
  } catch {
    // A dead llama.cpp worker may reject its own exit request. State is still
    // cleared below so later calls cannot reuse it.
  }
}

function absoluteAsset(path, locationLike) {
  if (!locationLike?.href) throw runtimeError('SCION_WLLAMA_LOCATION', 'Scion runtime requires a page URL.');
  return new URL(path, locationLike.href).href;
}

async function defaultRuntimeLoader(moduleUrl) {
  return import(/* @vite-ignore */ moduleUrl);
}

function createRuntimeCandidate(Wllama, wasmUrl) {
  return new Wllama(
    { 'jspi/single-thread/wllama.wasm': wasmUrl },
    {
      backend: 'webgpu',
      // Preserve native load errors. The logger already filters the expected
      // single-thread WebGPU warnings, so suppressing every native message
      // only hides the cause of a real activation failure.
      suppressNativeLog: false,
      logger: scionRuntimeLogger,
      // The pinned runtime gives all shard workers one abort boundary and
      // settles them before cleanup, so parallel transfer stays both fast
      // and atomic.
      parallelDownloads: 3,
    },
  );
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
  if (signal?.aborted) throw abortError();
  runtimeLoadOptions = { runtimeLoader, navigatorLike, globalLike, locationLike, modelUrl, contextSize };
  if (status.phase === 'recovery-required') {
    throw runtimeError(
      'SCION_WLLAMA_RECOVERY_REQUIRED',
      'Unload the quarantined Scion runtime before loading the public base again.',
    );
  }
  if (isScionBrowserWllamaReady()) return { runtime, status: cloneStatus() };
  if (loadPromise) {
    const stopForwarding = forwardAbort(signal, loadAbortController);
    return loadPromise.finally(stopForwarding);
  }
  await requireScionLocalModelCapability({ navigatorLike, globalLike });

  const controller = new AbortController();
  loadAbortController = controller;
  const stopForwarding = forwardAbort(signal, controller);
  const loadSignal = controller.signal;

  loadPromise = (async () => {
    if (loadSignal.aborted) throw abortError();
    publish(
      { phase: 'loading-runtime', progress: 0, message: 'Loading the pinned Scion WebGPU runtime…', error: null },
      onProgress,
    );
    const moduleUrl = absoluteAsset(SCION_BROWSER_WLLAMA_MODULE_PATH, locationLike);
    runtimeModule ||= validateRuntimeModule(await runtimeLoader(moduleUrl));
    const wasmUrl = absoluteAsset(SCION_BROWSER_WLLAMA_WASM_PATH, locationLike);
    let candidate = createRuntimeCandidate(runtimeModule.Wllama, wasmUrl);
    loadingRuntime = candidate;
    let cachedModel = await hasCachedCandidateModel(candidate, modelUrl);
    const storage = await estimateScionBrowserModelStorage(navigatorLike);
    publish({ storage }, onProgress);
    if (!cachedModel && storage && storage.available < storage.required) {
      await clearCandidateModelCache(candidate);
      throw runtimeError(
        'SCION_WLLAMA_STORAGE_FULL',
        `Scion needs ${SCION_BROWSER_GEMMA4_DOWNLOAD_LABEL} of browser storage plus working space. ` +
          'Free at least 4 GB on this device, then try again.',
      );
    }
    let repairedCache = false;
    let restartedActivation = false;
    let cleanRedownload = false;
    for (;;) {
      publish(
        {
          phase: 'loading-model',
          message: cachedModel
            ? 'Preparing Scion from this device…'
            : cleanRedownload
              ? 'Downloading a clean copy of the public Gemma 4 base…'
              : 'Downloading the public Gemma 4 base…',
        },
        onProgress,
      );
      try {
        await candidate.loadModelFromUrl(modelUrl, {
          useCache: true,
          n_ctx: contextSize,
          n_threads: 1,
          seed: 424242,
          signal: loadSignal,
          progressCallback: ({ loaded, total }) => {
            const progress = total > 0 ? Math.min(1, Math.max(0, loaded / total)) : status.progress;
            publish(
              {
                phase: 'loading-model',
                progress,
                message:
                  total > 0
                    ? progress >= 1
                      ? 'Download complete · activating Scion…'
                      : cleanRedownload
                        ? `Downloading a clean copy of the public Gemma 4 base (${Math.floor(progress * 100)}%)…`
                        : `Downloading the public Gemma 4 base (${Math.floor(progress * 100)}%)…`
                    : status.message,
              },
              onProgress,
            );
          },
        });
        break;
      } catch (error) {
        if (loadSignal.aborted) {
          await exitRuntime(candidate);
          if (loadingRuntime === candidate) loadingRuntime = null;
          throw abortError();
        }
        const classified = classifyScionBrowserModelLoadError(error);
        const canRepair = classified.kind === 'cache-incomplete' && cachedModel && !repairedCache;
        const canRestartActivation = classified.kind === 'activation-transient' && !restartedActivation;
        if (!canRepair && !canRestartActivation) {
          await exitRuntime(candidate);
          if (classified.clearCache) await removeCandidateModelCache(candidate, modelUrl);
          if (loadingRuntime === candidate) loadingRuntime = null;
          throw runtimeError(classified.code, classified.message, error);
        }

        if (canRestartActivation) {
          restartedActivation = true;
          publish(
            {
              phase: 'restarting-activation',
              progress: status.progress,
              message: 'Scion is still responsive · restarting activation from the downloaded model once…',
              error: null,
            },
            onProgress,
          );
          await exitRuntime(candidate);
          candidate = createRuntimeCandidate(runtimeModule.Wllama, wasmUrl);
          loadingRuntime = candidate;
          cachedModel = await hasCachedCandidateModel(candidate, modelUrl);
        } else {
          repairedCache = true;
          publish(
            {
              phase: 'repairing-cache',
              progress: status.progress,
              message: 'The saved model copy is incomplete · replacing it once…',
              error: null,
            },
            onProgress,
          );
          await exitRuntime(candidate);
          await removeCandidateModelCache(candidate, modelUrl);
          candidate = createRuntimeCandidate(runtimeModule.Wllama, wasmUrl);
          loadingRuntime = candidate;
          cachedModel = false;
          cleanRedownload = true;
        }
      }
    }
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
      if (loadSignal.aborted || error?.name === 'AbortError') {
        publish(
          {
            phase: 'idle',
            progress: 0,
            message: 'Scion model download stopped. Start the build to resume it.',
            error: null,
          },
          onProgress,
        );
        throw abortError();
      }
      const diagnostic = diagnosticMessage(error);
      if (diagnostic) {
        console.error('[Scion runtime] Local model activation failed', {
          code: error?.code || 'SCION_WLLAMA_LOAD',
          diagnostic,
        });
      }
      publish(
        {
          phase: 'error',
          progress: status.progress,
          message: 'Scion local Gemma 4 could not start.',
          error: error.message,
          diagnostic,
        },
        onProgress,
      );
      throw error;
    })
    .finally(() => {
      stopForwarding();
      if (loadAbortController === controller) loadAbortController = null;
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
  {
    maxNewTokens = 1024,
    temperature = 0,
    topK = 1,
    topP = 1,
    seed = 7,
    signal,
    onToken,
    taskFamily,
    promptProtocol,
    onAdapterRoute,
  } = {},
) {
  const completeRouted = async () => {
    const route = await prepareAdapterRoute(taskFamily, promptProtocol);
    if (typeof onAdapterRoute === 'function') {
      try {
        onAdapterRoute(route);
      } catch {
        // Route telemetry cannot alter inference state.
      }
    }
    return completeRaw(messages, { maxNewTokens, temperature, topK, topP, seed, signal, onToken });
  };

  return enqueueCompletion(async () => {
    try {
      return await completeRouted();
    } catch (error) {
      if (!isFatalWllamaError(error, signal)) throw error;
      if (activeAdapter) {
        return quarantineAdapterRuntime(
          runtimeError(
            'SCION_WLLAMA_ADAPTER_RUNTIME_STOPPED',
            'Scion stopped while an adapter was active. Reload before using the adapter again.',
            error,
          ),
        );
      }

      const failedRuntime = runtime;
      runtime = null;
      loadingRuntime = null;
      loadPromise = null;
      pendingProbe = null;
      publish({
        phase: 'recovering',
        progress: 0,
        message: 'Scion stopped locally · restarting from the cached model…',
        error: null,
      });
      await exitRuntime(failedRuntime);
      await loadScionBrowserWllama({ ...(runtimeLoadOptions || {}), signal });

      try {
        return await completeRouted();
      } catch (retryError) {
        if (!isFatalWllamaError(retryError, signal)) throw retryError;
        await exitRuntime(runtime);
        runtime = null;
        activeAdapter = null;
        pendingProbe = null;
        publish({
          phase: 'recovery-required',
          progress: 0,
          message: 'Scion paused after two local model stops. Reload the page to restart safely.',
          error: null,
          adapter: { mode: 'base-only', active: false, id: null, manifestSha256: null },
        });
        throw runtimeError(
          'SCION_WLLAMA_RUNTIME_UNSTABLE',
          'Scion paused after two local model stops. Reload the page to restart safely.',
          retryError,
        );
      }
    }
  }, signal);
}

async function completeRaw(
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
  return completeRaw(ACTIVATION_CANARY, { maxNewTokens: 64, temperature: 0, topK: 1, topP: 1 });
}

function validNativeAdapter(native) {
  return (
    native?.active === true &&
    native?.metadata?.['general.type'] === 'adapter' &&
    native?.metadata?.['adapter.type'] === 'lora' &&
    native?.metadata?.['general.architecture'] === 'gemma4'
  );
}

function routeReceipt(route, nativeAdapterActive) {
  return {
    protocol: 'scion-adapter-runtime-route-v1',
    mode: route.mode,
    taskFamily: route.taskFamily,
    reason: route.reason,
    promptProtocol: route.promptProtocol || null,
    expectedPromptProtocol: route.expectedPromptProtocol || null,
    adapterId: activeAdapter?.adapterId || null,
    manifestSha256: activeAdapter?.manifestSha256 || null,
    scopeIdentitySha256: route.scopeIdentitySha256 || null,
    nativeAdapterActive,
  };
}

async function quarantineAdapterRuntime(error, failedIdentity = activeAdapter || pendingProbe) {
  activeAdapter = null;
  pendingProbe = null;
  runtimeLoadOptions = null;
  publish({
    phase: 'recovery-required',
    progress: 0,
    message: 'Scion blocked inference until the local runtime is unloaded and reloaded.',
    error: error?.message || 'Exact base-only routing was not proven.',
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

async function prepareAdapterRoute(taskFamily, promptProtocol) {
  const candidate = requireReady();
  if (!activeAdapter) {
    const native = await candidate.getLoraAdapterStatus();
    if (native?.active) {
      return quarantineAdapterRuntime(
        runtimeError(
          'SCION_WLLAMA_UNBOUND_ADAPTER',
          'Scion found a native adapter without a verified installed identity.',
        ),
      );
    }
    return routeReceipt(
      {
        mode: 'base-only',
        taskFamily: normalizeScionAdapterTaskFamily(taskFamily),
        reason: 'no-adapter-installed',
        promptProtocol: promptProtocol || null,
      },
      false,
    );
  }
  if (status.adapter?.mode === 'adapter-pending-proof') {
    throw runtimeError(
      'SCION_WLLAMA_ADAPTER_NOT_PROVEN',
      'Scion blocked the adapter until its activation proof passes.',
    );
  }
  const route = resolveScionAdapterTaskRoute({ manifest: activeAdapter.manifest, taskFamily, promptProtocol });
  try {
    const native = await candidate.getLoraAdapterStatus();
    if (route.mode === 'adapter') {
      if (!native?.active) {
        const activation = await candidate.loadLoraAdapter(
          new Blob([activeAdapter.bytes]),
          Number(activeAdapter.manifest?.adapter?.scale || 1),
        );
        if (!validNativeAdapter(activation)) {
          throw runtimeError(
            'SCION_WLLAMA_ADAPTER_ROUTE_PROOF',
            'Native runtime did not restore the verified Scion adapter for this task.',
          );
        }
      } else if (!validNativeAdapter(native)) {
        throw runtimeError('SCION_WLLAMA_ADAPTER_ROUTE_PROOF', 'Native runtime reported an invalid adapter state.');
      }
      publish({
        adapter: {
          ...status.adapter,
          mode: 'adapter-scoped',
          active: true,
          nativeActive: true,
          lastRoute: { taskFamily: route.taskFamily, mode: route.mode, reason: route.reason },
        },
      });
      return routeReceipt(route, true);
    }
    if (native?.active) {
      await candidate.clearLoraAdapter();
      const cleared = await candidate.getLoraAdapterStatus();
      const baseOutput = await deterministicCanary();
      if (cleared?.active !== false || baseOutput !== activeAdapter.baseOutput) {
        throw runtimeError(
          'SCION_WLLAMA_BASE_ROUTE_PROOF',
          'Scion could not prove exact base-only inference for an out-of-scope task.',
        );
      }
    }
    publish({
      adapter: {
        ...status.adapter,
        mode: 'adapter-scoped',
        active: true,
        nativeActive: false,
        lastRoute: { taskFamily: route.taskFamily, mode: route.mode, reason: route.reason },
      },
    });
    return routeReceipt(route, false);
  } catch (error) {
    return quarantineAdapterRuntime(error);
  }
}

/**
 * Resolve and prepare an inference route before prompt construction. The
 * local provider uses this receipt to choose the small fact-ledger prompt
 * when a verified grounded adapter can own the following kernel pass.
 */
export async function prepareScionBrowserWllamaTaskRoute({ taskFamily, promptProtocol } = {}) {
  return prepareAdapterRoute(taskFamily, promptProtocol);
}

export async function applyScionBrowserWllamaAdapter({ adapterId, manifest, manifestSha256, files } = {}) {
  const candidate = requireReady();
  const { descriptor, bytes } = ggufAdapterFile(manifest, files);
  if ((await candidate.getLoraAdapterStatus())?.active) await candidate.clearLoraAdapter();
  const baseOutput = await deterministicCanary();
  const activation = await candidate.loadLoraAdapter(new Blob([bytes]), Number(manifest?.adapter?.scale || 1));
  if (!validNativeAdapter(activation)) {
    await candidate.clearLoraAdapter();
    throw runtimeError('SCION_WLLAMA_ADAPTER_NATIVE_PROOF', 'Native runtime did not confirm a Gemma 4 LoRA adapter.');
  }
  activeAdapter = { adapterId, manifestSha256, descriptor, activation, manifest, bytes, baseOutput };
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
    return quarantineAdapterRuntime(error, failedIdentity);
  }
}

export async function unloadScionBrowserWllama() {
  loadAbortController?.abort('scion-runtime-unload');
  await exitRuntime(loadingRuntime);
  if (runtime !== loadingRuntime) await exitRuntime(runtime);
  loadingRuntime = null;
  runtime = null;
  runtimeModule = null;
  loadPromise = null;
  loadAbortController = null;
  activeAdapter = null;
  pendingProbe = null;
  runtimeLoadOptions = null;
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
  if (!activeAdapter) return null;
  const { bytes: _bytes, manifest: _manifest, baseOutput: _baseOutput, ...publicState } = activeAdapter;
  return structuredClone(publicState);
}
