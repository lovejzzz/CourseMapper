import { describe, expect, it } from 'vitest';
import { proportionPresentationFixture } from '../../../tests/fixtures/teaching/proportionPresentation.js';
import { createTeachingOperationPlan, validateTeachingOperationPlan } from '../teachingOperationPlan.js';
import { buildSharedTeachingTask } from '../compilerTeachingTask.js';
import { teachingTaskSourceFromLesson } from '../teachingTaskSource.js';
import { withTeachingTaskSources, readTeachingTaskSources } from '../teachingProgram.js';
import { projectSharedTeachingTasks, projectTeachingTasksIntoCourseMap } from '../compilerTeachingTaskProjection.js';
import {
  createTeachingTaskReviewDraft,
  previewTeachingTaskReview,
  commitTeachingTaskReview,
} from '../teachingTaskReview.js';
import { deriveCourseGraphFromCourseMap } from '../courseGraph/index.js';
import { createEditTransaction, applyEditTransaction } from '../deliverableEditHistory.js';
import { prepareProjectSnapshotForRestore } from '../projectSnapshotSanitizer.js';
import { finalizeCompiledDeliverableLanguage } from '../compiledLanguageFinalizer.js';

function compile(zh, legacy = false) {
  const f = proportionPresentationFixture(zh);
  const plan = createTeachingOperationPlan({
    operation: 'observed-proportion',
    ...f,
    admission: { kind: 'teacher-confirmed' },
  });
  if (legacy) delete plan.presentationVersion;
  const task = buildSharedTeachingTask({
    lessonId: 'repair-records',
    objective: f.objective,
    sourceInputs: f.inputs,
    operationPlan: plan,
    admitted: true,
  });
  return { ...f, plan, task };
}

function oldWorkspace(zh) {
  const f = compile(zh, true);
  const lesson = {
    id: 'repair-records',
    lessonNumber: 1,
    title: 'Repair records',
    teachingTaskScope: 'primary-task',
    teachingTask: f.task,
    classSessionPlan: { sessionMinutes: 50 },
  };
  const source = teachingTaskSourceFromLesson(lesson);
  const courseMap = withTeachingTaskSources(
    {
      courseName: 'Development presentation review',
      lessons: [{ title: lesson.title, sections: [{ learningObjectives: f.objective }] }],
    },
    [source],
  );
  const data = projectSharedTeachingTasks(
    'rubrics',
    { rubrics: [{ lessonNumber: 1, title: 'Repair evidence rubric', totalPoints: 100, criteria: [] }] },
    { lessons: [lesson] },
  );
  return {
    source,
    courseMap: projectTeachingTasksIntoCourseMap(courseMap, { lessons: [lesson] }),
    deliverables: {
      rubrics: {
        status: 'done',
        stale: false,
        data: finalizeCompiledDeliverableLanguage('rubrics', data, { lessons: [lesson] }),
      },
    },
  };
}

