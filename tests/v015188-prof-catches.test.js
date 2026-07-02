// v0.15.188 — fixes for the grader-blind defects Project Prof surfaced.
import { describe, expect, it } from 'vitest';
import { deriveCourseGraphFromCourseMap } from '../src/lib/courseGraph/deriveFromCourseMap.js';
import { buildBlueprintFromGraph } from '../src/lib/courseGraph/blueprintFromGraph.js';
import { compileBlueprintDeliverables } from '../src/lib/courseBlueprintCompiler';

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
