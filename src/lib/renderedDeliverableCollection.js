const COLLECTION_ALIASES = {
  lessonPlans: ['plans', 'lessons'],
  slideDecks: ['decks'],
  rubrics: [],
  quizBank: ['quizzes'],
  discussions: [],
  assignments: [],
  studyGuides: ['guides'],
  courseFaq: ['faqs', 'faq', 'courseFAQ'],
};

export function isRenderedDeliverableCollectionFeature(featureId) {
  return Object.hasOwn(COLLECTION_ALIASES, featureId);
}

export function renderedDeliverableCollectionKeys(featureId) {
  return isRenderedDeliverableCollectionFeature(featureId) ? [featureId, ...(COLLECTION_ALIASES[featureId] || [])] : [];
}

/**
 * Resolve the exact top-level array a renderer consumes. Canonical content
 * wins after partial schema migrations; valid legacy aliases remain supported
 * and malformed truthy values never suppress a valid array.
 * Object-rooted and unknown/custom deliverables return no collection.
 */
export function renderedDeliverableCollectionKey(featureId, data) {
  return renderedDeliverableCollectionKeys(featureId).find((key) => Array.isArray(data?.[key])) || null;
}
