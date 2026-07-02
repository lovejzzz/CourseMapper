// v0.15.188 — fixes for the grader-blind defects Project Prof surfaced.
import { describe, expect, it } from 'vitest';
import { deriveCourseGraphFromCourseMap } from '../src/lib/courseGraph/deriveFromCourseMap.js';
import { buildBlueprintFromGraph } from '../src/lib/courseGraph/blueprintFromGraph.js';
import { buildCourseBlueprint, compileBlueprintDeliverables } from '../src/lib/courseBlueprintCompiler';

function course(weeklyAssessment) {
  return {
    courseName: 'Intro to Python Programming',
    lessons: Array.from({ length: 3 }, (_, i) => ({
      title: `Lesson ${i + 1}: Python Topic ${i + 1}`,
      sections: [
        {
          topicSection: `${i + 1}.1: Core concept ${i + 1}`,
          learningGoals: `Understand topic ${i + 1}.`,
          learningObjectives: `Apply topic ${i + 1} in an exercise.`,
          weeklyAssessments: weeklyAssessment,
          asyncActivities: 'Read the chapter.',
          syncActivities: 'Pair programming lab.',
          supportingResources: 'Python textbook chapter',
        },
      ],
    })),
  };
}

function weeklyQuizItems(weeklyAssessment) {
  const blueprint = buildBlueprintFromGraph(deriveCourseGraphFromCourseMap(course(weeklyAssessment)));
  const compiled = compileBlueprintDeliverables(blueprint, ['quizBank', 'syllabus'], {});
  const quiz = compiled.quizBank.quizzes.find((z) => z.kind !== 'exam');
  const types = {};
  for (const q of quiz.questions) types[q.type] = (types[q.type] || 0) + 1;
  return { types, compiled };
}

describe('Prof catch #1 — autograded quizzes are machine-scorable', () => {
  it('an "autograded quiz" ships zero essays and zero short-answers', () => {
    const { types } = weeklyQuizItems('Autograded quiz');
    expect(types.essay || 0).toBe(0);
    expect(types.short_answer || 0).toBe(0);
    expect(types.multiple_choice).toBeGreaterThanOrEqual(5);
  });

  it('a non-autograded assessment keeps its constructed-response mix', () => {
    const { types } = weeklyQuizItems('Reflection memo on one bug you fixed');
    expect((types.essay || 0) + (types.short_answer || 0)).toBeGreaterThan(0);
  });

  it('the promise-detection is title-driven and case-insensitive', () => {
    expect(weeklyQuizItems('Weekly AUTOGRADED check').types.essay || 0).toBe(0);
  });
});

describe('Prof catch #5 — quiz distractors catch the documented misconception', () => {
  const KERNEL_COURSE = {
    courseName: 'Applied Research Evidence',
    lessons: [
      {
        title: 'Lesson 1: Evidence Triangulation',
        sections: [
          {
            topicSection: '1.1: Evidence triangulation and corroboration',
            learningGoals: 'Use triangulation to test claims.',
            learningObjectives: 'Explain when a claim is corroborated.',
            weeklyAssessments: 'Reflection memo',
            asyncActivities: 'Read the primer.',
            syncActivities: 'Workshop excerpts.',
            supportingResources: 'Survey excerpt',
          },
        ],
      },
    ],
  };
  const ENRICHMENT = {
    source: 'test',
    lessonContent: {
      'lesson-1': {
        quizItems: [],
        keyTerms: [
          {
            term: 'Evidence triangulation',
            definition: 'Cross-checking a claim against two independent sources.',
            example: 'Comparing survey results with interviews.',
            misconception: 'Students often treat one strong source as sufficient proof for a claim.',
            correction: 'Only independent corroboration makes a claim defensible.',
          },
        ],
      },
    },
  };

  it('a genome misconception becomes a clean distractor (no giveaway tell) and is tagged grounded', () => {
    // Uses the compiler's own buildCourseBlueprint so the concept↔term
    // containment match ("Evidence triangulation" ⊂ "…and corroboration") is
    // exercised end to end.
    const blueprint = buildCourseBlueprint(KERNEL_COURSE, { enrichment: ENRICHMENT });
    const compiled = compileBlueprintDeliverables(blueprint, ['quizBank'], {});
    const quiz = compiled.quizBank.quizzes[0];
    const sourced = quiz.questions.filter((q) => q.misconceptionSourced);
    expect(sourced.length).toBeGreaterThan(0);
    const options = sourced.flatMap((q) => q.options).join('\n');
    // The misconception rode in as an option…
    expect(options).toMatch(/treat one strong source as sufficient proof/i);
    // …without announcing itself (a distractor that says "the common
    // misunderstanding" is a giveaway).
    expect(options).not.toMatch(/common misunderstanding/i);
    // …and the item is tagged grounded for the metric.
    expect(sourced[0].enrichmentSource).toBe('lesson-content-enrichment');
  });

  it('a concept with no authored misconception keeps only template distractors', () => {
    const blueprint = buildBlueprintFromGraph(deriveCourseGraphFromCourseMap(course('Autograded quiz')));
    const compiled = compileBlueprintDeliverables(blueprint, ['quizBank'], {});
    const quiz = compiled.quizBank.quizzes.find((z) => z.kind !== 'exam');
    expect(quiz.questions.every((q) => !q.misconceptionSourced)).toBe(true);
  });
});

describe('Prof catch #3 — the syllabus workload line shows its breakdown', () => {
  it('the student-facing estimate reconciles the total with its parts', () => {
    const { compiled } = weeklyQuizItems('Autograded quiz');
    const text = JSON.stringify(compiled.syllabus);
    // The estimate now names in-class + prep + after-class minutes so an
    // adopter can add them up, instead of a bare "N hours including class".
    expect(text).toMatch(/min in class/);
    expect(text).toMatch(/hours this week/);
  });
});
