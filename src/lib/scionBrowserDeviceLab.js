import {
  activateInstalledScionAdapter,
  createScionAdapterIndexedDbStore,
  deactivateInstalledScionAdapter,
  installScionBrowserAdapter,
  removeInstalledScionAdapter,
  sha256Hex,
  verifyInstalledScionAdapter,
} from './scionAdapterRegistry';
import {
  applyScionBrowserWllamaAdapter,
  completeScionBrowserWllama,
  getScionBrowserWllamaStatus,
  loadScionBrowserWllama,
  probeScionBrowserWllamaAdapter,
  rollbackScionBrowserWllamaAdapter,
  unloadScionBrowserWllama,
} from './scionBrowserWllama';
import {
  SCION_BROWSER_GEMMA4_GGUF,
  SCION_BROWSER_GEMMA4_GGUF_URL,
  SCION_BROWSER_WLLAMA_MODULE_PATH,
  SCION_BROWSER_WLLAMA_RUNTIME_ID,
} from './scionBrowserConstants';

const DEVICE_PROMPT =
  'Return strict JSON only. Write one music-theory multiple-choice item about 4/4 meter with q, op containing exactly four options, ai, and ex. Add no other fields.';

let store = null;
let installedRecord = null;

function adapterStore() {
  store ||= createScionAdapterIndexedDbStore({ databaseName: 'scion-device-capture-adapters-v1' });
  return store;
}

function now() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function elapsed(startedAt) {
  return Math.max(1, Math.round(now() - startedAt));
}

async function outputReceipt(output, firstTokenMs, totalMs) {
  const text = String(output || '').trim();
  return {
    completed: true,
    validOutput: text.length >= 8,
    outputSha256: await sha256Hex(new TextEncoder().encode(text)),
    firstTokenMs: Math.max(1, Math.round(firstTokenMs)),
    totalMs: Math.max(1, Math.round(totalMs)),
    outputLength: text.length,
    output: text,
  };
}

export async function probeScionDeviceBrowser() {
  const gpuAdapter = await globalThis.navigator?.gpu?.requestAdapter?.();
  const gpu = gpuAdapter?.info || {};
  let highEntropy = {};
  try {
    highEntropy =
      (await globalThis.navigator?.userAgentData?.getHighEntropyValues?.([
        'architecture',
        'bitness',
        'fullVersionList',
        'model',
        'platformVersion',
      ])) || {};
  } catch {
    // The regular user agent still identifies the browser for the device receipt.
  }
  return {
    secureContext: globalThis.isSecureContext === true,
    crossOriginIsolated: globalThis.crossOriginIsolated === true,
    webgpu: Boolean(globalThis.navigator?.gpu && gpuAdapter),
    jspi: typeof globalThis.WebAssembly?.Suspending === 'function',
    userAgent: globalThis.navigator?.userAgent || '',
    userAgentData: highEntropy,
    hardwareConcurrency: globalThis.navigator?.hardwareConcurrency || null,
    deviceMemoryGiB: globalThis.navigator?.deviceMemory || null,
    gpu: {
      vendor: String(gpu.vendor || ''),
      architecture: String(gpu.architecture || ''),
      device: String(gpu.device || ''),
      description: String(gpu.description || ''),
    },
  };
}

export async function clearScionDeviceModelCache() {
  await unloadScionBrowserWllama();
  const moduleUrl = new URL(SCION_BROWSER_WLLAMA_MODULE_PATH, globalThis.location.href).href;
  const runtimeModule = await import(/* @vite-ignore */ moduleUrl);
  const manager = new runtimeModule.ModelManager();
  await manager.clear();
  return { cleared: true, modelUrl: SCION_BROWSER_GEMMA4_GGUF_URL };
}

export async function clearScionDeviceAdapterCache() {
  const currentStore = adapterStore();
  const records = await currentStore.listAdapters();
  for (const record of records) await currentStore.removeAdapter(record.adapterId);
  await currentStore.setActivationState({ mode: 'base-only', active: null, lastKnownGood: null, history: [] });
  installedRecord = null;
  return { cleared: true, adapterCount: records.length };
}

export async function abortScionDeviceBaseDownload({ abortAfterBytes = 8 * 1024 * 1024, contextSize = 2048 } = {}) {
  await unloadScionBrowserWllama();
  const controller = new AbortController();
  let observedBytes = 0;
  let observedProgress = 0;
  let abortRequested = false;
  const startedAt = now();
  try {
    await loadScionBrowserWllama({
      contextSize,
      signal: controller.signal,
      onProgress(snapshot) {
        observedProgress = Math.max(observedProgress, Number(snapshot.progress || 0));
        observedBytes = Math.floor(observedProgress * SCION_BROWSER_GEMMA4_GGUF.runtimeArtifact.bytes);
        if (!abortRequested && observedBytes >= abortAfterBytes) {
          abortRequested = true;
          controller.abort('scion-device-network-abort');
        }
      },
    });
    throw new Error('The model download completed before the required network abort was observed.');
  } catch (error) {
    if (!abortRequested || !controller.signal.aborted) throw error;
    return {
      completed: true,
      aborted: true,
      abortAfterBytes,
      observedBytes,
      observedProgress,
      durationMs: elapsed(startedAt),
      errorName: error?.name || null,
      errorCode: error?.code || null,
      errorMessage: error?.message || String(error),
    };
  } finally {
    await unloadScionBrowserWllama();
  }
}

