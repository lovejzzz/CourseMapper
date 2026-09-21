import { projectTeachingTasksIntoCourseMap, mergeGeneratedTaskMap } from '../compilerTeachingTaskProjection.js';
import { reviewCheckedCalculations, preserveCheckedCalculationExamples } from '../checkedCalculationReview.js';
import { describe, it, expect } from 'vitest';
import { buildCheckedCalculationTask } from '../checkedCalculationTask.js';
import { rebuildTeachingTaskSource, teachingTaskSourceFromLesson } from '../teachingTaskSource.js';
import {
  buildCourseBlueprint,
  compileBlueprintDeliverables,
  compactBlueprintForStorage,
  BLUEPRINT_COMPILE_CONTEXT,
  reconcileCourseMapWithBlueprintSemanticAdmission,
} from '../courseBlueprintCompiler.js';
const features = [
  'syllabus',
  'lessonPlans',
  'slideDecks',
  'assignments',
  'rubrics',
  'discussions',
  'quizBank',
  'studyGuides',
  'courseFaq',
];
const make = (brief, titles = ['Mean and median', 'Variance and outliers']) => {
  const map = {
    courseName: 'Measurement workshop',
    lessons: titles.map((title) => ({
      title,
      sections: [{ topicSection: title, learningObjectives: `Apply ${title}.` }],
    })),
  };
  const bp = compactBlueprintForStorage(buildCourseBlueprint(map, { sourceBrief: brief }));
  return { map, d: compileBlueprintDeliverables(bp, features) };
};
const brief = 'Use data [3,7,7,11,12]. Each session has a 4-question quiz. Discuss adding an outlier 50.';
describe('canonical checked exercise quality', () => {
  it('preserves checked examples through cosmetics without overwriting teacher edits', () => {
    const { d } = make(brief);
    const before = d.studyGuides,
      after = structuredClone(before);
    after.studyGuides[0].workedExample.result = 'A cosmetic rewrite';
    expect(preserveCheckedCalculationExamples('studyGuides', before, after).studyGuides[0].workedExample.result).toBe(
      before.studyGuides[0].workedExample.result,
    );
    const edited = structuredClone(before);
    edited.studyGuides[0].workedExample.result = 'Teacher annotation';
    expect(preserveCheckedCalculationExamples('studyGuides', edited, edited)).toBe(edited);
  });
  it('updates a freshly generated map but preserves concurrent teacher edits', () => {
    const { map, d } = make(brief);
    map.lessons.forEach((l) => {
      l.sections[0].syncActivities = 'Compare two interpretations and defend a decision.';
    });
    const projected = projectTeachingTasksIntoCourseMap(map, d[BLUEPRINT_COMPILE_CONTEXT], {
      generatedCodingMap: true,
    });
    expect(projected.lessons[0].sections[0].syncActivities).toContain('[3, 7, 7, 11, 12]');
    const edited = structuredClone(map);
    edited.lessons[0].sections[0].syncActivities = 'Teacher-owned activity.';
    const merged = mergeGeneratedTaskMap(edited, map, projected);
    expect(merged.lessons[0].sections[0].syncActivities).toBe('Teacher-owned activity.');
    expect(merged.lessons[1].sections[0].syncActivities).toBe(projected.lessons[1].sections[0].syncActivities);
  });

  it('extends the same contract to mechanics without inventing units or missing inputs', () => {
    const text =
      'Use a cart starting at rest with constant acceleration 2 m/s^2 for 3 s. Then use mass 4 kg and net force 12 N.';
    const { d } = make(text, ['Constant acceleration', 'Newton second law']);
    expect(d.quizBank.quizzes[0].questions.slice(0, 4).map((q) => q.answer)).toEqual([
      '6 m/s',
      '9 m',
      '0 m/s',
      '3 m/s',
    ]);
    expect(d.quizBank.quizzes[1].questions[0].answer).toBe('3 m/s^2');
    for (const feature of features) expect(reviewCheckedCalculations(feature, d[feature]), feature).toEqual([]);
    for (const lesson of d[BLUEPRINT_COMPILE_CONTEXT].lessons) {
      expect(rebuildTeachingTaskSource(teachingTaskSourceFromLesson(lesson)).revision).toBe(
        lesson.teachingTask.revision,
      );
    }
    for (let a = 1; a <= 7; a++)
      for (let t = 1; t <= 5; t++) {
        const task = buildCheckedCalculationTask({
          lessonId: 'p',
          title: 'Kinematics',
          brief: `A cart starting at rest with constant acceleration ${a} m/s^2 for ${t} s.`,
        });
        const [v, s, , avg] = task.checkedPractice.questions.map((q) => parseFloat(q.answer));
        expect(v / t).toBe(a);
        expect(s / t).toBe(avg);
        expect(v * v).toBeCloseTo(2 * a * s, 8);
      }
    for (const bad of [
      'Use acceleration 2 for 3 seconds.',
      'A cart starting at rest with constant acceleration 2 m/s^2 for 3 s; initial speed 4 m/s.',
      'A cart starting at rest with constant acceleration 2 m/s^2 for 3 s and for 7 s.',
    ])
      expect(buildCheckedCalculationTask({ lessonId: 'p', title: 'Constant acceleration', brief: bad })).toBeNull();
    expect(
      buildCheckedCalculationTask({
        lessonId: 'f',
        title: 'Newton second law',
        brief: 'mass 0 kg and net force 12 N.',
      }),
    ).toBeNull();
    expect(
      buildCheckedCalculationTask({
        lessonId: 'f',
        title: 'Newton second law',
        brief: 'mass 400 g and net force 12 N.',
      }),
    ).toBeNull();
  });

  it('reviews visible answers and examples without trusting task ids or mutating edits', () => {
    const { d } = make(brief);
    for (const feature of features) expect(reviewCheckedCalculations(feature, d[feature]), feature).toEqual([]);
    const quiz = structuredClone(d.quizBank);
    quiz.quizzes[0].questions[0].answer = '999';
    expect(reviewCheckedCalculations('quizBank', quiz).join(' ')).toContain('reference answer differs');
    expect(quiz.quizzes[0].questions[0].answer).toBe('999');
    const guide = structuredClone(d.studyGuides);
    guide.studyGuides[0].workedExample.result = 'Invented result';
    expect(reviewCheckedCalculations('studyGuides', guide).join(' ')).toContain('worked example');
    const assignment = structuredClone(d.assignments);
    assignment.assignments[0].overview = 'Analyze the evidence and discuss a decision.';
    expect(reviewCheckedCalculations('assignments', assignment).join(' ')).toContain('bound calculation problem');
  });

  it('keeps a single task revision across all nine materials and the course map', () => {
    const { map, d } = make(brief);
    const bp = d[BLUEPRINT_COMPILE_CONTEXT];
    expect(d.quizBank.quizzes.map((q) => q.questions.length)).toEqual([4, 4]);
    const task = bp.lessons[0].teachingTask;
    for (const [f, key] of [
      ['lessonPlans', 'lessonPlans'],
      ['slideDecks', 'decks'],
      ['assignments', 'assignments'],
      ['rubrics', 'rubrics'],
      ['discussions', 'discussions'],
      ['studyGuides', 'studyGuides'],
      ['courseFaq', 'faqs'],
    ]) {
      expect(d[f][key][0].taskId, f).toBe(task.id);
      expect(d[f][key][0].taskRevision, f).toBe(task.revision);
    }
    expect(d.syllabus.syllabus.weeklySchedule[0].taskId).toBe(task.id);
    expect(d.syllabus.syllabus.weeklySchedule[0].assignments).toContain('[3, 7, 7, 11, 12]');
    expect(d.discussions.discussions[0].context).toContain('[3, 7, 7, 11, 12]');
    expect(d.quizBank.quizzes[0].questions.every((q) => q.taskRevision === task.revision)).toBe(true);
    expect(d.assignments.assignments[0].workedExample).toBeUndefined();
    expect(d.assignments.assignments[0].weightedGradingCriteria).toEqual(d.rubrics.rubrics[0].criteria);
    const projected = reconcileCourseMapWithBlueprintSemanticAdmission(map, bp);
    expect(projected.lessons[0].teachingTaskLink.taskId).toBe(task.id);
    expect(JSON.stringify(projected.lessons[0].sections)).toContain('[3, 7, 7, 11, 12]');
  });
  it('rebuilds edited inputs and never retains an old answer or revision', () => {
    const { d } = make(brief);
    const lesson = d[BLUEPRINT_COMPILE_CONTEXT].lessons[1];
    const source = teachingTaskSourceFromLesson(lesson);
    expect(rebuildTeachingTaskSource(source).checkedPractice.questions[3].answer).toBe('Mean 15; median 9.');
    const changed = {
      ...source,
      inputs: source.inputs.map((x) => ({ ...x, text: x.text.replace('[3, 7, 7, 11, 12]', '[10, 20, 20, 30, 40]') })),
    };
    const next = rebuildTeachingTaskSource(changed);
    expect(next.id).toBe(source.id);
    expect(next.revision).not.toBe(lesson.teachingTask.revision);
    expect(next.checkedPractice.questions[1].answer).toBe('104');
    expect(next.checkedPractice.questions[3].answer).toBe('Mean 28.33333333; median 25.');
    expect(
      rebuildTeachingTaskSource({ ...source, inputs: [{ ...source.inputs[0], text: 'No numeric record supplied.' }] }),
    ).toBeNull();
  });
  it('uses changed inputs across the whole compiled course, not only the quiz key', () => {
    const before = make(brief).d,
      after = make(brief.replace('[3,7,7,11,12]', '[10,20,20,30,40]')).d;
    const a = before.assignments.assignments[0],
      b = after.assignments.assignments[0];
    expect(a.taskId).toBe(b.taskId);
    expect(a.taskRevision).not.toBe(b.taskRevision);
    expect(after.quizBank.quizzes[0].questions[0].answer).toBe('24');
    expect(after.discussions.discussions[0].context).toContain('[10, 20, 20, 30, 40]');
    expect(after.syllabus.syllabus.weeklySchedule[0].assignments).not.toContain('[3, 7, 7, 11, 12]');
    expect(after.studyGuides.studyGuides[0].workedExample.result).toContain('24');
  });
  it('satisfies independent translation/scaling identities on held-out numeric datasets', () => {
    // Fixed seed, no golden snapshots from the implementation. Independent
    // pairwise variance identity detects a shared wrong denominator or mean.
    let seed = 731;
    const next = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed;
    };
    for (let run = 0; run < 120; run++) {
      const xs = Array.from({ length: 2 + (next() % 12) }, () => Number(next() % 101) - 50),
        n = xs.length;
      const task = buildCheckedCalculationTask({
        lessonId: 'L',
        title: 'Variance and outliers',
        brief: `Use data [${xs}].`,
      });
      const pairSum = xs.reduce((sum, a) => sum + xs.reduce((s, b) => s + (a - b) ** 2, 0), 0);
      expect(Number(task.checkedPractice.questions[1].answer)).toBeCloseTo(pairSum / (2 * n * n), 5);
      expect(Number(task.checkedPractice.questions[2].answer)).toBeCloseTo(pairSum / (2 * n * (n - 1)), 5);
      const shifted = buildCheckedCalculationTask({
        lessonId: 'L',
        title: 'Variance and outliers',
        brief: `Use data [${xs.map((x) => 3 * x + 17)}].`,
      });
      expect(Number(shifted.checkedPractice.questions[1].answer)).toBeCloseTo((9 * pairSum) / (2 * n * n), 4);
    }
  });
  it('checks equilibrium by substituting into both curves over held-out markets', () => {
    for (let a = 30; a <= 110; a += 20)
      for (let b = 1; b <= 4; b++) {
        const task = buildCheckedCalculationTask({
          lessonId: 'M',
          title: 'Market equilibrium',
          brief: `Use Qd=${a}-${b}P and Qs=10+2P. At price ceiling P=3 calculate shortage.`,
        });
        const p = Number(task.checkedPractice.questions[0].answer),
          q = Number(task.checkedPractice.questions[1].answer);
        expect(a - b * p).toBeCloseTo(q, 6);
        expect(10 + 2 * p).toBeCloseTo(q, 6);
      }
  });
});
