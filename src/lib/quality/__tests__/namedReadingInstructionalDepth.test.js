import { describe, expect, it } from 'vitest';

import { checkNamedReadings } from '../namedReadingInstructionalDepth.js';

function representativeLessonFiles(lessonNumber = 4) {
  return ['lessonPlans', 'slideDecks', 'assignments', 'discussions', 'quizBank', 'studyGuides'].map(
    (featureId) => ({
      featureId,
      lessonNumber,
      path: `${featureId}/lesson-${lessonNumber}`,
      text: 'A lesson surface with no named work title.',
      paragraphs: [],
    }),
  );
}

describe('namedReadingInstructionalDepth', () => {
  it('does not treat a generic course-materials topic as a primary text', () => {
    const findings = new Set();
    checkNamedReadings(
      findings,
      {
        manifest: {
          readings: [
            {
              id: 'R4.1',
              title: 'Course materials: Numbers, Age, and Dates',
              lesson: 4,
              kind: 'other',
              provenance: 'instructor-named',
            },
          ],
        },
        files: representativeLessonFiles(),
      },
      {},
    );

    expect([...findings]).toEqual([]);
  });

  it('keeps the depth gate armed for an explicitly typed primary work', () => {
    const findings = new Set();
    checkNamedReadings(
      findings,
      {
        manifest: {
          readings: [
            {
              id: 'R4.1',
              title: 'Selected poems of Li Bai and Du Fu',
              lesson: 4,
              kind: 'poem',
              provenance: 'instructor-named',
            },
          ],
        },
        files: representativeLessonFiles(),
      },
      {},
    );

    const severe = [...findings].filter((finding) => finding.severity === 'P0');
    expect(severe).toHaveLength(2);
    expect(severe.map((finding) => finding.detail).join(' ')).toContain('instructor-named primary text');
  });
});
