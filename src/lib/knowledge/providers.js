/**
 * knowledge/providers.js — v0.13.5 P0: the Open Knowledge Backbone's
 * runtime provider layer.
 *
 * One contract over the keyless, CORS-friendly open-knowledge APIs the
 * browser may call at run time: OpenAlex (scholarly works), ERIC (education
 * research), Open Library (book metadata), Crossref, Wikipedia, Library of
 * Congress, and Internet Archive metadata. Build-time-only systems
 * (OpenStax full text, CORE) live in the foundry, never here.
 *
 * Hard rules (docs/V0.13.5_OPEN_KNOWLEDGE_BACKBONE_ROADMAP.md P0):
 *  - every result carries { license, attribution, url } so downstream
 *    surfaces can render a Sources & Licenses appendix without guessing;
 *  - every provider degrades to an EMPTY result on any failure — the
 *    deterministic compile never depends on the network;
 *  - results are cached in localStorage keyed by provider + query + ISO
 *    week, so a course regenerated in the same week makes zero new calls;
 *  - OpenAlex keeps the polite-pool mailto.
 */

const CACHE_PREFIX = 'cm-knowledge:';
const OPENALEX_MAILTO = 'coursemapper@nyu.edu';

function cleanText(value) {
  return (
    String(value ?? '')
      // V0.14.1 D1: strip HTML tags before they reach a syllabus. OpenAlex
      // display_names occasionally carry markup ("A short history of<i>SHELX</i>");
      // collapse the tag to a space so adjacent words don't fuse.
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * V0.14.1 D2: author-name hygiene.
 *  - normalize glued initials ("OliverH." → "Oliver H.") — OpenAlex
 *    display_name artifacts. Conservative: only the specific pattern of a
 *    lowercase letter immediately followed by a trailing single-capital
 *    initial within one token.
 */
function normalizeAuthorName(name) {
  return cleanText(name)
    .split(/\s+/)
    .map((token) => token.replace(/([a-z])([A-Z]\.)$/, '$1 $2'))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * V0.14.1 D2: render up to three authors, appending " et al." when the full
 * authorship list is longer — instead of silently truncating at three.
 */
function formatAuthorList(names, totalCount) {
  const cleaned = (names || []).map(normalizeAuthorName).filter(Boolean);
  const joined = cleaned.slice(0, 3).join(', ');
  const total = Number.isFinite(totalCount) ? totalCount : cleaned.length;
  return total > 3 && joined ? `${joined} et al.` : joined;
}

/** ISO week stamp — cache keys roll over weekly, not per-session. */
export function isoWeekStamp(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function cacheGet(key) {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${key}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function cacheSet(key, value) {
  try {
    localStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(value));
  } catch {
    /* storage full or unavailable — caching is best-effort */
  }
}

async function cachedFetchJson(cacheKey, url, { signal, timeoutMs = 8000 } = {}) {
  const key = `${cacheKey}:${isoWeekStamp()}`;
  const hit = cacheGet(key);
  if (hit) return hit;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`${res.status}`);
    const json = await res.json();
    cacheSet(key, json);
    return json;
  } finally {
    clearTimeout(timer);
  }
}

/** Reconstruct an abstract from OpenAlex's inverted-index format. */
function abstractFromInvertedIndex(invertedIndex) {
  if (!invertedIndex || typeof invertedIndex !== 'object') return '';
  const words = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const position of positions) words[position] = word;
  }
  return words.join(' ').slice(0, 400);
}

/**
 * V0.14.1 round-2 (citation relevance, layer A): normalize an OpenAlex topic
 * object ({ display_name, field: { display_name }, domain: { display_name } })
 * into { name, field, domain } — the discipline classification the reading
 * gate uses to reject off-discipline papers regardless of token overlap.
 */
function normalizeOpenAlexTopic(topic) {
  if (!topic || typeof topic !== 'object') return null;
  const normalized = {
    name: cleanText(topic.display_name),
    field: cleanText(topic.field?.display_name),
    domain: cleanText(topic.domain?.display_name),
  };
  return normalized.name || normalized.field || normalized.domain ? normalized : null;
}

