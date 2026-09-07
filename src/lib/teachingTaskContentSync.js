import { projectSharedTeachingTasks, projectTeachingTasksIntoCourseMap } from './compilerTeachingTaskProjection.js';
import { readTeachingTaskSources, withTeachingTaskSources } from './teachingProgram.js';
import { rebuildTeachingTaskSource, validTeachingTaskSource } from './teachingTaskSource.js';
import { linkTeachingTaskSequence } from './compilerTeachingTaskSequence.js';
import { finalizeCompiledDeliverableLanguage } from './compiledLanguageFinalizer.js';
import { sameJsonData as equal } from './canonicalJson.js';
import { rebindTeachingOperationEdit } from './teachingOperationPlan.js';

const valueAt = (value, path) => path.reduce((node, key) => node?.[key], value);
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const IDENTITY_FIELDS = ['id', 'assessmentId', 'taskRole', 'practiceId', 'criterionId', 'lessonNumber', 'taskId'];
function arrayIdentity(arrays) {
  return IDENTITY_FIELDS.find((field) =>
    arrays.every(
      (array) =>
        array.every((item) => object(item) && item[field] !== undefined) &&
        new Set(array.map((item) => item[field])).size === array.length,
    ),
  );
}

function anchorsForPath(data, path) {
  const anchors = [];
  for (let depth = 0; depth < path.length; depth += 1) {
    if (typeof path[depth] !== 'number') continue;
    const array = valueAt(data, path.slice(0, depth));
    const field = Array.isArray(array) && arrayIdentity([array]);
    if (field) anchors.push({ depth, field, value: array[path[depth]]?.[field] });
  }
  return anchors;
}

function anchoredPath(data, edit) {
  const path = [...edit.path];
  for (const anchor of edit.anchors || []) {
    const array = valueAt(data, path.slice(0, anchor.depth));
    const matches = Array.isArray(array)
      ? array.flatMap((item, index) => (item?.[anchor.field] === anchor.value ? [index] : []))
      : [];
    if (matches.length !== 1) return null;
    path[anchor.depth] = matches[0];
  }
  return path;
}

function sameGeneratedProjection(a, b) {
  if (equal(a, b)) return true;
  // A regenerated revision digest can differ on an otherwise identical
  // identified practice item. Removing that generated item is safe; any
  // difference in its question, answer or other teacher content still conflicts.
  if (
    object(a) &&
    object(b) &&
    typeof a.taskId === 'string' &&
    a.taskId === b.taskId &&
    /^[a-f0-9]{64}$/.test(a.taskRevision) &&
    /^[a-f0-9]{64}$/.test(b.taskRevision) &&
    equal({ ...a, taskRevision: b.taskRevision }, b)
  )
    return true;
  // Older inserted content slides omitted the unused activity slot, while
  // replay wrote null. They represent the same empty slot. Restrict this
  // compatibility rule to identified generated content slides; real teacher
  // activities, notes, or other changes must still conflict when removed.
  const emptyActivitySlide = (slide) =>
    object(slide) &&
    slide.type === 'content' &&
    slide.enrichmentSource === 'shared-teaching-task' &&
    typeof slide.taskRole === 'string' &&
    typeof slide.taskId === 'string' &&
    (slide.activity === undefined || slide.activity === null);
  return emptyActivitySlide(a) && emptyActivitySlide(b) && equal({ ...a, activity: null }, { ...b, activity: null });
}

/** Reconcile the previous and next generated projections against the teacher's
 * current document. Only changed generated leaves are candidates; a competing
 * teacher edit is retained and returned with its concrete proposed replacement. */
