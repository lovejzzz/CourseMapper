/**
 * v0.16.1 — rubric/assignment/registry integrity regressions.
 *
 * Verified against a live-generated Linear Algebra package (v0.16.0,
 * 14 lessons, 26 course-map assessment rows bridged into the compiler):
 *
 *  1. WRONG LESSON LABELS — 6 of 14 rubric files were headed with another
 *     lesson's title ("Lesson 1: Systems of linear equations" grading Week 3
 *     work). Root cause: the post-process anchor realignment inferred the
 *     lesson from TEXT tokens and ignored the rubric's own structured
 *     lessonNumber binding. Fixed in deliverablePostProcess
 *     (inferRubricAnchorIndex / extractLessonNumbersFromRubric).
 *  2. EMPTY EXAM RUBRIC FILES — compileRubrics filtered exam-kind rows but
 *     the per-lesson writer still emitted a title-only shell. Exams now get
 *     an answer-key handoff note entry (courseBlueprintCompiler
 *     buildExamRubricHandoffEntry) and the DOCX renderer has an empty-state.
 *  3. PYTHON-LAB CLONE — twin assessments shipped byte-level clone briefs/
 *     rubrics with partial title swaps ("the Week N sets" residue). Code-lab
 *     twins now get their own criteria (correctness / code clarity / test
 *     evidence), a lab brief scaffold (environment, task, verification
 *     milestone), and a deterministic relabel that removes sibling residue.
 *  4. CONTRADICTORY WEIGHTS — "100 PTS · 5% · Course Map L4 · A4.1 · 4%".
 *     Registry-linked briefs keep the registry row's weight (the normalizer
 *     no longer re-normalizes them) and the DOCX header renders ONE percent.
 *     The manifest now emits the same bridged weights the syllabus renders.
 */
import { describe, expect, it } from 'vitest';

import { compileBlueprintDeliverables } from '../courseBlueprintCompiler';
import { isCodeLabAssessmentIdentity } from '../compilerAssessmentIdentity';
import { selectCompleteConceptMapHub } from '../compilerFactLedgerVisuals';
import { buildBlueprintFromGraph, deriveCourseGraphFromCourseMap } from '../courseGraph';
import {
  normalizeAssignmentGradeWeights,
  normalizeRubricAssessmentAlignment,
  validateDeliverableGeneration,
} from '../deliverablePostProcess';
import { scopeDeliverableDataToLessons } from '../deliverableReadiness';

// ── Fixture: 5 lessons, L2 has proof+lab twins, L5 is a final exam ──────────

const LINEAR_ALGEBRA_TOPICS = [
  ['Systems of Linear Equations', 'row reduction'],
  ['Vector Spaces', 'linear independence'],
  ['Linear Transformations', 'kernel and image'],
  ['Eigenvalues and Eigenvectors', 'diagonalization'],
];

function linearAlgebraCourseMap() {
  const lessons = LINEAR_ALGEBRA_TOPICS.map(([title, concept], index) => ({
    title: `Lesson ${index + 1}: ${title}`,
    sections: [
      {
        topicSection: `${index + 1}.1: ${title}`,
        learningGoals: `1. Reason rigorously about ${concept}.`,
        learningObjectives: `Analyze ${concept} with formal proofs.\nEvaluate ${concept} claims against counterexamples.`,
        weeklyAssessments:
          index === 1
            ? `Proof-based problem sets: ${concept}\nComputational lab in Python: ${concept}`
            : `Proof-based problem sets: ${concept}`,
        asyncActivities: `Read the ${title.toLowerCase()} chapter.`,
        syncActivities: `Workshop: ${concept} proof practice.`,
        supportingResources: `Open linear algebra text, chapter on ${title.toLowerCase()}`,
      },
    ],
  }));
  lessons.push({
    title: 'Lesson 5: Comprehensive Review and Final',
    sections: [
      {
        topicSection: '5.1: Course Synthesis',
        learningGoals: '1. Integrate the course concepts under exam conditions.',
        learningObjectives:
          'Analyze multi-topic problems that combine systems, spaces, and eigentheory.\nEvaluate solution strategies under time constraints.',
        weeklyAssessments: 'Final Exam: comprehensive linear algebra',
        asyncActivities: 'Work the cumulative review sheet.',
        syncActivities: 'Instructor-led synthesis session.',
        supportingResources: 'Cumulative review packet',
      },
    ],
  });
  return { courseName: 'Introduction to Linear Algebra', semester: 'Fall 2026', lessons };
}

