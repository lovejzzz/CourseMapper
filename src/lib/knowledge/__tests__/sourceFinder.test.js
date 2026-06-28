import { describe, expect, it, vi } from 'vitest';

import { createEmptyCourseGraph } from '../../courseGraph/schema.js';
import { renderCourseMapFromGraph } from '../../courseGraph/renderCourseMap.js';
import { buildSourceLedgerFromCourseGraph } from '../sourceLedger.js';
import {
  attachSourceFinderResources,
  findCourseSources,
  shouldRunSourceFinder,
  sourceTopicsFromCourse,
} from '../sourceFinder.js';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
  };
}

function sampleGraph() {
  const graph = createEmptyCourseGraph({ courseName: 'Introductory Physics I: Mechanics' });
  graph.sessions = [
    {
      id: 's1',
      number: 1,
      title: 'Lesson 1: Motion in one dimension',
      sections: [{ topic: '1.1: displacement velocity acceleration' }],
    },
    {
      id: 's2',
      number: 2,
      title: 'Lesson 2: Newton laws',
      sections: [{ topic: '2.1: force free body diagrams' }],
    },
  ];
  graph.concepts = [
    { id: 'c1', term: 'velocity' },
    { id: 'c2', term: "Newton's laws" },
  ];
  graph.edges.teaches = [
    { from: 's1', to: 'c1' },
    { from: 's2', to: 'c2' },
  ];
  return graph;
}

function source(provider, title, extra = {}) {
  return {
    provider,
    kind: provider === 'wikipedia' ? 'encyclopedia background' : 'peer-reviewed reading',
    title,
    authors: provider === 'wikipedia' ? 'Wikipedia contributors' : 'A. Scholar',
    year: 2024,
    url: `https://example.org/${provider}/${encodeURIComponent(title)}`,
    doi: extra.doi || null,
    license: extra.license || (provider === 'wikipedia' ? 'CC BY-SA 4.0' : 'cc-by'),
    attribution: provider,
    primaryTopic: extra.primaryTopic || null,
    topics: extra.topics || [],
    abstract:
      extra.abstract ||
      `${title} explains motion, force, velocity, acceleration, and mechanics with examples. `.repeat(12),
  };
}

