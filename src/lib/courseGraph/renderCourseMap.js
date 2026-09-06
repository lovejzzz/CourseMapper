/**
 * courseGraph/renderCourseMap.js — v0.13 P0: the course map as a RENDER.
 *
 * Deterministically projects a CourseGraph into the course-map shape every
 * existing consumer understands (preview grid, XLSX export, blueprint
 * compiler). All cell-rendering rules live here — numbering, stem policy
 * (no stems in cells, per v0.12.1), single-value joins — by reusing the
 * lean expander, so render output is already canonical and the readiness
 * repair pass finds nothing to fix.
 *
 * `section.overrides[key]` (manual edits that defeat parsing) win verbatim
 * over entity rendering — never silently re-inferred.
 */

import { expandLeanSectionField } from '../leanCourseMap.js';

function cleanText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function withLabel(label, text) {
  return label ? `${label}. ${text}` : text;
}

function stripLessonPrefix(value) {
  return cleanText(value).replace(/^(?:lesson|week)\s*\d+\s*[:.-]\s*/i, '');
}

function stripSectionPrefix(value) {
  return cleanText(value).replace(/^\d+(?:\.\d+)*\s*[:.)-]\s*/, '');
}

function isGenericSessionPhrase(value, session) {
  const text = stripSectionPrefix(stripLessonPrefix(value)).toLowerCase();
  if (!text) return true;
  const number = Number(session?.number) || 0;
  const generic = [
    number > 0 ? `session ${number}` : '',
    number > 0 ? `topic ${number}` : '',
    number > 0 ? `lesson ${number}` : '',
    'session',
    'topic',
    'lesson',
  ].filter(Boolean);
  return generic.includes(text);
}

function payloadTermText(term) {
  if (typeof term === 'string') return cleanText(term);
  return cleanText(term?.term || term?.label || term?.name || term?.title || term?.t);
}

function titleCaseFocus(value) {
  const text = cleanText(value);
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function joinFocusTerms(terms) {
  const unique = [];
  const seen = new Set();
  for (const term of terms.map(payloadTermText)) {
    if (!term || /^session\s+\d+$/i.test(term)) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(term);
    if (unique.length >= 3) break;
  }
  if (unique.length === 0) return '';
  if (unique.length === 1) return titleCaseFocus(unique[0]);
  if (unique.length === 2) return `${titleCaseFocus(unique[0])} and ${unique[1]}`;
  return `${titleCaseFocus(unique[0])}, ${unique[1]}, and ${unique[2]}`;
}

function lessonContentForSession(graph, session) {
  const content = graph?.enrichmentOverlay?.lessonContent;
  if (!content || typeof content !== 'object') return null;
  const byNumber = Number.isInteger(session?.number) ? content[`lesson-${session.number}`] : null;
  return byNumber || content?.[session?.id] || null;
}

function lessonFocusFromKernel(graph, session) {
  const payload = lessonContentForSession(graph, session);
  if (!payload || typeof payload !== 'object') return '';
  const explicit = cleanText(payload.title || payload.topic || payload.focus || payload.kernel?.topic);
  if (explicit && !isGenericSessionPhrase(explicit, session)) return titleCaseFocus(stripLessonPrefix(explicit));
  const terms = joinFocusTerms(payload.keyTerms || payload.kt || []);
  if (terms) return terms;
  const slideTitle = cleanText((payload.slideContent || payload.slides || [])[0]?.title);
  if (slideTitle && !isGenericSessionPhrase(slideTitle, session)) {
    return titleCaseFocus(stripLessonPrefix(slideTitle).replace(/[.!?]\s*$/, ''));
  }
  return '';
}

function replaceGenericSessionReferences(value, session, focus) {
  if (!focus || typeof value !== 'string') return value;
  const number = Number(session?.number) || 0;
  if (number <= 0) return value;
  return value.replace(new RegExp(`\\bSession\\s*${number}\\b`, 'gi'), focus);
}

function renderTopicWithKernelFocus(value, session, focus) {
  if (!focus || !isGenericSessionPhrase(value, session)) return replaceGenericSessionReferences(value, session, focus);
  const text = cleanText(value);
  const prefix = text.match(/^(\d+(?:\.\d+)*\s*[:.)-]\s*)/)?.[1] || '';
  return `${prefix}${focus}`;
}

function renderSessionTitle(graph, session) {
  const focus = lessonFocusFromKernel(graph, session);
  if (focus && isGenericSessionPhrase(session?.title, session)) {
    return `Lesson ${session?.number || ''}: ${focus}`.replace(/\s+:/, ':').trim();
  }
  return session.title;
}

// v0.14.1 (3.3a): the deliverable reference each graded registry entry
// renders after its title — the map cell becomes an index into the package.
// In-class items render plain (they live inside the session, not in a file).
// The canonical (compile/round-trip) render omits these; deriveFromCourseMap
// strips them back out of displayed maps.
function assessmentReferenceSuffix(assessment) {
  const kind = assessment?.kind;
  if (kind === 'exam') return ' → Quiz & Exam Bank';
  if (kind === 'graded-artifact' || kind === 'oral') {
    const lesson = Number.isInteger(assessment?.dueSession) ? assessment.dueSession : 0;
    return lesson > 0 ? ` → Assignment Briefs / Lesson ${String(lesson).padStart(2, '0')}` : ' → Assignment Briefs';
  }
  return '';
}

