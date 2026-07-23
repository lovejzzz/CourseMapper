/**
 * v0.13.5 Open Knowledge Backbone — provider layer, reading-list engine,
 * pedagogy evidence, and compiler integration. All network is mocked:
 * recorded-fixture responses only, and the deterministic paths are proven
 * to make ZERO fetch calls.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { searchScholarlyReadings, searchEducationResearch, searchBookMetadata, isoWeekStamp } from '../providers.js';
import { attachGenomeResources, attachOpenReadings, knowledgeCoverage } from '../readingListEngine.js';
import { PEDAGOGY_EVIDENCE, evidenceForMove, buildMethodsStatement } from '../pedagogyEvidence.js';
import { whyThisWorksNote } from '../pedagogyEvidence.js';
import { createEmptyCourseGraph } from '../../courseGraph/schema.js';
import { renderCourseMapFromGraph } from '../../courseGraph/renderCourseMap.js';
import { buildBlueprintFromGraph } from '../../courseGraph/blueprintFromGraph.js';
import { compileBlueprintDeliverables } from '../../courseBlueprintCompiler.js';

// ── Recorded fixtures (shape-accurate slices of real API responses) ──

const OPENALEX_FIXTURE = {
  results: [
    {
      id: 'https://openalex.org/W2128635872',
      display_name: 'Test-enhanced learning in the classroom',
      authorships: [{ author: { display_name: 'Henry L. Roediger' } }, { author: { display_name: 'Jane Doe' } }],
      publication_year: 2006,
      cited_by_count: 4521,
      doi: 'https://doi.org/10.1111/j.1467-9280.2006.01693.x',
      primary_location: { license: 'open access', landing_page_url: 'https://example.org/primary' },
      best_oa_location: { license: 'cc-by', pdf_url: 'https://example.org/best-oa.pdf' },
      open_access: { oa_url: 'https://example.org/oa.pdf' },
      abstract_inverted_index: { Testing: [0], improves: [1], retention: [2] },
    },
  ],
};

const ERIC_FIXTURE = {
  response: {
    docs: [
      {
        id: 'EJ1234567',
        title: 'Retrieval Practice in College Classrooms',
        author: ['Smith, A.', 'Jones, B.'],
        publicationdateyear: '2019',
        description: 'A study of retrieval practice.',
        peerreviewed: 'T',
        url: 'https://eric.ed.gov/?id=EJ1234567',
      },
    ],
  },
};

const OPENLIBRARY_FIXTURE = {
  docs: [
    {
      title: 'Astronomy',
      author_name: ['Andrew Fraknoi', 'David Morrison'],
      first_publish_year: 2016,
      publisher: ['OpenStax'],
      isbn: ['9781938168284'],
      key: '/works/OL17317183W',
    },
  ],
};

function localStorageStub() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', localStorageStub());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('knowledge providers (P0)', () => {
  it('parses OpenAlex works with license/attribution/url on every result', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => OPENALEX_FIXTURE }));
    const works = await searchScholarlyReadings('retrieval practice');
    expect(works).toHaveLength(1);
    expect(works[0].title).toBe('Test-enhanced learning in the classroom');
    expect(works[0].url).toBe('https://example.org/best-oa.pdf');
    expect(works[0].license).toBe('cc-by');
    expect(works[0].attribution).toContain('OpenAlex');
    expect(works[0].abstract).toContain('Testing improves retention');
    // Contact attribution + retraction filter are part of the contract.
    const url = fetch.mock.calls[0][0];
    expect(url).toContain('mailto=');
    expect(url).toContain('is_retracted:false');
    expect(url).toContain('best_oa_location');
  });

  it('parses ERIC docs and degrades to [] on HTTP failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ERIC_FIXTURE }));
    const docs = await searchEducationResearch('retrieval practice');
    expect(docs[0].ericId).toBe('EJ1234567');
    expect(docs[0].peerReviewed).toBe(true);
    expect(docs[0].license).toBeTruthy();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    expect(await searchEducationResearch('anything else')).toEqual([]);
  });

  it('parses Open Library books and degrades to [] on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => OPENLIBRARY_FIXTURE }));
    const books = await searchBookMetadata('astronomy');
    expect(books[0].isbn).toBe('9781938168284');
    expect(books[0].url).toBe('https://openlibrary.org/works/OL17317183W');

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await searchBookMetadata('astronomy offline')).toEqual([]);
  });

  it('caches by query + ISO week: the second identical call makes no fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => OPENALEX_FIXTURE });
    vi.stubGlobal('fetch', fetchMock);
    await searchScholarlyReadings('kepler laws');
    await searchScholarlyReadings('kepler laws');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('opens one OpenAlex circuit after a 429 instead of issuing one failed request per lesson', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: { get: () => '1' },
    });
    vi.stubGlobal('fetch', fetchMock);
    const results = await Promise.all(
      ['quota topic one', 'quota topic two', 'quota topic three', 'quota topic four'].map((query) =>
        searchScholarlyReadings(query),
      ),
    );
    expect(results.every((works) => works.rateLimited === true)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('isoWeekStamp is stable within a week and ISO-8601 correct', () => {
    // Local-time constructors — string dates parse as UTC midnight and
    // shift a day in negative-offset timezones.
    expect(isoWeekStamp(new Date(2026, 0, 1, 12))).toBe('2026-W01');
    expect(isoWeekStamp(new Date(2026, 5, 10, 12))).toBe(isoWeekStamp(new Date(2026, 5, 9, 12)));
  });
});

// ── Reading-list engine fixtures ──

function genomeLinkedGraph() {
  const graph = createEmptyCourseGraph({ courseName: 'Introduction to Astronomy' });
  graph.sessions = [
    { id: 's1', number: 1, title: 'Lesson 1: The Night Sky', sections: [{ topic: '1.1: Celestial sphere' }] },
    { id: 's2', number: 2, title: 'Lesson 2: Orbits', sections: [{ topic: '2.1: Kepler' }] },
  ];
  graph.concepts = [
    { id: 'c1', term: 'celestial sphere' },
    { id: 'c2', term: 'Kepler’s laws' },
  ];
  graph.edges.teaches = [
    { from: 's1', to: 'c1' },
    { from: 's2', to: 'c2' },
  ];
  graph.enrichmentOverlay = {
    lessonContent: {
      'lesson-1': {
        keyTerms: [
          { term: 'celestial sphere', definition: 'an imaginary sphere', source: 'OpenStax astronomy 2e §2.1' },
        ],
        conceptProvenance: { source: 'genome-linked', citations: ['OpenStax astronomy 2e §2.1'] },
      },
      'lesson-2': {
        keyTerms: [
          { term: 'Kepler’s laws', definition: 'planetary motion laws', source: 'OpenStax astronomy 2e §3.1' },
        ],
        conceptProvenance: { source: 'genome-linked', citations: ['OpenStax astronomy 2e §3.1'] },
      },
    },
  };
  return graph;
}

describe('reading-list engine (P2)', () => {
  it('attaches genome anchor sections as Resource entities with NO network', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const graph = genomeLinkedGraph();
    const attached = attachGenomeResources(graph);
    expect(attached).toBe(2);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(graph.resources).toHaveLength(2);
    expect(graph.resources[0].origin).toBe('genome');
    expect(graph.resources[0].license).toBe('CC BY 4.0');
    expect(graph.resources[0].url).toBe('https://openstax.org/books/astronomy-2e');
    expect(graph.sessions[0].sections[0].resourceRefs).toEqual([graph.resources[0].id]);
    // Idempotent: a second pass adds nothing.
    expect(attachGenomeResources(graph)).toBe(0);
  });

  it('does not turn an internal quiz-projection marker into bibliography debt', () => {
    const graph = genomeLinkedGraph();
    graph.enrichmentOverlay.lessonContent = {
      'lesson-1': {
        keyTerms: [
          {
            term: 'Energy balance',
            definition: 'A definition projected from an already admitted quiz explanation.',
            source: 'verified-quiz-projection',
          },
        ],
        conceptProvenance: { source: 'model-authored', citations: [] },
      },
    };

    expect(attachGenomeResources(graph)).toBe(0);
    expect(graph.resources).toEqual([]);
    expect(graph.sessions[0].sections[0].resourceRefs).toBeUndefined();
  });

  it('does not turn any compiler-owned projection marker into a fake open textbook', () => {
    const graph = genomeLinkedGraph();
    graph.enrichmentOverlay.lessonContent = {
      'lesson-1': {
        keyTerms: [
          {
            term: 'Comparative reading',
            definition: 'A compiler-owned method term projected from earlier admitted lesson evidence.',
            source: 'comparative-method-projection',
          },
        ],
        conceptProvenance: { source: 'model-authored', citations: [] },
      },
    };

    expect(attachGenomeResources(graph)).toBe(0);
    expect(graph.resources).toEqual([]);
    expect(graph.sessions[0].sections[0].resourceRefs).toBeUndefined();
  });

  it('preserves explicit government-guidance URL, license, and attribution metadata', () => {
    const graph = genomeLinkedGraph();
    graph.enrichmentOverlay.lessonContent['lesson-1'].conceptProvenance.citations = [
      {
        key: 'govuk:plan user research §Set your research objectives',
        displayTitle: 'Plan a round of user research §Set your research objectives',
        sourceUrl: 'https://www.gov.uk/service-manual/user-research/plan-round-of-user-research',
        license: 'Open Government Licence v3.0',
        attribution: 'UK Government Service Manual',
        kind: 'open resource',
        evidence: 'Each round of user research should have clear objectives.',
        sourceTier: 2,
        conceptLinks: [{ id: 'ux/research-planning', label: 'Research planning' }],
      },
    ];
    graph.enrichmentOverlay.lessonContent['lesson-1'].keyTerms = [];

    attachGenomeResources(graph);

    expect(graph.resources[0]).toMatchObject({
      citation: expect.stringContaining('Plan a round of user research §Set your research objectives'),
      url: 'https://www.gov.uk/service-manual/user-research/plan-round-of-user-research',
      license: 'Open Government Licence v3.0',
      attribution: 'UK Government Service Manual',
      kind: 'open resource',
      evidence: 'Each round of user research should have clear objectives.',
      sourceTier: 2,
      conceptLinks: [{ id: 'ux/research-planning', label: 'Research planning' }],
      origin: 'genome',
    });
    expect(graph.resources[0].citation).toContain('(open resource, Open Government Licence v3.0');
  });

  it('renders attached resources into supportingResources cells', () => {
    const graph = genomeLinkedGraph();
    attachGenomeResources(graph);
    const map = renderCourseMapFromGraph(graph);
    expect(map.lessons[0].sections[0].supportingResources).toContain('OpenStax astronomy 2e §2.1');
    expect(map.lessons[0].sections[0].supportingResources).toContain('CC BY 4.0');
  });

  it('attaches one explicit-license open reading per session without promoting metadata-only books', async () => {
    const graph = genomeLinkedGraph();
    const providers = {
      searchScholarlyReadings: vi.fn(async (query) => [
        {
          title: `Generic open-access study of ${query}`,
          authors: 'A. Researcher',
          year: 2020,
          url: 'https://doi.org/10.9999/generic',
          license: 'open access',
          attribution: 'OpenAlex (CC0 metadata)',
        },
        {
          title: `Open study of ${query}`,
          authors: 'A. Researcher',
          year: 2021,
          url: 'https://doi.org/10.1234/example',
          license: 'cc-by',
          attribution: 'OpenAlex (CC0 metadata)',
        },
      ]),
      searchBookMetadata: vi.fn(async () => [
        {
          title: 'Astronomy',
          authors: 'Fraknoi',
          year: 2016,
          publisher: 'OpenStax',
          isbn: '9781938168284',
          url: 'https://openlibrary.org/works/OL1',
        },
      ]),
    };
    const attached = await attachOpenReadings(graph, { providers });
    expect(attached).toBe(2);
    expect(providers.searchScholarlyReadings).toHaveBeenCalledWith('celestial sphere', expect.anything());
    const openalex = graph.resources.filter((resource) => resource.origin === 'openalex');
    expect(openalex).toHaveLength(2);
    expect(openalex.every((resource) => resource.license === 'cc-by')).toBe(true);
    expect(graph.resources.filter((resource) => resource.origin === 'openlibrary')).toHaveLength(0);
    expect(providers.searchBookMetadata).not.toHaveBeenCalled();
  });

  it('normalizes terminal punctuation before joining a scholarly title to its access note', async () => {
    const graph = genomeLinkedGraph();
    const providers = {
      searchScholarlyReadings: vi.fn(async (query) => [
        {
          title: `Studies of ${query}.`,
          abstract: `${query} evidence and classroom application for astronomy learning.`,
          authors: 'A. Researcher',
          year: 2024,
          url: 'https://doi.org/10.1234/punctuated-title',
          license: 'cc-by',
        },
      ]),
      searchBookMetadata: vi.fn(async () => []),
    };

    expect(await attachOpenReadings(graph, { providers, maxSessions: 1 })).toBe(1);
    const citation = graph.resources.find((resource) => resource.origin === 'openalex')?.citation || '';
    expect(citation).toContain('Studies of celestial sphere. Open-access via');
    expect(citation).not.toContain('.. Open-access via');
  });

  it('rejects the real UX architectural-studio and sonification false friends before attachment', async () => {
    const graph = createEmptyCourseGraph({ courseName: 'User Experience Design Studio' });
    graph.sessions = [
      {
        id: 's1',
        number: 1,
        title: 'Lesson 1: Contextual Interviews and Observation',
        sections: [{ topic: '1.1: Contextual Interviews and Observation' }],
      },
      {
        id: 's2',
        number: 2,
        title: 'Lesson 2: Affinity Mapping and Synthesis',
        sections: [{ topic: '2.1: Affinity Mapping and Synthesis' }],
      },
    ];
    graph.concepts = [
      { id: 'c1', term: 'contextual interviews and observation' },
      { id: 'c2', term: 'affinity mapping and synthesis' },
    ];
    graph.edges.teaches = [
      { from: 's1', to: 'c1' },
      { from: 's2', to: 'c2' },
    ];
    const work = (title, abstract, url) => ({
      title,
      abstract,
      authors: 'A. Researcher',
      year: 2024,
      url,
      license: 'cc-by',
      attribution: 'OpenAlex (CC0 metadata)',
    });
    const providers = {
      searchScholarlyReadings: vi.fn(async (query) =>
        /interview/i.test(query)
          ? [
              work(
                'A Systematic Review of Design Creativity in the Architectural Design Studio',
                'Observations and interviews examine the design studio process and creativity.',
                'https://doi.org/10.3390/buildings11010031',
              ),
              work(
                'Contextual inquiry interviews for evidence-based interface design',
                'User researchers combine contextual interviews and observation to identify interface needs.',
                'https://doi.org/10.1000/ux-interviews',
              ),
            ]
          : [
              work(
                'A Systematic Review of Mapping Strategies for the Sonification of Physical Quantities',
                'Mapping strategies synthesize physical quantities into acoustic signals.',
                'https://doi.org/10.1371/journal.pone.0082491',
              ),
              work(
                'Affinity mapping for thematic synthesis in user research',
                'Affinity mapping groups user observations into themes that support design decisions.',
                'https://doi.org/10.1000/ux-affinity',
              ),
            ],
      ),
      searchBookMetadata: vi.fn(async () => []),
    };

    expect(await attachOpenReadings(graph, { providers })).toBe(2);
    const citations = graph.resources.map((resource) => resource.citation).join('\n');
    expect(citations).toContain('Contextual inquiry interviews');
    expect(citations).toContain('Affinity mapping for thematic synthesis');
    expect(citations).not.toContain('Architectural Design Studio');
    expect(citations).not.toContain('Sonification');
  });

  it('rejects post-mortem interval research on the OpenAlex reading-list path for music theory', async () => {
    const graph = createEmptyCourseGraph({ courseName: 'Interval Evidence Studio' });
    graph.sessions = [
      {
        id: 's2',
        number: 2,
        title: 'Lesson 2: Simple and Compound Intervals and Inversion',
        sections: [{ topic: '2.1: Compound Intervals', resourceRefs: [] }],
      },
    ];
    graph.concepts = [{ id: 'c2', term: 'Compound Intervals' }];
    graph.edges.teaches = [{ from: 's2', to: 'c2' }];
    const providers = {
      searchScholarlyReadings: vi.fn(async () => [
        {
          title: 'Biochemistry Changes That Occur after Death: Post-Mortem Interval',
          abstract: 'Forensic pathology and biochemistry markers for the post-mortem interval and time since death.',
          authors: 'A. Pathologist',
          year: 2013,
          url: 'https://example.org/post-mortem-interval',
          license: 'cc-by',
        },
        {
          title: 'Open Music Theory: Compound Intervals and Inversion',
          abstract: 'Music theory instruction on pitch, semitones, compound intervals, and interval inversion.',
          authors: 'A. Musician',
          year: 2024,
          url: 'https://example.org/music-intervals',
          license: 'cc-by',
        },
      ]),
      searchBookMetadata: vi.fn(async () => []),
    };

    expect(await attachOpenReadings(graph, { providers })).toBe(1);
    const citations = graph.resources.map((resource) => resource.citation).join('\n');
    expect(citations).toContain('Open Music Theory: Compound Intervals and Inversion');
    expect(citations).not.toContain('Post-Mortem Interval');
  });

  it('records a decision instead of trusting metadata-only open readings', async () => {
    const graph = genomeLinkedGraph();
    const providers = {
      searchScholarlyReadings: vi.fn(async (query) => [
        {
          title: `${query} source evidence and classroom application`,
          authors: 'A. Researcher',
          year: 2023,
          url: 'https://doi.org/10.9999/metadata-only',
          license: 'Crossref public metadata',
          attribution: 'Crossref public metadata',
          abstract: `${query} source evidence and classroom application for astronomy learning.`,
        },
      ]),
      searchBookMetadata: vi.fn(async () => []),
    };

    const attached = await attachOpenReadings(graph, { providers, maxSessions: 1 });

    expect(attached).toBe(0);
    expect(graph.resources).toHaveLength(0);
    expect(graph.readingListDecisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'no-reusable-license-reading',
          lesson: 1,
          rejected: 1,
          licenses: ['Crossref public metadata'],
        }),
      ]),
    );
  });

  it('falls back from rate-limited OpenAlex to explicitly licensed Crossref work', async () => {
    const graph = genomeLinkedGraph();
    const rateLimited = [];
    Object.defineProperty(rateLimited, 'rateLimited', { value: true, enumerable: false });
    const providers = {
      searchScholarlyReadings: vi.fn(async () => rateLimited),
      searchCrossrefWorks: vi.fn(async (query) => [
        {
          provider: 'crossref',
          title: `Open evidence for ${query}`,
          authors: 'A. Researcher',
          year: 2024,
          url: 'https://doi.org/10.1234/open-evidence',
          license: 'https://creativecommons.org/licenses/by/4.0/',
          attribution: 'Crossref public metadata',
          abstract: `${query} explains astronomy evidence for the celestial sphere and observation.`,
        },
      ]),
      searchBookMetadata: vi.fn(async () => []),
    };

    const onProgress = vi.fn();
    expect(await attachOpenReadings(graph, { providers, maxSessions: 1, onProgress })).toBe(1);
    expect(providers.searchCrossrefWorks).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenLastCalledWith({
      completed: 1,
      total: 1,
      lesson: 1,
      provider: 'crossref fallback',
    });
    expect(graph.resources[0]).toMatchObject({
      origin: 'crossref',
      license: 'https://creativecommons.org/licenses/by/4.0/',
      attribution: 'Crossref public metadata',
    });
  });

  it('degrades to zero attachments when providers fail — compile never blocks', async () => {
    const graph = genomeLinkedGraph();
    const providers = {
      searchScholarlyReadings: vi.fn(async () => []),
      searchBookMetadata: vi.fn(async () => {
        throw new Error('offline');
      }),
    };
    expect(await attachOpenReadings(graph, { providers })).toBe(0);
    expect(graph.resources).toHaveLength(0);
  });

  it('knowledgeCoverage reports the trust-surface numbers', async () => {
    const graph = genomeLinkedGraph();
    attachGenomeResources(graph);
    graph.resources.push({
      id: 'openstax-python-variables',
      title: 'OpenStax Introduction to Python Programming section 1.3 Variables',
      origin: 'openstax',
      sessionRefs: ['s1'],
    });
    const coverage = knowledgeCoverage(graph);
    expect(coverage.sessions).toBe(2);
    expect(coverage.genomeLinkedLessons).toBe(2);
    expect(coverage.sessionsWithResources).toBe(2);
    expect(coverage.openResources).toBe(3);
    expect(coverage.resourcesByOrigin.genome).toBe(2);
    expect(coverage.resourcesByOrigin.openstax).toBe(1);
  });
});

describe('pedagogy evidence (P3)', () => {
  it('every curated entry carries 1+ citations with resolvable-format DOIs', () => {
    expect(PEDAGOGY_EVIDENCE.length).toBeGreaterThanOrEqual(6);
    for (const entry of PEDAGOGY_EVIDENCE) {
      expect(entry.citations.length).toBeGreaterThanOrEqual(1);
      for (const citation of entry.citations) {
        expect(citation.doi).toMatch(/^10\.\d{4,9}\/\S+$/);
        expect(citation.authors).toBeTruthy();
        expect(citation.year).toBeGreaterThan(1950);
      }
    }
  });

  it('whyThisWorksNote and buildMethodsStatement render real citations', () => {
    const note = whyThisWorksNote('worked-example');
    expect(note.note).toContain('cognitive load');
    expect(note.note).toContain('doi:10.1207/s1532690xci0201_3');
    const statement = buildMethodsStatement(['worked-example', 'retrieval-warmup', 'unknown-move']);
    expect(statement.methods).toHaveLength(2);
    expect(statement.methods[0].references[0]).toContain('https://doi.org/');
    expect(buildMethodsStatement([])).toBeNull();
    expect(evidenceForMove('peer-discussion').citations.length).toBe(2);
  });
});

describe('compiler integration (P2/P3/P4)', () => {
  function compiledFlagship() {
    const graph = genomeLinkedGraph();
    attachGenomeResources(graph);
    graph.resources.push({
      id: 'krbook',
      citation: 'Fraknoi (2016). Astronomy. OpenStax. ISBN 9781938168284. https://openlibrary.org/works/OL1',
      kind: 'book',
      sessionRefs: [],
      origin: 'openlibrary',
      url: 'https://openlibrary.org/works/OL1',
      license: 'Open Library public metadata',
      attribution: 'Open Library, Internet Archive',
    });
    const blueprint = buildBlueprintFromGraph(graph);
    return compileBlueprintDeliverables(blueprint, ['syllabus', 'lessonPlans']);
  }

  it('syllabus ships a Methods Statement, Sources & Licenses, and real required texts', () => {
    const { syllabus } = compiledFlagship();
    const syl = syllabus.syllabus;
    expect(syl.methodsStatement.methods.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(syl.methodsStatement)).toContain('https://doi.org/');
    const appendix = syl.sourcesAndLicenses;
    expect(appendix.groups.some((group) => group.origin === 'genome')).toBe(true);
    expect(JSON.stringify(appendix)).toContain('CC BY 4.0');
    // The placeholder reading packet is gone when open texts exist.
    expect(JSON.stringify(syl.requiredTexts)).not.toContain('Instructor-provided course reading packet');
    expect(syl.requiredTexts.some((text) => /OpenStax astronomy 2e/i.test(text.title))).toBe(true);
  });

  it('every lesson plan carries cited "why this works" evidence notes', () => {
    const { lessonPlans } = compiledFlagship();
    for (const plan of lessonPlans.lessonPlans) {
      expect(plan.evidenceBase.length).toBeGreaterThanOrEqual(2);
      expect(plan.evidenceBase.every((entry) => /doi:10\./.test(entry.note))).toBe(true);
    }
  });
});
