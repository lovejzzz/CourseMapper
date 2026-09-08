// Diagnostic capture helpers. No product grader or reference answers are used.
import { FEATURES, classroomSurface } from './classroomBenchmark.mjs';

export function productInput(input) {
  if (!input || Object.keys(input).some((key) => !['request', 'objective', 'sources'].includes(key)))
    throw new Error('Only the frozen product input contract is permitted.');
  if (
    typeof input.request !== 'string' ||
    !input.request.trim() ||
    typeof input.objective !== 'string' ||
    !input.objective.trim() ||
    !Array.isArray(input.sources) ||
    !input.sources.length
  )
    throw new Error('Missing request, objective, or source records.');
  const ids = new Set();
  const sources = input.sources.map((source) => {
    if (
      !source ||
      Object.keys(source).some((key) => !['id', 'text'].includes(key)) ||
      typeof source.id !== 'string' ||
      !source.id.trim() ||
      ids.has(source.id) ||
      typeof source.text !== 'string' ||
      !source.text.trim()
    )
      throw new Error('Invalid or duplicate source record.');
    ids.add(source.id);
    return { id: source.id, text: source.text };
  });
  return { request: input.request, objective: input.objective, sources };
}

export function compilerArguments(input) {
  const safe = productInput(input);
  return {
    map: {
      courseName: safe.request,
      lessons: [
        {
          title: safe.request,
          sections: [
            {
              topicSection: safe.request,
              learningObjectives: safe.objective,
              weeklyAssessments: safe.request,
            },
          ],
        },
      ],
    },
    options: {
      sourceBrief: `${safe.request}\nLearning objective: ${safe.objective}\nSources:\n${safe.sources.map((s) => `[${s.id}] ${s.text}`).join('\n')}`,
      instructorProvidedFacts: safe.sources.map((s) => s.text),
    },
  };
}

const hasText = (value) =>
  typeof value === 'string'
    ? Boolean(value.trim())
    : Array.isArray(value)
      ? value.some(hasText)
      : value && typeof value === 'object'
        ? Object.values(value).some(hasText)
        : false;

export function inspectCapture({ outputs, tasks, error = null }) {
  const failures = error ? [{ code: 'compiler-exception', detail: error }] : [];
  const materials = Object.fromEntries(
    FEATURES.map((feature) => {
      const surface = classroomSurface(feature, outputs?.[feature]);
      const present = hasText(surface);
      if (!present) failures.push({ code: 'missing-material-surface', feature });
      return [
        feature,
        {
          surfacePresent: present,
          // Presence is never educational acceptance, even if the product says ready.
          evidenceAndAnswers: 'pending',
          taskExecutability: 'pending',
          teachingAlignment: 'pending',
          scoringAndFeedback: 'pending',
          expressionBurden: 'pending',
          layout: 'pending',
          editability: 'pending',
        },
      ];
    }),
  );
  const taskCount = Array.isArray(tasks) ? tasks.length : 0;
  return {
    taskCount,
    sharedTaskStatus: taskCount ? 'requires-review' : 'not-formed',
    failures,
    materials,
    educationalAcceptance: 'pending',
    // This source-only probe does not execute any complete protocol path.
    protocolCompletion: 'not-measured',
  };
}
