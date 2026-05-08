import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  reconstructAbstract,
  searchPapers,
  searchWikipedia,
  searchCrossRef,
  searchVideos,
  searchBooks,
  searchGoogleBooks,
  formatCitation,
  formatCitationFromMetadata,
  formatResearchResults,
  executeResearch,
} from '../academicSearch';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

// ── reconstructAbstract ──────────────────────────────────────────────────────

describe('reconstructAbstract', () => {
  it('reconstructs text from inverted index', () => {
    const index = { hello: [0], world: [1], foo: [2] };
    expect(reconstructAbstract(index)).toBe('hello world foo');
  });

  it('returns null for null input', () => {
    expect(reconstructAbstract(null)).toBeNull();
  });

  it('returns null for non-object input', () => {
    expect(reconstructAbstract('not an object')).toBeNull();
  });

  it('caps output at 300 characters', () => {
    const index = {};
    // Build an inverted index that produces a very long string
    for (let i = 0; i < 200; i++) {
      index[`word${i}xyzzy`] = [i];
    }
    const result = reconstructAbstract(index);
    expect(result.length).toBeLessThanOrEqual(300);
  });
});

// ── searchPapers ─────────────────────────────────────────────────────────────

describe('searchPapers', () => {
  const openAlexFixture = {
    results: [
      {
        id: 'W123',
        display_name: 'Test Paper',
        authorships: [{ author: { display_name: 'Alice' } }, { author: { display_name: 'Bob' } }],
        publication_year: 2023,
        cited_by_count: 42,
        doi: 'https://doi.org/10.1234/test',
        primary_location: { landing_page_url: 'https://example.com/paper' },
        abstract_inverted_index: { This: [0], is: [1], abstract: [2] },
      },
    ],
  };

  it('returns parsed papers from OpenAlex response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => openAlexFixture,
    });
    const { papers } = await searchPapers('bloom taxonomy');
    expect(papers).toHaveLength(1);
    expect(papers[0].title).toBe('Test Paper');
    expect(papers[0].authors).toBe('Alice, Bob');
    expect(papers[0].year).toBe(2023);
    expect(papers[0].citationCount).toBe(42);
    expect(papers[0].abstract).toBe('This is abstract');
  });

  it('returns empty papers on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    const { papers } = await searchPapers('anything');
    expect(papers).toEqual([]);
  });

  it('rethrows AbortError', async () => {
    const abortErr = new DOMException('Aborted', 'AbortError');
    mockFetch.mockRejectedValueOnce(abortErr);
    await expect(searchPapers('query')).rejects.toThrow();
  });
});

// ── searchWikipedia ──────────────────────────────────────────────────────────

describe('searchWikipedia', () => {
  it('parses articles and strips HTML from snippets', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        query: {
          search: [{ title: 'Bloom Taxonomy', snippet: '<span class="highlight">Bloom</span> is great' }],
        },
      }),
    });
    const { articles } = await searchWikipedia('bloom');
    expect(articles).toHaveLength(1);
    expect(articles[0].title).toBe('Bloom Taxonomy');
    expect(articles[0].snippet).toBe('Bloom is great');
    expect(articles[0].snippet).not.toContain('<');
    expect(articles[0].url).toContain('Bloom_Taxonomy');
  });

  it('returns empty articles on error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });
    const { articles } = await searchWikipedia('test');
    expect(articles).toEqual([]);
  });
});

// ── searchCrossRef ───────────────────────────────────────────────────────────

describe('searchCrossRef', () => {
  it('parses works with author, year, and citation count', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        message: {
          items: [
            {
              title: ['CrossRef Paper Title'],
              author: [
                { given: 'Jane', family: 'Doe' },
                { given: 'John', family: 'Smith' },
              ],
              'published-print': { 'date-parts': [[2021]] },
              DOI: '10.5678/cr-test',
              'is-referenced-by-count': 15,
              publisher: 'Springer',
            },
          ],
        },
      }),
    });
    const { works } = await searchCrossRef('education');
    expect(works).toHaveLength(1);
    expect(works[0].title).toBe('CrossRef Paper Title');
    expect(works[0].authors).toBe('Jane Doe, John Smith');
    expect(works[0].year).toBe(2021);
    expect(works[0].doi).toBe('10.5678/cr-test');
    expect(works[0].citationCount).toBe(15);
    expect(works[0].publisher).toBe('Springer');
  });

  it('returns empty works on error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network'));
    const { works } = await searchCrossRef('fail');
    expect(works).toEqual([]);
  });
});

// ── searchVideos ─────────────────────────────────────────────────────────────

