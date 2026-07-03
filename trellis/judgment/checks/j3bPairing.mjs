// J3b PAIRING (roadmap 1.1) — the sim only credits repair when the item
// that CAUGHT the student also explains the fix. Any item whose distractor
// catches misconception M must have an explanation confronting M's
// corrective (J3's own overlap rule). Lesson-level confrontation (J3) is
// necessary but not sufficient; this is the item-level pairing.
import { finding } from '../../graph/validate.mjs';
import { misconceptionsForConcept } from '../../graph/schema.mjs';
import { tokenOverlapRatio } from '../text.mjs';
import { distractorCatches } from './j11Catch.mjs';

export function j3bPairing(graph, authored) {
  const findings = [];
  for (const lesson of graph.lessons) {
    const art = authored[lesson.id];
    if (!art) continue;
    const misconceptions = lesson.introduces.flatMap((cid) => misconceptionsForConcept(graph, cid));
    if (misconceptions.length === 0) continue;
    art.quizItems.forEach((item, index) => {
      for (const m of misconceptions) {
        const catchTexts = [m.statement, m.beliefForm].filter(Boolean);
        const caught = item.options.some(
          (option, oi) => oi !== item.correctIndex && catchTexts.some((t) => distractorCatches(option, t)),
        );
        if (!caught) continue;
        const confronts =
          tokenOverlapRatio(m.corrective, item.explanation) >= 0.5 ||
          item.explanation.includes(m.corrective.slice(0, 40));
        if (!confronts) {
          findings.push(
            finding(
              'block',
              'J3B_PAIRING',
              `authored/${lesson.id}`,
              `quizItems[${index}] catches "${(m.beliefForm ?? m.statement).slice(0, 50)}…" but its explanation never confronts that corrective — the student who picked it learns nothing`,
            ),
          );
        }
      }
    });
  }
  return findings;
}
