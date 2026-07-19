import { describe, expect, it } from 'vitest';
import { assertRevisionPreservesLessonSet } from '../useRevision';

const courseMap = (count) => ({
  lessons: Array.from({ length: count }, (_, index) => ({ title: `Lesson ${index + 1}` })),
});

describe('assertRevisionPreservesLessonSet', () => {
  it('rejects incomplete full-map output for a read-only request', () => {
    expect(() =>
      assertRevisionPreservesLessonSet(courseMap(6), courseMap(3), 'Check for duplicate lesson topics.'),
    ).toThrow('only 3 of 6 lessons');
  });

  it('accepts complete revisions and explicit lesson-count reductions', () => {
    expect(assertRevisionPreservesLessonSet(courseMap(6), courseMap(6), 'Improve the objectives.')).toEqual(
      courseMap(6),
    );
    expect(assertRevisionPreservesLessonSet(courseMap(6), courseMap(3), 'Reduce the course to 3 lessons.')).toEqual(
      courseMap(3),
    );
  });
});
