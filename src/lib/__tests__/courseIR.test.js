import { describe, expect, it } from 'vitest';
import { compileCourse, gradePackage } from '../../curriculumos/index';
import {
  COURSE_IR_VERSION,
  assessCourseIRDirectAuthoring,
  buildCourseIRFromCourseMap,
  buildCourseIRPromptPayload,
  compileCourseIR,
  courseIRToCourseMap,
  courseIRToEnrichmentOverlay,
  parseCourseIRResponse,
  planCourseIRGeneration,
  repairCourseIRStructure,
  stashCourseIR,
  takeCourseIR,
  validateCourseIR,
} from '../courseIR';

const FEATURE_IDS = ['syllabus', 'lessonPlans', 'quizBank'];

function makeCalculusIR() {
  return {
    version: COURSE_IR_VERSION,
    course: {
      title: 'Calculus I - Limits and Derivatives',
      discipline: 'Mathematics',
      level: 'Undergraduate',
      modality: 'In person',
      duration: '2 weeks',
      audience: 'first-year STEM students',
      sourceProvenance: 'Instructor course brief plus standard Calculus I domain knowledge.',
    },
    sourceLedger: [
      {
        id: 'SL1',
        scope: 'course',
        status: 'source-provided',
        evidence: 'Instructor requested Limits and Derivatives package.',
      },
      {
        id: 'SL2',
        scope: 'concepts',
        status: 'standard-domain-knowledge',
        evidence: 'Standard Calculus I definitions and procedures.',
      },
    ],
    constraints: [
      {
        id: 'K1',
        scope: 'course',
        text: 'Use graph, table, and symbolic evidence before introducing derivative shortcut rules.',
        severity: 'requirement',
        sourceRefs: ['SL1'],
      },
    ],
    concepts: [
      {
        id: 'C1',
        term: 'Limit',
        definition: 'A limit describes the value a function approaches as the input approaches a target value.',
        factualAnchors: [
          {
            claim:
              'Limits describe approach behavior and do not require the function value to be defined at the target input.',
            status: 'standard-domain-knowledge',
            sourceRefs: ['SL2'],
          },
          {
            claim: 'Two-sided limits require the left-hand and right-hand limits to agree.',
            status: 'standard-domain-knowledge',
            sourceRefs: ['SL2'],
          },
        ],
        misconceptions: [
          {
            claim: 'Students often think a limit equals the function value at the point automatically.',
            correction: 'Separate approach behavior from the value actually assigned to the function.',
          },
        ],
        vocabulary: [
          {
            term: 'two-sided limit',
            definition: 'The shared value approached from both sides of a target input.',
            example: 'A graph approaches 3 from the left and right as x approaches 2.',
            misconception: 'A hole at the target input prevents a limit from existing.',
            correction: 'A removable hole can still have a limit when both sides approach the same value.',
          },
        ],
      },
      {
        id: 'C2',
        term: 'Derivative',
        definition: 'A derivative measures instantaneous rate of change as the limit of average rates of change.',
        prerequisiteIds: ['C1'],
        factualAnchors: [
          {
            claim:
              'The derivative at a point is defined through the limit of a difference quotient when that limit exists.',
            status: 'standard-domain-knowledge',
            sourceRefs: ['SL2'],
          },
          {
            claim: 'The derivative gives the slope of the tangent line for differentiable functions.',
            status: 'standard-domain-knowledge',
            sourceRefs: ['SL2'],
          },
        ],
        misconceptions: [
          {
            claim: 'Students often treat average rate of change over an interval as the derivative at an endpoint.',
            correction: 'Shrink the interval through a limiting process before naming the instantaneous rate.',
          },
        ],
        vocabulary: [
          {
            term: 'difference quotient',
            definition:
              'A ratio of function-value change to input change used to approximate or define rate of change.',
            example: '(f(a+h)-f(a))/h for h not equal to zero.',
            misconception: 'The h can be set to zero before simplification.',
            correction: 'Simplify first, then take the limit as h approaches zero.',
          },
        ],
      },
    ],
    lessons: [
      {
        id: 'L1',
        title: 'Lesson 1: Limits and Approach Behavior',
        topic: 'Limits and approach behavior',
        conceptIds: ['C1'],
        objectives: [
          'Interpret a limit from a table, graph, and symbolic expression.',
          'Distinguish a function value from approach behavior near a point.',
        ],
        prerequisiteChecks: ['Evaluate function values from a graph and table.'],
        constraints: [
          {
            id: 'K-L1',
            scope: 'L1',
            text: 'Require students to justify limits from at least two representations.',
            severity: 'requirement',
          },
        ],
        factualAnchors: [
          {
            claim: 'A graph can show a limit even when the function has a hole at the target input.',
            status: 'standard-domain-knowledge',
            sourceRefs: ['SL2'],
          },
          {
            claim: 'If one-sided limits disagree, the two-sided limit does not exist.',
            status: 'standard-domain-knowledge',
            sourceRefs: ['SL2'],
          },
          {
            claim: 'Tables support limit reasoning only when students explain the trend, not just the nearest row.',
            status: 'standard-domain-knowledge',
            sourceRefs: ['SL2'],
          },
        ],
        workedExamples: [
          {
            id: 'L1-E1',
            skill: 'Evaluate a removable-discontinuity limit',
            setup: 'Find lim x->2 of (x^2 - 4)/(x - 2).',
            solutionSteps: [
              'Factor x^2 - 4 as (x - 2)(x + 2).',
              'Cancel the common factor for x not equal to 2.',
              'Evaluate x + 2 at x = 2.',
            ],
            result: 'The limit is 4.',
          },
        ],
        misconceptions: [
          {
            claim: 'A student may plug in x = 2 first and stop at 0/0.',
            correction: 'Treat 0/0 as a signal to transform the expression before evaluating the limit.',
          },
        ],
        practiceItems: [
          'Classify table, graph, and formula evidence for the same limit.',
          'Explain why a hole does not automatically destroy a limit.',
        ],
        assessmentIds: ['A1'],
        quizItems: [
          {
            question: 'Why can lim x->2 (x^2 - 4)/(x - 2) exist even though the expression is undefined at x = 2?',
            options: [
              'The simplified expression approaches 4 as x approaches 2.',
              'The function value at x = 2 is automatically 4.',
              'Every 0/0 expression has limit 0.',
              'The left-hand limit alone is enough.',
            ],
            answerIndex: 0,
            explanation:
              'A limit depends on nearby approach behavior after valid simplification, not the missing point value.',
          },
        ],
      },
      {
        id: 'L2',
        title: 'Lesson 2: Derivatives as Limits',
        topic: 'Derivatives as limits of average rates',
        conceptIds: ['C1', 'C2'],
        prerequisiteConceptIds: ['C1'],
        objectives: [
          'Use the difference quotient to define derivative at a point.',
          'Interpret derivative values as tangent slope and instantaneous rate.',
        ],
        prerequisiteChecks: ['Explain one-sided and two-sided limit agreement.'],
        constraints: [
          {
            id: 'K-L2',
            scope: 'L2',
            text: 'Do not use derivative shortcut rules before students explain the limit definition.',
            severity: 'requirement',
          },
        ],
        factualAnchors: [
          {
            claim:
              'The derivative definition uses a limit as h approaches zero, not substitution of h = 0 at the start.',
            status: 'standard-domain-knowledge',
            sourceRefs: ['SL2'],
          },
          {
            claim:
              'Average rate over a shrinking interval becomes instantaneous rate only when the limiting value exists.',
            status: 'standard-domain-knowledge',
            sourceRefs: ['SL2'],
          },
          {
            claim: 'A tangent slope interpretation must match the algebraic derivative value.',
            status: 'standard-domain-knowledge',
            sourceRefs: ['SL2'],
          },
        ],
        workedExamples: [
          {
            id: 'L2-E1',
            skill: 'Compute a derivative from the definition',
            setup: 'Use the limit definition to find the derivative of f(x)=x^2 at x=3.',
            solutionSteps: [
              'Write ((3+h)^2 - 3^2)/h.',
              'Expand to get (6h + h^2)/h.',
              'Cancel h for h not equal to zero.',
              'Take the limit of 6 + h as h approaches zero.',
            ],
            result: 'The derivative at x=3 is 6.',
          },
        ],
        misconceptions: [
          {
            claim: 'A student may cancel h after already setting h to zero.',
            correction: 'Keep h nonzero during algebraic simplification, then take the limiting value.',
          },
        ],
        practiceItems: [
          'Match secant-slope intervals to derivative estimates.',
          'Explain each algebraic move in a difference quotient.',
        ],
        assessmentIds: ['A2'],
        quizItems: [
          {
            question: 'In the derivative definition, why is h not set to zero before simplifying?',
            options: [
              'The quotient is defined for nonzero h and the limit handles h approaching zero.',
              'The derivative definition never uses limits.',
              'Setting h to zero always gives the tangent slope directly.',
              'The average rate formula only works for linear functions.',
            ],
            answerIndex: 0,
            explanation:
              'The limiting process allows simplification while h remains nonzero, then evaluates the approach value.',
          },
        ],
      },
    ],
    assessments: [
      {
        id: 'A1',
        title: 'Limit Evidence Check',
        kind: 'graded-artifact',
        lessonIds: ['L1'],
        coverageConceptIds: ['C1'],
        prompt: 'Analyze one table, one graph, and one symbolic expression to decide whether each limit exists.',
        rubricDimensions: ['approach-behavior evidence', 'function-value distinction', 'clear explanation'],
        weightPct: 10,
        provenance: 'courseir',
      },
      {
        id: 'A2',
        title: 'Derivative Definition Mini-Proof',
        kind: 'graded-artifact',
        lessonIds: ['L2'],
        coverageConceptIds: ['C1', 'C2'],
        prompt: 'Compute one derivative from the limit definition and explain each limiting step.',
        rubricDimensions: ['difference quotient setup', 'valid algebra', 'rate interpretation'],
        weightPct: 15,
        provenance: 'courseir',
      },
    ],
    artifactIntents: FEATURE_IDS.map((featureId, index) => ({
      id: `AI${index + 1}`,
      featureId,
      lessonIds: ['L1', 'L2'],
      requiredRefs: ['L1', 'L2', 'C1', 'C2', 'A1', 'A2'],
    })),
    qualityHints: ['Verify that derivatives are rendered as limits before shortcut rules appear.'],
  };
}

