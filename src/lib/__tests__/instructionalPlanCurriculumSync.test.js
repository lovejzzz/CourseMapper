import { describe, expect, it } from 'vitest';

import {
  instructionalPlanCurriculumMatches,
  synchronizeCourseMapWithInstructionalPlan,
} from '../instructionalPlanCurriculumSync.js';

function courseMap(sectionCount = 3) {
  return {
    courseName: 'Evidence Studio',
    lessons: [
      {
        id: 'lesson-1',
        lessonNumber: 1,
        title: 'Lesson 1: Evidence Studio',
        sections: Array.from({ length: sectionCount }, (_, index) => ({
          topicSection: `1.${index + 1}: Section ${index + 1}`,
          learningObjectives: `Legacy objective ${index + 1}`,
        })),
      },
    ],
  };
}

function plan(objectives) {
  return {
    lessonIntents: [
      {
        id: 'lesson-1',
        lessonNumber: 1,
        targetObjectives: objectives,
      },
    ],
  };
}

describe('instructional plan curriculum synchronization', () => {
  it('converges when a lesson has more objectives than sections', () => {
    const objectives = ['Objective A', 'Objective B', 'Objective C', 'Objective D'];
    const first = synchronizeCourseMapWithInstructionalPlan(courseMap(3), plan(objectives));
    const second = synchronizeCourseMapWithInstructionalPlan(first, plan(objectives));

    expect(first.lessons[0].sections.map((section) => section.learningObjectives)).toEqual([
      'Objective A',
      'Objective B',
      'Objective C\nObjective D',
    ]);
    expect(second).toEqual(first);
    expect(instructionalPlanCurriculumMatches(first, plan(objectives))).toBe(true);
  });

  it('remains stable when sections outnumber distinct objectives', () => {
    const objectives = ['Objective A', 'Objective B'];
    const first = synchronizeCourseMapWithInstructionalPlan(courseMap(3), plan(objectives));

    expect(first.lessons[0].sections.map((section) => section.learningObjectives)).toEqual([
      'Objective A',
      'Objective A',
      'Objective B',
    ]);
    expect(synchronizeCourseMapWithInstructionalPlan(first, plan(objectives))).toEqual(first);
  });
});
