import { describe, expect, it } from 'vitest';
import { bindAdmittedSourcesToTeachingSurfaces } from '../admittedSourceBinding.js';

describe('admitted source teaching-surface binding', () => {
  it('replaces source scaffolds with exact admitted sources on map and graph surfaces', () => {
    const result = bindAdmittedSourcesToTeachingSurfaces(
      {
        lessons: [
          {
            title: 'Lesson 1: Sampling',
            sections: [{ supportingResources: 'Practice guide for Sampling.' }],
          },
        ],
      },
      {
        resources: [{ id: 'r1', citation: 'Practice guide for Sampling.', origin: 'syllabus' }],
        sessions: [{ id: 's1', number: 1, sections: [{ resourceRefs: ['r1'] }] }],
      },
      {
        byLessonId: {
          'lesson-1': {
            status: 'admitted',
            authorityKind: 'verified-open-research',
            receiptSha256: 'a'.repeat(64),
            sources: [
              {
                id: 'sampling-source',
                title: 'Simple random sample',
                url: 'https://en.wikipedia.org/wiki/Simple_random_sample',
                license: 'CC BY-SA 4.0',
                provider: 'wikipedia',
                attribution: 'Wikipedia contributors',
                supportReceipt: {
                  status: 'passed',
                  checkedClaims: 1,
                  minimumScore: 1,
                  sourceSnapshot: { sourceId: 'sampling-source' },
                  checks: [{ sourceId: 'sampling-source', claim: 'A sampled claim.' }],
                },
              },
            ],
          },
        },
      },
    );

    expect(result.courseMap.lessons[0].sections[0].supportingResources).toContain('Simple random sample');
    expect(result.courseMap.lessons[0].sections[0].supportingResources).not.toContain('Practice guide');
    expect(result.courseGraph.sessions[0].sections[0].resourceRefs).toEqual(['evidence-source-1-1']);
    expect(result.courseGraph.resources.some((resource) => resource.id === 'r1')).toBe(false);
    expect(result.courseGraph.resources).toContainEqual(
      expect.objectContaining({
        id: 'evidence-source-1-1',
        provider: 'wikipedia',
        origin: 'algi-research',
        sourceWorkId: 'sampling-source',
        supportReceipt: expect.objectContaining({ status: 'passed' }),
        governingSourceReceiptSha256: 'a'.repeat(64),
      }),
    );
  });

  it('recognizes curated WALS authority as authentic-language source evidence', () => {
    const result = bindAdmittedSourcesToTeachingSurfaces(
      { lessons: [{ title: 'Lesson 1', sections: [{}] }] },
      { resources: [], sessions: [{ id: 's1', number: 1, sections: [{ resourceRefs: ['packet'] }] }] },
      {
        byLessonId: {
          'lesson-1': {
            status: 'admitted',
            authorityKind: 'curated-authentic-language-evidence',
            receiptSha256: 'b'.repeat(64),
            sources: [
              {
                id: 'wals-order-81',
                title: 'WALS Online — Order of Subject, Object and Verb',
                url: 'https://wals.info/chapter/81',
                license: 'CC BY 4.0',
              },
            ],
          },
        },
      },
    );

    expect(result.courseGraph.resources[0]).toMatchObject({
      provider: 'wals',
      origin: 'authentic-language-data',
    });
    expect(result.courseGraph.sessions[0].sections[0].resourceRefs).toEqual(['evidence-source-1-1']);
  });

  it('retains a superseded-looking resource while another lesson still references it', () => {
    const result = bindAdmittedSourcesToTeachingSurfaces(
      {
        lessons: [
          { title: 'Lesson 1', sections: [{}] },
          { title: 'Lesson 2', sections: [{}] },
        ],
      },
      {
        resources: [{ id: 'shared', citation: 'Shared instructor source', origin: 'syllabus' }],
        sessions: [
          { id: 's1', number: 1, sections: [{ resourceRefs: ['shared'] }] },
          { id: 's2', number: 2, sections: [{ resourceRefs: ['shared'] }] },
        ],
      },
      {
        byLessonId: {
          'lesson-1': {
            status: 'admitted',
            receiptSha256: 'c'.repeat(64),
            sources: [
              {
                title: 'Exact lesson source',
                url: 'https://example.edu/exact',
                license: 'CC BY 4.0',
                provider: 'doaj',
              },
            ],
          },
        },
      },
    );

    expect(result.courseGraph.resources.some((resource) => resource.id === 'shared')).toBe(true);
    expect(result.courseGraph.sessions[1].sections[0].resourceRefs).toEqual(['shared']);
  });

  it('projects only sources supporting learner-visible claims, while retaining passage-only sources in the audit contract', () => {
    const result = bindAdmittedSourcesToTeachingSurfaces(
      { lessons: [{ title: 'Lesson 1', sections: [{}] }] },
      { resources: [], sessions: [{ id: 's1', number: 1, sections: [{ resourceRefs: [] }] }] },
      {
        byLessonId: {
          'lesson-1': {
            status: 'admitted',
            receiptSha256: 'd'.repeat(64),
            claims: [
              { text: 'Selected teaching fact.', claimRole: 'fact', sourceIds: ['selected'] },
              { text: 'Audit-only passage.', claimRole: 'source-passage', sourceIds: ['audit-only'] },
            ],
            sources: [
              { id: 'selected', title: 'Selected source', url: 'https://example.edu/selected' },
              { id: 'audit-only', title: 'Audit-only source', url: 'https://example.edu/audit-only' },
            ],
          },
        },
      },
    );

    expect(result.courseMap.lessons[0].sections[0].supportingResources).toContain('Selected source');
    expect(result.courseMap.lessons[0].sections[0].supportingResources).not.toContain('Audit-only source');
    expect(result.courseGraph.resources).toHaveLength(1);
  });

  it('keeps exact lesson-identity sources and leaves incidental teaching claims in the audit contract', () => {
    const result = bindAdmittedSourcesToTeachingSurfaces(
      {
        lessons: [{ title: 'Lesson 3: Color and contrast', sections: [{ topicSection: 'Color and contrast' }] }],
      },
      { resources: [], sessions: [{ id: 's3', number: 1, sections: [{ resourceRefs: [] }] }] },
      {
        byLessonId: {
          'lesson-1': {
            status: 'admitted',
            receiptSha256: 'e'.repeat(64),
            claims: [
              { text: 'Color fact.', claimRole: 'fact', sourceIds: ['color'] },
              { text: 'Contrast fact.', claimRole: 'fact', sourceIds: ['contrast'] },
              { text: 'Incidental painting fact.', claimRole: 'fact', sourceIds: ['painting'] },
            ],
            sources: [
              { id: 'color', title: 'Color', url: 'https://example.edu/color' },
              { id: 'contrast', title: 'Contrast (vision)', url: 'https://example.edu/contrast' },
              { id: 'painting', title: 'Painting', url: 'https://example.edu/painting' },
            ],
          },
        },
      },
    );

    expect(result.courseGraph.resources.map((resource) => resource.title)).toEqual(['Color', 'Contrast (vision)']);
  });

  it('deduplicates the same admitted URL when independently verified authorities converge', () => {
    const result = bindAdmittedSourcesToTeachingSurfaces(
      { lessons: [{ title: 'Lesson 1: Language variation', sections: [{}] }] },
      { resources: [], sessions: [{ id: 's1', number: 1, sections: [{ resourceRefs: [] }] }] },
      {
        byLessonId: {
          'lesson-1': {
            status: 'admitted',
            receiptSha256: 'f'.repeat(64),
            sources: [
              { id: 'research', title: 'Variation (linguistics)', url: 'https://example.edu/variation' },
              { id: 'library', title: 'Variation (linguistics)', url: 'https://example.edu/variation/' },
            ],
          },
        },
      },
    );

    expect(result.courseGraph.resources.map((resource) => resource.title)).toEqual(['Variation (linguistics)']);
    expect(result.courseGraph.sessions[0].sections[0].resourceRefs).toEqual(['evidence-source-1-1']);
  });
});
