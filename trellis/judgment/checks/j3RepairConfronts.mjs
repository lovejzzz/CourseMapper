// J3 REPAIR_CONFRONTS — when a lesson's concept carries a documented
// misconception, at least one quiz explanation must confront the corrective
// (≥60% of the corrective's content tokens, or a verbatim 40-char quote).
import { finding } from '../../graph/validate.mjs';
import { tokenOverlapRatio } from '../text.mjs';
import { misconceptionsForConcept } from '../../graph/schema.mjs';

export function j3RepairConfronts(graph, authored) {
  const findings = [];
  for (const lesson of graph.lessons) {
    const art = authored[lesson.id];
    if (!art) continue;
    for (const conceptId of lesson.introduces) {
      for (const m of misconceptionsForConcept(graph, conceptId)) {
        const confronted = art.quizItems.some(
          (item) =>
            tokenOverlapRatio(m.corrective, item.explanation) >= 0.6 ||
            item.explanation.includes(m.corrective.slice(0, 40)),
        );
        if (!confronted) {
          findings.push(
            finding(
              'block',
              'J3_REPAIR_CONFRONTS',
              `authored/${lesson.id}`,
              `no quiz explanation confronts the corrective for "${m.statement.slice(0, 60)}…" — the feedback gate never clears`,
            ),
          );
        }
      }
    }
  }
  return findings;
}
