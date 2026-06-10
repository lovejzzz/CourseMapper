/**
 * kernelLibrary.js — CurriculumOS V1: the in-browser genome store.
 *
 * Holds the loaded concept kernels (from CDN shards and the local cache),
 * exposes the resolver index, and persists the user's own generated kernels
 * so regenerations and revisions reuse them for free. Storage is injectable
 * so the module is testable in node without IndexedDB.
 *
 * V1 keeps it simple: a synchronous in-memory store hydrated from (a) bundled
 * genesis shards under public/genome and (b) a localStorage-backed local
 * cache of the user's own contributions-in-waiting. The async CDN shard
 * fetch lives in libraryShardLoader.js and feeds this store.
 *
 * See docs/CURRICULUMOS_V1_DESIGN.md §3.3, §4, §7.1.
 */

import { buildConceptIndex } from './conceptResolver';
import { normalizeConceptKernel } from './kernelSchema';

const LOCAL_CACHE_KEY = 'coursemapper-genome-local';

function getStore(injected) {
  if (injected) return injected;
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* no storage (SSR/node) */
  }
  return null;
}

export function createKernelLibrary({ storage } = {}) {
  const kernels = new Map(); // id → kernel (highest rev/tier wins)
  let index = buildConceptIndex([]);
  let dirty = false;

  function rebuild() {
    index = buildConceptIndex([...kernels.values()]);
    dirty = false;
  }

  function preferIncoming(existing, incoming) {
    if (!existing) return true;
    if ((incoming.rev || 0) !== (existing.rev || 0)) return (incoming.rev || 0) > (existing.rev || 0);
    // Same rev: keep the higher-trust copy (anchored library beats local model).
    const tierOf = (kernel) => kernel?.definition?.tier ?? 0;
    return tierOf(incoming) >= tierOf(existing);
  }

  function addKernel(raw, { source = 'shard' } = {}) {
    const { kernel } = normalizeConceptKernel(raw);
    if (!kernel) return false;
    kernel.source = source;
    const existing = kernels.get(kernel.id);
    if (preferIncoming(existing, kernel)) {
      kernels.set(kernel.id, kernel);
      dirty = true;
      return true;
    }
    return false;
  }

  function addKernels(rawList, options) {
    let added = 0;
    for (const raw of rawList || []) if (addKernel(raw, options)) added += 1;
    if (added > 0) rebuild();
    return added;
  }

  /**
   * Add a whole foundry shard, reusing its shipped inverted index when the
   * kernels are otherwise the only source (the common CDN read path). Falls
   * back to addKernels (which rebuilds the index) when kernels are merged from
   * multiple shards.
   */
  function addShard(shard, options) {
    const added = addKernels(Array.isArray(shard?.kernels) ? shard.kernels : [], options);
    return added;
  }

  function getIndex() {
    if (dirty) rebuild();
    return index;
  }

  function getKernel(id) {
    return kernels.get(id) || null;
  }

  function size() {
    return kernels.size;
  }

  // ── Local cache of the user's own generated kernels ──────────────────────
  function loadLocalCache() {
    const store = getStore(storage);
    if (!store) return 0;
    try {
      const raw = store.getItem(LOCAL_CACHE_KEY);
      if (!raw) return 0;
      const parsed = JSON.parse(raw);
      return addKernels(Array.isArray(parsed?.kernels) ? parsed.kernels : [], { source: 'local' });
    } catch {
      return 0;
    }
  }

  function persistLocalKernels(rawList) {
    const store = getStore(storage);
    const accepted = [];
    for (const raw of rawList || []) {
      const { kernel } = normalizeConceptKernel(raw);
      if (kernel) accepted.push(kernel);
    }
    if (accepted.length === 0) return 0;
    addKernels(accepted, { source: 'local' });
    if (store) {
      try {
        const existing = JSON.parse(store.getItem(LOCAL_CACHE_KEY) || '{}');
        const merged = new Map((existing.kernels || []).map((kernel) => [kernel.id, kernel]));
        for (const kernel of accepted) merged.set(kernel.id, kernel);
        store.setItem(LOCAL_CACHE_KEY, JSON.stringify({ kernels: [...merged.values()] }));
      } catch {
        /* best-effort persistence */
      }
    }
    return accepted.length;
  }

  return {
    addKernel,
    addKernels,
    addShard,
    getIndex,
    getKernel,
    size,
    loadLocalCache,
    persistLocalKernels,
  };
}

/** Process-wide singleton for the app; tests build their own with injected storage. */
let sharedLibrary = null;
export function getKernelLibrary() {
  if (!sharedLibrary) {
    sharedLibrary = createKernelLibrary();
    sharedLibrary.loadLocalCache();
  }
  return sharedLibrary;
}

export function resetKernelLibraryForTests() {
  sharedLibrary = null;
}