export function mergeTaskProjection(previous, next, current, path = [], conflicts = []) {
  if (equal(previous, next)) return current;
  // A generated revision digest is not instructor prose. Reconstruction can
  // normalize it without changing content; an accepted source edit owns its next value.
  if (path.at(-1) === 'taskRevision' && /^[a-f0-9]{64}$/.test(next) && /^[a-f0-9]{64}$/.test(previous)) return next;
  if (sameGeneratedProjection(current, previous) || sameGeneratedProjection(current, next))
    return structuredClone(next);
  if (Array.isArray(previous) && Array.isArray(next) && Array.isArray(current)) {
    const field = arrayIdentity([previous, next, current]);
    if (field) {
      const before = new Map(previous.map((item) => [item[field], item]));
      const after = new Map(next.map((item) => [item[field], item]));
      const live = new Map(current.map((item) => [item[field], item]));
      const merged = current.flatMap((item, index) => {
        const id = item[field];
        if (!before.has(id)) return [item]; // teacher insertion
        if (!after.has(id) && sameGeneratedProjection(item, before.get(id))) return [];
        return [mergeTaskProjection(before.get(id), after.get(id), item, [...path, index], conflicts)];
      });
      for (let index = 0; index < next.length; index += 1) {
        const item = next[index],
          id = item[field];
        if (live.has(id)) continue;
        if (before.has(id)) {
          if (!equal(before.get(id), item))
            conflicts.push({
              path: [...path, index],
              previous: before.get(id),
              current: undefined,
              proposed: item,
              missingTarget: true,
              reason: 'You removed this item. Its updated generated version is retained here for review.',
            });
          continue; // teacher deletion
        }
        const following = next.slice(index + 1).map((entry) => entry[field]);
        const position = merged.findIndex((entry) => following.includes(entry[field]));
        merged.splice(position < 0 ? merged.length : position, 0, structuredClone(item));
      }
      return merged;
    }
  }
  if (
    Array.isArray(previous) &&
    Array.isArray(next) &&
    Array.isArray(current) &&
    previous.length === next.length &&
    previous.length === current.length
  ) {
    return current.map((value, index) =>
      mergeTaskProjection(previous[index], next[index], value, [...path, index], conflicts),
    );
  }
  if (object(previous) && object(next) && object(current)) {
    const merged = { ...current };
    for (const key of new Set([...Object.keys(previous), ...Object.keys(next)])) {
      if (equal(previous[key], next[key])) continue;
      const value = mergeTaskProjection(previous[key], next[key], current[key], [...path, key], conflicts);
      if (value === undefined) delete merged[key];
      else merged[key] = value;
    }
    return merged;
  }
  conflicts.push({ path, previous, current, proposed: next });
  return current;
}

function sourceBinding(data, path) {
  if (!Array.isArray(path) || typeof path[1] !== 'number') return null;
  const row = valueAt(data, path.slice(0, 2));
  const source = (Array.isArray(data?.teachingTaskSources) ? data.teachingTaskSources : []).find(
    (entry) => entry.id === row?.taskId,
  );
  if (!source) return null;
  const field = path.slice(2).join('.');
  const inputPath = /^(?:sourceEvidenceBrief\.claims|workedExample\.inputs|practiceRecord\.records)\.\d+$/.test(field);
  const labeledInput = /^(?:materials|supportResources)\.\d+$/.test(field);
  const artifactInput = /^sourceArtifacts\.\d+\.locator$/.test(field);
  if (!inputPath && !labeledInput && !artifactInput) return null;
  const displayed = valueAt(data, path);
  const text = labeledInput ? String(displayed).replace(/^Source record \d+: /, '') : displayed;
  const matches = source.inputs.filter((input) => input.text === text);
  const position = artifactInput ? path.at(-2) : path.at(-1);
  const input = matches.length === 1 ? matches[0] : source.inputs[position];
  return input ? { source, inputId: input.id, labeledInput, artifactInput } : null;
}

/** Recover a saved, explicitly edited source sentence for the review form.
 * Multiple incompatible drafts stay a review issue instead of picking one. */
export function readPendingTeachingSourceInputs(data, source) {
  const saved = data?.teachingTaskSources?.find((entry) => entry?.id === source.id);
  if (saved && !equal(saved, source))
    return {
      status: 'needs-review',
      message:
        'This material has an older source revision. Resolve its linked updates before reviewing the shared task.',
    };
  const candidates = new Map(source.inputs.map((input) => [input.id, new Set()]));
  function visit(value, path = []) {
    if (typeof value === 'string') {
      const binding = sourceBinding(data, path);
      if (binding?.source.id !== source.id) return;
      const text = binding.labeledInput ? value.replace(/^Source record \d+: /, '') : value;
      if (text !== source.inputs.find((input) => input.id === binding.inputId)?.text)
        candidates.get(binding.inputId)?.add(text);
    } else if (Array.isArray(value)) value.forEach((entry, index) => visit(entry, [...path, index]));
    else if (object(value))
      for (const [key, entry] of Object.entries(value)) {
        if (!['teachingTaskSources', 'teacherEdits', 'taskSyncConflicts'].includes(key)) visit(entry, [...path, key]);
      }
  }
  if (data?.taskSourceReview) visit(data);
  if ([...candidates.values()].some((values) => values.size > 1))
    return {
      status: 'needs-review',
      message:
        'More than one edited wording exists for the same source. Reconcile those source rows before reviewing the task.',
    };
  return {
    status: 'ready',
    inputs: source.inputs.map((input) => ({ ...input, text: [...candidates.get(input.id)][0] ?? input.text })),
  };
}

