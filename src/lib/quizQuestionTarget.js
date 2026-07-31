export const MIN_QUIZ_QUESTIONS_PER_LESSON = 3;
export const MAX_QUIZ_QUESTIONS_PER_LESSON = 8;
export const DEFAULT_QUIZ_QUESTIONS_PER_LESSON = 8;

/**
 * Resolve the one public quiz-count contract shared by prompting, deterministic
 * compilation, retry selection, post-processing, and readiness.
 */
export function resolveQuizQuestionTarget(value, fallback = DEFAULT_QUIZ_QUESTIONS_PER_LESSON) {
  const candidate = value && typeof value === 'object' && !Array.isArray(value) ? value.questionsPerLesson : value;
  const resolved = Number(candidate);
  const defaultValue = Number(fallback);
  const finite = Number.isFinite(resolved)
    ? resolved
    : Number.isFinite(defaultValue)
      ? defaultValue
      : DEFAULT_QUIZ_QUESTIONS_PER_LESSON;
  return Math.max(MIN_QUIZ_QUESTIONS_PER_LESSON, Math.min(MAX_QUIZ_QUESTIONS_PER_LESSON, Math.trunc(finite)));
}
