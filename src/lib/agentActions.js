/**
 * agentActions.js — Action executor for the agentic teaching assistant.
 *
 * Maps structured action objects (from AI JSON responses) to existing
 * editing primitives: useCourseMapEditor, useDeliverables.optimisticUpdate, etc.
 */

import { getArrayKey } from './syncDependencies';
import { KEY_MAPS } from './keyMaps';

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

  const { type, ...params } = action;

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

function execAddLesson({ title, sections }, { editor, courseMap }) {
  if (!editor?.handleAddLesson) return { success: false, message: 'Editor not available' };
  // handleAddLesson appends a blank lesson, then we populate it
  editor.handleAddLesson();
  const newIdx = courseMap?.lessons?.length ?? 0; // index of newly added lesson
  if (title) editor.handleTitleEdit(newIdx, title);
  if (sections?.[0]) {
    const sec = sections[0];
    for (const [key, val] of Object.entries(sec)) {
      if (val) editor.handleCellEdit(newIdx, 0, key, val);
    }
  }
  return { success: true, message: `Added "${title || 'New Lesson'}"` };
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
  if (!featureId) return { success: false, message: 'Missing featureId' };

  // Validate required fields before pushing
  const normalizedItem = normalizeDeliverableItem(featureId, item);

  const reqFields = REQUIRED_FIELDS[featureId];
  if (reqFields && normalizedItem) {
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

  const entry = deliverables?.[featureId];
  if (!entry?.data) return { success: false, message: `${featureId} not generated yet` };

  // Snapshot for undo before mutating (skip during batch — caller snapshots once)
  if (snapshot && !skipSnapshot) snapshot(featureId, entry.data);

  const data = structuredClone(entry.data);
  const arrKey = getArrayKey(featureId, data);

  if (featureId === 'assignments') {
    // Flat array — push to root
    if (!data[arrKey]) data[arrKey] = [];
    data[arrKey].push(normalizedItem);
    optimisticUpdate(featureId, data);
    return { success: true, message: `Added assignment "${item.t || 'New Assignment'}"` };
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

  if (lessonIndex < 0 || lessonIndex >= arr.length) {
    return { success: false, message: `Lesson index ${lessonIndex} out of range (0-${arr.length - 1})` };
  }

  const lessonItem = arr[lessonIndex];
  const requestedSubArrayKey = subKey || SUB_ARRAY_KEYS[featureId];
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
  if (!featureId) return { success: false, message: 'Missing featureId' };

  const entry = deliverables?.[featureId];
  if (!entry?.data) return { success: false, message: `${featureId} not generated yet` };

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
  if (!featureId) return { success: false, message: 'Missing featureId' };

  // Accept both array and dot-notation string paths
  const path = parsePath(rawPath);
  if (!Array.isArray(path))
    return {
      success: false,
      message: `Invalid path — expected array or dot-notation string, got ${rawPath === null ? 'null' : typeof rawPath}`,
    };
  if (path.length < 1) return { success: false, message: 'Invalid path — array cannot be empty' };

  // Fix 11: Validate featureId exists and has data before editing
  const entry = deliverables?.[featureId];
  if (!entry) return { success: false, message: `Unknown featureId: "${featureId}" — not found in deliverables` };
  if (!entry.data)
    return { success: false, message: `${featureId} not generated yet (status: ${entry.status || 'unknown'})` };

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

function execRegenerateLesson({ featureId, lessonIndex }, { regenerateLesson, courseMap, deliverables }) {
  if (!regenerateLesson) return { success: false, message: 'Regenerate not available' };
  if (!featureId) return { success: false, message: 'Missing featureId' };
  if (lessonIndex == null || lessonIndex < 0) return { success: false, message: `Invalid lessonIndex: ${lessonIndex}` };

  // Fix 9: Validate lessonIndex is within bounds of the deliverable data
  const entry = deliverables?.[featureId];
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
  const { deliverables, courseMap } = ctx;

  // Deliverable actions require the deliverable to exist with data
  if (['addItem', 'removeItem', 'editItem', 'regenerateLesson'].includes(action.type)) {
    if (!action.featureId) return { valid: false, reason: 'Missing featureId' };
    const entry = deliverables?.[action.featureId];
    if (!entry?.data) return { valid: false, reason: `${action.featureId} not generated yet` };
  }

  // Course map actions require a course map
  if (['editCell', 'editTitle', 'addLesson', 'deleteLesson'].includes(action.type)) {
    if (!courseMap?.lessons) return { valid: false, reason: 'No course map loaded' };
  }

  // lessonIndex bounds check (skip for assignments which are flat arrays)
  if (
    action.lessonIndex !== undefined &&
    action.featureId &&
    action.featureId !== 'assignments' &&
    action.featureId !== 'syllabus'
  ) {
    const entry = deliverables?.[action.featureId];
    if (entry?.data) {
      const arrKey = getArrayKey(action.featureId, entry.data);
      const arr = entry.data[arrKey];
      if (Array.isArray(arr) && (action.lessonIndex < 0 || action.lessonIndex >= arr.length)) {
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
