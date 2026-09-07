import { deriveCourseGraphFromCourseMap } from './courseGraph/deriveFromCourseMap.js';
import { validateCourseGraph } from './courseGraph/schema.js';
import { quarantineInvalidInstructionalPlanLineage } from './instructionalPlanLineage.js';
import { reconcileTeachingGoalReview } from './teachingGoalReview.js';

/** A known grid-cell edit can update the existing outcomes directly. Do not
 * infer target identity from a freshly rebuilt course's ordinal IDs. This
 * transaction owns linked targets; unlinked legacy cells retain their editor.
 */
export function editLinkedTeachingGoal({ courseMap, courseGraph, deliverables, lessonIdx, sectionIdx, newValue }) {
  const session = courseGraph?.sessions?.find((entry) => entry.number === lessonIdx + 1);
  const section = session?.sections?.[sectionIdx];
  const oldIds = section?.objectiveRefs || [];
  const linked = (courseGraph?.teachingProgram?.tasks || []).some((task) =>
    (task.operationPlan?.goalAlignment?.targets || []).some((target) => oldIds.includes(target.outcomeRef)),
  );
  if (!linked) return null;
  const rejected = (message) => ({ status: 'needs-review', message });
  if (typeof newValue !== 'string' || !courseMap?.lessons?.[lessonIdx]?.sections?.[sectionIdx])
    return rejected('This learning-target edit needs a current course section.');
  const old = oldIds.map((id) => courseGraph.outcomes.find((outcome) => outcome.id === id));
  if (old.some((outcome) => !outcome)) return rejected('A learning target is missing. Review this section first.');
  const parsed = deriveCourseGraphFromCourseMap({
    courseName: courseMap.courseName,
    lessons: [{ title: session.title, sections: [{ learningObjectives: newValue }] }],
  }).outcomes;
  const key = (outcome) => JSON.stringify([outcome.text, outcome.label || '']);
  const matches = new Map();
  for (const outcome of parsed) {
    const previous = old.filter((entry) => key(entry) === key(outcome));
    if (previous.length === 1 && parsed.filter((entry) => key(entry) === key(outcome)).length === 1)
      matches.set(outcome, previous[0]);
  }
  const unmatchedOld = old.filter((entry) => ![...matches.values()].includes(entry));
  const unmatchedNew = parsed.filter((entry) => !matches.has(entry));
  // An explicit replacement of one remaining target preserves its identity.
  // Multiple unmatched lines are ambiguous; never bind old tasks by position.
  if (unmatchedOld.length === 1 && unmatchedNew.length === 1) matches.set(unmatchedNew[0], unmatchedOld[0]);
  const nextOutcomes = parsed.map((outcome) => ({
    ...matches.get(outcome),
    ...outcome,
    id: matches.get(outcome)?.id || `outcome-${crypto.randomUUID()}`,
    sessionRef: session.id,
  }));
  const changedIds = old
    .filter((outcome) => !nextOutcomes.some((entry) => entry.id === outcome.id && key(entry) === key(outcome)))
    .map((outcome) => outcome.id);
  const shared = courseGraph.sessions.some((entry) =>
    entry.sections.some(
      (other) => other.id !== section.id && (other.objectiveRefs || []).some((id) => changedIds.includes(id)),
    ),
  );
  if (shared) return rejected('This target is shared by another section. Review both sections before changing it.');
  const removedIds = oldIds.filter((id) => !nextOutcomes.some((outcome) => outcome.id === id));
  if (
    (courseGraph.edges?.requires || []).some((edge) => removedIds.includes(edge.from) || removedIds.includes(edge.to))
  )
    return rejected('A removed target is still used by a prerequisite. Review that relationship before removing it.');
  const graph = structuredClone(courseGraph);
  const targetSection = graph.sessions.find((entry) => entry.id === session.id).sections[sectionIdx];
  graph.outcomes = graph.outcomes.flatMap((outcome) =>
    outcome.id === oldIds[0] ? nextOutcomes : oldIds.includes(outcome.id) ? [] : [outcome],
  );
  targetSection.objectiveRefs = nextOutcomes.map((outcome) => outcome.id);
  if (targetSection.overrides) delete targetSection.overrides.learningObjectives;
  graph.edges.assesses = graph.edges.assesses.filter((edge) => !removedIds.includes(edge.to));
  graph.edges.practicedIn = graph.edges.practicedIn.filter((edge) => !removedIds.includes(edge.from));
  for (const outcome of nextOutcomes) {
    if (oldIds.includes(outcome.id)) continue;
    graph.edges.practicedIn.push({ from: outcome.id, to: session.id });
    for (const assessmentId of targetSection.assessmentRefs || [])
      graph.edges.assesses.push({ from: assessmentId, to: outcome.id });
  }
  quarantineInvalidInstructionalPlanLineage(graph);
  const valid = validateCourseGraph(graph);
  if (!valid.valid) return rejected(valid.issues.map((issue) => issue.message).join(' '));
  const map = structuredClone(courseMap);
  map.lessons[lessonIdx].sections[sectionIdx].learningObjectives = newValue;
  const reviewed = reconcileTeachingGoalReview(deliverables, map, graph);
  const changed = Object.fromEntries(Object.entries(reviewed).filter(([id, entry]) => entry !== deliverables[id]));
  return {
    status: 'applied',
    courseMap: map,
    courseGraph: graph,
    changed,
    before: Object.fromEntries(Object.keys(changed).map((id) => [id, { data: deliverables[id].data }])),
  };
}
