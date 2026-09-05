import { describe, expect, it } from 'vitest';
import {
  assertDeveloperSnapshot,
  diffDeveloperSnapshots,
  formatDeveloperDiffItem,
  getDeveloperDestructiveDiffs,
  getDeveloperSectionFindings,
  getDeveloperSnapshotFindings,
  isDeveloperDestructiveDiff,
} from '../developerIdeDiagnostics';

function baseSnapshot(overrides = {}) {
  return {
    courseMap: {
      lessons: [
        {
          title: 'Week 1',
          sections: [{ learningGoals: 'Goals' }],
        },
      ],
    },
    selectedFeatures: ['courseMap', 'lessonPlans'],
    deliverableConfig: {},
    lessonScope: { type: 'all' },
    columns: [{ key: 'learningGoals', label: 'Learning Goals' }],
    activeTab: 'courseMap',
    ...overrides,
  };
}

describe('developerIdeDiagnostics', () => {
  it('blocks structurally unsafe snapshots', () => {
    expect(() =>
      assertDeveloperSnapshot(
        baseSnapshot({
          courseMap: {
            lessons: [
              {
                title: 'Week 1',
                sections: ['not a section object'],
              },
            ],
          },
        }),
      ),
    ).toThrow('courseMap.lessons[0].sections[0]');
  });

  it('reports prompt and config warnings without blocking valid JSON', () => {
    const findings = getDeveloperSnapshotFindings(
      baseSnapshot({
        selectedFeatures: ['lessonPlans', 'lessonPlans'],
        deliverableConfig: {
          lessonPlans: {
            customUserPrompt: 'Generate a plan without the reusable placeholder.',
          },
        },
        columns: [
          { key: 'learningGoals', label: 'Learning Goals' },
          { key: 'learningGoals', label: 'Duplicate' },
        ],
        activeTab: 'slideDecks',
      }),
    );

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ level: 'warning', path: 'selectedFeatures' }),
        expect.objectContaining({ level: 'warning', path: 'deliverableConfig.lessonPlans.customUserPrompt' }),
        expect.objectContaining({ level: 'warning', path: 'columns[1].key' }),
        expect.objectContaining({ level: 'warning', path: 'activeTab' }),
      ]),
    );
  });

  it('validates individual editor sections', () => {
    const findings = getDeveloperSectionFindings('config', {
      lessonScope: { type: 'specific', indices: ['1'] },
      columns: [{ key: '' }],
    });

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ level: 'error', path: 'lessonScope.indices[0]' }),
        expect.objectContaining({ level: 'error', path: 'columns[0].key' }),
      ]),
    );
  });

  it('blocks secret-bearing developer snapshots', () => {
    const unsafe = baseSnapshot({
      deliverableConfig: {
        slideDecks: {
          extraInstructions: 'Use sk-proj-abcdefghijklmnopqrstuvwxyz123456',
        },
      },
    });

    expect(getDeveloperSnapshotFindings(unsafe)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ level: 'error', path: 'deliverableConfig.slideDecks.extraInstructions' }),
      ]),
    );
    expect(() => assertDeveloperSnapshot(unsafe)).toThrow('extraInstructions');
  });

  it('builds path-level snapshot diffs', () => {
    const diffs = diffDeveloperSnapshots(
      baseSnapshot(),
      baseSnapshot({
        selectedFeatures: ['courseMap', 'lessonPlans', 'quizBank'],
        provider: 'openai',
      }),
      { limit: 10 },
    );

    expect(diffs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'changed', path: 'selectedFeatures.length' }),
        expect.objectContaining({ type: 'added', path: 'selectedFeatures[2]' }),
        expect.objectContaining({ type: 'added', path: 'provider' }),
      ]),
    );
    expect(formatDeveloperDiffItem(diffs.find((diff) => diff.path === 'provider'))).toBe('Added provider');
  });

  it('classifies removed values and shrinking arrays as destructive diffs', () => {
    const diffs = diffDeveloperSnapshots(
      baseSnapshot({
        deliverables: {
          lessonPlans: { status: 'done', data: { lessonPlans: [{ title: 'Week 1' }] } },
        },
      }),
      baseSnapshot({
        selectedFeatures: ['courseMap'],
        deliverables: {},
      }),
      { limit: 20 },
    );
    const destructive = getDeveloperDestructiveDiffs(
      baseSnapshot({
        deliverables: {
          lessonPlans: { status: 'done', data: { lessonPlans: [{ title: 'Week 1' }] } },
        },
      }),
      baseSnapshot({
        selectedFeatures: ['courseMap'],
        deliverables: {},
      }),
      { limit: 20 },
    );

    expect(isDeveloperDestructiveDiff(diffs.find((diff) => diff.path === 'selectedFeatures.length'))).toBe(true);
    expect(destructive).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'changed', path: 'selectedFeatures.length' }),
        expect.objectContaining({ type: 'removed', path: 'selectedFeatures[1]' }),
        expect.objectContaining({ type: 'removed', path: 'deliverables.lessonPlans' }),
      ]),
    );
  });
});
