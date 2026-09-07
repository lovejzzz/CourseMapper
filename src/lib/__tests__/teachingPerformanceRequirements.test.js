import { describe, expect, it } from 'vitest';
import { observedProportionFixture } from '../../../tests/fixtures/teaching/observedProportion.js';
import { performanceRequirementsFixture } from '../../../tests/fixtures/teaching/performanceRequirements.js';
import {
  createTeachingOperationPlan,
  validateTeachingOperationPlan,
  evaluateTeachingOperationPlan,
  rebindTeachingOperationEdit,
  remapTeachingOperationInputs,
} from '../teachingOperationPlan.js';
import { buildSharedTeachingTask, teachingTaskRubric } from '../compilerTeachingTask.js';
import { teachingTaskSourceFromLesson, rebuildTeachingTaskSource } from '../teachingTaskSource.js';
import { withTeachingTaskSources, readTeachingTaskSources, validateTeachingProgram } from '../teachingProgram.js';
import {
  createTeachingTaskReviewDraft,
  previewTeachingTaskReview,
  commitTeachingTaskReview,
} from '../teachingTaskReview.js';
import { projectSharedTeachingTasks } from '../compilerTeachingTaskProjection.js';
import {
  buildCourseBlueprint,
  compileBlueprintDeliverables,
  BLUEPRINT_COMPILE_CONTEXT,
  reconcileCourseMapWithBlueprintSemanticAdmission,
} from '../courseBlueprintCompiler.js';
import { deriveCourseGraphFromCourseMap } from '../courseGraph/index.js';
import { quarantineInvalidInstructionalPlanLineage } from '../instructionalPlanLineage.js';
import { normalizeRestoredDeliverables } from '../../model/courseStore.jsx';
import { prepareProjectSnapshotForRestore } from '../projectSnapshotSanitizer.js';
import { createEditTransaction, applyEditTransaction } from '../deliverableEditHistory.js';
import { mergeTaskProjection } from '../teachingTaskContentSync.js';
import { projectReviewedTeachingQuestionBank } from '../compilerTeachingTaskQuiz.js';

function fixture() {
  const f = observedProportionFixture();
  const content = performanceRequirementsFixture();
  const plan = createTeachingOperationPlan({
    ...f,
    ...content,
    version: 2,
    operation: 'observed-proportion',
    admission: { kind: 'teacher-confirmed' },
  });
  return { ...f, plan };
}
function compile(f) {
  return buildSharedTeachingTask({
    lessonId: 'authored-requirements',
    objective: f.objective,
    sourceInputs: f.inputs,
    operationPlan: f.plan,
    admitted: true,
  });
}
function state() {
  const f = fixture(),
    task = compile(f);
  const lesson = {
    id: 'authored-requirements',
    lessonNumber: 1,
    title: 'Observed scope',
    teachingTask: task,
    classSessionPlan: { sessionMinutes: 50 },
  };
  const source = teachingTaskSourceFromLesson(lesson);
  const courseMap = withTeachingTaskSources(
    {
      courseName: 'Reviewed requirements',
      lessons: [{ title: lesson.title, sections: [{ learningObjectives: f.objective }] }],
    },
    [source],
  );
  const data = projectSharedTeachingTasks(
    'rubrics',
    { rubrics: [{ lessonNumber: 1, title: 'Task rubric', totalPoints: 100 }] },
    { lessons: [lesson] },
  );
  return { f, task, source, courseMap, deliverables: { rubrics: { status: 'done', data } } };
}

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
function fullState() {
  const f = fixture();
  const facts = f.inputs.map((s) => s.text);
  const map = {
    courseName: 'Sample evidence development review',
    lessons: [
      {
        title: 'Observed scope',
        sections: [
          { topicSection: 'Sample proportions', learningObjectives: f.objective, weeklyAssessments: f.objective },
        ],
      },
    ],
  };
  const blueprint = buildCourseBlueprint(map, {
    sourceBrief: `${f.objective}\nSource facts:\n${facts.map((text, i) => `${i + 1}. ${text}`).join('\n')}`,
    sessionMinutes: 50,
    instructorProvidedFacts: facts,
  });
  const generated = compileBlueprintDeliverables(blueprint, features);
  const courseMap = reconcileCourseMapWithBlueprintSemanticAdmission(map, generated[BLUEPRINT_COMPILE_CONTEXT]);
  const deliverables = normalizeRestoredDeliverables(
    Object.fromEntries(features.map((id) => [id, { status: 'done', stale: false, data: generated[id] }])),
  );
  const source = readTeachingTaskSources(courseMap)[0];
  const draft = createTeachingTaskReviewDraft(source);
  for (const [role, span] of Object.entries(f.plan.bindings)) {
    const original = f.inputs.find((s) => s.id === span.inputId);
    const input = draft.inputs.find((s) => s.text === original.text);
    draft.bindings[role] = { inputId: input.id, quote: original.text.slice(span.start, span.end), occurrence: 0 };
  }
  Object.assign(draft, { version: 2, requirements: f.plan.requirements, practiceInputs: f.plan.practiceInputs });
  return { courseMap, deliverables, draft };
}

