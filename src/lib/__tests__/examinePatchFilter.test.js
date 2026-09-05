import { describe, expect, it } from 'vitest';
import { filterExaminePatches, isMetadataOnlyCourseNamePatch } from '../examinePatchFilter';

const baseMap = {
  courseName: 'Social Policy and Welfare',
  semester: 'TBD',
  lessons: [
    {
      title: 'Lesson 1',
      sections: [{ learningGoals: 'Current goals' }],
    },
  ],
};

describe('examinePatchFilter', () => {
  it('rejects course-name suggestions that append duration or audience metadata', () => {
    const patch = {
      field: 'courseName',
      value: 'Social Policy and Welfare, 14-week undergraduate course',
      reason: 'The syllabus describes the course as 14 weeks.',
    };

    expect(isMetadataOnlyCourseNamePatch(patch, baseMap)).toBe(true);
    expect(filterExaminePatches([patch], baseMap)).toEqual([]);
  });

  it('allows true official course-name corrections', () => {
    const patch = {
      field: 'courseName',
      value: 'Social Welfare Policy',
      reason: 'The syllabus header lists the official title as Social Welfare Policy.',
    };

    expect(filterExaminePatches([patch], baseMap)).toEqual([patch]);
  });

  it('keeps scoped add-lesson filtering behavior', () => {
    const inScope = { action: 'addLesson', lessonIndex: 0, lesson: { title: 'Scoped lesson' } };
    const outOfScope = { action: 'addLesson', lessonIndex: 3, lesson: { title: 'Out of scope' } };

    expect(filterExaminePatches([inScope, outOfScope], baseMap, [0])).toEqual([inScope]);
  });

  it('drops no-op field patches', () => {
    const noOp = { lessonIndex: 0, sectionIndex: 0, field: 'learningGoals', value: 'Current goals' };
    const changed = { lessonIndex: 0, sectionIndex: 0, field: 'learningGoals', value: 'Updated goals' };

    expect(filterExaminePatches([noOp, changed], baseMap)).toEqual([changed]);
  });
});
