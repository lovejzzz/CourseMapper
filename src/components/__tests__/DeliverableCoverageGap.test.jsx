import { describe, expect, it } from 'vitest';

import { getCoverageGap } from '../DeliverableView';

const courseMap = {
  courseName: 'World Literature Survey',
  lessons: Array.from({ length: 8 }, (_, index) => ({
    title: `Lesson ${index + 1}: Reading ${index + 1}`,
    sections: [
      {
        weeklyAssessments: {
          2: ['Comparative Reading Responses'],
          3: ['Comparative Essay Proposal'],
          8: ['Final Comparative Paper'],
        }[index + 1] || [
          `Reading ${index + 1} comparison: connect two passages, authors, or traditions through a defensible claim.`,
        ],
      },
    ],
  })),
};

describe('assignment coverage messaging', () => {
  it('treats only scheduled graded assessment lessons as required brief coverage', () => {
    const data = {
      assignments: [
        { lessonTitle: 'Lesson 2: Reading 2', title: 'Comparative Reading Responses' },
        { lessonTitle: 'Lesson 3: Reading 3', title: 'Comparative Essay Proposal' },
        { lessonTitle: 'Lesson 8: Reading 8', title: 'Final Comparative Paper' },
      ],
    };

    expect(getCoverageGap('assignments', data, courseMap)).toBeNull();
  });

  it('still reports a genuinely missing scheduled graded brief', () => {
    const data = {
      assignments: [
        { lessonTitle: 'Lesson 2: Reading 2', title: 'Comparative Reading Responses' },
        { lessonTitle: 'Lesson 8: Reading 8', title: 'Final Comparative Paper' },
      ],
    };

    expect(getCoverageGap('assignments', data, courseMap)).toEqual({
      missing: [3],
      autoRepairable: false,
    });
  });
});
