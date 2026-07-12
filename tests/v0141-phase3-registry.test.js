/**
 * v0.14.1 Phase 3 — the assessment registry (items 3.1, 3.2, 3.3) + 4.7.
 *
 * The v0.14 audit's structural finding: the blueprint minted ONE assessment
 * per lesson from lesson.studentArtifact while the course map promised ~4 —
 * Geology's "Midterm Exam: minerals through metamorphic rocks" and
 * comprehensive final existed nowhere downstream, Mandarin's "Final Oral
 * Performance" had no brief and no rubric, CS map atoms were orphans.
 *
 * Phase 3 makes the registry (deriveFromCourseMap) the single assessment
 * identity: every graded entry gets a brief with its VERBATIM map title,
 * kind 'exam' compiles a real exam document into the quiz bank, kind 'oral'
 * gets a prompt sheet + speaking rubric, kind 'in-class' is listed in the
 * lesson plan and named in the study guide. Every render shows the same
 * identity (map reference suffixes, brief reverse stamps, id-prefixed
 * syllabus rows, manifest registry), and the Phase 2.5 reconciliation gate
 * now RESOLVES by construction.
 */
import { describe, expect, it } from 'vitest';

import {
  buildCourseBlueprint,
  compactBlueprintForStorage,
  compileBlueprintDeliverables,
} from '../src/lib/courseBlueprintCompiler';
import {
  buildBlueprintFromGraph,
  classifyAssessmentKind,
  deriveCourseGraphFromCourseMap,
  renderCourseMapFromGraph,
  validateCourseGraph,
} from '../src/lib/courseGraph';
import { repairCourseMapReadiness } from '../src/lib/deliverableReadiness';
import { buildAssessmentReconciliationIssues } from '../src/lib/packageFinalizer.js';

// ── Fixtures ────────────────────────────────────────────────────────────────

const GEOLOGY_TOPICS = [
  ['Minerals', 'mineral identification'],
  ['Igneous Rocks', 'igneous textures'],
  ['Sedimentary Rocks', 'sedimentary environments'],
  ['Metamorphic Rocks', 'metamorphic grade'],
  ['Weathering and Erosion', 'weathering rates'],
  ['Geologic Time', 'relative dating'],
];

/** Geology-like course: lessons 1-6 each carry a quiz; lesson 7 carries the
 *  audit's four map atoms across sections 7.1 and 7.2. */
function geologyCourseMap() {
  const lessons = GEOLOGY_TOPICS.map(([title, concept], index) => ({
    title: `Lesson ${index + 1}: ${title}`,
    sections: [
      {
        topicSection: `${index + 1}.1: ${title}`,
        learningGoals: `1. Build field-ready understanding of ${concept}.`,
        learningObjectives: `Analyze ${concept} using specimen evidence.\nEvaluate how ${concept} changes a field decision.`,
        weeklyAssessments: `Quiz: ${concept} problems`,
        asyncActivities: `Read the assigned chapter on ${title.toLowerCase()}.`,
        syncActivities: `Workshop: ${concept} case analysis.`,
        supportingResources: `OpenStax geology chapter on ${title.toLowerCase()}`,
      },
    ],
  }));
  lessons.push({
    title: 'Lesson 7: Plate Tectonics and Structural Geology',
    sections: [
      {
        topicSection: '7.1: Plate Boundaries',
        learningGoals: '1. Connect plate boundary types to surface evidence.',
        learningObjectives:
          'Analyze plate boundary evidence from maps and profiles.\nEvaluate boundary classifications against seismic data.',
        weeklyAssessments: 'Quiz: plate boundary evidence\nMap Activity: boundary identification',
        asyncActivities: 'Read the plate tectonics chapter.',
        syncActivities: 'Workshop: boundary classification cases.',
        supportingResources: 'OpenStax geology chapter on plate tectonics',
      },
      {
        topicSection: '7.2: Faults and Folds',
        learningGoals: '1. Read deformation structures from outcrop sketches.',
        learningObjectives:
          'Analyze fault and fold geometry from cross-sections.\nEvaluate deformation histories from structural evidence.',
        weeklyAssessments: 'Midterm Exam: minerals through metamorphic rocks\nSketch Exercise: faults and folds',
        asyncActivities: 'Review structural geology notes.',
        syncActivities: 'Workshop: cross-section interpretation.',
        supportingResources: 'OpenStax geology chapter on crustal deformation',
      },
    ],
  });
  return { courseName: 'Physical Geology', semester: 'Fall 2026', lessons };
}

/** Mandarin-like course whose final lesson promises the oral performance the
 *  v0.14 audit shipped without a brief or rubric. */
