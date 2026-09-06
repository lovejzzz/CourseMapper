import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import {
  buildCourseBlueprint,
  compileBlueprintDeliverables,
  BLUEPRINT_COMPILE_CONTEXT,
  reconcileCourseMapWithBlueprintSemanticAdmission,
} from '../courseBlueprintCompiler.js';
import { extractInstructorProvidedFacts } from '../sourceBriefConstraints.js';
import { buildSharedTeachingTask } from '../compilerTeachingTask.js';
import {
  applyTeachingTaskSourceEdit,
  mergeTaskProjection,
  rememberTeacherEdit,
  preserveTeacherEdits,
  resolveTaskSyncConflict,
} from '../teachingTaskContentSync.js';
import { deriveCourseGraphFromCourseMap, buildBlueprintFromGraph } from '../courseGraph/index.js';
import { evaluateWorkspaceReadiness } from '../deliverableReadiness.js';

const features = [
  'lessonPlans',
  'slideDecks',
  'assignments',
  'rubrics',
  'discussions',
  'quizBank',
  'studyGuides',
  'courseFaq',
  'syllabus',
];
function packageFixture() {
  const fixture = JSON.parse(fs.readFileSync('benchmarks/classroom/v1/cases/held-proportion-variation.json', 'utf8'));
  const blueprint = buildCourseBlueprint(fixture.map, {
    sourceBrief: fixture.sourceBrief,
    sessionMinutes: fixture.sessionMinutes,
    instructorProvidedFacts: extractInstructorProvidedFacts(fixture.sourceBrief),
    enrichment: { lessonContent: fixture.lessonContent },
  });
  const compiled = compileBlueprintDeliverables(blueprint, features);
  const map = reconcileCourseMapWithBlueprintSemanticAdmission(fixture.map, compiled[BLUEPRINT_COMPILE_CONTEXT]);
  const entries = Object.fromEntries(features.map((id) => [id, { data: compiled[id], status: 'done', stale: false }]));
  const source = entries.studyGuides.data.teachingTaskSources[0];
  const claimIndex = source.inputs.findIndex((input) => input.text.includes('3/8'));
  const editPath = ['studyGuides', 0, 'sourceEvidenceBrief', 'claims', claimIndex];
  const oldData = entries.studyGuides.data;
  const newData = structuredClone(oldData);
  newData.studyGuides[0].sourceEvidenceBrief.claims[claimIndex] = source.inputs[claimIndex].text.replace(
    '3/8 = 0.375 = 37.5%',
    '3/12 = 0.25 = 25%',
  );
  const observations = newData.studyGuides[0].sourceEvidenceBrief.claims;
  const observationIndex = observations.findIndex((claim) => claim.startsWith('Eight learners'));
  observations[observationIndex] = observations[observationIndex].replace('Eight learners', 'Twelve learners');
  return { entries, map, source, oldData, newData, editPath };
}

