// v0.15.187 — one assessment-kind classifier everywhere (live crucible catch).
//
// The July 2 live smoke round failed 74/C with a P0: "registered exam
// artifact contains no exam content". Root: the CourseIR normalizer
// defaulted unknown kinds to 'graded-artifact' even for exam-titled
// assessments, and compileQuizBank's exam filter trusted the stored kind —
// while the export manifest re-derived kinds from titles via
// classifyAssessmentKind and told the grader to expect an exam paper.
// Compile-time and manifest-time must use the SAME classifier.
import { describe, expect, it } from 'vitest';
import { classifyAssessmentKind, deriveCourseGraphFromCourseMap } from '../src/lib/courseGraph/deriveFromCourseMap.js';
import { buildBlueprintFromGraph } from '../src/lib/courseGraph/blueprintFromGraph.js';
import { buildCourseBlueprint, compileBlueprintDeliverables } from '../src/lib/courseBlueprintCompiler';
import { dedupeNumberedAssessmentEcho } from '../src/lib/compilerText.js';
import { repairCourseMapReadiness } from '../src/lib/deliverableReadiness.js';

const LONG_EXAM_TITLE =
  'Midterm exam edge-case probe: choose one boundary input and explain the result before running the code';

const COURSE = {
  courseName: 'Intro to Python Programming',
  lessons: Array.from({ length: 12 }, (_, i) => ({
    title: `Lesson ${i + 1}: Python Topic ${i + 1}`,
    sections: [
      {
        topicSection: `${i + 1}.1: Loops and functions ${i + 1}`,
        learningGoals: `Write small programs using topic ${i + 1}.`,
        learningObjectives: `Trace and debug code for topic ${i + 1}.`,
        weeklyAssessments: i === 10 ? LONG_EXAM_TITLE : `Code lab ${i + 1} with a debugging trace`,
        asyncActivities: 'Read the chapter.',
        syncActivities: 'Pair programming lab.',
        supportingResources: 'Python textbook chapter',
      },
    ],
  })),
};

