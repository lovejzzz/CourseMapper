/**
 * agentActions.js — Action executor for the agentic teaching assistant.
 *
 * Maps structured action objects (from AI JSON responses) to existing
 * editing primitives: useCourseMapEditor, useDeliverables.optimisticUpdate, etc.
 */

import { getArrayKey } from './syncDependencies';
import { isInternalExportMetadataKey } from './exporters/exporterUtils';
import { KEY_MAPS } from './keyMaps';
import { deriveCourseGraphFromCourseMap } from './courseGraph/deriveFromCourseMap.js';

// ── Course map field aliases (agent shorthand → actual field key) ────────────
// The AI may use abbreviated names; resolve them to real course map field keys.
const FIELD_ALIASES = {
  lo: 'learningObjectives',
  lg: 'learningGoals',
  tp: 'topicSection',
  topic: 'topicSection',
  topics: 'topicSection',
  as: 'weeklyAssessments',
  assessments: 'weeklyAssessments',
  ac: 'asyncActivities',
  async: 'asyncActivities',
  sync: 'syncActivities',
  rs: 'supportingResources',
  resources: 'supportingResources',
  tech: 'technologyNeeded',
  pf: 'presentationFormat',
  ed: 'evaluateDesign',
  objectives: 'learningObjectives',
  goals: 'learningGoals',
};

const DEFAULT_COURSE_MAP_SECTION_FIELDS = new Set([
  'learningGoals',
  'learningObjectives',
  'topicSection',
  'weeklyAssessments',
  'asyncActivities',
  'syncActivities',
  'supportingResources',
  'technologyNeeded',
  'presentationFormat',
  'evaluateDesign',
]);

function resolveField(field, sections) {
  if (!field) return field;
  // If the field exists directly in any section, use it as-is
  if (sections?.some((sec) => field in sec)) return field;
  // Try alias mapping — resolve to canonical name, then verify it exists
  const aliased = FIELD_ALIASES[field.toLowerCase()];
  if (aliased) {
    // Verify the aliased field exists in sections (if sections available)
    if (!sections || sections.some((sec) => aliased in sec)) return aliased;
    return aliased; // trust alias even without sections
  }
  return field;
}

function normalizeCourseMapField(field, sections, columns = []) {
  if (!field || typeof field !== 'string') return field;
  const resolved = resolveField(field, sections);
  if (resolved === 'title') return resolved;

  const allowedFields = new Set(DEFAULT_COURSE_MAP_SECTION_FIELDS);
  (sections || []).forEach((section) => {
    if (section && typeof section === 'object') {
      Object.keys(section).forEach((key) => allowedFields.add(key));
    }
  });
  (columns || []).forEach((column) => {
    if (typeof column === 'string') allowedFields.add(column);
    else if (column?.key) allowedFields.add(column.key);
  });

  return allowedFields.has(resolved) ? resolved : null;
}

// ── v0.14.1 (3.6): assessment addressing ─────────────────────────────────────
// Assessments are addressable by registry id ("A7.2" = lesson 7, second map
// atom) or by registry title. ADDRESSING ONLY: a reference resolves to the
// coordinates the EXISTING edit paths already understand — the owning
// weeklyAssessments course-map cell, and the deliverable item that fulfills
// the assessment (exam → quizBank lesson entry, graded/oral → assignments
// array index). No new tools, no new mutation semantics.

const ASSESSMENT_ID_RE = /^A\d+\.\d+$/i;

function normalizeAssessmentText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Resolve "A7.2" or a registry title against the course map's assessment
 * registry (derived deterministically — the identical path the compiler and
 * package manifest consume).
 *
 * @returns {null | { assessment, courseMapTarget: { lessonIndex, sectionIndex,
 *   field: 'weeklyAssessments' }, deliverableFeatureId: 'assignments' |
 *   'quizBank' | null }}
 */
export function resolveAssessmentReference(reference, { courseMap } = {}) {
  const ref =
    typeof reference === 'string'
      ? reference
      : reference?.assessmentId || reference?.assessmentTitle || reference?.title;
  if (!ref || !courseMap?.lessons?.length) return null;

  let graph;
  try {
    graph = deriveCourseGraphFromCourseMap(courseMap);
  } catch {
    return null;
  }
  const assessments = graph?.assessments || [];
  const trimmedRef = String(ref).trim();

  let assessment = null;
  if (ASSESSMENT_ID_RE.test(trimmedRef)) {
    assessment = assessments.find((entry) => entry.id.toLowerCase() === trimmedRef.toLowerCase()) || null;
  } else {
    const probe = normalizeAssessmentText(trimmedRef);
    const exact = assessments.filter((entry) => normalizeAssessmentText(entry.title) === probe);
    if (exact.length === 1) {
      assessment = exact[0];
    } else if (exact.length === 0 && probe.length >= 4) {
      // Unambiguous containment only — a vague reference must not mutate the
      // wrong assessment.
      const loose = assessments.filter((entry) => {
        const title = normalizeAssessmentText(entry.title);
        return title.includes(probe) || probe.includes(title);
      });
      if (loose.length === 1) assessment = loose[0];
    }
  }
  if (!assessment) return null;

  const lessonIndex = assessment.dueSession - 1;
  const sections = graph.sessions?.[lessonIndex]?.sections || [];
  let sectionIndex = sections.findIndex((section) => (section.assessmentRefs || []).includes(assessment.id));
  if (sectionIndex < 0) sectionIndex = 0;

  return {
    assessment,
    courseMapTarget: { lessonIndex, sectionIndex, field: 'weeklyAssessments' },
    deliverableFeatureId:
      assessment.kind === 'exam' ? 'quizBank' : assessment.kind === 'in-class' ? null : 'assignments',
  };
}