// A fraction edit is not permission to rewrite separately stated observations.
// Catch unchanged references to a replaced count; teachers can correct the
// source rows together, including a previously saved draft, before propagation.
function retainedCountReferences(previous, next) {
  const before = rebuildTeachingTaskSource(previous)?.workedExample?.verification;
  const after = rebuildTeachingTaskSource(next)?.workedExample?.verification;
  if (!before || !after) return [];
  const words = [
    'zero',
    'one',
    'two',
    'three',
    'four',
    'five',
    'six',
    'seven',
    'eight',
    'nine',
    'ten',
    'eleven',
    'twelve',
    'thirteen',
    'fourteen',
    'fifteen',
    'sixteen',
    'seventeen',
    'eighteen',
    'nineteen',
    'twenty',
  ];
  const changed = ['numerator', 'denominator'].filter((key) => String(before[key]) !== String(after[key]));
  return next.inputs.filter((input, index) => {
    if (input.text !== previous.inputs[index]?.text || /\d\s*\//.test(input.text)) return false;
    return changed.some((key) => {
      const value = Number(before[key]);
      return new RegExp(`\\b(?:${value}${words[value] ? `|${words[value]}` : ''})\\b`, 'i').test(input.text);
    });
  });
}

function blueprintFor(sources, { legacyOperationPresentation = false, courseMap } = {}) {
  const lessons = sources.flatMap((source) => {
    const teachingTask = rebuildTeachingTaskSource(source, source.objective, {
      legacyOperationPresentation: legacyOperationPresentation && source.operationPlan === undefined,
    });
    return teachingTask
      ? [
          {
            id: source.lessonId,
            lessonNumber: source.lessonNumber,
            title: source.title,
            outcomes: [source.objective],
            teachingTask,
            teachingTaskScope: source.scope,
            classSessionPlan: { sessionMinutes: source.sessionMinutes },
          },
        ]
      : [];
  });
  // A sparse task ledger must retain the course's lesson positions on both
  // creation and later edits. Otherwise a lesson-two task can claim lesson one.
  const courseLessons = courseMap?.lessons?.length
    ? courseMap.lessons.map((row, index) => {
        const lessonNumber = row.lessonNumber || index + 1;
        return (
          lessons.find((lesson) => lesson.lessonNumber === lessonNumber) || {
            id: `lesson-${lessonNumber}`,
            lessonNumber,
            title: row.title || `Lesson ${lessonNumber}`,
            outcomes: (row.sections || []).map((section) => section.learningObjectives).filter(Boolean),
          }
        );
      })
    : null;
  return { lessons: linkTeachingTaskSequence(courseLessons || lessons) };
}

// A task projection does not own prose it did not change. Re-running global
// title compression on those leaves can manufacture a conflict or rewrite an
// unrelated lesson merely because a new task was added elsewhere.
function keepUnprojectedText(current, projected, finalized) {
  // projected is already detached. Returning current would alias live state
  // when the caller later removes transport metadata from this merge copy.
  if (equal(current, projected)) return projected;
  if (object(current) && object(projected) && object(finalized))
    return Object.fromEntries(
      Object.entries(finalized).map(([key, value]) => [key, keepUnprojectedText(current[key], projected[key], value)]),
    );
  if (Array.isArray(current) && Array.isArray(projected) && Array.isArray(finalized)) {
    const field = arrayIdentity([current, projected, finalized]);
    if (field) {
      const live = new Map(current.map((item) => [item[field], item]));
      const raw = new Map(projected.map((item) => [item[field], item]));
      return finalized.map((item) => keepUnprojectedText(live.get(item[field]), raw.get(item[field]), item));
    }
    if (current.length === projected.length && projected.length === finalized.length)
      return finalized.map((item, index) => keepUnprojectedText(current[index], projected[index], item));
  }
  return finalized;
}

function finalizeTaskProjection(feature, current, blueprint) {
  const projected = projectSharedTeachingTasks(feature, structuredClone(current), blueprint);
  const finalized = finalizeCompiledDeliverableLanguage(feature, structuredClone(projected), blueprint);
  return keepUnprojectedText(current, projected, finalized);
}

export function applyTeachingTaskSourceEdit({ featureId, oldData, newData, editPath, deliverables, courseMap }) {
  const binding = sourceBinding(oldData, editPath);
  if (!binding) return null;
  const displayed = valueAt(newData, editPath);
  const text = binding.labeledInput ? String(displayed).replace(/^Source record \d+: /, '') : displayed;
  const updatedSource = {
    ...binding.source,
    inputs: binding.source.inputs.map((input) => ({ ...input, ...(input.id === binding.inputId ? { text } : {}) })),
  };
  const groupPath = binding.artifactInput ? editPath.slice(0, -2) : editPath.slice(0, -1);
  const group = valueAt(newData, groupPath);
  if (Array.isArray(group)) {
    for (let index = 0; index < group.length; index += 1) {
      const path = [...groupPath, index, ...(binding.artifactInput ? ['locator'] : [])];
      const other = sourceBinding(oldData, path);
      if (other?.source.id !== binding.source.id) continue;
      const value = valueAt(newData, path);
      const item = updatedSource.inputs.find((input) => input.id === other.inputId);
      if (item) item.text = binding.labeledInput ? String(value).replace(/^Source record \d+: /, '') : value;
    }
  }
  const sourcePlan =
    binding.source.operationPlan !== undefined
      ? binding.source.operationPlan
      : rebuildTeachingTaskSource(binding.source)?.operationPlan;
  if (sourcePlan !== undefined) {
    const plan = rebindTeachingOperationEdit(sourcePlan, binding.source.inputs, updatedSource.inputs);
    if (!plan)
      return {
        status: 'needs-review',
        message:
          'This edit changes the bound source relationship, units, or missing evidence. Review the teaching task before updating linked answers; your edited text is preserved.',
      };
    updatedSource.operationPlan = plan;
  }
  const retained = retainedCountReferences(binding.source, updatedSource);
  if (!rebuildTeachingTaskSource(updatedSource) || retained.length) {
    return {
      status: 'needs-review',
      message: retained.length
        ? `The fraction changed, but another source row still uses a previous count: “${retained[0].text}” Review the observation as well; linked answers have not changed.`
        : 'This source edit changes or removes information required to solve the task. The edited text is saved; linked answers have not been guessed.',
    };
  }
  return projectTeachingTaskUpdate({
    source: binding.source,
    updatedSource,
    deliverables,
    courseMap,
    materialEdit: { featureId, editPath, displayed, inputId: binding.inputId },
  });
}

/** One projection/merge path for direct source edits and reviewed structural
 * changes. This is pure: callers atomically apply the returned transaction. */
export function projectTeachingTaskUpdate({
  source: originalSource,
  updatedSource,
  deliverables,
  courseMap,
  materialEdit,
}) {
  const inserting = originalSource == null;
  if (
    !validTeachingTaskSource(updatedSource) ||
    (!inserting &&
      (!validTeachingTaskSource(originalSource) ||
        originalSource.id !== updatedSource.id ||
        originalSource.kind !== updatedSource.kind ||
        originalSource.lessonId !== updatedSource.lessonId ||
        !equal(
          originalSource.inputs.map((input) => input.id),
          updatedSource.inputs.map((input) => input.id),
        ))) ||
    !rebuildTeachingTaskSource(updatedSource)
  )
    return { status: 'needs-review', message: 'The proposed teaching task is not valid. No material has changed.' };
  const sourcesById = new Map();
  for (const entry of Object.values(deliverables))
    for (const source of Array.isArray(entry?.data?.teachingTaskSources) ? entry.data.teachingTaskSources : [])
      if (validTeachingTaskSource(source)) sourcesById.set(source.id, source);
  // The canonical map wins over saved material copies. A stale copy must not
  // silently replace a more recent source revision.
  for (const source of readTeachingTaskSources(courseMap))
    if (validTeachingTaskSource(source)) sourcesById.set(source.id, source);
  if (
    inserting &&
    [...sourcesById.values()].some(
      (source) => source.id === updatedSource.id || source.lessonNumber === updatedSource.lessonNumber,
    )
  )
    return {
      status: 'needs-review',
      message:
        'This lesson already has a shared task in its course or saved materials. Review that task before creating another.',
    };
  if (!inserting && sourcesById.has(originalSource.id) && !equal(sourcesById.get(originalSource.id), originalSource))
    return {
      status: 'needs-review',
      message: 'This material uses an older source revision. Review its pending sync before editing the shared record.',
    };
  if (!inserting) sourcesById.set(originalSource.id, originalSource);
  // A structural review must not clear a different, still-unreviewed source
  // edit in another material. It may consume that pending edit only when the
  // accepted source includes the exact wording the teacher entered.
  for (const entry of Object.values(deliverables)) {
    if (
      inserting ||
      !entry?.data?.taskSourceReview ||
      !entry.data.teachingTaskSources?.some((source) => source?.id === originalSource.id)
    )
      continue;
    const pending = readPendingTeachingSourceInputs(entry.data, originalSource);
    if (pending.status === 'needs-review') return pending;
    if (
      pending.inputs.some(
        (input, index) =>
          input.text !== originalSource.inputs[index].text && input.text !== updatedSource.inputs[index].text,
      )
    )
      return {
        status: 'needs-review',
        message:
          'Another material has an unreviewed source edit. Include its wording in this review before updating the shared task.',
      };
  }
  const oldSources = [...sourcesById.values()];
  const sourceContext = rebuildTeachingTaskSource(originalSource)?.sourceContextId;
  const replacements = new Map(
    (originalSource?.inputs || []).flatMap((input, index) =>
      input.text !== updatedSource.inputs[index].text ? [[input.text, updatedSource.inputs[index].text]] : [],
    ),
  );
  // The existing sequence contract explicitly links diagnosis and repair to
  // one concrete comparison. Update that shared record in both tasks before
  // regenerating prerequisite links; unrelated equal words are not a binding.
  const nextSources = oldSources.map((source) => {
    if (source.id === updatedSource.id) return updatedSource;
    if (!sourceContext || rebuildTeachingTaskSource(source)?.sourceContextId !== sourceContext) return source;
    return {
      ...source,
      inputs: source.inputs.map((input) => ({ ...input, text: replacements.get(input.text) ?? input.text })),
    };
  });
  if (inserting) nextSources.push(updatedSource);
  if (nextSources.some((source, index) => !equal(source, oldSources[index]) && !rebuildTeachingTaskSource(source)))
    return {
      status: 'needs-review',
      message:
        'A task that shares this record can no longer be solved. Review all linked source statements before propagating the edit.',
    };
  const affectedIds = new Set(
    nextSources.filter((source, index) => !equal(source, oldSources[index])).map((source) => source.id),
  );
  const oldBlueprint = blueprintFor(oldSources, {
    legacyOperationPresentation: true,
    courseMap,
  });
  const nextBlueprint = blueprintFor(nextSources, { courseMap });
  const changed = {};
  const before = {};
  const conflicts = [];
  for (const [id, entry] of Object.entries(deliverables)) {
    if (
      !entry?.data ||
      (inserting
        ? ![
            'syllabus',
            'lessonPlans',
            'slideDecks',
            'assignments',
            'rubrics',
            'discussions',
            'quizBank',
            'studyGuides',
            'courseFaq',
          ].includes(id)
        : !Array.isArray(entry.data.teachingTaskSources) ||
          !entry.data.teachingTaskSources.some((source) => affectedIds.has(source.id)))
    )
      continue;
    const previous = finalizeTaskProjection(id, entry.data, oldBlueprint);
    const next = finalizeTaskProjection(id, entry.data, nextBlueprint);
    const current = { ...entry.data };
    delete previous.teachingTaskSources;
    delete next.teachingTaskSources;
    delete current.teachingTaskSources;
    const localConflicts = [];
    const merged = mergeTaskProjection(previous, next, current, [], localConflicts);
    const data = inserting ? preserveTeacherEdits(entry.data, merged) : merged;
    if (inserting) localConflicts.push(...(data.taskSyncConflicts || []));
    // A source edit is explicitly accepted, unlike a competing prose edit.
    data.teachingTaskSources = nextSources;
    const freshConflicts = localConflicts.map((conflict) => ({
      ...conflict,
      anchors: anchorsForPath(entry.data, conflict.path),
    }));
    const retainedConflicts = (entry.data.taskSyncConflicts || []).filter((conflict) => {
      const path = anchoredPath(data, conflict);
      return (
        !freshConflicts.some((fresh) => equal(fresh.path, path)) &&
        (conflict.missingTarget || !path || !equal(valueAt(data, path), conflict.proposed))
      );
    });
    data.taskSyncConflicts = [...retainedConflicts, ...freshConflicts];
    const ownsStale = Boolean(entry.data.taskSyncStaleOwned || !entry.stale);
    data.taskSyncStaleOwned = Boolean(data.taskSyncConflicts.length && ownsStale);
    data.teacherEdits = (data.teacherEdits || []).filter(
      (edit) => !affectedIds.has(sourceBinding(entry.data, edit.path)?.source.id),
    );
    delete data.taskSourceReview;
    delete data.taskSourceReviewLesson;
    if (id === materialEdit?.featureId) setAt(data, materialEdit.editPath, materialEdit.displayed);
    before[id] = { data: entry.data, stale: entry.stale || false };
    changed[id] = { ...entry, data, stale: Boolean((entry.stale && !ownsStale) || data.taskSyncConflicts.length) };
    conflicts.push(...data.taskSyncConflicts.map((conflict) => ({ featureId: id, ...conflict })));
  }
  // Older saved maps may only carry the ledger on their materials. Use the
  // validated pre-edit ledger for identifying resource copies in both projections.
  const projectionMap = withTeachingTaskSources(courseMap, oldSources);
  const previousMap = { ...projectTeachingTasksIntoCourseMap(projectionMap, oldBlueprint) };
  const nextMap = { ...projectTeachingTasksIntoCourseMap(projectionMap, nextBlueprint) };
  const currentMap = { ...courseMap };
  // This ledger is owned by the accepted source transaction, not by the
  // course-outline text editor. Reconstruction can normalize its metadata;
  // that must not become a competing teacher prose edit. Source revision
  // admission above already compares the authoritative ledger to the binding.
  delete previousMap.teachingTaskSources;
  delete nextMap.teachingTaskSources;
  delete currentMap.teachingTaskSources;
  delete previousMap.teachingProgram;
  delete nextMap.teachingProgram;
  delete currentMap.teachingProgram;
  // Older/prose-generated maps can lack compiler-owned lesson links. Their
  // reconstruction is not a teacher edit. Keep actual outline prose in the
  // three-way comparison, then restore links from the accepted projection.
  const nextLinks = nextMap.lessons?.map((lesson) => lesson.teachingTaskLink);
  for (const map of [previousMap, nextMap, currentMap]) {
    map.lessons = map.lessons?.map((lesson) => {
      const copy = { ...lesson };
      delete copy.teachingTaskLink;
      return copy;
    });
  }
  const mapConflicts = [];
  const nextCourseMap = mergeTaskProjection(previousMap, nextMap, currentMap, [], mapConflicts);
  if (mapConflicts.length) {
    const conflict = mapConflicts[0];
    return {
      status: 'needs-review',
      message: `A teacher-edited course outline field also depends on this record (${conflict.path.join(' / ')}). Review its current wording against the updated source before retrying this edit. No linked material has changed.`,
    };
  }
  nextCourseMap.lessons = nextCourseMap.lessons?.map((lesson, index) => ({
    ...lesson,
    ...(nextLinks?.[index] ? { teachingTaskLink: nextLinks[index] } : {}),
  }));
  const acceptedCourseMap = withTeachingTaskSources({ ...courseMap, ...nextCourseMap }, nextSources);
  conflicts.push(...mapConflicts.map((conflict) => ({ featureId: 'courseMap', ...conflict })));
  return {
    status: 'applied',
    changed,
    before,
    courseMap: acceptedCourseMap,
    conflicts,
    taskId: updatedSource.id,
    ...(materialEdit?.inputId ? { inputId: materialEdit.inputId } : {}),
    modelCalls: 0,
  };
}

function setAt(data, path, value) {
  const parent = valueAt(data, path.slice(0, -1));
  if (!parent || !path.length) return;
  const key = path.at(-1);
  if (value !== undefined) parent[key] = value;
  else if (Array.isArray(parent) && typeof key === 'number') parent.splice(key, 1);
  else delete parent[key];
}

/** Sparse edit records preserve exactly the fields teachers changed; they do
 * not save a second full copy of every generated material. */
export function rememberTeacherEdit(oldData, newData, path) {
  if (!Array.isArray(path) || !path.length) return newData;
  const edits = (oldData?.teacherEdits || []).filter((edit) => !equal(edit.path, path));
  const existing = oldData?.teacherEdits?.find((edit) => equal(edit.path, path));
  const generated = existing ? existing.generated : valueAt(oldData, path);
  if (!equal(valueAt(newData, path), generated)) {
    const anchors = anchorsForPath(oldData, path);
    edits.push({ path, generated, anchors: existing?.anchors || anchors });
  }
  return { ...newData, teacherEdits: edits };
}

export function preserveTeacherEdits(current, compiled) {
  if (!current?.teacherEdits?.length && !current?.taskSyncArchive?.length) return compiled;
  const next = structuredClone(compiled);
  if (current.taskSyncArchive?.length) next.taskSyncArchive = structuredClone(current.taskSyncArchive);
  if (!current.teacherEdits?.length) return next;
  next.teacherEdits = structuredClone(current.teacherEdits);
  const conflicts = [];
  for (const edit of current.teacherEdits) {
    const currentPath = anchoredPath(current, edit);
    const retained = current.taskSyncConflicts?.find(
      (conflict) => conflict.missingTarget && equal(conflict.path, edit.path),
    );
    const teacher = currentPath ? valueAt(current, currentPath) : retained?.current;
    const targetPath = [...edit.path];
    let missing = false;
    for (const anchor of edit.anchors || []) {
      const array = valueAt(compiled, targetPath.slice(0, anchor.depth));
      const matches = Array.isArray(array)
        ? array.map((item, index) => (item?.[anchor.field] === anchor.value ? index : -1)).filter((index) => index >= 0)
        : [];
      if (matches.length !== 1) {
        missing = true;
        break;
      }
      targetPath[anchor.depth] = matches[0];
    }
    const proposed = missing ? undefined : valueAt(compiled, targetPath);
    if (missing) {
      conflicts.push({
        path: edit.path,
        anchors: edit.anchors,
        previous: edit.generated,
        current: teacher,
        proposed,
        missingTarget: true,
        reason:
          'The edited item was removed. Copy the retained text into another item, or keep the removal and archive this text.',
      });
      continue;
    }
    if (!equal(proposed, edit.generated) && !equal(proposed, teacher))
      conflicts.push({ path: targetPath, anchors: edit.anchors, previous: edit.generated, current: teacher, proposed });
    setAt(next, targetPath, teacher);
    const stored = next.teacherEdits?.find((entry) => equal(entry.path, edit.path));
    if (stored) stored.path = targetPath;
  }
  next.taskSyncConflicts = conflicts;
  return next;
}

export function resolveTaskSyncConflict(data, index, useProposed) {
  const conflict = data?.taskSyncConflicts?.[index];
  if (!conflict) return data;
  const target = anchoredPath(data, conflict);
  const next = structuredClone(data);
  if (!target || conflict.missingTarget) {
    if (useProposed) return data;
    next.taskSyncArchive = [...(next.taskSyncArchive || []), structuredClone(conflict)];
    next.taskSyncConflicts.splice(index, 1);
    next.teacherEdits = (next.teacherEdits || []).filter((edit) => !equal(edit.path, conflict.path));
    if (!next.taskSyncConflicts.length) next.taskSyncStaleOwned = false;
    return next;
  }
  if (useProposed) setAt(next, target, conflict.proposed);
  next.taskSyncConflicts.splice(index, 1);
  if (!next.taskSyncConflicts.length) next.taskSyncStaleOwned = false;
  next.teacherEdits = (next.teacherEdits || []).filter(
    (edit) => !equal(edit.path, conflict.path) && !equal(edit.path, target),
  );
  if (!useProposed) {
    const baseline = structuredClone(next);
    setAt(baseline, target, conflict.proposed);
    return rememberTeacherEdit(baseline, next, target);
  }
  return next;
}
