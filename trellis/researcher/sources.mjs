// The Researcher — open-source fetchers (RESEARCHER.md §8).
// Wikipedia first (CC-BY-SA-4.0, attribution recorded per RS-2); every
// fetch returns license-tagged, length-capped plain text. OpenAlex and
// further providers join behind the standing 15s deadline when needed.

const WIKI_SEARCH = 'https://en.wikipedia.org/w/rest.php/v1/search/page';
const WIKI_EXTRACT = 'https://en.wikipedia.org/w/api.php';
const MAX_CHARS = 9000;
const SOURCE_CACHE_DIR = 'trellis/researcher/cache';
const MIN_REQUEST_GAP_MS = 1100; // polite: ~1 req/s to Wikimedia

// Benched ourselves into a 429 by re-fetching the same six pages across
// three benches — sources are static, so an on-disk cache is both the
// politeness fix and the speed fix. Throttle covers the misses.
let lastRequestAt = 0;
async function politeDelay() {
  const wait = lastRequestAt + MIN_REQUEST_GAP_MS - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequestAt = Date.now();
}

async function fetchOnce(url, timeoutMs) {
  await politeDelay();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': 'CourseMapper-Researcher/0.1 (research pipeline; contact: repo owner)' },
    });
    if (!response.ok) {
      const err = new Error(`${response.status}`);
      err.status = response.status;
      throw err;
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

// A burst of fresh titles used to 429 the whole batch (the cause of L1's
// first "NO SOURCES ×5" — 2 targets warmed the cache, the rest hit the wall).
// Retry the rate-limit / transient statuses with exponential backoff so a
// cold-cache discipline fill survives its own burst.
async function fetchJson(url, { timeoutMs = 15000, retries = 3 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fetchOnce(url, timeoutMs);
    } catch (error) {
      lastErr = error;
      const transient = error.status === 429 || error.status === 503 || error.name === 'AbortError';
      if (!transient || attempt === retries) break;
      await new Promise((resolve) => setTimeout(resolve, 1500 * 2 ** attempt)); // 1.5s, 3s, 6s
    }
  }
  throw lastErr;
}

export async function searchWikipedia(query, { limit = 2 } = {}) {
  const data = await fetchJson(`${WIKI_SEARCH}?q=${encodeURIComponent(query)}&limit=${limit}`);
  return (data.pages ?? []).map((p) => p.title);
}

export async function fetchExtract(title) {
  const { createHash } = await import('node:crypto');
  const { mkdir, readFile: rf, writeFile: wf } = await import('node:fs/promises');
  const cachePath = `${SOURCE_CACHE_DIR}/wiki-${createHash('sha1').update(title).digest('hex').slice(0, 12)}.json`;
  try {
    return JSON.parse(await rf(cachePath, 'utf8'));
  } catch {
    /* cache miss */
  }
  const url =
    `${WIKI_EXTRACT}?action=query&prop=extracts&explaintext=1&format=json&redirects=1&titles=` +
    encodeURIComponent(title);
  const data = await fetchJson(url);
  const pages = Object.values(data?.query?.pages ?? {});
  const page = pages.find((p) => typeof p.extract === 'string' && p.extract.length > 200);
  if (!page) return null;
  const source = {
    title: page.title,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
    license: 'CC-BY-SA-4.0',
    attribution: `Wikipedia contributors, "${page.title}"`,
    text: page.extract.slice(0, MAX_CHARS),
    fetchedAt: new Date().toISOString().slice(0, 10),
  };
  try {
    await mkdir(SOURCE_CACHE_DIR, { recursive: true });
    await wf(cachePath, JSON.stringify(source, null, 1));
  } catch {
    /* cache write is best-effort */
  }
  return source;
}

// queries -> up to `cap` deduped, license-tagged sources. Failures skip
// (a thin source list is a disclosure, not an exception).
export async function gatherSources(queries, { cap = 3 } = {}) {
  const seen = new Set();
  const sources = [];
  for (const query of queries) {
    if (sources.length >= cap) break;
    try {
      const titles = await searchWikipedia(query, { limit: 2 });
      for (const title of titles) {
        if (sources.length >= cap || seen.has(title)) continue;
        seen.add(title);
        const source = await fetchExtract(title);
        if (source) sources.push(source);
      }
    } catch {
      /* skip failed query — density is reported by the caller */
    }
  }
  return sources;
}

// ── OpenAlex: DOCUMENTED misconceptions from education literature ──────────
// The truth-worthy pedagogy source: misconceptions measured in real
// classrooms, with citations — never invented by a model. Behind the
// standing 15s deadline; failures return [], disclosed by count.
const OPENALEX = 'https://api.openalex.org/works';

function reconstructAbstract(inverted) {
  if (!inverted) return null;
  const words = [];
  for (const [word, positions] of Object.entries(inverted)) {
    for (const pos of positions) words[pos] = word;
  }
  return words.join(' ');
}

const MISCONCEPTION_SENTENCE_RE =
  /misconception|students? (often|commonly|frequently|tend to) (believe|think|assume|confuse|struggle)|commonly (confused|mistaken|misunderstood)|alternative conception/i;

export async function openAlexMisconceptions(topic, { limit = 5 } = {}) {
  try {
    const url =
      `${OPENALEX}?search=${encodeURIComponent(`students misconceptions ${topic}`)}` +
      `&per-page=${limit}&select=id,title,publication_year,doi,abstract_inverted_index&mailto=coursemapper@example.org`;
    const data = await fetchJson(url, { timeoutMs: 15000 });
    const found = [];
    for (const work of data.results ?? []) {
      const abstract = reconstructAbstract(work.abstract_inverted_index);
      if (!abstract) continue;
      const sentences = abstract
        .split(/(?<=[.!?])\s+/)
        .filter((x) => x.length >= 60 && x.length <= 400 && MISCONCEPTION_SENTENCE_RE.test(x));
      for (const sentence of sentences.slice(0, 2)) {
        found.push({
          text: sentence,
          citation: { title: work.title, year: work.publication_year, id: work.doi ?? work.id },
        });
      }
    }
    return found.slice(0, 4);
  } catch {
    return []; // deadline/network — thin literature is a disclosure, not an error
  }
}
