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

function withLabel(label, text) {
  return label ? `${label}. ${text}` : text;
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

function renderSection(graph, section, options = {}) {
  const outcomesById = new Map(graph.outcomes.map((outcome) => [outcome.id, outcome]));
  const assessmentsById = new Map(graph.assessments.map((assessment) => [assessment.id, assessment]));
  const resourcesById = new Map(graph.resources.map((resource) => [resource.id, resource]));

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

  const rendered = {
    topicSection: section.topic || '',
    learningGoals: expandLeanSectionField('learningGoals', section.goals || []),
    learningObjectives: expandLeanSectionField('learningObjectives', objectiveAtoms),
    weeklyAssessments: expandLeanSectionField('weeklyAssessments', assessmentAtoms),
    asyncActivities: expandLeanSectionField('asyncActivities', section.asyncActivities || []),
    syncActivities: expandLeanSectionField('syncActivities', section.syncActivities || []),
    supportingResources: expandLeanSectionField('supportingResources', resourceAtoms),
    ...(section.extras && typeof section.extras === 'object' ? section.extras : {}),
  };

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
      title: session.title,
      sections: (session.sections || []).map((section) => renderSection(graph, section, options)),
    })),
  };
}
