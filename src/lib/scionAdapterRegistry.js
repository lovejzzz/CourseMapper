import { resolveScionAdapterRuntime, validateScionAdapterManifest } from './scionAdapterManifest';

export const SCION_ADAPTER_DATABASE_NAME = 'scion-adapters-v1';
export const SCION_ADAPTER_DATABASE_VERSION = 1;
export const SCION_ADAPTER_MAX_TOTAL_BYTES = 256 * 1024 * 1024;
export const SCION_ADAPTER_MAX_FILES = 16;

const SHA256_RE = /^[a-f0-9]{64}$/;

function clean(value) {
  return String(value ?? '').trim();
}

function createRegistryError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function asUint8Array(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw createRegistryError('SCION_ADAPTER_BYTES', 'Adapter content must be binary data.');
}

export async function sha256Hex(value, cryptoLike = globalThis.crypto) {
  if (!cryptoLike?.subtle?.digest) {
    throw createRegistryError('SCION_CRYPTO_UNAVAILABLE', 'Web Crypto is required to verify Scion adapters.');
  }
  const bytes = asUint8Array(value);
  const digest = await cryptoLike.subtle.digest(
    'SHA-256',
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function cloneBinary(value) {
  const bytes = asUint8Array(value);
  return bytes.slice().buffer;
}

function defaultActivationState() {
  return { mode: 'base-only', active: null, lastKnownGood: null, history: [] };
}

export function createScionAdapterMemoryStore() {
  const adapters = new Map();
  const files = new Map();
  let activationState = defaultActivationState();
  return {
    async commitAdapter(record, fileEntries) {
      const nextFiles = new Map(files);
      const previous = adapters.get(record.adapterId);
      for (const file of previous?.files || []) nextFiles.delete(file.storageKey);
      for (const entry of fileEntries) nextFiles.set(entry.storageKey, cloneBinary(entry.bytes));
      adapters.set(record.adapterId, structuredClone(record));
      files.clear();
      for (const [key, value] of nextFiles) files.set(key, value);
    },
    async getAdapter(adapterId) {
      const record = adapters.get(adapterId);
      return record ? structuredClone(record) : null;
    },
    async listAdapters() {
      return [...adapters.values()].map((record) => structuredClone(record));
    },
    async getFile(storageKey) {
      const value = files.get(storageKey);
      return value ? cloneBinary(value) : null;
    },
    async removeAdapter(adapterId) {
      const record = adapters.get(adapterId);
      for (const file of record?.files || []) files.delete(file.storageKey);
      adapters.delete(adapterId);
    },
    async getActivationState() {
      return structuredClone(activationState);
    },
    async setActivationState(nextState) {
      activationState = structuredClone(nextState);
    },
  };
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed.'));
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted.'));
  });
}