describe('versioned proportion teaching presentation', () => {
  it.each([
    [false, '4e0344a4c48850d1e3ce81ce22644b7e3a88516dfa9a792b594c3074d41de67a'],
    [true, '5be0fa492d452fcd5b88663318ad53bd7284fb04efe17e4942bfe8da3d29bb32'],
  ])('reconstructs the original development contract for merge baselines (Chinese: %s)', (zh, revision) => {
    // Captured before this implementation. This checks compatibility, not quality.
    expect(compile(zh, true).task.revision).toBe(revision);
  });

  it.each([false, true])(
    'keeps the complement numerical and supports both full response routes (Chinese: %s)',
    (zh) => {
      const { task, inputs } = compile(zh);
      const alternative = task.contrastResponses[3];
      expect(task.operationPlan.presentationVersion).toBe(3);
      expect(task.answer).toContain(zh ? '53.75%' : '61.29%');
      expect(task.answer).toContain(zh ? '43/80 = 0.5375 = 53.75%' : '19/31 ≈ 0.6129 ≈ 61.29%');
      expect(task.answer).not.toMatch(/× 100\s*[=≈]\s*[\d.]+%/);
      expect(alternative.response).toContain(zh ? '80 − 43 = 37' : '31 − 19 = 12');
      expect(alternative.response).toContain(zh ? '不能由此断言' : 'not evidence of a different outcome');
      expect(alternative.response).not.toContain('do not meet the counted outcome');
      expect(alternative.response).not.toContain('不符合所计结果');
      expect(task.answer).not.toContain('describes had a repair');
      if (zh) expect(task.answer).toContain('「登记为“已修复”」');
      expect(JSON.stringify(task)).not.toContain('for The July');
      expect(task.reasoning[0]).toContain(zh ? '来源记录 1' : 'Source record 1');
      expect(task.reasoning[2]).toContain(zh ? '来源记录 2' : 'Source record 2');
      expect(task.inputs.map((input) => input.text)).toEqual(inputs.map((input) => input.text));
      for (const example of task.contrastResponses)
        for (const judgment of example.judgments)
          for (const quote of judgment.evidence) {
            expect(quote.start).toBeGreaterThanOrEqual(0);
            expect(example.response.slice(quote.start, quote.end)).toBe(quote.quote);
          }
      expect(alternative.judgments.map((j) => j.level)).toEqual(['exemplary', 'exemplary', 'exemplary']);
      expect(task.contrastResponses[1].judgments.map((j) => j.level)).toEqual([
        'developing',
        'developing',
        'developing',
      ]);
      expect(task.workedExample.result).not.toBe(task.answer);
      expect(task.workedExample.boundary).toContain(zh ? '未知' : 'unknown');
      expect(task.workedExample.steps.join(' ')).toContain(zh ? '相关观察时段' : 'observation window');
      expect(task.criteria[0].levels.proficient).toContain(zh ? '或部分与整体' : 'or the part–whole');
      const projected = projectSharedTeachingTasks(
        'rubrics',
        { rubrics: [{ lessonNumber: 1, criteria: [], totalPoints: 100 }] },
        { lessons: [{ id: 'repair-records', lessonNumber: 1, teachingTaskScope: 'primary-task', teachingTask: task }] },
      );
      const polished = finalizeCompiledDeliverableLanguage('rubrics', projected, { lessons: [{ teachingTask: task }] });
      expect(polished.rubrics[0].anchorExamples.alternativeSample).toBe(alternative.response);
      expect(polished.rubrics[0].anchorExampleSet.alternativeSample).toBe(alternative.response);
    },
  );

  it('rejects an unknown stored presentation instead of reinterpreting it', () => {
    const f = compile(false);
    f.plan.presentationVersion = 99;
    expect(validateTeachingOperationPlan(f.plan, f.inputs).issues.map((i) => i.code)).toContain('plan-presentation');
  });

  it.each([false, true])(
    'reviews an old project into the new presentation and restores its transaction (Chinese: %s)',
    (zh) => {
      const state = oldWorkspace(zh);
      const before = {
        courseMap: state.courseMap,
        deliverables: state.deliverables,
        courseGraph: deriveCourseGraphFromCourseMap(state.courseMap),
      };
      const draft = createTeachingTaskReviewDraft(state.source);
      const preview = previewTeachingTaskReview({ ...state, draft });
      expect(preview.status, preview.message).toBe('preview');
      const applied = commitTeachingTaskReview({ ...state, preview, teacherConfirmed: true });
      expect(applied.status).toBe('applied');
      expect(applied.conflicts).toEqual([]);
      expect(applied.modelCalls).toBe(0);
      const source = readTeachingTaskSources(applied.courseMap)[0];
      expect(source.inputs).toEqual(state.source.inputs);
      expect(source.operationPlan.presentationVersion).toBe(3);
      expect(source.id).toBe(state.source.id);
      const after = {
        courseMap: applied.courseMap,
        courseGraph: deriveCourseGraphFromCourseMap(applied.courseMap),
        deliverables: { ...state.deliverables, ...applied.changed },
      };
      const tx = JSON.parse(JSON.stringify(createEditTransaction(before, after)));
      const restored = prepareProjectSnapshotForRestore(JSON.parse(JSON.stringify(after)));
      const undone = applyEditTransaction(restored, tx, 'undo');
      expect(undone.status).toBe('applied');
      expect(undone.workspace.deliverables).toEqual(before.deliverables);
      const redone = applyEditTransaction(undone.workspace, tx, 'redo');
      expect(redone.status).toBe('applied');
      expect(redone.workspace.deliverables).toEqual(after.deliverables);
    },
  );

  it('retains teacher changes when a presentation upgrade would replace them', () => {
    const state = oldWorkspace(false);
    const anchors = state.deliverables.rubrics.data.rubrics[0].anchorExampleSet;
    anchors.alternativeSample =
      'Teacher example: students must explain why the unclassified devices are still unknown.';
    const preview = previewTeachingTaskReview({ ...state, draft: createTeachingTaskReviewDraft(state.source) });
    const applied = commitTeachingTaskReview({ ...state, preview, teacherConfirmed: true });
    expect(applied.status).toBe('applied');
    expect(applied.changed.rubrics.data.rubrics[0].anchorExampleSet.alternativeSample).toBe(anchors.alternativeSample);
    expect(applied.conflicts.some((c) => c.path.at(-1) === 'alternativeSample')).toBe(true);
    expect(applied.changed.rubrics.stale).toBe(true);
  });
});
