import { canonicalJson } from './canonicalJson.js';
import { sha256HexSync } from './sha256Sync.js';
import { rebuildTeachingTaskSource } from './teachingTaskSource.js';

export const RESPONSE_LEVELS = ['exemplary', 'proficient', 'developing', 'beginning', 'insufficient'];
const hash = (value) => sha256HexSync(canonicalJson(value));
export const responseReviewRevision = hash;
const clone = (value) => structuredClone(value);
const requireText = (value, max, name) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`Invalid ${name}.`);
};

/** Separate local notebook data. Never attach these records to course maps,
 * review drafts, compiled deliverables or project snapshots. */
export function createResponseReview(
  source,
  response,
  { id = globalThis.crypto.randomUUID(), now = new Date().toISOString() } = {},
) {
  requireText(response, 20000, 'response');
  const task = rebuildTeachingTaskSource(source);
  if (!task?.criteria?.length) throw new Error('A compiled task and rubric are required.');
  const snapshot = {
    source: clone(source),
    question: task.question,
    answer: task.answer,
    criteria: clone(task.criteria),
  };
  return {
    version: 1,
    id,
    createdAt: now,
    taskId: source.id,
    sourceRevision: hash(source),
    rubricRevision: hash(snapshot.criteria),
    snapshot,
    response,
    judgments: [],
    history: [],
  };
}

export function validateResponseReview(record) {
  if (record?.version !== 1 || typeof record.id !== 'string' || !record.id || record.id.length > 100)
    throw new Error('Invalid review record.');
  requireText(record.response, 20000, 'response');
  if (typeof record.createdAt !== 'string' || !Number.isFinite(Date.parse(record.createdAt)))
    throw new Error('Invalid review date.');
  if (
    record.sourceRevision !== hash(record.snapshot?.source) ||
    record.rubricRevision !== hash(record.snapshot?.criteria) ||
    record.taskId !== record.snapshot.source.id
  )
    throw new Error('The saved task or rubric revision does not match.');
  if (!Array.isArray(record.judgments) || !Array.isArray(record.history) || record.history.length > 200)
    throw new Error('Invalid review history.');
  const criteria = record.snapshot.criteria;
  if (!Array.isArray(criteria) || !criteria.length || criteria.length > 12) throw new Error('Invalid rubric.');
  const check = (judgments) => {
    if (!Array.isArray(judgments) || new Set(judgments.map((j) => j.criterionId)).size !== judgments.length)
      throw new Error('Duplicate or invalid judgments.');
    for (const judgment of judgments) {
      if (!criteria.some((c) => c.id === judgment.criterionId) || !RESPONSE_LEVELS.includes(judgment.level))
        throw new Error('Unknown rubric judgment.');
      requireText(judgment.reason, 2000, 'review reason');
      if (judgment.confirmedBy !== 'teacher') throw new Error('A teacher must confirm judgments.');
      if (judgment.level === 'insufficient') {
        if (judgment.evidence !== null) throw new Error('Insufficient evidence has no attributed span.');
      } else {
        const { start, end, quote } = judgment.evidence || {};
        if (
          !Number.isInteger(start) ||
          !Number.isInteger(end) ||
          start < 0 ||
          end <= start ||
          end > record.response.length ||
          !quote?.trim() ||
          record.response.slice(start, end) !== quote
        )
          throw new Error('Evidence must be an exact span of this response.');
      }
    }
  };
  check(record.judgments);
  record.history.forEach((entry) => check(entry.judgments));
  const pending = record.pendingFeedbackRevision;
  if (pending) {
    if (
      !/^[a-f0-9]{64}$/.test(pending.draftRevision) ||
      pending.sourceRevision !== record.sourceRevision ||
      pending.rubricRevision !== record.rubricRevision ||
      !Number.isFinite(Date.parse(pending.preparedAt)) ||
      pending.criterionId !== pending.judgment?.criterionId
    )
      throw new Error('Invalid pending feedback revision.');
    check([pending.judgment]);
    requireText(pending.feedback, 6000, 'pending teaching feedback');
  }
  const improvements = record.improvements || [];
  if (
    !Array.isArray(improvements) ||
    improvements.length > 100 ||
    new Set(improvements.map((entry) => entry.id)).size !== improvements.length
  )
    throw new Error('Invalid teaching revision history.');
  for (const entry of improvements) {
    if (
      !/^[a-f0-9]{64}$/.test(entry.id) ||
      (entry.pendingDraftRevision !== undefined && !/^[a-f0-9]{64}$/.test(entry.pendingDraftRevision)) ||
      !Number.isFinite(Date.parse(entry.appliedAt)) ||
      entry.fromSourceRevision !== record.sourceRevision ||
      entry.fromRubricRevision !== record.rubricRevision ||
      entry.toSourceRevision !== hash(entry.updatedSource) ||
      entry.toRubricRevision !== hash(entry.updatedCriteria) ||
      entry.updatedSource?.id !== record.taskId
    )
      throw new Error('Invalid teaching revision receipt.');
    check([entry.judgment]);
    if (
      entry.criterionId !== entry.judgment.criterionId ||
      entry.previousFeedback !==
        record.snapshot.source.operationPlan?.requirements?.find((r) => r.id === entry.criterionId)?.feedback ||
      entry.feedback !==
        entry.updatedSource.operationPlan?.requirements?.find((r) => r.id === entry.criterionId)?.feedback
    )
      throw new Error('The teaching revision does not match its requirement.');
    requireText(entry.feedback, 6000, 'teaching feedback');
  }
  return record;
}

/** No lexical grade inference. An explicit teacher decision and exact evidence
 * are required; absence of evidence is not a zero score. */
export function confirmResponseJudgment(
  record,
  { criterionId, level, reason, evidence = null },
  now = new Date().toISOString(),
) {
  validateResponseReview(record);
  const judgment = {
    criterionId,
    level,
    reason: reason.trim(),
    evidence: clone(evidence),
    confirmedBy: 'teacher',
    confirmedAt: now,
  };
  const next = {
    ...clone(record),
    judgments: [...record.judgments.filter((j) => j.criterionId !== criterionId), judgment],
    history: [...record.history, { at: now, judgments: clone(record.judgments) }],
  };
  return validateResponseReview(next);
}

export function undoResponseJudgment(record) {
  validateResponseReview(record);
  if (!record.history.length) return clone(record);
  const next = clone(record);
  next.judgments = next.history.pop().judgments;
  return next;
}

/** Count only the exact task AND rubric version, with explicit denominators.
 * These are reviewed samples, never a class mastery estimate. */
export function summarizeResponseReviews(records, sourceRevision, rubricRevision) {
  const unique = new Map();
  for (const record of records) {
    validateResponseReview(record);
    if (record.sourceRevision === sourceRevision && record.rubricRevision === rubricRevision)
      unique.set(record.id, record);
  }
  const rows = [...unique.values()];
  return {
    sampleCount: rows.length,
    criteria: (rows[0]?.snapshot.criteria || []).map((criterion) => {
      const counts = Object.fromEntries(RESPONSE_LEVELS.map((level) => [level, 0]));
      for (const row of rows) {
        const judgment = row.judgments.find((j) => j.criterionId === criterion.id);
        if (judgment) counts[judgment.level]++;
      }
      return {
        criterionId: criterion.id,
        label: criterion.label,
        counts,
        unreviewed: rows.length - Object.values(counts).reduce((a, b) => a + b, 0),
      };
    }),
  };
}
