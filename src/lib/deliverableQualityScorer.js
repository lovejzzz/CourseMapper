// Stub — deliverable quality scoring (not yet implemented)

/**
 * Heuristic quality score for a generated deliverable.
 * Returns a score object: { overall: 0-5, bloom: 0-5, specificity: 0-5, actionability: 0-5, tips: [] }
 */
export function scoreHeuristic(featureId, data) {
  return { overall: 0, bloom: 0, specificity: 0, actionability: 0, tips: [] };
}

/**
 * Compute the average overall score across multiple quality score objects.
 */
export function computeAvgScore(scores) {
  if (!scores || Object.keys(scores).length === 0) return 0;
  const vals = Object.values(scores).map(s => s.overall || 0);
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/**
 * Returns a Tailwind color class for a given score (0-5).
 */
export function scoreColor(score) {
  if (score >= 4) return 'text-emerald-600';
  if (score >= 2.5) return 'text-amber-500';
  return 'text-red-400';
}
