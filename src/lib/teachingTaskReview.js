import { labeledSourceRecords } from './sourceBriefConstraints.js';
import { canonicalJson, sameJsonData } from './canonicalJson.js';
import { sha256HexSync } from './sha256Sync.js';
import { stripLessonPrefix } from './compilerText.js';
import { readTeachingTaskSources } from './teachingProgram.js';
import { rebuildTeachingTaskSource } from './teachingTaskSource.js';
import { createTeachingOperationPlan, TEACHING_OPERATION_SPECS } from './teachingOperationPlan.js';
import { projectTeachingTaskUpdate, readPendingTeachingSourceInputs } from './teachingTaskContentSync.js';
import { prepareTeachingGoalAlignment } from './teachingGoalAlignment.js';
import { deriveCourseGraphFromCourseMap } from './courseGraph/deriveFromCourseMap.js';

const revision = (value) => sha256HexSync(canonicalJson(value));
const reviewIssue = (message) => ({ status: 'needs-review', message });

/** Route supplied records to the existing review editor when generation has
 * not established any shared task. This is not an operation classifier. */
export function needsInitialTeachingTaskReview(courseMap, sourceBrief) {
  try {
    return (
      availableTeachingTaskLessons(courseMap).length > 0 &&
      readTeachingTaskSources(courseMap).length === 0 &&
      (labeledSourceRecords(String(sourceBrief || '').replace(/\r\n?/g, '\n')) || []).length > 0
    );
  } catch {
    return false;
  }
}

export function quoteOccurrences(text, quote) {
  if (typeof text !== 'string' || typeof quote !== 'string' || !quote.length) return [];
  const positions = [];
  for (let at = text.indexOf(quote); at !== -1; at = text.indexOf(quote, at + 1)) positions.push(at);
  return positions;
}

/** A proposal fills gaps in a draft; it cannot erase usable teacher choices.
 * Exact-source validity here is not confirmation of a phrase's teaching role. */
export function mergeTeachingSourceSuggestions(draft, suggested = {}) {
  const bindings = structuredClone(draft.bindings);
  const filledRoles = [],
    preservedRoles = [],
    differingRoles = [];
  for (const [role, type] of Object.entries(TEACHING_OPERATION_SPECS[draft.operation].bindings)) {
    const valid = (binding) => {
      const input = draft.inputs.find((entry) => entry.id === binding?.inputId);
      if (!input) return false;
      if (type === 'record') return true;
      const positions = quoteOccurrences(input.text, binding.quote);
      const occurrence = binding.occurrence ?? (positions.length === 1 ? 0 : undefined);
      return Number.isInteger(occurrence) && Number.isInteger(positions[occurrence]);
    };
    const current = bindings[role],
      candidate = suggested[role];
    if (valid(current)) {
      preservedRoles.push(role);
      if (
        valid(candidate) &&
        (candidate.inputId !== current.inputId ||
          (type !== 'record' &&
            (candidate.quote !== current.quote || (candidate.occurrence ?? 0) !== (current.occurrence ?? 0))))
      )
        differingRoles.push(role);
    } else if (valid(candidate)) {
      bindings[role] = structuredClone(candidate);
      filledRoles.push(role);
    }
  }
  return { bindings, filledRoles, preservedRoles, differingRoles };
}

/** The task list comes from the canonical course, never from an arbitrary
 * material's saved plan. Old ledgers are admitted through the same reader. */
export function reviewableTeachingTaskSources(courseMap) {
  return readTeachingTaskSources(courseMap).filter((source) => {
    const operation = source.operationPlan?.operation || rebuildTeachingTaskSource(source)?.operationPlan?.operation;
    return Object.hasOwn(TEACHING_OPERATION_SPECS, operation) || source.kind === 'source-proportion';
  });
}

export function availableTeachingTaskLessons(courseMap) {
  const sources = readTeachingTaskSources(courseMap);
  return (courseMap?.lessons || []).flatMap((lesson, index) => {
    const lessonNumber = lesson.lessonNumber || index + 1;
    return sources.some((source) => source.lessonNumber === lessonNumber)
      ? []
      : [{ lessonNumber, title: lesson.title || `Lesson ${lessonNumber}` }];
  });
}

/** A new task is a local draft until the same preview/confirmation transaction
 * used for later edits accepts it. Its identity is independent of its wording. */
