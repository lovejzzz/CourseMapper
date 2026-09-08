import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import {
  createTeachingTaskReviewDraft,
  createNewTeachingTaskReviewDraft,
  previewTeachingTaskReview,
  commitTeachingTaskReview,
  resolveTeachingTaskReviewDraft,
  mergeTeachingSourceSuggestions,
} from '../teachingTaskReview.js';
import {
  readTeachingTaskSources,
  validateTeachingProgram,
  restoreSnapshotTeachingProgram,
} from '../teachingProgram.js';
import { deriveCourseGraphFromCourseMap } from '../courseGraph/index.js';
import {
  buildCourseBlueprint,
  compileBlueprintDeliverables,
  BLUEPRINT_COMPILE_CONTEXT,
  reconcileCourseMapWithBlueprintSemanticAdmission,
} from '../courseBlueprintCompiler.js';
import { rememberTeacherEdit, resolveTaskSyncConflict } from '../teachingTaskContentSync.js';
import { deliverableToCsvRows } from '../exporters/csvExporter.js';
import { teachingOutcomeChoices } from '../teachingGoalAlignment.js';
import { reconcileTeachingGoalReview } from '../teachingGoalReview.js';
import { evaluateWorkspaceReadiness } from '../deliverableReadiness.js';
import { editLinkedTeachingGoal } from '../teachingGoalEdit.js';
import {
  createEditTransaction,
  applyEditTransaction,
  appendEditTransaction,
  emptyEditHistory,
  serializeEditHistory,
  restoreEditHistory,
} from '../deliverableEditHistory.js';
import { prepareProjectSnapshotForRestore } from '../projectSnapshotSanitizer.js';

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
const facts = [
  'A fictional permit log initially records 120 seats for a hall.',
  'A later entry explicitly amends the permitted capacity to 90 seats from 1 July.',
  'An attendance photograph has no reliable date.',
];
const objective = 'Explain how an amended record changes the interpretation of an earlier entry.';
let baseline;
beforeAll(() => {
  const map = {
    courseName: 'Record review',
    lessons: [
      {
        title: 'Records',
        sections: [
          {
            topicSection: 'Record revisions',
            learningObjectives: objective,
            weeklyAssessments: 'Analyze the rule and its amendment.',
          },
        ],
      },
    ],
  };
  const blueprint = buildCourseBlueprint(map, {
    sourceBrief: `${objective}\nSource facts:\n${facts.map((text, i) => `${i + 1}. ${text}`).join('\n')}`,
    sessionMinutes: 50,
    instructorProvidedFacts: facts,
  });
  const generated = compileBlueprintDeliverables(blueprint, features);
  baseline = {
    courseMap: reconcileCourseMapWithBlueprintSemanticAdmission(map, generated[BLUEPRINT_COMPILE_CONTEXT]),
    deliverables: Object.fromEntries(features.map((id) => [id, { status: 'done', stale: false, data: generated[id] }])),
  };
});
function setup() {
  const state = structuredClone(baseline);
  const source = readTeachingTaskSources(state.courseMap)[0];
  const draft = createTeachingTaskReviewDraft(source, state.deliverables.rubrics.data, 'rubrics');
  return { ...state, source, draft };
}
function changeCount(draft, value = '104') {
  draft.inputs[1].text = draft.inputs[1].text.replace('90 seats', `${value} seats`);
  draft.bindings.amendedValue.quote = value;
}

