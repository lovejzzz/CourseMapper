// Actual compiler/review/project path. Explicit implementer-authored course,
// not a natural-language model run or a classroom acceptance score.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { comparisonCourseDraft } from '../../tests/fixtures/teaching/courses/comparisonCourse.js';
import { recordCourseDraft } from '../../tests/fixtures/teaching/courses/recordCourse.js';
import { proportionCourseDraft } from '../../tests/fixtures/teaching/courses/proportionCourse.js';
import {
  buildCourseBlueprint,
  compileBlueprintDeliverables,
  BLUEPRINT_COMPILE_CONTEXT,
  reconcileCourseMapWithBlueprintSemanticAdmission,
} from '../../src/lib/courseBlueprintCompiler.js';
import {
  createNewTeachingTaskReviewDraft,
  previewTeachingTaskReview,
  commitTeachingTaskReview,
} from '../../src/lib/teachingTaskReview.js';
import { normalizeRestoredDeliverables } from '../../src/model/courseStore.jsx';
import { readTeachingTaskSources } from '../../src/lib/teachingProgram.js';
import { rebuildTeachingTaskSource } from '../../src/lib/teachingTaskSource.js';
import { deriveCourseGraphFromCourseMap } from '../../src/lib/courseGraph/index.js';
const root = process.argv[2];
assert(root, 'Provide a new output directory.');
const courseSelector = process.argv[3] || 'experiment-en';
const courses = {
  'experiment-en': comparisonCourseDraft,
  'quantity-zh': proportionCourseDraft,
  'record-en': recordCourseDraft,
};
assert(Object.hasOwn(courses, courseSelector), 'Choose experiment-en, quantity-zh or record-en.');
await fs.mkdir(root, { recursive: false });
const course = courses[courseSelector]();
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
const map = {
  courseName: course.title,
  courseDescription: course.description,
  lessons: course.lessons.map((lesson, index) => ({
    lessonNumber: index + 1,
    title: lesson.title,
    sections: [
      { topicSection: lesson.title, learningObjectives: lesson.objective, weeklyAssessments: lesson.progression },
    ],
  })),
};
const blueprint = buildCourseBlueprint(map, { sourceBrief: course.description, sessionMinutes: 50 });
const initial = compileBlueprintDeliverables(blueprint, features);
let courseMap = reconcileCourseMapWithBlueprintSemanticAdmission(map, initial[BLUEPRINT_COMPILE_CONTEXT]);
let deliverables = normalizeRestoredDeliverables(
  Object.fromEntries(features.map((id) => [id, { status: 'done', data: initial[id], stale: false }])),
);
const receipts = [];
for (const [index, lesson] of course.lessons.entries()) {
  const draft = createNewTeachingTaskReviewDraft(courseMap, {
    lessonNumber: index + 1,
    operation: course.operation || 'paired-condition-confound',
  });
  assert(draft.creation, draft.message);
  Object.assign(draft, {
    inputs: structuredClone(lesson.inputs),
    objective: lesson.objective,
    version: 2,
    requirements: structuredClone(lesson.requirements),
    practiceInputs: structuredClone(lesson.practiceInputs),
  });
  draft.bindings = Object.fromEntries(
    Object.entries(lesson.bindings).map(([role, span]) => {
      const input = lesson.inputs.find((row) => row.id === span.inputId);
      const quote = input.text.slice(span.start, span.end);
      const positions = [];
      for (let at = input.text.indexOf(quote); at >= 0; at = input.text.indexOf(quote, at + 1)) positions.push(at);
      return [role, { inputId: span.inputId, quote, occurrence: positions.indexOf(span.start) }];
    }),
  );
  const preview = previewTeachingTaskReview({ courseMap, deliverables, draft });
  assert.equal(preview.status, 'preview', preview.message);
  const result = commitTeachingTaskReview({ courseMap, deliverables, preview, teacherConfirmed: true });
  assert.equal(result.status, 'applied', result.message);
  assert.equal(result.modelCalls, 0);
  assert.deepEqual(result.conflicts, []);
  courseMap = result.courseMap;
  deliverables = { ...deliverables, ...result.changed };
  receipts.push({
    lesson: index + 1,
    taskId: draft.taskId,
    changedMaterials: Object.keys(result.changed),
    modelCalls: result.modelCalls,
  });
}
const tasks = readTeachingTaskSources(courseMap).map((source) => rebuildTeachingTaskSource(source));
assert.equal(tasks.length, 6);
assert(tasks.every(Boolean));
const project = {
  formatVersion: 2,
  courseMap,
  courseGraph: deriveCourseGraphFromCourseMap(courseMap),
  deliverables,
  userEdits: [],
  selectedFeatures: ['courseMap', ...features],
  hasGenerated: true,
  activeTab: 'lessonPlans',
  provider: 'public',
  modelId: 'scion-public',
  promptText: course.description,
};
await fs.writeFile(path.join(root, 'project.coursemapper'), JSON.stringify(project, null, 2));
await fs.writeFile(path.join(root, 'tasks.json'), JSON.stringify(tasks, null, 2));
await fs.writeFile(
  path.join(root, 'capture.json'),
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      courseId: course.id,
      courseName: course.title,
      sourceKind: course.sourceKind,
      modelCalls: 0,
      status: 'generated draft; classroom and export review pending',
      receipts,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    course: course.title,
    lessons: tasks.length,
    materials: ['courseMap', ...features],
    modelCalls: 0,
    root,
  }),
);
