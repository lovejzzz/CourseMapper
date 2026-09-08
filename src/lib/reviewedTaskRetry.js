import { readTeachingTaskSources } from './teachingProgram.js';
import { rebuildTeachingTaskSource } from './teachingTaskSource.js';

const compiledFeatures = new Set([
  'syllabus',
  'lessonPlans',
  'slideDecks',
  'assignments',
  'rubrics',
  'discussions',
  'quizBank',
  'studyGuides',
  'courseFaq',
]);

// Only an explicit retry with a complete, valid reviewed task in every
// requested lesson may reuse the existing teaching structure without a model.
export function reviewedTaskRetryOptions(courseMap, features, scopeIndices = null) {
  try {
    if (!Array.isArray(features) || !features.length || features.some((f) => !compiledFeatures.has(f))) return null;
    const lessons = courseMap?.lessons;
    if (!Array.isArray(lessons) || !lessons.length) return null;
    const indices = scopeIndices ?? lessons.map((_, i) => i);
    if (
      !Array.isArray(indices) ||
      !indices.length ||
      new Set(indices).size !== indices.length ||
      indices.some((i) => !Number.isInteger(i) || i < 0 || i >= lessons.length)
    )
      return null;
    const sources = readTeachingTaskSources(courseMap);
    if (
      !indices.every((i) =>
        sources.some(
          (source) =>
            source.lessonNumber === i + 1 &&
            source.scope === 'primary-task' &&
            source.operationPlan?.admission?.kind === 'teacher-confirmed' &&
            rebuildTeachingTaskSource(source),
        ),
      )
    )
      return null;
    return {
      mode: 'finalizerRetry',
      reviewedTaskRetry: true,
      maxProviderCalls: 0,
      useBlueprintCompiler: true,
      useBlueprintEnrichment: false,
    };
  } catch {
    return null;
  }
}
