// Targeted repair — docs/TRELLIS.md §14.5. Re-authors ONLY the flagged
// lesson, with the judgment findings quoted in the prompt; two rounds max;
// residual blocks land in the digest as an honest badge, never silently.

import { runChecks, blockingFindings, findingsByLesson } from '../judgment/index.mjs';
import { authorLesson } from './author.mjs';

export async function repairLoop(graph, authored, { tier, ledger, budgetUsd = null, maxRounds = 2, mock = null } = {}) {
  let rounds = 0;
  let findings = runChecks(graph, authored);
  while (rounds < maxRounds) {
    const blocking = blockingFindings(findings);
    const byLesson = findingsByLesson(blocking);
    const lessonIds = Object.keys(byLesson).filter((key) => key !== '__graph__');
    if (lessonIds.length === 0) break;
    rounds += 1;
    for (const lessonId of lessonIds) {
      const complaints = byLesson[lessonId].map((f) => `- [${f.code}] ${f.message}`).join('\n');
      authored[lessonId] = await authorLesson(graph, lessonId, {
        tier,
        ledger,
        budgetUsd,
        mock,
        // Live path: authorLesson has no complaint channel in its signature;
        // repair rides the validate-retry channel instead by re-authoring
        // with the findings appended to the slice via repairNotes.
        repairNotes: complaints,
      });
    }
    findings = runChecks(graph, authored);
  }
  const residual = blockingFindings(findings).filter((f) => f.path.startsWith('authored/'));
  return {
    findings,
    rounds,
    residual,
    honest:
      residual.length > 0 ? `UNRESOLVED after ${rounds} repair round(s): ${residual.length} blocking finding(s)` : null,
  };
}
