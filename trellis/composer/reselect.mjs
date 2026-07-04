// Reselection before repair — COMPOSER_ROADMAP_V0.2.3 item 1.
// E7's ledger: $0.175 of a $0.222 run was the repair loop REWRITING
// provenance-gated content, when the defects were combination artifacts
// (this set of banked items, this lesson) rather than content defects.
// With a library, repair is a selection problem first: redraw the quiz
// from the shelf, remap claims, re-judge deterministically, keep the
// redraw only if the lesson's blocking findings drop. $0, one attempt
// per lesson; the model repairs only what reselection could not.

import { runChecks, blockingFindings } from '../judgment/index.mjs';
import { buildLessonSlice } from '../voice/contracts.mjs';
import { selectBankItems } from '../knowledge/itemBank.mjs';

const QUIZ_CODES = new Set([
  'J1_KEY_VALID',
  'J3_REPAIR_CONFRONTS',
  'J3B_PAIRING',
  'J11_CATCH',
  'J12_EXPOSURE',
  'J13_COVERAGE_SPREAD',
]);

function lessonBlockingCount(graph, authored, lessonId) {
  return blockingFindings(runChecks(graph, authored)).filter((f) => f.path === `authored/${lessonId}`).length;
}

export function reselectQuizForFindings(graph, authored, bank) {
  const findings = blockingFindings(runChecks(graph, authored));
  const byLesson = new Map();
  for (const finding of findings) {
    const match = finding.path.match(/^authored\/(.+)$/);
    if (!match) continue;
    if (!byLesson.has(match[1])) byLesson.set(match[1], []);
    byLesson.get(match[1]).push(finding);
  }

  let lessonsTried = 0;
  let lessonsSwapped = 0;
  for (const [lessonId, lessonFindings] of byLesson) {
    // Only lessons whose blocking findings are ALL quiz-class — mixed
    // defects go straight to the model loop.
    if (!lessonFindings.every((f) => QUIZ_CODES.has(f.code))) continue;
    const art = authored[lessonId];
    if (!art) continue;
    lessonsTried += 1;

    const slice = buildLessonSlice(graph, lessonId);
    const redraw = selectBankItems(slice, bank, { maxBanked: 6, perConcept: 4 });
    if (redraw.length < 4) continue; // shelf too thin to redraw — model's job

    const before = lessonFindings.length;
    const savedItems = art.quizItems;
    const savedClaims = art.claims;

    const itemConceptIds = redraw.map((item) => item.__bank?.conceptId ?? null);
    const newItems = redraw.map((item) => {
      const clean = { ...item };
      delete clean.__bank;
      return clean;
    });
    // Keep fresh (non-banked) items from the original tail if the redraw
    // came up short of the contract count.
    while (newItems.length < Math.min(6, savedItems.length)) {
      newItems.push(savedItems[newItems.length]);
      itemConceptIds.push(null);
    }
    art.quizItems = newItems;
    art.claims = [
      ...(savedClaims ?? []).filter((c) => !String(c.path).startsWith('quizItems')),
      ...newItems.map((_, i) => ({
        path: `quizItems[${i}].explanation`,
        ref: itemConceptIds[i] ? `kernel:${itemConceptIds[i]}` : null,
      })),
    ];

    const after = lessonBlockingCount(graph, authored, lessonId);
    if (after < before) {
      lessonsSwapped += 1;
    } else {
      art.quizItems = savedItems;
      art.claims = savedClaims;
    }
  }
  return { lessonsTried, lessonsSwapped };
}
