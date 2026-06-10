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

function renderSection(graph, section) {
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
    .map((assessment) => withLabel(assessment.label, assessment.title));
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

/** Deterministic CourseGraph → course map. */
export function renderCourseMapFromGraph(graph) {
  if (!graph || typeof graph !== 'object') return null;
  const sessions = [...(graph.sessions || [])].sort((a, b) => (a.number || 0) - (b.number || 0));
  return {
    courseName: graph.course?.name || 'Untitled Course',
    ...(graph.course?.description ? { courseDescription: graph.course.description } : {}),
    ...(graph.course?.meta && typeof graph.course.meta === 'object' ? graph.course.meta : {}),
    lessons: sessions.map((session) => ({
      title: session.title,
      sections: (session.sections || []).map((section) => renderSection(graph, section)),
    })),
  };
}
