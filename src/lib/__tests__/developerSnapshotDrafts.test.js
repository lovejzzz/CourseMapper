import { describe, expect, it } from 'vitest';
import {
  buildProposedSnapshot,
  clone,
  createDrafts,
  extractSection,
  mergeSection,
  parseDraft,
  pretty,
  summarizeDiff,
} from '../developerSnapshotDrafts';

function snapshot(overrides = {}) {
  return {
    courseMap: {
      lessons: [{ title: 'Week 1', sections: [{ topic: 'Intro' }] }],
    },
    selectedFeatures: ['courseMap', 'lessonPlans'],
    deliverableConfig: {},
    lessonScope: { type: 'all' },
    columns: [{ key: 'topic', label: 'Topic' }],
    deliverables: {
      lessonPlans: { status: 'done', data: { lessonPlans: [] } },
    },
    activeTab: 'courseMap',
    provider: 'openai',
    modelId: 'gpt-5.4-mini',
    ...overrides,
  };
}

describe('developerSnapshotDrafts', () => {
  it('creates drafts for each editor section', () => {
    const drafts = createDrafts(snapshot());

    expect(JSON.parse(drafts.courseMap).lessons).toHaveLength(1);
    expect(JSON.parse(drafts.deliverables).lessonPlans.status).toBe('done');
    expect(JSON.parse(drafts.config)).toEqual(
      expect.objectContaining({
        selectedFeatures: ['courseMap', 'lessonPlans'],
        provider: 'openai',
      }),
    );
    expect(JSON.parse(drafts.raw).courseMap.lessons[0].title).toBe('Week 1');
  });

  it('extracts and merges config without project content fields', () => {
    const config = extractSection(snapshot(), 'config');

    expect(config).toEqual(
      expect.objectContaining({
        selectedFeatures: ['courseMap', 'lessonPlans'],
        columns: [{ key: 'topic', label: 'Topic' }],
      }),
    );
    expect(config.courseMap).toBeUndefined();

    const merged = mergeSection(snapshot(), 'config', {
      selectedFeatures: ['courseMap'],
      modelId: 'gpt-5.5',
    });

    expect(merged.selectedFeatures).toEqual(['courseMap']);
    expect(merged.modelId).toBe('gpt-5.5');
    expect(merged.provider).toBeUndefined();
    expect(merged.courseMap.lessons).toHaveLength(1);
  });

  it('parses drafts and surfaces JSON errors', () => {
    expect(parseDraft('courseMap', pretty(snapshot().courseMap)).lessons).toHaveLength(1);
    expect(() => parseDraft('courseMap', '{')).toThrow('JSON syntax error');
    expect(() => parseDraft('courseMap', pretty({ lessons: ['bad'] }))).toThrow('courseMap.lessons[0]');
  });

  it('builds proposed snapshots from dirty sections', () => {
    const base = snapshot();
    const drafts = createDrafts(base);
    drafts.config = pretty({
      ...JSON.parse(drafts.config),
      activeTab: 'lessonPlans',
    });
    drafts.courseMap = pretty({
      lessons: [{ title: 'Week 2', sections: [{ topic: 'Next' }] }],
    });

    const proposed = buildProposedSnapshot(base, drafts, new Set(['config', 'courseMap']));

    expect(proposed.activeTab).toBe('lessonPlans');
    expect(proposed.courseMap.lessons[0].title).toBe('Week 2');
    expect(proposed.deliverables.lessonPlans.status).toBe('done');
  });

  it('clones and summarizes diffs without mutating the source', () => {
    const base = snapshot();
    const copied = clone(base);
    copied.courseMap.lessons[0].title = 'Changed';

    expect(base.courseMap.lessons[0].title).toBe('Week 1');
    expect(summarizeDiff(base, copied)).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'courseMap.lessons[0].title' })]),
    );
  });
});