function compileFixture() {
  const courseMap = linearAlgebraCourseMap();
  const graph = deriveCourseGraphFromCourseMap(courseMap);
  const blueprint = buildBlueprintFromGraph(graph);
  const compiled = compileBlueprintDeliverables(blueprint, ['assignments', 'rubrics']);
  return { courseMap, graph, blueprint, compiled };
}

const { courseMap, graph, blueprint, compiled } = compileFixture();

function compilePythonPolicyFixture() {
  const policyMap = {
    courseName: 'Python for Public Policy',
    semester: 'Fall 2026',
    lessons: [
      {
        title: 'Lesson 1: Python and pandas for public datasets',
        sections: [
          {
            topicSection: 'Python and pandas for public datasets',
            learningGoals: 'Evaluate a public dataset and explain a policy-relevant evidence boundary.',
            learningObjectives:
              'Interpret dataset provenance and limitations.\nExplain a policy implication supported by the dataset.',
            weeklyAssessments: 'Evidence explanation: Python and pandas for public datasets',
            asyncActivities: 'Review the public dataset evidence brief.',
            syncActivities: 'Compare two policy interpretations of the dataset.',
            supportingResources: 'Public dataset evidence brief; policy memo guide',
          },
        ],
      },
    ],
  };
  const policyGraph = deriveCourseGraphFromCourseMap(policyMap);
  const policyBlueprint = buildBlueprintFromGraph(policyGraph);
  return {
    blueprint: policyBlueprint,
    compiled: compileBlueprintDeliverables(policyBlueprint, ['assignments', 'rubrics', 'slideDecks']),
  };
}

const { compiled: pythonPolicyCompiled } = compilePythonPolicyFixture();

describe('assessment identity and concept-label boundaries', () => {
  it.each([
    ['Python lab: clean a public dataset', true],
    ['Computational project with a verification run', true],
    ['Python assignment: policy memo on public datasets', false],
    ['Policy implementation memo using Python evidence', false],
    ['Repository test plan for stakeholder review', false],
    ['Field-note coding exercise', false],
    ['Jupyter notebook with unit tests', true],
  ])('classifies %s as code-lab=%s', (identity, expected) => {
    expect(isCodeLabAssessmentIdentity(identity)).toBe(expected);
  });

  it('skips clipped-looking hubs and selects the next complete concept identity', () => {
    expect(selectCompleteConceptMapHub(['Policy evidence and', 'Analysis for', 'Python and pandas'])).toBe(
      'Python and pandas',
    );
  });
});

const rubricLessonOf = (rubric) => rubric.lessonNumber;
const assessmentLessonOf = (assessmentId) => Number(String(assessmentId).match(/^A(\d+)\./)?.[1]);

// ── (1) rubric lesson labels come from the assessment's own binding ─────────