export function createScionAdapterIndexedDbStore({
  indexedDb = globalThis.indexedDB,
  databaseName = SCION_ADAPTER_DATABASE_NAME,
} = {}) {
  if (!indexedDb?.open) {
    throw createRegistryError('SCION_INDEXEDDB_UNAVAILABLE', 'IndexedDB is required to cache Scion adapters.');
  }
  let databasePromise = null;
  const openDatabase = () => {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDb.open(databaseName, SCION_ADAPTER_DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains('adapters'))
          database.createObjectStore('adapters', { keyPath: 'adapterId' });
        if (!database.objectStoreNames.contains('files'))
          database.createObjectStore('files', { keyPath: 'storageKey' });
        if (!database.objectStoreNames.contains('state')) database.createObjectStore('state', { keyPath: 'key' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Unable to open the Scion adapter database.'));
      request.onblocked = () =>
        reject(createRegistryError('SCION_INDEXEDDB_BLOCKED', 'Scion adapter database upgrade was blocked.'));
    }).catch((error) => {
      databasePromise = null;
      throw error;
    });
    return databasePromise;
  };

  return {
    async commitAdapter(record, fileEntries) {
      const previous = await this.getAdapter(record.adapterId);
      const database = await openDatabase();
      const transaction = database.transaction(['adapters', 'files'], 'readwrite');
      const fileStore = transaction.objectStore('files');
      for (const file of previous?.files || []) fileStore.delete(file.storageKey);
      for (const entry of fileEntries) {
        fileStore.put({ storageKey: entry.storageKey, bytes: cloneBinary(entry.bytes) });
      }
      transaction.objectStore('adapters').put(structuredClone(record));
      await transactionDone(transaction);
    },
    async getAdapter(adapterId) {
      const database = await openDatabase();
      const transaction = database.transaction('adapters', 'readonly');
      const done = transactionDone(transaction);
      const result = await requestResult(transaction.objectStore('adapters').get(adapterId));
      await done;
      return result || null;
    },
    async listAdapters() {
      const database = await openDatabase();
      const transaction = database.transaction('adapters', 'readonly');
      const done = transactionDone(transaction);
      const result = await requestResult(transaction.objectStore('adapters').getAll());
      await done;
      return result || [];
    },
    async getFile(storageKey) {
      const database = await openDatabase();
      const transaction = database.transaction('files', 'readonly');
      const done = transactionDone(transaction);
      const result = await requestResult(transaction.objectStore('files').get(storageKey));
      await done;
      return result?.bytes || null;
    },
    async removeAdapter(adapterId) {
      const record = await this.getAdapter(adapterId);
      if (!record) return;
      const database = await openDatabase();
      const transaction = database.transaction(['adapters', 'files'], 'readwrite');
      transaction.objectStore('adapters').delete(adapterId);
      const fileStore = transaction.objectStore('files');
      for (const file of record.files || []) fileStore.delete(file.storageKey);
      await transactionDone(transaction);
    },
    async getActivationState() {
      const database = await openDatabase();
      const transaction = database.transaction('state', 'readonly');
      const done = transactionDone(transaction);
      const result = await requestResult(transaction.objectStore('state').get('activation'));
      await done;
      return result?.value || defaultActivationState();
    },
    async setActivationState(nextState) {
      const database = await openDatabase();
      const transaction = database.transaction('state', 'readwrite');
      transaction.objectStore('state').put({ key: 'activation', value: structuredClone(nextState) });
      await transactionDone(transaction);
    },
  };
}

async function fetchBinary(fetchImpl, url) {
  const response = await fetchImpl(url, { cache: 'no-store', credentials: 'omit' });
  if (!response?.ok)
    throw createRegistryError('SCION_ADAPTER_DOWNLOAD', `HTTP ${response?.status || 'unknown'} for ${url}`);
  return response.arrayBuffer();
}

function requireSecureManifestUrl(manifestUrl) {
  let url;
  try {
    url = new URL(manifestUrl, globalThis.location?.href);
  } catch {
    throw createRegistryError('SCION_ADAPTER_URL', 'Scion adapter manifest URL is invalid.');
  }
  if (!['https:', 'http:'].includes(url.protocol) || (url.protocol === 'http:' && url.hostname !== 'localhost')) {
    throw createRegistryError('SCION_ADAPTER_URL', 'Scion adapters require HTTPS, except on localhost.');
  }
  if (url.username || url.password)
    throw createRegistryError('SCION_ADAPTER_URL', 'Adapter URLs cannot contain credentials.');
  return url;
}

function adapterFiles(manifest) {
  const files = Array.isArray(manifest?.files) ? manifest.files : [];
  if (files.length > SCION_ADAPTER_MAX_FILES) {
    throw createRegistryError(
      'SCION_ADAPTER_FILE_LIMIT',
      `Scion adapters may contain at most ${SCION_ADAPTER_MAX_FILES} files.`,
    );
  }
  const totalBytes = files.reduce((sum, file) => sum + Number(file?.bytes || 0), 0);
  if (totalBytes > SCION_ADAPTER_MAX_TOTAL_BYTES) {
    throw createRegistryError(
      'SCION_ADAPTER_SIZE_LIMIT',
      `Scion adapter exceeds the ${SCION_ADAPTER_MAX_TOTAL_BYTES}-byte browser limit.`,
    );
  }
  return { files, totalBytes };
}

function publishProgress(onProgress, progress) {
  if (typeof onProgress !== 'function') return;
  try {
    onProgress(progress);
  } catch {
    // UI observers must not be able to corrupt an adapter transaction.
  }
}