function workspace(courseMap, deliverables) {
  return {
    courseMap,
    courseGraph: quarantineInvalidInstructionalPlanLineage(deriveCourseGraphFromCourseMap(courseMap)),
    deliverables,
  };
}

describe('reviewed performance requirements', () => {
  it('reconciles question identities, retains teacher questions and keeps displayed totals honest', () => {
    const task = compile(fixture());
    const old = { id: 'kept-id', practiceId: 'practice-kept', type: 'essay', points: 7, question: 'Old wording' };
    const removed = { id: 'removed-id', practiceId: 'practice-removed', type: 'short_answer', points: 4 };
    const teacher = {
      id: 'teacher-question',
      type: 'short_answer',
      points: 3,
      question: 'Explain your own selected case.',
    };
    const row = { questions: [old, teacher, removed], totalQuestions: 3, totalPoints: 14 };
    const question = {
      practiceId: 'practice-kept',
      question: 'Updated wording',
      answer: 'A supported response.',
      successCriteria: ['Uses the cited record.'],
      practiceKind: 'task-check',
    };
    projectReviewedTeachingQuestionBank(row, task, [question], [old, removed]);
    expect(row.questions.map((q) => q.id)).toEqual(['kept-id', 'teacher-question']);
    expect(row.questions[0]).toMatchObject({ type: 'essay', points: 7, question: 'Updated wording' });
    expect(row.questions[1]).toEqual(teacher);
    expect(row.totalQuestions).toBe(2);
    expect(row.totalPoints).toBe(10);
    expect(row.quizBlueprint.questionPlan.map((p) => p.questionId)).toEqual(['kept-id', 'teacher-question']);
    expect(row.assessmentBlueprint).toBe(task.question);
  });
  it('treats an omitted legacy empty slide slot as empty while retaining authored activity or notes', () => {
    const previous = {
      type: 'content',
      taskRole: 'scaffold:1',
      taskId: 'task-example',
      enrichmentSource: 'shared-teaching-task',
      notes: 'Original guidance',
      activity: null,
    };
    const legacy = { ...previous };
    delete legacy.activity;
    const conflicts = [];
    expect(mergeTaskProjection([previous], [], [legacy], [], conflicts)).toEqual([]);
    expect(conflicts).toEqual([]);
    for (const authored of [
      { ...legacy, notes: 'Teacher-specific guidance' },
      { ...legacy, activity: { instructions: 'Work with a partner.' } },
    ]) {
      const conflicts = [];
      expect(mergeTaskProjection([previous], [], [authored], [], conflicts)).toEqual([authored]);
      expect(conflicts).toHaveLength(1);
    }
  });
  it('migrates real compiled materials, persists semantic changes and restores undo/redo without an old-template rewrite', () => {
    const s = fullState();
    const before = workspace(s.courseMap, s.deliverables);
    const preview = previewTeachingTaskReview(s);
    expect(preview.status, preview.message).toBe('preview');
    expect(preview.impacts.map((i) => i.featureId)).toEqual(features);
    const applied = commitTeachingTaskReview({ ...s, preview, teacherConfirmed: true });
    expect(applied.status, applied.message).toBe('applied');
    expect(applied.conflicts).toEqual([]);
    const after = workspace(applied.courseMap, { ...s.deliverables, ...applied.changed });
    const source = readTeachingTaskSources(after.courseMap)[0];
    for (const feature of features) {
      expect(after.deliverables[feature].data.teachingTaskSources[0].operationPlan).toEqual(source.operationPlan);
    }
    const rubrics = after.deliverables.rubrics.data.rubrics[0];
    expect(rubrics.criteria.map((r) => r.criterionId)).toEqual(['estimate', 'next-evidence']);
    const task = rebuildTeachingTaskSource(source);
    expect(JSON.stringify(after.deliverables.assignments.data)).toContain(task.directions[1]);
    expect(JSON.stringify(after.deliverables.studyGuides.data)).toContain(
      source.operationPlan.requirements[1].transfer.answer,
    );
    const transaction = JSON.parse(JSON.stringify(createEditTransaction(before, after)));
    const restored = prepareProjectSnapshotForRestore(JSON.parse(JSON.stringify(after)));
    const reopened = {
      courseMap: restored.courseMap,
      courseGraph: restored.courseGraph,
      deliverables: normalizeRestoredDeliverables(restored.deliverables),
    };
    expect(reopened).toEqual(after);
    expect(applyEditTransaction(reopened, transaction, 'undo').workspace).toEqual(before);
    expect(applyEditTransaction(before, transaction, 'redo').workspace).toEqual(after);
    const edit = createTeachingTaskReviewDraft(source);
    edit.requirements.pop();
    edit.requirements[0].weight = 100;
    const removalPreview = previewTeachingTaskReview({ ...after, draft: edit });
    const removal = commitTeachingTaskReview({ ...after, preview: removalPreview, teacherConfirmed: true });
    expect(removal.status, removal.message).toBe('applied');
    expect(removal.conflicts).toEqual([]);
    expect(removal.changed.rubrics.data.rubrics[0].criteria.map((r) => r.criterionId)).toEqual(['estimate']);
    for (const feature of features)
      for (const fragment of ['Fit the missing batteries', 'Propose a concrete record', 'What observation is missing'])
        expect(JSON.stringify(removal.changed[feature].data).includes(fragment), `${feature}: ${fragment}`).toBe(false);
  });

  it('keeps teacher notes with their requirement when another requirement is removed', () => {
    const s = fullState();
    const first = commitTeachingTaskReview({ ...s, preview: previewTeachingTaskReview(s), teacherConfirmed: true });
    const current = workspace(first.courseMap, { ...s.deliverables, ...first.changed });
    const note = 'Teacher note: allow this group to explain the denominator orally.';
    const slide = current.deliverables.slideDecks.data.decks[0].slides.find((s) => s.taskRole === 'scaffold:estimate');
    expect(slide).toBeTruthy();
    slide.notes = note;
    const draft = createTeachingTaskReviewDraft(readTeachingTaskSources(current.courseMap)[0]);
    draft.requirements.pop();
    draft.requirements[0].weight = 100;
    const preview = previewTeachingTaskReview({ ...current, draft });
    const result = commitTeachingTaskReview({ ...current, preview, teacherConfirmed: true });
    expect(result.status, result.message).toBe('applied');
    expect(result.conflicts).toEqual([]);
    expect(result.changed.slideDecks.data.decks[0].slides.find((s) => s.taskRole === 'scaffold:estimate').notes).toBe(
      note,
    );
    expect(result.changed.slideDecks.data.decks[0].slides.some((s) => /next-evidence/.test(s.taskRole))).toBe(false);
  });
  it('compiles a new set of performances without the fixed three criterion identities', () => {
    const f = fixture(),
      task = compile(f);
    expect(task.criteria.map((c) => c.id)).toEqual(['estimate', 'next-evidence']);
    expect(task.question).toContain(f.plan.requirements[1].action);
    expect(task.answer).toContain(f.plan.requirements[1].answer);
    expect(task.criteria[1].levels).toEqual(f.plan.requirements[1].levels);
    expect(task.scaffoldQuestions[1]).toMatchObject(f.plan.requirements[1].guided);
    expect(task.errors[1].correction).toBe(f.plan.requirements[1].answer);
    expect(task.derivation.at(-1).result.populationRate).toBe('not-established');
    expect(task.contentValidation.automatedSemanticProof).toBe(false);
    expect(task.workedExample.verification.checked).toBe(false);
    const transfer = task.sequence.find((u) => u.kind === 'independent-transfer');
    expect(transfer.sources).toEqual(f.plan.practiceInputs.map((s) => s.text));
    expect(transfer.question).toContain(f.plan.requirements[1].transfer.action);
    expect(transfer.question).not.toContain('42.5%');
    expect(transfer.answer).toContain('20/25');
    expect(transfer.rubric.map((r) => r.criterionId)).toEqual(['estimate', 'next-evidence']);
    for (const example of task.contrastResponses)
      for (const judgment of example.judgments)
        for (const evidence of judgment.evidence)
          expect(example.response.slice(evidence.start, evidence.end)).toBe(evidence.quote);
  });

  it('removes a requirement from questions, references, feedback, scoring and independent practice together', () => {
    const f = fixture();
    const removed = f.plan.requirements.pop();
    f.plan.requirements[0].weight = 100;
    const task = compile(f);
    expect(task.criteria).toHaveLength(1);
    for (const text of [
      removed.action,
      removed.answer,
      removed.transfer.action,
      removed.transfer.answer,
      removed.guided.question,
    ])
      expect(
        JSON.stringify({
          question: task.question,
          answer: task.answer,
          criteria: task.criteria,
          sequence: task.sequence,
          errors: task.errors,
          workedExample: task.workedExample,
          contrast: task.contrastResponses,
        }),
      ).not.toContain(text);
    expect(task.derivation.at(-1).result.populationRate).toBe('not-established');
    expect(task.summary).toContain('does not establish');
    expect(task.sequence.filter((u) => u.kind === 'guided-practice')).toHaveLength(1);
  });

  it('changes weights without changing tasks, reference prose or practice content', () => {
    const f = fixture(),
      before = compile(f);
    f.plan.requirements[0].weight = 30;
    f.plan.requirements[1].weight = 70;
    const after = compile(f);
    for (const key of [
      'question',
      'answer',
      'directions',
      'reasoning',
      'scaffoldQuestions',
      'errors',
      'contrastResponses',
    ])
      expect(after[key]).toEqual(before[key]);
    expect(after.sequence.find((s) => s.kind === 'independent-transfer').question).toBe(
      before.sequence.find((s) => s.kind === 'independent-transfer').question,
    );
    expect(after.id).toBe(before.id);
    expect(after.revision).not.toBe(before.revision);
  });

  it('keeps points nonnegative and conserves a small total with many requirements', () => {
    const f = fixture();
    f.plan.requirements = Array.from({ length: 6 }, (_, i) => ({
      ...structuredClone(f.plan.requirements[0]),
      id: `requirement-${i}`,
      weight: i < 4 ? 17 : 16,
    }));
    const task = compile(f);
    const points = teachingTaskRubric(task, 4).map((r) => r.points);
    expect(points).toEqual([1, 1, 1, 1, 0, 0]);
    expect(points.reduce((a, b) => a + b, 0)).toBe(4);
    expect(teachingTaskRubric(task, 0).every((r) => r.points === 0)).toBe(true);
    const before = Object.fromEntries(teachingTaskRubric(task, 4).map((r) => [r.criterionId, r.points]));
    task.criteria.reverse();
    expect(Object.fromEntries(teachingTaskRubric(task, 4).map((r) => [r.criterionId, r.points]))).toEqual(before);
  });

  it.each([
    [
      'missing independent task',
      (p) => {
        delete p.requirements[0].transfer;
      },
    ],
    [
      'missing reasoning',
      (p) => {
        p.requirements[0].reasoning = [];
      },
    ],
    [
      'identical bands',
      (p) => {
        p.requirements[0].levels.developing = p.requirements[0].levels.exemplary;
      },
    ],
    [
      'complete response used as misconception',
      (p) => {
        p.requirements[0].examples.misconception = p.requirements[0].answer;
      },
    ],
    [
      'duplicate identity',
      (p) => {
        p.requirements[1].id = p.requirements[0].id;
      },
    ],
    [
      'missing source origin',
      (p) => {
        delete p.practiceInputs[0].kind;
      },
    ],
    [
      'wrong total',
      (p) => {
        p.requirements[0].weight = 100;
      },
    ],
    [
      'silent downgrade to old templates',
      (p) => {
        p.version = 1;
      },
    ],
  ])('rejects %s without guessing teaching content', (_, mutate) => {
    const f = fixture();
    mutate(f.plan);
    expect(validateTeachingOperationPlan(f.plan, f.inputs).valid).toBe(false);
    expect(compile(f)).toBeNull();
  });

  it('does not auto-confirm prose after a bound source edit or an objective edit', () => {
    const f = fixture();
    const next = structuredClone(f.inputs);
    next[0].text = next[0].text.replace('17', '19');
    expect(rebindTeachingOperationEdit(f.plan, f.inputs, next)).toBeNull();
    expect(rebindTeachingOperationEdit(f.plan, f.inputs, f.inputs)).toEqual(f.plan);
    expect(compile({ ...f, objective: 'Compare sampling plans instead of computing the proportion.' })).toBeNull();
    expect(compile({ ...f, plan: { ...f.plan, admission: { kind: 'model-proposal' } } })).toBeNull();
    expect(evaluateTeachingOperationPlan(f.plan, f.inputs).status).toBe('ready');
    const impossible = fixture();
    impossible.plan.bindings.denominator = impossible.plan.bindings.numerator;
    expect(validateTeachingOperationPlan(impossible.plan, impossible.inputs).valid).toBe(false);
  });

  it('remaps input identities without invalidating the same reviewed content', () => {
    const f = fixture(),
      inputs = f.inputs.map((s, i) => ({ ...s, id: `persistent-${i}` }));
    const plan = remapTeachingOperationInputs(f.plan, f.inputs, inputs);
    expect(compile({ ...f, inputs, plan }).answer).toBe(compile(f).answer);
  });

  it('preserves the requirement authority through save/read and commits a semantic edit through the existing transaction', () => {
    const s = state();
    expect(validateTeachingProgram(s.courseMap.teachingProgram).valid).toBe(true);
    expect(readTeachingTaskSources(JSON.parse(JSON.stringify(s.courseMap)))[0]).toEqual(s.source);
    expect(rebuildTeachingTaskSource(s.source).question).toBe(s.task.question);
    const draft = createTeachingTaskReviewDraft(s.source);
    expect(draft.version).toBe(2);
    draft.requirements[1].action =
      'Specify the event roster and identical route-choice question to use for a follow-up collection.';
    draft.requirements[1].guided.question = 'How will the event roster reveal missing responses?';
    draft.requirements[1].guided.answer =
      'Retain everyone on the roster and mark missing responses instead of dropping those entries.';
    const preview = previewTeachingTaskReview({ ...s, draft });
    expect(preview.status, preview.message).toBe('preview');
    expect(preview.modelCalls).toBe(0);
    expect(s.source.operationPlan.requirements[1].action).not.toBe(draft.requirements[1].action);
    const rejected = commitTeachingTaskReview({ ...s, preview });
    expect(rejected.status).toBe('needs-review');
    const applied = commitTeachingTaskReview({ ...s, preview, teacherConfirmed: true });
    expect(applied.status, applied.message).toBe('applied');
    expect(JSON.stringify(applied.changed.rubrics.data)).toContain(draft.requirements[1].action);
    expect(applied.conflicts).toEqual([]);
  });
});
