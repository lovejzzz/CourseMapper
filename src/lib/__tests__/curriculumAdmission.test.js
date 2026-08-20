import { describe, expect, it } from 'vitest';

import {
  buildCourseBlueprint,
  compileBlueprintDeliverables,
  extractWorkedExamplePairs,
  operationQualifiedWorkedExampleForLesson,
  reconcileCourseMapWithBlueprintSemanticAdmission,
} from '../courseBlueprintCompiler.js';
import { isAppliedQuizStem } from '../quality/quizItemDepth.js';

function exactSamplingLedger() {
  const facts = [
    'A simple random sample gives each possible sample of a fixed size an equal chance of selection.',
    'Cluster sampling selects groups before observing units within the selected groups.',
    'Sampling bias occurs when the selection process systematically favors some outcomes over others.',
  ];
  return {
    keyTerms: [
      { term: 'Simple random sample', definition: facts[0], example: facts[0] },
      { term: 'Cluster sampling', definition: facts[1], example: facts[1] },
      { term: 'Sampling bias', definition: facts[2], example: facts[2] },
    ],
    kernel: {
      facts,
      provenance: {
        source: 'compiler-owned-exact-source-ledger',
        authority: 'shipped-source-library',
        copiedFactsVerbatim: true,
        factCount: facts.length,
      },
    },
    conceptProvenance: {
      source: 'genome-linked',
      authority: 'shipped-source-library',
      fullyAnchored: true,
    },
    enrichmentSource: 'compiler-owned-exact-source-ledger',
    sourceFactAuthority: 'shipped-source-library',
  };
}