describe('source finder mini-shard', () => {
  it('builds course/topic queries from graph sessions and concepts', () => {
    const topics = sourceTopicsFromCourse(sampleGraph(), { maxTopics: 2 });
    expect(topics).toHaveLength(2);
    expect(topics[0]).toMatchObject({
      courseName: 'Introductory Physics I: Mechanics',
      lessonNumber: 1,
      sessionId: 's1',
      topic: 'displacement velocity acceleration',
    });
    expect(topics[0].query).toContain('velocity');
  });

  it('caches by course + topic and stores only compact source snippets', async () => {
    const storage = memoryStorage();
    const providers = {
      searchScholarlyReadings: vi.fn(async (query) => [source('openalex', `OpenAlex ${query}`)]),
      searchCrossrefWorks: vi.fn(async (query) => [source('crossref', `Crossref ${query}`)]),
      searchWikipediaPages: vi.fn(async (query) => [source('wikipedia', `Wikipedia ${query}`)]),
    };

    const first = await findCourseSources(sampleGraph(), {
      storage,
      providers,
      maxTopics: 2,
      limitPerTopic: 2,
      date: new Date(2026, 5, 17, 12),
    });
    const second = await findCourseSources(sampleGraph(), {
      storage,
      providers,
      maxTopics: 2,
      limitPerTopic: 2,
      date: new Date(2026, 5, 17, 12),
    });

    expect(first.temporary).toBe(true);
    expect(first.id).toContain('source-finder-v2');
    expect(first.stats).toMatchObject({ topics: 2, topicsWithSources: 2, sources: 4, cacheHits: 0 });
    expect(second.stats.cacheHits).toBe(2);
    expect(providers.searchScholarlyReadings).toHaveBeenCalledTimes(2);
    expect(providers.searchCrossrefWorks).toHaveBeenCalledTimes(2);
    expect(first.topics[0].sources[0].snippet.length).toBeLessThanOrEqual(320);
    expect(first.topics[0].sources[0]).not.toHaveProperty('abstract');
    expect(first.topics[0].searchLinks[0].provider).toBe('oercommons');
  });

  it('rejects academic title traps that match the word but not the classroom topic', async () => {
    const graph = createEmptyCourseGraph({ courseName: 'Discrete Mathematics' });
    graph.sessions = [
      {
        id: 's1',
        number: 1,
        title: 'Lesson 1: Functions',
        sections: [{ topic: '1.1: functions, domain, codomain, and composition' }],
      },
      {
        id: 's2',
        number: 2,
        title: 'Lesson 2: Trees',
        sections: [{ topic: '2.1: trees in graph theory' }],
      },
    ];

    const miniShard = await findCourseSources(graph, {
      storage: memoryStorage(),
      maxTopics: 2,
      limitPerTopic: 2,
      minUsefulSources: 1,
      providers: {
        searchScholarlyReadings: vi.fn(async (query) => {
          if (query.includes('functions')) {
            return [
              source('openalex', 'Special Functions of Mathematical Physics', {
                abstract:
                  'A graduate mathematical physics treatment of special functions, Bessel functions, and Legendre functions.',
              }),
              source('openalex', 'Functions in discrete mathematics: domain, codomain, and composition', {
                abstract:
                  'An introductory treatment of functions as mappings between sets, with domain, codomain, range, and composition.',
              }),
            ];
          }
          return [
            source('openalex', 'Extremely randomized trees', {
              abstract: 'A machine learning method for classification and regression using randomized decision trees.',
            }),
            source('openalex', 'Trees in graph theory: paths, roots, leaves, and spanning trees', {
              abstract:
                'An introductory graph theory treatment of trees, paths, roots, leaves, spanning trees, and connected acyclic graphs.',
            }),
          ];
        }),
        searchCrossrefWorks: vi.fn(async () => []),
        searchWikipediaPages: vi.fn(async () => []),
      },
    });

    const titles = miniShard.topics.flatMap((topic) => topic.sources.map((item) => item.title));
    expect(titles).toContain('Functions in discrete mathematics: domain, codomain, and composition');
    expect(titles).toContain('Trees in graph theory: paths, roots, leaves, and spanning trees');
    expect(titles).not.toContain('Special Functions of Mathematical Physics');
    expect(titles).not.toContain('Extremely randomized trees');
  }, 15000);

  it('rejects generic Crossref hits for genetics topics when they lack a genetics anchor', async () => {
    const graph = createEmptyCourseGraph({ courseName: 'Genetics and Society' });
    graph.sessions = [
      {
        id: 's1',
        number: 1,
        title: 'Lesson 1: Gene-environment interaction',
        sections: [{ topic: '1.1: gene-environment interaction, risk and variation, complex traits' }],
      },
      {
        id: 's2',
        number: 2,
        title: 'Lesson 2: Genetic testing and privacy',
        sections: [{ topic: '2.1: genetic testing, privacy, and data use' }],
      },
    ];

    const miniShard = await findCourseSources(graph, {
      storage: memoryStorage(),
      maxTopics: 2,
      limitPerTopic: 2,
      minUsefulSources: 1,
      providers: {
        searchScholarlyReadings: vi.fn(async () => []),
        searchCrossrefWorks: vi.fn(async (query) => {
          if (query.includes('gene-environment')) {
            return [
              source('crossref', 'Building environment design. Indoor environment', {
                abstract: 'A standard about indoor environment design and visual environment planning.',
              }),
              source('crossref', 'Gene-environment interaction and complex genetic traits', {
                abstract:
                  'A genetics article about gene-environment interaction, genetic variation, and complex traits.',
              }),
            ];
          }
          return [
            source('crossref', 'Geotechnical investigation and testing', {
              abstract: 'A standard about geotechnical structures, site testing, and engineering investigation.',
            }),
            source('crossref', 'Privacy in genetic testing and genomic data use', {
              abstract: 'A genetics policy article about genetic testing, privacy, genomic data, and data use.',
            }),
          ];
        }),
        searchWikipediaPages: vi.fn(async () => []),
      },
    });

    const titles = miniShard.topics.flatMap((topic) => topic.sources.map((item) => item.title));
    expect(titles).toContain('Gene-environment interaction and complex genetic traits');
    expect(titles).toContain('Privacy in genetic testing and genomic data use');
    expect(titles).not.toContain('Building environment design. Indoor environment');
    expect(titles).not.toContain('Geotechnical investigation and testing');
  }, 15000);

  it('rejects generic Wikipedia background pages for genetics topics when they lack a genetics anchor', async () => {
    const graph = createEmptyCourseGraph({ courseName: 'Genetics and Society' });
    graph.sessions = [
      {
        id: 's1',
        number: 1,
        title: 'Lesson 1: Gene-environment interaction',
        sections: [{ topic: '1.1: environmental influence, trait variation, nature and nurture' }],
      },
    ];

    const miniShard = await findCourseSources(graph, {
      storage: memoryStorage(),
      maxTopics: 1,
      limitPerTopic: 2,
      minUsefulSources: 1,
      providers: {
        searchScholarlyReadings: vi.fn(async () => []),
        searchCrossrefWorks: vi.fn(async () => []),
        searchWikipediaPages: vi.fn(async () => [
          source('wikipedia', 'Driving under the influence', {
            abstract: 'A page about alcohol use, driving behavior, legal risk, and environmental influence.',
          }),
          source('wikipedia', 'Gene-environment interaction', {
            abstract: 'A genetics overview of how genes, environments, heritability, and trait variation interact.',
          }),
        ]),
      },
    });

    const titles = miniShard.topics.flatMap((topic) => topic.sources.map((item) => item.title));
    expect(titles).toContain('Gene-environment interaction');
    expect(titles).not.toContain('Driving under the influence');
  }, 15000);

  it('rejects off-discipline medical readings for project management topics', async () => {
    const graph = createEmptyCourseGraph({ courseName: 'Project Management' });
    graph.sessions = [
      {
        id: 's1',
        number: 1,
        title: 'Lesson 1: Risk register',
        sections: [{ topic: '1.1: risk register and project controls' }],
      },
    ];

    const miniShard = await findCourseSources(graph, {
      storage: memoryStorage(),
      maxTopics: 1,
      limitPerTopic: 2,
      minUsefulSources: 1,
      providers: {
        searchScholarlyReadings: vi.fn(async () => [
          source('openalex', 'Global Burden of Cardiovascular Diseases and Risk Factors, 1990-2019', {
            abstract:
              'A cardiology and public health article about cardiovascular disease, clinical risk factors, patient outcomes, and mortality.',
            doi: '10.1016/j.jacc.2020.11.010',
            primaryTopic: { name: 'Cardiology', field: 'Medicine', domain: 'Health sciences' },
          }),
          source('openalex', 'Risk management in software projects: registers, controls, and stakeholder review', {
            abstract:
              'A project management article about risk registers, project controls, stakeholder review, and software project governance.',
            doi: '10.1000/project-risk',
            primaryTopic: { name: 'Project management', field: 'Management', domain: 'Social sciences' },
          }),
        ]),
        searchCrossrefWorks: vi.fn(async () => []),
        searchWikipediaPages: vi.fn(async () => []),
      },
    });

    const titles = miniShard.topics.flatMap((topic) => topic.sources.map((item) => item.title));
    expect(titles).toContain('Risk management in software projects: registers, controls, and stakeholder review');
    expect(titles).not.toContain('Global Burden of Cardiovascular Diseases and Risk Factors, 1990-2019');
  }, 15000);

  it('prefers explicit reuse licenses and searches secondary providers when primary hits are license-ambiguous', async () => {
    const graph = createEmptyCourseGraph({ courseName: 'Genetics and Society' });
    graph.sessions = [
      {
        id: 's1',
        number: 1,
        title: 'Lesson 1: DNA',
        sections: [{ topic: '1.1: DNA inheritance and genes' }],
      },
    ];

    const miniShard = await findCourseSources(graph, {
      storage: memoryStorage(),
      maxTopics: 1,
      limitPerTopic: 1,
      minUsefulSources: 1,
      providers: {
        searchScholarlyReadings: vi.fn(async () => [
          {
            provider: 'openalex',
            kind: 'peer-reviewed reading',
            title: 'DNA inheritance and genes review',
            authors: 'A. Scholar',
            year: 2024,
            url: 'https://example.org/openalex/dna-inheritance',
            license: 'open access',
            attribution: 'OpenAlex',
            abstract: 'A genetics article about DNA, inheritance, genes, chromosomes, and traits.',
          },
        ]),
        searchCrossrefWorks: vi.fn(async () => []),
        searchWikipediaPages: vi.fn(async () => [
          source('wikipedia', 'DNA', {
            abstract: 'A genetics overview of DNA, inheritance, genes, chromosomes, and traits.',
          }),
        ]),
      },
    });

    expect(miniShard.topics[0].sources).toHaveLength(1);
    expect(miniShard.topics[0].sources[0]).toMatchObject({
      provider: 'wikipedia',
      title: 'DNA',
      license: 'CC BY-SA 4.0',
    });
  }, 15000);

  it('ranks explicit-license sources above stronger metadata-only academic hits', async () => {
    const graph = createEmptyCourseGraph({ courseName: 'Project Management' });
    graph.sessions = [
      {
        id: 's1',
        number: 1,
        title: 'Lesson 1: Scope management',
        sections: [{ topic: '1.1: scope management, project charter, requirements, and stakeholder review' }],
      },
    ];

    const miniShard = await findCourseSources(graph, {
      storage: memoryStorage(),
      maxTopics: 1,
      limitPerTopic: 1,
      minUsefulSources: 1,
      providers: {
        searchScholarlyReadings: vi.fn(async () => [
          source('openalex', 'Project scope management charter requirements and stakeholder review', {
            license: 'OpenAlex public metadata',
            abstract:
              'Project scope management project charter requirements stakeholder review scope baseline and change control evidence.',
            primaryTopic: {
              name: 'Project management',
              field: 'Business, Management and Accounting',
              domain: 'Social Sciences',
            },
          }),
        ]),
        searchCrossrefWorks: vi.fn(async () => []),
        searchWikipediaPages: vi.fn(async () => [
          source('wikipedia', 'Project management', {
            abstract: 'Project management scope, requirements, schedules, stakeholders, and controls.',
          }),
        ]),
      },
    });

    expect(miniShard.topics[0].sources).toHaveLength(1);
    expect(miniShard.topics[0].sources[0]).toMatchObject({
      provider: 'wikipedia',
      title: 'Project management',
      license: 'CC BY-SA 4.0',
    });
  }, 15000);

  it('attaches top mini-shard sources as graph resources that render into the course map', async () => {
    const graph = sampleGraph();
    const miniShard = await findCourseSources(graph, {
      storage: memoryStorage(),
      maxTopics: 2,
      limitPerTopic: 1,
      minUsefulSources: 1,
      providers: {
        searchScholarlyReadings: vi.fn(async (query) => [source('openalex', `Open study of ${query}`)]),
        searchCrossrefWorks: vi.fn(async () => []),
        searchWikipediaPages: vi.fn(async () => []),
      },
    });

    const attached = attachSourceFinderResources(graph, miniShard);
    expect(attached).toBe(2);
    expect(graph.sourceFinderMiniShard).toBe(miniShard);
    expect(graph.resources.every((resource) => resource.origin === 'source-finder')).toBe(true);
    expect(graph.resources[0].snippet.length).toBeLessThanOrEqual(320);
    expect(graph.sessions[0].sections[0].resourceRefs).toContain(graph.resources[0].id);

    const map = renderCourseMapFromGraph(graph);
    expect(map.lessons[0].sections[0].supportingResources).toContain('Open study of displacement velocity');
  });

  it('preserves source-finder DOI metadata through attached resources into concept-linked source ledger rows', async () => {
    const graph = sampleGraph();
    const miniShard = await findCourseSources(graph, {
      storage: memoryStorage(),
      maxTopics: 1,
      limitPerTopic: 1,
      minUsefulSources: 1,
      providers: {
        searchScholarlyReadings: vi.fn(async (query) => [
          source('openalex', `Project-based mechanics lab evidence for ${query}`, {
            doi: '10.1000/mechanics-lab',
            abstract:
              'A physics education article about mechanics, motion, velocity, acceleration, and project-based laboratory evidence.',
            primaryTopic: { name: 'Physics education', field: 'Education', domain: 'Social sciences' },
          }),
        ]),
        searchCrossrefWorks: vi.fn(async () => []),
        searchWikipediaPages: vi.fn(async () => []),
      },
    });

    attachSourceFinderResources(graph, miniShard);
    const ledger = buildSourceLedgerFromCourseGraph(graph, { checkedAt: '2026-06-26T00:00:00.000Z' });

    expect(graph.resources[0]).toMatchObject({
      origin: 'source-finder',
      doi: '10.1000/mechanics-lab',
      title: expect.stringContaining('Project-based mechanics lab evidence'),
    });
    expect(ledger.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: 'openalex',
          doi: '10.1000/mechanics-lab',
          license: 'CC BY',
          conceptLinks: [{ id: 'c1', label: 'velocity' }],
          trustLevel: 'academic-metadata',
        }),
      ]),
    );
  }, 15000);

  it('attaches UX source-finder candidates after dropping first-result bycatch', () => {
    const graph = createEmptyCourseGraph({ courseName: 'User Experience Design Studio' });
    graph.sessions = [
      {
        id: 's1',
        number: 1,
        title: 'Lesson 1: Usability testing',
        sections: [{ topic: 'test planning and task design' }],
      },
    ];
    graph.concepts = [
      { id: 'c1', term: 'test planning' },
      { id: 'c2', term: 'task design' },
    ];
    graph.edges.teaches = [
      { from: 's1', to: 'c1' },
      { from: 's1', to: 'c2' },
    ];

    attachSourceFinderResources(graph, {
      courseName: 'User Experience Design Studio',
      topics: [
        {
          sessionId: 's1',
          lessonNumber: 1,
          topic: 'test planning',
          sources: [
            {
              provider: 'wikipedia',
              kind: 'encyclopedia background',
              title: 'List of Studio Ghibli works',
              url: 'https://en.wikipedia.org/wiki/List_of_Studio_Ghibli_works',
              license: 'CC BY-SA 4.0',
              snippet: 'This is a list of works by the Japanese animation studio Studio Ghibli.',
            },
            {
              provider: 'wikipedia',
              kind: 'encyclopedia background',
              title: 'Prototype-based programming',
              url: 'https://en.wikipedia.org/wiki/Prototype-based_programming',
              license: 'CC BY-SA 4.0',
              snippet:
                'Prototype-based programming is a style of object-oriented programming in which behavior reuse uses existing objects as prototypes.',
            },
            {
              provider: 'crossref',
              kind: 'book-chapter',
              title: 'Personas',
              url: 'https://doi.org/10.2307/j.ctvm7bc5k.4',
              doi: '10.2307/j.ctvm7bc5k.4',
              license: 'Crossref public metadata',
              snippet: 'Crossref public metadata for a persona chapter.',
            },
            {
              provider: 'wikipedia',
              kind: 'encyclopedia background',
              title: 'Mercator projection',
              url: 'https://en.wikipedia.org/wiki/Mercator_projection',
              license: 'CC BY-SA 4.0',
              snippet:
                'The Mercator projection is a conformal cylindrical map projection used for navigation and rhumb lines.',
            },
            {
              provider: 'wikipedia',
              kind: 'encyclopedia background',
              title: 'Persona 4 Revival',
              url: 'https://en.wikipedia.org/wiki/Persona_4_Revival',
              license: 'CC BY-SA 4.0',
              snippet:
                'Persona 4 Revival is an upcoming role-playing video game developed by P-Studio and published by Atlus.',
            },
            {
              provider: 'wikipedia',
              kind: 'encyclopedia background',
              title: 'Revelations: Persona',
              url: 'https://en.wikipedia.org/wiki/Revelations:_Persona',
              license: 'CC BY-SA 4.0',
              snippet:
                'Revelations: Persona is a 1996 role-playing video game and part of the Megami Tensei franchise.',
            },
            {
              provider: 'wikipedia',
              kind: 'encyclopedia background',
              title: 'Prototype (video game)',
              url: 'https://en.wikipedia.org/wiki/Prototype_(video_game)',
              license: 'CC BY-SA 4.0',
              snippet: 'Prototype is a 2009 action-adventure video game developed by Radical Entertainment.',
            },
            {
              provider: 'wikipedia',
              kind: 'encyclopedia background',
              title: 'A/B testing',
              url: 'https://en.wikipedia.org/wiki/A/B_testing',
              license: 'CC BY-SA 4.0',
              snippet: 'A/B testing is a user-experience research method for comparing interface variants.',
            },
          ],
        },
      ],
    });

    const ledger = buildSourceLedgerFromCourseGraph(graph, { checkedAt: '2026-06-28T00:00:00.000Z' });

    expect(graph.resources.map((resource) => resource.title)).toEqual(['A/B testing']);
    expect(ledger.rows.map((row) => row.title)).toEqual(['A/B testing']);
    expect(ledger.reviewRows || []).toHaveLength(0);
  });

  it('rejects health gamification reviews for UX critique topics before caching sources', async () => {
    const graph = createEmptyCourseGraph({ courseName: 'User Experience Design Studio' });
    graph.sessions = [
      {
        id: 's3',
        number: 3,
        title: 'Lesson 3: Critique session',
        sections: [{ topic: '3.1: concept review, peer feedback, and iteration' }],
      },
    ];
    graph.concepts = [
      { id: 'c7', term: 'concept review' },
      { id: 'c8', term: 'peer feedback' },
      { id: 'c9', term: 'iteration' },
    ];
    graph.edges.teaches = [
      { from: 's3', to: 'c7' },
      { from: 's3', to: 'c8' },
      { from: 's3', to: 'c9' },
    ];

    const miniShard = await findCourseSources(graph, {
      storage: memoryStorage(),
      maxTopics: 1,
      limitPerTopic: 2,
      minUsefulSources: 1,
      providers: {
        searchScholarlyReadings: vi.fn(async () => [
          source('openalex', 'Gamification for health and wellbeing: A systematic review of the literature', {
            doi: '10.1016/j.invent.2016.10.002',
            abstract:
              'Compared to persuasive technology and health games, gamification is used for motivating behaviour change for health and wellbeing.',
          }),
          source('openalex', 'Understanding Collaborative Practices and Tools of Professional UX Practitioners', {
            doi: '10.1145/3544548.3581273',
            abstract:
              'User experience practitioners use critique, peer feedback, design handoff, and collaboration tools in studio work.',
          }),
        ]),
        searchCrossrefWorks: vi.fn(async () => []),
        searchWikipediaPages: vi.fn(async () => []),
      },
    });

    expect(miniShard.topics[0].sources.map((item) => item.title)).toEqual([
      'Understanding Collaborative Practices and Tools of Professional UX Practitioners',
    ]);
  }, 15000);

  it('rejects generic iteration pages for UX iteration topics before caching sources', async () => {
    const graph = createEmptyCourseGraph({ courseName: 'User Experience Design Studio' });
    graph.sessions = [
      {
        id: 's7',
        number: 7,
        title: 'Lesson 7: Design iteration',
        sections: [{ topic: '7.1: design iteration, peer critique, and revision planning' }],
      },
    ];
    graph.concepts = [
      { id: 'c19', term: 'design iteration' },
      { id: 'c20', term: 'peer critique' },
      { id: 'c21', term: 'revision planning' },
    ];
    graph.edges.teaches = [
      { from: 's7', to: 'c19' },
      { from: 's7', to: 'c20' },
      { from: 's7', to: 'c21' },
    ];

    const miniShard = await findCourseSources(graph, {
      storage: memoryStorage(),
      maxTopics: 1,
      limitPerTopic: 3,
      minUsefulSources: 1,
      providers: {
        searchScholarlyReadings: vi.fn(async () => []),
        searchCrossrefWorks: vi.fn(async () => []),
        searchWikipediaPages: vi.fn(async () => [
          source('wikipedia', 'Fixed-point iteration', {
            abstract: 'In mathematics, fixed-point iteration is a method of computing fixed points of functions.',
          }),
          source('wikipedia', 'Iteration', {
            abstract: 'Iteration is the repetition of a process in order to generate a sequence of outcomes.',
          }),
          source('wikipedia', 'Iterative design', {
            abstract:
              'Iterative design is a design methodology based on prototyping, testing, analysis, and refinement.',
          }),
        ]),
      },
    });

    expect(miniShard.topics[0].sources.map((item) => item.title)).toEqual(['Iterative design']);
  }, 15000);

  it('rejects v0.15.97 UX false friends during retrieval before they reach the mini-shard cache', async () => {
    const graph = createEmptyCourseGraph({ courseName: 'User Experience Design Studio' });
    graph.sessions = [
      {
        id: 's1',
        number: 1,
        title: 'Lesson 1: Persona creation',
        sections: [{ topic: '1.1: persona creation and user needs' }],
      },
      {
        id: 's2',
        number: 2,
        title: 'Lesson 2: Sketching and prototypes',
        sections: [{ topic: '2.1: wireframe sketches and clickable prototypes' }],
      },
    ];
    graph.concepts = [
      { id: 'c1', term: 'persona creation' },
      { id: 'c2', term: 'wireframe sketches' },
    ];
    graph.edges.teaches = [
      { from: 's1', to: 'c1' },
      { from: 's2', to: 'c2' },
    ];

    const miniShard = await findCourseSources(graph, {
      storage: memoryStorage(),
      maxTopics: 2,
      limitPerTopic: 3,
      minUsefulSources: 1,
      providers: {
        searchScholarlyReadings: vi.fn(async (query) => {
          if (query.includes('persona')) {
            return [
              source(
                'crossref',
                "A network of enterprise's study of Tim Minchin and the creation of a creative public persona",
                {
                  abstract: 'A celebrity public persona case study about Tim Minchin and creative work.',
                  doi: '10.21153/psj2026vol12no1art2272',
                  license: 'https://creativecommons.org/licenses/by-nc/4.0',
                },
              ),
              source('crossref', 'Why Are Personas the Way They Are?', {
                abstract: 'User personas are well-established in user-centered design and persona creation.',
                doi: '10.21153/psj2025vol11noart2002',
                license: 'https://creativecommons.org/licenses/by-nc/4.0',
              }),
            ];
          }
          return [
            source('crossref', 'One Prototype Three Prototype Five Prototype Seven Prototype', {
              abstract: '',
              doi: '10.1109/mdt.1986.295018',
              license: 'https://ieeexplore.ieee.org/Xplorehelp/downloads/license-information/IEEE.html',
            }),
            source('crossref', 'Functional Prototypes for Usability Testing', {
              abstract: 'Clickable prototypes and usability testing for interaction design iteration.',
              doi: '10.1000/ux-prototypes',
              license: 'CC BY',
            }),
          ];
        }),
        searchCrossrefWorks: vi.fn(async () => []),
        searchWikipediaPages: vi.fn(async (query) => {
          if (query.includes('persona')) {
            return [
              source('wikipedia', 'Critique of Pure Reason', {
                abstract: 'A book by Immanuel Kant about metaphysics.',
              }),
            ];
          }
          return [
            source('wikipedia', 'Sketches of Spain', {
              abstract: 'A studio album by jazz musician Miles Davis.',
            }),
            source('wikipedia', 'Prototype (Star Trek: Voyager)', {
              abstract: 'A science fiction television series episode.',
            }),
          ];
        }),
      },
    });

    const titles = miniShard.topics.flatMap((topic) => topic.sources.map((item) => item.title));
    expect(titles).toEqual(['Why Are Personas the Way They Are?', 'Functional Prototypes for Usability Testing']);
  }, 15000);

  it('runs only when backbone coverage is weak', () => {
    expect(
      shouldRunSourceFinder({
        sessions: 10,
        genomeLinkedLessons: 1,
        openResources: 3,
        resourcesByOrigin: { genome: 1, openalex: 2 },
      }),
    ).toBe(true);
    expect(
      shouldRunSourceFinder({
        sessions: 10,
        genomeLinkedLessons: 8,
        openResources: 10,
        resourcesByOrigin: { genome: 8, openalex: 2 },
      }),
    ).toBe(false);
    expect(
      shouldRunSourceFinder({
        sessions: 10,
        genomeLinkedLessons: 1,
        openResources: 6,
        resourcesByOrigin: { 'source-finder': 2 },
      }),
    ).toBe(false);
  });
});
