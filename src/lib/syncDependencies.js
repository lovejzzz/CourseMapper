// Stub — deliverable sync/dependency tracking (not yet implemented)

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

export function buildSyncPlan() { return []; }
export function hasDependency() { return false; }