describe('shared task source updates through production projections', () => {
  it('accepts source updates from a prose-generated map without compiler-owned task links', () => {
    const f = packageFixture();
    f.map.lessons[0].sections[0].supportingResources = f.source.inputs
      .map((input, index) => `Source record ${index + 1}: ${input.text}`)
      .join(' ');
    delete f.map.teachingTaskSources;
    for (const lesson of f.map.lessons) delete lesson.teachingTaskLink;
    const result = applyTeachingTaskSourceEdit({
      featureId: 'studyGuides',
      oldData: f.oldData,
      newData: f.newData,
      editPath: f.editPath,
      deliverables: f.entries,
      courseMap: f.map,
    });
    expect(result.status, result.message).toBe('applied');
    expect(result.changed.studyGuides.data.studyGuides[0].workedExample.result).toContain('3/12 = 0.25 = 25%');
    expect(result.courseMap.lessons[0].teachingTaskLink.taskId).toBe(f.source.id);
    expect(result.courseMap.teachingTaskSources).toHaveLength(1);
    expect(result.courseMap.lessons[0].sections[0].supportingResources).toContain('3/12 = 0.25 = 25%');
    expect(result.courseMap.lessons[0].sections[0].supportingResources).not.toContain('3/8 = 0.375 = 37.5%');
    expect(f.map.lessons[0].teachingTaskLink).toBeUndefined();
  });

  it('returns the actual review message as text and respects lesson scope', () => {
    const f = packageFixture();
    f.entries.studyGuides.data.taskSourceReview = 'The edited source must be reviewed before linked answers change.';
    f.entries.studyGuides.data.taskSourceReviewLesson = 1;
    const args = { courseMap: f.map, deliverables: f.entries, selectedFeatures: ['studyGuides'] };
    const readiness = evaluateWorkspaceReadiness(args);
    expect(readiness.blockers.some((issue) => issue.message === f.entries.studyGuides.data.taskSourceReview)).toBe(
      true,
    );
    expect(readiness.issues.every((issue) => typeof issue.message === 'string')).toBe(true);
    const scoped = evaluateWorkspaceReadiness({
      ...args,
      courseMap: { ...f.map, lessons: [...f.map.lessons, f.map.lessons[0]] },
      lessonFilter: [1],
    });
    expect(scoped.issues.some((issue) => issue.message === f.entries.studyGuides.data.taskSourceReview)).toBe(false);
  });
  it('recalculates nine derivatives without inference, preserves teacher prose and persists through CourseGraph restore', () => {
    const f = packageFixture();
    f.entries.lessonPlans.data.lessonPlans[0].warmUp.facilitation =
      'Teacher note: use counters and allow silent thinking.';
    const result = applyTeachingTaskSourceEdit({
      featureId: 'studyGuides',
      oldData: f.oldData,
      newData: f.newData,
      editPath: f.editPath,
      deliverables: f.entries,
      courseMap: f.map,
    });
    expect(result.status, result.message).toBe('applied');
    expect(result.modelCalls).toBe(0);
    expect(result.conflicts).toEqual([]);
    expect(Object.keys(result.changed)).toHaveLength(9);
    expect(result.changed.lessonPlans.data.lessonPlans[0].warmUp.facilitation).toContain('Teacher note:');
    expect(result.changed.studyGuides.data.studyGuides[0].workedExample.result).toContain('3/12 = 0.25 = 25%');
    expect(result.changed.assignments.data.assignments[0].anchorExampleSet.strongSample).toContain('0.25 × 12 = 3');
    expect(
      result.changed.quizBank.data.quizzes[0].questions
        .filter((q) => q.enrichmentSource === 'shared-teaching-task')
        .some((q) => q.sampleAnswer.includes('25%')),
    ).toBe(true);
    const slides = result.changed.slideDecks.data.decks[0].slides;
    expect(slides.filter((slide) => JSON.stringify(slide).includes('37.5%'))).toEqual([]);
    const restored = compileBlueprintDeliverables(
      buildBlueprintFromGraph(deriveCourseGraphFromCourseMap(JSON.parse(JSON.stringify(result.courseMap)))),
      ['studyGuides'],
    );
    expect(restored.studyGuides.studyGuides[0].workedExample.result).toContain('25%');
    expect(result.changed.studyGuides.data.teachingTaskSources[0].inputs.map((x) => x.id)).toEqual(
      f.source.inputs.map((x) => x.id),
    );
  });
  it('retains a competing teacher answer and returns the actual proposed correction', () => {
    const f = packageFixture();
    f.entries.assignments.data.assignments[0].anchorExampleSet.strongSample =
      'My class answer: 37.5%, using bead counters.';
    const result = applyTeachingTaskSourceEdit({
      featureId: 'studyGuides',
      oldData: f.oldData,
      newData: f.newData,
      editPath: f.editPath,
      deliverables: f.entries,
      courseMap: f.map,
    });
    expect(result.changed.assignments.data.assignments[0].anchorExampleSet.strongSample).toContain('My class answer');
    expect(result.changed.assignments.stale).toBe(true);
    const conflict = result.conflicts.find((entry) => entry.path.join('.').endsWith('anchorExampleSet.strongSample'));
    expect(conflict.proposed).toContain('25%');
  });
  it('retains an unresolved teacher conflict when another source field changes', () => {
    const f = packageFixture();
    f.entries.assignments.data.assignments[0].anchorExampleSet.strongSample = 'Teacher answer retained for discussion.';
    const first = applyTeachingTaskSourceEdit({
      featureId: 'studyGuides',
      oldData: f.oldData,
      newData: f.newData,
      editPath: f.editPath,
      deliverables: f.entries,
      courseMap: f.map,
    });
    const oldData = first.changed.studyGuides.data;
    const newData = structuredClone(oldData);
    const index = newData.studyGuides[0].sourceEvidenceBrief.claims.findIndex(
      (claim) => claim === 'Participation was voluntary.',
    );
    expect(index).toBeGreaterThanOrEqual(0);
    newData.studyGuides[0].sourceEvidenceBrief.claims[index] = 'Learners chose to attend the workshop.';
    const second = applyTeachingTaskSourceEdit({
      featureId: 'studyGuides',
      oldData,
      newData,
      editPath: ['studyGuides', 0, 'sourceEvidenceBrief', 'claims', index],
      deliverables: first.changed,
      courseMap: first.courseMap,
    });
    expect(second.status, second.message).toBe('applied');
    expect(
      second.changed.assignments.data.taskSyncConflicts.some(
        (conflict) => conflict.current === 'Teacher answer retained for discussion.',
      ),
    ).toBe(true);
    expect(second.changed.assignments.stale).toBe(true);
  });
  it('does not invent a result for a deleted or contradictory source operation', () => {
    const f = packageFixture();
    f.newData.studyGuides[0].sourceEvidenceBrief.claims[f.editPath.at(-1)] = 'The proportion is unknown.';
    const result = applyTeachingTaskSourceEdit({
      featureId: 'studyGuides',
      oldData: f.oldData,
      newData: f.newData,
      editPath: f.editPath,
      deliverables: f.entries,
      courseMap: f.map,
    });
    expect(result.status).toBe('needs-review');
    expect(result.changed).toBeUndefined();
  });
  it('holds a changed fraction until its separately stated observations are corrected', () => {
    const f = packageFixture();
    const oldSnapshot = JSON.stringify(f.oldData);
    const claims = f.newData.studyGuides[0].sourceEvidenceBrief.claims;
    const index = claims.findIndex((claim) => claim.startsWith('Twelve learners'));
    claims[index] = claims[index].replace('Twelve learners', 'Eight learners');
    const args = {
      featureId: 'studyGuides',
      oldData: f.oldData,
      newData: f.newData,
      editPath: f.editPath,
      deliverables: f.entries,
      courseMap: f.map,
    };
    expect(applyTeachingTaskSourceEdit(args)).toMatchObject({ status: 'needs-review' });
    expect(JSON.stringify(f.oldData)).toBe(oldSnapshot);
    const draft = structuredClone(f.newData);
    claims[index] = claims[index].replace('Eight learners', 'Twelve learners');
    const accepted = applyTeachingTaskSourceEdit({
      ...args,
      oldData: draft,
      editPath: ['studyGuides', 0, 'sourceEvidenceBrief', 'claims', index],
    });
    expect(accepted.status, accepted.message).toBe('applied');
    expect(accepted.changed.studyGuides.data.studyGuides[0].workedExample.result).toContain('25%');
    expect(JSON.stringify(f.oldData)).toBe(oldSnapshot);
  });
  it('keeps the accepted source with its lesson through rename, reorder and JSON graph restore', () => {
    const f = packageFixture();
    const result = applyTeachingTaskSourceEdit({
      featureId: 'studyGuides',
      oldData: f.oldData,
      newData: f.newData,
      editPath: f.editPath,
      deliverables: f.entries,
      courseMap: f.map,
    });
    const map = structuredClone(result.courseMap);
    const firstId = map.lessons[0].teachingTaskLink.taskId;
    const secondTask = buildSharedTeachingTask({
      lessonId: 'lesson-2',
      objective: f.source.objective,
      claims: f.source.inputs.map((input) => input.text),
      admitted: true,
    });
    const second = structuredClone(map.lessons[0]);
    second.title = 'Second observation';
    second.teachingTaskLink = { taskId: secondTask.id };
    map.teachingTaskSources.push({
      ...f.source,
      id: secondTask.id,
      identityKey: 'lesson-2',
      lessonId: 'lesson-2',
      lessonNumber: 2,
      inputs: secondTask.inputs,
      title: second.title,
    });
    map.lessons[0].title = 'Renamed observed rate';
    map.lessons.unshift(second);
    const restored = compileBlueprintDeliverables(
      buildBlueprintFromGraph(deriveCourseGraphFromCourseMap(JSON.parse(JSON.stringify(map)))),
      ['studyGuides'],
    );
    expect(restored.studyGuides.studyGuides[0].workedExample.result).toContain('37.5%');
    expect(restored.studyGuides.studyGuides[1].workedExample.result).toContain('25%');
    expect(restored.studyGuides.teachingTaskSources[1]).toMatchObject({ id: firstId, lessonNumber: 2 });
  });
});

