import { describe, expect, it } from 'vitest';

import {
  buildCourseBlueprint,
  buildQuizAtomsForLesson,
  compileBlueprintDeliverable,
} from '../courseBlueprintCompiler.js';
import { lintItemAdmission } from '../itemAdmissionLint.js';
import {
  isAppliedQuizStem,
  isClaimEvidenceBoundaryShortAnswer,
  isConceptCuedCompilerShortAnswer,
} from '../quality/quizItemDepth.js';

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

  it('does not invent worked examples when the instructor supplied only exact fact statements', () => {
    const blueprint = evidenceCourseBlueprint();
    blueprint.instructorSourceFactsByLesson = {
      [blueprint.lessons[0].id]: [
        'A usability test observes representative users attempting realistic tasks with a product or service.',
        'A test script gives each session a repeatable structure without turning the moderator into a teacher.',
        'Recruitment identifies appropriate users and obtains consent before the session.',
      ],
    };
    blueprint.enrichment = {
      coverage: { missingLessons: [1], requestedLessons: 1 },
      stageDecisions: { modelStage: 'failed: assessment atoms quarantined' },
    };
    const items = buildQuizAtomsForLesson(blueprint.lessons[0], blueprint, { assessment: {} });

    expect(items.some((item) => /instructor-provided fact list/i.test(item.question))).toBe(true);
    expect(items.every((item) => !/worked example|worked solution|source example/i.test(item.question))).toBe(true);
    expect(items.some((item) => /supplied wording does not establish/i.test(item.question))).toBe(true);
  });

  it('fills empty assessment seats from admitted facts and misconceptions before source-review recovery', () => {
    const blueprint = evidenceCourseBlueprint();
    blueprint.lessons[0].enrichment = {
      keyTerms: [
        {
          term: 'Evidence triangulation',
          definition: 'Evidence triangulation combines independent observations before choosing a revision.',
          misconception: 'One striking observation proves the interface fails for every user.',
          correction: 'One observation motivates a follow-up; repeated independent evidence supports a bounded claim.',
        },
        {
          term: 'Task failure pattern',
          definition: 'A task failure pattern is a repeated observable breakdown under the same interface condition.',
          misconception: 'Any pause establishes that the interface caused confusion.',
          correction: 'A pause needs corroborating behavior or participant explanation before supporting a cause.',
        },
      ],
      kernel: {
        facts: [
          'Repeated task failures under the same interface condition support a bounded usability claim.',
          'A single observation can motivate a follow-up but does not establish a universal conclusion.',
          'Independent observations strengthen a revision decision when they point to the same breakdown.',
        ],
      },
      quizItems: [
        {
          index: 3,
          type: 'short_answer',
          question: 'Which course method should shape the revision, and what evidence limits the claim?',
          answer: 'Select the method independently, cite the repeated breakdown, and limit the conclusion.',
        },
        {
          index: 5,
          type: 'essay',
          question: 'Evaluate the revision using two observations and one explicit limitation.',
          answer: 'A strong response compares the observations and keeps the recommendation bounded.',
        },
      ],
    };
    blueprint.enrichment = {
      coverage: { requestedLessons: 1, enrichedLessons: 1, missingLessons: [] },
      stageDecisions: { modelStage: 'ran' },
    };

    const items = buildQuizAtomsForLesson(blueprint.lessons[0], blueprint, { assessment: {} });
    const compilerItems = items.filter((item) => item.enrichmentSource === 'admitted-kernel-assessment');
    const multipleChoice = items.filter((item) => item.type === 'multiple_choice');

    expect(items).toHaveLength(6);
    expect(compilerItems).toHaveLength(4);
    expect(items.every((item) => item.enrichmentSource !== 'source-bound-recovery')).toBe(true);
    expect(items.every((item) => item.sourceReviewRequired !== true)).toBe(true);
    expect(multipleChoice).toHaveLength(4);
    expect(multipleChoice.filter((item) => isAppliedQuizStem(item.question))).toHaveLength(2);
    expect(
      multipleChoice.flatMap((item) =>
        lintItemAdmission({
          question: item.question,
          options: item.options.map((option) => option.replace(/^[A-D]\.\s*/, '')),
          answerIndex: 'ABCD'.indexOf(item.answer),
          explanation: item.explanation,
        }),
      ),
    ).toEqual([]);
    expect(JSON.stringify(compilerItems)).toMatch(/Repeated task failures|One observation motivates a follow-up/i);
    expect(JSON.stringify(compilerItems)).not.toMatch(/source use without fabricating|kernel failed admission/i);
  });

  it('never mislabels an admitted Nutrition kernel as missing when one MC filler is rejected', () => {
    const blueprint = buildCourseBlueprint({
      courseName: 'Human Nutrition',
      lessons: [
        {
          title: 'Lesson 1: six classes of nutrients and the difference between macronutrients and micronutrients',
          sections: [
            {
              topicSection: 'Nutrient classes',
              learningObjectives:
                'Explain the six nutrient classes and distinguish macronutrients from micronutrients.',
            },
          ],
        },
      ],
    });
    blueprint.lessons[0].enrichment = {
      keyTerms: [
        {
          term: 'The six classes of nutrients',
          definition:
            'There are six classes of nutrients required for the body to function: carbohydrates, lipids, proteins, water, vitamins, and minerals.',
          misconception: 'Students believe vitamins and minerals give the body energy.',
          correction:
            'Only carbohydrates, lipids, and proteins yield kilocalories; vitamins and minerals contribute no energy themselves.',
          source: 'UH OER human nutrition 2e',
          tier: 2,
        },
        {
          term: 'water',
          definition:
            'Nutrients are substances required by the body to perform its basic functions, and they must be obtained from the diet because the body does not synthesize them.',
          misconception: 'A common error is choosing fiber without checking the details named in the question.',
          correction:
            'The admitted explanation supports water after the named details are checked against every option.',
          source: 'verified-quiz-projection',
          derivedFromQuizIndex: 0,
        },
        {
          term: 'lipids',
          definition:
            'Lipids are the most energy-dense class at nine kilocalories per gram — more than double carbohydrates.',
          misconception: 'A common error is choosing carbohydrates without checking the details named in the question.',
          correction:
            'The admitted explanation supports lipids after the named details are checked against every option.',
          source: 'verified-quiz-projection',
          derivedFromQuizIndex: 1,
        },
      ],
      kernel: {
        facts: [
          'Nutrients are substances required by the body to perform its basic functions, and they must be obtained from the diet because the body does not synthesize them.',
          'Nutrients needed in large amounts are macronutrients; micronutrients are required in lesser amounts but remain essential.',
          'Digestible carbohydrates and proteins each yield four kilocalories of energy per gram.',
          'Lipids are the most energy-dense class at nine kilocalories per gram — more than double carbohydrates.',
          "A kilocalorie is synonymous with the capital-C 'Calorie' printed on nutrition food labels.",
        ],
      },
      quizItems: [
        {
          index: 0,
          type: 'multiple_choice',
          question: 'Which of these is itself one of the six classes of nutrients?',
          options: ['water', 'fiber', 'cholesterol', 'caffeine'],
          answerIndex: 0,
          explanation: 'Water is one of the six nutrient classes.',
        },
        {
          index: 1,
          type: 'multiple_choice',
          question: 'Which nutrient class supplies the most kilocalories per gram?',
          options: ['lipids', 'carbohydrates', 'proteins', 'vitamins'],
          answerIndex: 0,
          explanation: 'Lipids supply nine kilocalories per gram.',
        },
      ],
    };
    blueprint.enrichment = {
      coverage: { requestedLessons: 1, enrichedLessons: 1, missingLessons: [] },
      stageDecisions: { modelStage: 'ran' },
    };

    const items = buildQuizAtomsForLesson(blueprint.lessons[0], blueprint, { assessment: {} });

    expect(items).toHaveLength(6);
    expect(items.every((item) => item.enrichmentSource !== 'source-bound-recovery')).toBe(true);
    expect(items.every((item) => item.sourceReviewRequired !== true)).toBe(true);
    expect(items.some((item) => item.enrichmentSource === 'admitted-kernel-assessment')).toBe(true);
    expect(items[2]).toMatchObject({
      type: 'short_answer',
      enrichmentSource: 'admitted-kernel-assessment',
    });
    expect(items[2].bloomsLevel).toBe('Analyze');
    expect(items[2].question).toMatch(/Analyze this course statement/);
    expect(items[2].question).toMatch(/relates to The six classes of nutrients/);
    expect(items[2].question).not.toMatch(/relates to water/);
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

    expect(defensiveShortAnswer.question).toMatch(/compare Realism and Liberalism as contrasting explanatory lenses/i);
    expect(defensiveShortAnswer.answer).toMatch(/defines both concepts accurately/i);
    expect(defensiveShortAnswer.answer).not.toMatch(/Liberalism:\s*The anarchic structure/i);
  });
});
