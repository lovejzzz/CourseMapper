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

async function fetchText(url, { signal } = {}) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`shard fetch ${response.status} for ${url}`);
  return response.text();
}

/**
 * Iteration-2 refinement: the manifest pins each shard's sha256 prefix, and
 * the loader now actually verifies it. Fail-closed on a MISMATCH (a tampered
 * or corrupted shard is skipped); fail-open only when the runtime lacks
 * WebCrypto or the manifest carries no hash (older genomes).
 */
async function sha256Prefix(text) {
  try {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return null;
    const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 16);
  } catch {
    return null;
  }
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
 * v0.14.1 P2.7: which inferred disciplines have NO shard in the manifest.
 * selectShardsForDisciplines returns [] silently on a coverage miss, so the
 * v0.14 audit's 0-link courses (cs, geo, lang) gave no hint the discipline
 * simply was not covered. Surfaced here so the genomeLink budget event can
 * say "no shard for inferred discipline 'cs'" instead of an unexplained
 * "0 genome + 0 cached".
 */
export function uncoveredDisciplinesForManifest(manifest, disciplines = []) {
  const wanted = [...new Set(disciplines.map((discipline) => String(discipline || '').toLowerCase()).filter(Boolean))];
  if (wanted.length === 0) return [];
  const covered = new Set((manifest?.shards || []).map((shard) => String(shard.discipline || '').toLowerCase()));
  return wanted.filter((discipline) => !covered.has(discipline));
}

/**
 * Load the given shards into a kernel library. Best-effort: an unavailable
 * shard is skipped, never fatal — but a shard whose content fails its
 * manifest hash is REJECTED (integrity over availability). Returns
 * { added, rejectedShards }.
 */
export async function loadShardsIntoLibrary(library, shards = [], options = {}) {
  let added = 0;
  const rejectedShards = [];
  for (const shard of shards) {
    try {
      const text = await fetchText(joinUrl(`${SHARD_DIR}/${shard.path || `${shard.id}.json`}`), options);
      if (shard.hash) {
        const actual = await sha256Prefix(text);
        if (actual && actual !== shard.hash) {
          rejectedShards.push({ id: shard.id, reason: 'hash-mismatch' });
          continue;
        }
      }
      const data = JSON.parse(text);
      added += library.addKernels(Array.isArray(data?.kernels) ? data.kernels : [], { source: 'shard' });
    } catch {
      /* skip unavailable shard */
    }
  }
  return { added, rejectedShards };
}

/**
 * One-shot convenience: load the manifest, pick shards for the given
 * disciplines, and hydrate the library. Returns { manifestVersion, added,
 * shardIds } — or a zeroed result when no genome is deployed.
 */
/**
 * Load the global archetype shard (Layer 2) into the library, hash-verified
 * like concept shards. Loaded once per session; idempotent.
 */
export async function loadArchetypeShard(library, manifest, options = {}) {
  const meta = manifest?.archetypeShard;
  if (!meta || !library?.addArchetypes || library.archetypeCount?.() > 0) return 0;
  try {
    const text = await fetchText(joinUrl(`${SHARD_DIR}/${meta.path || 'archetypes.json'}`), options);
    if (meta.hash) {
      const actual = await sha256Prefix(text);
      if (actual && actual !== meta.hash) return 0; // tampered → reject
    }
    const data = JSON.parse(text);
    return library.addArchetypes(Array.isArray(data?.archetypes) ? data.archetypes : []);
  } catch {
    return 0;
  }
}

export async function hydrateLibraryForDisciplines(library, disciplines, options = {}) {
  const manifest = await loadGenomeManifest(options);
  if (!manifest) {
    return {
      manifestVersion: null,
      added: 0,
      shardIds: [],
      rejectedShards: [],
      archetypesAdded: 0,
      // v0.14.1 P2.7: no genome deployed → every inferred discipline is
      // uncovered, and the linker reports that instead of a silent 0-link.
      uncoveredDisciplines: uncoveredDisciplinesForManifest(null, disciplines),
    };
  }
  const shards = selectShardsForDisciplines(manifest, disciplines);
  const { added, rejectedShards } = await loadShardsIntoLibrary(library, shards, options);
  // The archetype shard is global (not discipline-keyed) — load it whenever any
  // genome is consulted, so scaffolding works even on a concept miss.
  const archetypesAdded = await loadArchetypeShard(library, manifest, options);
  return {
    manifestVersion: manifest.version || null,
    added,
    shardIds: shards.map((shard) => shard.id),
    rejectedShards,
    archetypesAdded,
    uncoveredDisciplines: uncoveredDisciplinesForManifest(manifest, disciplines),
  };
}

/** Infer candidate disciplines from a course map (title + concept hints). */
export function inferCourseDisciplines(courseMap) {
  const text = [courseMap?.courseName, ...(courseMap?.lessons || []).slice(0, 4).map((lesson) => lesson?.title)]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const map = [
    ['econ', /\beconom|microecon|macroecon|market|supply|demand|inflation|wage|monetary|fiscal/],
    // v0.13.3: the astronomy shard (OpenStax Astronomy 2e foundry run).
    ['astro', /\bastronom|night sky|celestial|planetar|telescope|stargaz|cosmolog|galax|solar system/],
    ['psych', /\bpsycholog|cognition|behavior|neuroscience|educational psych|learning theor|child development/],
    // v0.13.5: nursing (A&P 2e + Microbiology) and nutrition (UH OER) shards.
    ['nursing', /\bnursing|patient care|clinical|vital signs|infection control|pathophysiolog|microbiolog|immunolog/],
    ['nutrition', /\bnutrition|dietetic|macronutrient|micronutrient|dietary|food science|\bdiet\b/],
    ['bio', /\bbiolog|cell|genetic|ecolog|evolution|organism|physiolog|anatomy|homeostasis/],
    ['stats', /\bstatistic|probability|regression|inference|data analysis|hypothesis test/],
    ['chem', /\bchemistr|molecul|reaction|stoichiometr|equilibrium/],
    ['history', /\bhistory|historical|civilization|\bwar\b|revolution|primary source/],
    ['lit', /\bliterat|literary|poetry|poem|novel|fiction|close reading|rhetoric|composition/],
    ['cs', /\bcomputer science|algorithm|programming|data structure/],
    // v0.14.1 (4.2): geology + world-language inference. The v0.14 audit's
    // Physical Geology and Mandarin courses inferred NOTHING — no regex
    // existed, so the 0-link runs looked like linker failures. The 'lang'
    // key has no shard yet; inferring it makes the gap visible through the
    // 2.7 "no shard for inferred discipline" logging instead of silent.
    ['geo', /\bgeolog|plate tectonic|mineral|seismolog|volcan|earth science|petrolog|geomorpholog|stratigraph/],
    [
      'lang',
      /\bmandarin|\bchinese|\bspanish|\bfrench|\bgerman|\bjapanese|\barabic|\bkorean|\bitalian|foreign language|world language|\blanguage\b.*\b(?:elementary|beginner|beginning|conversation|i{1,3}|[12])\b/,
    ],
  ];
  const found = map.filter(([, re]) => re.test(text)).map(([discipline]) => discipline);
  return [...new Set(found)];
}
