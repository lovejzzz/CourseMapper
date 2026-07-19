import { getArrayKey } from './syncDependencies.js';

/**
 * Generation can materialize a focused subset as a compact Course Map. In
 * that state, the requested source indices (for example `[4]` for Lesson 5)
 * no longer index the one-item arrays used by finalization and export. Remap
 * only when the materialized lesson count exactly matches the requested
 * subset; otherwise keep the filter unchanged so a real scope defect remains
 * visible to readiness checks.
 */
export function remapLessonFilterToMaterializedScope(courseMap, lessonFilter) {
  if (!Array.isArray(lessonFilter)) return lessonFilter ?? null;
  const requested = lessonFilter.filter((index) => Number.isInteger(index) && index >= 0);
  const lessons = Array.isArray(courseMap?.lessons) ? courseMap.lessons : [];
  if (requested.length === 0 || lessons.length === 0) return requested;
  if (requested.every((index) => index < lessons.length)) return requested;
  if (requested.length === lessons.length) return lessons.map((_, index) => index);
  return requested;
}

/** Keep a compact scoped Course Map honest about its source lesson numbers. */
export function preserveMaterializedLessonNumbers(courseMap, lessonFilter) {
  if (!Array.isArray(lessonFilter) || !Array.isArray(courseMap?.lessons)) return courseMap;
  if (lessonFilter.length === 0 || courseMap.lessons.length !== lessonFilter.length) return courseMap;
  return {
    ...courseMap,
    lessons: courseMap.lessons.map((lesson, index) => {
      const lessonNumber = lessonFilter[index] + 1;
      const rawTitle = String(lesson?.title || '').trim();
      const title = /^lesson\s+\d+\b/i.test(rawTitle)
        ? rawTitle.replace(/^lesson\s+\d+\b/i, `Lesson ${lessonNumber}`)
        : `Lesson ${lessonNumber}${rawTitle ? `: ${rawTitle}` : ''}`;
      return { ...lesson, title, sourceLessonNumber: lessonNumber };
    }),
  };
}

/** Translate compact-workspace export indices back to the source lessons. */
export function resolveMaterializedSourceLessonFilter(courseMap, lessonFilter, sourceLessonFilter) {
  const lessons = Array.isArray(courseMap?.lessons) ? courseMap.lessons : [];
  if (!Array.isArray(sourceLessonFilter) || sourceLessonFilter.length !== lessons.length) return lessonFilter ?? null;
  if (!sourceLessonFilter.some((index) => index >= lessons.length)) return lessonFilter ?? null;
  if (lessonFilter === null || lessonFilter === undefined) return sourceLessonFilter;
  if (!Array.isArray(lessonFilter)) return lessonFilter;
  if (lessonFilter.length === 0) return sourceLessonFilter;
  if (lessonFilter.every((index) => Number.isInteger(index) && index >= 0 && index < lessons.length)) {
    return lessonFilter.map((index) => sourceLessonFilter[index]);
  }
  return lessonFilter;
}

/** Stamp source lesson identity onto compiled per-lesson array items. */
export function preserveDeliverableLessonNumbers(parsed, arrayKey, lessonFilter, courseMap) {
  if (!parsed || !arrayKey || !Array.isArray(lessonFilter) || lessonFilter.length === 0) return parsed;
  const items = Array.isArray(parsed[arrayKey]) ? parsed[arrayKey] : [];
  if (items.length === 0) return parsed;
  const lessons = Array.isArray(courseMap?.lessons) ? courseMap.lessons : [];
  if (items.length !== lessonFilter.length) return parsed;
  const alreadyMaterialized =
    lessonFilter.length === lessons.length && lessonFilter.some((index) => index >= lessons.length);
  const patched = items.map((item, index) => {
    const sourceIndex = lessonFilter[index];
    if (!item || !Number.isInteger(sourceIndex)) return item;
    const sourceNumber = sourceIndex + 1;
    const mapLesson = lessons[alreadyMaterialized ? index : sourceIndex];
    const mapTitle = String(mapLesson?.title || '').trim();
    const lessonTitle = /^lesson\s+\d+\b/i.test(mapTitle)
      ? mapTitle.replace(/^lesson\s+\d+\b/i, `Lesson ${sourceNumber}`)
      : `Lesson ${sourceNumber}${mapTitle ? `: ${mapTitle}` : ''}`;
    const updates = {};
    if ('lessonTitle' in item) updates.lessonTitle = lessonTitle;
    if ('lt' in item) updates.lt = lessonTitle;
    if ('weekNumber' in item) updates.weekNumber = `Week ${sourceNumber}`;
    if ('lessonNumber' in item) updates.lessonNumber = sourceNumber;
    if ('ln' in item) updates.ln = sourceNumber;
    return Object.keys(updates).length > 0 ? { ...item, ...updates } : item;
  });
  return { ...parsed, [arrayKey]: patched };
}