export function createNewTeachingTaskReviewDraft(courseMap, { lessonNumber, operation, sourceBrief = '' } = {}) {
  const lesson = courseMap?.lessons?.find((row, index) => (row.lessonNumber || index + 1) === lessonNumber);
  const spec = Object.hasOwn(TEACHING_OPERATION_SPECS, operation) ? TEACHING_OPERATION_SPECS[operation] : null;
  if (!lesson || !spec || !availableTeachingTaskLessons(courseMap).some((row) => row.lessonNumber === lessonNumber))
    return reviewIssue('Choose a lesson without an existing shared task and a supported teaching operation.');
  const records = labeledSourceRecords(String(sourceBrief).replace(/\r\n?/g, '\n')) || [];
  // Copy explicit source records only. Compiled summaries and inferred claims
  // are not authoritative substitutes for the teacher's original packet.
  const suppliedInputs =
    records.length <= 8 ? records.map((text) => ({ id: `input-${crypto.randomUUID()}`, text })) : [];
  const explicitObjective =
    courseMap.lessons.length === 1
      ? /^\s*(?:learning objectives?|objectives?|学习目标|教学目标)\s*[:：]\s*(\S[^\n]*)$/im.exec(
          String(sourceBrief),
        )?.[1]
      : null;
  const identityKey = `authored-${crypto.randomUUID()}`;
  return {
    creation: { courseRevision: revision(courseMap), lessonNumber, identityKey },
    taskId: `task-${sha256HexSync(`${identityKey}:${spec.taskKind}`).slice(0, 16)}`,
    operation,
    version: 1,
    objective:
      explicitObjective ||
      (lesson.sections || [])
        .map((row) => row.learningObjectives)
        .filter(Boolean)
        .join('\n'),
    sessionMinutes: Number(courseMap.sessionMinutes) > 0 ? Number(courseMap.sessionMinutes) : 50,
    practiceMinutes: Math.min(
      spec.defaultPracticeMinutes || 10,
      Number(courseMap.sessionMinutes) > 0 ? Number(courseMap.sessionMinutes) : 50,
    ),
    inputs: suppliedInputs.length ? suppliedInputs : [{ id: `input-${crypto.randomUUID()}`, text: '' }],
    ...(records.length > 8
      ? {
          message:
            'This packet has more than eight records. Select the records for this task before requesting a proposal.',
        }
      : {}),
    bindings: Object.fromEntries(
      Object.keys(spec.bindings).map((name) => [name, { inputId: '', quote: '', occurrence: null }]),
    ),
    requirements: spec.requirements.map((id, index) => ({ id, weight: (spec.defaultWeights || [30, 35, 35])[index] })),
  };
}

