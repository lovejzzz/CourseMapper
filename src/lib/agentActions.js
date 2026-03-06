/**
 * agentActions.js — Action executor for the agentic teaching assistant.
 *
 * Maps structured action objects (from AI JSON responses) to existing
 * editing primitives: useCourseMapEditor, useDeliverables.optimisticUpdate, etc.
 */

import { getArrayKey } from './syncDependencies';

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
  if (sections?.some(sec => field in sec)) return field;
  // Try alias mapping
  return FIELD_ALIASES[field.toLowerCase()] || field;
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
  quizBank: 'q',      // question text
  discussions: 'pr',   // prompt text
  courseFaq: 'q',     // FAQ question
  rubrics: 'cn',      // criterion name
  slideDecks: 't',    // slide title
};

// ── Per-deliverable sub-array keys ───────────────────────────────────────────
// Maps featureId → the key within each per-lesson item that holds the sub-array
// where new items are inserted. null = item IS the per-lesson entry (replace/push to root array).
const SUB_ARRAY_KEYS = {
  quizBank: 'qs',       // quizzes[i].qs = questions array
  slideDecks: 'sl',     // decks[i].sl = slides array
  courseFaq: 'qs',      // faqs[i].qs = Q&A array
  rubrics: 'cr',        // rubrics[i].cr = criteria array
  studyGuides: null,     // complex — handled per-subfield (kt, rq, cm)
  lessonPlans: null,     // complex — handled per-subfield (ol, hw, etc.)
  discussions: null,     // one per lesson — replace entire item
  assignments: null,     // flat array — push to root
  syllabus: null,        // single object — not per-lesson
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
  // Resolve abbreviated field names to actual course map keys
  const sections = courseMap?.lessons?.[lessonIndex]?.sections;
  const resolvedField = resolveField(field, sections);
  editor.handleCellEdit(lessonIndex, sectionIndex ?? 0, resolvedField, value);
  return { success: true, message: `Updated ${resolvedField} in Lesson ${lessonIndex + 1}` };
}

function execEditTitle({ lessonIndex, newTitle }, { editor }) {
  if (!editor?.handleTitleEdit) return { success: false, message: 'Editor not available' };
  editor.handleTitleEdit(lessonIndex, newTitle);
  return { success: true, message: `Renamed Lesson ${lessonIndex + 1}` };
}

