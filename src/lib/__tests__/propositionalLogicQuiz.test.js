import { describe, it, expect } from 'vitest';
import { buildVerifiedLogicQuizAtoms, isPropositionalLogicLesson } from '../propositionalLogicQuiz.js';
import { buildCourseBlueprint, compileBlueprintDeliverables } from '../courseBlueprintCompiler.js';
const lesson = {
  id: 'lesson-1',
  lessonNumber: 1,
  title: 'Logic and Proof Systems',
  keyConcepts: ['Propositional Connectives'],
};
describe('verified propositional logic recovery', () => {
  it('checks all four assignments against independent known truth columns with unique options', () => {
    const atoms = buildVerifiedLogicQuizAtoms(lesson, [], 8);
    const expected = [
      'T, F, F, F',
      'T, T, T, F',
      'F, F, T, T',
      'T, F, T, T',
      'T, F, F, T',
      'F, T, T, T',
      'F, T, F, F',
      'F, F, F, T',
    ];
    expect(atoms).toHaveLength(8);
    atoms.forEach((q, i) => {
      expect(q.sampleAnswer).toBe(expected[i]);
      expect(q.options[q.answerIndex]).toBe(`${q.answer}. ${expected[i]}`);
      expect(new Set(q.options.map((x) => x.slice(3))).size).toBe(4);
      expect(q.explanation).toContain('P=T, Q=F');
      expect(q.sourceReviewRequired).toBe(false);
    });
  });
  it('stays within explicit two-valued logic lessons and respects the requested count', () => {
    expect(isPropositionalLogicLesson({ title: 'Set Theory', keyConcepts: ['Membership'] })).toBe(false);
    expect(isPropositionalLogicLesson({ title: 'Boolean search for librarians' })).toBe(false);
    expect(isPropositionalLogicLesson({ title: 'Quantum logic and truth tables' })).toBe(false);
    expect(buildVerifiedLogicQuizAtoms({ ...lesson, title: 'Boolean Algebra' }, [], 3)).toHaveLength(3);
  });
  it('replaces generic recovery in the actual compiler without changing unrelated lessons', () => {
    const map = {
      courseName: 'Discrete Mathematics',
      lessons: [
        {
          title: 'Logic and Proof Systems',
          sections: [
            {
              topicSection: 'Propositional Connectives',
              learningObjectives:
                'Explain the key ideas in Propositional Connectives and apply them in course activities.',
              weeklyAssessments: 'Weekly quiz',
            },
          ],
        },
        {
          title: 'Graph Theory',
          sections: [
            {
              topicSection: 'Spanning Trees',
              learningObjectives: 'Analyze spanning trees',
              weeklyAssessments: 'Weekly quiz',
            },
          ],
        },
      ],
    };
    const bp = buildCourseBlueprint(map, {
      enrichment: { coverage: { requestedLessons: 2, enrichedLessons: 0, missingLessons: [1, 2] }, lessonContent: {} },
      sourceBrief: 'Undergraduate discrete mathematics with quizzes.',
    });
    const result = compileBlueprintDeliverables(bp, ['quizBank']);
    const first = result.quizBank.quizzes[0];
    expect(first.questions).toHaveLength(8);
    expect(first.questions.every((q) => q.enrichmentSource === 'compiler-verified-logic')).toBe(true);
    expect(first.questions.every((q) => !q.sourceReviewRequired)).toBe(true);
    expect(result.quizBank.quizzes[1].questions.every((q) => q.enrichmentSource !== 'compiler-verified-logic')).toBe(
      true,
    );
    expect(first.practiceRecord.records.join(' ')).not.toContain('Record A - Objective');
  });
});
