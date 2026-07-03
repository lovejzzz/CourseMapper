// Dirty-subgraph marking — docs/TRELLIS.md §12/§5 (incremental
// regeneration, the cost model's biggest lever). A lesson is dirty when
// anything its authoring slice reads has changed: the lesson node itself,
// its concepts' content, its outcomes, or its neighbors' titles.

import { orderedLessons, conceptsForLesson } from './schema.mjs';

function sliceFingerprint(graph, lesson, index, ordered) {
  const concepts = conceptsForLesson(graph, lesson).map((c) => ({
    id: c.id,
    name: c.name,
    kernelFacts: c.kernelFacts,
    misconceptionIds: c.misconceptionIds,
  }));
  const misconceptions = graph.misconceptions
    .filter((m) => concepts.some((c) => c.id === m.conceptId))
    .map((m) => ({ id: m.id, statement: m.statement, corrective: m.corrective }));
  const outcomes = graph.outcomes.filter((o) => lesson.outcomeIds.includes(o.id));
  const assessments = graph.assessments
    .filter((a) => a.anchor.lessonId === lesson.id || a.anchor.week === lesson.week)
    .map((a) => ({ id: a.id, registryKey: a.registryKey, weightPct: a.weightPct }));
  return JSON.stringify({
    lesson: {
      title: lesson.title,
      week: lesson.week,
      session: lesson.session,
      introduces: lesson.introduces,
      reinforces: lesson.reinforces,
      outcomeIds: lesson.outcomeIds,
    },
    concepts,
    misconceptions,
    outcomes,
    assessments,
    neighbors: {
      prev: index > 0 ? ordered[index - 1].title : null,
      next: index < ordered.length - 1 ? ordered[index + 1].title : null,
    },
  });
}

export function dirtyLessons(graphBefore, graphAfter) {
  const beforeOrdered = orderedLessons(graphBefore);
  const afterOrdered = orderedLessons(graphAfter);
  const beforePrints = new Map(
    beforeOrdered.map((lesson, index) => [lesson.id, sliceFingerprint(graphBefore, lesson, index, beforeOrdered)]),
  );
  const dirty = [];
  const unchanged = [];
  afterOrdered.forEach((lesson, index) => {
    const now = sliceFingerprint(graphAfter, lesson, index, afterOrdered);
    if (beforePrints.get(lesson.id) === now) unchanged.push(lesson.id);
    else dirty.push(lesson.id);
  });
  return {
    dirty,
    unchanged,
    removed: beforeOrdered.filter((l) => !afterOrdered.some((a) => a.id === l.id)).map((l) => l.id),
  };
}