function mandarinCourseMap() {
  const base = ['Pinyin and Tones', 'Greetings and Introductions', 'Family and Numbers'].map((title, index) => ({
    title: `Lesson ${index + 1}: ${title}`,
    sections: [
      {
        topicSection: `${index + 1}.1: ${title}`,
        learningGoals: `1. Use ${title.toLowerCase()} in short exchanges.`,
        learningObjectives: `Apply ${title.toLowerCase()} vocabulary in dialogue.\nEvaluate tone accuracy in pair practice.`,
        weeklyAssessments: `Quiz: ${title.toLowerCase()} vocabulary`,
        asyncActivities: `Listen to the ${title.toLowerCase()} audio set.`,
        syncActivities: `Pair drill: ${title.toLowerCase()} exchanges.`,
        supportingResources: `Course audio packet for ${title.toLowerCase()}`,
      },
    ],
  }));
  base.push({
    title: 'Lesson 4: Course Review and Performance',
    sections: [
      {
        topicSection: '4.1: Oral Assessment Preparation',
        learningGoals: '1. Sustain a short conversation using course vocabulary.',
        learningObjectives:
          'Apply learned vocabulary in spontaneous spoken exchanges.\nEvaluate pronunciation against tone models.',
        weeklyAssessments: 'Final Oral Performance\nDialogue practice check',
        asyncActivities: 'Rehearse the dialogue bank recordings.',
        syncActivities: 'Mock performance with peer feedback.',
        supportingResources: 'Course dialogue bank and tone models',
      },
    ],
  });
  return { courseName: 'Elementary Mandarin Chinese I', semester: 'Fall 2026', lessons: base };
}

const FEATURES = ['syllabus', 'lessonPlans', 'assignments', 'rubrics', 'quizBank', 'studyGuides'];

function compileFromMap(courseMap) {
  const graph = deriveCourseGraphFromCourseMap(courseMap);
  const blueprint = buildBlueprintFromGraph(graph);
  return { graph, blueprint, compiled: compileBlueprintDeliverables(blueprint, FEATURES) };
}

// Mirror of the output-artifact gate's fused-title detectors — the registry
// path must never reintroduce the interior-lowercase fusion class.
const FUSED_TITLE_RES = [/\b[A-Z][a-z]+ and [a-z]+ [A-Z][a-z]+/, /: [a-z][a-z ]+ and [a-z]+ [A-Z][a-z]+/];

// ── (1) 3.1 — registry derivation: ids, kinds, weights ─────────────────────

