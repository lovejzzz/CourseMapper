const TITLE_PREFIX_RE = /^(?:(?:lesson|week|module|session)\s*\d{1,3}\s*[:.\-–—]?\s*)/i;
const TITLE_STOP_WORDS = new Set(['a', 'an', 'and', 'of', 'the', 'to']);

export function normalizeLessonTitleIdentity(value) {
  const expanded = String(value || '')
    .replace(TITLE_PREFIX_RE, '')
    .replace(/\bc\.?p\.?i\.?\b/gi, 'consumer price index')
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return expanded
    .split(/\s+/)
    .filter((token) => token && !TITLE_STOP_WORDS.has(token))
    .join(' ');
}

export function findDuplicateLessonTitleGroups(lessons = []) {
  const byIdentity = new Map();
  (Array.isArray(lessons) ? lessons : []).forEach((lesson, lessonIndex) => {
    const title = String(lesson?.title || lesson?.lessonTitle || '').trim();
    const identity = normalizeLessonTitleIdentity(title);
    if (!identity) return;
    const group = byIdentity.get(identity) || { identity, lessonIndices: [], titles: [] };
    group.lessonIndices.push(lessonIndex);
    group.titles.push(title);
    byIdentity.set(identity, group);
  });
  return [...byIdentity.values()].filter((group) => group.lessonIndices.length > 1);
}
