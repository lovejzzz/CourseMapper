/**
 * syncDependencies.js — Cascade Sync Engine dependency map (V1.6.0)
 *
 * When an instructor edits a course map cell, we need to know which
 * deliverables are affected so we can surgically regenerate only those.
 */

import {
  isRenderedDeliverableCollectionFeature,
  renderedDeliverableCollectionKey,
} from './renderedDeliverableCollection.js';

/**
 * Returns the key in a parsed deliverable JSON object that holds the main array.
 * e.g. lessonPlans → "lessonPlans", quizBank → "quizzes", etc.
 */
export function getArrayKey(featureId, parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  if (isRenderedDeliverableCollectionFeature(featureId)) {
    return renderedDeliverableCollectionKey(featureId, parsed);
  }
  // Unknown/custom features retain their document-owned generic fallback.
  for (const k of Object.keys(parsed)) {
    if (Array.isArray(parsed[k])) return k;
  }
  return null;
}

// ── Per-field dependency map ────────────────────────────────────────────────
//
// Maps each editable course map field key → which featureIds need re-sync.
// '_structural' = lesson added/deleted/moved → full regen for all per-lesson features.
// 'courseName' / 'semester' → syllabus only.
// 'title' → ALL per-lesson deliverables.

const PER_LESSON_ALL = [
  'lessonPlans',
  'slideDecks',
  'rubrics',
  'quizBank',
  'discussions',
  'assignments',
  'studyGuides',
];

// ── Per-deliverable outbound cascade map ────────────────────────────────────
//
// When the user directly edits the BODY of a deliverable, only semantically
// related deliverables need to re-sync — NOT all 6. This prevents a single
// word-edit from triggering 34+ seconds of generation.
//
// Each key = source deliverable that was edited
// Each value = which OTHER deliverables should cascade-regenerate
//
// Rationale for each mapping:
//   lessonPlans  → slide decks mirror the lesson structure; study guides summarise it
//   slideDecks   → lesson plans are the primary source; slides adapt from plans
//   studyGuides  → lesson plans and slides reference the same content
//   rubrics      → assignments use rubric criteria for submission guidance
//   quizBank     → study guides summarise quiz-tested concepts
//   discussions  → no strong structural coupling to other deliverables
//   assignments  → rubrics score the assignment — keep them in sync
export const DELIVERABLE_OUTBOUND_MAP = {
  lessonPlans: ['slideDecks', 'studyGuides'],
  slideDecks: ['lessonPlans'],
  studyGuides: ['lessonPlans', 'slideDecks'],
  rubrics: ['assignments'],
  quizBank: ['studyGuides'],
  discussions: [],
  assignments: ['rubrics'],
};

/**
 * Get cascade targets for a given featureId, including custom deliverables.
 * Custom deliverables ('custom_*') cascade to the core content pair
 * (lessonPlans + studyGuides) since we can't know their semantic scope
 * at definition time. Built-in deliverables use the static map above.
 *
 * @param {string} featureId
 * @returns {string[]} — target featureIds that should cascade-update
 */
export function getOutboundTargets(featureId) {
  if (DELIVERABLE_OUTBOUND_MAP[featureId]) return DELIVERABLE_OUTBOUND_MAP[featureId];
  if (featureId?.startsWith('custom_')) return ['lessonPlans', 'studyGuides'];
  return [];
}

