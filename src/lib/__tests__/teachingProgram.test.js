import { describe, expect, it } from 'vitest';
import {
  readTeachingTaskSources,
  teachingProgramFromSources,
  teachingProgramRevision,
  validateTeachingProgram,
  withTeachingTaskSources,
} from '../teachingProgram.js';
import { deriveCourseGraphFromCourseMap } from '../courseGraph/deriveFromCourseMap.js';
import { renderCourseMapFromGraph } from '../courseGraph/renderCourseMap.js';
import { validateCourseGraph } from '../courseGraph/schema.js';
import { restoreCourseGraphForProject } from '../nativeGraphAuthoring.js';
import { sameJsonData } from '../canonicalJson.js';
import { prepareProjectSnapshotForRestore } from '../projectSnapshotSanitizer.js';

function source(id = 'task-a') {
  return {
    version: 1,
    id,
    lessonId: 'lesson-1',
    lessonNumber: 1,
    title: 'Trace evidence',
    objective: 'Distinguish a reported observation from an inference.',
    kind: 'evidence-source-analysis',
    scope: 'primary-task',
    inputs: [
      { id: 'input-a', text: 'The witness reports seeing the door open.', teacherAnnotation: 'Check attribution.' },
    ],
    sessionMinutes: 50,
    practiceMinutes: 10,
    teacherField: { label: 'Keep my field' },
  };
}

const courseMap = (sources = [source()]) => ({
  courseName: 'Evidence workshop',
  teachingTaskSources: sources,
  customCourseField: 'Retain this',
  lessons: [
    {
      title: 'Trace evidence',
      sections: [{ learningObjectives: 'Distinguish claims.', supportingResources: '1. Teacher packet' }],
    },
  ],
});

