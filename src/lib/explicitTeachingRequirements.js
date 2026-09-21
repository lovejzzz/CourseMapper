// Explicit instructor requirements survive model compression and project restore.
// Narrow extraction: no inferred prerequisites or question counts from lesson counts.
export function extractExplicitTeachingRequirements(brief = '') {
  const text = String(brief).replace(/[\u2010-\u2015]/g, '-');
  const counts = [
    ...text.matchAll(/\b(\d+)\s*-?\s*question\s+quiz\b|\bquiz(?:zes)?\s+(?:with|of)\s+(\d+)\s+questions\b/gi),
  ].map((m) => Number(m[1] || m[2]));
  const uniqueCounts = [...new Set(counts)];
  const questionsPerLesson =
    uniqueCounts.length === 1 && uniqueCounts[0] >= 3 && uniqueCounts[0] <= 8 ? uniqueCounts[0] : null;
  const prior = text.match(/\b(?:students|learners)\s+(?:already\s+)?know\s+([^.!?\n]+)/i);
  return {
    protocol: 'coursemapper-explicit-teaching-requirements-v1',
    questionsPerLesson,
    prerequisites: prior ? [{ text: prior[1].trim(), sourceStatus: 'source-explicit', status: 'expected' }] : [],
    // Retained for lesson-scoped selection; never used as external evidence.
    sourceBrief: text,
  };
}