describe('3.1 — registry schema (derive)', () => {
  const graph = deriveCourseGraphFromCourseMap(geologyCourseMap());
  const lessonSeven = graph.assessments.filter((assessment) => assessment.dueSession === 7);

  it('derives all four Lesson 7 map atoms with stable ids A7.1–A7.4', () => {
    expect(lessonSeven.map((assessment) => assessment.id)).toEqual(['A7.1', 'A7.2', 'A7.3', 'A7.4']);
    expect(lessonSeven.map((assessment) => assessment.title)).toEqual([
      'Quiz: plate boundary evidence',
      'Map Activity: boundary identification',
      'Midterm Exam: minerals through metamorphic rocks',
      'Sketch Exercise: faults and folds',
    ]);
  });

  it('classifies kinds: graded quiz, in-class activities, exam', () => {
    expect(lessonSeven[0].kind).toBe('graded-artifact');
    // The map activity may legitimately classify as in-class or graded.
    expect(['in-class', 'graded-artifact']).toContain(lessonSeven[1].kind);
    expect(lessonSeven[2].kind).toBe('exam');
    expect(lessonSeven[3].kind).toBe('in-class');
    expect(classifyAssessmentKind('Final Oral Performance')).toBe('oral');
    expect(classifyAssessmentKind('Final Exam: comprehensive assessment')).toBe('exam');
    expect(classifyAssessmentKind('Lesson 1 evidence check: Learning (25%)')).toBe('graded-artifact');
    expect(classifyAssessmentKind('Quick evidence check: apply conditioning to a new example.')).toBe('in-class');
    expect(classifyAssessmentKind('Exit ticket using encoding to justify one course-relevant decision.')).toBe(
      'in-class',
    );
    expect(classifyAssessmentKind('Practice response that names the evidence needed for decision making.')).toBe(
      'in-class',
    );
  });

  it('v0.14.1 round 2: exam kind requires the exam noun as the operative head (live CS Round-2 atoms)', () => {
    // The live Round-2 misclassification: a PRACTICE artifact got exam kind,
    // 5% exam weight, and a full compiled exam paper on the bare \bmidterm\b.
    expect(classifyAssessmentKind('Practice Set: midterm preparation')).toBe('graded-artifact');
    expect(classifyAssessmentKind('Midterm Exam: cumulative assessment')).toBe('exam');
    // Prep/review/readiness/study qualifiers force graded-artifact…
    expect(classifyAssessmentKind('Midterm prep worksheet')).toBe('graded-artifact');
    expect(classifyAssessmentKind('Final readiness checklist')).toBe('graded-artifact');
    expect(classifyAssessmentKind('Midterm study guide')).toBe('graded-artifact');
    expect(classifyAssessmentKind('Post-Exam Reflection: strengths and gaps')).toBe('graded-artifact');
    expect(classifyAssessmentKind('Proof-based problem set: review and final exam')).toBe('graded-artifact');
    expect(classifyAssessmentKind('Computational lab in Python: midterm review')).toBe('graded-artifact');
    // …and a review session is an in-class activity, not a graded artifact.
    expect(classifyAssessmentKind('Final Exam Review Session')).toBe('in-class');
    // Standalone "Midterm"/"Final" is still the exam itself.
    expect(classifyAssessmentKind('Midterm')).toBe('exam');
    expect(classifyAssessmentKind('Final (25%)')).toBe('exam');
    // Another artifact noun as the head keeps its own kind.
    expect(classifyAssessmentKind('Final Project: integration milestone')).toBe('graded-artifact');
    expect(classifyAssessmentKind('Final Essay: comparative analysis')).toBe('graded-artifact');
    expect(classifyAssessmentKind('Final revisions annotation: research detail to design choice.')).toBe(
      'graded-artifact',
    );
    expect(classifyAssessmentKind('Final prototype studio defense: prototype move and evidence.')).toBe(
      'graded-artifact',
    );
  });

  it('v0.15.145 UX: final revision artifacts do not become fake quiz-bank exams', () => {
    const graph = deriveCourseGraphFromCourseMap({
      courseName: 'User Experience Design Studio',
      lessons: [
        {
          title: 'Lesson 10: Final testing',
          sections: [
            {
              topicSection: '10.1: final testing',
              learningObjectives: 'Use test evidence to prioritize final revisions.',
              weeklyAssessments:
                'Usability testing labs annotation: research detail to design choice.\nFinal revisions annotation: research detail to design choice.',
            },
          ],
        },
        {
          title: 'Lesson 11: Presentation preparation',
          sections: [
            {
              topicSection: '11.1: presentation preparation',
              learningObjectives: 'Defend a prototype decision with user evidence.',
              weeklyAssessments:
                'Portfolio-ready deliverables studio defense: prototype move and evidence.\nFinal prototype studio defense: prototype move and evidence.',
            },
          ],
        },
      ],
    });

    expect(graph.assessments.map((assessment) => [assessment.title, assessment.kind])).toEqual([
      ['Usability testing labs annotation: research detail to design choice.', 'graded-artifact'],
      ['Final revisions annotation: research detail to design choice.', 'graded-artifact'],
      ['Portfolio-ready deliverables studio defense: prototype move and evidence.', 'graded-artifact'],
      ['Final prototype studio defense: prototype move and evidence.', 'graded-artifact'],
    ]);

    const blueprint = buildBlueprintFromGraph(graph);
    const compiled = compileBlueprintDeliverables(blueprint, ['assignments', 'quizBank']);

    expect(compiled.quizBank.quizzes.some((quiz) => quiz.kind === 'exam')).toBe(false);
    const assignmentTitles = compiled.assignments.assignments.map((assignment) => assignment.title);
    expect(assignmentTitles).toContain('Final revisions annotation: research detail to design choice.');
    expect(assignmentTitles).toContain('Final prototype studio defense: prototype move and evidence.');
  });

  it('keeps the sum-to-100 invariant with in-class entries at zero weight', () => {
    const total = graph.assessments.reduce((sum, assessment) => sum + (assessment.weightPct || 0), 0);
    expect(total).toBe(100);
    expect(lessonSeven[3].weightPct).toBe(0);
    // Exam-heavy: the midterm outweighs the same lesson's quiz.
    expect(lessonSeven[2].weightPct).toBeGreaterThan(lessonSeven[0].weightPct);
    // The lesson's graded entries account for exactly the lesson allocation
    // (whatever was not distributed to lessons 1-6).
    const otherLessons = graph.assessments
      .filter((assessment) => assessment.dueSession !== 7)
      .reduce((sum, assessment) => sum + (assessment.weightPct || 0), 0);
    const lessonSevenTotal = lessonSeven.reduce((sum, assessment) => sum + (assessment.weightPct || 0), 0);
    expect(otherLessons + lessonSevenTotal).toBe(100);
  });

  it('validates (kind whitelist) and serializes without nested arrays (Firestore rule)', () => {
    expect(validateCourseGraph(graph).valid).toBe(true);
    const offenders = [];
    const walk = (node, path) => {
      if (Array.isArray(node)) {
        node.forEach((item, index) => {
          if (Array.isArray(item)) offenders.push(`${path}[${index}]`);
          walk(item, `${path}[${index}]`);
        });
      } else if (node && typeof node === 'object') {
        for (const [key, value] of Object.entries(node)) walk(value, `${path}.${key}`);
      }
    };
    walk(graph, '$');
    expect(offenders, offenders.join(', ')).toEqual([]);

    const broken = deriveCourseGraphFromCourseMap(geologyCourseMap());
    broken.assessments[0].kind = 'mystery-kind';
    expect(validateCourseGraph(broken).issues.some((issue) => issue.code === 'invalid-assessment-kind')).toBe(true);
  });
});

