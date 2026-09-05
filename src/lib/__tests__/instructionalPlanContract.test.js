import { describe, expect, it } from 'vitest';
import { buildCourseBlueprint, compileBlueprintDeliverables } from '../courseBlueprintCompiler.js';
import { deriveCourseGraphFromCourseMap } from '../courseGraph/deriveFromCourseMap.js';
import { assessInstructionalPlanIdentity, enforceInstructionalPlanContract } from '../instructionalPlanContract.js';
import { prepareInstructionalPlan } from '../prepareInstructionalPlan.js';
import { createScionEvidenceAuthorityContract } from '../scionEvidenceLayer.js';

function modelLesson(number, title, topic) {
  return {
    id: `model-${number}`,
    title: `Lesson ${number}: ${title}`,
    sections: [
      {
        topicSection: `${number}.1: ${topic}`,
        learningGoals: `Model-authored goal about ${topic}.`,
      },
    ],
  };
}

function genericLessons(count) {
  return Array.from({ length: count }, (_, index) =>
    modelLesson(index + 1, `Session ${index + 1} topic`, `Session ${index + 1} topic`),
  );
}

describe('instructional plan contract', () => {
  it('repairs the exact five-topic visual plan before evidence acquisition instead of preserving model compression', () => {
    const courseMap = {
      courseName: 'Visual Evidence and Image Analysis',
      lessons: [
        modelLesson(1, 'Foundational Composition Principles', 'Rule of Thirds Application'),
        modelLesson(2, 'Visual Hierarchy and Contrast', 'Color Contrast Effects'),
        modelLesson(3, 'Perspective and Framing', 'Linear Perspective Systems'),
        modelLesson(4, 'Ethical Contextual Interpretation', 'Bias in Visual Representation'),
        modelLesson(5, 'Integrated Visual Analysis', 'Cross-Modal Comparison'),
      ],
    };
    const sourceBrief =
      'Create a five-lesson introductory course. Students learn composition, visual hierarchy, color and contrast, perspective and framing, and ethical contextual interpretation. Every lesson must require students to analyze a concrete visual and produce an evidence-based annotation or comparison.';

    const result = enforceInstructionalPlanContract(courseMap, sourceBrief);

    expect(result.changed).toBe(true);
    expect(result.receipt).toMatchObject({
      status: 'plan-authorized',
      appliedBeforeEvidenceAcquisition: true,
      appliedBeforeDeliverableDrafting: true,
      lessonCount: 5,
    });
    expect(result.courseMap.lessons.map((lesson) => lesson.title)).toEqual([
      'Lesson 1: Composition',
      'Lesson 2: Visual hierarchy',
      'Lesson 3: Color and contrast',
      'Lesson 4: Perspective and framing',
      'Lesson 5: Ethical contextual interpretation',
    ]);
    expect(result.courseMap.lessons[4]).toMatchObject({
      id: 'model-5',
      sections: [
        expect.objectContaining({
          topicSection: '5.1: Ethical contextual interpretation',
          asyncActivities: expect.stringContaining('concrete visual'),
          syncActivities: expect.stringContaining('Compare two concrete visuals'),
        }),
      ],
    });
    expect(JSON.stringify(result.courseMap)).not.toMatch(/cross-modal|neuroimaging/i);
    const objectiveSets = result.courseMap.lessons.map((lesson) => lesson.sections[0].learningObjectives);
    expect(new Set(objectiveSets.map((objectives) => objectives.split(';')[0])).size).toBe(5);
    expect(objectiveSets.every((objectives) => /observ|visible/i.test(objectives))).toBe(true);
    expect(objectiveSets.every((objectives) => /infer/i.test(objectives))).toBe(true);
    expect(objectiveSets.every((objectives) => /detail|feature|mark|relation|framing/i.test(objectives))).toBe(true);
    expect(objectiveSets.every((objectives) => /cannot|alternative|missing|excluded|boundary/i.test(objectives))).toBe(
      true,
    );
  });

  it('leaves an ordinary coverage brief untouched when it is not an exact one-topic-per-lesson contract', () => {
    const courseMap = {
      courseName: 'Workshop',
      lessons: [modelLesson(1, 'Start', 'Sources'), modelLesson(2, 'Finish', 'Revision')],
    };
    const result = enforceInstructionalPlanContract(
      courseMap,
      'Create two lessons about research. Cover sources, note taking, argument, revision, and presentation.',
    );
    expect(result).toEqual({ courseMap, changed: false, receipt: null });
  });

  it('applies an explicitly numbered sequence without inventing extra subtopics', () => {
    const courseMap = {
      courseName: 'Data Reasoning',
      lessons: [modelLesson(1, 'Overview', 'Overview'), modelLesson(2, 'Finale', 'Finale')],
    };
    const result = enforceInstructionalPlanContract(
      courseMap,
      'Use this exact lesson sequence:\n1. Describing distributions\n2. Comparing distributions',
    );
    expect(result.courseMap.lessons.map((lesson) => lesson.title)).toEqual([
      'Lesson 1: Describing distributions',
      'Lesson 2: Comparing distributions',
    ]);
    expect(result.courseMap.lessons.every((lesson) => lesson.sections.length === 1)).toBe(true);
  });

  it('feeds the authorized map into the shared pre-draft planning adapter', () => {
    const courseMap = {
      courseName: 'Data Reasoning',
      lessons: [modelLesson(1, 'Overview', 'Overview'), modelLesson(2, 'Finale', 'Finale')],
    };
    const prepared = prepareInstructionalPlan({
      courseMap,
      sourceBrief: 'Use this exact lesson sequence:\n1. Describing distributions\n2. Comparing distributions',
    });
    expect(prepared.courseMap.lessons.map((lesson) => lesson.title)).toEqual([
      'Lesson 1: Describing distributions',
      'Lesson 2: Comparing distributions',
    ]);
    expect(prepared.instructionalPlanContract.status).toBe('plan-authorized');
  });

  it('preserves the exact requested program-evaluation artifacts while authorizing the ordered lesson plan', () => {
    const sourceBrief =
      'Community Health Program Evaluation, a 6-week graduate seminar for public health students. Week 1: logic models and evaluation questions. Week 2: stakeholder mapping and ethical evaluation practice. Week 3: process indicators and implementation fidelity. Week 4: outcome indicators, measurement validity, and survey design. Week 5: mixed-method analysis and triangulation. Week 6: communicating findings and improvement recommendations. Include a lesson-specific applied exercise every week, short evidence-based readings or course-created practice where appropriate, a stakeholder memo, an indicator matrix, and a final evaluation portfolio with an executive brief, logic model, analysis plan, and recommendations. Ensure each assessment has explicit requirements and a usable rubric.';
    const courseMap = {
      courseName: 'Community Health Program Evaluation',
      lessons: genericLessons(6),
    };

    const result = enforceInstructionalPlanContract(courseMap, sourceBrief);
    const assessments = result.courseMap.lessons.map((lesson) => lesson.sections[0].weeklyAssessments);

    expect(result.receipt.assessmentContract).toMatchObject({
      protocol: 'coursemapper-source-brief-assessment-contract-v1',
      coveredLessonNumbers: [2, 3, 6],
    });
    expect(assessments[1]).toBe('Stakeholder memo');
    expect(assessments[2]).toBe('Indicator matrix');
    expect(assessments[5]).toMatch(/Final evaluation portfolio - required components:/);
    expect(assessments[5]).toMatch(/executive brief, logic model, analysis plan, and recommendations/i);
    expect(result.courseMap.lessons[5].sections[0].evaluateDesign).toMatch(
      /contains these labeled components: Executive brief, Logic model, Analysis plan, Recommendations/i,
    );

    const blueprint = buildCourseBlueprint(result.courseMap, { sourceBrief });
    const compiled = compileBlueprintDeliverables(blueprint, ['assignments', 'rubrics']);
    const finalBrief = compiled.assignments.assignments.find((assignment) =>
      /final evaluation portfolio/i.test(assignment.title),
    );
    const finalRubric = compiled.rubrics.rubrics.find((rubric) => /final evaluation portfolio/i.test(rubric.title));
    expect(finalBrief.instructions.join(' ')).toMatch(/Include every requested component/i);
    expect(finalBrief.deliverables.join(' ')).toMatch(/Executive brief/i);
    expect(finalBrief.deliverables.join(' ')).toMatch(/Logic model/i);
    expect(finalBrief.deliverables.join(' ')).toMatch(/Analysis plan/i);
    expect(finalBrief.deliverables.join(' ')).toMatch(/Recommendations/i);
    expect(JSON.stringify(finalRubric)).toMatch(/Required component integration/i);
  });

  it('augments an approved multi-section model plan with requested artifacts without collapsing its structure', () => {
    const sourceBrief =
      'Community Health Program Evaluation, a 6-week graduate seminar for public health students. Week 1: logic models and evaluation questions. Week 2: stakeholder mapping and ethical evaluation practice. Week 3: process indicators and implementation fidelity. Week 4: outcome indicators, measurement validity, and survey design. Week 5: mixed-method analysis and triangulation. Week 6: communicating findings and improvement recommendations. Include a lesson-specific applied exercise every week, short evidence-based readings or course-created practice where appropriate, a stakeholder memo, an indicator matrix, and a final evaluation portfolio with an executive brief, logic model, analysis plan, and recommendations. Ensure each assessment has explicit requirements and a usable rubric.';
    const topics = [
      ['Logic Models and Questions', 'Logic model construction', 'Evaluation question alignment'],
      ['Stakeholder Mapping', 'Stakeholder identification', 'Ethical evaluation practice'],
      ['Process Indicators', 'Implementation fidelity', 'Indicator matrix design'],
      ['Outcome Indicators', 'Measurement validity', 'Survey design'],
      ['Mixed-Method Analysis', 'Quantitative analysis', 'Triangulation'],
      ['Communicating Findings', 'Final evaluation portfolio', 'Improvement recommendations'],
    ];
    const courseMap = {
      courseName: 'Community Health Program Evaluation',
      lessons: topics.map(([title, first, second], index) => ({
        id: `model-${index + 1}`,
        title: `Lesson ${index + 1}: ${title}`,
        sections: [
          {
            topicSection: `${index + 1}.1: ${first}`,
            learningGoals: `Apply ${first} in public health program evaluation.`,
            learningObjectives: `Analyze ${first} using observable evidence.`,
            ...(index === 2 ? { weeklyAssessments: 'Indicator matrix' } : {}),
            ...(index === 5 ? { weeklyAssessments: 'Final evaluation portfolio with an executive brief' } : {}),
          },
          {
            topicSection: `${index + 1}.2: ${second}`,
            learningGoals: `Apply ${second} in public health program evaluation.`,
            learningObjectives: `Evaluate ${second} using observable evidence.`,
          },
        ],
      })),
    };

    const result = enforceInstructionalPlanContract(courseMap, sourceBrief);

    expect(result.receipt).toMatchObject({
      status: 'plan-authorized',
      source: 'source-brief-assessment-augmentation',
      lessonCount: 6,
    });
    expect(result.courseMap.lessons.every((lesson) => lesson.sections.length === 2)).toBe(true);
    expect(result.courseMap.lessons[1].sections[0].weeklyAssessments).toBe('Stakeholder memo');
    expect(result.courseMap.lessons[2].sections[0].weeklyAssessments).toBe('Indicator matrix');
    expect(result.courseMap.lessons[2].sections[1].weeklyAssessments).toBeUndefined();
    expect(result.courseMap.lessons[5].sections[0]).toMatchObject({
      requestedAssessmentTitle: 'Final evaluation portfolio',
      requiredAssessmentComponents: ['Executive brief', 'Logic model', 'Analysis plan', 'Recommendations'],
    });

    const prepared = prepareInstructionalPlan({ courseMap, sourceBrief });
    expect(prepared.courseMap.lessons.every((lesson) => lesson.sections.length === 2)).toBe(true);
    expect(prepared.courseMap.lessons[1].sections[0].weeklyAssessments).toBe('Stakeholder memo');
    expect(prepared.courseMap.lessons[2].sections[0].weeklyAssessments).toBe('Indicator matrix');
    expect(prepared.courseMap.lessons[2].sections[1].weeklyAssessments).toBeUndefined();
    expect(prepared.courseMap.lessons[5].sections[0].requiredAssessmentComponents).toEqual([
      'Executive brief',
      'Logic model',
      'Analysis plan',
      'Recommendations',
    ]);
    const preparedGraph = deriveCourseGraphFromCourseMap(prepared.courseMap);
    expect(
      preparedGraph.assessments.filter(
        (assessment) => assessment.dueSession === 3 && assessment.title === 'Indicator matrix',
      ),
    ).toHaveLength(1);

    const governingSourceContract = createScionEvidenceAuthorityContract({
      lessonIndices: [0, 1, 2, 3, 4, 5],
      instructionalPlan: prepared.instructionalPlan,
    });
    expect(() =>
      prepareInstructionalPlan({
        courseMap: prepared.courseMap,
        sourceBrief,
        governingSourceContract,
        ...prepared.authenticLanguageDataTransaction,
        allowEvidenceRecovery: true,
      }),
    ).not.toThrow();
  });

  it('replaces the exact V18 language placeholder plan from its named progression before research', () => {
    const sourceBrief =
      'Create a fourteen-lesson undergraduate Introduction to Language Structure course for students with no prior linguistics. Progress from linguistic evidence and phonetics through phonology, morphology, syntax, semantics, pragmatics, language variation, acquisition, change, and a final data-analysis project. Use authentic language data from more than one language, avoid deficit framing, and require students to justify analyses from observable forms rather than intuition alone.';
    const result = enforceInstructionalPlanContract(
      { courseName: 'Introduction to Language Structure', lessons: genericLessons(14) },
      sourceBrief,
    );

    expect(result.changed).toBe(true);
    expect(result.receipt).toMatchObject({
      status: 'plan-authorized',
      source: 'source-derived-semantic-recovery',
      recoveryMode: 'generic-plan-replaced-before-research',
      lessonCount: 14,
    });
    expect(result.courseMap.lessons.map((lesson) => lesson.title)).toEqual([
      'Lesson 1: Linguistic evidence',
      'Lesson 2: Linguistic evidence: evidence and methods',
      'Lesson 3: Phonetics',
      'Lesson 4: Phonetics: evidence and methods',
      'Lesson 5: Phonology',
      'Lesson 6: Phonology: evidence and methods',
      'Lesson 7: Morphology',
      'Lesson 8: Syntax',
      'Lesson 9: Semantics',
      'Lesson 10: Pragmatics',
      'Lesson 11: Language variation',
      'Lesson 12: Acquisition',
      'Lesson 13: Change',
      'Lesson 14: Final data-analysis project',
    ]);
    expect(assessInstructionalPlanIdentity(result.courseMap).status).toBe('approved');
  });

  it('condenses an official chapter schedule into eight source-bounded lesson identities', () => {
    const sourceBrief = `
=== Instructor Notes ===
Using the attached official syllabus as the governing source, create an eight-lesson undergraduate course map.
STATISTICS: 1450.01 (19952) INTRODUCTION TO THE PRACTICE OF STATISTICS SPRING 2026
Ch.1 Picturing Distributions with Graphs January 15 Ch.2 Describing Distributions with Numbers
Ch.3 The Normal Distribution Ch.4 Scatterplots & Correlation Ch.5 Regression Ch.6 Two-Way Tables
Ch.8 Producing Data: Sampling Ch.9 Producing Data: Experiments Ch.12 Introducing Probability
Ch.13 General Rules of Probability Ch.15 Sampling Distributions Ch.16 Confidence Intervals: The Basics
Ch.17 Tests of Significance: The Basics Ch.18 Inference in Practice Ch.20 Inference about a Population Mean
Ch.21 Two Means Ch.22 Inference about a Population Proportion Ch.23 Comparing Two Proportions
Ch.25 Two Categorical Variables Review for a cumulative final exam.`;
    const result = enforceInstructionalPlanContract(
      { courseName: 'Introduction to the Practice of Statistics', lessons: genericLessons(8) },
      sourceBrief,
    );

    expect(result.receipt).toMatchObject({ status: 'plan-authorized', source: 'source-derived-semantic-recovery' });
    expect(result.courseMap.lessons).toHaveLength(8);
    expect(JSON.stringify(result.courseMap.lessons)).not.toMatch(/Session \d+ topic/i);
    expect(result.courseMap.lessons[0].title).toContain('Distributions');
    expect(result.courseMap.lessons.at(-1).title).toContain('Categorical Variables');
  });

  it('freezes the requested first continuous source units before evidence acquisition', () => {
    const sourceBrief = `
=== Instructor Notes ===
Using the attached official syllabus as the governing source, create exactly eight lessons from the first eight continuous instructional topic units in source order.
=== File: statistics-syllabus.pdf ===
Ch.1 Picturing Distributions with Graphs January 15
Ch. 2 Describing Distributions with Numbers January 20
Ch. 2 Describing Distributions with Numbers January 22
Ch. 3 The Normal Distribution January 27
Ch. 4 Scatterplots & Correlation February 3
Ch. 5 Regression February 5
Ch. 6 Two - Way Tables February 12
Ch. 8 Producing Data: Sampling February 17
Ch. 9 Producing Data: Experiments February 19
Ch. 12 Introducing Probability February 24
Ch. 13 General Rules of Probability March 3`;
    const plausibleButSkippingMap = {
      courseName: 'Introduction to the Practice of Statistics',
      lessons: genericLessons(8).map((lesson, index) => ({
        ...lesson,
        title: `Lesson ${index + 1}: ${
          [
            'Picturing Distributions with Graphs',
            'Describing Distributions with Numbers',
            'The Normal Distribution',
            'Scatterplots and Correlation',
            'Regression',
            'Two-Way Tables',
            'Sampling Distributions',
            'Inference about a Population Mean',
          ][index]
        }`,
      })),
    };

    const result = enforceInstructionalPlanContract(plausibleButSkippingMap, sourceBrief);

    expect(result.changed).toBe(true);
    expect(result.receipt).toMatchObject({
      status: 'plan-authorized',
      source: 'governing-source-schedule-prefix',
      orderedLessonContract: {
        mode: 'governing-source-schedule-prefix',
        continuity: 'source-prefix-without-omissions',
      },
    });
    expect(result.courseMap.lessons.map((lesson) => lesson.title)).toEqual([
      'Lesson 1: Picturing Distributions with Graphs',
      'Lesson 2: Describing Distributions with Numbers',
      'Lesson 3: The Normal Distribution',
      'Lesson 4: Scatterplots & Correlation',
      'Lesson 5: Regression',
      'Lesson 6: Two-Way Tables',
      'Lesson 7: Producing Data: Sampling',
      'Lesson 8: Producing Data: Experiments',
    ]);
    expect(result.receipt.briefQualityContract).toBeUndefined();
    const objectives = result.courseMap.lessons.map((lesson) => lesson.sections[0].learningObjectives).join('\n');
    expect(objectives).toMatch(/distribution.+center and spread/i);
    expect(objectives).toMatch(/z-score calculation/i);
    expect(objectives).toMatch(/correlation/i);
    expect(objectives).toMatch(/slope and intercept/i);
    expect(objectives).toMatch(/conditional proportions/i);
    expect(objectives).toMatch(/random selection rule/i);
    expect(objectives).toMatch(/randomized experiment/i);
    expect(JSON.stringify(result.courseMap.lessons)).not.toMatch(/visual annotation or comparison/i);
    expect(
      result.courseMap.lessons.every((lesson) =>
        /distribution|descriptive|summary|analysis|audit|replayable|calculation|design|assignment|bin|z-score|correlation|regression|table|sample|experiment/i.test(
          lesson.sections[0].weeklyAssessments,
        ),
      ),
    ).toBe(true);
  });

  it('blocks evidence acquisition when neither the skeleton nor source can name the lessons', () => {
    const courseMap = { courseName: 'Workshop', lessons: genericLessons(4) };
    const result = enforceInstructionalPlanContract(courseMap, 'Create four lessons about a useful subject.');

    expect(result.changed).toBe(false);
    expect(result.courseMap).toBe(courseMap);
    expect(result.receipt).toMatchObject({
      status: 'plan-blocked',
      blocker: 'source-could-not-authorize-distinct-lesson-identities',
    });
  });
});
