/**
 * syncDependencies.js — Cascade Sync Engine dependency map (V1.5.3)
 *
 * When an instructor edits a course map cell, we need to know which
 * deliverables are affected so we can surgically regenerate only those.
 */

/**
 * Returns the key in a parsed deliverable JSON object that holds the main array.
 * e.g. lessonPlans → "lessonPlans", quizBank → "quizzes", etc.
 */
export function getArrayKey(featureId, parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  const KNOWN_KEYS = {
    lessonPlans: 'lessonPlans',
    slideDecks: 'slideDecks',
    rubrics: 'rubrics',
    quizBank: 'quizzes',
    discussions: 'discussions',
    assignments: 'assignments',
    studyGuides: 'studyGuides',
  };
  const known = KNOWN_KEYS[featureId];
  if (known && parsed[known]) return known;
  // Fall back: find the first array key in the object
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
  'lessonPlans', 'slideDecks', 'rubrics', 'quizBank',
  'discussions', 'assignments', 'studyGuides',
];

const FIELD_DEPENDENCY_MAP = {
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
  syncActivities:  ['lessonPlans', 'slideDecks'],

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

/**
 * Returns which featureIds need re-sync when the given course map field changes.
 * Unknown keys get a conservative set (lessonPlans + slideDecks).
 */
export function getAffectedFeatures(editKey) {
  if (FIELD_DEPENDENCY_MAP[editKey]) {
    return FIELD_DEPENDENCY_MAP[editKey];
  }
  // Conservative fallback for unknown column keys — assume lesson content
  return ['lessonPlans', 'slideDecks'];
}

/**
 * Builds a deduplicated sync plan from accumulated pending edits.
 *
 * @param {Array<{lessonIdx: number|null, key: string}>} pendingEdits
 *   Accumulated since last sync. lessonIdx=null means structural change.
 * @param {string[]} selectedFeatures
 *   Currently selected/generated featureIds (only sync features that have data).
 * @param {Object} deliverables
 *   Current deliverable state map — only regenerate features with status 'done'.
 *
 * @returns {Array<{featureId: string, lessonIndices: number[]|null}>}
 *   lessonIndices=null means full regen for that feature (structural change).
 */
export function buildSyncPlan(pendingEdits, selectedFeatures, deliverables) {
  if (!pendingEdits || pendingEdits.length === 0) return [];
  if (!selectedFeatures || selectedFeatures.length === 0) return [];

  // Only sync features that are currently 'done' (have generated data)
  const doneFeatures = new Set(
    selectedFeatures.filter(f =>
      f !== 'courseMap' && deliverables?.[f]?.status === 'done'
    )
  );

  if (doneFeatures.size === 0) return [];

  // Per-feature: collect affected lesson indices or flag as structural (null)
  // Map<featureId, Set<number> | null>  (null = full regen)
  const featureMap = new Map();

  for (const { lessonIdx, key } of pendingEdits) {
    const affected = getAffectedFeatures(key);
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

  // Convert to array form
  const plan = [];
  for (const [featureId, indices] of featureMap.entries()) {
    plan.push({
      featureId,
      lessonIndices: indices === null ? null : [...indices].sort((a, b) => a - b),
    });
  }

  return plan;
}
