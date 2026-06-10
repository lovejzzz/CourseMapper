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

// v0.9.11 P3b: columns the compiler derives deterministically in lean mode —
// the model is not asked for them at all. evaluateDesign is rendered from the
// section's actual objective/assessment/activity mapping (computed alignment
// instead of asserted alignment); presentationFormat and technologyNeeded
// decode from the activity atoms, plus the optional specialTools escape hatch
// for syllabus-named software/equipment.
export const COMPILER_OWNED_LEAN_KEYS = ['evaluateDesign', 'presentationFormat', 'technologyNeeded'];

export const LEAN_SPECIAL_TOOLS_DEF =
  'OPTIONAL array of tool names ONLY when the syllabus explicitly names concrete software/equipment for this section (e.g., "SPSS", "ArcGIS", "Logic Pro"). Omit the key otherwise.';

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
  // specialTools stays an atom array — deriveCompilerOwnedColumns consumes it.
  if (key === 'specialTools') return value;
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

// ════════════════════════════════════════════════════════════════════════════
// Compiler-owned columns (v0.9.11 P3b)
//
// In lean mode the model is not asked for evaluateDesign, presentationFormat,
// or technologyNeeded. These derivations fill the cells deterministically from
// the section's own content. evaluateDesign cites the section's actual
// objective verbs, assessment, and activity — computed alignment, not asserted
// prose. Idempotent: cells that already have content are never overwritten.
// ════════════════════════════════════════════════════════════════════════════

function hasCellContent(value) {
  return typeof value === 'string' && value.trim().length >= 3;
}

function cellLines(value) {
  if (Array.isArray(value)) return value.map(cleanAtom).filter(Boolean);
  return String(value ?? '')
    .split('\n')
    .map((line) =>
      line
        .replace(/^\s*\d+[a-z]?[.):]\s*/i, '')
        .replace(/^[-•]\s*/, '')
        .trim(),
    )
    .filter(Boolean);
}

function clipPhrase(text, maxWords = 9) {
  return cleanAtom(text)
    .split(/\s+/)
    .slice(0, maxWords)
    .join(' ')
    .replace(/[.,;:]+$/, '');
}

function objectiveVerbs(objectivesCell) {
  const verbs = [];
  for (const line of cellLines(objectivesCell)) {
    if (/^students will be able to/i.test(line)) continue;
    const match = line.replace(/^\d+[a-z]?\.\s*/i, '').match(/^([a-z]+)\b/i);
    if (!match) continue;
    const verb = match[1].toLowerCase();
    if (verb.length > 2 && !verbs.includes(verb)) verbs.push(verb);
    if (verbs.length >= 3) break;
  }
  return verbs;
}

function verbListText(verbs) {
  if (verbs.length === 0) return 'apply the section content';
  if (verbs.length === 1) return verbs[0];
  return `${verbs.slice(0, -1).join(', ')} and ${verbs[verbs.length - 1]}`;
}

function assessmentLabel(section) {
  const first = cellLines(section.weeklyAssessments)[0] || '';
  const label = clipPhrase(first.split(':')[0] || '', 5);
  return label ? `the ${label.toLowerCase()}` : 'the weekly assessment';
}

function activityLabel(section) {
  const first = cellLines(section.syncActivities)[0] || cellLines(section.asyncActivities)[0] || '';
  if (!first) return 'the weekly activities';
  const [head, ...rest] = first.split(':');
  const focus = clipPhrase(rest.join(':'), 6);
  const verb = clipPhrase(head, 4).toLowerCase();
  return focus ? `the ${verb} on ${focus.toLowerCase()}` : `the ${verb}`;
}

function derivePresentationFormat(section, lessonIndex) {
  const sync = cellLines(section.syncActivities).join(' ').toLowerCase();
  const async = cellLines(section.asyncActivities).join(' ').toLowerCase();
  const assessments = cellLines(section.weeklyAssessments).join(' ').toLowerCase();
  if (/\b(lab|workshop|simulation|hands-on|studio|practice session)\b/.test(sync)) {
    return 'Workshop + guided practice';
  }
  if (/\b(case|scenario)\b/.test(sync)) return 'Case discussion + applied analysis';
  if (/\b(present|critique|peer review|showcase|pitch)\b/.test(sync)) return 'Presentation + peer critique';
  if (/\b(debate|discussion|seminar)\b/.test(sync)) {
    return /\bread\b/.test(async) ? 'Interactive seminar + reading' : 'Interactive seminar + discussion';
  }
  if (/\b(watch|video|screencast|lecture)\b/.test(async)) {
    return /\bquiz\b/.test(assessments) ? 'Video lecture + quiz' : 'Video lecture + discussion';
  }
  const fallbacks = ['Interactive lecture + discussion', 'Guided practice + debrief', 'Seminar + applied exercise'];
  return fallbacks[lessonIndex % fallbacks.length];
}