describe('teacher edit preservation', () => {
  it('resolves a reviewed update against the same slide after insertion and reorder', () => {
    const data = {
      decks: [
        {
          lessonNumber: 1,
          slides: [
            { taskRole: 'record:0', notes: 'teacher wording' },
            { taskRole: 'activity', notes: 'activity notes' },
          ],
        },
      ],
      taskSyncConflicts: [
        {
          path: ['decks', 0, 'slides', 0, 'notes'],
          anchors: [
            { depth: 1, field: 'lessonNumber', value: 1 },
            { depth: 3, field: 'taskRole', value: 'record:0' },
          ],
          current: 'teacher wording',
          previous: 'old generated',
          proposed: 'updated source',
        },
      ],
    };
    data.decks[0].slides.unshift({ taskRole: 'worked:0', notes: 'unrelated note' });
    const accepted = resolveTaskSyncConflict(data, 0, true);
    expect(accepted.decks[0].slides[0].notes).toBe('unrelated note');
    expect(accepted.decks[0].slides[1].notes).toBe('updated source');
    expect(accepted.taskSyncConflicts).toEqual([]);
  });
  it('changes only dependent leaves and preserves inserted teacher notes', () => {
    const conflicts = [];
    const merged = mergeTaskProjection(
      { answer: '40%', note: 'old', rows: [{ result: 40 }] },
      { answer: '25%', note: 'old', rows: [{ result: 25 }] },
      { answer: '40%', note: 'Teacher annotation', rows: [{ result: 40 }], extra: 'Added diagram' },
      [],
      conflicts,
    );
    expect(merged).toEqual({
      answer: '25%',
      note: 'Teacher annotation',
      rows: [{ result: 25 }],
      extra: 'Added diagram',
    });
    expect(conflicts).toHaveLength(0);
  });
  it('stores sparse original values and keeps them across repeated edits and a compiler refresh', () => {
    const original = { rows: [{ title: 'Generated title', answer: '40%' }] };
    const first = rememberTeacherEdit(original, { rows: [{ title: 'Teacher title', answer: '40%' }] }, [
      'rows',
      0,
      'title',
    ]);
    const second = rememberTeacherEdit(first, { rows: [{ title: 'Revised teacher title', answer: '40%' }] }, [
      'rows',
      0,
      'title',
    ]);
    const result = preserveTeacherEdits(second, { rows: [{ title: 'Updated generated title', answer: '25%' }] });
    expect(result.rows[0]).toEqual({ title: 'Revised teacher title', answer: '25%' });
    expect(result.teacherEdits[0].generated).toBe('Generated title');
    expect(result.taskSyncConflicts[0].proposed).toBe('Updated generated title');
  });
});

