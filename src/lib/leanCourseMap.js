/**
 * leanCourseMap.js — v0.8.6 lean course-map atoms (flag-gated)
 *
 * In lean mode the model emits compact atoms (arrays of terse phrases) instead
 * of instructor-facing prose, and this module deterministically renders the
 * standard course-map cell text the rest of the app expects. The downstream
 * contract (validators, blueprint compiler, UI, exports) is unchanged.
 *
 * Token effect: the repeated stems, numbering boilerplate, and full-sentence
 * scaffolding move from model output into compiler code.
 *
 * Enable with generationPlan.leanCourseMapAtoms === true. Expansion is
 * idempotent: string cells pass through untouched, so mixed or legacy model
 * output (and continuation chunks still on the verbose contract) stay safe.
 */

export const LEAN_COLUMN_DEFS = {
  learningGoals: 'Array of short goal phrases (no sentences). Order matters: goal 1, goal 2, ...',
  topicSection: 'One numbered subsection title string (e.g., "1.1: Historical Overview").',
  learningObjectives:
    'Array of measurable objective phrases, each starting with a Bloom\'s verb (e.g., "Analyze the impact of immigration policy on communities"). Prefix with goal references like "1a." / "2b." when there are multiple goals. NO stem sentence — the app adds "Students will be able to:" automatically.',
  weeklyAssessments:
    'Array of short assessment atoms, each "Type: focus" (e.g., "Reflection Paper: impact of policy on communities"). Each must map to an objective.',
  asyncActivities: 'Array of short activity atoms, each "Verb: object" (e.g., "Read: Chapter 5 on policy frameworks").',
  syncActivities: 'Array of short in-class activity atoms (e.g., "Debate: immigration policy impacts").',
  technologyNeeded: 'Array of tool atoms, each "Tool (purpose)" (e.g., "Zoom (synchronous session)").',
  presentationFormat: 'One short concrete delivery label string (e.g., "Case discussion"). Never empty.',
  supportingResources: 'Array of specific reading/resource citations extracted from the syllabus where available.',
  evaluateDesign: 'Array of 1-3 short self-check sentences on objective/assessment/activity alignment.',
};

const NUMBERED_LIST_KEYS = new Set([
  'weeklyAssessments',
  'asyncActivities',
  'syncActivities',
  'technologyNeeded',
  'supportingResources',
]);
const SINGLE_VALUE_KEYS = new Set(['topicSection', 'presentationFormat']);

export const LEAN_SYSTEM_ADDITION = `LEAN OUTPUT MODE (overrides any earlier prose-formatting rules):
- Return compact atoms, not instructor-facing prose. Most section fields are ARRAYS of short phrases.
- Do NOT write stem sentences ("Students will be able to:"), line numbering, or filler — the application renders those deterministically.
- Keep every atom specific to the lesson and the source materials. Terse but concrete beats long and generic.`;

function cleanAtom(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function atomList(value) {
  return (Array.isArray(value) ? value : [value]).map(cleanAtom).filter(Boolean);
}

function hasListPrefix(text) {
  return /^\d+[a-z]?[.):]\s/i.test(text) || /^[-•]\s/.test(text);
}

function renderNumberedLines(items) {
  return items.map((item, index) => (hasListPrefix(item) ? item : `${index + 1}. ${item}`)).join('\n');
}

function renderLearningGoals(items) {
  if (items.length <= 1) return items[0] || '';
  return renderNumberedLines(items);
}

function renderLearningObjectives(items) {
  if (items.length === 0) return '';
  const lines = items.map((item, index) => (hasListPrefix(item) ? item : `${index + 1}. ${item}`));
  return `Students will be able to:\n${lines.join('\n')}`;
}

export function expandLeanSectionField(key, value) {
  if (!Array.isArray(value)) return value;
  const items = atomList(value);
  if (key === 'learningObjectives') return renderLearningObjectives(items);
  if (key === 'learningGoals') return renderLearningGoals(items);
  if (key === 'evaluateDesign') return items.join(' ');
  if (SINGLE_VALUE_KEYS.has(key)) return items.join('; ');
  if (NUMBERED_LIST_KEYS.has(key)) return renderNumberedLines(items);
  // Custom columns default to numbered lines when the model sent atoms.
  return renderNumberedLines(items);
}

export function expandLeanCourseMap(courseMap) {
  if (!courseMap || !Array.isArray(courseMap.lessons)) return courseMap;
  let changed = false;
  const lessons = courseMap.lessons.map((lesson) => {
    if (!lesson || !Array.isArray(lesson.sections)) return lesson;
    let lessonChanged = false;
    const sections = lesson.sections.map((section) => {
      if (!section || typeof section !== 'object') return section;
      let sectionChanged = false;
      const next = {};
      for (const [key, value] of Object.entries(section)) {
        const expanded = expandLeanSectionField(key, value);
        if (expanded !== value) sectionChanged = true;
        next[key] = expanded;
      }
      if (sectionChanged) {
        lessonChanged = true;
        return next;
      }
      return section;
    });
    if (!lessonChanged) return lesson;
    changed = true;
    return { ...lesson, sections };
  });
  return changed ? { ...courseMap, lessons } : courseMap;
}

export function isLeanCourseMapEnabled(generationPlan) {
  return generationPlan?.leanCourseMapAtoms === true;
}