/** Locate the deliverable item a resolved assessment maps to. */
function findAssessmentDeliverableIndex(resolved, deliverables) {
  const featureId = resolved.deliverableFeatureId;
  const data = featureId ? deliverables?.[featureId]?.data : null;
  if (!data) return null;
  const arrKey = getArrayKey(featureId, data);
  const arr = data?.[arrKey];
  if (!Array.isArray(arr)) return null;

  const probe = normalizeAssessmentText(resolved.assessment.title);
  // 1) Phase 3a reverse stamps: compiled items carry the registry id.
  let index = arr.findIndex(
    (item) => String(item?.assessmentId || '').toLowerCase() === resolved.assessment.id.toLowerCase(),
  );
  // 2) Exact title match (assignments title their items with the registry title).
  if (index < 0) {
    index = arr.findIndex(
      (item) => normalizeAssessmentText(firstValue(item, ['title', 't', 'lessonTitle', 'lt'])) === probe,
    );
  }
  // 3) Lesson-number match for per-lesson arrays (quizBank).
  if (index < 0) {
    index = arr.findIndex((item) => {
      const itemLesson = Number.isInteger(item?.lessonNumber)
        ? item.lessonNumber
        : Number(
            String(firstValue(item, ['lessonTitle', 'lt', 'dueWeek', 'title', 't']) || '').match(
              /(?:Lesson|Week)\s*(\d+)/i,
            )?.[1],
          );
      return itemLesson === resolved.assessment.dueSession;
    });
  }
  // 4) quizBank arrays are lesson-ordered — fall back to positional.
  if (index < 0 && featureId === 'quizBank' && resolved.assessment.dueSession - 1 < arr.length) {
    index = resolved.assessment.dueSession - 1;
  }
  return { featureId, arrKey, index: index >= 0 ? index : null };
}

/**
 * Fill an action's coordinates from its assessment reference (assessmentId or
 * assessmentTitle). Explicit coordinates always win — only missing fields are
 * resolved. Returns the action unchanged when nothing resolves.
 */
export function applyAssessmentAddressing(action, ctx = {}) {
  if (!action || typeof action !== 'object') return action;
  const reference = action.assessmentId ?? action.assessmentTitle ?? action.assessmentRef;
  if (!reference) return action;
  const resolved = resolveAssessmentReference(reference, ctx);
  if (!resolved) return action;
  const next = { ...action };

  // Course-map actions target the owning weeklyAssessments cell.
  if (next.type === 'editCell') {
    if (next.lessonIndex == null) next.lessonIndex = resolved.courseMapTarget.lessonIndex;
    if (next.sectionIndex == null) next.sectionIndex = resolved.courseMapTarget.sectionIndex;
    if (!next.field) next.field = resolved.courseMapTarget.field;
    return next;
  }

  // Deliverable actions target the fulfilling item.
  if (!next.featureId || next.featureId === 'assessments') {
    if (resolved.deliverableFeatureId) next.featureId = resolved.deliverableFeatureId;
  }
  const located = findAssessmentDeliverableIndex(resolved, ctx.deliverables);
  if (located && located.featureId === next.featureId && Number.isInteger(located.index)) {
    if (next.featureId === 'assignments') {
      // Flat array: the executor addresses assignments by itemIndex
      // (removeItem) and by lessonIndex-as-array-position (replaceItem).
      if (next.itemIndex == null) next.itemIndex = located.index;
      if (next.lessonIndex == null) next.lessonIndex = located.index;
    } else if (next.lessonIndex == null) {
      next.lessonIndex = located.index;
    }
    if (next.type === 'editItem' && !next.path && typeof next.field === 'string' && next.field) {
      next.path = [located.arrKey, located.index, next.field];
    }
  }
  return next;
}

// ── Action Types ─────────────────────────────────────────────────────────────

export const ACTION_TYPES = {
  // Course map
  editCell: 'editCell',
  editTitle: 'editTitle',
  addLesson: 'addLesson',
  deleteLesson: 'deleteLesson',
  // Deliverables
  addItem: 'addItem',
  removeItem: 'removeItem',
  editItem: 'editItem',
  replaceItem: 'replaceItem',
  regenerateLesson: 'regenerateLesson',
};

// ── Dedup: field to check for exact duplicates when adding items ─────────────
const DEDUP_FIELDS = {
  quizBank: ['q', 'question'], // question text
  discussions: ['pr', 'prompt'], // prompt text
  courseFaq: ['q', 'question'], // FAQ question
  rubrics: ['cn', 'criterion'], // criterion name
  slideDecks: ['t', 'title'], // slide title
};

const DEDUP_LABELS = {
  quizBank: 'question',
  courseFaq: 'question',
  rubrics: 'text',
  slideDecks: 'text',
  discussions: 'text',
};

// ── Per-deliverable sub-array keys ───────────────────────────────────────────
// Maps featureId → the key within each per-lesson item that holds the sub-array
// where new items are inserted. null = item IS the per-lesson entry (replace/push to root array).
const SUB_ARRAY_KEYS = {
  quizBank: 'qs',
  slideDecks: 'sl',
  courseFaq: 'qs',
  rubrics: 'cr',
  studyGuides: null, // complex — handled per-subfield (kt, rq, cm)
  lessonPlans: null, // complex — handled per-subfield (ol, hw, etc.)
  discussions: null, // one per lesson — replace entire item
  assignments: null, // flat array — push to root
  syllabus: null, // single object — not per-lesson
};