describe('compiled-operation curriculum admission', () => {
  it('removes a stale framed concept before it can introduce an out-of-scope operation', () => {
    const blueprint = buildCourseBlueprint(
      {
        courseName: 'Introductory Statistics',
        lessons: [
          {
            title: 'Lesson 1: Producing Data: Sampling',
            sections: [
              {
                topicSection: 'Principles of Sampling Techniques',
                learningObjectives:
                  'Explain sampling plans using the available course evidence. Apply p-value in one practical example from Producing Data: Sampling and justify one revision.',
                syncActivities:
                  'Audit one practical example from Producing Data: Sampling, then revise one decision using evidence about p-value.',
              },
            ],
          },
        ],
      },
      { enrichment: { lessonContent: { 'lesson-1': exactSamplingLedger() } } },
    );

    const lesson = blueprint.lessons[0];
    expect(lesson.outcomes.join(' ')).not.toMatch(/p[- ]?value/i);
    expect(String(lesson.activityPattern || '')).not.toMatch(/p[- ]?value/i);
    expect(lesson.compilerSemanticAdmission).toMatchObject({
      source: 'cross-lesson-semantic-admission-v1',
      rejectedTerms: expect.arrayContaining(['p value']),
      rebuiltDerivedLessonFields: true,
    });
    expect(operationQualifiedWorkedExampleForLesson(lesson)).toMatchObject({
      protocol: 'coursemapper-operation-qualified-evidence-v1',
      operation: 'construct-and-audit-probability-sample',
      authority: 'compiler-verified-calculation',
      verification: { checked: true },
      curriculumAdmission: {
        status: 'admitted',
        operation: 'construct-and-audit-probability-sample',
      },
    });
    const compiled = compileBlueprintDeliverables(blueprint, ['lessonPlans', 'assignments', 'quizBank', 'slideDecks']);
    const learnerFacing = JSON.stringify({
      questions: compiled.quizBank.quizzes[0].questions.map((question) => ({
        objectiveAligned: question.objectiveAligned,
        question: question.question,
        options: question.options,
        answer: question.answer,
        sampleAnswer: question.sampleAnswer,
        explanation: question.explanation,
        scoringGuidance: question.scoringGuidance,
      })),
      assignmentInstructions: compiled.assignments.assignments[0].instructions,
      slides: compiled.slideDecks.decks[0].slides.map((slide) => ({
        title: slide.title,
        bullets: slide.bullets,
        activity: slide.activity,
      })),
      lessonOutline: compiled.lessonPlans.lessonPlans[0].outline,
    });
    expect(learnerFacing).not.toMatch(/one-proportion|p-value|hypothesis test/i);
    expect(learnerFacing).toMatch(/sampling frame|probability sample/i);

    const reconciledMap = reconcileCourseMapWithBlueprintSemanticAdmission(
      {
        courseName: 'Introductory Statistics',
        lessons: [
          {
            title: 'Lesson 1: Producing Data: Sampling',
            sections: [
              {
                topicSection: 'Principles of Sampling Techniques',
                learningGoals: 'Use sampling and p-value evidence.',
                learningObjectives: 'Apply p-value in a sampling example.',
                syncActivities: 'Interpret a p-value.',
                supportingResources: '1. Sampling guide\n2. 9.3',
              },
            ],
          },
        ],
      },
      blueprint,
    );
    const reconciledText = JSON.stringify(reconciledMap.lessons);
    expect(reconciledText).not.toMatch(/p[- ]?value/i);
    expect(reconciledMap.lessons[0].sections[0].learningObjectives.split('\n')).toEqual(
      blueprint.instructionalIntentGraph.lessonIntents[0].targetObjectives,
    );
    expect(reconciledMap).toMatchObject({
      compilerSemanticAdmissionReceipt: {
        protocol: 'coursemapper-course-map-semantic-admission-v1',
        repairedLessonCount: 1,
      },
    });
  });

  it('discovers a legitimate quantitative operation from the objective, not only the title or key terms', () => {
    const example = operationQualifiedWorkedExampleForLesson({
      lessonNumber: 4,
      title: 'Lesson 4: Decision Review',
      outcomes: ['Calculate and interpret a p-value for the supplied one-proportion test.'],
      keyConcepts: ['Evidence-based decision'],
      sourceEvidenceTrace: {
        sourceFields: [
          {
            field: 'learning objectives',
            rawText: 'Calculate and interpret a p-value for the supplied one-proportion test.',
          },
        ],
      },
    });

    expect(example).toMatchObject({
      operation: 'calculate-and-interpret-one-proportion-test',
      curriculumAdmission: {
        status: 'admitted',
        demandSource: 'objective',
        demandSurface: expect.stringMatching(/p-value/i),
      },
    });
  });

  it('builds exact correlation and two-way-table specimens and does not invent assigned-source recovery', () => {
    const blueprint = buildCourseBlueprint({
      courseName: 'Quantitative Reasoning',
      lessons: [
        {
          title: 'Lesson 1: Scatterplots and Correlation',
          sections: [
            {
              topicSection: 'Scatterplots and correlation',
              learningObjectives: 'Calculate and interpret correlation for a supplied dataset.',
            },
          ],
        },
        {
          title: 'Lesson 2: Two-Way Tables',
          sections: [
            {
              topicSection: 'Two-way tables and conditional proportions',
              learningObjectives: 'Calculate and interpret conditional proportions in a two-way table.',
            },
          ],
        },
      ],
    });
    blueprint.enrichment = {
      ...(blueprint.enrichment || {}),
      coverage: { missingLessons: [1, 2] },
    };

    expect(operationQualifiedWorkedExampleForLesson(blueprint.lessons[0])).toMatchObject({
      operation: 'calculate-and-interpret-correlation',
      result: 'Pearson correlation r = 0.50.',
      verification: { checked: true },
    });
    expect(operationQualifiedWorkedExampleForLesson(blueprint.lessons[1])).toMatchObject({
      operation: 'calculate-and-interpret-two-way-table',
      result: expect.stringMatching(/0\.60.*0\.40.*0\.20/),
      verification: { checked: true },
    });

    const compiled = compileBlueprintDeliverables(blueprint, [
      'lessonPlans',
      'assignments',
      'quizBank',
      'slideDecks',
      'studyGuides',
    ]);
    const learnerFacing = JSON.stringify(compiled);
    expect(learnerFacing).not.toMatch(/assigned source/i);
    expect(learnerFacing).toMatch(/Pearson correlation r = 0\.50/);
    expect(learnerFacing).toMatch(/20 percentage points/);
  });

  it('keeps a generated secondary regression term from replacing a scatterplot lesson operation', () => {
    const lesson = {
      lessonNumber: 4,
      title: 'Lesson 4: Scatterplots and Correlation',
      objectives: [
        'Test Modern regression analysis in an observable Scatterplots and Correlation case and defend one evidence-based change.',
      ],
      keyConcepts: ['Scatterplots', 'Correlation'],
      enrichment: { keyTerms: [{ term: 'Modern regression analysis' }] },
    };

    expect(operationQualifiedWorkedExampleForLesson(lesson)).toMatchObject({
      operation: 'calculate-and-interpret-correlation',
      result: 'Pearson correlation r = 0.50.',
    });
  });

  it('does not reinterpret linear-algebra least squares as statistical regression', () => {
    const lesson = {
      lessonNumber: 13,
      title: 'Lesson 13: Orthogonal Projections',
      outcomes: ['Use projection onto subspaces to solve and explain a linear-algebra problem.'],
      keyConcepts: ['Orthogonal projections'],
      sections: [
        { topicSection: 'Projection onto Subspaces' },
        { topicSection: 'Least Squares Approximation' },
        { topicSection: 'Least Squares Error Analysis' },
      ],
    };

    const example = operationQualifiedWorkedExampleForLesson(lesson);
    expect(example).toMatchObject({
      problem: expect.stringMatching(/project v/i),
      result: expect.stringMatching(/projection/i),
    });
    expect(JSON.stringify(example)).not.toMatch(/regression|slope|intercept|residual/i);
  });

  it('turns a verified authentic-language binding into applied quiz items and a study worked example', () => {
    const blueprint = buildCourseBlueprint({
      courseName: 'Language Evidence',
      lessons: [
        {
          title: 'Lesson 1: Phonological Contrast',
          sections: [
            {
              topicSection: 'Minimal pairs',
              learningObjectives: 'Identify a phonological contrast in a supplied language record.',
              weeklyAssessments: 'Phonological evidence note',
            },
          ],
        },
      ],
    });
    blueprint.lessons[0].authenticDataTaskPlan = {
      protocol: 'coursemapper-authentic-evidence-task-binding-v1',
      operation: 'identification',
      evidenceItemIds: ['record-1'],
      evidenceLabels: ['English minimal-pair record'],
      payloadSha256: 'sha256:test-record-1',
      objective: 'Identify the contrast in the bound English record.',
      prompt: 'English minimal-pair record: “pin · bin” | gloss: word-initial consonant contrast.',
      answerKey: 'The record contrasts /p/ and /b/ in the same word frame.',
      assessmentCriteria: ['Names both forms', 'Identifies the contrast', 'States the record boundary'],
      examples: [
        {
          id: 'record-1',
          displayLabel: 'English minimal-pair record',
          form: 'pin · bin',
          gloss: 'word-initial consonant contrast',
          translation: 'two distinct English words',
          analysisFocus: 'The shared frame isolates /p/ versus /b/.',
          sourceLocator: 'Instructor record 1',
          communityContext: 'This record establishes a contrast in this frame only.',
        },
      ],
      truthProof: {
        promptDisplaysBoundPayload: true,
        answerKeyOperatesOnBoundPayload: true,
        rubricScoresDeclaredOperation: true,
      },
    };

    const compiled = compileBlueprintDeliverables(blueprint, ['quizBank', 'lessonPlans', 'studyGuides', 'slideDecks']);
    const multipleChoice = compiled.quizBank.quizzes[0].questions.filter(
      (question) => question.type === 'multiple_choice',
    );
    expect(
      multipleChoice.filter((question) => isAppliedQuizStem(question.question)).length / multipleChoice.length,
    ).toBeGreaterThanOrEqual(0.35);
    expect(compiled.studyGuides.studyGuides[0].workedExample).toMatchObject({
      protocol: 'coursemapper-authentic-evidence-study-practice-v1',
      verification: { checked: true, evidenceItemIds: ['record-1'] },
      result: expect.stringMatching(/contrasts \/p\/ and \/b\//),
      boundary: expect.stringMatching(/this frame only/i),
    });
    expect(compiled.lessonPlans.lessonPlans[0].workedExample).toMatchObject({
      protocol: 'coursemapper-authentic-evidence-study-practice-v1',
      verification: { checked: true, evidenceItemIds: ['record-1'] },
      result: expect.stringMatching(/contrasts \/p\/ and \/b\//),
    });
    expect(compiled.slideDecks.decks[0].slides).toContainEqual(
      expect.objectContaining({
        workedExample: expect.objectContaining({
          protocol: 'coursemapper-authentic-evidence-study-practice-v1',
          result: expect.stringMatching(/contrasts \/p\/ and \/b\//),
        }),
      }),
    );
    const authenticSlide = compiled.slideDecks.decks[0].slides.find(
      (slide) => slide.workedExample?.protocol === 'coursemapper-authentic-evidence-study-practice-v1',
    );
    expect(authenticSlide).toMatchObject({
      title: 'Worked example: Phonological Contrast',
      enrichmentSource: 'authentic-evidence-worked-example',
    });
    expect(authenticSlide.bullets).toHaveLength(4);
    expect(authenticSlide.bullets.join(' ')).toMatch(/pin · bin.*Instructor record 1/i);
    expect(Math.max(...authenticSlide.bullets.map((bullet) => bullet.length))).toBeLessThanOrEqual(230);
    const renderedQuiz = JSON.stringify(compiled.quizBank);
    expect(renderedQuiz).not.toContain('..');
    expect(renderedQuiz).toContain('This record establishes a contrast in this frame only.');
  });

  it('joins multiple punctuated authentic records without a double-period seam', () => {
    const blueprint = buildCourseBlueprint({
      courseName: 'Syntax Evidence',
      lessons: [
        {
          title: 'Lesson 1: Verb placement',
          sections: [
            {
              topicSection: 'Head movement',
              learningObjectives: 'Compare verb placement in two supplied language records.',
              weeklyAssessments: 'Syntax evidence note',
            },
          ],
        },
      ],
    });
    // A non-first lesson catches accidental lesson-number rotation across
    // prompt/sample/scoring rows.
    blueprint.lessons[0].lessonNumber = 4;
    blueprint.lessons[0].title = 'Lesson 4: Verb placement';
    blueprint.lessons[0].authenticDataTaskPlan = {
      protocol: 'coursemapper-authentic-evidence-task-binding-v1',
      operation: 'mechanism-explanation',
      objective: 'Compare the two bound records.',
      answerKey: 'English follows the adverb; French precedes it in this bounded contrast.',
      assessmentCriteria: ['Names both records', 'Explains the contrast', 'States the boundary'],
      examples: [
        {
          id: 'english-record',
          displayLabel: 'English record',
          form: 'Mary often speaks French.',
          gloss: 'Mary often speak.3SG French',
          translation: 'Mary often speaks French.',
          analysisFocus: 'The finite verb follows the adverb.',
          sourceLocator: 'record 1',
          communityContext: 'This contrast does not establish every English word order.',
        },
        {
          id: 'french-record',
          displayLabel: 'French record',
          form: 'Marie parle souvent français.',
          gloss: 'Marie speak.3SG often French',
          translation: 'Marie often speaks French.',
          analysisFocus: 'The finite verb precedes the adverb.',
          sourceLocator: 'record 2',
          communityContext: 'This contrast does not establish every French word order.',
        },
      ],
      truthProof: {
        promptDisplaysBoundPayload: true,
        answerKeyOperatesOnBoundPayload: true,
        rubricScoresDeclaredOperation: true,
      },
    };

    const compiled = compileBlueprintDeliverables(blueprint, ['quizBank']);
    const renderedQuiz = JSON.stringify(compiled.quizBank);
    expect(renderedQuiz).toContain('Mary often speaks French. French record');
    expect(renderedQuiz).not.toContain('French.. French record');
    const revisionItem = compiled.quizBank.quizzes[0].questions.find((question) =>
      /^Revise an overgeneralized/i.test(question.question),
    );
    expect(revisionItem).toMatchObject({
      sampleAnswer: expect.stringMatching(/complete mechanism-explanation.*additional evidence needed/i),
      scoringGuidance: expect.stringMatching(/use the payload accurately; stop at its boundary/i),
    });
  });

  it('derives native chart pairs from the compiler distribution specimen', () => {
    const example = operationQualifiedWorkedExampleForLesson({
      lessonNumber: 2,
      title: 'Lesson 2: Describing Distributions with Numbers',
      outcomes: ['Calculate and interpret the center and spread of a supplied distribution.'],
      keyConcepts: ['Descriptive statistics'],
    });
    expect(extractWorkedExamplePairs(example)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Mean', value: 7.75 }),
        expect.objectContaining({ label: 'Median', value: 7 }),
        expect.objectContaining({ label: 'IQR', value: 2.5 }),
      ]),
    );
  });

  it('keeps statistical artifact and discussion protocols scoped to the demanded operation', () => {
    const blueprint = buildCourseBlueprint({
      courseName: 'Introductory Statistics',
      lessons: [
        {
          title: 'Lesson 1: Regression Analysis',
          sections: [
            {
              topicSection: 'Simple linear regression',
              learningObjectives: 'Fit and interpret a simple linear regression for supplied paired data.',
              weeklyAssessments: 'Regression analysis memo',
            },
          ],
        },
        {
          title: 'Lesson 2: Confidence Intervals',
          sections: [
            {
              topicSection: 'Confidence intervals and margin of error',
              learningObjectives: 'Calculate and interpret a confidence interval for a supplied sample.',
              weeklyAssessments: 'Confidence interval interpretation',
            },
          ],
        },
      ],
    });
    const compiled = compileBlueprintDeliverables(blueprint, ['assignments', 'discussions']);
    const learnerFacing = JSON.stringify({
      assignmentInstructions: compiled.assignments.assignments.map((assignment) => assignment.instructions),
      assignmentFormat: compiled.assignments.assignments.map((assignment) => assignment.formatRequirements),
      discussions: compiled.discussions.discussions.map((discussion) => ({
        format: discussion.format,
        discussionProtocol: discussion.discussionProtocol,
        guidelines: discussion.guidelines,
      })),
    });

    expect(learnerFacing).toMatch(/slope-and-intercept|confidence interval/i);
    expect(learnerFacing).not.toMatch(/p[- ]?value|hypothesis[- ]test|test statistic/i);
  });
});
