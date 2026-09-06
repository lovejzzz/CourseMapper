import { projectSharedTeachingTasks, projectTeachingTasksIntoCourseMap } from './compilerTeachingTaskProjection.js';
import { rebuildTeachingTaskSource, validTeachingTaskSource } from './teachingTaskSource.js';
import { linkTeachingTaskSequence } from './compilerTeachingTaskSequence.js';
import { finalizeCompiledDeliverableLanguage } from './compiledLanguageFinalizer.js';

const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
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

/** Reconcile the previous and next generated projections against the teacher's
 * current document. Only changed generated leaves are candidates; a competing
 * teacher edit is retained and returned with its concrete proposed replacement. */
export function mergeTaskProjection(previous, next, current, path = [], conflicts = []) {
  if (equal(previous, next)) return current;
  // A generated revision digest is not instructor prose. Reconstruction can
  // normalize it without changing content; an accepted source edit owns its next value.
  if (path.at(-1) === 'taskRevision' && /^[a-f0-9]{64}$/.test(next) && /^[a-f0-9]{64}$/.test(previous)) return next;
  if (equal(current, previous) || equal(current, next)) return structuredClone(next);
  if (Array.isArray(previous) && Array.isArray(next) && Array.isArray(current)) {
    const field = arrayIdentity([previous, next, current]);
    if (field) {
      const before = new Map(previous.map((item) => [item[field], item]));
      const after = new Map(next.map((item) => [item[field], item]));
      const live = new Map(current.map((item) => [item[field], item]));
      const merged = current.flatMap((item, index) => {
        const id = item[field];
        if (!before.has(id)) return [item]; // teacher insertion
        if (!after.has(id) && equal(item, before.get(id))) return [];
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

function blueprintFor(sources) {
  const lessons = sources.flatMap((source) => {
    const teachingTask = rebuildTeachingTaskSource(source);
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
  return { lessons: linkTeachingTaskSequence(lessons) };
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
  const retained = retainedCountReferences(binding.source, updatedSource);
  if (!rebuildTeachingTaskSource(updatedSource) || retained.length) {
    return {
      status: 'needs-review',
      message: retained.length
        ? `The fraction changed, but another source row still uses a previous count: “${retained[0].text}” Review the observation as well; linked answers have not changed.`
        : 'This source edit changes or removes information required to solve the task. The edited text is saved; linked answers have not been guessed.',
    };
  }
  const sourcesById = new Map();
  for (const entry of Object.values(deliverables))
    for (const source of Array.isArray(entry?.data?.teachingTaskSources) ? entry.data.teachingTaskSources : [])
      if (validTeachingTaskSource(source)) sourcesById.set(source.id, source);
  // The canonical map wins over saved material copies. A stale copy must not
  // silently replace a more recent source revision.
  for (const source of Array.isArray(courseMap?.teachingTaskSources) ? courseMap.teachingTaskSources : [])
    if (validTeachingTaskSource(source)) sourcesById.set(source.id, source);
  if (sourcesById.has(binding.source.id) && !equal(sourcesById.get(binding.source.id), binding.source))
    return {
      status: 'needs-review',
      message: 'This material uses an older source revision. Review its pending sync before editing the shared record.',
    };
  sourcesById.set(binding.source.id, binding.source);
  const oldSources = [...sourcesById.values()];
  const sourceContext = rebuildTeachingTaskSource(binding.source)?.sourceContextId;
  const replacements = new Map(
    binding.source.inputs.flatMap((input, index) =>
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
  if (nextSources.some((source, index) => !equal(source, oldSources[index]) && !rebuildTeachingTaskSource(source)))
    return {
      status: 'needs-review',
      message:
        'A task that shares this record can no longer be solved. Review all linked source statements before propagating the edit.',
    };
  const affectedIds = new Set(
    nextSources.filter((source, index) => !equal(source, oldSources[index])).map((source) => source.id),
  );
  const oldBlueprint = blueprintFor(oldSources);
  const nextBlueprint = blueprintFor(nextSources);
  const changed = {};
  const before = {};
  const conflicts = [];
  for (const [id, entry] of Object.entries(deliverables)) {
    if (
      !entry?.data ||
      !Array.isArray(entry.data.teachingTaskSources) ||
      !entry.data.teachingTaskSources.some((source) => affectedIds.has(source.id))
    )
      continue;
    const previous = finalizeCompiledDeliverableLanguage(
      id,
      projectSharedTeachingTasks(id, structuredClone(entry.data), oldBlueprint),
      oldBlueprint,
    );
    const next = finalizeCompiledDeliverableLanguage(
      id,
      projectSharedTeachingTasks(id, structuredClone(entry.data), nextBlueprint),
      nextBlueprint,
    );
    const current = { ...entry.data };
    delete previous.teachingTaskSources;
    delete next.teachingTaskSources;
    delete current.teachingTaskSources;
    const localConflicts = [];
    const data = mergeTaskProjection(previous, next, current, [], localConflicts);
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
    if (id === featureId) setAt(data, editPath, displayed);
    before[id] = { data: entry.data, stale: entry.stale || false };
    changed[id] = { ...entry, data, stale: Boolean((entry.stale && !ownsStale) || data.taskSyncConflicts.length) };
    conflicts.push(...data.taskSyncConflicts.map((conflict) => ({ featureId: id, ...conflict })));
  }
  // Older saved maps may only carry the ledger on their materials. Use the
  // validated pre-edit ledger for identifying resource copies in both projections.
  const projectionMap = { ...courseMap, teachingTaskSources: oldSources };
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
  nextCourseMap.teachingTaskSources = nextSources;
  conflicts.push(...mapConflicts.map((conflict) => ({ featureId: 'courseMap', ...conflict })));
  return {
    status: 'applied',
    changed,
    before,
    courseMap: nextCourseMap,
    conflicts,
    taskId: updatedSource.id,
    inputId: binding.inputId,
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