function inferAddItemSubArrayKey(featureId, item, requestedSubKey) {
  if (requestedSubKey) return requestedSubKey;
  if (featureId === 'lessonPlans') {
    const outlineKeys = ['time', 'tm', 'activity', 'ac', 'description', 'de', 'instruction', 'in'];
    if (outlineKeys.some((key) => item?.[key] !== undefined)) return 'outline';
  }
  return SUB_ARRAY_KEYS[featureId];
}

// ── Execute Action ───────────────────────────────────────────────────────────

/**
 * Execute a structured action against the course map or deliverables.
 *
 * @param {object} action - { type, ...params } action object from AI
 * @param {object} ctx - execution context (hooks/state)
 * @returns {{ success: boolean, message: string }}
 */
export function executeAction(action, ctx) {
  if (!action?.type) return { success: false, message: 'Invalid action: missing type' };

  // v0.14.1 (3.6): resolve assessment references ("A7.2" / registry title)
  // into the coordinates the executors below already understand.
  const { type, ...params } = applyAssessmentAddressing(action, ctx);

  try {
    switch (type) {
      case ACTION_TYPES.editCell:
        return execEditCell(params, ctx);
      case ACTION_TYPES.editTitle:
        return execEditTitle(params, ctx);
      case ACTION_TYPES.addLesson:
        return execAddLesson(params, ctx);
      case ACTION_TYPES.deleteLesson:
        return execDeleteLesson(params, ctx);
      case ACTION_TYPES.addItem:
        return execAddItem(params, ctx);
      case ACTION_TYPES.removeItem:
        return execRemoveItem(params, ctx);
      case ACTION_TYPES.editItem:
        return execEditItem(params, ctx);
      case ACTION_TYPES.replaceItem:
        return execReplaceItem(params, ctx);
      case ACTION_TYPES.regenerateLesson:
        return execRegenerateLesson(params, ctx);
      default:
        return { success: false, message: `Unknown action type: ${type}` };
    }
  } catch (err) {
    return { success: false, message: `Action failed: ${err.message}` };
  }
}

// ── Course Map Actions ───────────────────────────────────────────────────────

function execEditCell({ lessonIndex, sectionIndex, field, value }, { editor, courseMap }) {
  if (!editor?.handleCellEdit) return { success: false, message: 'Editor not available' };
  if (lessonIndex == null || lessonIndex < 0) return { success: false, message: `Invalid lessonIndex: ${lessonIndex}` };
  if (!field) return { success: false, message: 'Missing field name' };
  // Resolve abbreviated field names to actual course map keys
  const sections = courseMap?.lessons?.[lessonIndex]?.sections;
  const si = sectionIndex ?? 0;
  if (sections && (si < 0 || si >= sections.length)) {
    return { success: false, message: `sectionIndex ${si} out of range (0-${sections.length - 1})` };
  }
  const resolvedField = resolveField(field, sections);
  editor.handleCellEdit(lessonIndex, si, resolvedField, value);
  return { success: true, message: `Updated ${resolvedField} in Lesson ${lessonIndex + 1}` };
}

function execEditTitle({ lessonIndex, newTitle }, { editor }) {
  if (!editor?.handleTitleEdit) return { success: false, message: 'Editor not available' };
  if (lessonIndex == null || lessonIndex < 0) return { success: false, message: `Invalid lessonIndex: ${lessonIndex}` };
  if (!newTitle) return { success: false, message: 'Missing newTitle' };
  editor.handleTitleEdit(lessonIndex, newTitle);
  return { success: true, message: `Renamed Lesson ${lessonIndex + 1}` };
}

function execAddLesson({ title, sections, lesson, lessonIndex }, { editor, courseMap }) {
  if (!editor?.handleAddLesson) return { success: false, message: 'Editor not available' };
  const nextTitle = title || lesson?.title || '';
  const nextSections = sections || lesson?.sections;
  const insertedIndex = editor.handleAddLesson({
    title: nextTitle,
    sections: nextSections,
    lesson,
    lessonIndex,
  });
  if (Number.isInteger(insertedIndex)) {
    return { success: true, message: `Added "${nextTitle || `Lesson ${insertedIndex + 1}: New Lesson`}"` };
  }

  // Legacy editor fallback: append a blank lesson, then populate it.
  const newIdx = Number.isInteger(lessonIndex) ? lessonIndex : (courseMap?.lessons?.length ?? 0);
  if (nextTitle) editor.handleTitleEdit(newIdx, nextTitle);
  if (nextSections?.[0]) {
    const sec = nextSections[0];
    for (const [key, val] of Object.entries(sec)) {
      if (val) editor.handleCellEdit(newIdx, 0, key, val);
    }
  }
  return { success: true, message: `Added "${nextTitle || 'New Lesson'}"` };
}

function execDeleteLesson({ lessonIndex }, { editor, courseMap }) {
  if (!editor?.handleDeleteLesson) return { success: false, message: 'Editor not available' };
  if ((courseMap?.lessons?.length ?? 0) <= 1) {
    return { success: false, message: 'Cannot delete the only lesson' };
  }
  editor.handleDeleteLesson(lessonIndex);
  return { success: true, message: `Deleted Lesson ${lessonIndex + 1}` };
}

// ── Deliverable Actions ──────────────────────────────────────────────────────