function sourceForCreation(courseMap, draft) {
  if (draft.creation?.courseRevision !== revision(courseMap))
    return reviewIssue(
      'The course changed after this task draft was opened. Start a new draft using the current lesson.',
    );
  const { lessonNumber, identityKey } = draft.creation;
  const lesson = courseMap?.lessons?.find((row, index) => (row.lessonNumber || index + 1) === lessonNumber);
  const spec = Object.hasOwn(TEACHING_OPERATION_SPECS, draft.operation)
    ? TEACHING_OPERATION_SPECS[draft.operation]
    : null;
  if (
    !lesson ||
    !spec ||
    typeof identityKey !== 'string' ||
    !identityKey.startsWith('authored-') ||
    !availableTeachingTaskLessons(courseMap).some((row) => row.lessonNumber === lessonNumber)
  )
    return reviewIssue('This lesson is unavailable or already has a shared task. Review the current course.');
  if (
    typeof draft.objective !== 'string' ||
    !draft.objective.trim() ||
    draft.objective.length > 6000 ||
    !Number.isFinite(draft.sessionMinutes) ||
    draft.sessionMinutes <= 0 ||
    draft.sessionMinutes > 480 ||
    !Number.isFinite(draft.practiceMinutes) ||
    draft.practiceMinutes <= 0 ||
    draft.practiceMinutes > draft.sessionMinutes
  )
    return reviewIssue('Supply a teaching objective and a positive practice time within the class session.');
  return {
    version: 1,
    id: `task-${sha256HexSync(`${identityKey}:${spec.taskKind}`).slice(0, 16)}`,
    identityKey,
    lessonId: `lesson-${lessonNumber}`,
    lessonNumber,
    title: `Lesson ${lessonNumber}: ${stripLessonPrefix(lesson.title || '') || `Topic ${lessonNumber}`}`,
    objective: draft.objective.trim(),
    kind: spec.taskKind,
    scope: 'primary-task',
    inputs: structuredClone(draft.inputs),
    sessionMinutes: draft.sessionMinutes,
    practiceMinutes: draft.practiceMinutes,
    origin: { kind: 'teacher-authored-task' },
  };
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
    objective: source.objective,
    sourceRevision: revision(source),
    ...(featureId ? { material: { featureId, inputRevision: revision(pending.inputs) } } : {}),
    operation,
    version: plan?.version || 1,
    ...(plan?.goalAlignment ? { goalAlignment: structuredClone(plan.goalAlignment) } : {}),
    ...(plan?.admission?.proposal ? { proposal: structuredClone(plan.admission.proposal) } : {}),
    ...(plan?.practiceInputs ? { practiceInputs: structuredClone(plan.practiceInputs) } : {}),
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
          weight: (TEACHING_OPERATION_SPECS[operation].defaultWeights || [30, 35, 35])[index],
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
  const objective = draft.objective === undefined ? source.objective : draft.objective;
  if (typeof objective !== 'string' || !objective.trim() || objective.length > 6000)
    return reviewIssue('Supply a specific task objective before previewing the linked changes.');
  if ((objective !== source.objective || source.operationPlan?.goalAlignment) && !draft.goalAlignment)
    return reviewIssue('Link the task requirements to the current lesson targets before changing its objective.');
  const bindings = {};
  for (const [name, type] of Object.entries(spec.bindings)) {
    const selection = draft.bindings?.[name];
    const input = draft.inputs.find((entry) => entry.id === selection?.inputId);
    if (!input || typeof input.text !== 'string') return reviewIssue(`Choose a source record for ${name}.`);
    if (type === 'record') bindings[name] = { inputId: input.id, start: 0, end: input.text.length };
    else {
      const positions = quoteOccurrences(input.text, selection.quote);
      const occurrence = selection.occurrence ?? (positions.length === 1 ? 0 : undefined);
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
      version: draft.version || 1,
      practiceInputs: draft.practiceInputs,
      objective,
      goalAlignment: draft.goalAlignment,
      // This is the proposed post-confirmation state. A preview never writes
      // it, and commitTeachingTaskReview independently requires confirmation.
      admission: {
        kind: 'teacher-confirmed',
        method: 'in-app-source-bindings',
        reviewedAt,
        ...(draft.proposal?.inputRevision === revision({ operation: draft.operation, objective, inputs: draft.inputs })
          ? { proposal: structuredClone(draft.proposal) }
          : {}),
      },
    });
    const updatedSource = {
      ...structuredClone(source),
      objective,
      inputs: structuredClone(draft.inputs),
      operationPlan,
    };
    if (!rebuildTeachingTaskSource(updatedSource)) return reviewIssue('The proposed task cannot be compiled.');
    return { status: 'valid', source: updatedSource };
  } catch (error) {
    return reviewIssue(error.message);
  }
}

function prepareReview({ courseMap, courseGraph, deliverables, draft, reviewedAt }) {
  const source = draft?.creation
    ? sourceForCreation(courseMap, draft)
    : readTeachingTaskSources(courseMap).find((item) => item.id === draft?.taskId);
  if (source?.status === 'needs-review') return source;
  if (!source) return reviewIssue('This task is no longer in the course. Reopen the task review.');
  if (draft.goalAlignment !== undefined) {
    draft = {
      ...draft,
      goalAlignment: prepareTeachingGoalAlignment(
        draft.goalAlignment,
        draft.requirements,
        draft.objective ?? source.objective,
        courseGraph || deriveCourseGraphFromCourseMap(courseMap),
        source.lessonNumber,
      ),
    };
  }
  if (draft.material) {
    const data = deliverables[draft.material.featureId]?.data;
    if (!data) return reviewIssue('The material was removed. Reopen the task review.');
    const pending = readPendingTeachingSourceInputs(data, source);
    if (pending.status === 'needs-review') return pending;
    if (revision(pending.inputs) !== draft.material.inputRevision)
      return reviewIssue('The source draft in this material changed. Reopen the review before applying it.');
  }
  const resolved = resolveTeachingTaskReviewDraft(
    source,
    draft.creation ? { ...draft, sourceRevision: revision(source) } : draft,
    reviewedAt,
  );
  if (resolved.status !== 'valid') return resolved;
  const transaction = projectTeachingTaskUpdate({
    source: draft.creation ? null : source,
    updatedSource: resolved.source,
    courseMap,
    deliverables,
  });
  return { ...transaction, task: rebuildTeachingTaskSource(resolved.source) };
}

export function previewTeachingTaskReview({ courseMap, courseGraph, deliverables, draft }) {
  try {
    const reviewedAt = new Date().toISOString();
    const transaction = prepareReview({ courseMap, courseGraph, deliverables, draft, reviewedAt });
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
export function commitTeachingTaskReview({ courseMap, courseGraph, deliverables, preview, teacherConfirmed = false }) {
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
    return prepareReview({
      courseMap,
      courseGraph,
      deliverables,
      draft: preview.draft,
      reviewedAt: preview.reviewedAt,
    });
  } catch (error) {
    return reviewIssue(error.message);
  }
}
