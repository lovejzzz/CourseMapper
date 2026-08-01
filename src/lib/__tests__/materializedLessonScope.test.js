import { describe, expect, it } from 'vitest';
import {
  inferMaterializedSourceLessonFilter,
  prepareMaterializedPackageScope,
  preserveMaterializedLessonNumbers,
  preserveDeliverableLessonNumbers,
  remapLessonFilterToMaterializedScope,
  resolveExpectedDeliverableLessonNumbers,
  resolveMaterializedSourceLessonFilter,
} from '../materializedLessonScope';

describe('remapLessonFilterToMaterializedScope', () => {
  it('remaps a nonzero source lesson after generation materializes a compact subset', () => {
    expect(remapLessonFilterToMaterializedScope({ lessons: [{ title: 'Lesson 5' }] }, [4])).toEqual([0]);
  });

  it('keeps source indices when the full Course Map is still present', () => {
    const courseMap = { lessons: Array.from({ length: 12 }, (_, index) => ({ title: `Lesson ${index + 1}` })) };
    expect(remapLessonFilterToMaterializedScope(courseMap, [4])).toEqual([4]);
  });

  it('does not hide a mismatched partial scope', () => {
    expect(remapLessonFilterToMaterializedScope({ lessons: [{}, {}] }, [7])).toEqual([7]);
  });

  it('preserves all-lessons and empty-filter semantics', () => {
    expect(remapLessonFilterToMaterializedScope({ lessons: [{}] }, null)).toBeNull();
    expect(remapLessonFilterToMaterializedScope({ lessons: [{}] }, [])).toEqual([]);
  });
});

describe('preserveMaterializedLessonNumbers', () => {
  it('keeps a focused Lesson 5 workspace labeled as Lesson 5', () => {
    const result = preserveMaterializedLessonNumbers(
      { lessons: [{ title: 'Lesson 1: Design Research', sections: [] }] },
      [4],
    );

    expect(result.lessons[0]).toEqual(
      expect.objectContaining({ title: 'Lesson 5: Design Research', sourceLessonNumber: 5 }),
    );
  });

  it('does not relabel a map whose materialized size disagrees with the requested scope', () => {
    const courseMap = { lessons: [{ title: 'Lesson 1' }, { title: 'Lesson 2' }] };
    expect(preserveMaterializedLessonNumbers(courseMap, [4])).toBe(courseMap);
  });
});

describe('resolveMaterializedSourceLessonFilter', () => {
  it('recovers the source scope when the export panel means all materialized lessons', () => {
    expect(resolveMaterializedSourceLessonFilter({ lessons: [{}] }, null, [4])).toEqual([4]);
    expect(resolveMaterializedSourceLessonFilter({ lessons: [{}] }, [], [4])).toEqual([4]);
  });

  it('maps an export-panel subset back to source lesson indices', () => {
    expect(resolveMaterializedSourceLessonFilter({ lessons: [{}, {}] }, [1], [4, 8])).toEqual([8]);
  });

  it('leaves ordinary full-map filters unchanged', () => {
    const fullMap = { lessons: Array.from({ length: 10 }, () => ({})) };
    expect(resolveMaterializedSourceLessonFilter(fullMap, [4], [4])).toEqual([4]);
  });
});

describe('preserveDeliverableLessonNumbers', () => {
  it('stamps compact Quiz and Rubric items with the original lesson identity', () => {
    const result = preserveDeliverableLessonNumbers(
      {
        items: [
          { lessonTitle: 'Lesson 1: Marketing Concept', weekNumber: 'Week 1' },
          { lt: 'Lesson 1: Positioning', ln: 1 },
        ],
      },
      'items',
      [4, 8],
      { lessons: [{ title: 'Lesson 1: Marketing Concept' }, { title: 'Lesson 2: Positioning' }] },
    );

    expect(result.items[0]).toEqual(
      expect.objectContaining({ lessonTitle: 'Lesson 5: Marketing Concept', weekNumber: 'Week 5' }),
    );
    expect(result.items[1]).toEqual(expect.objectContaining({ lt: 'Lesson 9: Positioning', ln: 9 }));
  });

  it('does not relabel the first item in an ordinary full-course package', () => {
    const parsed = {
      items: Array.from({ length: 6 }, (_, index) => ({ lessonTitle: `Lesson ${index + 1}` })),
    };
    const courseMap = {
      lessons: Array.from({ length: 6 }, (_, index) => ({ title: `Lesson ${index + 1}` })),
    };

    expect(preserveDeliverableLessonNumbers(parsed, 'items', [4], courseMap)).toBe(parsed);
  });

  it('relabels a one-item scoped generation against its full Course Map', () => {
    const parsed = { items: [{ lessonTitle: 'Lesson 1: Marketing Concept', lessonNumber: 1 }] };
    const courseMap = {
      lessons: Array.from({ length: 6 }, (_, index) => ({ title: `Lesson ${index + 1}: Topic ${index + 1}` })),
    };

    expect(preserveDeliverableLessonNumbers(parsed, 'items', [4], courseMap).items[0]).toEqual(
      expect.objectContaining({ lessonTitle: 'Lesson 5: Topic 5', lessonNumber: 5 }),
    );
  });

  it('canonicalizes every identity-bearing field in a compact scoped result', () => {
    const parsed = {
      items: [
        {
          sourceLessonNumber: 2,
          lessonNumber: 2,
          lessonIndex: 1,
          lessonTitle: 'Lesson 3: Contradictory title',
          weekNumber: 'Week 4',
          title: 'Quiz for Lesson 3',
        },
      ],
    };
    const courseMap = {
      lessons: Array.from({ length: 6 }, (_, index) => ({ title: `Lesson ${index + 1}: Topic ${index + 1}` })),
    };

    expect(preserveDeliverableLessonNumbers(parsed, 'items', [4], courseMap).items[0]).toEqual(
      expect.objectContaining({
        sourceLessonNumber: 5,
        lessonNumber: 5,
        lessonIndex: 4,
        lessonTitle: 'Lesson 5: Topic 5',
        weekNumber: 'Week 5',
        title: 'Quiz for Lesson 5',
      }),
    );
  });
});