function makeBroadAssessmentIR() {
  const courseMap = {
    courseName: 'Four Lesson Research Methods Course',
    semester: '4 weeks',
    lessons: Array.from({ length: 4 }, (_, index) => ({
      title: `Lesson ${index + 1}: Research Topic ${index + 1}`,
      sections: [
        {
          topicSection: `Research Topic ${index + 1}`,
          learningObjectives: `Analyze research decision ${index + 1}; Apply evidence standard ${index + 1}`,
          weeklyAssessments: `Topic ${index + 1} method memo`,
          asyncActivities: `Read and annotate method example ${index + 1}`,
          syncActivities: `Workshop research scenario ${index + 1}`,
          supportingResources: `Instructor source packet ${index + 1}`,
        },
      ],
    })),
  };
  const ir = buildCourseIRFromCourseMap(courseMap);
  const broadAssessment = {
    ...ir.assessments[0],
    id: 'A1',
    title: 'One portfolio integrating all four lessons',
    lessonIds: ir.lessons.map((lesson) => lesson.id),
    coverageConceptIds: ir.concepts.map((concept) => concept.id),
    prompt: 'Submit one portfolio that integrates the full course.',
  };
  return {
    ...ir,
    lessons: ir.lessons.map((lesson) => ({
      ...lesson,
      assessmentIds: ['A1'],
    })),
    assessments: [broadAssessment],
  };
}