// ── Required-field validation for addItem ─────────────────────────────────
const REQUIRED_FIELDS = {
  assignments: { t: 'title' },
  quizBank: { q: 'question', question: 'question' },
  slideDecks: { t: 'title', title: 'title' },
};

// ── Default field values for common deliverable items ───────────────────
const DEFAULT_FIELDS = {
  quizBank: { bl: 'Remember', df: 'medium', pt: 1 },
};

function firstValue(obj, keys) {
  for (const key of keys) {
    if (obj?.[key] !== undefined) return obj[key];
  }
  return undefined;
}

function hasAnyField(obj, keys) {
  return keys.some((key) => obj?.[key] !== undefined && obj[key] !== '');
}

function getDedupeText(obj, keys) {
  const value = firstValue(obj, Array.isArray(keys) ? keys : [keys]);
  return String(value || '')
    .toLowerCase()
    .trim();
}

function normalizeSlideVisual(visual) {
  if (!visual || typeof visual !== 'object') return visual;
  const next = { ...visual };
  if (next.kind === undefined && next.k !== undefined) next.kind = next.k;
  if (next.description === undefined && next.d !== undefined) next.description = next.d;
  if (next.altText === undefined && next.at !== undefined) next.altText = next.at;
  for (const key of ['k', 'd', 'at']) delete next[key];
  return next;
}

function normalizeDeliverableItem(featureId, item) {
  if (!item || typeof item !== 'object') return item;

  if (featureId === 'slideDecks') {
    const next = { ...item };
    if (next.title === undefined && next.t !== undefined) next.title = next.t;
    if (next.type === undefined && next.ty !== undefined) next.type = next.ty;
    if (next.bullets === undefined && next.bu !== undefined) next.bullets = next.bu;
    if (next.notes === undefined && next.no !== undefined) next.notes = next.no;
    if (next.activityType === undefined && next.at !== undefined) next.activityType = next.at;
    if (next.timer === undefined && next.ti !== undefined) next.timer = next.ti;
    if (next.bloomsLevel === undefined && next.bl !== undefined) next.bloomsLevel = next.bl;
    if (next.objectiveLink === undefined && next.ol !== undefined) next.objectiveLink = next.ol;
    if (next.visual === undefined && next.vi !== undefined) next.visual = normalizeSlideVisual(next.vi);
    else if (next.visual !== undefined) next.visual = normalizeSlideVisual(next.visual);
    for (const key of ['t', 'ty', 'bu', 'no', 'at', 'ti', 'bl', 'ol', 'vi']) delete next[key];
    return next;
  }

  return item;
}

function getReadyDeliverableEntry(featureId, deliverables) {
  if (!featureId) return { error: 'Missing featureId' };
  const entry = deliverables?.[featureId];
  if (!entry) return { error: `Unknown featureId: "${featureId}" — not generated yet` };
  if (entry.status && entry.status !== 'done') {
    return { error: `${featureId} not generated yet (status: ${entry.status})` };
  }
  if (!entry.data) return { error: `${featureId} not generated yet` };
  return { entry };
}

function isVisualObject(obj) {
  return (
    !!obj &&
    typeof obj === 'object' &&
    ('k' in obj || 'd' in obj || 'at' in obj || 'kind' in obj || 'description' in obj || 'altText' in obj)
  );
}

function resolveSegment(featureId, container, seg, { final = false } = {}) {
  if (typeof seg !== 'string') return seg;
  if (container && typeof container === 'object' && seg in container) return seg;
  if (isVisualObject(container)) {
    const visualMap = { k: 'kind', d: 'description', at: 'altText' };
    const visualKey = visualMap[seg];
    if (visualKey && (!container || typeof container !== 'object' || visualKey in container || final)) {
      return visualKey;
    }
    return seg;
  }

  const mapped = KEY_MAPS[featureId]?.[seg];
  if (mapped && (!container || typeof container !== 'object' || mapped in container || final)) {
    return mapped;
  }
  return seg;
}