function itemLessonNumber(item) {
  if (!item || typeof item !== 'object') return null;
  const candidates = [];
  for (const value of [item.sourceLessonNumber, item.lessonNumber, item.ln]) {
    const number = Number(value);
    if (Number.isInteger(number) && number > 0) candidates.push(number);
  }
  for (const value of [item.weekNumber, item.week, item.lessonTitle, item.lt, item.title]) {
    const number = Number(String(value || '').match(/\b(?:lesson|week|module)\s*(\d{1,3})\b/i)?.[1]);
    if (Number.isInteger(number) && number > 0) candidates.push(number);
  }
  return candidates.length > 0 ? Math.max(...candidates) : null;
}

/** Recover source scope from saved compact workspaces whose scope state is old. */
export function inferMaterializedSourceLessonFilter(courseMap, deliverables, explicitSourceFilter = null) {
  const lessons = Array.isArray(courseMap?.lessons) ? courseMap.lessons : [];
  if (lessons.length === 0) return explicitSourceFilter;
  if (
    Array.isArray(explicitSourceFilter) &&
    explicitSourceFilter.length === lessons.length &&
    explicitSourceFilter.some((index) => index >= lessons.length)
  ) {
    return explicitSourceFilter;
  }

  const sourceIndices = lessons.map((lesson, lessonIndex) => {
    const candidates = [itemLessonNumber(lesson)];
    for (const entry of Object.values(deliverables || {})) {
      const data = entry?.data;
      if (!data || typeof data !== 'object') continue;
      for (const items of Object.values(data).filter(Array.isArray)) {
        candidates.push(itemLessonNumber(items?.[lessonIndex]));
      }
    }
    const numbers = candidates.filter(Number.isInteger);
    const sourceNumber = numbers.find((number) => number > lessons.length) || numbers[0] || lessonIndex + 1;
    return sourceNumber - 1;
  });
  return sourceIndices.some((index, position) => index !== position) ? sourceIndices : explicitSourceFilter;
}

/**
 * Prepare one canonical view of a generated workspace before readiness,
 * repair, export verification, and deep grading. This keeps every package
 * gate on the same source identity while still using compact array indices.
 */
export function prepareMaterializedPackageScope({
  courseMap,
  deliverables = {},
  lessonFilter = null,
  explicitSourceFilter = null,
} = {}) {
  const inferredSourceFilter = inferMaterializedSourceLessonFilter(courseMap, deliverables, explicitSourceFilter);
  const sourceLessonFilter = resolveMaterializedSourceLessonFilter(courseMap, lessonFilter, inferredSourceFilter);
  const preparedCourseMap = preserveMaterializedLessonNumbers(courseMap, sourceLessonFilter);
  const preparedDeliverables = Array.isArray(sourceLessonFilter)
    ? Object.fromEntries(
        Object.entries(deliverables).map(([featureId, entry]) => {
          if (entry?.status !== 'done' || !entry.data) return [featureId, entry];
          const arrayKey = getArrayKey(featureId, entry.data);
          const data = preserveDeliverableLessonNumbers(entry.data, arrayKey, sourceLessonFilter, preparedCourseMap);
          return [featureId, data === entry.data ? entry : { ...entry, data }];
        }),
      )
    : deliverables;

  return {
    courseMap: preparedCourseMap,
    deliverables: preparedDeliverables,
    sourceLessonFilter,
    effectiveLessonFilter: remapLessonFilterToMaterializedScope(preparedCourseMap, sourceLessonFilter),
  };
}
