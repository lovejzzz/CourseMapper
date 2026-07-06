// J12 EXPOSURE (roadmap 1.3) — an item must test taught content: a weekly
// item's kernel claims must reference concepts in its OWN lesson's closure
// (introduces + reinforces + primer bridges). Exam exposure is enforced at
// the grammar (conceptId enum over covered concepts), so this check is the
// weekly-side net.
import { finding } from '../../graph/validate.mjs';

export function j12Exposure(graph, authored) {
  const findings = [];
  for (const lesson of graph.lessons) {
    const art = authored[lesson.id];
    if (!art) continue;
    const closure = new Set([...lesson.introduces, ...lesson.reinforces, ...(lesson.bridgePrimers ?? [])]);
    for (const claim of art.claims ?? []) {
      const match = /^quizItems\[(\d+)\]/.exec(String(claim.path));
      // Read the DURABLE concept mapping (`concept`), not the withheld-in-zero
      // grounding citation (`ref`) — else exposure stops being enforced under
      // zero mode when ref is nulled.
      const mapping = String(claim.concept ?? claim.ref ?? '');
      if (!match || !mapping.startsWith('kernel:')) continue;
      const conceptId = mapping.slice('kernel:'.length);
      if (!closure.has(conceptId)) {
        findings.push(
          finding(
            'block',
            'J12_EXPOSURE',
            `authored/${lesson.id}`,
            `quizItems[${match[1]}] is grounded in "${conceptId}", which this lesson never teaches — students meet it cold on a graded item`,
          ),
        );
      }
    }
  }
  return findings;
}
