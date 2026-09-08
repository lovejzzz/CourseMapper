import { canonicalJson } from './canonicalJson.js';
import { sha256HexSync } from './sha256Sync.js';

const sourceHash = (source) =>
  sha256HexSync(
    canonicalJson({
      id: source.id,
      kind: source.kind,
      objective: source.objective,
      inputs: source.inputs,
      operationPlan: source.operationPlan,
    }),
  );

// Structural count policy for a teacher-reviewed practice sequence. This
// checks completeness and version binding, not educational correctness.
export function createReviewedPracticeCount(source, task, questions) {
  return {
    version: 1,
    taskId: task.id,
    taskRevision: task.revision,
    sourceHash: sourceHash(source),
    practiceIds: questions.map((q) => q.practiceId),
  };
}

export function checkReviewedPracticeCount(data, quiz) {
  const policy = quiz?.reviewedPracticeCount;
  if (!policy) return null;
  const invalid = {
    valid: false,
    message: 'Reviewed practice sequence is incomplete or no longer matches its source version.',
  };
  try {
    const source = data.teachingTaskSources?.find((s) => s.id === policy.taskId);
    const ids = policy.practiceIds;
    const questions = quiz.questions || quiz.qs || [];
    const owned = questions.filter((q) => q.taskId === policy.taskId || q.taskId === `${policy.taskId}:transfer`);
    if (
      policy.version !== 1 ||
      !source ||
      !Array.isArray(ids) ||
      !ids.length ||
      ids.length > 64 ||
      ids.some((id) => typeof id !== 'string' || !id) ||
      new Set(ids).size !== ids.length ||
      policy.sourceHash !== sourceHash(source) ||
      quiz.practiceRecord?.taskId !== policy.taskId ||
      quiz.practiceRecord?.taskRevision !== policy.taskRevision ||
      owned.length !== ids.length ||
      new Set(owned.map((q) => q.practiceId)).size !== ids.length ||
      owned.some((q) => !ids.includes(q.practiceId) || q.taskRevision !== policy.taskRevision)
    )
      return invalid;
    return { valid: true, count: questions.length };
  } catch {
    return invalid;
  }
}
