import { readTeachingTaskSources } from './teachingProgram.js';
import { checkTeachingGoalAlignment } from './teachingGoalAlignment.js';
import { sameJsonData } from './canonicalJson.js';

/** Optional saved diagnostics must never crash a material or silently make
 * an unreadable review look complete. Canonical rechecking replaces them. */
export function readTeachingGoalReviews(value) {
  if (value == null) return [];
  if (
    Array.isArray(value) &&
    value.every(
      (review) =>
        review &&
        typeof review.taskId === 'string' &&
        typeof review.message === 'string' &&
        review.message.trim() &&
        (review.lessonNumber == null || (Number.isInteger(review.lessonNumber) && review.lessonNumber > 0)),
    )
  )
    return value;
  return [
    {
      taskId: 'unreadable-goal-review',
      message: 'The saved learning-target review cannot be read. Recheck the task against the current course targets.',
    },
  ];
}

/** Recheck current target versions without changing any task, authored text,
 * or the teacher's declaration of alignment. A target edit needs a review. */
export function teachingGoalReviewIssues(courseMap, courseGraph) {
  if (!courseGraph) return [];
  return readTeachingTaskSources(courseMap).flatMap((source) => {
    const plan = source.operationPlan;
    if (!plan?.goalAlignment) return [];
    const checked = checkTeachingGoalAlignment(
      plan.goalAlignment,
      plan.requirements,
      source.objective,
      courseGraph,
      source.lessonNumber,
    );
    return checked.valid
      ? []
      : [
          {
            taskId: source.id,
            lessonNumber: source.lessonNumber,
            message: checked.issues.map((issue) => issue.message).join(' '),
          },
        ];
  });
}

export function reconcileTeachingGoalReview(deliverables, courseMap, courseGraph) {
  const issues = teachingGoalReviewIssues(courseMap, courseGraph);
  let changed = false;
  const next = Object.fromEntries(
    Object.entries(deliverables).map(([id, entry]) => {
      if (!entry?.data) return [id, entry];
      const sources = Array.isArray(entry.data.teachingTaskSources) ? entry.data.teachingTaskSources : [];
      const ids = new Set(sources.map((source) => source?.id));
      const relevant = issues.filter((issue) => ids.has(issue.taskId));
      if (sameJsonData(relevant, entry.data.taskGoalReview || [])) return [id, entry];
      changed = true;
      const data = { ...entry.data };
      if (relevant.length) data.taskGoalReview = relevant;
      else delete data.taskGoalReview;
      return [id, { ...entry, data }];
    }),
  );
  return changed ? next : deliverables;
}