function execAddLesson({ title, sections }, { editor, courseMap }) {
  if (!editor?.handleAddLesson) return { success: false, message: 'Editor not available' };
  // handleAddLesson appends a blank lesson, then we populate it
  editor.handleAddLesson();
  const newIdx = (courseMap?.lessons?.length ?? 0); // index of newly added lesson
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

function execAddItem({ featureId, lessonIndex, item, subKey }, ctx) {
  const { deliverables, optimisticUpdate, snapshot, skipSnapshot } = ctx;
  if (!optimisticUpdate) return { success: false, message: 'Optimistic update not available' };

  const entry = deliverables?.[featureId];
  if (!entry?.data) return { success: false, message: `${featureId} not generated yet` };

  // Snapshot for undo before mutating (skip during batch — caller snapshots once)
  if (snapshot && !skipSnapshot) snapshot(featureId, entry.data);

  const data = structuredClone(entry.data);
  const arrKey = getArrayKey(featureId, data);

  if (featureId === 'assignments') {
    // Flat array — push to root
    if (!data[arrKey]) data[arrKey] = [];
    data[arrKey].push(item);
    optimisticUpdate(featureId, data);
    return { success: true, message: `Added assignment "${item.t || 'New Assignment'}"` };
  }

  if (featureId === 'syllabus') {
    // Single object — merge fields
    if (item && typeof item === 'object') {
      Object.assign(data.syllabus || data, item);
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
  const subArrayKey = subKey || SUB_ARRAY_KEYS[featureId];

  if (subArrayKey && lessonItem[subArrayKey]) {
    // Exact-match dedup check before pushing
    const dupField = DEDUP_FIELDS[featureId];
    if (dupField && item[dupField]) {
      const newText = (item[dupField] || '').toLowerCase().trim();
      const isDupe = lessonItem[subArrayKey].some(existing =>
        (existing[dupField] || '').toLowerCase().trim() === newText
      );
      if (isDupe) {
        return { success: false, message: `Duplicate detected: an item with the same ${dupField === 'q' ? 'question' : 'text'} already exists in this lesson.` };
      }
    }
    // Has sub-array (quizBank.qs, slideDecks.sl, etc.) — push into it
    lessonItem[subArrayKey].push(item);
    // Update counts if they exist
    if ('tq' in lessonItem) lessonItem.tq = lessonItem[subArrayKey].length;
    if ('ts' in lessonItem) lessonItem.ts = lessonItem[subArrayKey].length;
  } else if (subKey && !lessonItem[subKey]) {
    // Sub-array doesn't exist yet — create it
    lessonItem[subKey] = [item];
  } else {
    // No sub-array — this is a per-lesson item type (discussions, etc.)
    // Replace the entire lesson entry
    arr[lessonIndex] = { ...lessonItem, ...item };
  }

  optimisticUpdate(featureId, data);
  const itemName = item.t || item.q || item.tm || item.cn || item.title || '';
  return { success: true, message: `Added item${itemName ? ` "${itemName}"` : ''} to ${featureId}` };
}

function execRemoveItem({ featureId, lessonIndex, itemIndex, subKey }, ctx) {
  const { deliverables, optimisticUpdate, snapshot, skipSnapshot } = ctx;
  if (!optimisticUpdate) return { success: false, message: 'Optimistic update not available' };

  const entry = deliverables?.[featureId];
  if (!entry?.data) return { success: false, message: `${featureId} not generated yet` };

  // Snapshot for undo before mutating (skip during batch — caller snapshots once)
  if (snapshot && !skipSnapshot) snapshot(featureId, entry.data);

  const data = structuredClone(entry.data);
  const arrKey = getArrayKey(featureId, data);

  if (featureId === 'assignments') {
    // Flat array — remove by index
    if (!data[arrKey] || itemIndex < 0 || itemIndex >= data[arrKey].length) {
      return { success: false, message: 'Item index out of range' };
    }
    const removed = data[arrKey].splice(itemIndex, 1)[0];
    optimisticUpdate(featureId, data);
    return { success: true, message: `Removed "${removed?.t || 'item'}" from assignments` };
  }

  // Per-lesson deliverables
  const arr = data[arrKey];
  if (!Array.isArray(arr) || lessonIndex >= arr.length) {
    return { success: false, message: 'Lesson index out of range' };
  }

  const lessonItem = arr[lessonIndex];
  const subArrayKey = subKey || SUB_ARRAY_KEYS[featureId];

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

function execEditItem({ featureId, path, value }, ctx) {
  const { deliverables, optimisticUpdate, snapshot, skipSnapshot } = ctx;
  if (!optimisticUpdate) return { success: false, message: 'Optimistic update not available' };
  if (!Array.isArray(path) || path.length < 1) return { success: false, message: 'Invalid path — must be a non-empty array' };

  const entry = deliverables?.[featureId];
  if (!entry?.data) return { success: false, message: `${featureId} not generated yet` };

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
    }
  }

  // Walk the path and set the value
  let target = data;
  for (let i = 0; i < resolvedPath.length - 1; i++) {
    target = target[resolvedPath[i]];
    if (target == null) return { success: false, message: `Invalid path at ${resolvedPath[i]}` };
  }
  const finalKey = resolvedPath[resolvedPath.length - 1];
  if (target == null || typeof target !== 'object') return { success: false, message: `Invalid path — cannot set property on ${typeof target}` };
  target[finalKey] = value;

  optimisticUpdate(featureId, data);
  return { success: true, message: `Updated ${featureId}` };
}

function execRegenerateLesson({ featureId, lessonIndex }, { regenerateLesson, courseMap }) {
  if (!regenerateLesson) return { success: false, message: 'Regenerate not available' };
  regenerateLesson(featureId, courseMap, lessonIndex);
  return { success: true, message: `Regenerating ${featureId} for Lesson ${lessonIndex + 1}` };
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
  if (action.lessonIndex !== undefined && action.featureId && action.featureId !== 'assignments' && action.featureId !== 'syllabus') {
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
    if (dupField && action.item[dupField]) {
      const entry = deliverables?.[action.featureId];
      if (entry?.data) {
        const arrKey = getArrayKey(action.featureId, entry.data);
        const arr = entry.data[arrKey];
        if (Array.isArray(arr) && action.lessonIndex !== undefined && arr[action.lessonIndex]) {
          const lessonItem = arr[action.lessonIndex];
          const subArrayKey = SUB_ARRAY_KEYS[action.featureId];
          if (subArrayKey && Array.isArray(lessonItem[subArrayKey])) {
            const newText = (action.item[dupField] || '').toLowerCase().trim();
            const isDupe = lessonItem[subArrayKey].some(existing =>
              (existing[dupField] || '').toLowerCase().trim() === newText
            );
            if (isDupe) {
              return { valid: false, reason: `Duplicate: item with same ${dupField === 'q' ? 'question' : 'text'} already exists` };
            }
          }
        }
      }
    }
  }

  return { valid: true };
}
