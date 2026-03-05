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

export async function searchPapers(query, limit = 5, signal) {
  try {
    const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per_page=${limit}&select=id,display_name,authorships,publication_year,cited_by_count,doi,primary_location&mailto=coursemapper@nyu.edu`;
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`OpenAlex: ${res.status}`);
    const json = await res.json();
    const papers = (json.results || []).map(p => ({
      id: p.id,
      title: p.display_name || 'Untitled',
      authors: (p.authorships || []).map(a => a.author?.display_name).filter(Boolean).slice(0, 3).join(', '),
      year: p.publication_year,
      citationCount: p.cited_by_count || 0,
      doi: p.doi || null,
      url: p.primary_location?.landing_page_url || p.doi || p.id,
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
    const articles = (json.query?.search || []).map(r => ({
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
    const works = (json.message?.items || []).map(item => ({
      title: (item.title || [''])[0],
      authors: (item.author || []).map(a => `${a.given || ''} ${a.family || ''}`.trim()).slice(0, 3).join(', '),
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

// ── Dispatcher ───────────────────────────────────────────────────────────────

const VALID_SOURCES = ['papers', 'wiki', 'crossref'];

export async function executeResearch({ query, sources = ['papers'], limit }, signal) {
  if (!query) return { results: [], formatted: 'No search query provided.' };

  const requested = (sources || ['papers']).filter(s => VALID_SOURCES.includes(s));
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
        default:
          return { source, items: [] };
      }
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      return { source, items: [], error: err.message };
    }
  });

  const results = await Promise.all(promises);
  return { results, formatted: formatResearchResults(results) };
}

// ── Formatter — produces text the LLM can cite with [N] references ───────────

function formatResearchResults(results) {
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
      if (source === 'Wikipedia') {
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
