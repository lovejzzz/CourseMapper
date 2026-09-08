import { expect, it } from 'vitest';
import {
  createTeachingOperationPlan,
  evaluateTeachingOperationPlan,
  rebindTeachingOperationEdit,
} from '../teachingOperationPlan.js';
import { buildSharedTeachingTask } from '../compilerTeachingTask.js';
import { teachingTaskSourceFromLesson, rebuildTeachingTaskSource } from '../teachingTaskSource.js';
import { withTeachingTaskSources } from '../teachingProgram.js';
import {
  buildCourseBlueprint,
  compileBlueprintDeliverables,
  BLUEPRINT_COMPILE_CONTEXT,
  reconcileCourseMapWithBlueprintSemanticAdmission,
} from '../courseBlueprintCompiler.js';
import { applyTeachingTaskSourceEdit } from '../teachingTaskContentSync.js';

const objective = 'Distinguish a broad interval, a relative event day and the recording of a recollection.';
function fixture(admission = { kind: 'teacher-confirmed' }) {
  const inputs = [
    {
      id: 'letter',
      text: 'Fictional letter dated 18 August: We finished installing the pump yesterday. The year is not given.',
    },
    {
      id: 'interview',
      text: 'Interview recorded on 4 October: the pump was installed sometime in August. The archive identifies the same installation.',
    },
    { id: 'note', text: 'No source establishes when the pump first operated successfully.' },
  ];
  const whole = (i) => ({ inputId: inputs[i].id, start: 0, end: inputs[i].text.length });
  const span = (i, text) => ({
    inputId: inputs[i].id,
    start: inputs[i].text.indexOf(text),
    end: inputs[i].text.indexOf(text) + text.length,
  });
  const bindings = {
    datedRecord: whole(0),
    recordDate: span(0, '18 August'),
    eventClaim: span(0, 'We finished installing the pump yesterday.'),
    relativeDay: span(0, 'yesterday'),
    recollectionRecord: whole(1),
    recordingDate: span(1, '4 October'),
    broadMonth: span(1, 'August'),
    sameEventEvidence: span(1, 'The archive identifies the same installation.'),
    limitRecord: whole(2),
  };
  const plan = createTeachingOperationPlan({ operation: 'record-relative-day', inputs, bindings, admission });
  return { inputs, plan };
}
function task(plan, inputs) {
  return buildSharedTeachingTask({
    lessonId: 'chronology',
    objective,
    operationPlan: plan,
    sourceInputs: inputs,
    admitted: true,
  });
}

it('computes the relative day and compatible month only after premise review', () => {
  const { inputs, plan } = fixture({ kind: 'model-proposal' });
  expect(task(plan, inputs)).toBeNull();
  plan.admission.kind = 'teacher-confirmed';
  const evaluated = evaluateTeachingOperationPlan(plan, inputs);
  expect(evaluated.compatibility).toBe('compatible');
  expect(evaluated.inference.candidates).toEqual([{ year: null, month: 8, day: 17, yearOffset: 0 }]);
  const result = task(plan, inputs);
  expect(result.answer).toContain('17 August');
  expect(result.answer).toContain('4 October dates the recording');
  expect(result.answer).toContain('year remains unknown');
  expect(result.answer).toContain('first operated successfully');
  expect(result.criteria.map((c) => c.weight)).toEqual([30, 35, 35]);
  expect(result.criteria[1].levels.proficient).toContain('17 August');
});

it('rebuilds the same task identity after a date edit and updates its answer and rubric', () => {
  const { inputs, plan } = fixture();
  const before = task(plan, inputs);
  const nextInputs = inputs.map((input) => ({ ...input, text: input.text.replace('18 August', '1 September') }));
  const nextPlan = rebindTeachingOperationEdit(plan, inputs, nextInputs);
  const after = task(nextPlan, nextInputs);
  expect(after.id).toBe(before.id);
  expect(after.revision).not.toBe(before.revision);
  expect(after.answer).toContain('31 August');
  expect(after.answer).not.toContain('17 August');
  expect(after.criteria[1].levels.proficient).toContain('31 August');
  const source = teachingTaskSourceFromLesson({
    id: 'lesson-1',
    lessonNumber: 1,
    title: 'Dates',
    teachingTask: after,
    teachingTaskScope: 'primary-task',
  });
  const restored = rebuildTeachingTaskSource(JSON.parse(JSON.stringify(source)));
  expect(restored.answer).toBe(after.answer);
  expect(restored.criteria).toEqual(after.criteria);
});

