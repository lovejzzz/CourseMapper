import { getArrayKey } from './syncDependencies';

export function getCourseFaqQuestionTarget(config = {}) {
  const raw = Number(config?.questionsPerLesson);
  if (!Number.isFinite(raw)) return 5;
  return Math.max(3, Math.min(8, Math.round(raw)));
}

export function normalizeCourseFaqQuestionCounts(data, config = {}) {
  const arrayKey = getArrayKey('courseFaq', data) || (data?.faqs ? 'faqs' : data?.courseFaq ? 'courseFaq' : null);
  const lessons = arrayKey ? data?.[arrayKey] : null;
  const target = getCourseFaqQuestionTarget(config);

  if (!Array.isArray(lessons) || lessons.length === 0) {
    return { data, arrayKey, target, trimmedQuestions: 0, underfilledIndices: [] };
  }

  let trimmedQuestions = 0;
  const underfilledIndices = [];
  const nextLessons = lessons.map((lesson, index) => {
    const questions = Array.isArray(lesson?.questions) ? lesson.questions : [];
    if (questions.length > target) {
      trimmedQuestions += questions.length - target;
      return { ...lesson, questions: questions.slice(0, target) };
    }
    if (questions.length > 0 && questions.length < target) {
      underfilledIndices.push(index);
    }
    return lesson;
  });

  const changed = trimmedQuestions > 0;
  return {
    data: changed ? { ...data, [arrayKey]: nextLessons } : data,
    arrayKey,
    target,
    trimmedQuestions,
    underfilledIndices,
  };
}
