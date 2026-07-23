import { describe, expect, it } from 'vitest';

import {
  buildCourseBlueprint,
  buildQuizAtomsForLesson,
  compileBlueprintDeliverable,
} from '../courseBlueprintCompiler.js';
import { lintItemAdmission } from '../itemAdmissionLint.js';
import { projectKernelToSurfaces } from '../kernelProjection.js';
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
    expect(compilerItems).toHaveLength(6);
    expect(items.every((item) => item.enrichmentSource !== 'source-bound-recovery')).toBe(true);
    expect(items.every((item) => item.sourceReviewRequired !== true)).toBe(true);
    expect(multipleChoice).toHaveLength(4);
    expect(multipleChoice.filter((item) => isAppliedQuizStem(item.question))).toHaveLength(3);
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

  it('replaces a repeated single-misconception item with a distinct evidence-bound task', () => {
    const blueprint = evidenceCourseBlueprint();
    blueprint.lessons[0].enrichment = {
      keyTerms: [
        {
          term: 'Evidence triangulation',
          definition: 'Evidence triangulation combines independent observations before choosing a revision.',
          misconception: 'One striking observation proves the interface fails for every user.',
          correction: 'One observation motivates a follow-up; repeated independent evidence supports a bounded claim.',
          source: 'fact-ledger-projection',
        },
      ],
      kernel: {
        facts: [
          'Repeated task failures under the same interface condition support a bounded usability claim.',
          'A single observation can motivate a follow-up but does not establish a universal conclusion.',
          'Independent observations strengthen a revision decision when they point to the same breakdown.',
        ],
      },
      quizItems: [],
    };
    blueprint.enrichment = {
      coverage: { requestedLessons: 1, enrichedLessons: 1, missingLessons: [] },
      stageDecisions: { modelStage: 'ran' },
    };

    const items = buildQuizAtomsForLesson(blueprint.lessons[0], blueprint, { assessment: {} });
    const normalizedStems = items.map((item) =>
      item.question
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim(),
    );

    expect(items).toHaveLength(6);
    expect(new Set(normalizedStems).size).toBe(items.length);
    expect(items[4]).toMatchObject({
      type: 'short_answer',
      enrichmentSource: 'admitted-kernel-assessment',
    });
    expect(items[4].question).toMatch(/strongest conclusion.*another course fact/i);
    expect(isClaimEvidenceBoundaryShortAnswer(items[4].question)).toBe(true);
    expect(items[4].scoringGuidance).toMatch(/specific additional fact/i);
  });

  it('keeps the distinct evidence-bound task inside the current lesson', () => {
    const blueprint = evidenceCourseBlueprint();
    blueprint.lessons[0].enrichment = {
      keyTerms: [
        {
          term: 'Usability evidence',
          definition: 'Usability evidence records inspectable behavior during a representative task.',
          misconception: 'One striking observation proves the interface fails for every user.',
          correction: 'One observation motivates a follow-up; repeated evidence supports a bounded claim.',
          source: 'fact-ledger-projection',
        },
      ],
      kernel: {
        facts: [
          'Usability evidence records inspectable behavior during a representative task.',
          'Repeated usability breakdowns under the same condition strengthen a bounded revision claim.',
          'Mendelian ratios describe segregation in a single-gene cross.',
          'A DNA double helix contains deoxyribose sugars and nitrogenous bases.',
          'Genome editing uses molecular tools to alter genetic material.',
        ],
      },
      quizItems: [],
    };
    blueprint.enrichment = {
      coverage: { requestedLessons: 1, enrichedLessons: 1, missingLessons: [] },
      stageDecisions: { modelStage: 'ran' },
    };

    const items = buildQuizAtomsForLesson(blueprint.lessons[0], blueprint, { assessment: {} });
    expect(items[4].question).toMatch(/usability/i);
    expect(items[4].question).not.toMatch(/Mendelian|DNA double helix|Genome editing/i);
  });

  it('preserves the admitted two-claim synthesis through the downstream quiz overlay', () => {
    const blueprint = evidenceCourseBlueprint();
    const facts = [
      'Evidence triangulation combines independent observations before choosing a revision.',
      'A task failure pattern is a repeated observable breakdown under the same interface condition.',
      'A single observation can motivate a follow-up but does not establish a universal conclusion.',
    ];
    blueprint.lessons[0].enrichment = projectKernelToSurfaces(
      {
        facts,
        keyTerms: [
          {
            term: 'Evidence triangulation',
            definition: facts[0],
            example: `Compare the supplied claims: ${facts[0]} ${facts[1]}`,
            misconception: 'The first supplied claim alone settles every question about Evidence triangulation.',
            correction: 'Use all supplied claims to state a bounded conclusion.',
            source: 'fact-ledger-projection',
          },
        ],
        scenario: null,
        discussionPrompt: null,
        mc: [],
      },
      {
        itemPlan: [
          { index: 3, type: 'short_answer', bloom: 'Analyze' },
          { index: 5, type: 'essay', bloom: 'Create' },
        ],
      },
    );
    blueprint.lessons[0].enrichment.keyTerms[0].source = 'fact-ledger-projection';
    blueprint.enrichment = {
      coverage: { requestedLessons: 1, enrichedLessons: 1, missingLessons: [] },
      stageDecisions: { modelStage: 'ran' },
    };

    const items = buildQuizAtomsForLesson(blueprint.lessons[0], blueprint, { assessment: {} });
    const shortAnswer = items.find(
      (item) => item.type === 'short_answer' && item.enrichmentSource === 'lesson-content-enrichment',
    );

    expect(shortAnswer?.question).toContain(`Claim A: ${facts[0]}`);
    expect(shortAnswer?.question).toContain(`Claim B: ${facts[1]}`);
    expect(shortAnswer?.question).toMatch(/Identify the course concept that best organizes these claims/);
    expect(shortAnswer?.question).not.toMatch(/In 3-4 sentences, use one course detail/);
    expect(shortAnswer?.sampleAnswer).toContain(facts[0]);
    expect(shortAnswer?.sampleAnswer).toContain(facts[1]);
    expect(isClaimEvidenceBoundaryShortAnswer(shortAnswer?.question)).toBe(true);
  });

  it('preserves a fact-ledger item that quotes the primary definition when the natural label has an extra modifier', () => {
    const blueprint = evidenceCourseBlueprint();
    blueprint.courseName = 'Introduction to Philosophy';
    blueprint.lessons[0].title = 'Lesson 1: What philosophy is';
    blueprint.lessons[0].semanticIdentityTerms = [
      'What philosophy is',
      'Defining Philosophy',
      'Explain what philosophy studies and how arguments are read.',
    ];
    blueprint.lessons[0].keyConcepts = ['Defining Philosophy'];
    const definition =
      'Philosophy is the systematic and critical study of questions about existence, knowledge, and value.';
    blueprint.lessons[0].enrichment = projectKernelToSurfaces(
      {
        facts: [
          definition,
          'Reading arguments requires distinguishing deductive from inductive reasoning.',
          'Knowledge theory examines what counts as justified belief.',
        ],
        keyTerms: [
          {
            term: 'Defining Philosophy',
            definition,
            example: 'Compare the supplied claims about philosophy and argument reading.',
            misconception: 'The first claim settles every question about philosophy.',
            correction: 'Use both claims and limit the conclusion.',
            source: 'fact-ledger-projection',
          },
        ],
        scenario: null,
        discussionPrompt: null,
        mc: [],
      },
      {
        itemPlan: [
          { index: 3, type: 'short_answer', bloom: 'Analyze' },
          { index: 5, type: 'essay', bloom: 'Create' },
        ],
      },
    );
    blueprint.lessons[0].enrichment.keyTerms[0].source = 'fact-ledger-projection';
    blueprint.enrichment = {
      coverage: { requestedLessons: 1, enrichedLessons: 1, missingLessons: [] },
      stageDecisions: { modelStage: 'ran' },
    };

    const shortAnswer = buildQuizAtomsForLesson(blueprint.lessons[0], blueprint, { assessment: {} }).find(
      (item) => item.type === 'short_answer' && item.enrichmentSource === 'lesson-content-enrichment',
    );
    expect(shortAnswer?.question).toContain(definition);
    expect(shortAnswer?.question).not.toMatch(/In 3-4 sentences, use one course detail/);
  });

  it('rejects a deep but unrelated genome response and projects the lesson-specific fact core instead', () => {
    const blueprint = buildCourseBlueprint({
      courseName: 'World Literature',
      lessons: [
        {
          title: 'Lesson 1: Oral Epic Tradition',
          sections: [
            {
              topicSection: 'Oral Epic Forms',
              learningObjectives: 'Analyze how oral performance shapes epic form and transmission.',
            },
          ],
        },
      ],
    });
    blueprint.lessons[0].enrichment = {
      keyTerms: [
        {
          term: 'Close reading',
          definition: 'Close reading tests an interpretation against precise textual details.',
          source: 'literary close reading §1',
          tier: 2,
        },
        {
          term: 'Oral Epic Forms',
          definition: 'Oral epic forms use recurring formulas and performance patterns to support transmission.',
          source: 'fact-ledger-projection',
          tier: 1,
        },
      ],
      kernel: {
        facts: [
          'Recurring formulas help performers compose and remember long oral epic narratives.',
          'Performance context can change the wording while preserving recognizable narrative patterns.',
        ],
      },
      quizItems: [
        {
          index: 3,
          type: 'short_answer',
          question:
            'A homeowner notices two locked doors. Name the most defensible Close Reading lens, point to two case details, and state one boundary or next piece of evidence.',
          answer: 'The two locked doors support a bounded close-reading claim, but their cause requires more evidence.',
        },
      ],
    };
    blueprint.enrichment = {
      coverage: { requestedLessons: 1, enrichedLessons: 1, missingLessons: [] },
      stageDecisions: { modelStage: 'ran' },
    };

    const items = buildQuizAtomsForLesson(blueprint.lessons[0], blueprint, { assessment: {} });
    const constructed = items.find((item) => item.type === 'short_answer');

    expect(constructed.question).toMatch(/Oral Epic/i);
    expect(JSON.stringify(constructed)).toMatch(/Oral Epic Forms/i);
    expect(constructed.question).not.toMatch(/homeowner|locked doors|Close Reading/i);
    expect(isClaimEvidenceBoundaryShortAnswer(constructed.question)).toBe(true);
  });

  it('does not let a reusable close-reading scenario replace a Frame Narratives assessment', () => {
    const blueprint = buildCourseBlueprint({
      courseName: 'World Literature',
      lessons: [
        {
          title: 'Lesson 6: Frame Narratives',
          sections: [
            {
              topicSection: 'Narrative Framing',
              learningObjectives: 'Analyze how a frame narrative structures perspective and embedded stories.',
            },
          ],
        },
      ],
    });
    blueprint.lessons[0].enrichment = {
      keyTerms: [
        {
          term: 'Close reading',
          definition: 'Close reading tests an interpretation against precise textual details.',
          source: 'literary close reading §1',
          tier: 2,
        },
        {
          term: 'Narrative Framing',
          definition: 'Narrative framing structures a story through an encompassing narrative and embedded stories.',
          source: 'fact-ledger-projection',
          tier: 1,
        },
      ],
      kernel: {
        facts: [
          'Frame narratives embed one or more stories inside an encompassing narrative situation.',
          'The relation between the frame and embedded story can shape perspective and interpretation.',
        ],
      },
      quizItems: [
        {
          index: 3,
          type: 'short_answer',
          question:
            "A reviewer examines a repeated image of locked doors that tracks a heroine's loss of freedom. Name the most defensible Close Reading lens, point to two case details, and state one boundary or next piece of evidence.",
          answer: 'Close reading connects the image to the whole work while bounding the interpretation.',
        },
      ],
    };
    blueprint.enrichment = {
      coverage: { requestedLessons: 1, enrichedLessons: 1, missingLessons: [] },
      stageDecisions: { modelStage: 'ran' },
    };

    const items = buildQuizAtomsForLesson(blueprint.lessons[0], blueprint, { assessment: {} });
    const constructed = items.find((item) => item.type === 'short_answer');
    expect(constructed.question).not.toMatch(/locked doors|heroine|Close Reading/i);
    expect(JSON.stringify(constructed)).toMatch(/Narrative Framing|Frame Narratives/i);
  });

  it('treats an admitted fact ledger as knowledge even when no glossary term survives projection', () => {
    const blueprint = evidenceCourseBlueprint();
    blueprint.lessons[0].enrichment = {
      keyTerms: [],
      kernel: {
        facts: [
          'Repeated task failures under the same interface condition support a bounded usability claim.',
          'A single observation can motivate a follow-up but does not establish a universal conclusion.',
          'Independent observations strengthen a revision decision when they point to the same breakdown.',
        ],
      },
      quizItems: [],
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
    expect(JSON.stringify(items)).toMatch(/Repeated task failures|single observation/i);
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
          misconception: 'Choosing fiber conflicts with the evidence for water in this item.',
          correction: 'Check the water evidence against fiber before selecting an answer.',
          source: 'verified-quiz-projection',
          derivedFromQuizIndex: 0,
        },
        {
          term: 'lipids',
          definition:
            'Lipids are the most energy-dense class at nine kilocalories per gram — more than double carbohydrates.',
          misconception: 'Choosing carbohydrates conflicts with the evidence for lipids in this item.',
          correction: 'Check the lipids evidence against carbohydrates before selecting an answer.',
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
    expect(items[2].question).toMatch(/identify the course concept/i);
    expect(items[2].question).toMatch(/cite one detail from the evidence/i);
    expect(items[2].question).toMatch(/one limitation/i);
    expect(items[2].question).not.toMatch(/relates to water/);
    expect(isConceptCuedCompilerShortAnswer(items[2].question)).toBe(false);
    expect(isClaimEvidenceBoundaryShortAnswer(items[2].question)).toBe(true);
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
    expect(shortAnswer.question).toMatch(/identify the two course concepts/i);
    expect(shortAnswer.question).toMatch(/one course detail for each concept from Usability Evidence/i);
    expect(isConceptCuedCompilerShortAnswer(shortAnswer.question)).toBe(false);
    expect(isClaimEvidenceBoundaryShortAnswer(shortAnswer.question)).toBe(true);
    expect(shortAnswer.sampleAnswer).toMatch(/Repeated task failures support a bounded usability claim/i);
    expect(shortAnswer.sampleAnswer).toMatch(/distinguishes what each concept explains/i);
    expect(essay.question).not.toMatch(/\bdecision decisions\b/i);
    expect(essay.question).not.toMatch(/(.+?) through \1/i);
    expect(essay.rubricHints).toMatch(/two concepts from the covered lesson/i);
    expect(essay.rubricHints).not.toMatch(/different covered lessons/i);

    const essayVariants = Array.from({ length: 6 }, (_, index) => {
      const lessonNumber = index + 1;
      const variantBlueprint = structuredClone(blueprint);
      variantBlueprint.lessons[0].lessonNumber = lessonNumber;
      variantBlueprint.lessons[0].title = `Lesson ${lessonNumber}: Usability Evidence`;
      variantBlueprint.assessments[0].lessonNumbers = [lessonNumber];
      const variantExam = compileBlueprintDeliverable('quizBank', variantBlueprint, {
        skipPrepareBlueprint: true,
        skipCompilerContractCheck: true,
        skipLanguageFinalizer: true,
      }).quizzes.find((quiz) => quiz.kind === 'exam');
      return variantExam.questions.find((item) => item.type === 'essay');
    });
    expect(new Set(essayVariants.map((item) => item.question)).size).toBe(6);
    expect(new Set(essayVariants.map((item) => item.sampleAnswer)).size).toBe(6);
    expect(essayVariants.map((item) => item.rubricHints).join(' ')).not.toMatch(/two lesson concepts/i);
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

    expect(shortAnswer.question).toMatch(/one course detail for each concept from Realism and Liberalism/i);
    expect(shortAnswer.question).toMatch(/identify the two course concepts/i);
    expect(shortAnswer.question).not.toMatch(/Realism and Liberalism in Realism and Liberalism/i);
    expect(shortAnswer.question).not.toMatch(/Anarchic structure/i);
    expect(isConceptCuedCompilerShortAnswer(shortAnswer.question)).toBe(false);
    expect(isClaimEvidenceBoundaryShortAnswer(shortAnswer.question)).toBe(true);
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

    expect(defensiveShortAnswer.question).toMatch(/identify the two course concepts/i);
    expect(defensiveShortAnswer.answer).toMatch(/independently identifies both concepts/i);
    expect(defensiveShortAnswer.answer).not.toMatch(/Liberalism:\s*The anarchic structure/i);
  });
});
