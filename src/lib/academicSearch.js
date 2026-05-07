/**
 * academicSearch.js — Free academic API wrappers for the AI teaching agent.
 *
 * Three search sources, all free and keyless:
 *   - OpenAlex (250M+ works, abstracts, citations — CORS-friendly)
 *   - Wikipedia (topic overviews with confirmed CORS)
 *   - CrossRef (DOI/citation metadata)
 *
 * Usage:
 *   const { results, formatted } = await executeResearch({ query: 'Bloom taxonomy', sources: ['papers', 'wiki'] });
 */

// ── OpenAlex (replaces Semantic Scholar — browser CORS-friendly) ─────────────

// Reconstruct abstract from OpenAlex's inverted index format
export function reconstructAbstract(invertedIndex) {
  if (!invertedIndex || typeof invertedIndex !== 'object') return null;
  const words = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const pos of positions) {
      words[pos] = word;
    }
  }
  return words.join(' ').slice(0, 300); // cap at 300 chars
}

export async function searchPapers(query, limit = 5, signal) {
  try {
    const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per_page=${limit}&select=id,display_name,authorships,publication_year,cited_by_count,doi,primary_location,abstract_inverted_index&mailto=coursemapper@nyu.edu`;
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`OpenAlex: ${res.status}`);
    const json = await res.json();
    const papers = (json.results || []).map((p) => ({
      id: p.id,
      title: p.display_name || 'Untitled',
      authors: (p.authorships || [])
        .map((a) => a.author?.display_name)
        .filter(Boolean)
        .slice(0, 3)
        .join(', '),
      year: p.publication_year,
      citationCount: p.cited_by_count || 0,
      doi: p.doi || null,
      url: p.primary_location?.landing_page_url || p.doi || p.id,
      abstract: reconstructAbstract(p.abstract_inverted_index),
    }));
    return { papers };
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    console.warn('[CM] OpenAlex search failed:', err.message);
    return { papers: [] };
  }
}

// ── Wikipedia ────────────────────────────────────────────────────────────────

export async function searchWikipedia(query, limit = 3, signal) {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=${limit}&format=json&origin=*&utf8=1`;
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`Wikipedia: ${res.status}`);
    const json = await res.json();
    const articles = (json.query?.search || []).map((r) => ({
      title: r.title,
      snippet: (r.snippet || '').replace(/<[^>]*>/g, '').slice(0, 200),
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, '_'))}`,
    }));
    return { articles };
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    console.warn('[CM] Wikipedia search failed:', err.message);
    return { articles: [] };
  }
}

// ── CrossRef ─────────────────────────────────────────────────────────────────

export async function searchCrossRef(query, limit = 5, signal) {
  try {
    const url = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=${limit}&select=DOI,title,author,published-print,is-referenced-by-count,publisher&mailto=coursemapper@nyu.edu`;
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`CrossRef: ${res.status}`);
    const json = await res.json();
    const works = (json.message?.items || []).map((item) => ({
      title: (item.title || [''])[0],
      authors: (item.author || [])
        .map((a) => `${a.given || ''} ${a.family || ''}`.trim())
        .slice(0, 3)
        .join(', '),
      year: item['published-print']?.['date-parts']?.[0]?.[0] || null,
      doi: item.DOI,
      citationCount: item['is-referenced-by-count'] || 0,
      publisher: item.publisher || '',
    }));
    return { works };
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    console.warn('[CM] CrossRef search failed:', err.message);
    return { works: [] };
  }
}

// ── YouTube (via Invidious — free, no key, CORS-friendly) ───────────────────

const INVIDIOUS_INSTANCES = ['https://vid.puffyan.us', 'https://invidious.snopyta.org', 'https://yewtu.be'];

export async function searchVideos(query, limit = 5, signal) {
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const url = `${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video&sort=relevance&page=1`;
      const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
      if (!res.ok) continue;
      const json = await res.json();
      const videos = (json || []).slice(0, limit).map((v) => ({
        title: v.title || 'Untitled',
        author: v.author || '',
        videoId: v.videoId,
        lengthSeconds: v.lengthSeconds || 0,
        viewCount: v.viewCountText || v.viewCount || 0,
        thumbnail: v.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
        url: `https://www.youtube.com/watch?v=${v.videoId}`,
      }));
      return { videos };
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      continue; // try next instance
    }
  }
  console.warn('[CM] All Invidious instances failed');
  return { videos: [] };
}