// ── (2) 3.2 — compiler consumes the registry ───────────────────────────────

describe('3.2 — compiler consumes the registry (Geology)', () => {
  const { graph, blueprint, compiled } = compileFromMap(geologyCourseMap());

  it('gives a quiz-only lesson a brief with the VERBATIM registry title', () => {
    const titles = compiled.assignments.assignments.map((brief) => brief.title);
    expect(titles).toContain('Quiz: plate boundary evidence');
    // The pre-registry fusion shape never ships again.
    expect(titles.some((title) => /and map activity/i.test(title))).toBe(false);
  });

  it('ships no fused interior-lowercase titles anywhere in briefs, rubrics, or the grading table', () => {
    const surfaces = [
      ...compiled.assignments.assignments.map((brief) => brief.title),
      ...compiled.rubrics.rubrics.map((rubric) => rubric.title),
      ...compiled.syllabus.syllabus.courseRequirements.map((row) => row.name),
    ];
    for (const text of surfaces) {
      for (const pattern of FUSED_TITLE_RES) {
        expect(pattern.test(text), `fused title shipped: "${text}"`).toBe(false);
      }
    }
  });

  it('compiles the midterm into a REAL exam document: >=10 items, answer key, lessons 1–6 coverage', () => {
    const exam = compiled.quizBank.quizzes.find((quiz) => quiz.kind === 'exam');
    expect(exam).toBeTruthy();
    expect(exam.lessonTitle).toBe('Midterm Exam — minerals through metamorphic rocks');
    expect(exam.assessmentId).toBe('A7.3');
    expect(exam.lessonNumber).toBe(7);
    expect(exam.examScope).toContain('Lessons 1–6');
    expect(exam.questions.length).toBeGreaterThanOrEqual(10);
    // Mixed item types with a complete answer key.
    const types = new Set(exam.questions.map((question) => question.type));
    expect(types.has('multiple_choice')).toBe(true);
    expect(types.has('short_answer')).toBe(true);
    expect(types.has('essay')).toBe(true);
    expect(exam.answerKey).toHaveLength(exam.questions.length);
    // Every item is keyable: a letter answer or a scoring guide (essays key
    // on rubric hints, like the weekly bank's essay frames).
    for (const question of exam.questions) {
      expect(
        String(question.answer || question.rubricHints || question.sampleAnswer || '').length,
        `unkeyed exam item: ${question.id}`,
      ).toBeGreaterThan(0);
    }
    for (const entry of exam.answerKey) {
      expect(String(entry.answer || '').length).toBeGreaterThan(0);
    }
    // Items draw on the covered lessons' material, not the exam-week lesson:
    // every covered topic concept appears somewhere in the paper.
    const paper = JSON.stringify(exam.questions);
    const coveredHits = GEOLOGY_TOPICS.filter(([, concept]) => paper.includes(concept)).length;
    expect(coveredHits).toBeGreaterThanOrEqual(5);
    // Exam items never duplicate weekly-quiz stems verbatim.
    const weeklyStems = new Set(
      compiled.quizBank.quizzes
        .filter((quiz) => quiz.kind !== 'exam')
        .flatMap((quiz) => quiz.questions.map((question) => question.question)),
    );
    for (const question of exam.questions) {
      expect(weeklyStems.has(question.question), `exam duplicated weekly stem: ${question.question}`).toBe(false);
    }
  });

  it('keeps exams out of the brief and rubric sets (answer keys, not rubrics)', () => {
    expect(compiled.assignments.assignments.some((brief) => /Midterm Exam/i.test(brief.title))).toBe(false);
    // v0.16.1: the exam's rubric slot is a short answer-key handoff note
    // (so the per-lesson rubric file is never an empty shell) — never a
    // criterion rubric.
    const examEntries = compiled.rubrics.rubrics.filter((rubric) => /Midterm Exam/i.test(rubric.title));
    expect(examEntries.length).toBeGreaterThan(0);
    for (const entry of examEntries) {
      expect(entry.examHandoffNote).toMatch(/answer key lives in the Quiz & Exam Bank/i);
      expect(entry.criteria).toBeUndefined();
    }
    // Rubrics attach per graded assessment id.
    const quizRubric = compiled.rubrics.rubrics.find((rubric) => rubric.title.startsWith('Quiz: plate boundary'));
    expect(quizRubric.assessmentId).toBe('A7.1');
    expect(quizRubric.criteria.length).toBeGreaterThan(0);
  });

  it('lists in-class items in the lesson plan assessment block and names them in the study guide', () => {
    const planSeven = compiled.lessonPlans.lessonPlans.find((plan) => /Lesson 7/.test(plan.lessonTitle));
    expect(planSeven.assessmentBlock).toBeTruthy();
    const blockTitles = planSeven.assessmentBlock.map((entry) => entry.title);
    expect(blockTitles).toContain('Sketch Exercise: faults and folds');
    const sketch = planSeven.assessmentBlock.find((entry) => entry.title.startsWith('Sketch Exercise'));
    expect(sketch.kind).toBe('in-class');
    expect(sketch.weight).toBe('in class');
    const guideSeven = compiled.studyGuides.studyGuides.find((guide) => /Lesson 7/.test(guide.lessonTitle));
    expect(guideSeven.examScope).toContain('In-class checks this week:');
    expect(guideSeven.examScope).toContain('Sketch Exercise: faults and folds');
  });

  it('falls back to legacy behavior when no graph/registry exists', () => {
    const legacy = buildCourseBlueprint(geologyCourseMap());
    // One minted anchor per lesson — the pre-registry shape the existing
    // suites pin in detail; assert the head count here.
    expect(legacy.assessments).toHaveLength(7);
    expect(legacy.assessments.every((assessment) => assessment.kind === undefined)).toBe(true);
    expect(legacy.assessmentRegistry).toBeUndefined();
  });

  it('registry blueprint carries the graded subset with registry identity', () => {
    expect(blueprint.assessments.length).toBe(graph.assessments.filter((a) => a.kind !== 'in-class').length);
    const ids = blueprint.assessments.map((assessment) => assessment.registryId);
    expect(ids).toContain('A7.1');
    expect(ids).toContain('A7.3');
    expect(ids).not.toContain('A7.4');
  });
});

