import { describe, expect, it } from 'vitest';
import {
  ALGI_RESEARCH_CACHE_KEY,
  algiResearchCacheEntryKey,
  clearAlgiResearchCache,
  readAlgiResearchCache,
  writeAlgiResearchCache,
} from '../algiResearchCache.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function admittedKernel() {
  return {
    id: 'researched/doaj-test',
    term: 'Test',
    definition: {
      text: 'Test is supported by a retained source passage.',
      anchor: { src: 'doaj:test', loc: 'Abstract', quote: 'Test is supported by a retained source passage.' },
    },
    facts: [],
    provenance: {
      origin: 'algi-research',
      providerId: 'doaj',
      entailment: { status: 'passed', checkedClaims: 1, minimumScore: 1 },
    },
  };
}

describe('Algi local research cache', () => {
  it('reuses admitted lesson evidence without storing provider response bodies', () => {
    const storage = memoryStorage();
    const now = Date.UTC(2026, 6, 27);
    expect(
      writeAlgiResearchCache({
        courseName: 'Test Course',
        records: [
          {
            topic: 'Evidence',
            kernels: [admittedKernel()],
            evidence: { status: 'ready', sourceCount: 2 },
            freshnessDays: 14,
          },
        ],
        storage,
        now,
      }),
    ).toEqual({ written: 1, persisted: true });

    const raw = storage.getItem(ALGI_RESEARCH_CACHE_KEY);
    expect(raw).toContain('retained source passage');
    expect(raw).not.toContain('snapshot');
    const hit = readAlgiResearchCache({
      courseName: 'Test Course',
      topics: ['Evidence'],
      storage,
      now: now + 60_000,
    });
    expect(hit.hits).toBe(1);
    expect(hit.byTopic.get('Evidence').kernels[0].id).toBe('researched/doaj-test');
  });

  it('expires time-sensitive research and refuses unentailed kernels', () => {
    const storage = memoryStorage();
    const now = Date.UTC(2026, 6, 27);
    const unsafe = admittedKernel();
    delete unsafe.provenance.entailment;
    expect(
      writeAlgiResearchCache({
        courseName: 'Policy',
        records: [{ topic: 'Current law', kernels: [unsafe], freshnessDays: 1 }],
        storage,
        now,
      }),
    ).toEqual({ written: 0, persisted: true });

    writeAlgiResearchCache({
      courseName: 'Policy',
      records: [{ topic: 'Current law', kernels: [admittedKernel()], freshnessDays: 1 }],
      storage,
      now,
    });
    const expired = readAlgiResearchCache({
      courseName: 'Policy',
      topics: ['Current law'],
      storage,
      now: now + 2 * 86_400_000,
    });
    expect(expired).toMatchObject({ hits: 0, expired: 1 });
    expect(clearAlgiResearchCache(storage)).toBe(true);
    expect(storage.getItem(ALGI_RESEARCH_CACHE_KEY)).toBeNull();
  });

  it('uses course and lesson identity in the cache key', () => {
    expect(algiResearchCacheEntryKey('Physics', 'Waves')).not.toBe(algiResearchCacheEntryKey('Music Theory', 'Waves'));
  });
});
