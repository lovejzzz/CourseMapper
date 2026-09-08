import { expect, it } from 'vitest';
import { annotatePracticeCaseExposure } from '../practiceCaseExposure.js';
const lesson = (n, sources, language = 'en') => ({
  lessonNumber: n,
  teachingTask: {
    language,
    inputs: [{ text: `Taught record ${n}` }],
    sequence: [
      {
        kind: 'independent-transfer',
        sources,
        question:
          language === 'zh'
            ? '将这些要求应用到以下新案例。\n原文'
            : 'Apply the requirements to this new case.\nExact source text',
        answer: 'Retain this answer',
      },
    ],
  },
});
it('records exact previous-course exposure without modifying evidence, scoring, lesson order or source objects', () => {
  const original = [
    lesson(2, ['Second record', 'First   record']),
    lesson(1, ['First record', 'Second record']),
    lesson(3, ['A genuinely different record']),
  ];
  const snapshot = structuredClone(original);
  const result = annotatePracticeCaseExposure(original);
  expect(original).toEqual(snapshot);
  expect(result.map((l) => l.lessonNumber)).toEqual([2, 1, 3]);
  const repeated = result[0].teachingTask.sequence[0];
  expect(repeated.caseExposure).toMatchObject({ kind: 'reused-in-course', firstLessonNumber: 1 });
  expect(repeated.question).toContain('Continue with this case');
  expect(repeated.answer).toBe('Retain this answer');
  expect(repeated.sources).toEqual(original[0].teachingTask.sequence[0].sources);
  expect(result[1].teachingTask.sequence[0].caseExposure).toBeUndefined();
  expect(result[2].teachingTask.sequence[0].caseExposure).toBeUndefined();
});
it('handles Chinese repeats and a practice case already used as the current taught record', () => {
  const a = lesson(1, ['同一记录'], 'zh');
  a.teachingTask.inputs = [{ text: '同一记录' }];
  const u = annotatePracticeCaseExposure([a])[0].teachingTask.sequence[0];
  expect(u.question).toBe('继续使用以下案例，完成本课的新要求。\n原文');
  expect(u.caseExposure.firstLessonNumber).toBe(1);
});
