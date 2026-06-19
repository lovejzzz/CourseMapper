import { describe, expect, it, vi } from 'vitest';

import { createEmptyCourseGraph } from '../../courseGraph/schema.js';
import { renderCourseMapFromGraph } from '../../courseGraph/renderCourseMap.js';
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
    license: provider === 'wikipedia' ? 'CC BY-SA 4.0' : 'cc-by',
    attribution: provider,
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
