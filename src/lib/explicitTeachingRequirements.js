// Explicit instructor requirements survive model compression and project restore.
// Narrow extraction: no inferred prerequisites or question counts from lesson counts.
export function extractExplicitTeachingRequirements(brief = '') {
  const text = String(brief).replace(/[\u2010-\u2015]/g, '-');
  const numberWords = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const countToken = '(\\d+|one|two|three|four|five|six|seven|eight|nine|ten)';
  const countPattern = new RegExp(
    `\\b${countToken}\\s*-?\\s*question\\s+quiz\\b|\\bquiz(?:zes)?\\s+(?:with|of)\\s+${countToken}\\s+questions\\b`,
    'gi',
  );
  const counts = [...text.matchAll(countPattern)].map((match) => {
    const value = (match[1] || match[2]).toLowerCase();
    return numberWords[value] ?? Number(value);
  });
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
