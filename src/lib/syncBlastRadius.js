/**
 * syncBlastRadius — v0.14.7 WS-G2: the TRUE blast radius of an edit.
 *
 * The hand-maintained FIELD_DEPENDENCY_MAP was an approximation of something
 * the compiler computes exactly: deliverables are pure functions of the
 * blueprint, so "what does this edit affect?" is answered by recompiling
 * against the edited map (~500ms for all nine features) and DIFFING against
 * the current deliverable state using registry identity. Two silent holes
 * close by construction: the syllabus rejoins the radius (its grading table
 * diffs when an assessment weight changes — syncDependencies.js:226 excluded
 * it from every per-lesson plan), and readings edits propagate to every
 * surface that inherits them.
 *
 * The per-item diffs double as the approval card's preview ("Grading table:
 * Midterm 2 — 20% → 25%") — the educator sees exactly what will change
 * BEFORE clicking Sync (WS-G4).
 *
 * Pure module: enrichment tiers are passed in (overlay + kernel cache), no
 * storage access here. Falls back are the caller's job — if this throws,
 * useSmartSync keeps the legacy lookup-table plan (belt, never silent).
 */
import {
  buildCourseBlueprint,
  compactBlueprintForStorage,
  compileBlueprintDeliverables,
  isBlueprintCompiledFeature,
} from './courseBlueprintCompiler';
import { attachEnrichmentToGraph, buildBlueprintFromGraph, deriveCourseGraphFromCourseMap } from './courseGraph';
import { renderedDeliverableContentRoot } from './renderedDeliverableRoot.js';