describe('identity-aware editing', () => {
  it('merges new generated slides around preserved teacher notes and order', () => {
    const previous = [
      { taskRole: 'a', text: '40%' },
      { taskRole: 'b', text: 'Example' },
    ];
    const next = [
      { taskRole: 'a', text: '25%' },
      { taskRole: 'new-source', text: 'Extra source paragraph' },
      { taskRole: 'b', text: 'Example' },
    ];
    const current = [
      { taskRole: 'a', text: '40%', teacherNote: 'Draw a bar' },
      { taskRole: 'teacher', text: 'Pause for questions' },
      { taskRole: 'b', text: 'Example' },
    ];
    const conflicts = [];
    const result = mergeTaskProjection(previous, next, current, [], conflicts);
    expect(result.find((slide) => slide.taskRole === 'a')).toEqual({
      taskRole: 'a',
      text: '25%',
      teacherNote: 'Draw a bar',
    });
    expect(result.map((slide) => slide.taskRole)).toEqual(['a', 'teacher', 'new-source', 'b']);
    expect(conflicts).toHaveLength(0);
  });
  it('follows an edited item when the compiler reorders it', () => {
    const original = {
      rows: [
        { id: 'first', title: 'A' },
        { id: 'second', title: 'B' },
      ],
    };
    const edited = rememberTeacherEdit(
      original,
      {
        rows: [
          { id: 'first', title: 'Teacher A' },
          { id: 'second', title: 'B' },
        ],
      },
      ['rows', 0, 'title'],
    );
    const result = preserveTeacherEdits(edited, {
      rows: [
        { id: 'second', title: 'Updated B' },
        { id: 'first', title: 'Updated A' },
      ],
    });
    expect(result.rows).toEqual([
      { id: 'second', title: 'Updated B' },
      { id: 'first', title: 'Teacher A' },
    ]);
    expect(result.teacherEdits[0].path).toEqual(['rows', 1, 'title']);
  });
  it('retains a removed item’s teacher text in a review conflict instead of writing it into another row', () => {
    const original = {
      rows: [
        { id: 'first', title: 'A' },
        { id: 'second', title: 'B' },
      ],
    };
    const edited = rememberTeacherEdit(
      original,
      {
        rows: [
          { id: 'first', title: 'Teacher A' },
          { id: 'second', title: 'B' },
        ],
      },
      ['rows', 0, 'title'],
    );
    const result = preserveTeacherEdits(edited, { rows: [{ id: 'second', title: 'Updated B' }] });
    expect(result.rows).toEqual([{ id: 'second', title: 'Updated B' }]);
    expect(result.taskSyncConflicts[0]).toMatchObject({ current: 'Teacher A', missingTarget: true });
    const repeated = preserveTeacherEdits(result, { rows: [{ id: 'second', title: 'Updated again B' }] });
    expect(repeated.taskSyncConflicts[0].current).toBe('Teacher A');
    const archived = resolveTaskSyncConflict(repeated, 0, false);
    expect(archived.rows).toEqual([{ id: 'second', title: 'Updated again B' }]);
    expect(archived.taskSyncConflicts).toEqual([]);
    expect(archived.teacherEdits).toEqual([]);
    expect(archived.taskSyncArchive[0].current).toBe('Teacher A');
    const regenerated = preserveTeacherEdits(archived, { rows: [{ id: 'second', title: 'New B' }] });
    expect(regenerated.taskSyncArchive[0].current).toBe('Teacher A');
  });
  it('accepts a reviewed removal without leaving a null array entry', () => {
    const current = {
      rows: [
        { id: 'first', text: 'Teacher addition' },
        { id: 'second', text: 'Keep' },
      ],
    };
    const conflicts = [];
    const result = mergeTaskProjection(
      {
        rows: [
          { id: 'first', text: 'Generated' },
          { id: 'second', text: 'Keep' },
        ],
      },
      { rows: [{ id: 'second', text: 'Keep' }] },
      current,
      [],
      conflicts,
    );
    result.taskSyncConflicts = conflicts;
    const accepted = resolveTaskSyncConflict(result, 0, true);
    expect(accepted.rows).toEqual([{ id: 'second', text: 'Keep' }]);
  });
});