describe('rubric lesson labels match their assessment row', () => {
  it('every compiled rubric carries its assessment row lesson binding', () => {
    expect(compiled.rubrics.rubrics.length).toBeGreaterThanOrEqual(6);
    for (const rubric of compiled.rubrics.rubrics) {
      expect(Number.isInteger(rubric.lessonNumber), `rubric missing lessonNumber: ${rubric.title}`).toBe(true);
      expect(rubricLessonOf(rubric), `rubric ${rubric.title} bound to wrong lesson`).toBe(
        assessmentLessonOf(rubric.assessmentId),
      );
      const lessonTitle = courseMap.lessons[rubric.lessonNumber - 1].title;
      expect(rubric.lessonTitle, `rubric header names another lesson: ${rubric.title}`).toContain(
        lessonTitle.replace(/^Lesson \d+: /, ''),
      );
    }
  });

  it('anchor realignment never re-stamps a structured rubric with another lesson title', () => {
    // The live failure mode: a rubric with generic text tokens scored best
    // against Lesson 1's anchor, so another lesson's file shipped headed
    // "Lesson 1: Systems of linear equations". A structured lessonNumber
    // must hard-restrict candidates to its own lesson. The generic rubric
    // below even NAMES Lesson 1's topic in its graded work — token scoring
    // would pick Lesson 1; the structured binding must win.
    const genericRubric = {
      title: 'Weekly Assessment Rubric',
      assessmentId: 'A2.1',
      lessonNumber: 2,
      lessonTitle: '',
      gradedWork: 'Systems of linear equations review work',
      totalPoints: 100,
      criteria: [
        {
          criterion: 'Concept use',
          weight: 50,
          exemplary: 'Strong',
          proficient: 'Good',
          developing: 'Uneven',
          beginning: 'Weak',
        },
        {
          criterion: 'Communication',
          weight: 50,
          exemplary: 'Strong',
          proficient: 'Good',
          developing: 'Uneven',
          beginning: 'Weak',
        },
      ],
    };
    const result = normalizeRubricAssessmentAlignment({ rubrics: [genericRubric] }, courseMap, compiled.assignments);
    const patched = result.data.rubrics[0];
    expect(patched.lessonTitle).toBe('Lesson 2: Vector Spaces');
    expect(patched.lessonTitle).not.toContain('Systems of Linear Equations');
  });

  it('a structured rubric whose lesson has no anchors is left untouched (no cross-stamp)', () => {
    // Lesson 3's assessment cell ("Proof-based problem sets: …") does not
    // pass the rubric-worthy text gate, so no anchors exist for it — the
    // old positional/token fallback would have re-stamped this rubric with
    // another lesson's title. It must stay untouched instead.
    const orphan = {
      title: 'Orphan Rubric',
      lessonNumber: 3,
      lessonTitle: 'Lesson 3: Linear Transformations',
      gradedWork: 'Weekly proof work',
      criteria: [],
    };
    const result = normalizeRubricAssessmentAlignment({ rubrics: [orphan] }, courseMap, compiled.assignments);
    expect(result.data.rubrics[0].lessonTitle).toBe('Lesson 3: Linear Transformations');
  });
});

// ── (2) exam rubric slot carries a handoff note, never an empty shell ───────

describe('exam rubric handoff note', () => {
  const examEntries = compiled.rubrics.rubrics.filter((rubric) => rubric.examHandoffNote);

  it('the exam lesson gets a handoff entry pointing at the quiz bank', () => {
    expect(examEntries).toHaveLength(1);
    const entry = examEntries[0];
    expect(entry.lessonNumber).toBe(5);
    expect(entry.examHandoffNote).toMatch(/exam — the answer key lives in the Quiz & Exam Bank for Lesson 5/);
    expect(entry.criteria).toBeUndefined();
    expect(entry.title).toContain('Final Exam');
  });

  it('the per-lesson rubric slice for the exam lesson is not empty', () => {
    const scoped = scopeDeliverableDataToLessons('rubrics', compiled.rubrics, [4]);
    expect(scoped.rubrics).toHaveLength(1);
    expect(scoped.rubrics[0].examHandoffNote).toBeTruthy();
    // The slice passes the thin-item gate — the file can never ship as a
    // title-only shell again.
    const validation = validateDeliverableGeneration('rubrics', scoped, { expectedLessonCount: 0 });
    expect(validation.blockers).toEqual([]);
  });

  it('alignment repair leaves handoff entries alone', () => {
    const result = normalizeRubricAssessmentAlignment(compiled.rubrics, courseMap, compiled.assignments);
    const preserved = result.data.rubrics.filter((rubric) => rubric.examHandoffNote);
    expect(preserved).toHaveLength(1);
    expect(preserved[0].taskDirections).toBe(preserved[0].examHandoffNote);
  });
});

// ── (3) lab twins are distinct, with no sets/python mixed residue ───────────

