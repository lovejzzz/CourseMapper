const SPLIT_FUNCTION_WORDS = new Set([
  'ABOUT',
  'AFTER',
  'ALONG',
  'AMONG',
  'AND',
  'BEFORE',
  'BETWEEN',
  'DURING',
  'FOR',
  'FROM',
  'INTO',
  'OVER',
  'THE',
  'THROUGH',
  'UNDER',
  'WITH',
  'WITHOUT',
]);

/**
 * Repair a narrow PDF/OCR title artifact without rewriting authored identity.
 *
 * Official PDFs sometimes expose an all-caps function word as two tokens
 * ("T HE", "A ND"). Rejoin only when the combined token is a closed-class
 * function word; ordinary initials, acronyms, names, and content words remain
 * byte-for-byte unchanged.
 */
export function repairCourseIdentityTypography(value = '') {
  return String(value || '')
    .replace(/\b([A-Z])\s+([A-Z]{2,7})\b/g, (match, left, right) => {
      const joined = `${left}${right}`;
      return SPLIT_FUNCTION_WORDS.has(joined) ? joined : match;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

export function repairCourseMapIdentityTypography(courseMap) {
  if (!courseMap || typeof courseMap !== 'object') return courseMap;
  const courseName = repairCourseIdentityTypography(courseMap.courseName);
  return courseName && courseName !== courseMap.courseName ? { ...courseMap, courseName } : courseMap;
}