export async function installScionBrowserAdapter({
  manifestUrl,
  expectedManifestSha256,
  store,
  fetchImpl = globalThis.fetch,
  cryptoLike = globalThis.crypto,
  requirePromoted = true,
  onProgress,
} = {}) {
  if (!SHA256_RE.test(clean(expectedManifestSha256))) {
    throw createRegistryError('SCION_ADAPTER_MANIFEST_HASH', 'A trusted manifest SHA-256 is required.');
  }
  if (typeof fetchImpl !== 'function') throw createRegistryError('SCION_ADAPTER_FETCH', 'Fetch is unavailable.');
  const adapterStore = store || createScionAdapterIndexedDbStore();
  const manifestLocation = requireSecureManifestUrl(manifestUrl);
  const manifestBytes = await fetchBinary(fetchImpl, manifestLocation.href);
  const manifestSha256 = await sha256Hex(manifestBytes, cryptoLike);
  if (manifestSha256 !== expectedManifestSha256) {
    throw createRegistryError('SCION_ADAPTER_MANIFEST_HASH', 'Scion adapter manifest digest does not match.', {
      expectedSha256: expectedManifestSha256,
      actualSha256: manifestSha256,
    });
  }
  let manifest;
  try {
    manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
  } catch {
    throw createRegistryError('SCION_ADAPTER_MANIFEST_JSON', 'Scion adapter manifest is not valid JSON.');
  }
  const validation = validateScionAdapterManifest(manifest, { requirePromoted });
  if (!validation.valid) {
    throw createRegistryError('SCION_ADAPTER_MANIFEST_INVALID', 'Scion adapter manifest failed validation.', {
      issues: validation.issues,
    });
  }
  const { files, totalBytes } = adapterFiles(manifest);
  const stagedFiles = [];
  let downloadedBytes = 0;
  for (const file of files) {
    const fileUrl = new URL(file.path, manifestLocation);
    const bytes = await fetchBinary(fetchImpl, fileUrl.href);
    const actualBytes = asUint8Array(bytes).byteLength;
    const actualSha256 = await sha256Hex(bytes, cryptoLike);
    if (actualBytes !== file.bytes || actualSha256 !== file.sha256) {
      throw createRegistryError(
        'SCION_ADAPTER_FILE_INTEGRITY',
        `Scion adapter file failed verification: ${file.path}`,
        {
          path: file.path,
          expectedBytes: file.bytes,
          actualBytes,
          expectedSha256: file.sha256,
          actualSha256,
        },
      );
    }
    downloadedBytes += actualBytes;
    stagedFiles.push({
      storageKey: `${manifestSha256}:${file.path}`,
      path: file.path,
      bytes,
    });
    publishProgress(onProgress, {
      phase: 'downloading',
      adapterId: manifest.adapter.id,
      path: file.path,
      downloadedBytes,
      totalBytes,
      progress: totalBytes > 0 ? downloadedBytes / totalBytes : 1,
    });
  }

  const installedAt = new Date().toISOString();
  const record = {
    adapterId: manifest.adapter.id,
    scionVersion: manifest.adapter.scionVersion,
    manifest,
    manifestSha256,
    manifestUrl: manifestLocation.href,
    installedAt,
    totalBytes,
    files: stagedFiles.map(({ storageKey, path }) => ({ storageKey, path })),
    state: 'installed',
  };
  await adapterStore.commitAdapter(record, stagedFiles);
  publishProgress(onProgress, {
    phase: 'installed',
    adapterId: record.adapterId,
    downloadedBytes,
    totalBytes,
    progress: 1,
  });
  return structuredClone(record);
}

export async function verifyInstalledScionAdapter({ adapterId, store, cryptoLike = globalThis.crypto } = {}) {
  const adapterStore = store || createScionAdapterIndexedDbStore();
  const record = await adapterStore.getAdapter(adapterId);
  if (!record) throw createRegistryError('SCION_ADAPTER_NOT_INSTALLED', `Scion adapter is not installed: ${adapterId}`);
  const issues = [];
  for (const expected of record.manifest.files || []) {
    const reference = record.files.find((file) => file.path === expected.path);
    const bytes = reference ? await adapterStore.getFile(reference.storageKey) : null;
    if (!bytes) {
      issues.push(`cached-file-missing:${expected.path}`);
      continue;
    }
    const actualBytes = asUint8Array(bytes).byteLength;
    const actualSha256 = await sha256Hex(bytes, cryptoLike);
    if (actualBytes !== expected.bytes) issues.push(`cached-file-bytes:${expected.path}`);
    if (actualSha256 !== expected.sha256) issues.push(`cached-file-sha256:${expected.path}`);
  }
  return { valid: issues.length === 0, adapterId, manifestSha256: record.manifestSha256, issues, record };
}