function deriveTechnologyNeeded(section) {
  const sync = cellLines(section.syncActivities).join(' ');
  const combined = [
    sync,
    cellLines(section.asyncActivities).join(' '),
    cellLines(section.weeklyAssessments).join(' '),
  ].join(' ');
  const tools = ['LMS (readings, submissions, announcements)'];
  if (sync.trim()) tools.push('Video conferencing (synchronous session)');
  if (/\b(group|collaborat\w*|peer|team)\b/i.test(combined)) tools.push('Shared documents (group work)');
  if (/\b(video|watch|screencast|documentary)\b/i.test(combined)) {
    tools.push('Streaming video platform (assigned media)');
  }
  // v0.10.1 (live-run audit): lab courses derived only LMS + video — surface
  // the bench reality when activities are clearly laboratory work.
  if (
    /\b(lab|laboratory|experiment\w*|titration|spectroscop\w+|chromatograph\w+|microscop\w+|synthesis|reagent|specimen|dissect\w+|assay|recrystalliz\w+)\b/i.test(
      combined,
    )
  ) {
    tools.push('Laboratory equipment and instrumentation (see experiment list)');
  }
  for (const tool of cellLines(section.specialTools)) {
    if (!tools.some((existing) => existing.toLowerCase().startsWith(tool.toLowerCase()))) tools.push(tool);
  }
  return tools.map((tool, index) => `${index + 1}. ${tool}`).join('\n');
}

const EVALUATE_DESIGN_TEMPLATES = [
  (verbs, assessment, activity) =>
    `Objectives ask students to ${verbs}; ${assessment} measures that directly, and ${activity} provides structured practice beforehand. The objective-activity-assessment chain is intact for this section.`,
  (verbs, assessment, activity) =>
    `${assessment.charAt(0).toUpperCase()}${assessment.slice(1)} is the evidence for the stated objectives (${verbs}), with ${activity} building the underlying skill first. Each objective here has a matching activity and assessment.`,
  (verbs, assessment, activity) =>
    `Alignment check: ${activity} rehearses what ${assessment} grades, and both trace back to objectives that ${verbs}. No orphan objectives or unassessed activities in this section.`,
  (verbs, assessment, activity) =>
    `This section's objectives (${verbs}) drive both ${activity} and ${assessment}; practice precedes evidence, and the assessment measures the same verbs the objectives state.`,
];

function deriveEvaluateDesign(section, lessonIndex) {
  const template = EVALUATE_DESIGN_TEMPLATES[lessonIndex % EVALUATE_DESIGN_TEMPLATES.length];
  return template(
    verbListText(objectiveVerbs(section.learningObjectives)),
    assessmentLabel(section),
    activityLabel(section),
  );
}

export function deriveCompilerOwnedColumns(courseMap) {
  if (!courseMap || !Array.isArray(courseMap.lessons)) return courseMap;
  let changed = false;
  const lessons = courseMap.lessons.map((lesson, lessonIndex) => {
    if (!lesson || !Array.isArray(lesson.sections)) return lesson;
    const derivedKeys = new Set(Array.isArray(lesson.compilerDerived) ? lesson.compilerDerived : []);
    let lessonChanged = false;
    const sections = lesson.sections.map((section) => {
      if (!section || typeof section !== 'object') return section;
      const next = { ...section };
      let sectionChanged = false;
      if (!hasCellContent(next.presentationFormat)) {
        next.presentationFormat = derivePresentationFormat(next, lessonIndex);
        derivedKeys.add('presentationFormat');
        sectionChanged = true;
      }
      if (!hasCellContent(next.technologyNeeded)) {
        next.technologyNeeded = deriveTechnologyNeeded(next);
        derivedKeys.add('technologyNeeded');
        sectionChanged = true;
      }
      if (!hasCellContent(next.evaluateDesign)) {
        next.evaluateDesign = deriveEvaluateDesign(next, lessonIndex);
        derivedKeys.add('evaluateDesign');
        sectionChanged = true;
      }
      if ('specialTools' in next) {
        delete next.specialTools;
        sectionChanged = true;
      }
      if (sectionChanged) {
        lessonChanged = true;
        return next;
      }
      return section;
    });
    if (!lessonChanged) return lesson;
    changed = true;
    return derivedKeys.size > 0
      ? { ...lesson, sections, compilerDerived: [...derivedKeys].sort() }
      : { ...lesson, sections };
  });
  return changed ? { ...courseMap, lessons } : courseMap;
}