describe('canonical teaching program migration and source ownership', () => {
  it('rejects conflicting graph/map revisions before restore can overwrite either authority', () => {
    const original = courseMap();
    const graph = deriveCourseGraphFromCourseMap(original);
    const edited = source();
    edited.inputs[0].text = 'A newer source statement.';
    const map = withTeachingTaskSources(original, [edited]);
    const snapshot = { courseGraph: graph, courseMap: map };
    const before = JSON.stringify(snapshot);
    expect(() => prepareProjectSnapshotForRestore(snapshot)).toThrow('different teaching revisions');
    expect(JSON.stringify(snapshot)).toBe(before);
  });

  it('rejects a conflicting legacy map instead of allowing map write-back to replace the graph', () => {
    const map = courseMap();
    const graph = deriveCourseGraphFromCourseMap(map);
    map.teachingTaskSources[0].inputs[0].text = 'An obsolete copy.';
    expect(() => prepareProjectSnapshotForRestore({ courseGraph: graph, courseMap: map })).toThrow(
      'legacy source ledger',
    );
  });

  it('keeps matching restore transports in one revision and marks obsolete material copies for review', () => {
    const map = courseMap();
    const graph = deriveCourseGraphFromCourseMap(map);
    const oldSource = source();
    oldSource.inputs[0].text = 'An older statement still in a saved study guide.';
    const snapshot = {
      courseGraph: graph,
      courseMap: map,
      deliverables: {
        studyGuides: {
          status: 'done',
          data: { teachingTaskSources: [oldSource], studyGuides: [{ summary: 'Teacher wording to preserve' }] },
        },
      },
    };
    const restored = prepareProjectSnapshotForRestore(snapshot);
    expect(restored.courseMap.teachingProgram.revision).toBe(restored.courseGraph.teachingProgram.revision);
    expect(restored.deliverables.studyGuides.stale).toBe(true);
    expect(restored.deliverables.studyGuides.data.taskSourceReview).toContain('saved text has been preserved');
    expect(restored.deliverables.studyGuides.data.studyGuides[0].summary).toBe('Teacher wording to preserve');
    expect(restored.deliverables.studyGuides.data.teachingTaskSources).toEqual([oldSource]);
  });
  it('compares JSON content independently of field insertion order while keeping source order and values significant', () => {
    expect(sameJsonData({ a: 1, b: { x: 2, y: 3 } }, { b: { y: 3, x: 2 }, a: 1 })).toBe(true);
    expect(sameJsonData({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(sameJsonData([1, 2], [2, 1])).toBe(false);
    expect(sameJsonData({ a: 1 }, { a: '1' })).toBe(false);
    expect(sameJsonData({ a: null }, {})).toBe(false);
  });

  it('preserves authored material when a damaged source copy needs review during restore', () => {
    const map = courseMap();
    const snapshot = {
      courseGraph: deriveCourseGraphFromCourseMap(map),
      courseMap: map,
      deliverables: {
        studyGuides: {
          status: 'done',
          data: { teachingTaskSources: [null], studyGuides: [{ summary: 'Keep the teacher text.' }] },
        },
      },
    };
    const restored = prepareProjectSnapshotForRestore(snapshot);
    expect(restored.courseMap.courseName).toBe('Evidence workshop');
    expect(restored.deliverables.studyGuides.stale).toBe(true);
    expect(restored.deliverables.studyGuides.data.taskSourceReview).toContain('saved text has been preserved');
    expect(restored.deliverables.studyGuides.data.studyGuides[0].summary).toBe('Keep the teacher text.');
  });
  it('moves the graph ledger out of loose metadata and preserves a project round trip', () => {
    const original = courseMap();
    const graph = deriveCourseGraphFromCourseMap(original);
    expect(validateCourseGraph(graph)).toEqual({ valid: true, issues: [] });
    expect(graph.course.meta.teachingTaskSources).toBeUndefined();
    expect(graph.course.meta.teachingProgram).toBeUndefined();
    expect(graph.teachingProgram.tasks[0].objective).toBeUndefined();
    expect(graph.teachingProgram.tasks[0].inputs[0].text).toBeUndefined();
    const restored = restoreCourseGraphForProject(JSON.parse(JSON.stringify({ courseGraph: graph })));
    const rendered = renderCourseMapFromGraph(restored);
    expect(readTeachingTaskSources(rendered)).toEqual(original.teachingTaskSources);
    expect(rendered.lessons).toEqual(original.lessons);
    expect(rendered.customCourseField).toBe('Retain this');
    expect(deriveCourseGraphFromCourseMap(rendered).teachingProgram).toEqual(graph.teachingProgram);
    expect(original.teachingProgram).toBeUndefined();
  });

  it('never lets an obsolete map copy overwrite the canonical source', () => {
    const map = withTeachingTaskSources(courseMap(), [source()]);
    map.teachingTaskSources[0].inputs[0].text = 'Obsolete material text';
    expect(readTeachingTaskSources(map)[0].inputs[0].text).toBe(source().inputs[0].text);
    const rendered = renderCourseMapFromGraph(deriveCourseGraphFromCourseMap(map));
    expect(rendered.teachingTaskSources[0].inputs[0].text).toBe(source().inputs[0].text);
  });

  it('changes revision while retaining task, objective, source and input identity', () => {
    const original = teachingProgramFromSources([source()]);
    const edited = source();
    edited.inputs[0].text = 'The witness reports seeing the door closed.';
    const next = teachingProgramFromSources([edited], original);
    expect(next.revision).not.toBe(original.revision);
    expect(next.tasks.map((task) => task.id)).toEqual(original.tasks.map((task) => task.id));
    expect(next.tasks[0].inputs).toEqual(original.tasks[0].inputs);
    expect(next.sources[0].id).toBe(original.sources[0].id);
    expect(next.tasks[0].objectiveRef).toBe(original.tasks[0].objectiveRef);
    expect(readTeachingTaskSources({ teachingProgram: next })).toEqual([edited]);
    expect(readTeachingTaskSources({ teachingProgram: original })).toEqual([source()]);
  });

  it('keeps equal text in independent tasks as independent sources', () => {
    const program = teachingProgramFromSources([source('task-a'), source('task-b')]);
    expect(program.sources).toHaveLength(2);
    expect(program.sources[0].id).not.toBe(program.sources[1].id);
    const changed = readTeachingTaskSources({ teachingProgram: program });
    changed[0].inputs[0].text = 'Only the first case changes.';
    const next = teachingProgramFromSources(changed, program);
    expect(readTeachingTaskSources({ teachingProgram: next })[1]).toEqual(source('task-b'));
  });

  it('rejects dangling references even if someone recomputes the data digest', () => {
    const program = teachingProgramFromSources([source()]);
    program.tasks[0].inputs[0].sourceRef = 'nonexistent-source';
    program.revision = teachingProgramRevision(program);
    expect(validateTeachingProgram(program).issues.map((issue) => issue.code)).toContain('teaching-program-source-ref');
    expect(() => readTeachingTaskSources({ teachingProgram: program, teachingTaskSources: [source()] })).toThrow(
      'missing source',
    );
  });

  it('rejects duplicate identities, blank inputs and unsupported versions', () => {
    expect(() => teachingProgramFromSources([source(), source()])).toThrow('used more than once');
    const blank = source();
    blank.inputs[0].id = '';
    expect(() => teachingProgramFromSources([blank])).toThrow('invalid records');
    const program = teachingProgramFromSources([source()]);
    program.version = 2;
    expect(validateTeachingProgram(program).issues[0].code).toBe('teaching-program-version');
  });

  it('reports a damaged revision instead of restoring a stale legacy ledger', () => {
    const graph = deriveCourseGraphFromCourseMap(courseMap());
    graph.teachingProgram.sources[0].text = 'A partial save changed just this record.';
    expect(validateCourseGraph(graph).valid).toBe(false);
    expect(() => restoreCourseGraphForProject({ courseGraph: graph, courseMap: courseMap() })).toThrow(
      'matching revision',
    );
  });

  it('migrates an old valid graph without changing its authored enrichment or unrelated metadata', () => {
    const graph = deriveCourseGraphFromCourseMap(courseMap([]));
    delete graph.teachingProgram;
    graph.course.meta.teachingTaskSources = [source()];
    graph.enrichmentOverlay = { lessonContent: { 'lesson-1': { teacherNotes: 'Preserve my activity' } } };
    const restored = restoreCourseGraphForProject({ courseGraph: graph });
    expect(restored.enrichmentOverlay).toEqual(graph.enrichmentOverlay);
    expect(readTeachingTaskSources(restored)).toEqual([source()]);
    expect(graph.course.meta.teachingTaskSources).toEqual([source()]);
    expect(restored.course.meta.teachingTaskSources).toBeUndefined();
  });
});
