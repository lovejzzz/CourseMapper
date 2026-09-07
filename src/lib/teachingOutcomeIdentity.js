import { canonicalJson } from './canonicalJson.js';
import { sha256HexSync } from './sha256Sync.js';

/** The prose map can regenerate ordinal IDs. For explicitly linked targets,
 * preserve an unambiguous unchanged outcome and never recycle its ID for a
 * different outcome. Ambiguous/deleted targets remain unresolved for review. */
export function preserveTeachingOutcomeIds(oldGraph, graph) {
  const reserved = new Set(
    [...(oldGraph?.teachingProgram?.tasks || []), ...(graph?.teachingProgram?.tasks || [])].flatMap((task) =>
      (task.operationPlan?.goalAlignment?.targets || []).map((target) => target.outcomeRef),
    ),
  );
  if (!reserved.size) return graph;
  function indexed(input) {
    const sessions = new Map((input.sessions || []).map((session) => [session.id, session]));
    const keys = new Map(),
      groups = new Map();
    for (const outcome of input.outcomes || []) {
      const session = sessions.get(outcome.sessionRef);
      const key = canonicalJson({
        text: outcome.text,
        label: outcome.label || '',
        level: outcome.level || '',
        lesson: session ? { number: session.number, title: session.title } : null,
      });
      keys.set(outcome.id, key);
      groups.set(key, [...(groups.get(key) || []), outcome]);
    }
    return { keys, groups };
  }
  const before = indexed(oldGraph),
    after = indexed(graph);
  const occupied = new Set(
    ['sessions', 'concepts', 'assessments', 'resources', 'readings'].flatMap((key) =>
      (graph[key] || []).map((entry) => entry.id),
    ),
  );
  const remap = new Map();
  for (const id of reserved) {
    const key = before.keys.get(id);
    const matches = after.groups.get(key) || [];
    if (before.groups.get(key)?.length !== 1 || matches.length !== 1 || occupied.has(id)) continue;
    remap.set(matches[0].id, id);
    occupied.add(id);
  }
  for (const outcome of graph.outcomes || []) {
    if (remap.has(outcome.id)) continue;
    let id = outcome.id;
    if (reserved.has(id) || occupied.has(id)) {
      const base = `${id}-review-${sha256HexSync(after.keys.get(outcome.id)).slice(0, 10)}`;
      id = base;
      for (let suffix = 2; occupied.has(id) || reserved.has(id); suffix++) id = `${base}-${suffix}`;
    }
    remap.set(outcome.id, id);
    occupied.add(id);
  }
  const resolve = (id) => remap.get(id) || id;
  for (const outcome of graph.outcomes || []) outcome.id = resolve(outcome.id);
  for (const session of graph.sessions || [])
    for (const section of session.sections || [])
      if (section.objectiveRefs) section.objectiveRefs = section.objectiveRefs.map(resolve);
  for (const edge of graph.edges?.assesses || []) edge.to = resolve(edge.to);
  for (const edge of graph.edges?.practicedIn || []) edge.from = resolve(edge.from);
  for (const edge of graph.edges?.requires || []) {
    edge.from = resolve(edge.from);
    edge.to = resolve(edge.to);
  }
  return graph;
}
