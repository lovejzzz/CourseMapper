import { describe, expect, it } from 'vitest';
import { buildCompiledLessonPatchData } from '../../lib/compiledLessonSync';

describe('buildCompiledLessonPatchData', () => {
  const courseMap = {
    lessons: [{ title: 'Foundations' }, { title: 'Updated Research Questions' }, { title: 'Sampling' }],
  };

  it('keeps only the compiled item for the edited lesson', () => {
    const compiledData = {
      lessonPlans: [
        { lessonTitle: 'Lesson 1: Foundations' },
        { lessonTitle: 'Lesson 2: Updated Research Questions' },
        { lessonTitle: 'Lesson 3: Sampling' },
      ],
    };

    const patch = buildCompiledLessonPatchData('lessonPlans', compiledData, courseMap, 1);

    expect(patch.lessonPlans).toEqual([{ lessonTitle: 'Lesson 2: Updated Research Questions' }]);
  });

  it('falls back to array position when compiled items do not expose lesson identity', () => {
    const compiledData = {
      items: [{ title: 'First' }, { title: 'Second' }, { title: 'Third' }],
    };

    const patch = buildCompiledLessonPatchData('custom_unknown', compiledData, courseMap, 2);

    expect(patch.items).toEqual([{ title: 'Third' }]);
  });

  it('preserves full-course assessment metadata from the selected compiled item', () => {
    const compiledData = {
      assignments: [
        { lessonTitle: 'Lesson 1: Foundations', weight: '33%' },
        { lessonTitle: 'Lesson 2: Updated Research Questions', weight: '33%' },
        { lessonTitle: 'Lesson 3: Sampling', weight: '34%' },
      ],
    };

    const patch = buildCompiledLessonPatchData('assignments', compiledData, courseMap, 1);

    expect(patch.assignments).toEqual([{ lessonTitle: 'Lesson 2: Updated Research Questions', weight: '33%' }]);
  });
});