describe('exam kind classification is consistent compile-to-manifest', () => {
  it('classifies the long instruction-style exam title as an exam', () => {
    expect(classifyAssessmentKind(LONG_EXAM_TITLE)).toBe('exam');
    // The calibrated false-positive rules stay intact: prep/review artifacts
    // are not exams even when the exam noun leads the title.
    expect(classifyAssessmentKind('Practice Set: midterm preparation')).not.toBe('exam');
    expect(classifyAssessmentKind('exam review guide 3: evidence table and rationale')).toBe('graded-artifact');
  });

  it('does not turn exam-preparation artifacts or integration lessons into exam papers', () => {
    expect(classifyAssessmentKind('Exam blueprint worksheet with labeled neuron diagram')).toBe('graded-artifact');
    expect(classifyAssessmentKind('Exam-style short response with developmental concept')).toBe('graded-artifact');
    expect(classifyAssessmentKind('Final exam blueprint response with symptom concept')).toBe('graded-artifact');
    expect(classifyAssessmentKind('Disorders, Treatment, and Final Exam Integration')).toBe('graded-artifact');
  });

  it('keeps a final-exam integration lesson on the full teaching path', () => {
    const course = {
      courseName: 'Introduction to Psychology Lecture',
      lessons: [
        {
          title: 'Lesson 1: Scientific Thinking and Psychology Claims',
          sections: [
            {
              topicSection: 'Scientific reasoning, theory, hypothesis, replication',
              learningGoals: 'Students distinguish evidence-backed claims from opinion.',
              learningObjectives: 'Explain how psychologists test claims and diagnose one misconception.',
              weeklyAssessments: 'Concept check quiz with retrieval question and corrected explanation.',
              asyncActivities: 'Read lecture notes and complete a practice quiz.',
              syncActivities: 'Lecture concept check with clicker questions and wrong-answer sorting.',
              supportingResources: 'Lecture notes; misconception list; practice quiz',
            },
          ],
        },
        {
          title: 'Lesson 2: Disorders, Treatment, and Final Exam Integration',
          sections: [
            {
              topicSection: 'Psychological disorder, treatment option, symptom evidence, exam integration',
              learningGoals: 'Students integrate disorder and treatment concepts for exam transfer.',
              learningObjectives: 'Analyze a symptom scenario and justify a treatment concept.',
              weeklyAssessments: 'Final exam blueprint response with symptom concept and misconception repair.',
              asyncActivities: 'Review lecture notes and annotate a symptom scenario.',
              syncActivities: 'Concept integration clinic with retrieval and transfer practice.',
              supportingResources: 'Disorder notes; treatment comparison; exam blueprint',
            },
          ],
        },
      ],
    };
    const blueprint = buildCourseBlueprint(course);
    const compiled = compileBlueprintDeliverables(blueprint, ['lessonPlans', 'quizBank'], {
      enforceCompilerContract: false,
    });

    expect(compiled.lessonPlans.lessonPlans).toHaveLength(2);
    expect(compiled.lessonPlans.lessonPlans[1].examDay).toBeUndefined();
    expect(compiled.lessonPlans.lessonPlans[1].classSessionPlan).toBeTruthy();
    expect(compiled.lessonPlans.lessonPlans[1].teachingIntent).toBeTruthy();
    expect(compiled.quizBank.quizzes).toHaveLength(2);
    expect(compiled.quizBank.quizzes.filter((entry) => entry.kind === 'exam')).toHaveLength(0);
  });

  it('compiles a real exam paper for an exam-titled assessment on the graph path', () => {
    const blueprint = buildBlueprintFromGraph(deriveCourseGraphFromCourseMap(COURSE));
    const compiled = compileBlueprintDeliverables(blueprint, ['quizBank'], {});
    const exams = (compiled.quizBank.quizzes || []).filter((entry) => entry.kind === 'exam');
    expect(exams).toHaveLength(1);
    // The registry title is verbatim, so the exam document heading carries
    // the full registered title (what the grader's exam-content check needs).
    expect(exams[0].lessonTitle).toContain('Midterm exam edge-case probe');
    expect(exams[0].questions.length).toBeGreaterThanOrEqual(5);
    expect(exams[0].answerKey.length).toBe(exams[0].questions.length);
  });

  // Live crucible round 3: Pass A transcribed numbered prose cells back into
  // assessment titles ("Midterm exam: 1. Midterm exam"). The compiler deduped
  // its own anchors but the graph/manifest kept the echo, so the grader
  // searched the quiz bank for a string no document renders — a 74/C P0 on a
  // package whose exam paper was fine. The echo dies where the row is born.
  it('strips "Title: 1. Title" transcription echoes from registry identity', () => {
    expect(dedupeNumberedAssessmentEcho('Midterm exam: 1. Midterm exam')).toBe('Midterm exam');
    expect(dedupeNumberedAssessmentEcho('Autograded quiz: 1. Autograded quiz')).toBe('Autograded quiz');
    // Real instruction tails survive — only true echoes collapse.
    expect(dedupeNumberedAssessmentEcho(LONG_EXAM_TITLE)).toBe(LONG_EXAM_TITLE);

    const echoed = {
      courseName: 'Intro to Python Programming',
      lessons: [
        {
          title: 'Lesson 1: Python Basics',
          sections: [
            {
              topicSection: '1.1: Basics',
              learningGoals: 'Write small programs.',
              learningObjectives: 'Trace and debug code.',
              weeklyAssessments: '1. Midterm exam: 1. Midterm exam → Quiz & Exam Bank',
              asyncActivities: 'Read the chapter.',
              syncActivities: 'Pair programming lab.',
              supportingResources: 'Python textbook chapter',
            },
          ],
        },
      ],
    };
    const graph = deriveCourseGraphFromCourseMap(echoed);
    expect(graph.assessments[0].title).toBe('Midterm exam');
    expect(graph.assessments[0].kind).toBe('exam');
  });

  // Live crucible round 4: the finish-pass readiness repair replaced a
  // midterm week's assessment cell with pool text minted from the topic
  // ("Midterm exam edge-case probe: …") AFTER the package compiled — the
  // re-derived registry promised an exam paper no compile built. Repairs
  // must never rewrite exam identity or mint a new one.
  it('readiness repair never rewrites or mints exam identity in assessment cells', () => {
    const repairMap = (weeklyAssessments, lessonTitle = 'Lesson 11: Midterm Review and Midterm Exam') => {
      const { courseMap } = repairCourseMapReadiness({
        courseMap: {
          courseName: 'Intro to Python Programming',
          lessons: [
            {
              title: lessonTitle,
              sections: [
                {
                  topicSection: '11.1: Midterm review and midterm exam',
                  learningGoals: 'Consolidate the first half of the course.',
                  learningObjectives: 'Trace and debug code from lessons 1-10.',
                  weeklyAssessments,
                  asyncActivities: 'Review the practice bank.',
                  syncActivities: 'Review session with polling.',
                  supportingResources: 'Lecture notes; practice bank',
                },
              ],
            },
          ],
        },
      });
      return courseMap.lessons[0].sections[0].weeklyAssessments;
    };

    // An exam-bearing cell is left verbatim even when a repair predicate
    // fires (here: a publishability placeholder shares the cell).
    const preserved = repairMap('Autograded quiz; Midterm exam; TBD');
    expect(preserved).toBe('Autograded quiz; Midterm exam; TBD');

    // An empty cell in an exam-week lesson gets a minted fallback that must
    // NOT classify as a new exam.
    const minted = repairMap('');
    expect(minted).toBeTruthy();
    expect(classifyAssessmentKind(minted)).not.toBe('exam');
  });

  it('compiles an exam paper even when the blueprint assessment has no stored kind', () => {
    // Legacy/non-registry blueprints: kind absent → title classification
    // fills in; an explicit non-exam kind would be respected.
    const blueprint = buildCourseBlueprint(COURSE);
    const lesson11 = (blueprint.assessments || []).find((a) => (a.lessonNumbers || []).includes(11));
    expect(lesson11.kind).toBeUndefined();
    const compiled = compileBlueprintDeliverables(blueprint, ['quizBank'], {});
    const exams = (compiled.quizBank.quizzes || []).filter((entry) => entry.kind === 'exam');
    expect(exams).toHaveLength(1);
  });
});
