import { describe, expect, it } from 'vitest';

import { buildCourseBlueprint, compileBlueprintDeliverables } from '../courseBlueprintCompiler.js';
import { lintItemAdmission } from '../itemAdmissionLint.js';
import { isAppliedQuizStem } from '../quality/quizItemDepth.js';

const COURSE_MAP = {
  courseName: 'Research Methods',
  lessons: [
    {
      title: 'Lesson 1: Evidence Triangulation',
      sections: [
        {
          topicSection: 'Evidence triangulation, interview data, observation notes, and claim boundaries',
          learningObjectives: 'Explain evidence triangulation; evaluate a claim against multiple sources',
          weeklyAssessments: 'Evidence memo',
          syncActivities: 'Compare interview transcripts with field observations',
          supportingResources: 'Interview transcript packet; observation notes',
        },
      ],
    },
  ],
};

function mc(index, question) {
  return {
    index,
    type: 'multiple_choice',
    question,
    options: [
      'Compare the two records before deciding what the evidence supports.',
      'Treat the first record as sufficient proof of the general claim.',
      'Summarize both records without explaining how they affect the claim.',
      'Ignore the conflicting detail because it complicates the conclusion.',
    ],
    answerIndex: 0,
    explanation: 'Comparing independent records shows where the claim converges and where its boundary remains.',
  };
}

describe('applied multiple-choice admission', () => {
  it('keeps one diagnostic recall item but blocks recall stems from higher-order slots', () => {
    const recallDiagnostic = 'Which statement best defines evidence triangulation in qualitative research?';
    const recallAnalysis = 'Which statement best defines a boundary on a research claim?';
    const appliedAnalysis =
      'A researcher examines two interview transcripts and one observation record that disagree. Which conclusion is most defensible before revising the claim?';
    const recallEvaluation = 'Which statement best describes strong evidence in a research report?';
    expect(isAppliedQuizStem(appliedAnalysis)).toBe(true);
    expect(isAppliedQuizStem(recallAnalysis)).toBe(false);
    expect(lintItemAdmission(mc(2, appliedAnalysis))).toEqual([]);

    const enrichment = {
      source: 'test-kernel',
      coverage: { requestedLessons: 1, admittedLessons: 1 },
      lessonContent: {
        'lesson-1': {
          quizItems: [
            mc(0, recallDiagnostic),
            mc(1, recallAnalysis),
            mc(2, appliedAnalysis),
            mc(4, recallEvaluation),
          ],
        },
      },
    };
    const blueprint = buildCourseBlueprint(COURSE_MAP, { enrichment });
    const compiled = compileBlueprintDeliverables(blueprint, ['quizBank'], { skipLanguageFinalizer: true });
    const questions = compiled.quizBank.quizzes[0].questions;
    const authoredQuestions = questions.filter((question) => question.enrichmentSource === 'lesson-content-enrichment');

    expect(authoredQuestions.map((question) => question.question)).toEqual([recallDiagnostic, appliedAnalysis]);
    expect(questions.some((question) => question.question === recallAnalysis)).toBe(false);
    expect(questions.some((question) => question.question === recallEvaluation)).toBe(false);
  });
});
