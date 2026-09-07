import { beforeAll, describe, expect, it } from 'vitest';
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