/**
 * OpenAlex: peer-reviewed readings for a concept. Returns [] on any failure.
 *
 * V0.14.1 B (citation relevance): the old `sort=cited_by_count:desc` returned
 * the most-cited papers in ALL of science for a bare term — the root cause of
 * the audit's MNIST-for-geology / cancer-stats-for-literature attachments. We
 * now use OpenAlex's DEFAULT relevance ranking (omit `sort` so `relevance_score`
 * orders `search=` results) and fold the caller's discipline `anchor` into the
 * search string. Citation count survives as `citedBy` for a downstream
 * tie-break only. The caller requests several candidates and applies a local
 * topical-relevance gate (see readingListEngine.scoreReadingRelevance).
 */
export async function searchScholarlyReadings(query, { limit = 3, signal, anchor } = {}) {
  const q = cleanText(query);
  if (!q) return [];
  const search = cleanText(anchor) ? `${q} ${cleanText(anchor)}` : q;
  try {
    // V0.14.1 round-2: primary_topic + topics ride the select so the reading
    // gate can reject off-discipline candidates by field/domain (the diabetes
    // review for a literature course) instead of trusting token overlap.
    const url =
      `https://api.openalex.org/works?search=${encodeURIComponent(search)}` +
      `&filter=is_oa:true,is_retracted:false&per_page=${limit}` +
      `&select=id,display_name,authorships,publication_year,cited_by_count,doi,primary_location,best_oa_location,open_access,abstract_inverted_index,primary_topic,topics` +
      `&mailto=${OPENALEX_MAILTO}`;
    const json = await cachedFetchJson(`openalex:${search}:${limit}`, url, { signal });
    return (json.results || []).map((work) => {
      const bestOaLocation = work.best_oa_location || {};
      const primaryLocation = work.primary_location || {};
      return {
        provider: 'openalex',
        kind: 'peer-reviewed reading',
        title: cleanText(work.display_name),
        authors: formatAuthorList(
          (work.authorships || []).map((authorship) => authorship.author?.display_name),
          (work.authorships || []).length,
        ),
        year: work.publication_year || null,
        citedBy: work.cited_by_count || 0,
        abstract: abstractFromInvertedIndex(work.abstract_inverted_index),
        primaryTopic: normalizeOpenAlexTopic(work.primary_topic),
        topics: (Array.isArray(work.topics) ? work.topics : []).map(normalizeOpenAlexTopic).filter(Boolean).slice(0, 3),
        url:
          bestOaLocation.pdf_url ||
          bestOaLocation.landing_page_url ||
          work.open_access?.oa_url ||
          primaryLocation.pdf_url ||
          primaryLocation.landing_page_url ||
          (work.doi ? `https://doi.org/${work.doi.replace(/^https?:\/\/doi\.org\//, '')}` : work.id),
        license: bestOaLocation.license || primaryLocation.license || 'open access',
        attribution: 'OpenAlex (CC0 metadata)',
      };
    });
  } catch {
    return [];
  }
}

/**
 * ERIC (api.ies.ed.gov): education research for pedagogy evidence and
 * teaching-methods readings. Returns [] on any failure.
 */
export async function searchEducationResearch(query, { limit = 3, signal } = {}) {
  const q = cleanText(query);
  if (!q) return [];
  try {
    const url =
      `https://api.ies.ed.gov/eric/?search=${encodeURIComponent(q)}` +
      `&rows=${limit}&format=json&fields=id,title,author,publicationdateyear,description,peerreviewed,url`;
    const json = await cachedFetchJson(`eric:${q}:${limit}`, url, { signal });
    const docs = json?.response?.docs || [];
    return docs.map((doc) => ({
      provider: 'eric',
      kind: 'education research',
      title: cleanText(doc.title),
      authors: Array.isArray(doc.author)
        ? formatAuthorList(doc.author, doc.author.length)
        : normalizeAuthorName(doc.author),
      year: Number(doc.publicationdateyear) || null,
      peerReviewed: doc.peerreviewed === 'T' || doc.peerreviewed === true,
      abstract: cleanText(doc.description).slice(0, 400),
      url: cleanText(doc.url) || `https://eric.ed.gov/?id=${doc.id}`,
      license: 'ERIC public metadata',
      attribution: 'ERIC, Institute of Education Sciences',
      ericId: doc.id,
    }));
  } catch {
    return [];
  }
}

