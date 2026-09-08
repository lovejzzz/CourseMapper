import { createTeachingTaskReviewDraft } from './teachingTaskReview.js';
import { rebuildTeachingTaskSource } from './teachingTaskSource.js';
import { responseReviewRevision, validateResponseReview } from './teachingResponseReview.js';

/** Only teacher-written public feedback enters the ordinary course draft.
 * Response text, evidence and review reasons stay in the private notebook. */
export function prepareResponseFeedbackRevision({ record, source, criterionId, feedback, materialData, featureId }) {
  validateResponseReview(record);
  if (source?.id !== record.taskId || responseReviewRevision(source) !== record.sourceRevision)
    throw new Error('The task changed since this response was collected. Review the current task before revising it.');
  const task = rebuildTeachingTaskSource(source);
  if (!task || responseReviewRevision(task.criteria) !== record.rubricRevision)
    throw new Error('The scoring criteria changed. This response remains attached to its original rubric.');
  if (!record.judgments.some((judgment) => judgment.criterionId === criterionId))
    throw new Error('Confirm a judgment for this requirement before proposing a teaching revision.');
  if (source.operationPlan?.version !== 2)
    throw new Error('Author and review the teaching requirements before changing their feedback.');
  if (typeof feedback !== 'string' || !feedback.trim() || feedback.length > 6000)
    throw new Error('Supply concrete teaching feedback of at most 6,000 characters.');
  const draft = createTeachingTaskReviewDraft(source, materialData, featureId);
  if (draft.status === 'needs-review') throw new Error(draft.message);
  const requirement = draft.requirements.find((entry) => entry.id === criterionId);
  if (!requirement) throw new Error('The reviewed requirement is no longer available.');
  if (requirement.feedback === feedback.trim()) throw new Error('The proposed feedback is unchanged.');
  requirement.feedback = feedback.trim();
  return draft;
}