// ── (3) 3.2c — the Mandarin oral: prompt sheet + speaking rubric ───────────

describe('3.2c — oral performance compiles a prompt sheet and speaking rubric (Mandarin)', () => {
  const { graph, blueprint, compiled } = compileFromMap(mandarinCourseMap());

  it('classifies the final oral as kind oral in the registry', () => {
    const oral = graph.assessments.find((assessment) => assessment.title === 'Final Oral Performance');
    expect(oral.kind).toBe('oral');
    expect(oral.weightPct).toBeGreaterThan(0);
  });

  it('compiles an oral prompt sheet with speaking tasks built from lesson content', () => {
    const sheet = compiled.assignments.assignments.find((brief) => brief.title === 'Final Oral Performance');
    expect(sheet).toBeTruthy();
    expect(sheet.assignmentType).toBe('Oral performance prompt sheet');
    expect(Array.isArray(sheet.speakingPrompts)).toBe(true);
    expect(sheet.speakingPrompts.length).toBeGreaterThanOrEqual(3);
    expect(sheet.speakingPrompts.join(' ')).toMatch(/follow-up question/i);
  });

  it('attaches a speaking rubric (pronunciation / fluency / vocabulary / task completion)', () => {
    const rubric = compiled.rubrics.rubrics.find((entry) => entry.title === 'Final Oral Performance Rubric');
    expect(rubric).toBeTruthy();
    expect(rubric.assessmentType).toBe('Oral performance (speaking rubric)');
    const criteria = rubric.criteria.map((criterion) => criterion.criterion).join(' | ');
    expect(criteria).toMatch(/pronunciation/i);
    expect(criteria).toMatch(/fluency/i);
    expect(criteria).toMatch(/vocabulary/i);
    expect(criteria).toMatch(/task completion/i);
  });

  it('the practice check still gets its own brief — two artifacts, one lesson', async () => {
    const lastLessonBriefs = compiled.assignments.assignments.filter((brief) => brief.dueWeek === 'Week 4');
    expect(lastLessonBriefs.map((brief) => brief.title).sort()).toEqual(
      ['Dialogue practice check', 'Final Oral Performance'].sort(),
    );
    // Zip naming stays per-lesson: the lesson's single Assignment Briefs
    // docx carries BOTH briefs (lesson-aware scoping routes registry items
    // by their own lessonNumber), so no per-assessment file split or slug
    // is needed and nothing collides.
    const { scopeDeliverableDataToLessons } = await import('../src/lib/deliverableReadiness');
    const scoped = scopeDeliverableDataToLessons('assignments', compiled.assignments, [3]);
    expect(scoped.assignments.map((brief) => brief.title).sort()).toEqual(
      ['Dialogue practice check', 'Final Oral Performance'].sort(),
    );
    // And other lessons' files keep exactly their own brief.
    const scopedFirst = scopeDeliverableDataToLessons('assignments', compiled.assignments, [0]);
    expect(scopedFirst.assignments).toHaveLength(1);
    expect(scopedFirst.assignments[0].dueWeek).toBe('Week 1');
  });

  it('reconciliation gate: ZERO high-stakes warnings for the Mandarin package', () => {
    const issues = buildAssessmentReconciliationIssues({ courseGraph: graph, blueprint });
    expect(issues.filter((issue) => issue.severity !== 'info')).toEqual([]);
  });
});

