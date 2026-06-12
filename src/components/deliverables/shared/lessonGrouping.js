// v0.14.4 WS-D (D1): lesson grouping for deliverable views at registry scale.
// Since the assessment registry (v0.14.1 P3) a 13-lesson course compiles ~51
// assignment briefs and ~51 rubrics — flat lists stopped scaling. These pure
// helpers group items by lesson with a tolerant fallback (registry items
// carry an explicit lessonNumber; AI-authored ones mention "Lesson N" /
// "Week N" somewhere) and an "Ungrouped" tail so no item is ever dropped.

export const UNGROUPED_KEY = 'ungrouped';

export function parseLessonNumberFromText(text) {
  const match = String(text || '').match(/(?:Lesson|Week)\s*(\d+)/i);
  return match ? Number(match[1]) : null;
}

// The lesson an item belongs to — explicit lessonNumber first, then the
// textual probes the focus-anchor helpers already trust, then the title
// itself ("Week 3 Reflection Memo" still resolves).
export function resolveLessonNumber(item) {
  if (Number.isInteger(item?.lessonNumber) && item.lessonNumber > 0) return item.lessonNumber;
  const probes = [
    item?.dueWeek,
    item?.lessonTitle,
    item?.lt,
    item?.lesson,
    item?.title,
    ...(Array.isArray(item?.relatedLessons) ? item.relatedLessons : []),
  ];
  for (const probe of probes) {
    const parsed = parseLessonNumberFromText(probe);
    if (parsed) return parsed;
  }
  return null;
}

/**
 * Group items by lesson, preserving each item's ORIGINAL index (edit paths,
 * proposals, tiers, and regeneration all key on the flat array position).
 * Returns [{ key, lessonNumber, items: [{ item, index }] }] sorted by lesson
 * number ascending with the "Ungrouped" tail last. Items are never dropped.
 */
export function groupItemsByLesson(items, getLessonNumber = resolveLessonNumber) {
  const buckets = new Map();
  (Array.isArray(items) ? items : []).forEach((item, index) => {
    const lessonNumber = getLessonNumber(item, index);
    const grouped = Number.isInteger(lessonNumber) && lessonNumber > 0;
    const key = grouped ? `lesson-${lessonNumber}` : UNGROUPED_KEY;
    if (!buckets.has(key)) buckets.set(key, { key, lessonNumber: grouped ? lessonNumber : null, items: [] });
    buckets.get(key).items.push({ item, index });
  });
  return [...buckets.values()].sort((a, b) => {
    if (a.lessonNumber == null) return 1;
    if (b.lessonNumber == null) return -1;
    return a.lessonNumber - b.lessonNumber;
  });
}

// "Lesson 7 — Sampling Distributions": the group header borrows the course
// map's lesson title, stripped of its own "Lesson 7:" prefix.
export function lessonTitleForNumber(courseMap, lessonNumber) {
  if (!Number.isInteger(lessonNumber) || lessonNumber < 1) return '';
  const raw = courseMap?.lessons?.[lessonNumber - 1]?.title || '';
  return String(raw)
    .replace(/^\s*(?:Lesson|Week)\s*\d+\s*[:.–—-]\s*/i, '')
    .trim();
}

/**
 * v0.14.4 WS-D (D2): presentation order for the Quiz & Exam Bank. The
 * compiler appends exam entries at the END of the quizzes array; on screen an
 * exam belongs right after its own lesson's weekly quiz. Pure reorder of
 * { item, index } pairs — original indices keep edit paths and proposals
 * pointing at the unmoved data.
 */
export function quizPresentationOrder(quizzes, getLessonNumber = resolveLessonNumber) {
  return (Array.isArray(quizzes) ? quizzes : [])
    .map((item, index) => ({
      item,
      index,
      lessonNumber: getLessonNumber(item, index) ?? Number.POSITIVE_INFINITY,
      isExam: item?.kind === 'exam' ? 1 : 0,
    }))
    .sort((a, b) => a.lessonNumber - b.lessonNumber || a.isExam - b.isExam || a.index - b.index)
    .map(({ item, index }) => ({ item, index }));
}
