// The Researcher — open-source fetchers (RESEARCHER.md §8).
// Wikipedia first (CC-BY-SA-4.0, attribution recorded per RS-2); every
// fetch returns license-tagged, length-capped plain text. OpenAlex and
// further providers join behind the standing 15s deadline when needed.

const WIKI_SEARCH = 'https://en.wikipedia.org/w/rest.php/v1/search/page';
const WIKI_EXTRACT = 'https://en.wikipedia.org/w/api.php';
const MAX_CHARS = 9000;

async function fetchJson(url, { timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': 'CourseMapper-Researcher/0.1 (research pipeline; contact: repo owner)' },
    });
    if (!response.ok) throw new Error(`${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function searchWikipedia(query, { limit = 2 } = {}) {
  const data = await fetchJson(`${WIKI_SEARCH}?q=${encodeURIComponent(query)}&limit=${limit}`);
  return (data.pages ?? []).map((p) => p.title);
}

export async function fetchExtract(title) {
  const url =
    `${WIKI_EXTRACT}?action=query&prop=extracts&explaintext=1&format=json&redirects=1&titles=` +
    encodeURIComponent(title);
  const data = await fetchJson(url);
  const pages = Object.values(data?.query?.pages ?? {});
  const page = pages.find((p) => typeof p.extract === 'string' && p.extract.length > 200);
  if (!page) return null;
  return {
    title: page.title,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
    license: 'CC-BY-SA-4.0',
    attribution: `Wikipedia contributors, "${page.title}"`,
    text: page.extract.slice(0, MAX_CHARS),
  };
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
