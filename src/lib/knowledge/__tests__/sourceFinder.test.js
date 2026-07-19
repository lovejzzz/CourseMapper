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
    const onProgress = vi.fn();
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
      onProgress,
    });
    const second = await findCourseSources(sampleGraph(), {
      storage,
      providers,
      maxTopics: 2,
      limitPerTopic: 2,
      date: new Date(2026, 5, 17, 12),
    });

    expect(first.temporary).toBe(true);
    expect(first.id).toContain('source-finder-v5');
    expect(first.stats).toMatchObject({ topics: 2, topicsWithSources: 2, sources: 4, cacheHits: 0 });
    expect(second.stats.cacheHits).toBe(2);
    expect(providers.searchScholarlyReadings).toHaveBeenCalledTimes(2);
    expect(providers.searchCrossrefWorks).toHaveBeenCalledTimes(2);
    expect(first.topics[0].sources[0].snippet.length).toBeLessThanOrEqual(320);
    expect(first.topics[0].sources[0]).not.toHaveProperty('abstract');
    expect(first.topics[0].searchLinks[0].provider).toBe('oercommons');
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({ completed: 2, total: 2, cached: false }));
  });

  it('checks two lessons concurrently while preserving lesson order in the mini-shard', async () => {
    let active = 0;
    let maxActive = 0;
    const openalex = vi.fn(async (query) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, /velocity/i.test(query) ? 30 : 5));
      active -= 1;
      return [source('openalex', `Physics evidence for ${query}`)];
    });

    const miniShard = await findCourseSources(sampleGraph(), {
      storage: memoryStorage(),
      maxTopics: 2,
      limitPerTopic: 1,
      minUsefulSources: 1,
      topicConcurrency: 2,
      providers: {
        searchScholarlyReadings: openalex,
        searchCrossrefWorks: vi.fn(async () => []),
        searchWikipediaPages: vi.fn(async () => []),
        searchBookMetadata: vi.fn(async () => []),
        searchLibraryOfCongress: vi.fn(async () => []),
        searchInternetArchiveTexts: vi.fn(async () => []),
      },
    });

    expect(maxActive).toBe(2);
    expect(miniShard.topics.map((topic) => topic.lessonNumber)).toEqual([1, 2]);
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

  it('rejects the military Staff homonym for a music-notation lesson', async () => {
    const graph = createEmptyCourseGraph({ courseName: 'Music Theory Fundamentals' });
    graph.sessions = [
      {
        id: 's1',
        number: 1,
        title: 'Lesson 1: Staff and Notation',
        sections: [{ topic: '1.1: The staff, clefs, and pitch notation' }],
      },
    ];
    graph.concepts = [{ id: 'c1', term: 'Staff notation' }];
    graph.edges.teaches = [{ from: 's1', to: 'c1' }];

    const miniShard = await findCourseSources(graph, {
      storage: memoryStorage(),
      maxTopics: 1,
      limitPerTopic: 2,
      minUsefulSources: 1,
      providers: {
        searchScholarlyReadings: vi.fn(async () => []),
        searchCrossrefWorks: vi.fn(async () => []),
        searchWikipediaPages: vi.fn(async () => [
          source('wikipedia', 'Staff (military)', {
            abstract: 'A military staff is a group of officers supporting a commanding officer and military unit.',
          }),
          source('wikipedia', 'Staff (music)', {
            abstract: 'In Western musical notation, the staff carries notes whose position indicates pitch and clef.',
          }),
        ]),
      },
    });

    expect(miniShard.topics[0].sources.map((item) => item.title)).toEqual(['Staff (music)']);
  });

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

  // v0.16.1 regression: the Linear Algebra field run shipped "Independent
  // politician", "Lewis acids and bases", and "2025 Philippine general
  // election" as lesson sources because Wikipedia results were exempt from
  // the token-overlap gate and fallback queries carried no course anchor.
  it('rejects keyword false friends from every provider for linear algebra topics', async () => {
    const graph = createEmptyCourseGraph({ courseName: 'Linear Algebra' });
    graph.sessions = [
      {
        id: 's4',
        number: 4,
        title: 'Lesson 4: Linear independence',
        sections: [{ topic: '4.1: independent sets and dependence relations' }],
      },
    ];
    graph.concepts = [{ id: 'c4', term: 'linear independence' }];
    graph.edges.teaches = [{ from: 's4', to: 'c4' }];

    const wikipedia = vi.fn(async () => [
      source('wikipedia', 'Independent politician', {
        abstract: 'A politician not affiliated with any political party; elections, campaigns, and parliaments.',
      }),
      source('wikipedia', 'Teal independents', {
        abstract: 'A group of independent political candidates in Australian federal elections.',
      }),
      source('wikipedia', 'Linear independence', {
        abstract:
          'In linear algebra, vectors are linearly independent when no vector is a linear combination of the others; dependence relations and spans.',
      }),
    ]);
    const miniShard = await findCourseSources(graph, {
      storage: memoryStorage(),
      maxTopics: 1,
      limitPerTopic: 3,
      minUsefulSources: 1,
      providers: {
        searchScholarlyReadings: vi.fn(async () => []),
        searchCrossrefWorks: vi.fn(async () => []),
        searchWikipediaPages: wikipedia,
      },
    });

    const titles = miniShard.topics.flatMap((topic) => topic.sources.map((item) => item.title));
    expect(titles).toEqual(['Linear independence']);
    // Fallback provider queries carry the course-name anchor now.
    expect(wikipedia.mock.calls[0][0].toLowerCase()).toContain('linear algebra');
  }, 15000);

  it('rejects single-shared-token Crossref hits like "Lewis acids and bases" for a bases lesson', async () => {
    const graph = createEmptyCourseGraph({ courseName: 'Linear Algebra' });
    graph.sessions = [
      {
        id: 's5',
        number: 5,
        title: 'Lesson 5: Bases and dimension',
        sections: [{ topic: '5.1: bases, dimension, coordinates' }],
      },
    ];
    graph.concepts = [{ id: 'c5', term: 'basis and dimension' }];
    graph.edges.teaches = [{ from: 's5', to: 'c5' }];

    const miniShard = await findCourseSources(graph, {
      storage: memoryStorage(),
      maxTopics: 1,
      limitPerTopic: 3,
      minUsefulSources: 1,
      providers: {
        searchScholarlyReadings: vi.fn(async () => []),
        searchCrossrefWorks: vi.fn(async () => [
          source('crossref', 'Lewis acids and bases in organic synthesis', {
            abstract: 'Chemistry of electron-pair acceptors and donors, acids and bases in catalysis.',
          }),
        ]),
        searchWikipediaPages: vi.fn(async () => [
          source('wikipedia', 'Basis (linear algebra)', {
            abstract:
              'In linear algebra, a basis of a vector space is a linearly independent spanning set; dimension counts basis vectors and gives coordinates.',
          }),
        ]),
      },
    });

    const titles = miniShard.topics.flatMap((topic) => topic.sources.map((item) => item.title));
    expect(titles).toContain('Basis (linear algebra)');
    expect(titles).not.toContain('Lewis acids and bases in organic synthesis');
  }, 15000);

  it('does not cache topics whose providers were rate-limited (degraded results)', async () => {
    const storage = memoryStorage();
    const rateLimitedResult = () => {
      const result = [];
      Object.defineProperty(result, 'rateLimited', { value: true, enumerable: false });
      return result;
    };
    const openalex = vi.fn(async () => rateLimitedResult());
    const wikipedia = vi.fn(async () => [
      source('wikipedia', 'Linear independence', {
        abstract: 'Vectors are linearly independent when no dependence relation exists; linear algebra spans.',
      }),
    ]);
    const graph = createEmptyCourseGraph({ courseName: 'Linear Algebra' });
    graph.sessions = [
      {
        id: 's4',
        number: 4,
        title: 'Lesson 4: Linear independence',
        sections: [{ topic: '4.1: independent sets' }],
      },
    ];

    const run = () =>
      findCourseSources(graph, {
        storage,
        maxTopics: 1,
        limitPerTopic: 2,
        minUsefulSources: 1,
        providers: {
          searchScholarlyReadings: openalex,
          searchCrossrefWorks: vi.fn(async () => []),
          searchWikipediaPages: wikipedia,
        },
      });

    const first = await run();
    expect(first.topics[0].degraded).toBe(true);
    expect(first.topics[0].cacheHit).toBe(false);
    const second = await run();
    // A degraded topic is NOT served from cache — the providers are asked again.
    expect(second.topics[0].cacheHit).toBe(false);
    expect(openalex.mock.calls.length).toBeGreaterThanOrEqual(2);
  }, 15000);

  it('rejects CS/Python short-token Wikipedia false friends before caching sources', async () => {
    const graph = createEmptyCourseGraph({ courseName: 'Introduction to Computer Science with Python' });
    graph.sessions = [
      {
        id: 's7',
        number: 7,
        title: 'Lesson 7: strings',
        sections: [{ topic: '7.1: strings and text processing in Python' }],
      },
    ];
    graph.concepts = [{ id: 'c7', term: 'strings' }];
    graph.edges.teaches = [{ from: 's7', to: 'c7' }];

    const miniShard = await findCourseSources(graph, {
      storage: memoryStorage(),
      maxTopics: 1,
      limitPerTopic: 3,
      minUsefulSources: 1,
      providers: {
        searchScholarlyReadings: vi.fn(async () => []),
        searchCrossrefWorks: vi.fn(async () => []),
        searchWikipediaPages: vi.fn(async () => [
          source('wikipedia', 'No Strings Attached (NSYNC album)', {
            abstract: 'A pop album by NSYNC with singles, chart history, and music production notes.',
          }),
          source('wikipedia', 'String theory', {
            abstract: 'A theoretical physics framework about one-dimensional strings and quantum gravity.',
          }),
          source('wikipedia', 'String (computer science)', {
            abstract: 'A computer science article about strings as text data in programming languages.',
          }),
        ]),
      },
    });

    const titles = miniShard.topics.flatMap((topic) => topic.sources.map((item) => item.title));
    expect(titles).toEqual(['String (computer science)']);
  }, 15000);

  it('rejects CS/Python module and exception false friends before caching sources', async () => {
    const graph = createEmptyCourseGraph({ courseName: 'Introduction to Computer Science with Python' });
    graph.sessions = [
      {
        id: 's10',
        number: 10,
        title: 'Lesson 10: modules',
        sections: [{ topic: '10.1: modules and imports in Python' }],
      },
      {
        id: 's11',
        number: 11,
        title: 'Lesson 11: exceptions',
        sections: [{ topic: '11.1: exceptions and error handling in Python' }],
      },
    ];
    graph.concepts = [
      { id: 'c10', term: 'modules' },
      { id: 'c11', term: 'exceptions' },
    ];
    graph.edges.teaches = [
      { from: 's10', to: 'c10' },
      { from: 's11', to: 'c11' },
    ];

    const miniShard = await findCourseSources(graph, {
      storage: memoryStorage(),
      maxTopics: 2,
      limitPerTopic: 1,
      minUsefulSources: 1,
      providers: {
        searchScholarlyReadings: vi.fn(async () => []),
        searchCrossrefWorks: vi.fn(async () => []),
        searchWikipediaPages: vi.fn(async (query) => {
          if (/modules/i.test(query)) {
            return [
              source('wikipedia', 'Module (mathematics)', {
                abstract:
                  'An abstract algebra article about modules over a ring, with examples computed by mathematical software.',
              }),
              source('wikipedia', 'Modular programming', {
                abstract: 'A programming article about software modules, module systems, and decomposing code.',
              }),
            ];
          }
          return [
            source('wikipedia', 'Exception (law)', {
              abstract: 'A legal article about exceptions to laws, rules, and statutory clauses.',
            }),
            source('wikipedia', 'Exception handling', {
              abstract: 'A programming article about exception handling, try-catch blocks, and runtime errors.',
            }),
          ];
        }),
      },
    });

    const titles = miniShard.topics.flatMap((topic) => topic.sources.map((item) => item.title));
    expect(titles).toEqual(['Modular programming', 'Exception handling']);
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

  it('rejects Japanese writing-system false friends for a Mandarin character lesson', async () => {
    const graph = createEmptyCourseGraph({ courseName: 'Elementary Mandarin Chinese I' });
    graph.sessions = [
      {
        id: 's8',
        number: 8,
        title: 'Lesson 8: Basic Characters and Reading',
        sections: [{ topic: '8.1: Basic Characters' }],
      },
    ];
    graph.concepts = [{ id: 'c8', term: 'Basic Characters' }];
    graph.edges.teaches = [{ from: 's8', to: 'c8' }];

    const miniShard = await findCourseSources(graph, {
      storage: memoryStorage(),
      maxTopics: 1,
      limitPerTopic: 2,
      minUsefulSources: 1,
      providers: {
        searchScholarlyReadings: vi.fn(async () => []),
        searchCrossrefWorks: vi.fn(async () => [
          source('crossref', 'Basic Chinese characters for beginning Mandarin reading', {
            abstract:
              'A Mandarin reading study about basic Chinese characters, character recognition, and beginner vocabulary.',
          }),
        ]),
        searchWikipediaPages: vi.fn(async () => [
          source('wikipedia', 'Kanji', {
            abstract:
              'Kanji are logographic characters used in Japanese writing alongside hiragana and katakana.',
          }),
        ]),
      },
    });

    const titles = miniShard.topics.flatMap((topic) => topic.sources.map((item) => item.title));
    expect(titles).toContain('Basic Chinese characters for beginning Mandarin reading');
    expect(titles).not.toContain('Kanji');

    // The attach boundary re-checks legacy/cached shards too; a stale v4
    // packet cannot reintroduce the same foreign-language citation.
    const staleShard = {
      ...miniShard,
      topics: [
        {
          ...miniShard.topics[0],
          sources: [
            source('wikipedia', 'Kanji', {
              abstract:
                'Kanji are logographic characters used in Japanese writing alongside hiragana and katakana.',
            }),
            ...miniShard.topics[0].sources,
          ],
        },
      ],
    };
    const attached = attachSourceFinderResources(graph, staleShard, { maxSourcesPerTopic: 2 });
    expect(attached).toBe(1);
    expect(graph.resources.map((resource) => resource.title)).toEqual([
      'Basic Chinese characters for beginning Mandarin reading',
    ]);
  }, 15000);

  it('rejects temporal and biomedical interval false friends for an abstractly titled music course', async () => {
    const graph = createEmptyCourseGraph({ courseName: 'Interval Evidence Studio' });
    graph.sessions = [
      {
        id: 's1',
        number: 1,
        title: 'Lesson 1: Written and Heard Interval Classification',
        sections: [{ topic: '1.1: interval classification and semitone verification' }],
      },
      {
        id: 's2',
        number: 2,
        title: 'Lesson 2: Simple and Compound Intervals and Inversion',
        sections: [{ topic: '2.1: Compound Intervals' }],
      },
    ];
    graph.concepts = [{ id: 'c2', term: 'Compound Intervals' }];
    graph.edges.teaches = [{ from: 's2', to: 'c2' }];

    const miniShard = await findCourseSources(graph, {
      storage: memoryStorage(),
      maxTopics: 2,
      limitPerTopic: 3,
      minUsefulSources: 1,
      providers: {
        searchScholarlyReadings: vi.fn(async (query) =>
          /compound/i.test(query)
            ? [
                source('openalex', 'Biochemistry Changes That Occur after Death: Post-Mortem Interval', {
                  abstract:
                    'Forensic pathology and biochemistry markers for determining the post-mortem interval and time since death.',
                }),
                source('openalex', 'Open Music Theory: Compound Intervals and Inversion', {
                  abstract:
                    'Music theory instruction on pitch, semitones, compound intervals, octave reduction, and interval inversion.',
                }),
              ]
            : [],
        ),
        searchCrossrefWorks: vi.fn(async () => []),
        searchWikipediaPages: vi.fn(async (query) =>
          /compound/i.test(query)
            ? [
                source('wikipedia', 'Metronome', {
                  abstract: 'A metronome produces an audible click at a uniform interval measured in beats per minute.',
                }),
              ]
            : [],
        ),
      },
    });

    const titles = miniShard.topics.flatMap((topic) => topic.sources.map((item) => item.title));
    expect(titles).toContain('Open Music Theory: Compound Intervals and Inversion');
    expect(titles).not.toContain('Biochemistry Changes That Occur after Death: Post-Mortem Interval');
    expect(titles).not.toContain('Metronome');
  }, 15000);

  it('refuses cached music-interval false friends again at graph attachment', () => {
    const graph = createEmptyCourseGraph({ courseName: 'Interval Evidence Studio' });
    graph.sessions = [
      {
        id: 's2',
        number: 2,
        title: 'Lesson 2: Simple and Compound Intervals and Inversion',
        sections: [{ topic: 'Compound Intervals', resourceRefs: [] }],
      },
    ];
    graph.concepts = [{ id: 'c2', term: 'Compound Intervals' }];
    graph.edges.teaches = [{ from: 's2', to: 'c2' }];

    const attached = attachSourceFinderResources(graph, {
      courseName: 'Interval Evidence Studio',
      topics: [
        {
          sessionId: 's2',
          lessonNumber: 2,
          topic: 'Compound Intervals',
          sources: [
            source('openalex', 'Biochemistry Changes That Occur after Death: Post-Mortem Interval', {
              abstract: 'Forensic biochemistry markers for the post-mortem interval and time since death.',
            }),
            source('wikipedia', 'Open Music Theory: Compound Intervals and Inversion', {
              abstract: 'Music theory guide to pitch, semitones, compound intervals, and interval inversion.',
            }),
          ],
        },
      ],
    });

    expect(attached).toBe(1);
    expect(graph.resources.map((resource) => resource.title)).toEqual([
      'Open Music Theory: Compound Intervals and Inversion',
    ]);
  });

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

  it('rejects bare refinement false friends for UX refinement topics before caching sources', async () => {
    const graph = createEmptyCourseGraph({ courseName: 'User Experience Design Studio' });
    graph.sessions = [
      {
        id: 's8',
        number: 8,
        title: 'Lesson 8: Design iteration',
        sections: [{ topic: '8.1: refinement, critique response, and implementation' }],
      },
    ];
    graph.concepts = [
      { id: 'c1', term: 'refinement' },
      { id: 'c2', term: 'critique response' },
      { id: 'c3', term: 'implementation' },
    ];
    graph.edges.teaches = [
      { from: 's8', to: 'c1' },
      { from: 's8', to: 'c2' },
      { from: 's8', to: 'c3' },
    ];
    const badRefinementSources = [
      source('crossref', 'Relating Data Refinement and Failures-Divergences Refinement', {
        doi: '10.1007/978-3-319-92711-4_10',
        license: 'http://www.springer.com/tdm',
        abstract: 'Formal methods chapter about data refinement and failures-divergences refinement.',
      }),
      source('crossref', 'Vehicle refinement: purpose and targets', {
        doi: '10.1016/b978-075066129-4/50003-1',
        license: 'https://www.elsevier.com/tdm/userlicense/1.0/',
        abstract: 'Automotive engineering chapter about vehicle refinement targets.',
      }),
    ];
    const goodUxSources = [
      source('wikipedia', 'Iterative design', {
        abstract: 'Iterative design is a design methodology based on prototyping, testing, analysis, and refinement.',
      }),
    ];

    const miniShard = await findCourseSources(graph, {
      storage: memoryStorage(),
      maxTopics: 1,
      limitPerTopic: 3,
      minUsefulSources: 1,
      providers: {
        openalex: vi.fn(async () => []),
        searchScholarlyReadings: vi.fn(async () => []),
        crossref: vi.fn(async () => badRefinementSources),
        searchCrossrefWorks: vi.fn(async () => badRefinementSources),
        eric: vi.fn(async () => []),
        searchEducationResearch: vi.fn(async () => []),
        wikipedia: vi.fn(async () => goodUxSources),
        searchWikipediaPages: vi.fn(async () => goodUxSources),
        loc: vi.fn(async () => []),
        searchLibraryOfCongress: vi.fn(async () => []),
        internetarchive: vi.fn(async () => []),
        searchInternetArchiveTexts: vi.fn(async () => []),
        openlibrary: vi.fn(async () => []),
        searchBookMetadata: vi.fn(async () => []),
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