// ── (4) 3.3 — one identity in all renders ──────────────────────────────────

describe('3.3 — every render shows the registry identity', () => {
  const { graph, compiled } = compileFromMap(geologyCourseMap());
  const displayMap = renderCourseMapFromGraph(graph, { assessmentReferences: true });
  const sectionOne = displayMap.lessons[6].sections[0];
  const sectionTwo = displayMap.lessons[6].sections[1];

  it('map cells render registry titles with deliverable reference suffixes', () => {
    expect(sectionOne.weeklyAssessments).toContain('Quiz: plate boundary evidence → Assignment Briefs / Lesson 07');
    expect(sectionTwo.weeklyAssessments).toContain(
      'Midterm Exam: minerals through metamorphic rocks → Quiz & Exam Bank',
    );
    // In-class items render plain — no arrow.
    const sketchLine = sectionTwo.weeklyAssessments.split('\n').find((line) => line.includes('Sketch Exercise'));
    expect(sketchLine).not.toContain('→');
  });

  it('the readiness repair pass tolerates the reference suffixes', () => {
    const repaired = repairCourseMapReadiness({ courseMap: displayMap });
    const cell = (repaired.courseMap || displayMap).lessons[6].sections[0].weeklyAssessments;
    expect(cell).toContain('→ Assignment Briefs / Lesson 07');
  });

  it('re-deriving a displayed map strips the suffixes (no drift, stable ids)', () => {
    const rederived = deriveCourseGraphFromCourseMap(displayMap);
    const lessonSeven = rederived.assessments.filter((assessment) => assessment.dueSession === 7);
    expect(lessonSeven.map((assessment) => assessment.title)).toEqual([
      'Quiz: plate boundary evidence',
      'Map Activity: boundary identification',
      'Midterm Exam: minerals through metamorphic rocks',
      'Sketch Exercise: faults and folds',
    ]);
    expect(lessonSeven.map((assessment) => assessment.id)).toEqual(['A7.1', 'A7.2', 'A7.3', 'A7.4']);
  });

  it('briefs carry the reverse stamp "Course Map L7 · A7.1 · N%"', () => {
    const brief = compiled.assignments.assignments.find((entry) => entry.title === 'Quiz: plate boundary evidence');
    expect(brief.courseMapRef).toMatch(/^Course Map L7 · A7\.1 · \d+%$/);
    expect(brief.assessmentId).toBe('A7.1');
    expect(brief.lessonNumber).toBe(7);
  });

  it('the syllabus grading table renders "id — title" rows summing to 100', () => {
    const rows = compiled.syllabus.syllabus.courseRequirements;
    for (const row of rows) {
      expect(row.name).toMatch(/^A\d+\.\d+ — /);
    }
    const total = rows.reduce((sum, row) => sum + Number(String(row.weight).replace('%', '')), 0);
    expect(total).toBe(100);
    expect(rows.some((row) => row.name === 'A7.3 — Midterm Exam: minerals through metamorphic rocks')).toBe(true);
  });
});

// ── (5) the headline fix: the Phase 2.5 gate resolves by construction ──────