describe('code-lab twin distinctness (Lesson 2 proof + lab)', () => {
  const proofRubric = compiled.rubrics.rubrics.find(
    (rubric) => rubric.lessonNumber === 2 && /proof-based problem sets/i.test(rubric.title),
  );
  const labRubric = compiled.rubrics.rubrics.find(
    (rubric) => rubric.lessonNumber === 2 && /computational lab in python/i.test(rubric.title),
  );
  const proofBrief = compiled.assignments.assignments.find(
    (brief) => /proof-based problem sets/i.test(brief.title) && brief.lessonNumber === 2,
  );
  const labBrief = compiled.assignments.assignments.find(
    (brief) => /computational lab in python/i.test(brief.title) && brief.lessonNumber === 2,
  );

  it('both twins compiled', () => {
    expect(proofRubric).toBeTruthy();
    expect(labRubric).toBeTruthy();
    expect(proofBrief).toBeTruthy();
    expect(labBrief).toBeTruthy();
  });

  it('lab rubric criteria differ from the proof rubric and carry code-lab rows', () => {
    const labCriteria = labRubric.criteria.map((row) => row.criterion).join(' | ');
    const proofCriteria = proofRubric.criteria.map((row) => row.criterion).join(' | ');
    expect(labCriteria).not.toBe(proofCriteria);
    expect(labCriteria).toMatch(/correctness/i);
    expect(labCriteria).toMatch(/code clarity/i);
    expect(labCriteria).toMatch(/test evidence|verification/i);
    expect(proofCriteria).not.toMatch(/code clarity/i);
    const testEvidenceRow = labRubric.criteria.find((row) => /test evidence|verification/i.test(row.criterion));
    expect(testEvidenceRow.exemplary).toMatch(/verification run|assertion|hand-checked comparison/i);
    expect(testEvidenceRow.beginning).toMatch(/no inspectable verification evidence/i);
    expect(testEvidenceRow.performanceBandEvidence.commonPitfall).toMatch(
      /require an inspectable verification result/i,
    );
  });

  it('lab brief carries a distinct scaffold: environment, task, verification milestone', () => {
    const instructions = labBrief.instructions.join(' ');
    expect(instructions).toMatch(/computing environment/i);
    expect(instructions).toMatch(/test or verification milestone/i);
    const proofInstructions = proofBrief.instructions.join(' ');
    expect(proofInstructions).not.toMatch(/computing environment/i);
  });

  // Provenance/grounding subtrees quote the source map cell verbatim (both
  // twin titles) — honest documentation, excluded from the residue check.
  const PROVENANCE_KEYS = new Set([
    'blueprintGrounding',
    'sourceGrounding',
    'sourceEvidenceTrace',
    'weightProvenance',
    'gradingWeightProvenance',
  ]);
  const stripProvenance = (value) => {
    if (Array.isArray(value)) return value.map(stripProvenance);
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value)
          .filter(([key]) => !PROVENANCE_KEYS.has(key))
          .map(([key, item]) => [key, stripProvenance(item)]),
      );
    }
    return value;
  };

  it('no mixed residue: lab documents never reference the sibling proof sets, and vice versa', () => {
    const labText = JSON.stringify(stripProvenance(labRubric)) + JSON.stringify(stripProvenance(labBrief));
    expect(labText).not.toMatch(/problem sets/i);
    expect(labText).not.toMatch(/\bweek\s+2\s+sets\b/i);
    const proofText = JSON.stringify(stripProvenance(proofRubric)) + JSON.stringify(stripProvenance(proofBrief));
    expect(proofText).not.toMatch(/python/i);
  });

  it('the twins are not byte-level clones', () => {
    expect(JSON.stringify(labRubric)).not.toBe(JSON.stringify(proofRubric));
    expect(JSON.stringify(labBrief)).not.toBe(JSON.stringify(proofBrief));
  });
});

describe('Python topic identity is not enough to classify a policy assessment as a code lab', () => {
  const brief = pythonPolicyCompiled.assignments.assignments[0];
  const rubric = pythonPolicyCompiled.rubrics.rubrics[0];

  it('keeps the policy brief free of injected programming milestones', () => {
    expect(brief.title).toMatch(/Evidence explanation: Python and pandas/i);
    expect(JSON.stringify(brief)).not.toMatch(/computing environment|test or verification milestone|assertion/i);
    expect(rubric.criteria.map((row) => row.criterion).join(' | ')).not.toMatch(
      /correctness of computed|code clarity|test evidence/i,
    );
  });

  it('preserves conjunctions in compact evidence labels and never emits a truncated concept-map prefix', () => {
    const deck = pythonPolicyCompiled.slideDecks.decks[0];
    const deckText = JSON.stringify(deck);
    expect(deckText).not.toMatch(/Python pandas for public evidence brief/i);
    const conceptMap = deck.slides.find(
      (slide) => slide.visual?.kind === 'concept map' && Array.isArray(slide.visual?.spokes),
    );
    expect(conceptMap).toBeTruthy();
    expect(conceptMap.visual.hub).not.toBe('Python and pandas for public');
    expect(conceptMap.visual.hub).not.toMatch(/\b(?:and|or|for|of|the|a|an)$/i);
    expect(conceptMap.visual.hub.length).toBeLessThanOrEqual(36);
  });
});

