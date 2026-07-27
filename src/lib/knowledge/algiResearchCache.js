/**
 * Compact local cache for admitted Algi lesson evidence.
 *
 * Provider response bodies are not persisted. The cache keeps only admitted
 * kernels, their passage anchors, source receipts, and an evidence summary.
 * This makes a revised course fast and offline-capable without turning browser
 * storage into a shadow corpus.
 */

export const ALGI_RESEARCH_CACHE_KEY = 'coursemapper-algi-research-cache-v4';
export const ALGI_RESEARCH_CACHE_PROTOCOL = 'algi-local-research-cache-v4';
const MAX_ENTRIES = 60;
const MAX_SERIALIZED_CHARS = 1_800_000;

function clean(value = '') {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalize(value = '') {
  return clean(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function hash(value = '') {
  let result = 2166136261;
  for (const character of String(value)) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

export function algiResearchCacheEntryKey(courseName = '', topic = '') {
  return `${hash(normalize(courseName))}:${hash(normalize(topic))}`;
}

function emptyStore() {
  return { protocol: ALGI_RESEARCH_CACHE_PROTOCOL, entries: {} };
}

function parseStore(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem?.(ALGI_RESEARCH_CACHE_KEY) || 'null');
    if (parsed?.protocol !== ALGI_RESEARCH_CACHE_PROTOCOL || !parsed?.entries) return emptyStore();
    return parsed;
  } catch {
    return emptyStore();
  }
}

function safeClone(value) {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
}

function compactStore(store) {
  const ordered = Object.entries(store.entries || {}).sort(
    ([, left], [, right]) => (Number(right?.lastUsedAt) || 0) - (Number(left?.lastUsedAt) || 0),
  );
  const entries = {};
  for (const [key, value] of ordered.slice(0, MAX_ENTRIES)) {
    entries[key] = value;
    const candidate = JSON.stringify({ protocol: ALGI_RESEARCH_CACHE_PROTOCOL, entries });
    if (candidate.length > MAX_SERIALIZED_CHARS) {
      delete entries[key];
      break;
    }
  }
  return { protocol: ALGI_RESEARCH_CACHE_PROTOCOL, entries };
}

function cacheableKernel(kernel = {}) {
  if (!kernel?.id) return false;
  if (kernel?.provenance?.origin !== 'algi-research') return true;
  return kernel?.provenance?.entailment?.status === 'passed';
}

export function readAlgiResearchCache({
  courseName = '',
  topics = [],
  storage = typeof window !== 'undefined' ? window.localStorage : null,
  now = Date.now(),
} = {}) {
  const store = parseStore(storage);
  const byTopic = new Map();
  const expired = [];
  for (const topic of topics.map(clean).filter(Boolean)) {
    const key = algiResearchCacheEntryKey(courseName, topic);
    const entry = store.entries[key];
    if (!entry) continue;
    if (Number(entry.expiresAt) <= Number(now)) {
      expired.push(key);
      continue;
    }
    const kernels = (Array.isArray(entry.kernels) ? entry.kernels : []).filter(cacheableKernel);
    if (kernels.length === 0) continue;
    entry.lastUsedAt = Number(now);
    byTopic.set(topic, {
      kernels: safeClone(kernels),
      evidence: safeClone(entry.evidence || null),
      cachedAt: entry.cachedAt,
      expiresAt: entry.expiresAt,
    });
  }
  for (const key of expired) delete store.entries[key];
  if (byTopic.size > 0 || expired.length > 0) {
    try {
      storage?.setItem?.(ALGI_RESEARCH_CACHE_KEY, JSON.stringify(compactStore(store)));
    } catch {
      // Storage-denied and quota-limited environments remain network-first.
    }
  }
  return { byTopic, hits: byTopic.size, expired: expired.length };
}

export function writeAlgiResearchCache({
  courseName = '',
  records = [],
  storage = typeof window !== 'undefined' ? window.localStorage : null,
  now = Date.now(),
} = {}) {
  const store = parseStore(storage);
  let written = 0;
  for (const record of Array.isArray(records) ? records : []) {
    const topic = clean(record?.topic);
    const kernels = (Array.isArray(record?.kernels) ? record.kernels : []).filter(cacheableKernel);
    if (!topic || kernels.length === 0) continue;
    const freshnessDays = Math.max(1, Math.min(30, Number(record?.freshnessDays) || 14));
    const key = algiResearchCacheEntryKey(courseName, topic);
    store.entries[key] = {
      courseName: clean(courseName),
      topic,
      cachedAt: new Date(now).toISOString(),
      lastUsedAt: Number(now),
      expiresAt: Number(now) + freshnessDays * 86_400_000,
      kernels: safeClone(kernels),
      evidence: safeClone(record?.evidence || null),
    };
    written += 1;
  }
  try {
    storage?.setItem?.(ALGI_RESEARCH_CACHE_KEY, JSON.stringify(compactStore(store)));
  } catch {
    return { written: 0, persisted: false };
  }
  return { written, persisted: true };
}

export function clearAlgiResearchCache(storage = typeof window !== 'undefined' ? window.localStorage : null) {
  try {
    storage?.removeItem?.(ALGI_RESEARCH_CACHE_KEY);
    return true;
  } catch {
    return false;
  }
}