describe('reviewed teaching task transactions', () => {
  it('edits a linked course target and restores its review state and teacher content as one saved transaction', () => {
    const state = setup();
    const target = teachingOutcomeChoices(deriveCourseGraphFromCourseMap(state.courseMap), 1)[0];
    state.draft.goalAlignment = {
      version: 1,
      targets: [{ outcomeRef: target.id, revision: target.revision }],
      requirementLinks: state.draft.requirements.map((r) => ({ requirementId: r.id, outcomeRefs: [target.id] })),
    };
    const accepted = commitTeachingTaskReview({
      ...state,
      preview: previewTeachingTaskReview(state),
      teacherConfirmed: true,
    });
    expect(accepted.status).toBe('applied');
    const workspace = {
      courseMap: accepted.courseMap,
      courseGraph: deriveCourseGraphFromCourseMap(accepted.courseMap),
      deliverables: accepted.changed,
    };
    workspace.deliverables.rubrics.data.rubrics[0].title = 'Teacher wording must survive';
    const before = structuredClone(workspace);
    const result = editLinkedTeachingGoal({
      ...workspace,
      lessonIdx: 0,
      sectionIdx: 0,
      newValue: 'Design a source-checking procedure that resolves missing dates.',
    });
    expect(result.status).toBe('applied');
    expect(workspace).toEqual(before);
    expect(result.courseGraph.outcomes[0].id).toBe(target.id);
    expect(result.courseMap.teachingProgram).toEqual(before.courseMap.teachingProgram);
    for (const id of features) {
      const { taskGoalReview, ...content } = result.changed[id].data;
      expect(content).toEqual(before.deliverables[id].data);
      expect(taskGoalReview[0].message).toContain('changed');
    }
    const after = {
      courseMap: result.courseMap,
      courseGraph: result.courseGraph,
      deliverables: { ...workspace.deliverables, ...result.changed },
    };
    const transaction = createEditTransaction(before, after);
    const saved = prepareProjectSnapshotForRestore(
      JSON.parse(
        JSON.stringify({
          ...after,
          editHistory: serializeEditHistory(appendEditTransaction(emptyEditHistory(), transaction).history),
        }),
      ),
    );
    expect(restoreEditHistory(saved.editHistory, saved).status).toBe('ready');
    const undone = applyEditTransaction(saved, transaction, 'undo');
    expect(undone.status).toBe('applied');
    expect(undone.workspace.courseGraph).toEqual(before.courseGraph);
    expect(undone.workspace.deliverables).toEqual(before.deliverables);
    const redone = applyEditTransaction(undone.workspace, transaction, 'redo');
    expect(redone.status).toBe('applied');
    expect(redone.workspace.courseGraph).toEqual(after.courseGraph);
    expect(redone.workspace.deliverables).toEqual(after.deliverables);

    const added = editLinkedTeachingGoal({
      ...workspace,
      lessonIdx: 0,
      sectionIdx: 0,
      newValue: 'Identify the author of each entry.\n' + target.text,
    });
    expect(added.status).toBe('applied');
    expect(added.courseGraph.outcomes.find((o) => o.text === target.text).id).toBe(target.id);
    const removed = editLinkedTeachingGoal({ ...workspace, lessonIdx: 0, sectionIdx: 0, newValue: '' });
    expect(removed.status).toBe('applied');
    expect(removed.courseGraph.outcomes).toHaveLength(0);
    expect(removed.changed.rubrics.data.taskGoalReview[0].message).toContain('no longer available');
  });
  it('changes a task objective only with reviewed requirement-to-target links and preserves the actual curriculum targets', () => {
    const state = setup();
    const graph = deriveCourseGraphFromCourseMap(state.courseMap);
    const target = teachingOutcomeChoices(graph, 1)[0];
    state.draft.objective =
      'Explain which rule applies after the amendment and why an undated photograph is insufficient.';
    expect(previewTeachingTaskReview(state).status).toBe('needs-review');
    state.draft.goalAlignment = {
      version: 1,
      targets: [{ outcomeRef: target.id, revision: target.revision }],
      requirementLinks: state.draft.requirements.map((r) => ({ requirementId: r.id, outcomeRefs: [target.id] })),
    };
    const before = structuredClone(state);
    const preview = previewTeachingTaskReview({ ...state, courseGraph: graph });
    expect(preview.status).toBe('preview');
    expect(state).toEqual(before);
    const accepted = commitTeachingTaskReview({ ...state, courseGraph: graph, preview, teacherConfirmed: true });
    expect(accepted.status).toBe('applied');
    expect(readTeachingTaskSources(accepted.courseMap)[0].objective).toBe(state.draft.objective);
    expect(accepted.courseMap.lessons[0].sections[0].learningObjectives).toBe(
      state.courseMap.lessons[0].sections[0].learningObjectives,
    );
    expect(accepted.courseMap.teachingProgram.tasks[0].objectiveRef).toBe(
      state.courseMap.teachingProgram.tasks[0].objectiveRef,
    );
    for (const id of features)
      expect(
        accepted.changed[id].data.teachingTaskSources[0].operationPlan.goalAlignment.requirementLinks,
      ).toHaveLength(3);
    expect(accepted.changed.lessonPlans.data.lessonPlans[0].objectives).toEqual([state.draft.objective]);
    const changedGraph = structuredClone(graph);
    changedGraph.outcomes[0].text = 'Analyze a different task objective.';
    expect(
      commitTeachingTaskReview({ ...state, courseGraph: changedGraph, preview, teacherConfirmed: true }).status,
    ).toBe('needs-review');
    const pending = reconcileTeachingGoalReview(accepted.changed, accepted.courseMap, changedGraph);
    for (const id of features) expect(pending[id].data.taskGoalReview[0].message).toContain('changed');
    const readiness = evaluateWorkspaceReadiness({
      courseMap: accepted.courseMap,
      deliverables: pending,
      selectedFeatures: ['lessonPlans'],
    });
    expect(
      readiness.issues.some((issue) => issue.message.includes('learning target') && issue.severity === 'blocker'),
    ).toBe(true);
    const clear = reconcileTeachingGoalReview(pending, accepted.courseMap, graph);
    for (const id of features) expect(clear[id].data.taskGoalReview).toBeUndefined();
  });
  it('fills a stale excerpt from corrected source text without losing still-valid teacher choices', () => {
    const { draft } = setup();
    draft.inputs[1].text = draft.inputs[1].text.replace('90 seats', '104 seats');
    const merged = mergeTeachingSourceSuggestions(draft, {
      amendedValue: { inputId: draft.inputs[1].id, quote: '104', occurrence: 0 },
      observationLimit: { inputId: 'missing-source', quote: 'invented', occurrence: 0 },
    });
    expect(merged.bindings.amendedValue.quote).toBe('104');
    expect(merged.bindings.priorValue).toEqual(draft.bindings.priorValue);
    expect(merged.bindings.observationLimit).toEqual(draft.bindings.observationLimit);
    expect(merged.filledRoles).toEqual(['amendedValue']);
    expect(draft.bindings.amendedValue.quote).toBe('90');
  });
  it('does not silently reset an explicit invalid occurrence when merging or applying a draft', () => {
    const state = setup();
    const original = structuredClone(state.draft.bindings.amendedValue);
    state.draft.bindings.amendedValue.occurrence = 1;
    const unchanged = mergeTeachingSourceSuggestions(state.draft, { amendedValue: { ...original, occurrence: 1 } });
    expect(unchanged.preservedRoles).not.toContain('amendedValue');
    expect(unchanged.filledRoles).not.toContain('amendedValue');
    expect(previewTeachingTaskReview(state).status).toBe('needs-review');
    const corrected = mergeTeachingSourceSuggestions(state.draft, { amendedValue: original });
    expect(corrected.filledRoles).toContain('amendedValue');
    state.draft.bindings = corrected.bindings;
    expect(previewTeachingTaskReview(state).status).not.toBe('needs-review');
  });
  it('rejects a draft opened before a different source transaction, even before preview', () => {
    const state = setup();
    const oldDraft = structuredClone(state.draft);
    changeCount(state.draft);
    const preview = previewTeachingTaskReview(state);
    const accepted = commitTeachingTaskReview({ ...state, preview, teacherConfirmed: true });
    const latest = {
      courseMap: accepted.courseMap,
      deliverables: { ...state.deliverables, ...accepted.changed },
      draft: oldDraft,
    };
    const before = structuredClone(latest);
    expect(previewTeachingTaskReview(latest).status).toBe('needs-review');
    expect(latest).toEqual(before);
  });

  it.each(['rubrics', 'studyGuides'])('does not erase a newer unreviewed source edit in %s', (featureId) => {
    const state = setup();
    const data = state.deliverables[featureId].data;
    const collection = featureId === 'rubrics' ? data.rubrics : data.studyGuides;
    data.taskSourceReview = 'Source relationship needs review.';
    collection[0].sourceEvidenceBrief.claims[1] = 'Revised wording: 107 seats from 1 July.';
    const before = structuredClone(state);
    expect(previewTeachingTaskReview(state).status).toBe('needs-review');
    expect(state).toEqual(before);
  });

  it('updates the expanded FAQ consumed by the editor/exporter and preserves the real older four-question version for review', () => {
    const state = setup();
    const fixture = JSON.parse(fs.readFileSync('tests/fixtures/teaching/v0192-amendment-faq.json', 'utf8'));
    const row = state.deliverables.courseFaq.data.faqs[0];
    delete row.qs;
    row.questions = fixture.questions;
    state.draft.requirements = [
      { id: 'evidence', weight: 20 },
      { id: 'reasoning', weight: 50 },
      { id: 'boundary', weight: 30 },
    ];
    const preview = previewTeachingTaskReview(state);
    expect(preview.status).toBe('preview');
    const result = commitTeachingTaskReview({ ...state, preview, teacherConfirmed: true });
    expect(result.status).toBe('applied');
    const faq = result.changed.courseFaq.data;
    expect(faq.taskSyncConflicts).toHaveLength(1);
    expect(faq.taskSyncConflicts[0].path).toEqual(['faqs', 0, 'questions']);
    expect(faq.taskSyncConflicts[0].current).toEqual(fixture.questions);
    expect(faq.faqs[0].qs).toBeUndefined();
    const resolved = resolveTaskSyncConflict(faq, 0, true);
    expect(resolved.faqs[0].questions).toHaveLength(6);
    const rows = deliverableToCsvRows('courseFaq', resolved).rows;
    const evaluated = rows.find((row) => row[2] === 'How will my response be evaluated?');
    expect(evaluated[3]).toContain('evidence: 20%');
    expect(evaluated[3]).toContain('task: 50%');
    expect(evaluated[3]).not.toContain('35%');
    const kept = resolveTaskSyncConflict(faq, 0, false);
    expect(kept.faqs[0].questions).toEqual(fixture.questions);
    expect(kept.teacherEdits[0].path).toEqual(['faqs', 0, 'questions']);
  });
  it('previews without mutations, requires confirmation, then updates saved weights and all related snapshots', () => {
    const state = setup();
    const before = structuredClone(state);
    state.draft.requirements = [
      { id: 'evidence', weight: 20 },
      { id: 'reasoning', weight: 50 },
      { id: 'boundary', weight: 30 },
    ];
    const preview = previewTeachingTaskReview(state);
    expect(preview.status).toBe('preview');
    expect(state.courseMap).toEqual(before.courseMap);
    expect(state.deliverables).toEqual(before.deliverables);
    expect(preview.impacts.map((i) => i.featureId)).toEqual(features);
    expect(commitTeachingTaskReview({ ...state, preview }).status).toBe('needs-review');
    const result = commitTeachingTaskReview({ ...state, preview, teacherConfirmed: true });
    expect(result.status).toBe('applied');
    expect(result.modelCalls).toBe(0);
    expect(validateTeachingProgram(result.courseMap.teachingProgram).valid).toBe(true);
    expect(result.courseMap.teachingProgram.tasks[0].id).toBe(state.source.id);
    expect(result.changed.rubrics.data.rubrics[0].criteria.map((c) => c.weight)).toEqual([20, 50, 30]);
    for (const id of features)
      expect(result.changed[id].data.teachingTaskSources[0].operationPlan.requirements).toEqual(
        state.draft.requirements,
      );
    expect(result.conflicts).toEqual([]);
    const snapshot = {
      courseMap: result.courseMap,
      courseGraph: deriveCourseGraphFromCourseMap(result.courseMap),
      deliverables: result.changed,
    };
    expect(
      restoreSnapshotTeachingProgram(JSON.parse(JSON.stringify(snapshot))).courseMap.teachingProgram.revision,
    ).toBe(result.courseMap.teachingProgram.revision);
  });

  it('accepts reviewed source wording outside the old parser and preserves independent practice values', () => {
    const state = setup();
    state.draft.inputs[1].text = 'Replacement entry for this hall: effective 1 July, 104 seats.';
    state.draft.bindings.amendedValue.quote = '104';
    const preview = previewTeachingTaskReview(state);
    expect(preview.status).toBe('preview');
    expect(preview.task.answer).toContain('104 seats');
    const result = commitTeachingTaskReview({ ...state, preview, teacherConfirmed: true });
    expect(result.status).toBe('applied');
    expect(result.conflicts).toEqual([]);
    const guides = JSON.stringify(result.changed.studyGuides.data);
    expect(guides).not.toContain('90 seats');
    expect(guides).toContain('24 places');
    expect(guides).toContain('36 places');
  });

  it.each(['teacher text', 'course revision'])(
    'rejects a preview after a newer %s change without touching live data',
    (kind) => {
      const state = setup();
      changeCount(state.draft);
      const preview = previewTeachingTaskReview(state);
      if (kind === 'teacher text') state.deliverables.rubrics.data.rubrics[0].title = 'Newer teacher title';
      else state.courseMap.courseName = 'Newer course title';
      const before = structuredClone(state);
      const result = commitTeachingTaskReview({ ...state, preview, teacherConfirmed: true });
      expect(result.status).toBe('needs-review');
      expect(result.message).toContain('changed after this preview');
      expect(state).toEqual(before);
    },
  );

  it('rejects a draft changed after preview and never applies caller-supplied patches', () => {
    const state = setup();
    changeCount(state.draft);
    const preview = previewTeachingTaskReview(state);
    preview.draft.inputs[1].text = 'An altered source';
    preview.changed = { rubrics: { data: 'overwrite' } };
    expect(commitTeachingTaskReview({ ...state, preview, teacherConfirmed: true }).status).toBe('needs-review');
    expect(state.deliverables.rubrics).toEqual(baseline.deliverables.rubrics);
  });

  it('retains a competing teacher answer with a concrete updated proposal', () => {
    const state = setup();
    const original = structuredClone(state.deliverables.rubrics.data);
    const edited = structuredClone(original);
    edited.rubrics[0].anchorExampleSet.partialSample += ' Teacher note: explain the date.';
    state.deliverables.rubrics.data = rememberTeacherEdit(original, edited, [
      'rubrics',
      0,
      'anchorExampleSet',
      'partialSample',
    ]);
    changeCount(state.draft);
    const preview = previewTeachingTaskReview(state);
    expect(preview.impacts.find((i) => i.featureId === 'rubrics').conflicts).toHaveLength(1);
    const result = commitTeachingTaskReview({ ...state, preview, teacherConfirmed: true });
    expect(result.changed.rubrics.data.rubrics[0].anchorExampleSet.partialSample).toContain('90 seats');
    expect(result.changed.rubrics.data.rubrics[0].anchorExampleSet.partialSample).toContain('Teacher note');
    expect(result.changed.rubrics.data.taskSyncConflicts[0].proposed).toContain('104 seats');
    expect(result.changed.rubrics.stale).toBe(true);
  });

  it('recovers an explicitly saved source draft into review without losing the changed sentence', () => {
    const state = setup();
    const data = state.deliverables.rubrics.data;
    data.taskSourceReview = 'This relationship needs review.';
    data.rubrics[0].sourceEvidenceBrief.claims[1] = 'Reworded rule: 104 seats from 1 July.';
    const draft = createTeachingTaskReviewDraft(state.source, data);
    expect(draft.inputs[1].text).toBe('Reworded rule: 104 seats from 1 July.');
    expect(readTeachingTaskSources(state.courseMap)[0].inputs[1].text).toBe(facts[1]);
  });

  it('rejects invalid totals, source identities, and ambiguous text positions', () => {
    const state = setup();
    state.draft.requirements[0].weight = 99;
    expect(previewTeachingTaskReview(state).message).toContain('total 100');
    state.draft = createTeachingTaskReviewDraft(state.source);
    state.draft.inputs[0].id = 'different-source';
    expect(previewTeachingTaskReview(state).status).toBe('needs-review');
    state.draft = createTeachingTaskReviewDraft(state.source);
    state.draft.inputs[1].text += ' The stated date is 1 July.';
    state.draft.bindings.effectiveDate.occurrence = null;
    expect(resolveTeachingTaskReviewDraft(state.source, state.draft, '2026-09-06T00:00:00.000Z').message).toContain(
      'occurrence',
    );
    state.draft.bindings.effectiveDate.occurrence = 0;
    expect(resolveTeachingTaskReviewDraft(state.source, state.draft, '2026-09-06T00:00:00.000Z').status).toBe('valid');
  });
});