describe('searchVideos', () => {
  it('returns videos from first Invidious instance', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          title: 'Test Video',
          author: 'Educator',
          videoId: 'abc123',
          lengthSeconds: 600,
          viewCountText: '1K views',
          videoThumbnails: [{ url: 'https://thumb.example.com/img.jpg' }],
        },
      ],
    });
    const { videos } = await searchVideos('lesson');
    expect(videos).toHaveLength(1);
    expect(videos[0].title).toBe('Test Video');
    expect(videos[0].author).toBe('Educator');
    expect(videos[0].videoId).toBe('abc123');
    expect(videos[0].url).toBe('https://www.youtube.com/watch?v=abc123');
  });

  it('falls back to next instance when first fails', async () => {
    // First instance fails
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });
    // Second instance succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ title: 'Fallback Video', author: 'Author2', videoId: 'def456', lengthSeconds: 120 }],
    });
    const { videos } = await searchVideos('test');
    expect(videos).toHaveLength(1);
    expect(videos[0].title).toBe('Fallback Video');
  });

  it('returns empty when all instances fail', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    const { videos } = await searchVideos('test');
    expect(videos).toEqual([]);
  });

  it('rethrows AbortError', async () => {
    const abortErr = new DOMException('Aborted', 'AbortError');
    mockFetch.mockRejectedValueOnce(abortErr);
    await expect(searchVideos('test')).rejects.toThrow();
  });
});

// ── searchBooks ──────────────────────────────────────────────────────────────

describe('searchBooks', () => {
  it('parses Open Library response with cover URL', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        docs: [
          {
            title: 'Learning Book',
            author_name: ['Author One'],
            first_publish_year: 2019,
            publisher: ['MIT Press'],
            isbn: ['9781234567890'],
            cover_i: 12345,
            subject: ['Education', 'Teaching'],
          },
        ],
      }),
    });
    const { books } = await searchBooks('teaching');
    expect(books).toHaveLength(1);
    expect(books[0].title).toBe('Learning Book');
    expect(books[0].authors).toBe('Author One');
    expect(books[0].year).toBe(2019);
    expect(books[0].isbn).toBe('9781234567890');
    expect(books[0].coverUrl).toBe('https://covers.openlibrary.org/b/id/12345-M.jpg');
  });

  it('returns null coverUrl when cover_i is absent', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        docs: [{ title: 'No Cover Book' }],
      }),
    });
    const { books } = await searchBooks('test');
    expect(books[0].coverUrl).toBeNull();
  });
});

// ── searchGoogleBooks ────────────────────────────────────────────────────────

describe('searchGoogleBooks', () => {
  it('calls Google Books API without API key param', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          {
            volumeInfo: {
              title: 'Google Book',
              authors: ['GAuthor'],
              publishedDate: '2020-01-01',
              publisher: 'O Reilly',
              pageCount: 350,
              categories: ['Computers'],
              previewLink: 'https://books.google.com/preview',
              imageLinks: { thumbnail: 'https://thumb.google.com/img.jpg' },
              industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780987654321' }],
            },
          },
        ],
      }),
    });
    const { books } = await searchGoogleBooks('programming');

    // Verify URL has no API key
    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).not.toContain('key=');

    expect(books).toHaveLength(1);
    expect(books[0].title).toBe('Google Book');
    expect(books[0].year).toBe(2020);
    expect(books[0].isbn).toBe('9780987654321');
    expect(books[0].thumbnail).toBe('https://thumb.google.com/img.jpg');
  });
});

// ── citation formatting ──────────────────────────────────────────────────────

describe('citation formatting', () => {
  it('formats CrossRef metadata without loading a large citation library', () => {
    const citation = formatCitationFromMetadata({
      title: ['Teaching for Transfer'],
      author: [
        { given: 'Jane', family: 'Doe' },
        { given: 'Max', family: 'Nguyen' },
      ],
      'published-print': { 'date-parts': [[2022]] },
      DOI: '10.1000/transfer',
      publisher: 'Learning Press',
    });

    expect(citation).toBe(
      'Doe, J. & Nguyen, M. (2022). Teaching for Transfer. Learning Press. https://doi.org/10.1000/transfer',
    );
  });

  it('fetches CrossRef metadata when only a DOI is provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        message: {
          title: ['Retrieved Citation'],
          author: [{ given: 'Alex', family: 'Rivera' }],
          issued: { 'date-parts': [[2021]] },
          DOI: '10.2000/retrieved',
        },
      }),
    });

    await expect(formatCitation('https://doi.org/10.2000/retrieved')).resolves.toBe(
      'Rivera, A. (2021). Retrieved Citation. https://doi.org/10.2000/retrieved',
    );
    expect(mockFetch.mock.calls[0][0]).toContain('api.crossref.org/works/10.2000%2Fretrieved');
  });
});

