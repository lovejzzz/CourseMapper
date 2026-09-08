// Exercise actual restore and review transactions on an existing course capture.
// This is a core-path receipt, not a browser or classroom acceptance result.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { prepareProjectSnapshotForRestore } from '../../src/lib/projectSnapshotSanitizer.js';
import { readTeachingTaskSources } from '../../src/lib/teachingProgram.js';
import { rebuildTeachingTaskSource } from '../../src/lib/teachingTaskSource.js';
import {
  createTeachingTaskReviewDraft,
  previewTeachingTaskReview,
  commitTeachingTaskReview,
} from '../../src/lib/teachingTaskReview.js';
import { deriveCourseGraphFromCourseMap } from '../../src/lib/courseGraph/index.js';
import { renderedDeliverableCollection } from '../../src/lib/renderedDeliverableRoot.js';

const [input, output] = process.argv.slice(2);
assert(input && output, 'Provide a course capture and a new result directory.');
const bytes = await fs.readFile(input);
const original = JSON.parse(bytes);
await fs.mkdir(output, { recursive: false });
const restored = prepareProjectSnapshotForRestore(JSON.parse(bytes));
const beforeSources = readTeachingTaskSources(original.courseMap);
const sources = readTeachingTaskSources(restored.courseMap);
assert.equal(sources.length, 6);
assert.deepEqual(
  sources.map((s) => rebuildTeachingTaskSource(s)),
  beforeSources.map((s) => rebuildTeachingTaskSource(s)),
);
for (const [id, material] of Object.entries(original.deliverables)) {
  assert.deepEqual(restored.deliverables[id].data, material.data, `Restored material changed: ${id}`);
}
const target = sources.at(-1);
const draft = createTeachingTaskReviewDraft(target, restored.deliverables.rubrics.data, 'rubrics');
const previousFeedback = draft.requirements[0].feedback;
const newFeedback = `${previousFeedback} Identify the specific source record beside each revised claim.`;
draft.requirements[0].feedback = newFeedback;
const preview = previewTeachingTaskReview({ ...restored, draft });
assert.equal(preview.status, 'preview', preview.message);
const applied = commitTeachingTaskReview({ ...restored, preview, teacherConfirmed: true });
assert.equal(applied.status, 'applied', applied.message);
assert.deepEqual(applied.conflicts, []);
assert.equal(applied.modelCalls, 0);
const after = {
  ...restored,
  courseMap: applied.courseMap,
  courseGraph: deriveCourseGraphFromCourseMap(applied.courseMap),
  deliverables: { ...restored.deliverables, ...applied.changed },
};
const afterSources = readTeachingTaskSources(after.courseMap);
assert.deepEqual(
  afterSources.filter((s) => s.id !== target.id),
  sources.filter((s) => s.id !== target.id),
);
assert.equal(afterSources.find((s) => s.id === target.id).operationPlan.requirements[0].feedback, newFeedback);
// Compare the actual file representation: JSON intentionally omits undefined
// optional fields created in memory, which is not a loss of saved content.
const persistedAfter = JSON.parse(JSON.stringify(after));
const restoredAgain = prepareProjectSnapshotForRestore(persistedAfter);
assert.deepEqual(readTeachingTaskSources(restoredAgain.courseMap), afterSources);
for (const id of Object.keys(after.deliverables)) {
  assert.deepEqual(
    restoredAgain.deliverables[id].data,
    persistedAfter.deliverables[id].data,
    `Revised material changed on restore: ${id}`,
  );
}
const unchangedLessonRows = {};
for (const [id, material] of Object.entries(restored.deliverables)) {
  const previousRows = renderedDeliverableCollection(id, material.data);
  const currentRows = renderedDeliverableCollection(id, persistedAfter.deliverables[id].data);
  const unrelated = (row) => Number.isInteger(row.lessonNumber) && row.lessonNumber !== target.lessonNumber;
  const beforeRows = previousRows.filter(unrelated);
  if (!beforeRows.length) continue;
  assert.deepEqual(
    currentRows.filter(unrelated),
    JSON.parse(JSON.stringify(beforeRows)),
    `Unrelated lesson rows changed: ${id}`,
  );
  unchangedLessonRows[id] = beforeRows.length;
}
await fs.writeFile(path.join(output, 'revised.coursemapper'), JSON.stringify(after, null, 2));
const report = {
  checkedAt: new Date().toISOString(),
  projectSha256: createHash('sha256').update(bytes).digest('hex'),
  scope: 'core restore and confirmed feedback revision; no browser or model execution',
  lessons: sources.length,
  modelCalls: 0,
  unchangedOtherTasks: sources.length - 1,
  checkedMaterialIds: Object.keys(original.deliverables),
  changedMaterialIds: Object.keys(applied.changed),
  targetTaskId: target.id,
  unchangedLessonRows,
  previousFeedback,
  newFeedback,
  restoredOriginalMaterialsUnchanged: true,
  restoredRevisedMaterialsUnchanged: true,
};
await fs.writeFile(path.join(output, 'verification.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
