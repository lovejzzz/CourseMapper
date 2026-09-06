import { buildSharedTeachingTask } from './compilerTeachingTask.js';

export const TEACHING_TASK_SOURCE_VERSION = 1;

/** @typedef {{ id: string, text: string }} TaskInput
 * @typedef {{ version: 1, id: string, lessonId: string, lessonNumber: number,
 * title: string, objective: string, kind: string, scope: string,
 * inputs: TaskInput[], sessionMinutes: number, practiceMinutes: number }} TeachingTaskSource
 *
 * Stored in CourseGraph.course.meta.teachingTaskSources (the map's lossless
 * metadata channel). Material copies carry the same IDs for editing detached
 * exports/restored packages; the course map owns accepted source revisions.
 */
export function teachingTaskSourceFromLesson(lesson) {
  const task = lesson.teachingTask;
  if (!task) return null;
  return {
    version: TEACHING_TASK_SOURCE_VERSION,
    id: task.id,
    lessonId: lesson.id,
    identityKey: task.identityKey || lesson.id,
    lessonNumber: lesson.lessonNumber,
    title: lesson.title,
    objective: task.objective,
    kind: task.kind,
    scope: lesson.teachingTaskScope,
    inputs: task.inputs.map((input) => ({ ...input })),
    sessionMinutes: lesson.classSessionPlan?.sessionMinutes || 50,
    practiceMinutes: task.minutes,
  };
}

export function validTeachingTaskSource(source) {
  return Boolean(
    source?.version === TEACHING_TASK_SOURCE_VERSION &&
    typeof source.id === 'string' &&
    typeof source.lessonId === 'string' &&
    Number.isInteger(source.lessonNumber) &&
    source.lessonNumber > 0 &&
    typeof source.title === 'string' &&
    typeof source.objective === 'string' &&
    source.objective.trim() &&
    Array.isArray(source.inputs) &&
    source.inputs.length > 0 &&
    source.inputs.length <= 32 &&
    source.inputs.every(
      (input) =>
        typeof input.id === 'string' &&
        typeof input.text === 'string' &&
        input.text.trim() &&
        input.text.length <= 10000,
    ) &&
    new Set(source.inputs.map((input) => input.id)).size === source.inputs.length &&
    Number.isFinite(source.sessionMinutes) &&
    source.sessionMinutes > 0 &&
    Number.isFinite(source.practiceMinutes) &&
    source.practiceMinutes > 0,
  );
}

export function rebuildTeachingTaskSource(source, objective = source?.objective) {
  if (!validTeachingTaskSource(source)) return null;
  const task = buildSharedTeachingTask({
    lessonId: source.identityKey || source.lessonId,
    objective,
    claims: source.inputs.map((input) => input.text),
    admitted: true,
    sessionMinutes: source.sessionMinutes,
    practiceMinutes: source.practiceMinutes,
  });
  // An edit cannot silently turn a calculation into a different assessment.
  if (!task || task.kind !== source.kind || task.id !== source.id) return null;
  return task;
}