// ── Open Library (books, textbooks) ────────────────────────────────────────

export async function searchBooks(query, limit = 5, signal) {
  try {
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=${limit}&fields=title,author_name,first_publish_year,publisher,isbn,cover_i,subject`;
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`OpenLibrary: ${res.status}`);
    const json = await res.json();
    const books = (json.docs || []).map((b) => ({
      title: b.title || 'Untitled',
      authors: (b.author_name || []).slice(0, 3).join(', '),
      year: b.first_publish_year || null,
      publisher: (b.publisher || [])[0] || '',
      isbn: (b.isbn || [])[0] || null,
      coverUrl: b.cover_i ? `https://covers.openlibrary.org/b/id/${b.cover_i}-M.jpg` : null,
      subjects: (b.subject || []).slice(0, 3).join(', '),
      url: b.isbn?.[0]
        ? `https://openlibrary.org/isbn/${b.isbn[0]}`
        : `https://openlibrary.org/search?q=${encodeURIComponent(b.title)}`,
    }));
    return { books };
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    console.warn('[CM] Open Library search failed:', err.message);
    return { books: [] };
  }
}

// ── Google Books ─────────────────────────────────────────────────────────────

export async function searchGoogleBooks(query, limit = 5, signal) {
  try {
    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=${limit}&printType=books`;
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`Google Books: ${res.status}`);
    const json = await res.json();
    const books = (json.items || []).map((item) => {
      const v = item.volumeInfo || {};
      return {
        title: v.title || 'Untitled',
        authors: (v.authors || []).slice(0, 3).join(', '),
        year: v.publishedDate ? parseInt(v.publishedDate) : null,
        publisher: v.publisher || '',
        pageCount: v.pageCount || null,
        categories: (v.categories || []).slice(0, 3).join(', '),
        previewLink: v.previewLink || '',
        thumbnail: v.imageLinks?.thumbnail || null,
        maturityRating: v.maturityRating || '',
        isbn:
          (v.industryIdentifiers || []).find((id) => id.type === 'ISBN_13')?.identifier ||
          (v.industryIdentifiers || []).find((id) => id.type === 'ISBN_10')?.identifier ||
          null,
      };
    });
    return { books };
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    console.warn('[CM] Google Books search failed:', err.message);
    return { books: [] };
  }
}

// ── Citation Formatting (APA via citation-js) ────────────────────────────────

let Cite = null;
async function loadCitationJs() {
  if (!Cite) {
    const mod = await import('citation-js');
    Cite = mod.default || mod.Cite;
  }
  return Cite;
}

export async function formatCitation(doi) {
  try {
    const CiteClass = await loadCitationJs();
    const cite = new CiteClass(doi);
    return cite.format('bibliography', { format: 'text', template: 'apa', lang: 'en-US' }).trim();
  } catch {
    return null;
  }
}

// ── Dispatcher ───────────────────────────────────────────────────────────────

const VALID_SOURCES = ['papers', 'wiki', 'crossref', 'videos', 'books', 'gbooks'];

export async function executeResearch({ query, sources = ['papers'], limit }, signal) {
  if (!query) return { results: [], formatted: 'No search query provided.' };

  const requested = (sources || ['papers']).filter((s) => VALID_SOURCES.includes(s));
  if (requested.length === 0) requested.push('papers');

  const promises = requested.map(async (source) => {
    try {
      switch (source) {
        case 'papers': {
          const { papers } = await searchPapers(query, limit || 5, signal);
          return { source: 'OpenAlex', items: papers };
        }
        case 'wiki': {
          const { articles } = await searchWikipedia(query, limit || 3, signal);
          return { source: 'Wikipedia', items: articles };
        }
        case 'crossref': {
          const { works } = await searchCrossRef(query, limit || 5, signal);
          return { source: 'CrossRef', items: works };
        }
        case 'videos': {
          const { videos } = await searchVideos(query, limit || 5, signal);
          return { source: 'YouTube', items: videos };
        }
        case 'books': {
          const { books } = await searchBooks(query, limit || 5, signal);
          return { source: 'Open Library', items: books };
        }
        case 'gbooks': {
          const { books } = await searchGoogleBooks(query, limit || 5, signal);
          return { source: 'Google Books', items: books };
        }
        default:
          return { source, items: [] };
      }
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      return { source, items: [], error: err.message };
    }
  });

  const results = await Promise.all(promises);

  // Try to format APA citations for items with DOIs
  let citationBlock = '';
  try {
    const CiteClass = await loadCitationJs();
    const dois = [];
    for (const { items } of results) {
      for (const item of items || []) {
        if (item.doi) dois.push(item.doi);
      }
    }
    if (dois.length > 0 && CiteClass) {
      const cite = new CiteClass(dois.slice(0, 5)); // limit to 5 for speed
      citationBlock =
        '\n\n=== FORMATTED CITATIONS (APA) ===\n' +
        cite.format('bibliography', { format: 'text', template: 'apa', lang: 'en-US' }).trim() +
        '\n=== END CITATIONS ===';
    }
  } catch {
    /* citation formatting is optional */
  }

  return { results, formatted: formatResearchResults(results) + citationBlock };
}

// ── Formatter — produces text the LLM can cite with [N] references ───────────

export function formatResearchResults(results) {
  const lines = ['=== RESEARCH RESULTS ==='];
  let refNum = 1;

  for (const { source, items, error } of results) {
    if (error) {
      lines.push(`\n[${source}] Search failed: ${error}`);
      continue;
    }
    if (!items || items.length === 0) {
      lines.push(`\n[${source}] No results found.`);
      continue;
    }

    lines.push(`\n--- ${source} ---`);

    for (const item of items) {
      if (source === 'Open Library') {
        const pubStr = item.publisher ? ` — ${item.publisher}` : '';
        const yearStr = item.year ? ` (${item.year})` : '';
        const isbnStr = item.isbn ? ` — ISBN: ${item.isbn}` : '';
        lines.push(`[${refNum}] Book: "${item.title}" by ${item.authors || 'Unknown'}${yearStr}${pubStr}${isbnStr}`);
      } else if (source === 'Google Books') {
        const pubStr = item.publisher ? ` — ${item.publisher}` : '';
        const yearStr = item.year ? ` (${item.year})` : '';
        const pagesStr = item.pageCount ? ` — ${item.pageCount} pages` : '';
        const catStr = item.categories ? ` [${item.categories}]` : '';
        lines.push(
          `[${refNum}] GBooks: "${item.title}" by ${item.authors || 'Unknown'}${yearStr}${pubStr}${pagesStr}${catStr}`,
        );
      } else if (source === 'YouTube') {
        const duration = item.lengthSeconds
          ? `${Math.floor(item.lengthSeconds / 60)}:${String(item.lengthSeconds % 60).padStart(2, '0')}`
          : '';
        const views = item.viewCount
          ? ` — ${typeof item.viewCount === 'number' ? item.viewCount.toLocaleString() + ' views' : item.viewCount}`
          : '';
        lines.push(`[${refNum}] YouTube: "${item.title}" by ${item.author} (${duration})${views} — ${item.url}`);
      } else if (source === 'Wikipedia') {
        lines.push(`[${refNum}] Wikipedia: "${item.title}" — ${item.snippet}`);
      } else {
        const authorStr = item.authors ? ` by ${item.authors}` : '';
        const yearStr = item.year ? ` (${item.year})` : '';
        const citeStr = item.citationCount ? ` — ${item.citationCount} citations` : '';
        const abstractStr = item.abstract ? `\n    Abstract: ${item.abstract}` : '';
        lines.push(`[${refNum}] "${item.title}"${authorStr}${yearStr}${citeStr}${abstractStr}`);
      }
      refNum++;
    }
  }

  lines.push('\n=== END RESEARCH RESULTS ===');
  lines.push('Use [N] citation format when referencing these results in your response.');
  return lines.join('\n');
}