function execAddItem({ featureId, lessonIndex, item, subKey }, ctx) {
  const { deliverables, optimisticUpdate, snapshot, skipSnapshot } = ctx;
  if (!optimisticUpdate) return { success: false, message: 'Optimistic update not available' };
  const readyEntry = getReadyDeliverableEntry(featureId, deliverables);
  if (readyEntry.error) return { success: false, message: readyEntry.error };

  // Validate required fields before pushing
  const normalizedItem = normalizeDeliverableItem(featureId, item);
  if (!normalizedItem || typeof normalizedItem !== 'object') {
    return { success: false, message: `Invalid item for ${featureId} — expected an object` };
  }

  const reqFields = REQUIRED_FIELDS[featureId];
  if (reqFields) {
    const groups = {};
    for (const [key, label] of Object.entries(reqFields)) {
      (groups[label] ||= []).push(key);
    }
    for (const [label, keys] of Object.entries(groups)) {
      if (!hasAnyField(normalizedItem, keys)) {
        return { success: false, message: `Missing required field (${label}) for ${featureId}` };
      }
    }
  }

  // Merge sensible defaults for common optional fields
  const defaults = DEFAULT_FIELDS[featureId];
  if (defaults && normalizedItem) {
    for (const [key, val] of Object.entries(defaults)) {
      if (normalizedItem[key] === undefined) normalizedItem[key] = val;
    }
  }

  const entry = readyEntry.entry;

  // Snapshot for undo before mutating (skip during batch — caller snapshots once)
  if (snapshot && !skipSnapshot) snapshot(featureId, entry.data);

  const data = structuredClone(entry.data);
  const arrKey = getArrayKey(featureId, data);

  if (featureId === 'assignments') {
    // Flat array — push to root
    if (!arrKey) return { success: false, message: `No array found for ${featureId}` };
    if (!Array.isArray(data[arrKey])) return { success: false, message: `No array found for ${featureId}` };
    data[arrKey].push(normalizedItem);
    optimisticUpdate(featureId, data);
    return { success: true, message: `Added assignment "${normalizedItem.t || 'New Assignment'}"` };
  }

  if (featureId === 'syllabus') {
    // Single object — merge fields
    if (normalizedItem && typeof normalizedItem === 'object') {
      Object.assign(data.syllabus || data, normalizedItem);
    }
    optimisticUpdate(featureId, data);
    return { success: true, message: 'Updated syllabus' };
  }

  // Per-lesson deliverables
  const arr = data[arrKey];
  if (!Array.isArray(arr)) return { success: false, message: `No array found for ${featureId}` };

  const requestedSubArrayKey = inferAddItemSubArrayKey(featureId, normalizedItem, subKey);
  if (!Number.isInteger(lessonIndex)) {
    return { success: false, message: `Invalid lessonIndex: ${lessonIndex} — expected a number` };
  }
  if (lessonIndex < 0 || lessonIndex >= arr.length) {
    return { success: false, message: `Lesson index ${lessonIndex} out of range (0-${arr.length - 1})` };
  }

  const lessonItem = arr[lessonIndex];
  const subArrayKey = resolveSegment(featureId, lessonItem, requestedSubArrayKey, { final: true });

  if (subArrayKey && lessonItem[subArrayKey]) {
    // Exact-match dedup check before pushing
    const dupField = DEDUP_FIELDS[featureId];
    if (dupField && getDedupeText(normalizedItem, dupField)) {
      const newText = getDedupeText(normalizedItem, dupField);
      const isDupe = lessonItem[subArrayKey].some((existing) => getDedupeText(existing, dupField) === newText);
      if (isDupe) {
        return {
          success: false,
          message: `Duplicate detected: an item with the same ${DEDUP_LABELS[featureId] || 'text'} already exists in this lesson.`,
        };
      }
    }
    // Has sub-array (quizBank.qs, slideDecks.sl, etc.) — push into it
    lessonItem[subArrayKey].push(normalizedItem);
    // Update counts if they exist
    if ('tq' in lessonItem) lessonItem.tq = lessonItem[subArrayKey].length;
    if ('ts' in lessonItem) lessonItem.ts = lessonItem[subArrayKey].length;
  } else if (requestedSubArrayKey && !lessonItem[subArrayKey]) {
    // Sub-array doesn't exist yet — create it
    lessonItem[subArrayKey] = [normalizedItem];
  } else {
    // No sub-array — this is a per-lesson item type (discussions, etc.)
    // Fix 10: Gracefully handle flat deliverables — merge/replace the lesson entry
    if (!normalizedItem || typeof normalizedItem !== 'object') {
      return {
        success: false,
        message: `Invalid item for ${featureId} — expected an object to merge into the lesson entry`,
      };
    }
    arr[lessonIndex] = { ...lessonItem, ...normalizedItem };
  }

  optimisticUpdate(featureId, data);
  const itemName =
    normalizedItem.title ||
    normalizedItem.t ||
    normalizedItem.question ||
    normalizedItem.q ||
    normalizedItem.tm ||
    normalizedItem.cn ||
    '';
  return { success: true, message: `Added item${itemName ? ` "${itemName}"` : ''} to ${featureId}` };
}

function execRemoveItem({ featureId, lessonIndex, itemIndex, subKey }, ctx) {
  const { deliverables, optimisticUpdate, snapshot, skipSnapshot } = ctx;
  if (!optimisticUpdate) return { success: false, message: 'Optimistic update not available' };
  const readyEntry = getReadyDeliverableEntry(featureId, deliverables);
  if (readyEntry.error) return { success: false, message: readyEntry.error };
  const entry = readyEntry.entry;

  // Fix 12: Validate itemIndex is a valid number before splicing
  if (itemIndex == null || typeof itemIndex !== 'number') {
    return { success: false, message: `Invalid itemIndex: ${itemIndex} — expected a number` };
  }

  // Snapshot for undo before mutating (skip during batch — caller snapshots once)
  if (snapshot && !skipSnapshot) snapshot(featureId, entry.data);

  const data = structuredClone(entry.data);
  const arrKey = getArrayKey(featureId, data);

  if (featureId === 'assignments') {
    // Flat array — remove by index
    if (!data[arrKey] || itemIndex < 0 || itemIndex >= data[arrKey].length) {
      return { success: false, message: `Item index ${itemIndex} out of range (0-${(data[arrKey]?.length ?? 1) - 1})` };
    }
    const removed = data[arrKey].splice(itemIndex, 1)[0];
    optimisticUpdate(featureId, data);
    return { success: true, message: `Removed "${removed?.t || 'item'}" from assignments` };
  }

  // Per-lesson deliverables
  const arr = data[arrKey];
  if (!Number.isInteger(lessonIndex)) {
    return { success: false, message: `Invalid lessonIndex: ${lessonIndex} — expected a number` };
  }
  if (!Array.isArray(arr) || lessonIndex < 0 || lessonIndex >= arr.length) {
    return {
      success: false,
      message: `Lesson index ${lessonIndex} out of range (0-${Array.isArray(arr) ? arr.length - 1 : '?'})`,
    };
  }

  const lessonItem = arr[lessonIndex];
  const requestedSubArrayKey = subKey || SUB_ARRAY_KEYS[featureId];
  const subArrayKey = resolveSegment(featureId, lessonItem, requestedSubArrayKey, { final: true });

  if (subArrayKey && Array.isArray(lessonItem[subArrayKey])) {
    if (itemIndex < 0 || itemIndex >= lessonItem[subArrayKey].length) {
      return { success: false, message: 'Item index out of range' };
    }
    const removed = lessonItem[subArrayKey].splice(itemIndex, 1)[0];
    if ('tq' in lessonItem) lessonItem.tq = lessonItem[subArrayKey].length;
    if ('ts' in lessonItem) lessonItem.ts = lessonItem[subArrayKey].length;
    optimisticUpdate(featureId, data);
    return { success: true, message: `Removed item from ${featureId}` };
  }

  return { success: false, message: `Cannot remove from ${featureId} — no sub-array` };
}