const FIELD_DEPENDENCY_MAP = {
  // Direct edit to a deliverable's body text → only semantically coupled deliverables.
  // The _deliverableEdit key is special: buildSyncPlan receives the source featureId
  // (via excludeFeatureId/priorityFeatureId) and looks it up in DELIVERABLE_OUTBOUND_MAP
  // instead of using this fallback. This entry is a safety fallback only.
  _deliverableEdit: [], // resolved dynamically via DELIVERABLE_OUTBOUND_MAP in buildSyncPlan

  // Lesson title change → everything needs updating (most deliverables reference the title)
  title: PER_LESSON_ALL,

  // Learning objectives → core content deliverables
  learningObjectives: ['lessonPlans', 'slideDecks', 'rubrics', 'quizBank', 'studyGuides'],

  // Weekly assessments → assessment-focused deliverables
  weeklyAssessments: ['rubrics', 'quizBank', 'assignments'],

  // Topic/section → lesson content deliverables
  topicSection: ['lessonPlans', 'slideDecks', 'studyGuides', 'discussions'],

  // Async/sync activities → lesson plans and slides
  asyncActivities: ['lessonPlans', 'slideDecks'],
  syncActivities: ['lessonPlans', 'slideDecks'],

  // Supporting resources → study guides and lesson plans
  supportingResources: ['studyGuides', 'lessonPlans'],

  // Presentation format → slide decks primarily
  presentationFormat: ['slideDecks', 'lessonPlans'],

  // Learning goals → broader impact
  learningGoals: ['lessonPlans', 'slideDecks', 'studyGuides'],

  // Technology needed → lesson plans
  technologyNeeded: ['lessonPlans'],

  // Evaluate design checkbox → rubrics
  evaluateDesign: ['rubrics'],

  // Structural edit (add/delete/move lesson) → all per-lesson features, full regen
  _structural: PER_LESSON_ALL,

  // Section added/deleted within a lesson → treat as structural for that lesson
  sections: PER_LESSON_ALL,

  // Course-level metadata → syllabus only
  courseName: ['syllabus'],
  semester: ['syllabus'],
  courseDescription: ['syllabus'],
};

// ── Change #3: Staleness confidence — field impact weights ────────────────────
//
// How "impactful" each course map field is to downstream deliverables.
// Higher weight = higher staleness confidence (more likely content is truly out of date).
// Scale: 1.0 = maximum impact, 0.2 = minimal cosmetic impact.
export const FIELD_WEIGHT = {
  title: 0.5,
  learningObjectives: 1.0,
  weeklyAssessments: 0.9,
  topicSection: 0.8,
  asyncActivities: 0.6,
  syncActivities: 0.6,
  supportingResources: 0.4,
  presentationFormat: 0.4,
  learningGoals: 0.7,
  technologyNeeded: 0.3,
  evaluateDesign: 0.5,
  _structural: 1.0,
  sections: 0.8,
  courseName: 0.3,
  semester: 0.2,
  courseDescription: 0.5,
  _deliverableEdit: 0.7,
};

/**
 * computeStaleConfidence — given an array of edit keys, compute the staleness
 * confidence level for a downstream deliverable.
 *
 * @param {string[]} editKeys — field keys that changed (e.g. ['learningObjectives', 'title'])
 * @returns {{ level: 'high'|'medium'|'low', maxWeight: number, dominantField: string|null }}
 */
export function computeStaleConfidence(editKeys) {
  if (!editKeys || editKeys.length === 0) return { level: 'low', maxWeight: 0, dominantField: null };

  let maxWeight = 0;
  let dominantField = editKeys[0];
  for (const key of editKeys) {
    const w = FIELD_WEIGHT[key] ?? 0.5; // unknown fields default to medium
    if (w > maxWeight) {
      maxWeight = w;
      dominantField = key;
    }
  }

  const level = maxWeight >= 0.8 ? 'high' : maxWeight >= 0.5 ? 'medium' : 'low';
  return { level, maxWeight, dominantField };
}

/**
 * Returns which featureIds need re-sync when the given course map field changes.
 *
 * @param {string} editKey - Field that changed (e.g. 'learningObjectives', '_structural')
 * @param {string[]|null} selectedFeatures - Currently selected feature IDs. When provided,
 *   unknown column keys fall back to all selected per-lesson features instead of a
 *   hardcoded ['lessonPlans', 'slideDecks'] pair that may not match the workspace.
 */