it('keeps conflicting months and missing-year leap ambiguity explicit', () => {
  const { inputs, plan } = fixture();
  const conflicting = inputs.map((input) => ({ ...input, text: input.text.replace('18 August', '2 September') }));
  expect(
    evaluateTeachingOperationPlan(rebindTeachingOperationEdit(plan, inputs, conflicting), conflicting).compatibility,
  ).toBe('conflicting');
  const ambiguous = inputs.map((input) => ({ ...input, text: input.text.replace('18 August', '1 March') }));
  const evaluated = evaluateTeachingOperationPlan(rebindTeachingOperationEdit(plan, inputs, ambiguous), ambiguous);
  expect(evaluated.inference.status).toBe('ambiguous');
  expect(evaluated.inference.candidates.map((date) => date.day)).toEqual([29, 28]);
});

it('rejects wrong source ownership and a relative word outside the selected event claim', () => {
  const { inputs, plan } = fixture();
  plan.bindings.eventClaim.end = plan.bindings.relativeDay.start;
  expect(evaluateTeachingOperationPlan(plan, inputs).status).toBe('needs-review');
  const second = fixture();
  second.plan.bindings.recordDate = second.plan.bindings.recordingDate;
  expect(evaluateTeachingOperationPlan(second.plan, second.inputs).status).toBe('needs-review');
  const bareDay = fixture();
  bareDay.plan.bindings.eventClaim = { ...bareDay.plan.bindings.relativeDay };
  expect(
    evaluateTeachingOperationPlan(bareDay.plan, bareDay.inputs).issues.some((issue) => issue.binding === 'eventClaim'),
  ).toBe(true);
});

it('projects the reviewed chronology into all nine materials and synchronizes a source-date edit', () => {
  const { inputs, plan } = fixture();
  const teachingTask = task(plan, inputs);
  const source = teachingTaskSourceFromLesson({
    id: 'lesson-1',
    lessonNumber: 1,
    title: 'Dates',
    teachingTask,
    teachingTaskScope: 'primary-task',
  });
  const map = withTeachingTaskSources(
    {
      courseName: 'Source chronology',
      lessons: [
        {
          lessonNumber: 1,
          title: 'Dates',
          sections: [
            { topicSection: 'Dates', learningObjectives: objective, weeklyAssessments: 'An attributed chronology.' },
          ],
        },
      ],
    },
    [source],
  );
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
  const compiled = compileBlueprintDeliverables(buildCourseBlueprint(map, { sessionMinutes: 50 }), features);
  const entries = Object.fromEntries(features.map((id) => [id, { status: 'done', data: compiled[id], stale: false }]));
  for (const id of features)
    expect(compiled[id].teachingTaskSources[0].operationPlan.operation, id).toBe('record-relative-day');
  for (const id of ['assignments', 'rubrics', 'quizBank', 'studyGuides'])
    expect(JSON.stringify(compiled[id]).includes('17 August'), id).toBe(true);
  const oldData = entries.studyGuides.data;
  const newData = structuredClone(oldData);
  newData.studyGuides[0].sourceEvidenceBrief.claims[0] = inputs[0].text.replace('18 August', '1 September');
  const result = applyTeachingTaskSourceEdit({
    featureId: 'studyGuides',
    oldData,
    newData,
    editPath: ['studyGuides', 0, 'sourceEvidenceBrief', 'claims', 0],
    deliverables: entries,
    courseMap: reconcileCourseMapWithBlueprintSemanticAdmission(map, compiled[BLUEPRINT_COMPILE_CONTEXT]),
  });
  expect(result.status, result.message).toBe('applied');
  expect(result.conflicts).toEqual([]);
  for (const id of features) {
    expect(JSON.stringify(result.changed[id].data).includes('1 September'), id).toBe(true);
    expect(JSON.stringify(result.changed[id].data).includes('17 August'), id).toBe(false);
    if (['assignments', 'rubrics', 'quizBank', 'studyGuides'].includes(id))
      expect(JSON.stringify(result.changed[id].data).includes('31 August'), id).toBe(true);
    expect(result.changed[id].data.teachingTaskSources[0].operationPlan.operation).toBe('record-relative-day');
  }
});
