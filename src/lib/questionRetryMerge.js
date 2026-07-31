import { getArrayKey } from './syncDependencies';
import { resolveDeliverableLessonNumber } from './materializedLessonScope';

function getQuestionCount(item) {
  const questions = Array.isArray(item?.questions) ? item.questions : Array.isArray(item?.qs) ? item.qs : [];
  return questions.length;
}

function getLessonKey(item) {
  const lessonNumber = resolveDeliverableLessonNumber(item);
  return lessonNumber ? `lesson_${lessonNumber}` : '';
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

  nextItems.sort((left, right) => {
    const leftNumber = resolveDeliverableLessonNumber(left);
    const rightNumber = resolveDeliverableLessonNumber(right);
    if (leftNumber && rightNumber) return leftNumber - rightNumber;
    if (leftNumber) return -1;
    if (rightNumber) return 1;
    return 0;
  });
  return { ...cleanedBaseline, [arrayKey]: nextItems };
}