const FEATURE_LABELS = {
  syllabus: 'Syllabus',
  lessonPlans: 'Lesson plan',
  slideDecks: 'Slide deck',
  assignments: 'Assignment brief',
  rubrics: 'Rubric',
  discussions: 'Discussion prompt',
  quizBank: 'Quiz & exam bank',
  studyGuides: 'Study guide',
  courseFaq: 'Course FAQ',
};

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(',')}}`;
}

/** djb2 — cheap content fingerprint, not security-sensitive. */
function hashString(text) {
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(36);
}

const fingerprint = (item) => hashString(stableStringify(item));

function itemLessonNumber(item) {
  for (const value of [item?.lessonNumber, item?.week, item?.weekNumber]) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const registry = String(item?.assessmentId || item?.registryId || '').match(/^[A-Z](\d{1,2})\./);
  if (registry) return Number(registry[1]);
  return null;
}

/** Registry identity first (Law: identity before content), title second. */
function itemIdentity(item, index) {
  const registryId = item?.assessmentId || item?.registryId || item?.readingId || item?.id;
  if (registryId) return `id:${registryId}`;
  const title = String(item?.title || item?.lessonTitle || item?.name || '').trim();
  const lessonNumber = itemLessonNumber(item);
  if (title) return `t:${lessonNumber ?? '?'}:${title.toLowerCase()}`;
  return `i:${index}`;
}

function itemSummaryName(item) {
  const registryId = item?.assessmentId || item?.registryId || '';
  const title = String(item?.title || item?.lessonTitle || item?.name || '').trim();
  return [registryId, title].filter(Boolean).join(' — ') || 'entry';
}

function diffItemArray(featureId, prevItems, nextItems) {
  const label = FEATURE_LABELS[featureId] || featureId;
  const prevByKey = new Map(prevItems.map((item, index) => [itemIdentity(item, index), item]));
  const nextByKey = new Map(nextItems.map((item, index) => [itemIdentity(item, index), item]));
  const changes = [];
  for (const [key, nextItem] of nextByKey) {
    const prevItem = prevByKey.get(key);
    if (!prevItem) {
      changes.push({
        change: 'added',
        lessonNumber: itemLessonNumber(nextItem),
        summary: `${label}: ${itemSummaryName(nextItem)} added`,
      });
    } else if (fingerprint(prevItem) !== fingerprint(nextItem)) {
      changes.push({
        change: 'updated',
        lessonNumber: itemLessonNumber(nextItem),
        summary: `${label}: ${itemSummaryName(nextItem)} updated`,
      });
    }
  }
  for (const [key, prevItem] of prevByKey) {
    if (!nextByKey.has(key)) {
      changes.push({
        change: 'removed',
        lessonNumber: itemLessonNumber(prevItem),
        summary: `${label}: ${itemSummaryName(prevItem)} removed`,
      });
    }
  }
  return changes;
}

/** The syllabus is one document, not an item array — its grading table and
 *  schedule rows are the entities worth naming in a preview. */
function diffSyllabusObject(prevDoc, nextDoc) {
  const changes = [];
  const prevRows = new Map((prevDoc?.courseRequirements || []).map((row) => [String(row?.name || ''), row]));
  const nextRows = new Map((nextDoc?.courseRequirements || []).map((row) => [String(row?.name || ''), row]));
  for (const [name, nextRow] of nextRows) {
    const prevRow = prevRows.get(name);
    if (!prevRow)
      changes.push({ change: 'added', lessonNumber: null, summary: `Syllabus grading table: ${name} added` });
    else if (fingerprint(prevRow) !== fingerprint(nextRow))
      changes.push({ change: 'updated', lessonNumber: null, summary: `Syllabus grading table: ${name} updated` });
  }
  for (const name of prevRows.keys()) {
    if (!nextRows.has(name))
      changes.push({ change: 'removed', lessonNumber: null, summary: `Syllabus grading table: ${name} removed` });
  }
  // Everything else (schedule, policies, texts) — one coarse, honest line.
  const stripRows = (doc) => {
    if (!doc || typeof doc !== 'object') return doc;
    const { courseRequirements, ...rest } = doc;
    return rest;
  };
  if (fingerprint(stripRows(prevDoc)) !== fingerprint(stripRows(nextDoc))) {
    changes.push({ change: 'updated', lessonNumber: null, summary: 'Syllabus: schedule/required texts updated' });
  }
  return changes;
}

// Diff the same content authority used by rendering and export. Raw arrays
// remain supported for old custom snapshots.
function rootValueOf(featureId, data) {
  if (Array.isArray(data)) return data;
  return renderedDeliverableContentRoot(featureId, data) ?? null;
}

export function diffCompiledFeature(featureId, prevData, nextData) {
  const prevValue = rootValueOf(featureId, prevData);
  const nextValue = rootValueOf(featureId, nextData);
  if (Array.isArray(prevValue) || Array.isArray(nextValue)) {
    return diffItemArray(
      featureId,
      Array.isArray(prevValue) ? prevValue : [],
      Array.isArray(nextValue) ? nextValue : [],
    );
  }
  if (featureId === 'syllabus') return diffSyllabusObject(prevValue, nextValue);
  if (fingerprint(prevValue ?? null) !== fingerprint(nextValue ?? null)) {
    return [{ change: 'updated', lessonNumber: null, summary: `${FEATURE_LABELS[featureId] || featureId} updated` }];
  }
  return [];
}

/**
 * Recompile the selected compiled features against the (edited) course map
 * and diff each against current deliverable state.
 *
 * @returns {{ plan: Array<{featureId, lessonIndices, changes}>, totalChanges: number }}
 *   plan entries are executeSyncPlan-compatible; `changes` powers the
 *   approval preview. Features with zero diffs are NOT in the plan — an
 *   edit that compiles to nothing new asks for no approval.
 */
export function computeSyncBlastRadius({
  courseMap,
  deliverables,
  selectedFeatures,
  configMap = {},
  instructorPreferences = null,
  enrichmentOverlay = null,
  kernelCache = null,
}) {
  const doneFeatures = (selectedFeatures || []).filter(
    (featureId) =>
      featureId !== 'courseMap' &&
      isBlueprintCompiledFeature(featureId) &&
      deliverables?.[featureId]?.status === 'done',
  );
  const features = doneFeatures.filter((featureId) => deliverables[featureId]?.data);
  // Done features whose current data is unavailable cannot be diffed — the
  // caller must NOT read an empty plan as "unaffected" for these (it falls
  // back to the dependency map instead; unprovable ≠ unaffected).
  const undiffableFeatures = doneFeatures.filter((featureId) => !deliverables[featureId]?.data);
  if (features.length === 0 || !courseMap?.lessons?.length) {
    return { plan: [], totalChanges: 0, undiffableFeatures };
  }

  // Same enrichment tiers as compileBlueprintLessonPatch (WS-G1) — the
  // radius must diff against ENRICHED recompiles or every kernel-rendered
  // block would read as a change.
  const lessonContent = { ...(enrichmentOverlay?.lessonContent || {}) };
  if (kernelCache) {
    courseMap.lessons.forEach((lesson, idx) => {
      const lessonId = `lesson-${idx + 1}`;
      if (lessonContent[lessonId]) return;
      const cached = typeof kernelCache.get === 'function' ? kernelCache.get(lesson) : null;
      if (cached) lessonContent[lessonId] = cached;
    });
  }
  let blueprint;
  if (Object.keys(lessonContent).length > 0) {
    const graph = deriveCourseGraphFromCourseMap(courseMap);
    attachEnrichmentToGraph(graph, {
      ...(enrichmentOverlay && typeof enrichmentOverlay === 'object' ? enrichmentOverlay : {}),
      lessonContent,
    });
    blueprint = compactBlueprintForStorage(buildBlueprintFromGraph(graph, { instructorPreferences }));
  } else {
    blueprint = compactBlueprintForStorage(buildCourseBlueprint(courseMap, { instructorPreferences }));
  }
  const compiled = compileBlueprintDeliverables(blueprint, features, { configMap });

  const plan = [];
  let totalChanges = 0;
  for (const featureId of features) {
    const changes = diffCompiledFeature(featureId, deliverables[featureId].data, compiled?.[featureId]);
    if (changes.length === 0) continue;
    totalChanges += changes.length;
    const lessonNumbers = [...new Set(changes.map((change) => change.lessonNumber).filter(Boolean))];
    plan.push({
      featureId,
      // Course-level documents (syllabus) sync whole; per-lesson features
      // sync exactly the lessons whose items changed.
      lessonIndices: lessonNumbers.length > 0 ? lessonNumbers.map((n) => n - 1).sort((a, b) => a - b) : null,
      changes,
    });
  }
  return { plan, totalChanges, undiffableFeatures };
}