function validActivationProof(proof, record, baseRevision) {
  return (
    proof?.pass === true &&
    proof?.adapterActive === true &&
    proof?.adapterId === record.adapterId &&
    proof?.manifestSha256 === record.manifestSha256 &&
    proof?.baseRevision === baseRevision &&
    SHA256_RE.test(clean(proof?.proofSha256))
  );
}

export async function activateInstalledScionAdapter({
  adapterId,
  runtimeId,
  baseModelId,
  baseRevision,
  store,
  cryptoLike = globalThis.crypto,
  applyAdapter,
  probeAdapter,
  rollbackAdapter,
} = {}) {
  const adapterStore = store || createScionAdapterIndexedDbStore();
  const verification = await verifyInstalledScionAdapter({ adapterId, store: adapterStore, cryptoLike });
  if (!verification.valid) {
    throw createRegistryError('SCION_ADAPTER_CACHE_INTEGRITY', 'Cached Scion adapter failed verification.', {
      issues: verification.issues,
    });
  }
  const record = verification.record;
  const resolution = resolveScionAdapterRuntime({
    manifest: record.manifest,
    runtimeId,
    baseModelId,
    baseRevision,
    requirePromoted: true,
  });
  if (resolution.mode !== 'adapter-ready') {
    return {
      status: resolution.mode === 'base-only' ? 'base-only' : 'unsupported',
      adapterActive: false,
      adapterId,
      resolution,
    };
  }
  if (typeof applyAdapter !== 'function' || typeof probeAdapter !== 'function') {
    throw createRegistryError(
      'SCION_ADAPTER_ACTIVATOR_REQUIRED',
      'Adapter-capable runtimes must provide application and proof callbacks.',
    );
  }

  const previousState = await adapterStore.getActivationState();
  const fileMap = new Map();
  for (const file of record.files) fileMap.set(file.path, await adapterStore.getFile(file.storageKey));
  let applicationStarted = false;
  try {
    applicationStarted = true;
    const applied = await applyAdapter({
      adapterId,
      manifest: structuredClone(record.manifest),
      manifestSha256: record.manifestSha256,
      files: fileMap,
      baseModelId,
      baseRevision,
    });
    if (applied?.adapterActive !== true || applied?.adapterId !== adapterId) {
      throw createRegistryError('SCION_ADAPTER_APPLY_PROOF', 'Runtime did not confirm the requested adapter identity.');
    }
    const proof = await probeAdapter({
      adapterId,
      manifestSha256: record.manifestSha256,
      baseModelId,
      baseRevision,
      runtimeId,
    });
    if (!validActivationProof(proof, record, baseRevision)) {
      throw createRegistryError(
        'SCION_ADAPTER_PROBE_FAILED',
        'Adapter inference proof did not match the installed identity.',
      );
    }
    const active = {
      adapterId,
      scionVersion: record.scionVersion,
      manifestSha256: record.manifestSha256,
      runtimeId,
      baseModelId,
      baseRevision,
      proofSha256: proof.proofSha256,
      activatedAt: new Date().toISOString(),
    };
    const history = [active, ...(previousState.history || []).filter((entry) => entry.adapterId !== adapterId)].slice(
      0,
      5,
    );
    const nextState = { mode: 'adapter-active', active, lastKnownGood: active, history };
    await adapterStore.setActivationState(nextState);
    return { status: 'adapter-active', adapterActive: true, active, proof, resolution };
  } catch (error) {
    let rollbackSucceeded = false;
    if (applicationStarted && typeof rollbackAdapter === 'function') {
      try {
        await rollbackAdapter({ previousState: structuredClone(previousState), failedAdapterId: adapterId });
        rollbackSucceeded = true;
      } catch {
        rollbackSucceeded = false;
      }
    }
    if (!rollbackSucceeded && applicationStarted) {
      await adapterStore.setActivationState({
        ...defaultActivationState(),
        failure: {
          adapterId,
          code: clean(error?.code) || 'SCION_ADAPTER_ACTIVATION_FAILED',
          failedAt: new Date().toISOString(),
        },
      });
    }
    error.rollbackSucceeded = rollbackSucceeded;
    throw error;
  }
}

export async function removeInstalledScionAdapter({ adapterId, store } = {}) {
  const adapterStore = store || createScionAdapterIndexedDbStore();
  const state = await adapterStore.getActivationState();
  if (state.active?.adapterId === adapterId) {
    throw createRegistryError('SCION_ADAPTER_ACTIVE', 'Deactivate the Scion adapter before removing it.');
  }
  await adapterStore.removeAdapter(adapterId);
}