function renderSection(graph, session, section, options = {}) {
  const outcomesById = new Map(graph.outcomes.map((outcome) => [outcome.id, outcome]));
  const assessmentsById = new Map(graph.assessments.map((assessment) => [assessment.id, assessment]));
  const resourcesById = new Map(graph.resources.map((resource) => [resource.id, resource]));
  const readingsById = new Map((graph.readings || []).map((reading) => [reading.id, reading]));
  const focus = lessonFocusFromKernel(graph, session);

  const objectiveAtoms = (section.objectiveRefs || [])
    .map((id) => outcomesById.get(id))
    .filter(Boolean)
    .map((outcome) => withLabel(outcome.label, outcome.text));
  const assessmentAtoms = (section.assessmentRefs || [])
    .map((id) => assessmentsById.get(id))
    .filter(Boolean)
    .map((assessment) =>
      withLabel(
        assessment.label,
        `${assessment.title}${options.assessmentReferences ? assessmentReferenceSuffix(assessment) : ''}`,
      ),
    );
  const resourceAtoms = (section.resourceRefs || [])
    .map((id) => resourcesById.get(id))
    .filter(Boolean)
    .map((resource) => resource.citation);

  // v0.14.5 (A2a): instructor-named registry readings render as the LEADING
  // supportingResources items, verbatim (the fusion lesson: no casing
  // surgery, no truncation), followed by the existing resource atoms with
  // identical entries deduped. The verbatim readings array ALSO rides the
  // rendered section so derive(render(graph)) reproduces the registry with
  // stable ids — the single source for the registry is section.readings.
  const readingTitles = (section.readingRefs || [])
    .map((id) => readingsById.get(id))
    .filter(Boolean)
    .map((reading) => reading.title);
  const readingTitleSet = new Set(readingTitles.map((title) => title.toLowerCase()));
  const dedupedResourceAtoms =
    readingTitleSet.size > 0
      ? resourceAtoms.filter((atom) => {
          const withoutListPrefix = String(atom).replace(/^\d+[.)]\s+/, '');
          return (
            !readingTitleSet.has(String(atom).toLowerCase()) && !readingTitleSet.has(withoutListPrefix.toLowerCase())
          );
        })
      : resourceAtoms;

  const rendered = {
    topicSection: renderTopicWithKernelFocus(section.topic || '', session, focus),
    learningGoals: expandLeanSectionField('learningGoals', section.goals || []),
    learningObjectives: expandLeanSectionField('learningObjectives', objectiveAtoms),
    weeklyAssessments: expandLeanSectionField('weeklyAssessments', assessmentAtoms),
    asyncActivities: expandLeanSectionField('asyncActivities', section.asyncActivities || []),
    syncActivities: expandLeanSectionField('syncActivities', section.syncActivities || []),
    supportingResources: expandLeanSectionField('supportingResources', [...readingTitles, ...dedupedResourceAtoms]),
    ...(readingTitles.length > 0 ? { readings: readingTitles } : {}),
    ...(section.extras && typeof section.extras === 'object' ? section.extras : {}),
  };

  if (focus) {
    for (const [key, value] of Object.entries(rendered)) {
      if (key === 'readings') continue;
      if (typeof value === 'string') rendered[key] = replaceGenericSessionReferences(value, session, focus);
    }
  }

  // Manual override layer: rendered verbatim, flagged by readiness — the
  // write-back editor stores free-text edits here when parsing would lose
  // information.
  for (const [key, value] of Object.entries(section.overrides || {})) {
    if (value !== undefined && value !== null && value !== '') rendered[key] = value;
  }

  // Drop empty string cells so the map matches the sparse shape consumers
  // expect (readiness distinguishes missing from empty).
  for (const [key, value] of Object.entries(rendered)) {
    if (value === '' || value === undefined || value === null) delete rendered[key];
  }
  return rendered;
}

/**
 * Deterministic CourseGraph → course map.
 *
 * `options.assessmentReferences` (v0.14.1 3.3a) renders the DISPLAY variant:
 * graded/exam/oral registry titles carry a "→ <deliverable>" suffix so the
 * visible map indexes the package. The default render stays canonical —
 * the compile path (blueprintFromGraph) and the derive↔render round trip
 * depend on suffix-free cells, and deriveFromCourseMap strips the suffix
 * when a displayed map is re-derived.
 */
export function renderCourseMapFromGraph(graph, options = {}) {
  if (!graph || typeof graph !== 'object') return null;
  const sessions = [...(graph.sessions || [])].sort((a, b) => (a.number || 0) - (b.number || 0));
  return {
    courseName: graph.course?.name || 'Untitled Course',
    ...(graph.course?.description ? { courseDescription: graph.course.description } : {}),
    ...(graph.course?.meta && typeof graph.course.meta === 'object' ? graph.course.meta : {}),
    lessons: sessions.map((session) => ({
      title: renderSessionTitle(graph, session),
      ...(session.teachingTaskLink ? { teachingTaskLink: structuredClone(session.teachingTaskLink) } : {}),
      sections: (session.sections || []).map((section) => renderSection(graph, session, section, options)),
    })),
  };
}
