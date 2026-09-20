import { canonical, clone, mergeThreeWay } from '../authoringCore/core.js';

// Stable lesson identities allow a revision in lesson two to coexist with a
// teacher edit in lesson one. Reorders, insertions and removals stay conflicts;
// nested assessment/outline arrays remain semantic units, never index-merged.
export function mergeReviewedLessons(base, current, proposed, path = '') {
  if (
    canonical(current) === canonical(base) ||
    canonical(proposed) === canonical(base) ||
    canonical(current) === canonical(proposed)
  )
    return mergeThreeWay(base, current, proposed, path);
  const lessonArray =
    path === '/courseMap/lessons' ||
    /^\/deliverables\/(lessonPlans\/plans|assignments\/assignments|rubrics\/rubrics)$/.test(path);
  if (lessonArray && [base, current, proposed].every(Array.isArray)) {
    const key = path === '/courseMap/lessons' ? 'id' : 'lessonId';
    const ids = base.map((item) => item?.[key]);
    if (
      ids.every((id) => typeof id === 'string' && id) &&
      new Set(ids).size === ids.length &&
      [current, proposed].every((items) => canonical(items.map((item) => item?.[key])) === canonical(ids))
    ) {
      const parts = ids.map((id, i) => mergeReviewedLessons(base[i], current[i], proposed[i], `${path}/${id}`));
      return { value: parts.map((p) => p.value), conflicts: parts.flatMap((p) => p.conflicts) };
    }
  }
  if ([base, current, proposed].every((v) => v && typeof v === 'object' && !Array.isArray(v))) {
    const value = {},
      conflicts = [];
    for (const key of new Set([...Object.keys(base), ...Object.keys(current), ...Object.keys(proposed)])) {
      const part = mergeReviewedLessons(base[key], current[key], proposed[key], `${path}/${key}`);
      if (part.value !== undefined) value[key] = clone(part.value);
      conflicts.push(...part.conflicts);
    }
    return { value, conflicts };
  }
  return mergeThreeWay(base, current, proposed, path);
}
