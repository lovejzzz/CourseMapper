import { describe, expect, it } from 'vitest';
import { checkExplicitLessonSequenceReuse } from '../lessonSequenceQualityChecks.js';

function collector() {
  const list = [];
  return { list, add: (finding) => list.push(finding) };
}

describe('explicit lesson-sequence quality checks', () => {
  it('blocks three repeated capstone sessions when the brief names an ordered topic sequence', () => {
    const findings = collector();
    const byLesson = new Map([
      [11, [{ title: 'Final project', path: 'Lesson 11.docx' }]],
      [13, [{ title: 'Final project', path: 'Lesson 13.docx' }]],
      [14, [{ title: 'Final project', path: 'Lesson 14.docx' }]],
    ]);

    checkExplicitLessonSequenceReuse(findings, byLesson, {
      prompt: 'Lessons cover: healthy eating; nutrition labels; nutrient review; and a final diet-analysis project.',
    });

    expect(findings.list).toEqual([
      expect.objectContaining({
        severity: 'P0',
        dimension: 'consistency',
        detail: 'Explicit source lesson sequence collapsed into repeated "Final project" sessions',
        evidence: expect.stringContaining('Lessons 11, 13, 14'),
      }),
    ]);
  });

  it('stays quiet without an explicit ordered lesson sequence', () => {
    const findings = collector();
    checkExplicitLessonSequenceReuse(
      findings,
      new Map([
        [1, [{ title: 'Studio', path: 'L1.docx' }]],
        [2, [{ title: 'Studio', path: 'L2.docx' }]],
        [3, [{ title: 'Studio', path: 'L3.docx' }]],
      ]),
      { prompt: 'An open studio course with recurring work sessions.' },
    );
    expect(findings.list).toEqual([]);
  });
});