// ── formatResearchResults ────────────────────────────────────────────────────

describe('formatResearchResults', () => {
  it('formats papers with abstract', () => {
    const results = [
      {
        source: 'OpenAlex',
        items: [{ title: 'My Paper', authors: 'A, B', year: 2023, citationCount: 10, abstract: 'Some abstract text' }],
      },
    ];
    const output = formatResearchResults(results);
    expect(output).toContain('[1] "My Paper"');
    expect(output).toContain('by A, B');
    expect(output).toContain('(2023)');
    expect(output).toContain('10 citations');
    expect(output).toContain('Abstract: Some abstract text');
  });

  it('formats YouTube results with duration', () => {
    const results = [
      {
        source: 'YouTube',
        items: [
          {
            title: 'Video Title',
            author: 'Chan',
            lengthSeconds: 125,
            viewCount: 5000,
            url: 'https://youtube.com/watch?v=x',
          },
        ],
      },
    ];
    const output = formatResearchResults(results);
    expect(output).toContain('YouTube: "Video Title"');
    expect(output).toContain('2:05');
  });

  it('formats Open Library books', () => {
    const results = [
      {
        source: 'Open Library',
        items: [{ title: 'OL Book', authors: 'Author X', year: 2018, publisher: 'Pub', isbn: '1234' }],
      },
    ];
    const output = formatResearchResults(results);
    expect(output).toContain('Book: "OL Book"');
    expect(output).toContain('by Author X');
    expect(output).toContain('(2018)');
    expect(output).toContain('ISBN: 1234');
  });

  it('formats Google Books', () => {
    const results = [
      {
        source: 'Google Books',
        items: [{ title: 'GB Book', authors: 'Auth', year: 2020, publisher: 'Pub', pageCount: 100, categories: 'CS' }],
      },
    ];
    const output = formatResearchResults(results);
    expect(output).toContain('GBooks: "GB Book"');
    expect(output).toContain('100 pages');
    expect(output).toContain('[CS]');
  });

  it('formats Wikipedia results', () => {
    const results = [
      {
        source: 'Wikipedia',
        items: [{ title: 'Wiki Article', snippet: 'A short snippet' }],
      },
    ];
    const output = formatResearchResults(results);
    expect(output).toContain('Wikipedia: "Wiki Article"');
    expect(output).toContain('A short snippet');
  });

  it('handles error source', () => {
    const results = [{ source: 'OpenAlex', items: [], error: 'timeout' }];
    const output = formatResearchResults(results);
    expect(output).toContain('[OpenAlex] Search failed: timeout');
  });

  it('handles empty source with no items', () => {
    const results = [{ source: 'CrossRef', items: [] }];
    const output = formatResearchResults(results);
    expect(output).toContain('[CrossRef] No results found.');
  });
});

// ── executeResearch ──────────────────────────────────────────────────────────

describe('executeResearch', () => {
  it('returns early for empty query', async () => {
    const result = await executeResearch({ query: '' });
    expect(result.results).toEqual([]);
    expect(result.formatted).toContain('No search query');
  });

  it('routes to papers source and returns results', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            id: 'W999',
            display_name: 'Research Paper',
            authorships: [{ author: { display_name: 'Researcher' } }],
            publication_year: 2024,
            cited_by_count: 5,
            doi: null,
            primary_location: null,
            abstract_inverted_index: null,
          },
        ],
      }),
    });
    const result = await executeResearch({ query: 'test topic', sources: ['papers'] });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].source).toBe('OpenAlex');
    expect(result.results[0].items).toHaveLength(1);
    expect(result.results[0].items[0].title).toBe('Research Paper');
  });

  it('defaults to papers when no sources specified', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });
    const result = await executeResearch({ query: 'test' });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].source).toBe('OpenAlex');
  });

  it('includes formatted citations for DOI-backed results without extra network calls', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        message: {
          items: [
            {
              title: ['CrossRef Paper Title'],
              author: [{ given: 'Jane', family: 'Doe' }],
              'published-print': { 'date-parts': [[2021]] },
              DOI: '10.5678/cr-test',
              'is-referenced-by-count': 15,
              publisher: 'Springer',
            },
          ],
        },
      }),
    });

    const result = await executeResearch({ query: 'education', sources: ['crossref'] });
    expect(result.formatted).toContain('=== FORMATTED CITATIONS (APA) ===');
    expect(result.formatted).toContain(
      'Doe, J. (2021). CrossRef Paper Title. Springer. https://doi.org/10.5678/cr-test',
    );
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