describe('CourseIR v1', () => {
  it('validates semantic atoms and builds a complete coverage ledger', () => {
    const validation = validateCourseIR(makeCalculusIR());

    expect(validation.valid).toBe(true);
    expect(validation.stats).toMatchObject({
      lessons: 2,
      concepts: 2,
      assessments: 2,
      workedExamples: 2,
      sourceLedgerRows: 2,
      constraints: 3,
      prerequisiteLinks: 2,
    });
    expect(validation.coverage.lessons).toHaveLength(2);
    expect(validation.coverage.lessons.every((lesson) => lesson.complete)).toBe(true);
    expect(validation.issues.filter((entry) => entry.severity === 'blocker')).toEqual([]);
  });

  it('rejects CourseIR that cannot prove source and assessment coverage', () => {
    const invalid = {
      ...makeCalculusIR(),
      sourceLedger: [],
      assessments: [],
      lessons: makeCalculusIR().lessons.map((lesson) => ({ ...lesson, assessmentIds: [] })),
    };

    const validation = validateCourseIR(invalid);

    expect(validation.valid).toBe(false);
    expect(validation.issues.map((entry) => entry.code)).toEqual(
      expect.arrayContaining(['missing-assessments', 'missing-source-ledger', 'unassessed-lesson']),
    );
    expect(validation.repairPaths).toEqual(expect.arrayContaining(['lessons.L1.assessmentIds']));
  });

  it('rejects dangling prerequisite links before compile', () => {
    const broken = makeCalculusIR();
    broken.concepts[1] = {
      ...broken.concepts[1],
      prerequisiteIds: ['C404'],
    };
    broken.lessons[1] = {
      ...broken.lessons[1],
      prerequisiteConceptIds: ['C404'],
    };

    const validation = validateCourseIR(broken);

    expect(validation.valid).toBe(false);
    expect(validation.issues.map((entry) => entry.code)).toEqual(
      expect.arrayContaining(['dangling-concept-prerequisite', 'dangling-lesson-prerequisite']),
    );
    expect(() => compileCourseIR(broken, { featureIds: ['syllabus'] })).toThrow(/prerequisite concept C404/);
  });

  it('repairs missing constraint atoms before compile', () => {
    const broken = {
      ...makeCalculusIR(),
      constraints: [],
      lessons: makeCalculusIR().lessons.map((lesson) => ({
        ...lesson,
        constraints: [],
      })),
    };

    const validation = validateCourseIR(broken);
    expect(validation.valid).toBe(true);
    expect(validation.issues.map((entry) => entry.code)).toEqual(
      expect.arrayContaining(['missing-course-constraints', 'missing-lesson-constraints']),
    );

    const repair = repairCourseIRStructure(broken);
    const repairedValidation = validateCourseIR(repair.ir);
    expect(repair.changed).toBe(true);
    expect(repair.repairs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'added-course-constraints', before: 0, after: 1 }),
        expect.objectContaining({ code: 'added-lesson-constraints', count: 2 }),
      ]),
    );
    expect(repairedValidation.stats.constraints).toBe(3);
    expect(repairedValidation.coverage.lessons.every((lesson) => lesson.constraintCount > 0)).toBe(true);

    const compiled = compileCourseIR(broken, { featureIds: ['syllabus'] });
    expect(compiled.courseIRProof).toMatchObject({
      valid: true,
      repairedBeforeCompile: true,
      graphValid: true,
    });
    expect(compiled.courseIRProof.repairs).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'added-course-constraints' })]),
    );
  });

  it('rejects one broad assessment for four lessons and repairs it before compile', () => {
    const broad = makeBroadAssessmentIR();
    const validation = validateCourseIR(broad);

    expect(validation.valid).toBe(false);
    expect(validation.issues.map((entry) => entry.code)).toContain('under-assessed-course');
    expect(validation.repairPaths).toContain('assessments');

    const repair = repairCourseIRStructure(broad);
    const repairedValidation = validateCourseIR(repair.ir);
    expect(repair.changed).toBe(true);
    expect(repair.repairs).toContainEqual(
      expect.objectContaining({
        code: 'expanded-lesson-assessments',
        before: 1,
        after: 4,
      }),
    );
    expect(repairedValidation.valid).toBe(true);
    expect(repairedValidation.stats.assessments).toBe(4);
    expect(new Set(repair.ir.lessons.flatMap((lesson) => lesson.assessmentIds)).size).toBe(4);

    const compiled = compileCourseIR(broad, { featureIds: ['syllabus', 'quizBank'] });
    expect(compiled.courseIRProof).toMatchObject({
      valid: true,
      repairedBeforeCompile: true,
      graphValid: true,
      providerCallsDuringCompile: 0,
    });
    expect(compiled.courseIRProof.repairs).toContainEqual(
      expect.objectContaining({ code: 'expanded-lesson-assessments' }),
    );
    expect(compiled.graph.assessments).toHaveLength(4);
    expect(compiled.deliverables.syllabus).toBeTruthy();
    expect(compiled.deliverables.quizBank).toBeTruthy();
  });

  it('repairs missing source ledger and lesson concept coverage before compile', () => {
    const base = makeCalculusIR();
    const broken = {
      ...base,
      sourceLedger: [],
      lessons: base.lessons.map((lesson, index) =>
        index === 0
          ? {
              ...lesson,
              conceptIds: [],
            }
          : lesson,
      ),
    };

    const validation = validateCourseIR(broken);
    expect(validation.valid).toBe(false);
    expect(validation.issues.map((entry) => entry.code)).toEqual(
      expect.arrayContaining(['missing-source-ledger', 'missing-lesson-concepts']),
    );

    const repair = repairCourseIRStructure(broken);
    const repairedValidation = validateCourseIR(repair.ir);
    expect(repair.changed).toBe(true);
    expect(repair.repairs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'added-assumption-source-ledger', before: 0, after: 1 }),
        expect.objectContaining({ code: 'added-lesson-concepts', count: 1 }),
      ]),
    );
    expect(repair.ir.sourceLedger[0]).toMatchObject({
      status: 'assumption',
      scope: 'course',
    });
    expect(repair.ir.handoffNotes[0].scope).toBe('sourceLedger');
    expect(repair.ir.lessons[0].conceptIds).toHaveLength(1);
    expect(repairedValidation.valid).toBe(true);

    const compiled = compileCourseIR(broken, { featureIds: ['syllabus'] });
    expect(compiled.courseIRProof).toMatchObject({
      valid: true,
      repairedBeforeCompile: true,
      graphValid: true,
    });
    expect(compiled.courseIRProof.initialIssueCodes).toEqual(
      expect.arrayContaining(['missing-source-ledger', 'missing-lesson-concepts']),
    );
    expect(compiled.deliverables.syllabus).toBeTruthy();
  });

  it('projects CourseIR into the existing course map and enrichment surfaces', () => {
    const ir = makeCalculusIR();
    const courseMap = courseIRToCourseMap(ir);
    const overlay = courseIRToEnrichmentOverlay(ir);

    expect(courseMap.courseName).toBe('Calculus I - Limits and Derivatives');
    expect(courseMap.lessons).toHaveLength(2);
    expect(courseMap.lessons[0].sections[0].weeklyAssessments).toContain('Limit Evidence Check');
    expect(courseMap.lessons[1].sections[0].supportingResources).toContain('Prerequisite concept: Limit');
    expect(courseMap.lessons[1].sections[0].supportingResources).toContain(
      'Constraint: Do not use derivative shortcut rules',
    );
    expect(overlay.source).toBe('courseir-v1');
    expect(overlay.lessonContent['lesson-2'].assignmentCore.parameters).toEqual(
      expect.arrayContaining(['Do not use derivative shortcut rules before students explain the limit definition.']),
    );
    expect(overlay.lessonContent['lesson-1'].keyTerms[0]).toMatchObject({
      term: 'two-sided limit',
      correction: expect.stringContaining('removable hole'),
    });
    expect(overlay.lessonContent['lesson-2'].workedExample).toMatchObject({
      result: 'The derivative at x=3 is 6.',
    });
  });

  it('compiles deterministic package artifacts from CourseIR with proof metadata', () => {
    const result = compileCourseIR(makeCalculusIR(), { featureIds: FEATURE_IDS });

    expect(result.compiledFeatureIds).toEqual(FEATURE_IDS);
    expect(Object.keys(result.deliverables)).toEqual(expect.arrayContaining(FEATURE_IDS));
    expect(result.courseIRProof).toMatchObject({
      version: COURSE_IR_VERSION,
      valid: true,
      graphValid: true,
      deterministicCompile: true,
      providerCallsDuringCompile: 0,
      coverageStats: {
        lessonsComplete: 2,
        lessonsTotal: 2,
        incompleteLessonIds: [],
      },
    });
    expect(result.graph.authoredBy).toBe('courseir-v1');
  });

  it('routes CourseIR through the public CurriculumOS facade and package manifest', async () => {
    const compiled = compileCourse({ courseIR: makeCalculusIR(), featureIds: FEATURE_IDS });

    expect(compiled.courseIRProof.valid).toBe(true);
    expect(compiled.deliverables.lessonPlans).toBeTruthy();

    const graded = await gradePackage({
      courseMap: compiled.courseMap,
      deliverables: {},
      featureIds: ['courseMap'],
      pipelineState: compiled.pipelineState,
      courseGraph: compiled.graph,
      quality: false,
    });

    expect(graded.files.map((file) => file.path)).toContain('PACKAGE_MANIFEST.json');
    expect(graded.quality).toBeNull();
    expect(graded.files.length).toBeGreaterThan(1);
  });

  it('normalizes legacy course maps into a valid CourseIR input', () => {
    const ir = buildCourseIRFromCourseMap(courseIRToCourseMap(makeCalculusIR()));
    const validation = validateCourseIR(ir);
    const compiled = compileCourseIR(ir, { featureIds: ['syllabus'] });

    expect(validation.valid).toBe(true);
    expect(compiled.deliverables.syllabus).toBeTruthy();
    expect(compiled.courseIRProof.providerCallsDuringCompile).toBe(0);
  });

  it('plans one-call or fewest-call CourseIR generation by model capacity', () => {
    const courseMap = {
      courseName: 'Fifteen Lesson Calculus Course',
      lessons: Array.from({ length: 15 }, (_, index) => ({
        title: `Lesson ${index + 1}`,
        sections: [{ topicSection: `Topic ${index + 1}` }],
      })),
    };

    const wholeCourse = planCourseIRGeneration({
      courseMap,
      modelCapabilities: { contextWindow: 400000, maxOutputTokens: 128000 },
    });
    const constrained = planCourseIRGeneration({
      courseMap,
      modelCapabilities: { contextWindow: 400000, maxOutputTokens: 24000 },
    });

    expect(wholeCourse.strategy).toBe('whole-course-ir');
    expect(wholeCourse.plannedCalls).toBe(1);
    expect(constrained.strategy).toMatch(/lesson-blocks|global-then-lesson-blocks/);
    expect(constrained.plannedCalls).toBeGreaterThan(1);
    expect(constrained.blockSize).toBeGreaterThanOrEqual(1);
  });

  it('builds a compact prompt contract for provider structured output', () => {
    const payload = buildCourseIRPromptPayload({ courseMap: courseIRToCourseMap(makeCalculusIR()) });

    expect(payload.task).toBe('courseir-v1');
    expect(payload.instruction).toContain('semantic atoms');
    expect(payload.outputContract.required).toEqual(
      expect.arrayContaining([
        'version',
        'course',
        'sourceLedger',
        'constraints',
        'concepts',
        'lessons',
        'assessments',
      ]),
    );
    expect(payload.sourcePacket.lessons).toHaveLength(2);
  });

  it('parses and accepts dense direct CourseIR responses', () => {
    const parsed = parseCourseIRResponse(`\n\`\`\`json\n${JSON.stringify(makeCalculusIR())}\n\`\`\`\n`, {
      expectedLessons: 2,
    });

    expect(parsed.validation.valid).toBe(true);
    expect(parsed.acceptance).toMatchObject({
      accepted: true,
      lessonCount: 2,
      completeLessons: 2,
    });
    expect(parsed.repair.changed).toBe(false);
  });

  it('rejects repaired structure as direct provider authoring even though compiler repair can render it', () => {
    const broad = makeBroadAssessmentIR();
    const parsed = parseCourseIRResponse(JSON.stringify(broad), { expectedLessons: 4 });

    expect(parsed.validation.valid).toBe(true);
    expect(parsed.repair.changed).toBe(true);
    expect(parsed.repair.repairs).toContainEqual(
      expect.objectContaining({
        code: 'expanded-lesson-assessments',
        before: 1,
        after: 4,
      }),
    );
    expect(parsed.acceptance).toMatchObject({
      accepted: false,
      repairedBeforeAcceptance: true,
    });
    expect(parsed.acceptance.reason).toContain('repaired-structure');
    expect(parsed.acceptance.reason).toContain('expanded-lesson-assessments');

    const compiled = compileCourseIR(broad, { featureIds: ['syllabus'] });
    expect(compiled.courseIRProof).toMatchObject({
      valid: true,
      repairedBeforeCompile: true,
      graphValid: true,
      providerCallsDuringCompile: 0,
    });
  });

  it('rejects thin direct CourseIR even when structural validation can pass', () => {
    const thin = {
      ...makeCalculusIR(),
      lessons: makeCalculusIR().lessons.map((lesson) => ({
        ...lesson,
        workedExamples: [],
      })),
    };
    const validation = validateCourseIR(thin);
    const acceptance = assessCourseIRDirectAuthoring(validation, { expectedLessons: 2 });

    expect(validation.valid).toBe(true);
    expect(acceptance.accepted).toBe(false);
    expect(acceptance.reason).toContain('thin-examples');
  });

  it('hands direct CourseIR across generation and deliverables once, keyed to the rendered map', () => {
    const ir = makeCalculusIR();
    const courseMap = courseIRToCourseMap(ir);

    stashCourseIR(ir);
    expect(takeCourseIR({ courseName: 'Different Course', lessons: courseMap.lessons })).toBeNull();
    stashCourseIR(ir);
    expect(takeCourseIR(courseMap)).toMatchObject({
      version: COURSE_IR_VERSION,
      course: { title: 'Calculus I - Limits and Derivatives' },
    });
    expect(takeCourseIR(courseMap)).toBeNull();
  });
});
