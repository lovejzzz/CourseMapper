/** Data-only legacy task-source contract. Kept outside the solver so graph
 * migration and validation do not load the content compiler. */
export const TEACHING_TASK_SOURCE_VERSION = 1;

export function validTeachingTaskSource(source) {
  return Boolean(
    source?.version === TEACHING_TASK_SOURCE_VERSION &&
    typeof source.id === 'string' &&
    source.id.trim() &&
    typeof source.lessonId === 'string' &&
    source.lessonId.trim() &&
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
        typeof input?.id === 'string' &&
        input.id.trim() &&
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