describe('original brief to new teaching task draft', () => {
  const course = { lessons: [{ title: 'Records', sections: [{ learningObjectives: 'Existing lesson objective' }] }] };
  const draft = (sourceBrief, map = course) =>
    createNewTeachingTaskReviewDraft(map, { lessonNumber: 1, operation: 'record-relative-day', sourceBrief });
  it('preserves labeled source prose and an explicit single-lesson objective without applying a task', () => {
    const value = draft(
      '教学目标：区分记录日期与事件日期。\n来源：\n信件：信中写道：“昨天完成；不要猜测年份。”\n访谈：录音日期为10月4日。\n任务：解释日期关系',
    );
    expect(value.inputs.map((row) => row.text)).toEqual([
      '信件: 信中写道：“昨天完成；不要猜测年份。”',
      '访谈: 录音日期为10月4日。',
    ]);
    expect(value.objective).toBe('区分记录日期与事件日期。');
    expect(Object.values(value.bindings).every((binding) => !binding.inputId)).toBe(true);
    expect(course.teachingProgram).toBeUndefined();
  });
  it('does not silently truncate an oversized packet or substitute a generated summary', () => {
    const value = draft('Sources:\n' + Array.from({ length: 9 }, (_, i) => `r${i}: Original record ${i}`).join('\n'));
    expect(value.inputs.map((row) => row.text)).toEqual(['']);
    expect(value.message).toContain('more than eight');
    expect(draft('Generated summary: an event happened yesterday.').inputs[0].text).toBe('');
    expect(draft('Sources:\na: First\na: Ambiguous duplicate').inputs[0].text).toBe('');
  });
  it('does not assign a course-level objective to each lesson or overwrite the existing map', () => {
    const map = { lessons: [...course.lessons, { title: 'Second', sections: [] }] };
    expect(draft('Objective: Whole course objective\nSources:\na: Original record', map).objective).toBe(
      'Existing lesson objective',
    );
    expect(map.lessons[0].sections[0].learningObjectives).toBe('Existing lesson objective');
  });
});