/**
 * Open Library: book metadata for syllabus Required Texts. Returns [] on
 * any failure.
 */
export async function searchBookMetadata(query, { limit = 3, signal } = {}) {
  const q = cleanText(query);
  if (!q) return [];
  try {
    const url =
      `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}` +
      `&limit=${limit}&fields=title,author_name,first_publish_year,publisher,isbn,key`;
    const json = await cachedFetchJson(`openlibrary:${q}:${limit}`, url, { signal });
    return (json.docs || []).map((doc) => ({
      provider: 'openlibrary',
      kind: 'book',
      title: cleanText(doc.title),
      authors: formatAuthorList(doc.author_name, (doc.author_name || []).length),
      year: doc.first_publish_year || null,
      publisher: (doc.publisher || [])[0] || '',
      isbn: (doc.isbn || [])[0] || null,
      url: doc.key ? `https://openlibrary.org${doc.key}` : `https://openlibrary.org/search?q=${encodeURIComponent(q)}`,
      license: 'Open Library public metadata',
      attribution: 'Open Library, Internet Archive',
    }));
  } catch {
    return [];
  }
}

function firstArrayValue(value) {
  return Array.isArray(value) ? value.find((entry) => cleanText(entry)) : value;
}

function yearFromDateParts(...partsList) {
  for (const parts of partsList) {
    const year = Array.isArray(parts?.['date-parts']?.[0]) ? Number(parts['date-parts'][0][0]) : null;
    if (Number.isFinite(year) && year > 0) return year;
  }
  return null;
}

/**
 * Crossref: broad DOI metadata for peer-reviewed/course readings. Returns []
 * on any failure.
 */
export async function searchCrossrefWorks(query, { limit = 3, signal } = {}) {
  const q = cleanText(query);
  if (!q) return [];
  try {
    const url =
      `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(q)}` +
      `&rows=${limit}&mailto=${OPENALEX_MAILTO}`;
    const json = await cachedFetchJson(`crossref:${q}:${limit}`, url, { signal });
    return (json?.message?.items || []).map((item) => {
      const doi = cleanText(item.DOI);
      return {
        provider: 'crossref',
        kind: cleanText(item.type) || 'scholarly work',
        title: cleanText(firstArrayValue(item.title)),
        authors: formatAuthorList(
          (item.author || []).map((author) => cleanText(`${author.given || ''} ${author.family || ''}`)),
          (item.author || []).length,
        ),
        year: yearFromDateParts(item.published, item['published-print'], item['published-online'], item.created),
        abstract: cleanText(item.abstract).slice(0, 400),
        url: cleanText(item.URL) || (doi ? `https://doi.org/${doi}` : ''),
        doi: doi || null,
        license: cleanText(item.license?.[0]?.URL) || 'Crossref public metadata',
        attribution: 'Crossref public metadata',
      };
    });
  } catch {
    return [];
  }
}

/**
 * Wikipedia: concise encyclopedia pages for background knowledge. Returns []
 * on any failure or rate limit.
 */
export async function searchWikipediaPages(query, { limit = 2, signal } = {}) {
  const q = cleanText(query);
  if (!q) return [];
  try {
    const url =
      `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(q)}` +
      `&gsrlimit=${limit}&prop=extracts|info&exintro=1&explaintext=1&inprop=url&format=json&origin=*`;
    const json = await cachedFetchJson(`wikipedia:${q}:${limit}`, url, { signal });
    const pages = Object.values(json?.query?.pages || {});
    return pages.map((page) => ({
      provider: 'wikipedia',
      kind: 'encyclopedia background',
      title: cleanText(page.title),
      authors: 'Wikipedia contributors',
      year: null,
      abstract: cleanText(page.extract).slice(0, 400),
      url: cleanText(page.fullurl),
      license: 'CC BY-SA 4.0',
      attribution: 'Wikipedia contributors',
    }));
  } catch {
    return [];
  }
}

