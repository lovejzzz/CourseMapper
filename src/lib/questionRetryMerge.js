import { getArrayKey } from './syncDependencies';

function getQuestionCount(item) {
  const questions = Array.isArray(item?.questions) ? item.questions : Array.isArray(item?.qs) ? item.qs : [];
  return questions.length;
}

function getLessonKey(item) {
  const numericIdentity =
    item?.lessonNumber ??
    item?.weekNumber ??
    (Number.isInteger(item?.lessonIndex) ? item.lessonIndex + 1 : null) ??
    (typeof item?.lesson === 'number' ? item.lesson : null) ??
    (typeof item?.week === 'number' ? item.week : null);
  if (Number.isInteger(numericIdentity) && numericIdentity > 0) return `lesson_${numericIdentity}`;
  const labels = [item?.lessonTitle, item?.lt, item?.title, item?.t, item?.lesson, item?.week, item?.wk, item?.name];
  for (const label of labels) {
    const match = String(label || '').match(/(?:Lesson|Week)\s*(\d+)/i);
    if (match) return `lesson_${match[1]}`;
  }
  return '';
}

/**
 * Merge quiz/FAQ retry output into an already-cleaned baseline.
 * Raw initial chunks are intentionally excluded so a failed retry cannot
 * resurrect artifacts removed by post-merge cleanup.
 */
export function mergeQuestionRetryResults(
  featureId,
  cleanedBaseline,
  retryResults = new Map(),
  { maxQuestions = 8, minItemWords = 30 } = {},
) {
  const arrayKey = getArrayKey(featureId, cleanedBaseline);
  const baselineItems = arrayKey && Array.isArray(cleanedBaseline?.[arrayKey]) ? cleanedBaseline[arrayKey] : [];
  if (!arrayKey) return cleanedBaseline;
  const questionCeiling = Math.max(featureId === 'courseFaq' ? 3 : 1, Math.min(8, Number(maxQuestions) || 8));

  const nextItems = [...baselineItems];
  const selectedIndexByKey = new Map();
  nextItems.forEach((item, index) => {
    const key = getLessonKey(item);
    if (key) selectedIndexByKey.set(key, index);
  });

  for (const [, retryData] of [...retryResults.entries()].sort((a, b) => a[0] - b[0])) {
    const retryArrayKey = getArrayKey(featureId, retryData);
    const retryItems = retryArrayKey && Array.isArray(retryData?.[retryArrayKey]) ? retryData[retryArrayKey] : [];
    for (const item of retryItems) {
      const wordCount = JSON.stringify(item || {})
        .split(/\s+/)
        .filter(Boolean).length;
      const questionCount = getQuestionCount(item);
      if (wordCount < minItemWords || questionCount < 1 || questionCount > questionCeiling) continue;

      const key = getLessonKey(item);
      if (!key) continue;
      const selectedIndex = selectedIndexByKey.get(key);
      if (selectedIndex == null) {
        selectedIndexByKey.set(key, nextItems.length);
        nextItems.push(item);
      } else if (questionCount > getQuestionCount(nextItems[selectedIndex])) {
        nextItems[selectedIndex] = item;
      }
    }
  }

  const numberedItems = nextItems.map((item) => getLessonKey(item).match(/^lesson_(\d+)$/));
  if (numberedItems.every(Boolean)) {
    nextItems.sort((left, right) => {
      const leftMatch = getLessonKey(left).match(/^lesson_(\d+)$/);
      const rightMatch = getLessonKey(right).match(/^lesson_(\d+)$/);
      return Number(leftMatch[1]) - Number(rightMatch[1]);
    });
  }
  return { ...cleanedBaseline, [arrayKey]: nextItems };
}
