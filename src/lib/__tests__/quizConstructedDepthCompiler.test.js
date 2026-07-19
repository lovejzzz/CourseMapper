import { describe, expect, it } from 'vitest';

import {
  buildCourseBlueprint,
  buildQuizAtomsForLesson,
  compileBlueprintDeliverable,
} from '../courseBlueprintCompiler.js';
import { isClaimEvidenceBoundaryShortAnswer, isConceptCuedCompilerShortAnswer } from '../quality/quizItemDepth.js';

function evidenceCourseBlueprint() {
  return buildCourseBlueprint({
    courseName: 'Evidence-led Design Studio',
    lessons: [
      {
        title: 'Lesson 1: Usability Evidence',
        sections: [
          {
            topicSection: 'Interpreting task evidence',
            learningGoals: 'Use usability evidence to choose a defensible interface revision.',
            learningObjectives: 'Evaluate an observed usability issue and justify a revision.',
            weeklyAssessments: 'Decision memo with evidence, a bounded claim, and a next research need.',
            asyncActivities: 'Inspect a task transcript and annotate one breakdown.',
            syncActivities: 'Compare two revisions against the transcript evidence.',
            supportingResources: 'Usability session transcript and observation log.',
          },
        ],
      },
    ],
  });
}

describe('constructed-response compiler depth', () => {
  it('requires independent concept selection, evidence, and a claim boundary in the normal frame', () => {
    const blueprint = evidenceCourseBlueprint();
    const item = buildQuizAtomsForLesson(blueprint.lessons[0], blueprint, {
      assessment: {},
    }).find((candidate) => candidate.type === 'short_answer');

    expect(item).toBeDefined();
    expect(isConceptCuedCompilerShortAnswer(item.question)).toBe(false);
    expect(isClaimEvidenceBoundaryShortAnswer(item.question)).toBe(true);
    expect(item.sampleAnswer).toMatch(/exact source detail/i);
    expect(item.sampleAnswer).toMatch(/does not establish a broader conclusion/i);
    expect(item.scoringGuidance).toMatch(/limitation|cannot establish|next source|bounded claim/i);
  });

  it('keeps source-bound recovery cue-free and evidence-bounded when model knowledge is missing', () => {
    const blueprint = evidenceCourseBlueprint();
    blueprint.lessons[0].enrichment = {
      keyTerms: [
        {
          term: 'Evidence triangulation',
          definition: 'combines independent observations before choosing a revision',
        },
        {
          term: 'Task failure pattern',
          definition: 'a repeated observable breakdown tied to the same interface condition',
        },
      ],
    };
    blueprint.enrichment = {
      coverage: { missingLessons: [1] },
      stageDecisions: { modelStage: 'failed: missing lesson kernel' },
    };
    const items = buildQuizAtomsForLesson(blueprint.lessons[0], blueprint, {
      assessment: {},
    }).filter((candidate) => candidate.type === 'short_answer');

    expect(items).toHaveLength(5);
    expect(items.map((item) => item.bloomsLevel)).toEqual(['Apply', 'Analyze', 'Analyze', 'Analyze', 'Evaluate']);
    expect(items.every((item) => item.quizPlan?.bloom === item.bloomsLevel)).toBe(true);
    expect(items.every((item) => item.sourceReviewRequired === true)).toBe(true);
    expect(items.every((item) => !isConceptCuedCompilerShortAnswer(item.question))).toBe(true);
    expect(items.every((item) => !/one named example from/i.test(item.question))).toBe(true);
    expect(items.some((item) => /Evaluate an observed usability issue/i.test(item.question))).toBe(true);
    expect(items.some((item) => /assigned source/i.test(item.question))).toBe(true);
    expect(items.some((item) => /evidence triangulation/i.test(item.question))).toBe(true);
    expect(
      items.every((item) => !/using usability evidence|demonstrates usability evidence/i.test(item.question)),
    ).toBe(true);
    expect(items.filter((item) => isClaimEvidenceBoundaryShortAnswer(item.question)).length).toBeGreaterThanOrEqual(
      Math.ceil(items.length / 2),
    );
  });

  it('uses two distinct admitted concepts for a one-lesson exam and removes doubled decision language', () => {
    const blueprint = evidenceCourseBlueprint();
    blueprint.lessons[0].enrichment = {
      keyTerms: [
        {
          term: 'Evidence triangulation',
          definition: 'combines independent observations before choosing a revision',
        },
        {
          term: 'Task failure pattern',
          definition: 'a repeated observable breakdown tied to the same interface condition',
        },
      ],
      kernel: {
        facts: ['Repeated task failures support a bounded usability claim, not a universal conclusion.'],
      },
    };
    blueprint.assessments = [
      {
        id: 'assessment-exam-1',
        registryId: 'assessment-exam-1',
        title: 'Exam: Usability evidence',
        artifact: 'Exam: Usability evidence',
        kind: 'exam',
        lessonNumbers: [1],
      },
    ];
    const compiled = compileBlueprintDeliverable('quizBank', blueprint, {
      skipPrepareBlueprint: true,
      skipCompilerContractCheck: true,
      skipLanguageFinalizer: true,
    });
    const exam = compiled.quizzes.find((quiz) => quiz.kind === 'exam');
    const shortAnswer = exam.questions.find((item) => item.type === 'short_answer');
    const essay = exam.questions.find((item) => item.type === 'essay');

    expect(exam.examScope).toBe('Covers Lesson 1: Usability Evidence.');
    expect(shortAnswer.question).toMatch(/compare Evidence triangulation and Task failure pattern/i);
    expect(shortAnswer.question).not.toMatch(/compare (.+?)\b with \1\b/i);
    expect(essay.question).not.toMatch(/\bdecision decisions\b/i);
    expect(essay.question).not.toMatch(/(.+?) through \1/i);
    expect(essay.rubricHints).toMatch(/two concepts from the covered lesson/i);
    expect(essay.rubricHints).not.toMatch(/different covered lessons/i);
  });

  it('splits a composite one-lesson concept into a real comparison without title echoes', () => {
    const blueprint = buildCourseBlueprint({
      courseName: 'Introduction to International Relations',
      lessons: [
        {
          title: 'Lesson 1: Realism and Liberalism',
          sections: [
            {
              topicSection: 'Realism and Liberalism',
              learningGoals: 'Contrast major theories.',
              learningObjectives: 'Differentiate realism and liberalism. Compare realism and liberalism.',
              weeklyAssessments: 'Exam: realism and liberalism.',
              asyncActivities: 'Practice: differentiate realism and liberalism.',
              syncActivities: 'Workshop: compare realism and liberalism.',
              supportingResources: 'Introduction to International Relations source packet.',
            },
          ],
        },
      ],
    });
    blueprint.assessments = [
      {
        id: 'assessment-exam-ir',
        registryId: 'assessment-exam-ir',
        title: 'Exam: realism and liberalism',
        artifact: 'Exam: realism and liberalism',
        kind: 'exam',
        lessonNumbers: [1],
      },
    ];
    blueprint.lessons[0].enrichment = {
      keyTerms: [
        {
          term: 'Realism and Liberalism',
          definition:
            'Realism emphasizes power under anarchy, whereas liberalism explains how institutions support cooperation.',
        },
        {
          term: 'Anarchic structure',
          definition: 'Anarchic structure describes a system without a central authority above states.',
        },
      ],
    };

    const compiled = compileBlueprintDeliverable('quizBank', blueprint, {
      skipPrepareBlueprint: true,
      skipCompilerContractCheck: true,
      skipLanguageFinalizer: true,
    });
    const exam = compiled.quizzes.find((quiz) => quiz.kind === 'exam');
    const shortAnswer = exam.questions.find((item) => item.type === 'short_answer');
    const essay = exam.questions.find((item) => item.type === 'essay');

    expect(shortAnswer.question).toMatch(/compare Realism and Liberalism as contrasting explanatory lenses/i);
    expect(shortAnswer.question).not.toMatch(/Realism and Liberalism in Realism and Liberalism/i);
    expect(shortAnswer.question).not.toMatch(/Anarchic structure/i);
    expect(shortAnswer.answer).toMatch(/authored course definition/i);
    expect(essay.question).toMatch(/approach to interpretive judgment/i);
    expect(essay.question).not.toMatch(/professional decision/i);
    expect(essay.rubricHints).toMatch(/from the covered lesson/i);

    blueprint.lessons[0].enrichment.keyTerms[0].definition =
      'Realism is a theoretical approach emphasizing power and security under anarchy.';
    const defensivelyCompiled = compileBlueprintDeliverable('quizBank', blueprint, {
      skipPrepareBlueprint: true,
      skipCompilerContractCheck: true,
      skipLanguageFinalizer: true,
    });
    const defensiveShortAnswer = defensivelyCompiled.quizzes
      .find((quiz) => quiz.kind === 'exam')
      .questions.find((item) => item.type === 'short_answer');

    expect(defensiveShortAnswer.question).toMatch(
      /compare Realism and Liberalism as contrasting explanatory lenses/i,
    );
    expect(defensiveShortAnswer.answer).toMatch(/defines both concepts accurately/i);
    expect(defensiveShortAnswer.answer).not.toMatch(/Liberalism:\s*The anarchic structure/i);
  });
});
