import { describe, expect, it } from 'vitest';
import { compileCourse, gradePackage } from '../../curriculumos/index';
import {
  COURSE_IR_VERSION,
  buildCourseIRFromCourseMap,
  buildCourseIRPromptPayload,
  compileCourseIR,
  courseIRToCourseMap,
  courseIRToEnrichmentOverlay,
  planCourseIRGeneration,
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
        objectives: [
          'Use the difference quotient to define derivative at a point.',
          'Interpret derivative values as tangent slope and instantaneous rate.',
        ],
        prerequisiteChecks: ['Explain one-sided and two-sided limit agreement.'],
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

  it('projects CourseIR into the existing course map and enrichment surfaces', () => {
    const ir = makeCalculusIR();
    const courseMap = courseIRToCourseMap(ir);
    const overlay = courseIRToEnrichmentOverlay(ir);

    expect(courseMap.courseName).toBe('Calculus I - Limits and Derivatives');
    expect(courseMap.lessons).toHaveLength(2);
    expect(courseMap.lessons[0].sections[0].weeklyAssessments).toContain('Limit Evidence Check');
    expect(overlay.source).toBe('courseir-v1');
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
      expect.arrayContaining(['version', 'course', 'sourceLedger', 'concepts', 'lessons', 'assessments']),
    );
    expect(payload.sourcePacket.lessons).toHaveLength(2);
  });
});
