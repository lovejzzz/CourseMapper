// Targeted repair — docs/TRELLIS.md §14.5, optimized after the attempt-4
// ledger (repair was 53% of spend, serial). Two changes, both measured
// against that baseline: (1) quiz-only findings (J1/J3 — the dominant
// class) repair ONLY the quiz section (~¼ the tokens of a full lesson
// re-author, and no risk of regressing the other sections); (2) repairs
// run in parallel batches like authoring. Residual blocks stay disclosed,
// never swallowed.

import { runChecks, blockingFindings, findingsByLesson } from '../judgment/index.mjs';
import { authorLesson, repairQuizSection } from './author.mjs';

const QUIZ_ONLY_CODES = new Set(['J1_KEY_VALID', 'J3_REPAIR_CONFRONTS', 'J11_CATCH', 'J3B_PAIRING', 'J12_EXPOSURE']);
const REPAIR_BATCH_SIZE = 6;

async function repairOneLesson(graph, authored, lessonId, lessonFindings, options) {
  const quizOnly = lessonFindings.every((f) => QUIZ_ONLY_CODES.has(f.code));
  if (quizOnly && !options.mock) {
    return repairQuizSection(graph, lessonId, authored[lessonId], lessonFindings, options);
  }
  const complaints = lessonFindings.map((f) => `- [${f.code}] ${f.message}`).join('\n');
  return authorLesson(graph, lessonId, { ...options, repairNotes: complaints });
}

export async function repairLoop(
  graph,
  authored,
  { tier, ledger, budgetUsd = null, maxRounds = 2, mock = null, afterRound = null } = {},
) {
  let rounds = 0;
  let sectionRepairs = 0;
  let fullRepairs = 0;
  let findings = runChecks(graph, authored);
  while (rounds < maxRounds) {
    const blocking = blockingFindings(findings);
    const byLesson = findingsByLesson(blocking);
    const lessonIds = Object.keys(byLesson).filter((key) => key !== '__graph__');
    if (lessonIds.length === 0) break;
    rounds += 1;
    for (let i = 0; i < lessonIds.length; i += REPAIR_BATCH_SIZE) {
      const batch = lessonIds.slice(i, i + REPAIR_BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((lessonId) => {
          const quizOnly = byLesson[lessonId].every((f) => QUIZ_ONLY_CODES.has(f.code));
          if (quizOnly && !mock) sectionRepairs += 1;
          else fullRepairs += 1;
          return repairOneLesson(graph, authored, lessonId, byLesson[lessonId], { tier, ledger, budgetUsd, mock });
        }),
      );
      results.forEach((result, j) => {
        // A failed repair keeps the previous version — the findings remain
        // and land in the honest residual; never trade content for silence.
        if (result.status === 'fulfilled') authored[batch[j]] = result.value;
      });
    }
    // Deterministic post-round transforms (catch re-splicing) run before
    // re-judging: repaired quizzes must not lose their structural guarantees.
    afterRound?.(graph, authored);
    findings = runChecks(graph, authored);
  }
  const residual = blockingFindings(findings).filter((f) => f.path.startsWith('authored/'));
  return {
    findings,
    rounds,
    sectionRepairs,
    fullRepairs,
    residual,
    honest:
      residual.length > 0 ? `UNRESOLVED after ${rounds} repair round(s): ${residual.length} blocking finding(s)` : null,
  };
}