// ── (4) one weight per brief, and the manifest agrees with the compile ──────

describe('single weight source', () => {
  it('every registry brief renders ONE weight: percentOfGrade equals the course-map stamp percent', () => {
    for (const brief of compiled.assignments.assignments) {
      expect(brief.courseMapRef).toContain(`· ${brief.weightPercent}%`);
      expect(brief.percentOfGrade).toBe(`${brief.weightPercent}%`);
    }
  });

  it('the grade-weight normalizer leaves registry-linked briefs alone (briefs intentionally sum < 100)', () => {
    const before = JSON.stringify(compiled.assignments);
    const result = normalizeAssignmentGradeWeights(compiled.assignments);
    expect(result.normalizedGradeWeights).toBe(false);
    expect(JSON.stringify(result.data)).toBe(before);
  });

  it('graded blueprint weights sum to 100 across briefs and the exam', () => {
    const total = blueprint.assessments.reduce((sum, assessment) => sum + assessment.weightPercent, 0);
    expect(total).toBe(100);
  });
});

describe('package manifest uses the bridged registry', () => {
  it('manifest weights and counts match the compile bridge (syllabus story)', async () => {
    const { renderCourseMapFromGraph } = await import('../courseGraph');
    const { buildCourseMaterialsZip } = await import('../packageZipExporter.js');
    const renderedMap = renderCourseMapFromGraph(graph, { assessmentReferences: true });
    const quizCompiled = compileBlueprintDeliverables(blueprint, ['quizBank']);
    const result = await buildCourseMaterialsZip({
      courseMap: renderedMap,
      courseName: 'Introduction to Linear Algebra',
      deliverables: {
        assignments: { status: 'done', data: compiled.assignments },
        rubrics: { status: 'done', data: compiled.rubrics },
        quizBank: { status: 'done', data: quizCompiled.quizBank },
      },
      featureIds: ['courseMap', 'assignments', 'rubrics', 'quizBank'],
      courseGraph: graph,
      quality: false,
    });
    const manifest = result.manifest;
    expect(Array.isArray(manifest.assessments)).toBe(true);

    // The bridged summary is the syllabus's story: graded rows sum to 100.
    expect(manifest.assessmentSummary).toBeTruthy();
    expect(manifest.assessmentSummary).toMatchObject({
      weightSource: 'compiler-distributed-draft',
      weightSourceStatus: 'compiler-distributed-draft',
      weightReviewRequired: true,
      weightConfirmationPolicy: expect.stringContaining('must be confirmed by the instructor'),
    });
    expect(manifest.assessmentSummary.gradedWeightTotal).toBe(100);
    expect(manifest.assessmentSummary.graded).toBe(blueprint.assessments.length);

    // Row-level agreement: every graded manifest row carries the same weight
    // the compiled brief/exam renders.
    const briefById = new Map(compiled.assignments.assignments.map((brief) => [brief.assessmentId, brief]));
    const blueprintById = new Map(blueprint.assessments.map((assessment) => [assessment.registryId, assessment]));
    const gradedRows = manifest.assessments.filter((entry) => entry.kind !== 'in-class');
    expect(gradedRows.length).toBe(blueprint.assessments.length);
    let manifestGradedTotal = 0;
    for (const row of gradedRows) {
      manifestGradedTotal += row.weightPct;
      const compiledWeight = briefById.get(row.id)?.weightPercent ?? blueprintById.get(row.id)?.weightPercent;
      expect(row.weightPct, `manifest weight disagrees with compile for ${row.id}`).toBe(compiledWeight);
      expect(row).toMatchObject({
        weightSource: 'compiler-distributed-draft',
        weightReviewRequired: true,
      });
    }
    expect(manifestGradedTotal).toBe(100);
  }, 120000);
});
