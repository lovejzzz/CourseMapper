import { describe, expect, it } from 'vitest';
import { assertExpectedLessonCount, buildIncompleteCourseMapErrorMessage, getLessonCount } from '../useGeneration';

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
