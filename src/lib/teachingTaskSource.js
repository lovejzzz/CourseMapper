import { buildSharedTeachingTask } from './compilerTeachingTask.js';
import { TEACHING_TASK_SOURCE_VERSION, validTeachingTaskSource } from './teachingTaskSourceSchema.js';
export { TEACHING_TASK_SOURCE_VERSION, validTeachingTaskSource } from './teachingTaskSourceSchema.js';

/** @typedef {{ id: string, text: string }} TaskInput
 * @typedef {{ version: 1, id: string, lessonId: string, lessonNumber: number,
 * title: string, objective: string, kind: string, scope: string,
 * inputs: TaskInput[], sessionMinutes: number, practiceMinutes: number }} TeachingTaskSource
 *
 * Legacy transport derived from CourseGraph.teachingProgram. Material copies
 * carry bindings, never authority over an existing teaching program.
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
    ...(task.operationPlan ? { operationPlan: structuredClone(task.operationPlan) } : {}),
  };
}

export function rebuildTeachingTaskSource(
  source,
  objective = source?.objective,
  { legacyOperationPresentation = false } = {},
) {
  if (!validTeachingTaskSource(source)) return null;
  const task = buildSharedTeachingTask({
    lessonId: source.identityKey || source.lessonId,
    objective,
    claims: source.inputs.map((input) => input.text),
    admitted: true,
    sessionMinutes: source.sessionMinutes,
    practiceMinutes: source.practiceMinutes,
    sourceInputs: source.inputs,
    ...(source.operationPlan !== undefined ? { operationPlan: source.operationPlan } : {}),
    legacyOperationPresentation,
  });
  // An edit cannot silently turn a calculation into a different assessment.
  if (!task || task.kind !== source.kind || task.id !== source.id) return null;
  return task;
}