describe('2.5 gate resolves on the registry path (the audit headline)', () => {
  it('Geology: the phantom midterm now resolves — zero high-stakes warnings', () => {
    const { graph, blueprint } = compileFromMap(geologyCourseMap());
    const issues = buildAssessmentReconciliationIssues({ courseGraph: graph, blueprint });
    expect(issues.filter((issue) => issue.severity !== 'info')).toEqual([]);
    // In-class atoms remain a quiet info aggregate (legitimately brief-less).
    const info = issues.filter((issue) => issue.severity === 'info');
    expect(info.length).toBeLessThanOrEqual(1);
  });

  it('resolves against the compiled deliverable surfaces too (finalizer call-site shape)', () => {
    const { graph, compiled } = compileFromMap(geologyCourseMap());
    const deliverables = {
      assignments: { status: 'done', data: compiled.assignments },
      rubrics: { status: 'done', data: compiled.rubrics },
      syllabus: { status: 'done', data: compiled.syllabus },
    };
    const issues = buildAssessmentReconciliationIssues({ courseGraph: graph, deliverables });
    expect(issues.filter((issue) => issue.severity !== 'info')).toEqual([]);
  });

  it('bridges a richer visible Course Map registry into native graph compiles', () => {
    const nativeMap = {
      courseName: 'UX Studio',
      lessons: [
        {
          title: 'Lesson 1: Design rationale and case study development',
          sections: [
            {
              topicSection: '1.1: design rationale',
              learningGoals: 'Build a portfolio-ready design rationale.',
              learningObjectives: 'Defend one prototype move with evidence.',
              weeklyAssessments: 'Design rationale studio checkpoint: defend one prototype move with evidence.',
              asyncActivities: 'Review prototype notes.',
              syncActivities: 'Critique one rationale move.',
              supportingResources: 'Portfolio case excerpt',
            },
          ],
        },
      ],
    };
    const visibleMap = {
      ...nativeMap,
      lessons: [
        {
          ...nativeMap.lessons[0],
          sections: [
            nativeMap.lessons[0].sections[0],
            {
              topicSection: '1.2: final UX case study portfolio',
              learningGoals: 'Use portfolio evidence to improve the final case study.',
              learningObjectives: 'Defend one case-study move with evidence.',
              weeklyAssessments:
                'Final UX case study portfolio studio checkpoint: defend one prototype or case-study move with evidence.',
              asyncActivities: 'Review portfolio evidence.',
              syncActivities: 'Critique the case-study move.',
              supportingResources: 'Portfolio case excerpt',
            },
            {
              topicSection: '1.3: project synthesis',
              learningGoals: 'Synthesize project evidence into one design argument.',
              learningObjectives: 'Defend one synthesis move with evidence.',
              weeklyAssessments:
                'Project synthesis studio checkpoint: defend one prototype or case-study move with evidence.',
              asyncActivities: 'Review synthesis notes.',
              syncActivities: 'Critique the synthesis move.',
              supportingResources: 'Portfolio case excerpt',
            },
          ],
        },
      ],
    };
    const nativeGraph = deriveCourseGraphFromCourseMap(nativeMap);
    const visibleGraph = deriveCourseGraphFromCourseMap(visibleMap);

    expect(nativeGraph.assessments).toHaveLength(1);
    expect(visibleGraph.assessments).toHaveLength(3);

    const blueprint = compactBlueprintForStorage(
      buildBlueprintFromGraph(nativeGraph, {
        assessmentRegistry: visibleGraph.assessments,
      }),
    );
    const compiled = compileBlueprintDeliverables(blueprint, ['assignments']);
    const assignmentTitles = compiled.assignments.assignments.map((assignment) => assignment.title);

    expect(assignmentTitles).toEqual([
      'Design rationale studio checkpoint: defend one prototype move with evidence.',
      'Final UX case study portfolio studio checkpoint: defend one prototype or case-study move with evidence.',
      'Project synthesis studio checkpoint: defend one prototype or case-study move with evidence.',
    ]);
    expect(compiled.assignments.assignments.map((assignment) => assignment.courseMapRef)).toEqual([
      'Course Map L1 · A1.1 · 34%',
      'Course Map L1 · A1.2 · 33%',
      'Course Map L1 · A1.3 · 33%',
    ]);

    const issues = buildAssessmentReconciliationIssues({
      courseGraph: visibleGraph,
      deliverables: { assignments: { status: 'done', data: compiled.assignments } },
    });
    expect(issues).toEqual([]);
  });
});

// ── (6) lesson-aware scoping + manifest registry ────────────────────────────

