/**
 * V0.14.1 Phase 2.6 + 4.8 — citation relevance & shard-key display names.
 *
 * The V0.14 four-course audit's single most credibility-damaging defect: the
 * reading-list engine attached the most-cited paper in ALL of science to bare
 * concept terms — MNIST/LeCun for a Geologic Time lesson, "Global cancer
 * statistics" for World Literature, QUANTUM ESPRESSO for mineral ID. This
 * harness pins the fixes:
 *
 *   A/B  discipline-anchored, relevance-ranked search (provider boundary)
 *   C    a topical-relevance gate over already-fetched title+abstract
 *   D    citation-string hygiene (HTML strip, et al., glued initials)
 *   E    humanized shard-key display names (4.8 code side)
 *
 * Fixture-driven, ZERO network: the OpenAlex provider is stubbed and the
 * deterministic engine paths run offline.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { searchScholarlyReadings } from '../src/lib/knowledge/providers.js';
import {
  attachGenomeResources,
  attachOpenReadings,
  scoreReadingRelevance,
} from '../src/lib/knowledge/readingListEngine.js';

// ── Audit fixtures: realistic titles + abstracts ──────────────────────────

// The off-topic "famous but wrong" set, with realistic shapes.
const MNIST_WORK = {
  title: 'Gradient-Based Learning Applied to Document Recognition',
  abstract:
    'We present a convolutional neural network trained end-to-end with backpropagation for ' +
    'handwritten digit classification on the MNIST database. The architecture generalizes to ' +
    'document understanding and reduces error on benchmark recognition tasks.',
  url: 'https://doi.org/10.1109/5.726791',
  citedBy: 60000,
  authors: 'Y. LeCun, L. Bottou, Y. Bengio et al.',
  license: 'open access',
};
const CANCER_STATS_WORK = {
  title: 'Global cancer statistics 2018: estimates of incidence and mortality worldwide',
  abstract:
    'This article provides an update of worldwide cancer incidence and mortality estimates by ' +
    'tumour type, sex, and region, drawing on national registry data and epidemiological models.',
  url: 'https://doi.org/10.3322/caac.21492',
  citedBy: 80000,
  authors: 'F. Bray et al.',
  license: 'open access',
};
const QE_WORK = {
  title: 'QUANTUM ESPRESSO: a modular and open-source software project for quantum simulations of materials',
  abstract:
    'A plane-wave density-functional-theory package for electronic-structure calculations and ' +
    'materials modelling using pseudopotentials and periodic boundary conditions.',
  url: 'https://doi.org/10.1088/0953-8984/21/39/395502',
  citedBy: 30000,
  authors: 'P. Giannozzi et al.',
  license: 'open access',
};

// The audit's ONE good match: Horton 1945 for a stream-erosion lesson.
const HORTON_WORK = {
  title:
    'EROSIONAL DEVELOPMENT OF STREAMS AND THEIR DRAINAGE BASINS; ' +
    'HYDROPHYSICAL APPROACH TO QUANTITATIVE MORPHOLOGY',
  abstract:
    'A quantitative study of drainage-basin development relating stream channels and erosion to ' +
    'overland runoff, infiltration capacity, and the geometry of stream networks.',
  url: 'https://doi.org/10.1130/0016-7606(1945)56[275:EDOSAT]2.0.CO;2',
  citedBy: 9000,
  authors: 'R. E. Horton',
  license: 'cc-by',
};

function geologyGraph({ sessionTitle, conceptTerms, courseName }) {
  return {
    course: { name: courseName },
    sessions: [{ id: 's1', number: 1, title: sessionTitle, sections: [{ topic: 'x' }] }],
    concepts: conceptTerms.map((term, i) => ({ id: `c${i + 1}`, term })),
    edges: { teaches: conceptTerms.map((_, i) => ({ from: 's1', to: `c${i + 1}` })) },
    resources: [],
  };
}

function stubReadings(works) {
  return {
    searchScholarlyReadings: vi.fn(async () => works),
    searchBookMetadata: vi.fn(async () => []), // keep the course-book slot empty
  };
}

beforeEach(() => {
  // Engine paths must never touch the network.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('network call in v0.14.1 citation proof — engine paths must be offline');
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ── C: the relevance gate ─────────────────────────────────────────────────

describe('relevance gate (2.6 C)', () => {
  // Term sets as relevanceTermsForSession would build them.
  const GEO_TIME_TERMS = {
    allTokens: new Set(['geologic', 'time', 'strata', 'superposition', 'historical', 'geology']),
    strongConceptTokens: new Set(['geologic', 'strata', 'superposition']),
    phrases: ['geologic time'],
  };
  const STREAM_TERMS = {
    allTokens: new Set(['stream', 'erosion', 'drainage', 'basin', 'density', 'physical', 'geology']),
    strongConceptTokens: new Set(['stream', 'erosion', 'drainage', 'density']),
    phrases: ['stream erosion', 'drainage basin', 'drainage density'],
  };

  it('rejects the famous-but-off-topic set for a geologic-time lesson', () => {
    for (const work of [MNIST_WORK, CANCER_STATS_WORK, QE_WORK]) {
      const score = scoreReadingRelevance(work, GEO_TIME_TERMS);
      expect(score.pass).toBe(false);
      expect(score.hits).toBeLessThan(2);
      expect(score.phraseHit).toBe(false);
    }
  });

  it('accepts Horton 1945 for a stream-erosion lesson (≥2 hits + phrase match)', () => {
    const score = scoreReadingRelevance(HORTON_WORK, STREAM_TERMS);
    expect(score.pass).toBe(true);
    expect(score.hits).toBeGreaterThanOrEqual(2);
    expect(score.phraseHit).toBe(true);
  });

  it('passes a legitimately single-word concept via a strong concept-token hit', () => {
    const carbs = {
      allTokens: new Set(['carbohydrate', 'nutrition']),
      strongConceptTokens: new Set(['carbohydrate']),
      phrases: [],
    };
    const work = { title: 'Open-access study of carbohydrates', abstract: '' };
    const score = scoreReadingRelevance(work, carbs);
    expect(score.strongConceptHit).toBe(true);
    expect(score.pass).toBe(true);
  });
});

// ── C end-to-end through attachOpenReadings ───────────────────────────────

describe('attachOpenReadings relevance enforcement (2.6 A/B/C)', () => {
  it('attaches NOTHING and records a decision when only off-topic papers come back', async () => {
    const graph = geologyGraph({
      sessionTitle: 'Lesson 1: Relative Dating and the Rock Record',
      conceptTerms: ['geologic time', 'strata', 'superposition'],
      courseName: 'Historical Geology',
    });
    const providers = stubReadings([MNIST_WORK, CANCER_STATS_WORK, QE_WORK]);

    const attached = await attachOpenReadings(graph, { providers });
    expect(attached).toBe(0);
    expect(graph.resources).toHaveLength(0);
    // The decision is recorded compatibly on the graph (return stays a count).
    expect(graph.readingListDecisions).toHaveLength(1);
    const decision = graph.readingListDecisions[0];
    expect(decision.type).toBe('no-relevant-reading');
    expect(decision.rejected).toBe(3);
    expect(decision.message).toMatch(/no relevant open reading found for L1/);
    // The discipline anchor reached the provider call.
    expect(providers.searchScholarlyReadings).toHaveBeenCalledWith(
      'geologic time',
      expect.objectContaining({ anchor: expect.stringContaining('geology') }),
    );
  });

  it('attaches the on-topic Horton paper for a stream-erosion lesson', async () => {
    const graph = geologyGraph({
      sessionTitle: 'Lesson 1: Streams and Drainage Systems',
      conceptTerms: ['stream erosion', 'drainage basin', 'drainage density'],
      courseName: 'Physical Geology',
    });
    // Horton ranks first but the off-topic giants are also "candidates".
    const providers = stubReadings([HORTON_WORK, MNIST_WORK, QE_WORK]);

    const attached = await attachOpenReadings(graph, { providers });
    expect(attached).toBe(1);
    expect(graph.resources).toHaveLength(1);
    expect(graph.resources[0].origin).toBe('openalex');
    expect(graph.resources[0].citation).toContain('DRAINAGE BASINS');
    expect(graph.readingListDecisions || []).toHaveLength(0);
  });
});

// ── E: shard-key display names (4.8 code side) ────────────────────────────

function literatureGraph(citationEntries) {
  return {
    course: { name: 'Writing About Literature' },
    sessions: [{ id: 's1', number: 1, title: 'Lesson 1: Close Reading', sections: [{ topic: 'x' }] }],
    concepts: [],
    edges: { teaches: [] },
    resources: [],
    enrichmentOverlay: {
      lessonContent: {
        'lesson-1': {
          keyTerms: [],
          conceptProvenance: { source: 'genome-linked', citations: citationEntries },
        },
      },
    },
  };
}

describe('shard-key display names (4.8)', () => {
  it('humanizes a raw shard key, never printing the raw key or "(see source)"', () => {
    const graph = literatureGraph(['writing about literature:reference §1']);
    const attached = attachGenomeResources(graph);
    expect(attached).toBe(1);
    const { citation } = graph.resources[0];
    expect(citation).toContain('Writing About Literature (open textbook)');
    // No raw key, no doubled key, no license placeholder.
    expect(citation).not.toContain('writing about literature:reference §1');
    expect(citation).not.toMatch(/:reference\s*§/i);
    expect(citation).not.toContain('(see source)');
    expect(citation).toContain('open license');
    // The humanized title appears exactly once.
    expect(citation.match(/Writing About Literature/g)).toHaveLength(1);
    expect(graph.resources[0].license).toBe('open license');
  });

  it('prefers displayTitle/sourceUrl metadata when the reference carries it', () => {
    const graph = literatureGraph([
      {
        key: 'writing about literature:reference §1',
        displayTitle: 'Writing About Literature, 2nd ed.',
        sourceUrl: 'https://example.org/writing-about-literature',
      },
    ]);
    const attached = attachGenomeResources(graph);
    expect(attached).toBe(1);
    const { citation, url } = graph.resources[0];
    expect(citation).toContain('Writing About Literature, 2nd ed.');
    expect(citation).toContain('https://example.org/writing-about-literature');
    expect(citation).not.toMatch(/:reference\s*§/i);
    expect(url).toBe('https://example.org/writing-about-literature');
  });

  it('leaves human-readable OpenStax labels untouched', () => {
    const graph = literatureGraph(['OpenStax astronomy 2e §2.1']);
    attachGenomeResources(graph);
    const { citation, url, license } = graph.resources[0];
    expect(citation).toContain('OpenStax astronomy 2e §2.1');
    expect(citation).toContain('CC BY 4.0');
    expect(url).toBe('https://openstax.org/books/astronomy-2e');
    expect(license).toBe('CC BY 4.0');
  });

  it('never turns an internal fact-ledger marker into a bibliography row', () => {
    const graph = literatureGraph(['OpenStax astronomy 2e §2.1']);
    graph.enrichmentOverlay.lessonContent['lesson-1'].keyTerms = [
      {
        term: 'Close Reading',
        source: 'fact-ledger-projection',
      },
    ];

    expect(attachGenomeResources(graph)).toBe(1);
    expect(graph.resources).toHaveLength(1);
    expect(graph.resources[0].citation).toContain('OpenStax astronomy 2e §2.1');
    expect(JSON.stringify(graph.resources)).not.toContain('fact-ledger-projection');
  });
});

// ── D: citation string hygiene (provider layer) ───────────────────────────

function openAlexResponse(work) {
  return { results: [work] };
}

describe('citation string hygiene (2.6 D)', () => {
  beforeEach(() => {
    // Provider tests DO exercise fetch + the weekly cache.
    const store = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear(),
    });
  });

  it('appends " et al." when the authorship list is longer than three', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () =>
          openAlexResponse({
            display_name: 'A protein measurement method',
            authorships: [
              { author: { display_name: 'A One' } },
              { author: { display_name: 'B Two' } },
              { author: { display_name: 'C Three' } },
              { author: { display_name: 'D Four' } },
              { author: { display_name: 'E Five' } },
            ],
            publication_year: 2020,
            open_access: { oa_url: 'https://example.org/p.pdf' },
          }),
      }),
    );
    const works = await searchScholarlyReadings('protein measurement et al case');
    expect(works[0].authors).toBe('A One, B Two, C Three et al.');
  });

  it('normalizes glued initials ("OliverH. Lowry" → "Oliver H. Lowry")', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () =>
          openAlexResponse({
            display_name: 'Protein measurement with the Folin phenol reagent',
            authorships: [{ author: { display_name: 'OliverH. Lowry' } }],
            publication_year: 1951,
            open_access: { oa_url: 'https://example.org/lowry.pdf' },
          }),
      }),
    );
    const works = await searchScholarlyReadings('lowry protein glued initials');
    expect(works[0].authors).toBe('Oliver H. Lowry');
  });

  it('strips HTML tags from titles ("of<i>SHELX</i>" → "of SHELX")', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () =>
          openAlexResponse({
            display_name: 'A short history of<i>SHELX</i>',
            authorships: [{ author: { display_name: 'G. Sheldrick' } }],
            publication_year: 2008,
            open_access: { oa_url: 'https://example.org/shelx.pdf' },
          }),
      }),
    );
    const works = await searchScholarlyReadings('shelx html strip title');
    expect(works[0].title).toBe('A short history of SHELX');
    expect(works[0].title).not.toContain('<');
  });

  it('uses relevance ranking (no cited_by_count sort) and anchors the search', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
    vi.stubGlobal('fetch', fetchMock);
    await searchScholarlyReadings('stream erosion', { anchor: 'physical geology', limit: 6 });
    const url = fetchMock.mock.calls[0][0];
    expect(url).not.toContain('sort=cited_by_count');
    expect(url).toContain(encodeURIComponent('stream erosion physical geology'));
    expect(url).toContain('per_page=6');
  });
});
