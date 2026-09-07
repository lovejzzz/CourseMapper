import { canonicalJson, sameJsonData } from './canonicalJson.js';
import { sha256HexSync } from './sha256Sync.js';
import { readTeachingTaskSources } from './teachingProgram.js';
import { rebuildTeachingTaskSource } from './teachingTaskSource.js';
import { createTeachingOperationPlan, TEACHING_OPERATION_SPECS } from './teachingOperationPlan.js';
import { projectTeachingTaskUpdate, readPendingTeachingSourceInputs } from './teachingTaskContentSync.js';

const revision = (value) => sha256HexSync(canonicalJson(value));
const reviewIssue = (message) => ({ status: 'needs-review', message });

export function quoteOccurrences(text, quote) {
  if (typeof text !== 'string' || typeof quote !== 'string' || !quote.length) return [];
  const positions = [];
  for (let at = text.indexOf(quote); at !== -1; at = text.indexOf(quote, at + 1)) positions.push(at);
  return positions;
}

/** The task list comes from the canonical course, never from an arbitrary
 * material's saved plan. Old ledgers are admitted through the same reader. */
export function reviewableTeachingTaskSources(courseMap) {
  return readTeachingTaskSources(courseMap).filter((source) => {
    const operation = source.operationPlan?.operation || rebuildTeachingTaskSource(source)?.operationPlan?.operation;
    return Object.hasOwn(TEACHING_OPERATION_SPECS, operation) || source.kind === 'source-proportion';
  });
}

export function createTeachingTaskReviewDraft(source, materialData, featureId) {
  const plan = source.operationPlan || rebuildTeachingTaskSource(source)?.operationPlan;
  const operation = plan?.operation || (source.kind === 'source-proportion' ? 'observed-proportion' : null);
  if (!Object.hasOwn(TEACHING_OPERATION_SPECS, operation))
    return reviewIssue('This task does not yet have a supported teaching structure editor.');
  const pending = readPendingTeachingSourceInputs(materialData, source);
  if (pending.status === 'needs-review') return pending;
  return {
    taskId: source.id,
    sourceRevision: revision(source),
    ...(featureId ? { material: { featureId, inputRevision: revision(pending.inputs) } } : {}),
    operation,
    inputs: pending.inputs,
    bindings: Object.fromEntries(
      Object.entries(plan?.bindings || TEACHING_OPERATION_SPECS[operation].bindings).map(([name, span]) => {
        // An old fraction does not identify a population or prove that the
        // counts concern the same group. Require an actual source review.
        if (!plan) return [name, { inputId: '', quote: '', occurrence: null }];
        const text = source.inputs.find((input) => input.id === span.inputId)?.text || '';
        const quote = text.slice(span.start, span.end);
        return [name, { inputId: span.inputId, quote, occurrence: quoteOccurrences(text, quote).indexOf(span.start) }];
      }),
    ),
    requirements: structuredClone(
      plan?.requirements ||
        TEACHING_OPERATION_SPECS[operation].requirements.map((id, index) => ({
          id,
          weight: TEACHING_OPERATION_SPECS[operation].defaultWeights[index],
        })),
    ),
  };
}

/** Quotes are a review UI, not identity: resolve them into revision-bound
 * spans. Repeated text needs a selected occurrence, never a first-match guess. */
