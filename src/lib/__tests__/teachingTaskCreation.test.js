import { beforeAll, describe, expect, it } from 'vitest';
import { comparisonDesignFixture } from '../../../tests/fixtures/teaching/comparisonDesign.js';
import { buildCourseBlueprint, compileBlueprintDeliverables } from '../courseBlueprintCompiler.js';
import {
  createNewTeachingTaskReviewDraft,
  previewTeachingTaskReview,
  commitTeachingTaskReview,
  createTeachingTaskReviewDraft,
} from '../teachingTaskReview.js';
import {
  readTeachingTaskSources,
  validateTeachingProgram,
  restoreSnapshotTeachingProgram,
} from '../teachingProgram.js';
import { rememberTeacherEdit } from '../teachingTaskContentSync.js';
import { rebuildTeachingTaskSource } from '../teachingTaskSource.js';
import { deriveCourseGraphFromCourseMap } from '../courseGraph/index.js';
import {
  createEditTransaction,
  applyEditTransaction,
  appendEditTransaction,
  emptyEditHistory,
  restoreEditHistory,
  serializeEditHistory,
} from '../deliverableEditHistory.js';

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
const keys = {
  lessonPlans: 'lessonPlans',
  slideDecks: 'decks',
  assignments: 'assignments',
  rubrics: 'rubrics',
  discussions: 'discussions',
  quizBank: 'quizzes',
  studyGuides: 'studyGuides',
  courseFaq: 'faqs',
};
const records = [
  'The coastal field station checked 25 nesting boxes this week; 7 contained an active nest.',
  'The inland boxes were not checked. Their occupancy is unknown, so these observations do not establish occupancy across all station boxes.',
];
let baseline;
beforeAll(() => {
  const courseMap = {
    courseName: 'Field records',
    lessons: [
      {
        title: 'Recording observations',
        sections: [
          { topicSection: 'Record keeping', learningObjectives: 'Explain what an observation record contains.' },
        ],
      },
      {
        title: 'Interpreting a sample',
        sections: [
          {
            topicSection: 'Observed proportions',
            learningObjectives:
              'Calculate an observed proportion and distinguish the observed group from the target population.',
          },
        ],
      },
    ],
  };
  const compiled = compileBlueprintDeliverables(buildCourseBlueprint(courseMap), features);
  baseline = {
    courseMap,
    deliverables: Object.fromEntries(features.map((id) => [id, { status: 'done', data: compiled[id], stale: false }])),
  };
});
function setup() {
  const state = structuredClone(baseline);
  const draft = createNewTeachingTaskReviewDraft(state.courseMap, {
    lessonNumber: 2,
    operation: 'observed-proportion',
  });
  draft.inputs = records.map((text, index) => ({ id: `new-record-${index}`, text }));
  const choices = {
    countRecord: [0, records[0]],
    numerator: [0, '7'],
    denominator: [0, '25'],
    observedGroup: [0, '25 nesting boxes'],
    countedOutcome: [0, 'contained an active nest'],
    scopeRecord: [1, records[1]],
    missingGroup: [1, 'inland boxes'],
    targetGroup: [1, 'all station boxes'],
  };
  draft.bindings = Object.fromEntries(
    Object.entries(choices).map(([name, [i, quote]]) => [name, { inputId: draft.inputs[i].id, quote, occurrence: 0 }]),
  );
  return { ...state, draft };
}
function accept(state) {
  const preview = previewTeachingTaskReview(state);
  expect(preview.status, preview.message).toBe('preview');
  const result = commitTeachingTaskReview({ ...state, preview, teacherConfirmed: true });
  expect(result.status, result.message).toBe('applied');
  return {
    preview,
    result,
    next: { courseMap: result.courseMap, deliverables: { ...state.deliverables, ...result.changed } },
  };
}

