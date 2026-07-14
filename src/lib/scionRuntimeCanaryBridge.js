export const SCION_RUNTIME_CANARY_QUERY = 'scion-runtime-canary';

const LOCAL_CANARY_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

export function isScionRuntimeCanaryLocation(locationLike = globalThis.location) {
  if (!LOCAL_CANARY_HOSTS.has(String(locationLike?.hostname || '').toLowerCase())) return false;
  try {
    return new URL(locationLike.href).searchParams.get(SCION_RUNTIME_CANARY_QUERY) === '1';
  } catch {
    return false;
  }
}

function selectCanaryApi(runtime) {
  async function runAdapterCanary({ manifestUrl, expectedManifestSha256, baseRevision, contextSize = 2048 } = {}) {
    if (!/^https?:\/\//.test(String(manifestUrl || ''))) throw new Error('Canary manifest URL is required');
    if (!/^[a-f0-9]{64}$/.test(String(expectedManifestSha256 || ''))) {
      throw new Error('Canary manifest SHA-256 is required');
    }
    const store = runtime.createScionAdapterMemoryStore();
    const record = await runtime.installScionBrowserAdapter({
      manifestUrl,
      expectedManifestSha256,
      store,
      requirePromoted: false,
    });
    const manifest = record.manifest;
    if (manifest.promotion?.status !== 'smoke' || manifest.promotion?.promotable !== false) {
      throw new Error('Browser canary accepts only an explicitly non-promotable smoke adapter');
    }
    const ggufFiles = manifest.files.filter((file) => file.path.toLowerCase().endsWith('.gguf'));
    if (ggufFiles.length !== 1) throw new Error('Browser canary requires exactly one GGUF adapter');
    const descriptor = ggufFiles[0];
    const verification = await runtime.verifyInstalledScionAdapter({
      adapterId: record.adapterId,
      store,
      requirePromoted: false,
    });
    if (!verification.valid) throw new Error(`Canary adapter cache invalid: ${verification.issues.join(', ')}`);

    await runtime.loadScionBrowserWllama({ contextSize });
    const before = runtime.getScionBrowserWllamaStatus();
    const activation = await runtime.activateInstalledScionAdapter({
      adapterId: manifest.adapter.id,
      runtimeId: 'scion-wllama-webgpu-jspi-v1',
      baseModelId: manifest.base.modelId,
      baseRevision,
      store,
      applyAdapter: runtime.applyScionBrowserWllamaAdapter,
      probeAdapter: runtime.probeScionBrowserWllamaAdapter,
      rollbackAdapter: runtime.rollbackScionBrowserWllamaAdapter,
      requirePromoted: false,
    });
    if (activation.status !== 'adapter-active' || activation.proof?.pass !== true) {
      throw new Error('Browser canary adapter did not reach verified active state');
    }
    const deactivation = await runtime.deactivateInstalledScionAdapter({
      store,
      rollbackAdapter: runtime.rollbackScionBrowserWllamaAdapter,
    });
    const proof = activation.proof;
    const rollback = deactivation.rollback;
    const after = runtime.getScionBrowserWllamaStatus();
    return {
      status: 'pass-mechanical-only',
      promotionEligible: false,
      adapterId: manifest.adapter.id,
      manifestSha256: record.manifestSha256,
      adapterSha256: descriptor.sha256,
      adapterBytes: descriptor.bytes,
      delivery: {
        mode: 'bounded-registry',
        streamed: true,
        registryVerified: true,
        atomicInstall: true,
        totalBytes: record.totalBytes,
        fileCount: record.files.length,
      },
      before,
      activation,
      proof,
      rollback,
      after,
    };
  }

  return Object.freeze({
    load: runtime.loadScionBrowserWllama,
    complete: runtime.completeScionBrowserWllama,
    applyAdapter: runtime.applyScionBrowserWllamaAdapter,
    probeAdapter: runtime.probeScionBrowserWllamaAdapter,
    rollbackAdapter: runtime.rollbackScionBrowserWllamaAdapter,
    unload: runtime.unloadScionBrowserWllama,
    status: runtime.getScionBrowserWllamaStatus,
    runAdapterCanary,
  });
}

function installDomCanaryTransport(api, documentLike = globalThis.document) {
  if (!documentLike?.documentElement) return;
  if (documentLike.getElementById('scion-runtime-canary-panel')) return;
  const panel = documentLike.createElement('section');
  panel.id = 'scion-runtime-canary-panel';
  panel.setAttribute('aria-label', 'Scion runtime canary');
  panel.style.cssText =
    'position:fixed;right:12px;bottom:12px;z-index:2147483647;width:360px;padding:12px;background:#111827;color:#f9fafb;border:1px solid #374151;border-radius:12px;font:12px/1.4 ui-monospace,monospace;box-shadow:0 12px 32px #0008';
  const heading = documentLike.createElement('strong');
  heading.textContent = 'Scion runtime canary · local only';
  heading.style.display = 'block';
  const command = documentLike.createElement('textarea');
  command.id = 'scion-runtime-canary-command';
  command.setAttribute('aria-label', 'Scion runtime canary command');
  command.style.cssText =
    'display:block;width:100%;height:72px;margin:8px 0;padding:6px;box-sizing:border-box;background:#030712;color:#d1fae5;border:1px solid #4b5563;border-radius:6px;font:inherit';
  const run = documentLike.createElement('button');
  run.type = 'button';
  run.textContent = 'Run Scion adapter canary';
  run.style.cssText =
    'padding:7px 10px;background:#10b981;color:#052e16;border:0;border-radius:6px;font:600 12px system-ui;cursor:pointer';
  const result = documentLike.createElement('pre');
  result.id = 'scion-runtime-canary-result';
  result.setAttribute('aria-live', 'polite');
  result.textContent = 'Idle';
  result.style.cssText = 'max-height:120px;overflow:auto;white-space:pre-wrap;margin:8px 0 0;color:#d1d5db';
  const ready = documentLike.createElement('meta');
  ready.id = 'scion-runtime-canary-ready';
  ready.setAttribute('content', 'ready');
  panel.append(heading, command, run, result, ready);
  documentLike.documentElement.append(panel);
  let busy = false;
  run.addEventListener('click', async () => {
    let request = {};
    try {
      request = JSON.parse(command.value || '{}');
    } catch (error) {
      result.textContent = JSON.stringify({ id: null, ok: false, error: error.message });
      return;
    }
    if (busy) {
      result.textContent = JSON.stringify({ id: request.id, ok: false, error: 'canary-busy' });
      return;
    }
    busy = true;
    run.disabled = true;
    result.textContent = JSON.stringify({ id: request.id, ok: null, status: 'running' });
    try {
      if (request.action !== 'run-adapter-canary') throw new Error(`Unknown canary action: ${request.action}`);
      const value = await api.runAdapterCanary(request.payload);
      result.textContent = JSON.stringify({ id: request.id, ok: true, value });
    } catch (error) {
      result.textContent = JSON.stringify({
        id: request.id,
        ok: false,
        error: error?.message || String(error),
        code: error?.code || null,
        details: error?.details || null,
      });
    } finally {
      busy = false;
      run.disabled = false;
      result.setAttribute('data-response-id', String(request.id || ''));
    }
  });
}

export function installScionRuntimeCanaryBridge({
  locationLike = globalThis.location,
  globalLike = globalThis,
  loadRuntime = async () => {
    const [browserRuntime, manifestRuntime, registryRuntime] = await Promise.all([
      import('./scionBrowserWllama'),
      import('./scionAdapterManifest'),
      import('./scionAdapterRegistry'),
    ]);
    return {
      ...browserRuntime,
      ...manifestRuntime,
      createScionAdapterMemoryStore: registryRuntime.createScionAdapterMemoryStore,
      installScionBrowserAdapter: registryRuntime.installScionBrowserAdapter,
      verifyInstalledScionAdapter: registryRuntime.verifyInstalledScionAdapter,
      activateInstalledScionAdapter: registryRuntime.activateInstalledScionAdapter,
      deactivateInstalledScionAdapter: registryRuntime.deactivateInstalledScionAdapter,
    };
  },
} = {}) {
  if (!isScionRuntimeCanaryLocation(locationLike)) return null;
  const ready = Promise.resolve()
    .then(loadRuntime)
    .then((runtime) => {
      const api = selectCanaryApi(runtime);
      Object.defineProperty(globalLike, '__scionRuntimeCanary', {
        value: api,
        configurable: true,
        enumerable: false,
        writable: false,
      });
      installDomCanaryTransport(api, globalLike.document);
      return api;
    });
  Object.defineProperty(globalLike, '__scionRuntimeCanaryReady', {
    value: ready,
    configurable: true,
    enumerable: false,
    writable: false,
  });
  return ready;
}