export async function loadScionDeviceBase({ contextSize = 2048 } = {}) {
  const startedAt = now();
  let maximumProgress = 0;
  const progressEvents = [];
  const result = await loadScionBrowserWllama({
    contextSize,
    onProgress(snapshot) {
      const progress = Number(snapshot.progress || 0);
      maximumProgress = Math.max(maximumProgress, progress);
      if (progressEvents.length < 200) {
        progressEvents.push({ phase: snapshot.phase, progress, message: snapshot.message });
      }
    },
  });
  const status = getScionBrowserWllamaStatus();
  return {
    completed: status.phase === 'ready',
    durationMs: elapsed(startedAt),
    maximumProgress,
    progressEventCount: progressEvents.length,
    finalProgressEvent: progressEvents.at(-1) || null,
    runtimeMetadataArchitecture: status.metadata?.meta?.['general.architecture'] || null,
    runtimeMetadataType: status.metadata?.meta?.['general.type'] || null,
    webgpuActive: Boolean(result.runtime?.usingWebGPU?.()),
    status,
  };
}

export async function completeScionDevicePrompt({ prompt = DEVICE_PROMPT, maxNewTokens = 64, signal } = {}) {
  const startedAt = now();
  let firstTokenAt = null;
  const output = await completeScionBrowserWllama(prompt, {
    maxNewTokens,
    temperature: 0,
    topK: 1,
    topP: 1,
    seed: 7,
    signal,
    onToken() {
      firstTokenAt ??= now();
    },
  });
  const finishedAt = now();
  return outputReceipt(output, (firstTokenAt ?? finishedAt) - startedAt, finishedAt - startedAt);
}

export async function installScionDeviceAdapter({ manifestUrl, expectedManifestSha256 } = {}) {
  const startedAt = now();
  const progress = [];
  installedRecord = await installScionBrowserAdapter({
    manifestUrl,
    expectedManifestSha256,
    store: adapterStore(),
    requirePromoted: false,
    onProgress(entry) {
      if (progress.length < 300) progress.push(entry);
    },
  });
  const verification = await verifyInstalledScionAdapter({
    adapterId: installedRecord.adapterId,
    store: adapterStore(),
    requirePromoted: false,
  });
  return {
    completed: true,
    durationMs: elapsed(startedAt),
    adapterId: installedRecord.adapterId,
    manifestSha256: installedRecord.manifestSha256,
    totalBytes: installedRecord.totalBytes,
    progressEventCount: progress.length,
    downloadedBytes: Math.max(0, ...progress.map((entry) => Number(entry.downloadedBytes || 0))),
    cached: progress.some((entry) => entry.phase === 'cached'),
    verification: { valid: verification.valid, issues: verification.issues },
  };
}

export async function activateScionDeviceAdapter() {
  if (!installedRecord) throw new Error('Install the Scion device adapter before activation.');
  const startedAt = now();
  const manifest = installedRecord.manifest;
  const activation = await activateInstalledScionAdapter({
    adapterId: installedRecord.adapterId,
    runtimeId: SCION_BROWSER_WLLAMA_RUNTIME_ID,
    baseModelId: manifest.base.modelId,
    baseRevision: manifest.base.revision,
    store: adapterStore(),
    applyAdapter: applyScionBrowserWllamaAdapter,
    probeAdapter: probeScionBrowserWllamaAdapter,
    rollbackAdapter: rollbackScionBrowserWllamaAdapter,
    requirePromoted: false,
  });
  return { ...activation, durationMs: elapsed(startedAt) };
}

export async function deactivateScionDeviceAdapter() {
  const result = await deactivateInstalledScionAdapter({
    store: adapterStore(),
    rollbackAdapter: rollbackScionBrowserWllamaAdapter,
  });
  return { ...result, statusSnapshot: getScionBrowserWllamaStatus() };
}

export async function evictScionDeviceAdapter() {
  if (!installedRecord) throw new Error('Install the Scion device adapter before eviction.');
  const adapterId = installedRecord.adapterId;
  await removeInstalledScionAdapter({ adapterId, store: adapterStore() });
  installedRecord = null;
  return { completed: true, adapterId };
}

export async function digestScionDeviceProject(value) {
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  return sha256Hex(encoded);
}

export async function unloadScionDeviceBase() {
  await unloadScionBrowserWllama();
  return { completed: true, status: getScionBrowserWllamaStatus() };
}

export function snapshotScionDeviceRuntime() {
  return {
    capturedAt: new Date().toISOString(),
    modelUrl: SCION_BROWSER_GEMMA4_GGUF_URL,
    base: SCION_BROWSER_GEMMA4_GGUF,
    runtime: getScionBrowserWllamaStatus(),
    adapter: installedRecord
      ? {
          adapterId: installedRecord.adapterId,
          manifestSha256: installedRecord.manifestSha256,
          totalBytes: installedRecord.totalBytes,
        }
      : null,
  };
}

export const SCION_DEVICE_CAPTURE_PROMPT = DEVICE_PROMPT;