/**
 * Library of Congress: primary-source/catalog metadata. Returns [] on any
 * failure.
 */
export async function searchLibraryOfCongress(query, { limit = 2, signal } = {}) {
  const q = cleanText(query);
  if (!q) return [];
  try {
    const url = `https://www.loc.gov/search/?fo=json&q=${encodeURIComponent(q)}&c=${limit}`;
    const json = await cachedFetchJson(`loc:${q}:${limit}`, url, { signal });
    return (json?.results || []).map((item) => ({
      provider: 'loc',
      kind: 'primary source metadata',
      title: cleanText(item.title),
      authors: Array.isArray(item.contributor)
        ? formatAuthorList(item.contributor, item.contributor.length)
        : cleanText(item.contributor || item.creator),
      year: Number(cleanText(item.date).match(/\b(1[5-9]\d{2}|20\d{2})\b/)?.[0]) || null,
      abstract: cleanText(firstArrayValue(item.description || item.notes)).slice(0, 400),
      url: cleanText(item.url || item.item?.url),
      license: cleanText(item.rights) || 'Library of Congress public metadata; rights vary',
      attribution: 'Library of Congress',
    }));
  } catch {
    return [];
  }
}

/**
 * Internet Archive: public text metadata. Returns [] on any failure.
 */
export async function searchInternetArchiveTexts(query, { limit = 2, signal } = {}) {
  const q = cleanText(query);
  if (!q) return [];
  try {
    const search = `${q} AND mediatype:texts`;
    const url =
      `https://archive.org/advancedsearch.php?q=${encodeURIComponent(search)}` +
      `&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=year&fl[]=description&fl[]=licenseurl&rows=${limit}&output=json`;
    const json = await cachedFetchJson(`internetarchive:${q}:${limit}`, url, { signal });
    return (json?.response?.docs || []).map((doc) => ({
      provider: 'internetarchive',
      kind: 'open archive text',
      title: cleanText(doc.title),
      authors: Array.isArray(doc.creator) ? formatAuthorList(doc.creator, doc.creator.length) : cleanText(doc.creator),
      year: Number(cleanText(doc.year).match(/\b(1[5-9]\d{2}|20\d{2})\b/)?.[0]) || null,
      abstract: cleanText(Array.isArray(doc.description) ? doc.description[0] : doc.description).slice(0, 400),
      url: doc.identifier ? `https://archive.org/details/${encodeURIComponent(doc.identifier)}` : '',
      license: cleanText(doc.licenseurl) || 'Internet Archive public metadata; item rights vary',
      attribution: 'Internet Archive',
    }));
  } catch {
    return [];
  }
}

export function oerCommonsSearchLink(query) {
  const q = cleanText(query);
  if (!q) return null;
  return {
    provider: 'oercommons',
    kind: 'oer search',
    title: `OER Commons search: ${q}`,
    url: `https://oercommons.org/search?f.search=${encodeURIComponent(q)}`,
    license: 'OER Commons search results; item licenses vary',
    attribution: 'OER Commons',
  };
}

/** Check works for retraction by DOI/OpenAlex id. Returns [] on failure. */
export async function checkRetractions(ids, { signal } = {}) {
  const clean = (ids || []).map(cleanText).filter(Boolean).slice(0, 25);
  if (clean.length === 0) return [];
  try {
    const filter = clean.map((id) => id.replace(/^https?:\/\/(doi\.org|openalex\.org)\//, '')).join('|');
    const url =
      `https://api.openalex.org/works?filter=ids.openalex:${encodeURIComponent(filter)}` +
      `&select=id,display_name,is_retracted&per_page=${clean.length}&mailto=${OPENALEX_MAILTO}`;
    const json = await cachedFetchJson(`retractions:${filter}`, url, { signal });
    return (json.results || [])
      .filter((work) => work.is_retracted)
      .map((work) => ({ id: work.id, title: work.display_name }));
  } catch {
    return [];
  }
}
