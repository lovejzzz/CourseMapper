import { describe, expect, it } from 'vitest';
import { readCourseShapeLine, writeCourseShapeLine } from '../courseShape.js';
import { detectExpectedLessons } from '../detectLessons.js';
import { extractExplicitTeachingRequirements } from '../explicitTeachingRequirements.js';
import { detectRequestedClassSessionMinutes } from '../sourceBriefConstraints.js';

const brief =
  'Introductory chemistry for 10th graders: 2 lessons of 50 minutes on balancing equations. Include a quiz with 4 questions per lesson.';

describe('v0.20.07 course shape set in setup', () => {
  it('reads plural lesson durations from the brief', () => {
    expect(detectRequestedClassSessionMinutes(brief)).toBe(50);
    expect(detectRequestedClassSessionMinutes('Three sessions of 45 minutes on fractions.')).toBe(45);
  });

  it('writes one explicit line that every reader prefers over the prose', () => {
    const shaped = writeCourseShapeLine(brief, { lessons: 3, minutes: 45, quizPerLesson: 6 });
    expect(shaped.startsWith(brief)).toBe(true);
    expect(shaped).toMatch(
      /Course shape \(set in setup\): exactly 3 lessons; 45 minutes per lesson; 6 quiz questions per lesson\.$/,
    );
    expect(readCourseShapeLine(shaped)).toEqual({ lessons: 3, minutes: 45, quizPerLesson: 6 });
    expect(detectExpectedLessons(shaped)).toMatchObject({ expected: 3, confidence: 'high' });
    expect(detectRequestedClassSessionMinutes(shaped)).toBe(45);
    expect(extractExplicitTeachingRequirements(shaped).questionsPerLesson).toBe(6);
  });

  it('replaces rather than stacks the line, and removes it when cleared', () => {
    const once = writeCourseShapeLine(brief, { lessons: 3 });
    const twice = writeCourseShapeLine(once, { lessons: 4 });
    expect(twice.match(/Course shape \(set in setup\)/g)).toHaveLength(1);
    expect(detectExpectedLessons(twice).expected).toBe(4);
    expect(writeCourseShapeLine(twice, {})).toBe(brief);
  });
});