describe('creation through the shared teaching transaction', () => {
  it.each([false, true])(
    'creates and revises a comparison design across materials and persisted history (Chinese: %s)',
    (zh) => {
      const state = structuredClone(baseline);
      const f = comparisonDesignFixture(zh);
      const draft = createNewTeachingTaskReviewDraft(state.courseMap, {
        lessonNumber: 2,
        operation: 'paired-condition-confound',
      });
      draft.inputs = f.inputs;
      draft.objective = f.objective;
      draft.bindings = Object.fromEntries(
        Object.entries(f.bindings).map(([role, span]) => [
          role,
          {
            inputId: span.inputId,
            quote: f.inputs.find((input) => input.id === span.inputId).text.slice(span.start, span.end),
            occurrence: 0,
          },
        ]),
      );
      const { result, next } = accept({ ...state, draft });
      expect(result.modelCalls).toBe(0);
      expect(Object.keys(result.changed).sort()).toEqual([...features].sort());
      const source = readTeachingTaskSources(next.courseMap)[0];
      const task = rebuildTeachingTaskSource(source);
      expect(task.operationPlan.operation).toBe('paired-condition-confound');
      const transfer = task.sequence.find((unit) => unit.kind === 'independent-transfer');
      expect(transfer).toBeTruthy();
      for (const [feature, key] of Object.entries(keys)) {
        expect(next.deliverables[feature].data[key][0], `${feature}: unrelated lesson`).toEqual(
          state.deliverables[feature].data[key][0],
        );
        const row = next.deliverables[feature].data[key][1];
        expect(feature === 'quizBank' ? row.practiceRecord.taskId : row.taskId, feature).toBe(source.id);
      }
      const oldGuide = next.deliverables.studyGuides.data;
      const editedGuide = structuredClone(oldGuide);
      const note = zh
        ? '教师说明：课堂只讨论方案，现场不操作热水。'
        : 'Teacher note: discuss the protocol; do not conduct the test in this room.';
      editedGuide.studyGuides[1].summary = note;
      next.deliverables.studyGuides.data = rememberTeacherEdit(oldGuide, editedGuide, ['studyGuides', 1, 'summary']);
      const revisedDraft = createTeachingTaskReviewDraft(source);
      revisedDraft.inputs[2].text = revisedDraft.inputs[2].text.replace(zh ? '24' : '32', zh ? '25' : '33');
      revisedDraft.bindings.availableUnits.quote = zh ? '25' : '33';
      const revised = accept({ ...next, draft: revisedDraft });
      const newSource = readTeachingTaskSources(revised.next.courseMap)[0];
      const newTask = rebuildTeachingTaskSource(newSource);
      expect(newSource.id).toBe(source.id);
      expect(newTask.derivation.find((step) => step.id === 'proposed-allocation').result).toMatchObject({
        total: zh ? 25 : 33,
        first: zh ? 12 : 16,
        second: zh ? 13 : 17,
      });
      expect(newTask.sequence.find((unit) => unit.kind === 'independent-transfer').question).toBe(transfer.question);
      expect(newTask.sequence.find((unit) => unit.kind === 'independent-transfer').answer).toBe(transfer.answer);
      expect(revised.next.deliverables.studyGuides.data.studyGuides[1].summary).toBe(note);
      for (const feature of features)
        expect(revised.next.deliverables[feature].data.teachingTaskSources, feature).toEqual([newSource]);
      const before = { ...next, courseGraph: deriveCourseGraphFromCourseMap(next.courseMap) };
      const after = { ...revised.next, courseGraph: deriveCourseGraphFromCourseMap(revised.next.courseMap) };
      const entry = JSON.parse(JSON.stringify(createEditTransaction(before, after)));
      const restored = restoreSnapshotTeachingProgram(JSON.parse(JSON.stringify(after)));
      expect(restored).toEqual(after);
      const { history } = appendEditTransaction(emptyEditHistory(), entry);
      expect(restoreEditHistory(JSON.parse(JSON.stringify(serializeEditHistory(history))), restored).status).toBe(
        'ready',
      );
      expect(applyEditTransaction(restored, entry, 'undo').workspace).toEqual(before);
      expect(applyEditTransaction(before, entry, 'redo').workspace).toEqual(after);
      expect(
        commitTeachingTaskReview({ ...revised.next, preview: revised.preview, teacherConfirmed: true }).status,
      ).toBe('needs-review');
    },
  );

  it('previews and confirms a real new task into lesson two without changing lesson one', () => {
    const state = setup(),
      before = structuredClone(state);
    const { preview, result, next } = accept(state);
    expect(state).toEqual(before);
    expect(preview.impacts.map((x) => x.featureId).sort()).toEqual([...features].sort());
    expect(commitTeachingTaskReview({ ...state, preview }).status).toBe('needs-review');
    const source = readTeachingTaskSources(next.courseMap)[0];
    expect(source.lessonNumber).toBe(2);
    expect(source.id).toBe(state.draft.taskId);
    expect(rebuildTeachingTaskSource(source).answer).toContain('28%');
    expect(validateTeachingProgram(next.courseMap.teachingProgram).valid).toBe(true);
    expect(next.courseMap.teachingProgram.sources.every((x) => x.origin.kind === 'teacher-provided')).toBe(true);
    expect(next.courseMap.lessons[0]).toEqual(state.courseMap.lessons[0]);
    for (const [feature, key] of Object.entries(keys)) {
      expect(next.deliverables[feature].data[key][0], feature).toEqual(state.deliverables[feature].data[key][0]);
      expect(
        JSON.stringify(next.deliverables[feature].data[key][1]).includes(source.id),
        `${feature} must contain the new task`,
      ).toBe(true);
    }
    for (const feature of features)
      expect(next.deliverables[feature].data.teachingTaskSources, feature).toEqual([source]);
    expect(result.modelCalls).toBe(0);
  });

  it('preserves an edited assignment, identifies its actual proposed replacement, and keeps an unrelated note', () => {
    const state = setup();
    const original = state.deliverables.assignments.data;
    const edited = structuredClone(original);
    edited.assignments[1].instructions = ['Teacher: work in our field notebooks, using the agreed notation.'];
    state.deliverables.assignments.data = rememberTeacherEdit(original, edited, ['assignments', 1, 'instructions']);
    state.deliverables.lessonPlans.data.lessonPlans[0].teacherNote = 'Bring the existing logbooks.';
    const { result, next } = accept(state);
    expect(next.deliverables.assignments.data.assignments[1].instructions).toEqual(edited.assignments[1].instructions);
    expect(
      result.conflicts.some(
        (c) =>
          c.featureId === 'assignments' &&
          c.path.join('.') === 'assignments.1.instructions' &&
          c.proposed.join(' ').includes('25'),
      ),
    ).toBe(true);
    expect(next.deliverables.lessonPlans.data.lessonPlans[0].teacherNote).toBe('Bring the existing logbooks.');
  });

  it('round-trips the created authority and all nine materials through persisted undo and redo', () => {
    const state = setup();
    const { next } = accept(state);
    const before = {
      courseMap: state.courseMap,
      courseGraph: deriveCourseGraphFromCourseMap(state.courseMap),
      deliverables: state.deliverables,
    };
    const after = { ...next, courseGraph: deriveCourseGraphFromCourseMap(next.courseMap) };
    const entry = JSON.parse(JSON.stringify(createEditTransaction(before, after)));
    const restored = restoreSnapshotTeachingProgram(JSON.parse(JSON.stringify(after)));
    expect(restored).toEqual(after);
    const { history } = appendEditTransaction(emptyEditHistory(), entry);
    const historyState = restoreEditHistory(JSON.parse(JSON.stringify(serializeEditHistory(history))), restored);
    expect(historyState.status, historyState.message).toBe('ready');
    expect(applyEditTransaction(restored, entry, 'undo').workspace).toEqual(before);
    expect(applyEditTransaction(before, entry, 'redo').workspace).toEqual(after);
  });

  it('keeps identity when the new task is edited and rejects a second primary task in that lesson', () => {
    const { next } = accept(setup());
    expect(
      createNewTeachingTaskReviewDraft(next.courseMap, { lessonNumber: 2, operation: 'observed-proportion' }).status,
    ).toBe('needs-review');
    const source = readTeachingTaskSources(next.courseMap)[0];
    const draft = createTeachingTaskReviewDraft(source);
    draft.inputs[0].text = draft.inputs[0].text.replace('7 contained', '9 contained');
    draft.bindings.numerator.quote = '9';
    const updated = accept({ ...next, draft }).next;
    const revised = readTeachingTaskSources(updated.courseMap)[0];
    expect(revised.id).toBe(source.id);
    expect(rebuildTeachingTaskSource(revised).answer).toContain('36%');
    for (const [feature, key] of Object.entries(keys)) {
      expect(updated.deliverables[feature].data[key][0], `${feature}: unrelated lesson after later edit`).toEqual(
        next.deliverables[feature].data[key][0],
      );
      expect(JSON.stringify(updated.deliverables[feature].data[key][1]).includes(revised.id), feature).toBe(true);
    }
  });

  it('rejects stale drafts, stale previews, removed lessons and incomplete evidence without writes', () => {
    const state = setup();
    const preview = previewTeachingTaskReview(state);
    const changed = structuredClone(state);
    changed.courseMap.lessons[0].title = 'Teacher changed the lesson';
    expect(previewTeachingTaskReview(changed).status).toBe('needs-review');
    expect(commitTeachingTaskReview({ ...changed, preview, teacherConfirmed: true }).status).toBe('needs-review');
    const invalid = structuredClone(state);
    invalid.draft.bindings.targetGroup.quote = 'an invented population';
    expect(previewTeachingTaskReview(invalid).status).toBe('needs-review');
    invalid.draft.inputs = [];
    expect(previewTeachingTaskReview(invalid).status).toBe('needs-review');
    const noLesson = structuredClone(state);
    noLesson.courseMap.lessons.pop();
    expect(previewTeachingTaskReview(noLesson).status).toBe('needs-review');
    expect(readTeachingTaskSources(state.courseMap)).toEqual([]);
  });
});
