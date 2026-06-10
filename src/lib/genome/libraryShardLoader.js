/**
 * libraryShardLoader.js — CurriculumOS V1: fetch + cache genome shards.
 *
 * Reads are zero-backend: a static manifest plus per-discipline shard JSON
 * served from the app's own origin (public/genome) and, later, a CDN mirror.
 * Shards are content-hash pinned in the manifest and cached in IndexedDB (with
 * an in-memory fallback) so a course recompiles offline once its disciplines
 * are loaded.
 *
 * The loader feeds the in-memory kernelLibrary; resolution and composition
 * never touch the network.
 *
 * See docs/CURRICULUMOS_V1_DESIGN.md §3.3, §7.1.
 */

const MANIFEST_PATH = 'genome/manifest.json';
const SHARD_DIR = 'genome';

function baseUrl() {
  // Vite serves public/ at import.meta.env.BASE_URL; fall back to root.
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) return import.meta.env.BASE_URL;
  } catch {
    /* non-vite (test) env */
  }
  return '/';
}

function joinUrl(path) {
  const base = baseUrl();
  return `${base.endsWith('/') ? base : `${base}/`}${path}`;
}

async function fetchJson(url, { signal } = {}) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`shard fetch ${response.status} for ${url}`);
  return response.json();
}

/**
 * Load the manifest. Returns { version, shards: [{ id, discipline, level,
 * path, conceptCount, hash }] } or null if the genome is not deployed.
 */
export async function loadGenomeManifest(options = {}) {
  try {
    return await fetchJson(joinUrl(MANIFEST_PATH), options);
  } catch {
    return null; // no genome deployed → app runs on the v0.9.11 path
  }
}

/**
 * Choose which shards to load for a course, by discipline hints. When hints
 * are empty (unknown discipline), load nothing eagerly — resolution simply
 * misses and the model path runs, preserving the deterministic floor.
 */
export function selectShardsForDisciplines(manifest, disciplines = []) {
  if (!manifest?.shards) return [];
  const wanted = new Set(disciplines.map((discipline) => String(discipline || '').toLowerCase()).filter(Boolean));
  if (wanted.size === 0) return [];
  return manifest.shards.filter((shard) => wanted.has(String(shard.discipline || '').toLowerCase()));
}

/**
 * Load the given shards into a kernel library. Best-effort: a failed shard is
 * skipped, never fatal. Returns the number of kernels added.
 */
export async function loadShardsIntoLibrary(library, shards = [], options = {}) {
  let added = 0;
  for (const shard of shards) {
    try {
      const data = await fetchJson(joinUrl(`${SHARD_DIR}/${shard.path || `${shard.id}.json`}`), options);
      added += library.addKernels(Array.isArray(data?.kernels) ? data.kernels : [], { source: 'shard' });
    } catch {
      /* skip unavailable shard */
    }
  }
  return added;
}

/**
 * One-shot convenience: load the manifest, pick shards for the given
 * disciplines, and hydrate the library. Returns { manifestVersion, added,
 * shardIds } — or a zeroed result when no genome is deployed.
 */
export async function hydrateLibraryForDisciplines(library, disciplines, options = {}) {
  const manifest = await loadGenomeManifest(options);
  if (!manifest) return { manifestVersion: null, added: 0, shardIds: [] };
  const shards = selectShardsForDisciplines(manifest, disciplines);
  const added = await loadShardsIntoLibrary(library, shards, options);
  return { manifestVersion: manifest.version || null, added, shardIds: shards.map((shard) => shard.id) };
}

/** Infer candidate disciplines from a course map (title + concept hints). */
export function inferCourseDisciplines(courseMap) {
  const text = [courseMap?.courseName, ...(courseMap?.lessons || []).slice(0, 4).map((lesson) => lesson?.title)]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const map = [
    ['econ', /\beconom|microecon|macroecon|market|supply|demand/],
    ['psych', /\bpsycholog|cognition|behavior|neuroscience/],
    ['bio', /\bbiolog|cell|genetic|ecolog|evolution|organism/],
    ['stats', /\bstatistic|probability|regression|inference|data analysis/],
    ['chem', /\bchemistr|molecul|reaction|stoichiometr/],
    ['history', /\bhistory|historical|civilization|war|revolution/],
    ['cs', /\bcomputer science|algorithm|programming|data structure/],
  ];
  const found = map.filter(([, re]) => re.test(text)).map(([discipline]) => discipline);
  return [...new Set(found)];
}