/**
 * Parse a dot-notation string path into an array of segments.
 * E.g. "quizzes.0.qs.1.q" → ["quizzes", 0, "qs", 1, "q"]
 * Numeric segments are converted to numbers for correct array indexing.
 */
export function parsePath(pathInput) {
  if (Array.isArray(pathInput)) return pathInput;
  if (typeof pathInput !== 'string' || !pathInput) return null;
  return pathInput.split('.').map((seg) => (/^\d+$/.test(seg) ? Number(seg) : seg));
}

function execEditItem({ featureId, path: rawPath, value }, ctx) {
  const { deliverables, optimisticUpdate, snapshot, skipSnapshot } = ctx;
  if (!optimisticUpdate) return { success: false, message: 'Optimistic update not available' };
  const readyEntry = getReadyDeliverableEntry(featureId, deliverables);
  if (readyEntry.error) return { success: false, message: readyEntry.error };

  // Accept both array and dot-notation string paths
  const path = parsePath(rawPath);
  if (!Array.isArray(path))
    return {
      success: false,
      message: `Invalid path — expected array or dot-notation string, got ${rawPath === null ? 'null' : typeof rawPath}`,
    };
  if (path.length < 1) return { success: false, message: 'Invalid path — array cannot be empty' };

  // Fix 11: Validate featureId exists and has data before editing
  const entry = readyEntry.entry;

  // Snapshot for undo before mutating (skip during batch — caller snapshots once)
  if (snapshot && !skipSnapshot) snapshot(featureId, entry.data);

  const data = structuredClone(entry.data);

  // Resolve the first path segment: the agent may send "slideDecks" but data uses "decks"
  // Use getArrayKey to find the actual root array key and substitute if needed
  const resolvedPath = [...path];
  if (resolvedPath.length >= 1 && typeof resolvedPath[0] === 'string' && data[resolvedPath[0]] == null) {
    const actualKey = getArrayKey(featureId, data);
    if (actualKey && data[actualKey] != null) {
      resolvedPath[0] = actualKey;
    } else {
      return {
        success: false,
        message: `Invalid path — "${resolvedPath[0]}" not found in ${featureId} data. Available keys: ${Object.keys(data).join(', ')}`,
      };
    }
  }

  // Walk the path and set the value (with array bounds checking). Resolve
  // abbreviated agent paths ("sl", "no") against expanded app data ("slides", "notes").
  let target = data;
  for (let i = 0; i < resolvedPath.length - 1; i++) {
    const seg = resolveSegment(featureId, target, resolvedPath[i]);
    resolvedPath[i] = seg;
    // Bounds check for array indices
    if (Array.isArray(target) && typeof seg === 'number') {
      if (seg < 0 || seg >= target.length) {
        return { success: false, message: `Index ${seg} out of range at path[${i}] (array length ${target.length})` };
      }
    }
    target = target[seg];
    if (target == null) return { success: false, message: `Invalid path — nothing at "${seg}" (path[${i}])` };
  }
  const finalKey = resolveSegment(featureId, target, resolvedPath[resolvedPath.length - 1], { final: true });
  if (target == null || typeof target !== 'object')
    return { success: false, message: `Invalid path — cannot set property on ${typeof target}` };
  target[finalKey] = value;

  optimisticUpdate(featureId, data);
  return { success: true, message: `Updated ${featureId}` };
}

/**
 * Author-grade replacement (v0.9.1): swap a whole item's instructor-facing
 * content while preserving the old item's internal compiler records
 * (grounding, traces, receipts) so trust evidence survives rewrites.
 * lessonIndex targets the lesson item; itemIndex (optional) targets a
 * sub-item (a question, slide, criterion) inside it.
 */
