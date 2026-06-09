import { describe, expect, it } from 'vitest';
import {
  assertExpectedLessonCount,
  buildIncompleteCourseMapErrorMessage,
  getCourseMapExamineScan,
  getLessonCount,
} from '../useGeneration';

describe('useGeneration completion guards', () => {
  it('counts generated lessons defensively', () => {
    expect(getLessonCount({ lessons: [{ title: 'One' }, { title: 'Two' }] })).toBe(2);
    expect(getLessonCount({ lessons: null })).toBe(0);
    expect(getLessonCount(null)).toBe(0);
  });

  it('throws a clear terminal error when continuation stops before the expected lesson count', () => {
    expect(() => assertExpectedLessonCount({ lessons: [{ title: 'One' }, { title: 'Two' }] }, 3)).toThrow(
      buildIncompleteCourseMapErrorMessage(2, 3),
    );
  });

  it('allows complete or unknown lesson-count results to continue', () => {
    const courseMap = { lessons: [{ title: 'One' }, { title: 'Two' }] };

    expect(assertExpectedLessonCount(courseMap, 2)).toBe(courseMap);
    expect(assertExpectedLessonCount(courseMap, null)).toBe(courseMap);
  });
});

describe('getCourseMapExamineScan', () => {
  const columns = [
    { key: 'topicSection', enabled: true },
    { key: 'learningObjectives', enabled: true },
  ];
  const fullSection = { topicSection: 'Topic', learningObjectives: 'Objectives' };
  const cleanLesson = (title) => ({ title, sections: [{ ...fullSection }] });

  it('returns no triggers and no focus for a clean course map', () => {
    const scan = getCourseMapExamineScan({
      courseMap: { lessons: [cleanLesson('Lesson 1: A'), cleanLesson('Lesson 2: B')] },
      columns,
    });
    expect(scan.triggers).toEqual([]);
    expect(scan.focusLessonIndices).toBeNull();
  });

  it('focuses the examine call on the minority of lessons with local problems', () => {
    const scan = getCourseMapExamineScan({
      courseMap: {
        lessons: [
          cleanLesson('Lesson 1: A'),
          { title: 'Lesson 2: B', sections: [{ topicSection: '', learningObjectives: 'Objectives' }] },
          cleanLesson('Lesson 3: C'),
        ],
      },
      columns,
    });
    expect(scan.triggers.length).toBeGreaterThan(0);
    expect(scan.focusLessonIndices).toEqual([1]);
  });

  it('keeps a full review when problems are global', () => {
    const missingExpected = getCourseMapExamineScan({
      courseMap: { lessons: [cleanLesson('Lesson 1: A')] },
      columns,
      expectedInfo: { expected: 3, confidence: 'high' },
    });
    expect(missingExpected.triggers.some((t) => t.includes('expected 3 lessons'))).toBe(true);
    expect(missingExpected.focusLessonIndices).toBeNull();

    const structuralFixes = getCourseMapExamineScan({
      courseMap: {
        lessons: [cleanLesson('Lesson 1: A'), { title: '', sections: [] }],
      },
      columns,
      validationWarnings: ['fixed something'],
    });
    expect(structuralFixes.focusLessonIndices).toBeNull();
  });

  it('keeps a full review when every lesson has problems', () => {
    const scan = getCourseMapExamineScan({
      courseMap: {
        lessons: [
          { title: 'Lesson 1: A', sections: [{ topicSection: '', learningObjectives: '' }] },
          { title: 'Lesson 2: B', sections: [{ topicSection: '', learningObjectives: '' }] },
        ],
      },
      columns,
    });
    expect(scan.triggers.length).toBeGreaterThan(0);
    expect(scan.focusLessonIndices).toBeNull();
  });
});