describe('3.3d — package manifest carries the registry; per-lesson files route N briefs', () => {
  it('scopes multiple briefs and the exam into their lesson files and maps them in the manifest', async () => {
    const { graph, compiled } = compileFromMap(geologyCourseMap());
    const { buildCourseMaterialsZip } = await import('../src/lib/packageZipExporter.js');
    const courseMap = renderCourseMapFromGraph(graph, { assessmentReferences: true });
    const result = await buildCourseMaterialsZip({
      courseMap,
      courseName: 'Physical Geology',
      deliverables: {
        assignments: { status: 'done', data: compiled.assignments },
        quizBank: { status: 'done', data: compiled.quizBank },
      },
      featureIds: ['courseMap', 'assignments', 'quizBank'],
      courseGraph: graph,
    });
    const manifest = result.manifest;
    expect(Array.isArray(manifest.assessments)).toBe(true);
    const byId = new Map(manifest.assessments.map((entry) => [entry.id, entry]));
    expect(byId.get('A7.1')).toMatchObject({ kind: 'graded-artifact', lesson: 7 });
    expect(byId.get('A7.1').artifact).toMatch(/^Assignment Briefs\/Lesson 07 .*\.docx$/);
    expect(byId.get('A7.3')).toMatchObject({
      kind: 'exam',
      lesson: 7,
      title: 'Midterm Exam: minerals through metamorphic rocks',
    });
    expect(byId.get('A7.3').artifact).toMatch(/^Quiz & Exam Bank\/Lesson 07 .*\.docx$/);
    expect(byId.get('A7.4').kind).toBe('in-class');
    expect(byId.get('A7.4').note).toContain('in-class');
    // Weight metadata rides along.
    expect(byId.get('A7.3').weightPct).toBeGreaterThan(0);
  }, 120000);
});

// ── (7) 4.7 — expert-slide recap variant on repeat concepts ────────────────

describe('4.7 — "How Experts Think" recap variant instead of silent drop', () => {
  const scaffold = {
    term: 'opportunity cost',
    archetypeName: 'Constrained Optimization',
    moves: [
      'name the constraint that binds the decision',
      'list the alternatives forgone under that constraint',
      'choose by comparing against the next-best alternative',
    ],
  };
  const courseMap = {
    courseName: 'Principles of Microeconomics',
    lessons: [1, 2].map((n) => ({
      title: `Lesson ${n}: Opportunity Cost ${n === 1 ? 'Foundations' : 'Applications'}`,
      sections: [
        {
          topicSection: `${n}.1: Opportunity Cost`,
          learningGoals: '1. Reason about tradeoffs with evidence.',
          learningObjectives: `Analyze opportunity cost in decision ${n}.\nEvaluate tradeoffs with market evidence.`,
          weeklyAssessments: `Problem set ${n}: opportunity cost analysis`,
          asyncActivities: 'Read the scarcity chapter.',
          syncActivities: 'Workshop a pricing case.',
          supportingResources: 'OpenStax microeconomics chapter',
        },
      ],
    })),
  };
  const blueprint = buildCourseBlueprint(courseMap, {
    enrichment: {
      lessonContent: {
        'lesson-1': { reasoningScaffolds: [scaffold] },
        'lesson-2': { reasoningScaffolds: [scaffold] },
      },
    },
  });
  const compiled = compileBlueprintDeliverables(blueprint, ['slideDecks']);

  it('renders the full slide once and a 3-bullet recap on the repeat occurrence', () => {
    const [deckOne, deckTwo] = compiled.slideDecks.decks;
    const full = deckOne.slides.find((slide) => slide.title === 'How Experts Think: opportunity cost');
    expect(full).toBeTruthy();
    const recap = deckTwo.slides.find((slide) => slide.title === 'How Experts Think: opportunity cost — recap');
    expect(recap).toBeTruthy();
    expect(recap.enrichmentSource).toBe('archetype-reasoning-recap');
    expect(recap.bullets.length).toBeLessThanOrEqual(3);
    expect(recap.bullets.length).toBeGreaterThanOrEqual(2);
    // Compressed retrieval bullets: short, never output-gate truncation bait
    // (>= 60 chars ending in a bare lowercase word).
    for (const bullet of recap.bullets) {
      expect(bullet.length).toBeLessThan(60);
    }
    // The first deck never renders a recap; the second never repeats the
    // full variant.
    expect(deckOne.slides.some((slide) => /recap/i.test(slide.title || ''))).toBe(false);
    expect(deckTwo.slides.some((slide) => slide.title === 'How Experts Think: opportunity cost')).toBe(false);
  });
});