function execReplaceItem({ featureId, lessonIndex, itemIndex, item, subKey }, ctx) {
  const { deliverables, optimisticUpdate, snapshot, skipSnapshot } = ctx;
  if (!optimisticUpdate) return { success: false, message: 'Optimistic update not available' };
  if (!item || typeof item !== 'object') return { success: false, message: 'Missing replacement item' };
  const readyEntry = getReadyDeliverableEntry(featureId, deliverables);
  if (readyEntry.error) return { success: false, message: readyEntry.error };
  const entry = readyEntry.entry;

  if (snapshot && !skipSnapshot) snapshot(featureId, entry.data);
  const data = structuredClone(entry.data);
  const arrKey = getArrayKey(featureId, data);
  const arr = data[arrKey];
  if (!Array.isArray(arr)) return { success: false, message: `No item array found for ${featureId}` };
  if (!Number.isInteger(lessonIndex) || lessonIndex < 0 || lessonIndex >= arr.length) {
    return { success: false, message: `lessonIndex ${lessonIndex} out of range (0-${arr.length - 1})` };
  }

  const normalized = normalizeDeliverableItem(featureId, item);
  const mergeReplace = (oldItem, nextItem) => {
    if (!oldItem || typeof oldItem !== 'object') return nextItem;
    const preserved = {};
    for (const [key, value] of Object.entries(oldItem)) {
      if (isInternalExportMetadataKey(key)) preserved[key] = value;
    }
    return { ...nextItem, ...preserved };
  };

  if (Number.isInteger(itemIndex)) {
    const lessonItem = arr[lessonIndex];
    const requestedSubArrayKey = subKey || SUB_ARRAY_KEYS[featureId];
    const subArrayKey = resolveSegment(featureId, lessonItem, requestedSubArrayKey, { final: true });
    const subArr = subArrayKey ? lessonItem?.[subArrayKey] : null;
    if (!Array.isArray(subArr)) return { success: false, message: `No sub-array to replace in for ${featureId}` };
    if (itemIndex < 0 || itemIndex >= subArr.length) {
      return { success: false, message: `itemIndex ${itemIndex} out of range (0-${subArr.length - 1})` };
    }
    subArr[itemIndex] = mergeReplace(subArr[itemIndex], normalized);
    optimisticUpdate(featureId, data);
    return { success: true, message: `Replaced item ${itemIndex + 1} in ${featureId} lesson ${lessonIndex + 1}` };
  }

  arr[lessonIndex] = mergeReplace(arr[lessonIndex], normalized);
  optimisticUpdate(featureId, data);
  return { success: true, message: `Replaced ${featureId} item for lesson ${lessonIndex + 1}` };
}

function execRegenerateLesson({ featureId, lessonIndex }, { regenerateLesson, courseMap, deliverables }) {
  if (!regenerateLesson) return { success: false, message: 'Regenerate not available' };
  const readyEntry = getReadyDeliverableEntry(featureId, deliverables);
  if (readyEntry.error) return { success: false, message: readyEntry.error };
  if (!Number.isInteger(lessonIndex) || lessonIndex < 0)
    return { success: false, message: `Invalid lessonIndex: ${lessonIndex}` };

  // Fix 9: Validate lessonIndex is within bounds of the deliverable data
  const entry = readyEntry.entry;
  if (entry?.data) {
    const arrKey = getArrayKey(featureId, entry.data);
    const arr = entry.data[arrKey];
    if (Array.isArray(arr) && lessonIndex >= arr.length) {
      return {
        success: false,
        message: `lessonIndex ${lessonIndex} out of range (0-${arr.length - 1}) for ${featureId}`,
      };
    }
  }

  regenerateLesson(featureId, courseMap, lessonIndex);
  return {
    success: true,
    pending: true,
    message: `Regeneration started for ${featureId} Lesson ${lessonIndex + 1}; the preview will update when generation finishes.`,
  };
}

// ── Pre-validation (read-only check before execution) ───────────────────────

/**
 * Pre-validate an action without executing it.
 * Mirrors the checks in execAddItem/execRemoveItem/execEditItem but is read-only.
 *
 * @param {object} action - The action to validate
 * @param {object} ctx - { deliverables, courseMap }
 * @returns {{ valid: boolean, reason?: string }}
 */
export function preValidateAction(action, ctx) {
  if (!action?.type) return { valid: false, reason: 'Missing action type' };
  // v0.14.1 (3.6): validate the same resolved coordinates executeAction runs.
  action = applyAssessmentAddressing(action, ctx);
  const { deliverables, courseMap } = ctx;

  // Deliverable actions require the deliverable to exist with data
  if (['addItem', 'removeItem', 'editItem', 'replaceItem', 'regenerateLesson'].includes(action.type)) {
    const readyEntry = getReadyDeliverableEntry(action.featureId, deliverables);
    if (readyEntry.error) return { valid: false, reason: readyEntry.error };
  }

  // Course map actions require a course map
  if (['editCell', 'editTitle', 'addLesson', 'deleteLesson'].includes(action.type)) {
    if (!courseMap?.lessons) return { valid: false, reason: 'No course map loaded' };
  }

  // lessonIndex bounds check (skip for assignments which are flat arrays)
  if (action.featureId && action.featureId !== 'assignments' && action.featureId !== 'syllabus') {
    const entry = deliverables?.[action.featureId];
    if (entry?.data) {
      const arrKey = getArrayKey(action.featureId, entry.data);
      const arr = entry.data[arrKey];
      if (Array.isArray(arr) && action.lessonIndex !== undefined && !Number.isInteger(action.lessonIndex)) {
        return { valid: false, reason: `Invalid lessonIndex: ${action.lessonIndex} — expected a number` };
      }
      if (
        Array.isArray(arr) &&
        action.lessonIndex === undefined &&
        ['addItem', 'removeItem', 'replaceItem', 'regenerateLesson'].includes(action.type)
      ) {
        return { valid: false, reason: 'Missing lessonIndex' };
      }
      if (
        Array.isArray(arr) &&
        action.lessonIndex !== undefined &&
        (action.lessonIndex < 0 || action.lessonIndex >= arr.length)
      ) {
        return { valid: false, reason: `lessonIndex ${action.lessonIndex} out of range (0-${arr.length - 1})` };
      }
    }
  }

  // Course map lessonIndex bounds check
  if (action.lessonIndex !== undefined && ['editCell', 'editTitle', 'deleteLesson'].includes(action.type)) {
    const lessons = courseMap?.lessons || [];
    if (action.lessonIndex < 0 || action.lessonIndex >= lessons.length) {
      return { valid: false, reason: `lessonIndex ${action.lessonIndex} out of range (0-${lessons.length - 1})` };
    }
  }

  // Cannot delete the only lesson
  if (action.type === 'deleteLesson' && (courseMap?.lessons?.length ?? 0) <= 1) {
    return { valid: false, reason: 'Cannot delete the only lesson' };
  }

  // replaceItem requires a replacement payload
  if (action.type === 'replaceItem' && (!action.item || typeof action.item !== 'object')) {
    return { valid: false, reason: 'replaceItem requires an item object with the full replacement content' };
  }

  // Duplicate detection for addItem
  if (action.type === 'addItem' && action.item && action.featureId) {
    const dupField = DEDUP_FIELDS[action.featureId];
    const normalizedItem = normalizeDeliverableItem(action.featureId, action.item);
    if (dupField && getDedupeText(normalizedItem, dupField)) {
      const entry = deliverables?.[action.featureId];
      if (entry?.data) {
        const arrKey = getArrayKey(action.featureId, entry.data);
        const arr = entry.data[arrKey];
        if (Array.isArray(arr) && action.lessonIndex !== undefined && arr[action.lessonIndex]) {
          const lessonItem = arr[action.lessonIndex];
          const subArrayKey = resolveSegment(action.featureId, lessonItem, SUB_ARRAY_KEYS[action.featureId], {
            final: true,
          });
          if (subArrayKey && Array.isArray(lessonItem[subArrayKey])) {
            const newText = getDedupeText(normalizedItem, dupField);
            const isDupe = lessonItem[subArrayKey].some((existing) => getDedupeText(existing, dupField) === newText);
            if (isDupe) {
              return {
                valid: false,
                reason: `Duplicate: item with same ${DEDUP_LABELS[action.featureId] || 'text'} already exists`,
              };
            }
          }
        }
      }
    }
  }

  return { valid: true };
}

