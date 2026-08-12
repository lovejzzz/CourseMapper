import { cleanText, stripLessonPrefix } from './compilerText.js';

function objectiveValues(value) {
  if (Array.isArray(value)) return value.flatMap(objectiveValues);
  return String(value || '')
    .split(/\n+/)
    .map(cleanText)
    .filter(Boolean);
}

export function declaredLessonObjectives(lesson = {}) {
  const values = [
    lesson?.learningObjectives,
    lesson?.objectives,
    ...(Array.isArray(lesson?.sections)
      ? lesson.sections.flatMap((section) => [section?.learningObjectives, section?.objectives])
      : []),
  ].flatMap(objectiveValues);
  return [...new Set(values)];
}

export function stableLessonContractObjective(lesson = {}) {
  const focus = stripLessonPrefix(cleanText(lesson?.title || lesson?.topic || 'this lesson')) || 'this lesson';
  const variants = [
    `Apply ${focus} to one concrete case, then use evidence to revise the initial explanation.`,
    `Use ${focus} to solve a bounded course problem and document how evidence changed one decision.`,
    `Analyze one ${focus} example, defend the interpretation with evidence, and record a targeted revision.`,
    `Test ${focus} against a practical case, name the deciding evidence, and improve the first response.`,
    `Build an evidence-backed ${focus} application, identify one limitation, and revise accordingly.`,
    `Compare two possible readings of ${focus}, justify the stronger one, and document the revision.`,
    `Apply ${focus} to an unfamiliar example, trace the evidence path, and refine the conclusion.`,
    `Produce a ${focus} analysis whose evidence, boundary, and revision are visible.`,
  ];
  const seed = [...focus].reduce(
    (hash, character) => Math.imul(hash ^ character.codePointAt(0), 16777619) >>> 0,
    2166136261,
  );
  return variants[seed % variants.length];
}

export function lessonContractObjectives(lesson = {}) {
  const declared = declaredLessonObjectives(lesson);
  return declared.length > 0 ? declared : [stableLessonContractObjective(lesson)];
}
