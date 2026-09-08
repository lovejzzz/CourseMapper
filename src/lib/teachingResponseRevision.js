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

export function createResponseRevisionReceipt(
  record,
  { previewRevision, updatedSource, criterionId, feedback, pendingDraftRevision },
  appliedAt = new Date().toISOString(),
) {
  validateResponseReview(record);
  const task = rebuildTeachingTaskSource(updatedSource);
  const judgment = record.judgments.find((entry) => entry.criterionId === criterionId);
  if (
    !task ||
    !judgment ||
    updatedSource?.id !== record.taskId ||
    updatedSource.operationPlan?.requirements?.find((r) => r.id === criterionId)?.feedback !== feedback.trim()
  )
    throw new Error('The applied task does not match the reviewed feedback revision.');
  const receipt = {
    id: previewRevision,
    ...(pendingDraftRevision ? { pendingDraftRevision } : {}),
    appliedAt,
    criterionId,
    fromSourceRevision: record.sourceRevision,
    fromRubricRevision: record.rubricRevision,
    toSourceRevision: responseReviewRevision(updatedSource),
    toRubricRevision: responseReviewRevision(task.criteria),
    updatedSource: structuredClone(updatedSource),
    updatedCriteria: structuredClone(task.criteria),
    previousFeedback: record.snapshot.source.operationPlan.requirements.find((r) => r.id === criterionId)?.feedback,
    feedback: feedback.trim(),
    judgment: structuredClone(judgment),
  };
  appendResponseRevisionReceipt(record, receipt);
  return receipt;
}

export function appendResponseRevisionReceipt(record, receipt) {
  validateResponseReview(record);
  const existing = record.improvements?.find((entry) => entry.id === receipt.id);
  if (existing && responseReviewRevision(existing) !== responseReviewRevision(receipt))
    throw new Error('A different teaching revision already uses this receipt identity.');
  const next = structuredClone(record);
  if (next.pendingFeedbackRevision?.draftRevision === receipt.pendingDraftRevision) delete next.pendingFeedbackRevision;
  return validateResponseReview({
    ...next,
    improvements: existing
      ? structuredClone(record.improvements)
      : [...(record.improvements || []), structuredClone(receipt)],
  });
}

/** Read the latest notebook row so a delayed course commit cannot overwrite a
 * newer teacher judgment. Deletion is respected; failed receipts can retry. */
export async function saveResponseRevisionReceipt(store, recordId, receipt) {
  const current = (await store.list()).records.find((entry) => entry.id === recordId);
  if (!current) throw new Error('The local response is no longer available.');
  const updated = appendResponseRevisionReceipt(current, receipt);
  await store.save(updated, responseReviewRevision(current));
  return updated;
}

/** Persist only in the private notebook. A hash ties this intention to the
 * exact public draft without copying response text into the project. */
export async function savePendingResponseFeedback(store, record, draft, { criterionId, feedback }) {
  validateResponseReview(record);
  const judgment = record.judgments.find((entry) => entry.criterionId === criterionId);
  if (
    !judgment ||
    draft.taskId !== record.taskId ||
    draft.sourceRevision !== record.sourceRevision ||
    draft.requirements?.find((entry) => entry.id === criterionId)?.feedback !== feedback.trim()
  )
    throw new Error('The feedback draft does not match the reviewed response.');
  const updated = validateResponseReview({
    ...structuredClone(record),
    pendingFeedbackRevision: {
      draftRevision: responseReviewRevision(draft),
      sourceRevision: record.sourceRevision,
      rubricRevision: record.rubricRevision,
      criterionId,
      feedback: feedback.trim(),
      judgment: structuredClone(judgment),
      preparedAt: new Date().toISOString(),
    },
  });
  await store.save(updated, responseReviewRevision(record));
  return updated;
}

export async function pendingResponseFeedbackForDraft(store, draft) {
  const revision = responseReviewRevision(draft);
  const { records } = await store.list();
  return records.filter(
    (record) => record.taskId === draft.taskId && record.pendingFeedbackRevision?.draftRevision === revision,
  );
}

export async function completePendingResponseFeedback(store, records, applied) {
  for (const record of records) {
    const pending = record.pendingFeedbackRevision;
    // The judgment that motivated the revision remains historical even if a
    // teacher subsequently changes the current judgment in another tab.
    const snapshot = { ...structuredClone(record), judgments: [structuredClone(pending.judgment)] };
    const receipt = createResponseRevisionReceipt(snapshot, {
      ...applied,
      criterionId: pending.criterionId,
      feedback: pending.feedback,
      pendingDraftRevision: pending.draftRevision,
    });
    await saveResponseRevisionReceipt(store, record.id, receipt);
  }
}