export function preValidateCourseMapPatch(patch, ctx = {}) {
  if (!patch || typeof patch !== 'object') return { valid: false, reason: 'Patch must be an object' };
  const courseMap = ctx.courseMap;
  const lessons = courseMap?.lessons;
  if (!Array.isArray(lessons)) return { valid: false, reason: 'No course map loaded' };

  if (patch.action === 'addLesson') {
    const title = patch.title || patch.lesson?.title || '';
    const sections = patch.sections || patch.lesson?.sections;
    if (!String(title).trim()) return { valid: false, reason: 'addLesson requires a non-empty title' };
    if (patch.lessonIndex !== undefined) {
      if (!Number.isInteger(patch.lessonIndex)) {
        return { valid: false, reason: `Invalid lessonIndex: ${patch.lessonIndex} — expected a number` };
      }
      if (patch.lessonIndex < 0 || patch.lessonIndex > lessons.length) {
        return { valid: false, reason: `lessonIndex ${patch.lessonIndex} out of range (0-${lessons.length})` };
      }
    }
    if (
      sections !== undefined &&
      (!Array.isArray(sections) || sections.some((section) => typeof section !== 'object'))
    ) {
      return { valid: false, reason: 'addLesson sections must be an array of objects' };
    }
    const duplicate = lessons.some(
      (lesson) =>
        String(lesson?.title || '')
          .trim()
          .toLowerCase() === title.trim().toLowerCase(),
    );
    if (duplicate) return { valid: false, reason: `Lesson "${title.trim()}" already exists` };
    return { valid: true };
  }

  if (patch.action === 'removeLesson') {
    const action = { type: 'deleteLesson', lessonIndex: patch.lessonIndex };
    return preValidateAction(action, { courseMap });
  }

  if (patch.action && patch.action !== 'addLesson' && patch.action !== 'removeLesson') {
    return { valid: false, reason: `Unknown course-map patch action: ${patch.action}` };
  }

  if (!Number.isInteger(patch.lessonIndex)) {
    return { valid: false, reason: `Invalid lessonIndex: ${patch.lessonIndex} — expected a number` };
  }
  if (patch.lessonIndex < 0 || patch.lessonIndex >= lessons.length) {
    return { valid: false, reason: `lessonIndex ${patch.lessonIndex} out of range (0-${lessons.length - 1})` };
  }
  if (!patch.field || typeof patch.field !== 'string')
    return { valid: false, reason: 'Course-map patch requires field' };
  if (patch.value === undefined) return { valid: false, reason: `Course-map patch for ${patch.field} requires value` };

  if (patch.field === 'title') {
    if (!String(patch.value).trim()) return { valid: false, reason: 'Lesson title cannot be blank' };
    return { valid: true };
  }

  const sections = lessons[patch.lessonIndex]?.sections || [];
  const sectionIndex = patch.sectionIndex ?? 0;
  if (!Number.isInteger(sectionIndex)) {
    return { valid: false, reason: `Invalid sectionIndex: ${patch.sectionIndex} — expected a number` };
  }
  if (sectionIndex < 0 || sectionIndex >= sections.length) {
    return { valid: false, reason: `sectionIndex ${sectionIndex} out of range (0-${sections.length - 1})` };
  }

  const resolvedField = normalizeCourseMapField(patch.field, sections, ctx.columns);
  if (!resolvedField) return { valid: false, reason: `Unknown course-map field: ${patch.field}` };
  return { valid: true, field: resolvedField };
}
