import { describe, expect, it } from 'vitest';

import {
  buildCourseBlueprint,
  compileBlueprintDeliverables,
  operationQualifiedWorkedExampleForLesson,
} from '../src/lib/courseBlueprintCompiler.js';
import { buildSemanticClaimInventory } from '../src/lib/semanticClaimInventory.js';
import { buildOperationQualifiedEvidenceReceipt } from '../src/lib/packageZipExporter.js';

const STATISTICS_COURSE = {
  courseName: 'Introductory Statistics',
  lessons: [
    {
      title: 'Lesson 1: Confidence Intervals',
      sections: [
        {
          topicSection: '1.1 Confidence intervals for a proportion',
          learningObjectives: 'Calculate and interpret a confidence interval from sample data.',
          weeklyAssessments: 'Confidence interval problem set.',
          asyncActivities: 'Review the assigned source on interval estimates.',
          syncActivities: 'Work a numerical interval example and compare interpretations.',
        },
      ],
    },
  ],
};

describe('operation-qualified evidence', () => {
  it('binds a statistics Apply/Calculate lesson to inputs, steps, output, interpretation, and boundary', () => {
    const blueprint = buildCourseBlueprint(STATISTICS_COURSE);
    const example = operationQualifiedWorkedExampleForLesson(blueprint.lessons[0]);

    expect(example).toMatchObject({
      protocol: 'coursemapper-operation-qualified-evidence-v1',
      authority: 'compiler-verified-calculation',
      operation: 'calculate-and-interpret-confidence-interval',
      verification: { checked: true, method: 'deterministic-arithmetic-fixture' },
      curriculumAdmission: {
        protocol: 'coursemapper-compiled-operation-curriculum-admission-v1',
        status: 'admitted',
        governingSourceLocator: '1.1 Confidence intervals for a proportion',
      },
    });
    expect(example.inputs).toEqual(expect.arrayContaining(['n = 100', 'yes = 58']));
    expect(example.steps).toHaveLength(4);
    expect(example.result).toContain('[0.484, 0.676]');
    expect(example.studentTask).toMatch(/calculate and interpret confidence interval/i);
    expect(example.studentTask).toMatch(/^Required operation:/i);
    expect(example.interpretation).toMatch(/repeated-sampling procedure/i);
    expect(example.boundary).toMatch(/synthetic classroom example/i);
    expect(example.transferTask).toMatch(/64 of 100/i);
  });

  it('projects the same executable specimen into plans, study support, assignments, and slides', () => {
    const blueprint = buildCourseBlueprint(STATISTICS_COURSE);
    const compiled = compileBlueprintDeliverables(blueprint, [
      'lessonPlans',
      'studyGuides',
      'assignments',
      'slideDecks',
    ]);
    const plan = compiled.lessonPlans.lessonPlans[0];
    const guide = compiled.studyGuides.studyGuides[0];
    const assignment = compiled.assignments.assignments[0];
    const slides = compiled.slideDecks.decks[0].slides;

    for (const projected of [plan.workedExample, guide.workedExample, assignment.workedExample]) {
      expect(projected?.protocol).toBe('coursemapper-operation-qualified-evidence-v1');
      expect(projected?.result).toContain('[0.484, 0.676]');
    }
    expect(assignment.instructions.join(' ')).toMatch(/64 of 100/i);
    expect(assignment.formatRequirements.length).toMatch(/replayable calculation record/i);
    expect(assignment.formatRequirements.length).toMatch(/150–250-word interpretation/i);
    expect(assignment.formatRequirements.length).not.toMatch(/750–1,250 words/i);
    for (const projected of [plan.workedExample, guide.workedExample, assignment.workedExample]) {
      expect(projected.studentTask).toMatch(/calculate and interpret confidence interval/i);
    }
    expect(slides.some((slide) => /worked example/i.test(slide.title) && /0\.484/.test(slide.bullets.join(' ')))).toBe(
      true,
    );
    expect(slides.find((slide) => slide.workedExample)?.bullets.join(' ')).toMatch(
      /Task: Required operation: Calculate and interpret confidence interval/i,
    );
    expect(slides.find((slide) => slide.workedExample)?.workedExample?.protocol).toBe(
      'coursemapper-operation-qualified-evidence-v1',
    );
  });

  it('joins a shared specimen across all four projections without losing lesson identity', () => {
    const blueprint = buildCourseBlueprint(STATISTICS_COURSE);
    const specimen = operationQualifiedWorkedExampleForLesson(blueprint.lessons[0]);
    const parent = (featureId) =>
      featureId === 'slideDecks'
        ? {
            data: { decks: [{ lessonTitle: 'Lesson 1: Confidence Intervals', slides: [{ workedExample: specimen }] }] },
          }
        : { data: { rows: [{ lessonTitle: 'Lesson 1: Confidence Intervals', workedExample: specimen }] } };
    const receipt = buildOperationQualifiedEvidenceReceipt({
      lessons: blueprint.lessons,
      deliverables: Object.fromEntries(
        ['assignments', 'lessonPlans', 'slideDecks', 'studyGuides'].map((featureId) => [featureId, parent(featureId)]),
      ),
    });

    expect(receipt.summary.status).toBe('passed');
    expect(receipt.missingLessonNumbers).toEqual([]);
    expect(receipt.items).toEqual([
      expect.objectContaining({
        lessonNumber: 1,
        complete: true,
        hasExplicitStudentDemand: true,
        studentTask: expect.stringMatching(/calculate and interpret confidence interval/i),
        projections: ['assignments', 'lessonPlans', 'slideDecks', 'studyGuides'],
      }),
    ]);
  });

  it('gives a normal-distribution demand an executable standardization trace', () => {
    const blueprint = buildCourseBlueprint({
      courseName: 'Introductory Statistics',
      lessons: [
        {
          title: 'Lesson 3: The Normal Distribution',
          sections: [
            {
              learningObjectives: 'Apply the normal distribution to a numerical observation and interpret the result.',
            },
          ],
        },
      ],
    });
    const example = operationQualifiedWorkedExampleForLesson(blueprint.lessons[0]);
    expect(example).toMatchObject({
      protocol: 'coursemapper-operation-qualified-evidence-v1',
      operation: 'standardize-and-interpret-normal-observation',
      result: 'The observation has z = 1.5.',
    });
  });

  it('gives a distribution-visualization demand an executable histogram trace', () => {
    const blueprint = buildCourseBlueprint({
      courseName: 'Introductory Statistics',
      lessons: [
        {
          title: 'Lesson 1: Picturing Distributions',
          sections: [
            {
              learningObjectives: 'Apply a histogram to visualize a distribution and interpret the result.',
            },
          ],
        },
      ],
    });
    const example = operationQualifiedWorkedExampleForLesson(blueprint.lessons[0]);
    expect(example).toMatchObject({
      protocol: 'coursemapper-operation-qualified-evidence-v1',
      operation: 'construct-and-interpret-histogram',
      result: 'Histogram bin counts are [3, 4, 1].',
    });
    expect(example.steps).toHaveLength(4);
    expect(example.boundary).toMatch(/bin edges/i);
  });

  it('gives a descriptive-distribution demand a resistant-summary trace', () => {
    const blueprint = buildCourseBlueprint({
      courseName: 'Introductory Statistics',
      lessons: [
        {
          title: 'Lesson 2: Describing Distributions with Numbers',
          sections: [{ learningObjectives: 'Summarize center and spread and interpret an unusual value.' }],
        },
      ],
    });
    const example = operationQualifiedWorkedExampleForLesson(blueprint.lessons[0]);
    expect(example).toMatchObject({
      operation: 'summarize-and-interpret-distribution',
      result: 'Mean = 3.75, median = 3, IQR = 2, and 11 is flagged by the 1.5 x IQR rule.',
    });
    expect(example.interpretation).toMatch(/mean above the median/i);
    expect(example.boundary).toMatch(/median-of-halves quartile convention/i);
    expect(example.boundary).toMatch(/different supported software convention/i);
  });

  it('does not turn a linguistic distribution boundary into a statistics operation', () => {
    const lesson = {
      lessonNumber: 11,
      title: 'Lesson 11: Advanced Phonology',
      keyConcepts: ['Advanced Phonology', 'Prosody and Suprasegmentals'],
      studentArtifact: 'Comparison brief: Advanced Phonology',
      outcomes: [
        'Source-bound identification: Thai tone example.',
        'Explain Prosody and Suprasegmentals using the available course evidence.',
      ],
      activityPattern:
        'Thai tone example: pitch pattern distinguishes meaning on the cited syllable. Pronunciation, distribution, and social use require qualified local instruction.',
    };

    expect(operationQualifiedWorkedExampleForLesson(lesson)).toBeNull();
  });

  it('assesses the actual descriptive operation, result, interpretation, and boundary', () => {
    const blueprint = buildCourseBlueprint({
      courseName: 'Introductory Statistics',
      lessons: [
        {
          title: 'Lesson 2: Describing Distributions with Numbers',
          sections: [{ learningObjectives: 'Summarize center and spread and interpret an unusual value.' }],
        },
      ],
    });
    const quizBank = compileBlueprintDeliverables(blueprint, ['quizBank']).quizBank;
    const item = quizBank.quizzes[0].questions.find(
      (question) => question.quizPlan?.role === 'operation-qualified-application',
    );

    expect(item).toMatchObject({
      type: 'short_answer',
      bloomsLevel: 'Apply',
      enrichmentSource: 'compiler-verified-operation-assessment',
      operationQualifiedEvidence: {
        protocol: 'coursemapper-operation-qualified-evidence-v1',
        operation: 'summarize-and-interpret-distribution',
        verification: { checked: true },
      },
    });
    expect(item.question).toMatch(/intermediate calculation|procedural trace/i);
    expect(item.question).toMatch(/interpret what it means/i);
    expect(item.question).toMatch(/boundary/i);
    expect(item.sampleAnswer).toMatch(/Mean = 3\.75, median = 3, IQR = 2/i);
    expect(item.sampleAnswer).toMatch(/mean above the median/i);
    expect(item.sampleAnswer).toMatch(/quartile convention/i);
  });

  it('rotates repeated distribution operations without changing the course-agnostic calculation contract', () => {
    const blueprint = buildCourseBlueprint({
      courseName: 'Any quantitative course',
      lessons: [1, 2].map((lessonNumber) => ({
        title: `Lesson ${lessonNumber}: Distribution summary`,
        sections: [{ learningObjectives: 'Summarize center and spread and interpret an unusual value.' }],
      })),
    });
    const examples = blueprint.lessons.map(operationQualifiedWorkedExampleForLesson);

    expect(examples[0].operation).toBe('summarize-and-interpret-distribution');
    expect(examples[1].operation).toBe('summarize-and-interpret-distribution');
    expect(examples[0].inputs).not.toEqual(examples[1].inputs);
    expect(examples.every((example) => example.verification.checked)).toBe(true);
    expect(examples.every((example) => /applies it consistently/i.test(example.boundary))).toBe(true);
  });

  it('keeps the more specific action-bearing operation when an earlier Explain objective names its display', () => {
    const blueprint = buildCourseBlueprint({
      courseName: 'Introductory Statistics',
      lessons: [
        {
          title: 'Lesson 1: Picturing Distributions',
          sections: [
            {
              topicSection: 'Introduction to Data Visualization',
              learningObjectives: [
                'Explain Histogram using the available course evidence.',
                'Apply Picturing Distributions in one practical example from Picturing Distributions and justify one revision.',
              ].join('\n'),
            },
          ],
        },
      ],
    });

    expect(operationQualifiedWorkedExampleForLesson(blueprint.lessons[0])).toMatchObject({
      operation: 'summarize-and-interpret-distribution',
      verification: { checked: true },
    });
  });

  it('rejoins a compiler-admitted specific operation when the compact manifest lesson is lossy', () => {
    const blueprint = buildCourseBlueprint({
      courseName: 'Introductory Statistics',
      lessons: [
        {
          title: 'Lesson 1: Visualizing Data',
          sections: [
            {
              topicSection: 'Histogram Construction',
              learningObjectives: [
                'Explain Histogram using the available course evidence.',
                'Apply distributions in one practical example from Visualizing Data and justify one revision.',
              ].join('\n'),
            },
          ],
        },
      ],
    });
    const compiled = compileBlueprintDeliverables(blueprint, [
      'lessonPlans',
      'studyGuides',
      'assignments',
      'slideDecks',
    ]);
    const receipt = buildOperationQualifiedEvidenceReceipt({
      deliverables: Object.fromEntries(
        Object.entries(compiled).map(([featureId, data]) => [featureId, { status: 'done', data }]),
      ),
      lessons: [
        {
          lessonNumber: 1,
          title: 'Lesson 1: Visualizing Data',
          objectives: [
            'Explain Histogram using the available course evidence.',
            'Apply distributions in one practical example from Visualizing Data and justify one revision.',
          ],
        },
      ],
    });

    expect(receipt.summary).toMatchObject({ demandedLessonCount: 1, completeLessonCount: 1, status: 'passed' });
    expect(receipt.demandedOperations).toContainEqual(
      expect.objectContaining({ lessonNumber: 1, operation: 'construct-and-interpret-histogram' }),
    );
    expect(receipt.items).toContainEqual(
      expect.objectContaining({ lessonNumber: 1, operation: 'construct-and-interpret-histogram', complete: true }),
    );
  });

  it('does not let a generic Apply template replace a sampling lesson with inferential testing', () => {
    const blueprint = buildCourseBlueprint({
      courseName: 'Introductory Statistics',
      lessons: [
        {
          title: 'Lesson 7: Producing Data: Sampling',
          sections: [
            {
              topicSection: 'Principles of Sampling Techniques',
              learningObjectives:
                'Apply p-value in one practical example from Producing Data: Sampling and justify one revision.',
            },
          ],
        },
      ],
    });

    const example = operationQualifiedWorkedExampleForLesson(blueprint.lessons[0]);
    expect(example).toMatchObject({
      operation: 'construct-and-audit-probability-sample',
      verification: { checked: true },
      curriculumAdmission: { status: 'admitted' },
    });
    expect(JSON.stringify(example)).not.toMatch(/one-proportion|hypothesis test/i);
  });

  it('does not inject inferential testing into an introductory sampling lesson', () => {
    const blueprint = buildCourseBlueprint({
      courseName: 'Introductory Statistics',
      lessons: [
        {
          title: 'Lesson 7: Producing Data: Sampling',
          sections: [
            {
              topicSection: 'Principles of Sampling Techniques',
              learningObjectives: 'Explain sampling plans and compare sources of sampling bias.',
            },
          ],
        },
      ],
    });
    expect(operationQualifiedWorkedExampleForLesson(blueprint.lessons[0])).toMatchObject({
      operation: 'construct-and-audit-probability-sample',
      verification: { checked: true },
    });
    const compiled = compileBlueprintDeliverables(blueprint, ['lessonPlans', 'assignments', 'slideDecks']);
    expect(JSON.stringify(compiled)).not.toMatch(/one-proportion|p-value|hypothesis test/i);
  });

  it.each([
    ['Hypothesis Tests and P-values', 'Run a hypothesis test and interpret its p-value and effect size.'],
    ['Two-Sample Comparisons', 'Compare two groups with a two-sample test and confidence interval.'],
    ['Chi-Square Tests and Association', 'Interpret a chi-square test using expected counts and a p-value.'],
  ])('fails closed instead of substituting a one-proportion specimen for %s', (title, objective) => {
    const blueprint = buildCourseBlueprint({
      courseName: 'Statistical Inference',
      lessons: [
        {
          title: `Lesson 1: ${title}`,
          sections: [{ topicSection: title, learningObjectives: objective }],
        },
      ],
    });

    expect(operationQualifiedWorkedExampleForLesson(blueprint.lessons[0])).toBeNull();
    expect(JSON.stringify(blueprint.lessons[0])).not.toMatch(/one-proportion hypothesis-test trace/i);
  });

  it('turns an experiments lesson into a replayable design and a fully keyed design audit', () => {
    const blueprint = buildCourseBlueprint({
      courseName: 'Introductory Statistics',
      lessons: [
        {
          title: 'Lesson 8: Producing Data: Experiments',
          sections: [
            {
              topicSection: 'Randomized experiments, controls, and validity',
              learningObjectives:
                'Design and audit a randomized experiment by identifying experimental units, treatments, response measurement, controls, and limits.',
              weeklyAssessments: 'Experimental design audit.',
            },
          ],
        },
      ],
    });
    const example = operationQualifiedWorkedExampleForLesson(blueprint.lessons[0]);
    expect(example).toMatchObject({
      operation: 'design-and-audit-randomized-experiment',
      verification: { checked: true },
      curriculumAdmission: { status: 'admitted' },
    });
    expect(example.inputs.join(' ')).toMatch(/experimental units.*treatments.*response/i);
    expect(example.steps.join(' ')).toMatch(/assign.*first 12.*hold.*constant/i);
    expect(example.boundary).toMatch(/causal comparison.*does not.*probability sample/i);

    const compiled = compileBlueprintDeliverables(blueprint, ['assignments', 'quizBank']);
    const assignment = compiled.assignments.assignments[0];
    const questions = compiled.quizBank.quizzes[0].questions;
    expect(assignment.formatRequirements.length).toMatch(/3–5 labeled sections/i);
    expect(questions).toHaveLength(8);
    expect(questions.every((question) => question.answer)).toBe(true);
    expect(questions.map((question) => question.quizPlan.role)).toEqual([
      'identify-experimental-units',
      'identify-treatment-and-response',
      'replay-random-assignment',
      'explain-control',
      'audit-response-measurement',
      'bound-causal-claim',
      'diagnose-validity-threat',
      'revise-with-blocking',
    ]);
    expect(JSON.stringify(questions)).toMatch(/differential attrition.*block on initial seedling height/i);
  });

  it('records compiler-verified arithmetic without misrepresenting it as source-entailment', async () => {
    const blueprint = buildCourseBlueprint(STATISTICS_COURSE);
    const workedExample = operationQualifiedWorkedExampleForLesson(blueprint.lessons[0]);
    const renderedText = [
      workedExample.problem,
      ...workedExample.steps,
      workedExample.result,
      workedExample.interpretation,
      workedExample.boundary,
    ].join(' ');
    const inventory = await buildSemanticClaimInventory({
      courseGraph: {
        enrichmentOverlay: { lessonContent: { 'lesson-1': { sourceFactAuthority: 'model-provisional' } } },
      },
      deliverables: {
        lessonPlans: { data: { lessonPlans: [{ lessonNumber: 1, workedExample }] } },
      },
      renderedArtifacts: [{ path: 'Lesson Plans/Lesson 01 - Confidence Intervals.docx', text: renderedText }],
    });

    const arithmeticClaims = inventory.items.filter((item) => item.origin === 'compiler-verified-calculation');
    expect(arithmeticClaims.length).toBeGreaterThanOrEqual(7);
    expect(arithmeticClaims.every((item) => item.status === 'verified')).toBe(true);
    expect(arithmeticClaims.every((item) => item.requiresSourcePassage === false)).toBe(true);
    expect(arithmeticClaims.every((item) => item.authority === 'compiler-verified-calculation')).toBe(true);
  });
});