describe('prepareMaterializedPackageScope', () => {
  it('normalizes the persisted focused-workspace shape before every package gate', () => {
    const result = prepareMaterializedPackageScope({
      courseMap: {
        courseName: 'Principles of Marketing',
        lessons: [{ title: 'Lesson 1: Marketing Concept', sections: [] }],
      },
      deliverables: {
        lessonPlans: {
          status: 'done',
          data: {
            lessonPlans: [{ lessonTitle: 'Lesson 5: Marketing Concept', weekNumber: 'Week 5', duration: '50 minutes' }],
          },
        },
        rubrics: {
          status: 'done',
          data: { rubrics: [{ lessonTitle: 'Lesson 5: Marketing Concept', lessonNumber: 1 }] },
        },
        quizBank: {
          status: 'done',
          data: {
            bankIndex: [{ lessonNumber: 1, lessonTitle: 'Lesson 1: Marketing Concept' }],
            quizzes: [{ lessonNumber: 1, lessonTitle: 'Lesson 1: Marketing Concept', questions: [] }],
          },
        },
      },
      lessonFilter: [4],
      explicitSourceFilter: [4],
    });

    expect(result.sourceLessonFilter).toEqual([4]);
    expect(result.effectiveLessonFilter).toEqual([0]);
    expect(result.courseMap.lessons[0]).toEqual(
      expect.objectContaining({ title: 'Lesson 5: Marketing Concept', sourceLessonNumber: 5 }),
    );
    expect(result.deliverables.lessonPlans.data.lessonPlans[0]).toEqual(
      expect.objectContaining({ lessonTitle: 'Lesson 5: Marketing Concept', weekNumber: 'Week 5' }),
    );
    expect(result.deliverables.rubrics.data.rubrics[0]).toEqual(
      expect.objectContaining({ lessonTitle: 'Lesson 5: Marketing Concept', lessonNumber: 5 }),
    );
    expect(result.deliverables.quizBank.data.quizzes[0]).toEqual(
      expect.objectContaining({ lessonTitle: 'Lesson 5: Marketing Concept', lessonNumber: 5 }),
    );
  });

  it('uses identity evidence from every deliverable array when an older project has no source scope', () => {
    const result = prepareMaterializedPackageScope({
      courseMap: { lessons: [{ title: 'Lesson 1: Marketing Concept' }] },
      deliverables: {
        quizBank: {
          status: 'done',
          data: {
            bankIndex: [{ lessonNumber: 1 }],
            quizzes: [{ lessonTitle: 'Lesson 5: Marketing Concept', lessonNumber: 1 }],
          },
        },
      },
    });

    expect(result.sourceLessonFilter).toEqual([4]);
    expect(result.courseMap.lessons[0].sourceLessonNumber).toBe(5);
  });
});

describe('resolveExpectedDeliverableLessonNumbers', () => {
  it('uses source identities for a compact materialized workspace', () => {
    const courseMap = {
      lessons: [{ title: 'Lesson 5: Marketing Concept', sourceLessonNumber: 5 }],
    };

    expect(resolveExpectedDeliverableLessonNumbers(courseMap, null)).toEqual([5]);
    expect(resolveExpectedDeliverableLessonNumbers(courseMap, [0])).toEqual([5]);
  });

  it('keeps ordinary full-course and explicit subset identities', () => {
    const courseMap = {
      lessons: Array.from({ length: 6 }, (_, index) => ({ title: `Lesson ${index + 1}: Topic` })),
    };

    expect(resolveExpectedDeliverableLessonNumbers(courseMap, null)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(resolveExpectedDeliverableLessonNumbers(courseMap, [1, 4])).toEqual([2, 5]);
  });
});

describe('inferMaterializedSourceLessonFilter', () => {
  it('recovers Lesson 5 from saved compiled payloads when old scope state is missing', () => {
    const inferred = inferMaterializedSourceLessonFilter(
      { lessons: [{ title: 'Lesson 1: Marketing Concept' }] },
      {
        lessonPlans: {
          status: 'done',
          data: {
            lessonPlans: [{ lessonNumber: 1, lessonTitle: 'Lesson 5: Marketing Concept', weekNumber: 'Week 5' }],
          },
        },
      },
      null,
    );

    expect(inferred).toEqual([4]);
  });

  it('ignores stale aliases and metadata arrays when recovering source scope', () => {
    const inferred = inferMaterializedSourceLessonFilter(
      { lessons: [{ title: 'Lesson 1: Marketing Concept' }] },
      {
        lessonPlans: {
          status: 'done',
          data: {
            metadata: [{ lessonTitle: 'Lesson 99: Stale metadata' }],
            lessonPlans: [{ lessonTitle: 'Lesson 5: Marketing Concept' }],
            plans: [{ lessonTitle: 'Lesson 8: Stale plan' }],
          },
        },
      },
      null,
    );

    expect(inferred).toEqual([4]);
  });
});