export function getAffectedFeatures(editKey, selectedFeatures = null) {
  if (FIELD_DEPENDENCY_MAP[editKey] !== undefined) {
    const deps = FIELD_DEPENDENCY_MAP[editKey];
    // Non-empty array: return it directly.
    // Empty array (e.g. _deliverableEdit — resolved via DELIVERABLE_OUTBOUND_MAP):
    // caller handles it; we return the empty array as-is.
    return deps;
  }
  // Unknown column key (e.g. custom column added by instructor).
  // Conservative fallback: use all currently-selected per-lesson features so
  // new columns automatically sync everything the user actually has, rather than
  // silently missing deliverables that aren't lessonPlans/slideDecks.
  if (selectedFeatures && selectedFeatures.length > 0) {
    return selectedFeatures.filter((f) => f !== 'courseMap' && f !== 'syllabus');
  }
  // Last-resort hardcoded fallback (no selectedFeatures context available)
  return ['lessonPlans', 'slideDecks'];
}

/**
 * Builds a deduplicated sync plan from accumulated pending edits.
 *
 * @param {Array<{lessonIdx: number|null, key: string, excludeFeatureId: string|null}>} pendingEdits
 *   Accumulated since last sync. lessonIdx=null means structural change.
 *   excludeFeatureId: when key='_deliverableEdit', identifies which deliverable was edited
 *   so we can look up its outbound cascade targets in DELIVERABLE_OUTBOUND_MAP.
 * @param {string[]} selectedFeatures
 *   Currently selected/generated featureIds (only sync features that have data).
 * @param {Object} deliverables
 *   Current deliverable state map — only regenerate features with status 'done'.
 * @param {string|null} priorityFeatureId
 *   Optional featureId to sort first in the plan — used when the edit originated
 *   from within a deliverable so the user sees that tab update live first.
 *
 * @returns {Array<{featureId: string, lessonIndices: number[]|null}>}
 *   lessonIndices=null means full regen for that feature (structural change).
 */
export function buildSyncPlan(pendingEdits, selectedFeatures, deliverables, priorityFeatureId = null) {
  if (!pendingEdits || pendingEdits.length === 0) return [];
  if (!selectedFeatures || selectedFeatures.length === 0) return [];

  // Only sync features that are currently 'done' (have generated data)
  const doneFeatures = new Set(
    selectedFeatures.filter((f) => f !== 'courseMap' && deliverables?.[f]?.status === 'done'),
  );

  if (doneFeatures.size === 0) return [];

  // Per-feature: collect affected lesson indices or flag as structural (null)
  // Map<featureId, Set<number> | null>  (null = full regen)
  const featureMap = new Map();

  for (const { lessonIdx, key, excludeFeatureId } of pendingEdits) {
    let affected;

    if (key === '_deliverableEdit' && excludeFeatureId) {
      // Resolve outbound targets from the per-deliverable map — much narrower than PER_LESSON_ALL.
      // e.g. editing a Study Guide only cascades to lessonPlans + slideDecks, not rubrics/quizBank.
      // Uses getOutboundTargets() so custom deliverables also get cascade targets.
      affected = getOutboundTargets(excludeFeatureId);
    } else {
      // Pass selectedFeatures so unknown column keys fall back to all active per-lesson features
      affected = getAffectedFeatures(key, selectedFeatures);
    }

    const isStructural = lessonIdx === null || key === '_structural';

    for (const featureId of affected) {
      if (!doneFeatures.has(featureId)) continue;

      if (isStructural) {
        // Full regen — null overrides any specific indices
        featureMap.set(featureId, null);
      } else {
        const current = featureMap.get(featureId);
        if (current === null) continue; // Already flagged for full regen
        if (!current) {
          featureMap.set(featureId, new Set([lessonIdx]));
        } else {
          current.add(lessonIdx);
        }
      }
    }
  }

  // Convert to array form, then sort so priorityFeatureId is first
  // (so the current tab the user is looking at updates live before the others)
  const plan = [];
  for (const [featureId, indices] of featureMap.entries()) {
    plan.push({
      featureId,
      lessonIndices: indices === null ? null : [...indices].sort((a, b) => a - b),
    });
  }

  if (priorityFeatureId) {
    const priorityIdx = plan.findIndex((p) => p.featureId === priorityFeatureId);
    if (priorityIdx > 0) {
      const [priorityEntry] = plan.splice(priorityIdx, 1);
      plan.unshift(priorityEntry);
    }
  }

  return plan;
}
