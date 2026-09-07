import { TEACHING_OPERATION_SPECS } from './teachingOperationPlan.js';

const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
const text = (value) => typeof value === 'string';
const strings = (value) => Array.isArray(value) && value.every(text);
const textFields = (value, fields) =>
  object(value) && fields.every((key) => value[key] === undefined || text(value[key]));
const response = (value) =>
  textFields(value, ['action', 'answer', 'feedback', 'label']) &&
  (value.reasoning === undefined || strings(value.reasoning)) &&
  (value.levels === undefined || (object(value.levels) && Object.values(value.levels).every(text)));

export const emptyTeachingReviewDrafts = () => ({ version: 1, entries: [], activeTaskId: null, unreadable: [] });

/** Checks whether an incomplete draft can be displayed safely, not whether
 * its task, source roles, arithmetic or scoring are ready for confirmation. */
export function editableTeachingReviewDraft(draft) {
  if (
    !object(draft) ||
    !text(draft.taskId) ||
    !draft.taskId ||
    ![1, 2].includes(draft.version) ||
    !Object.hasOwn(TEACHING_OPERATION_SPECS, draft.operation) ||
    !Array.isArray(draft.inputs) ||
    !draft.inputs.every((input) => object(input) && text(input.id) && text(input.text)) ||
    !object(draft.bindings) ||
    !Array.isArray(draft.requirements)
  )
    return false;
  if (draft.creation === undefined && !text(draft.sourceRevision)) return false;
  if (
    Object.keys(TEACHING_OPERATION_SPECS[draft.operation].bindings).some((key) => {
      const binding = draft.bindings[key];
      return (
        !object(binding) ||
        !text(binding.inputId) ||
        !text(binding.quote) ||
        !(binding.occurrence == null || Number.isInteger(binding.occurrence))
      );
    })
  )
    return false;
  if (
    draft.creation !== undefined &&
    (!object(draft.creation) ||
      !text(draft.creation.courseRevision) ||
      !text(draft.creation.identityKey) ||
      !Number.isInteger(draft.creation.lessonNumber) ||
      !text(draft.objective) ||
      !Number.isFinite(draft.sessionMinutes) ||
      !Number.isFinite(draft.practiceMinutes))
  )
    return false;
  if (
    draft.material !== undefined &&
    (!object(draft.material) || !text(draft.material.featureId) || !text(draft.material.inputRevision))
  )
    return false;
  if (
    draft.requirements.some(
      (r) =>
        !object(r) ||
        !text(r.id) ||
        !Number.isFinite(r.weight) ||
        (draft.version === 2 &&
          (!response(r) ||
            !response(r.transfer) ||
            (r.guided !== undefined && !textFields(r.guided, ['question', 'answer'])) ||
            (r.examples !== undefined && !textFields(r.examples, ['partial', 'misconception', 'alternative'])))),
    )
  )
    return false;
  if (
    draft.version === 2 &&
    (!Array.isArray(draft.practiceInputs) ||
      !draft.practiceInputs.every((input) => object(input) && text(input.id) && text(input.text) && text(input.kind)))
  )
    return false;
  return true;
}

/** Unsupported drafts stay in the project as recoverable data. They never
 * become confirmed course content or a restored preview/approval. */
export function restoreTeachingReviewDrafts(value) {
  const book = emptyTeachingReviewDrafts();
  if (value == null) return book;
  if (!object(value) || value.version !== 1 || !Array.isArray(value.entries)) {
    book.unreadable.push(structuredClone(value));
    return book;
  }
  book.unreadable = Array.isArray(value.unreadable) ? structuredClone(value.unreadable) : [];
  const ids = new Set();
  for (const entry of value.entries) {
    if (
      !object(entry) ||
      !editableTeachingReviewDraft(entry.draft) ||
      !text(entry.title) ||
      !text(entry.featureId) ||
      ids.has(entry.draft.taskId)
    ) {
      book.unreadable.push(structuredClone(entry));
      continue;
    }
    ids.add(entry.draft.taskId);
    // Only the draft is resumable. UI preview, confirmation and running state
    // are never copied, even if an imported file supplies those properties.
    book.entries.push({ draft: structuredClone(entry.draft), title: entry.title, featureId: entry.featureId });
  }
  book.activeTaskId = ids.has(value.activeTaskId) ? value.activeTaskId : null;
  return book;
}

export function saveTeachingReviewDraft(book, draft, { title = '', featureId = '' } = {}) {
  if (!editableTeachingReviewDraft(draft)) throw new Error('This teaching draft cannot be saved in the editor.');
  const entry = { draft: structuredClone(draft), title, featureId };
  const exists = book.entries.some((old) => old.draft.taskId === draft.taskId);
  return {
    ...book,
    activeTaskId: draft.taskId,
    entries: exists
      ? book.entries.map((old) => (old.draft.taskId === draft.taskId ? entry : old))
      : [...book.entries, entry],
  };
}

export function removeTeachingReviewDraft(book, taskId) {
  return {
    ...book,
    activeTaskId: book.activeTaskId === taskId ? null : book.activeTaskId,
    entries: book.entries.filter((entry) => entry.draft.taskId !== taskId),
  };
}