export function resolveTeachingTaskReviewDraft(source, draft, reviewedAt) {
  if (
    !draft ||
    draft.taskId !== source.id ||
    !Array.isArray(draft.inputs) ||
    !sameJsonData(
      draft.inputs.map((input) => input?.id),
      source.inputs.map((input) => input.id),
    )
  )
    return reviewIssue('The source identities changed. Reopen the task review before applying it.');
  if (draft.sourceRevision !== revision(source))
    return reviewIssue(
      'The teaching task changed after this review was opened. Reopen the review to use its latest sources and scoring.',
    );
  const spec = Object.hasOwn(TEACHING_OPERATION_SPECS, draft.operation)
    ? TEACHING_OPERATION_SPECS[draft.operation]
    : null;
  if (!spec || spec.taskKind !== source.kind)
    return reviewIssue('This operation does not match the task. Its requirements need a separate review.');
  const bindings = {};
  for (const [name, type] of Object.entries(spec.bindings)) {
    const selection = draft.bindings?.[name];
    const input = draft.inputs.find((entry) => entry.id === selection?.inputId);
    if (!input || typeof input.text !== 'string') return reviewIssue(`Choose a source record for ${name}.`);
    if (type === 'record') bindings[name] = { inputId: input.id, start: 0, end: input.text.length };
    else {
      const positions = quoteOccurrences(input.text, selection.quote);
      const occurrence = positions.length === 1 ? 0 : selection.occurrence;
      if (!Number.isInteger(occurrence) || !Number.isInteger(positions[occurrence]))
        return reviewIssue(`Locate the exact text for ${name}; if it appears more than once, choose its occurrence.`);
      const start = positions[occurrence];
      bindings[name] = { inputId: input.id, start, end: start + selection.quote.length };
    }
  }
  try {
    const operationPlan = createTeachingOperationPlan({
      operation: draft.operation,
      inputs: draft.inputs,
      bindings,
      requirements: draft.requirements,
      // This is the proposed post-confirmation state. A preview never writes
      // it, and commitTeachingTaskReview independently requires confirmation.
      admission: { kind: 'teacher-confirmed', method: 'in-app-source-bindings', reviewedAt },
    });
    const updatedSource = { ...structuredClone(source), inputs: structuredClone(draft.inputs), operationPlan };
    if (!rebuildTeachingTaskSource(updatedSource)) return reviewIssue('The proposed task cannot be compiled.');
    return { status: 'valid', source: updatedSource };
  } catch (error) {
    return reviewIssue(error.message);
  }
}

function prepareReview({ courseMap, deliverables, draft, reviewedAt }) {
  const source = readTeachingTaskSources(courseMap).find((item) => item.id === draft?.taskId);
  if (!source) return reviewIssue('This task is no longer in the course. Reopen the task review.');
  if (draft.material) {
    const data = deliverables[draft.material.featureId]?.data;
    if (!data) return reviewIssue('The material was removed. Reopen the task review.');
    const pending = readPendingTeachingSourceInputs(data, source);
    if (pending.status === 'needs-review') return pending;
    if (revision(pending.inputs) !== draft.material.inputRevision)
      return reviewIssue('The source draft in this material changed. Reopen the review before applying it.');
  }
  const resolved = resolveTeachingTaskReviewDraft(source, draft, reviewedAt);
  if (resolved.status !== 'valid') return resolved;
  const transaction = projectTeachingTaskUpdate({ source, updatedSource: resolved.source, courseMap, deliverables });
  return { ...transaction, task: rebuildTeachingTaskSource(resolved.source) };
}

export function previewTeachingTaskReview({ courseMap, deliverables, draft }) {
  try {
    const reviewedAt = new Date().toISOString();
    const transaction = prepareReview({ courseMap, deliverables, draft, reviewedAt });
    if (transaction.status !== 'applied') return transaction;
    const featureIds = Object.keys(transaction.changed);
    const base = {
      course: revision(courseMap),
      materials: Object.fromEntries(featureIds.map((id) => [id, revision(deliverables[id])])),
    };
    const intent = { draft: structuredClone(draft), reviewedAt, base };
    return {
      status: 'preview',
      ...intent,
      revision: revision(intent),
      task: transaction.task,
      impacts: featureIds.map((featureId) => ({
        featureId,
        conflicts: transaction.conflicts.filter((conflict) => conflict.featureId === featureId),
      })),
      modelCalls: 0,
    };
  } catch (error) {
    return reviewIssue(error.message);
  }
}

/** Recompute from the reviewed intent, not caller-supplied material patches.
 * Both the authority and affected teacher documents must still match. */
export function commitTeachingTaskReview({ courseMap, deliverables, preview, teacherConfirmed = false }) {
  if (!teacherConfirmed)
    return reviewIssue('Confirm the source roles and task conditions before applying this review.');
  if (preview?.status !== 'preview') return reviewIssue('Preview the linked changes first.');
  try {
    if (preview.revision !== revision({ draft: preview.draft, reviewedAt: preview.reviewedAt, base: preview.base }))
      return reviewIssue('The preview changed. Create a fresh preview before applying it.');
    if (
      preview.base.course !== revision(courseMap) ||
      Object.entries(preview.base.materials).some(
        ([id, expected]) => !deliverables[id] || revision(deliverables[id]) !== expected,
      )
    )
      return reviewIssue(
        'The course or a related material changed after this preview. Preview again to preserve the newer edits.',
      );
    return prepareReview({ courseMap, deliverables, draft: preview.draft, reviewedAt: preview.reviewedAt });
  } catch (error) {
    return reviewIssue(error.message);
  }
}
