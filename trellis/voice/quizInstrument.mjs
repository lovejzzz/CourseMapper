// Authoring-time mirror of the classroom instrument (roadmap 1.1/1.2).
// Run 3 proved that post-hoc repair does not converge on J11/J3b: the
// repair model never sees the exact texts the lexical gates match, so it
// writes plausible distractors that fail the instrument round after round.
// These rules therefore run INSIDE the author/repair validate-retry loop,
// and every error message carries the verbatim text the model must keep —
// convergence by construction. The matching functions are IMPORTED from
// the judgment layer (single rule, no drift): passing authoring means
// passing J11/J3b means passing Prof's catch gate.

import { distractorCatches, catchTextsFor } from '../judgment/checks/j11Catch.mjs';
import { confrontsCorrective } from '../judgment/checks/j3bPairing.mjs';

// Prof's misconceptionCatchRate is PER-ITEM (share of items on
// misconception-bearing concepts that carry a catching distractor, bar
// 0.60) — a per-misconception guarantee alone cannot reach it.
export const ITEM_CATCH_SHARE = 0.6;

// J11/J3b fire on INTRODUCED concepts only; demanding catches for
// reinforced concepts' misconceptions would out-strict the judge and
// break authoring retries on lessons that merely revisit a concept.
export function introducedMisconceptions(slice) {
  const introduced = new Set(slice.lesson.introduces ?? []);
  const all = slice.concepts.filter((c) => introduced.has(c.id)).flatMap((c) => c.misconceptions);
  // A concept listed in both introduces and reinforces appears twice in the
  // slice; duplicated misconceptions double every error message.
  const seen = new Set();
  return all.filter((m) => (seen.has(m.id) ? false : seen.add(m.id)));
}

export function quizInstrumentErrors(quizItems, misconceptions) {
  const errors = [];
  if (!Array.isArray(quizItems) || quizItems.length === 0 || misconceptions.length === 0) return errors;

  const itemCatches = quizItems.map((item) =>
    misconceptions.filter((m) =>
      (item.options ?? []).some(
        (option, oi) => oi !== item.correctIndex && catchTextsFor(m).some((t) => distractorCatches(option, t)),
      ),
    ),
  );

  for (const m of misconceptions) {
    if (!itemCatches.some((caught) => caught.includes(m))) {
      errors.push(
        `quizItems: no distractor catches the documented misconception — add an option stating this wrong belief with its key terms intact: "${(m.beliefForm ?? m.statement).slice(0, 110)}"`,
      );
    }
  }

  itemCatches.forEach((caught, i) => {
    for (const m of caught) {
      if (!confrontsCorrective(quizItems[i]?.explanation, m.corrective)) {
        errors.push(
          `quizItems[${i}].explanation: this item's options state a documented wrong belief, so its explanation must confront the corrective, keeping its key terms: "${String(m.corrective).slice(0, 110)}"`,
        );
      }
    }
  });

  const carrying = itemCatches.filter((caught) => caught.length > 0).length;
  const needed = Math.ceil(quizItems.length * ITEM_CATCH_SHARE);
  if (carrying < needed) {
    errors.push(
      `quizItems: only ${carrying}/${quizItems.length} items carry a misconception-derived distractor; at least ${needed} must — restate the documented wrong beliefs as options on more items (vary the wording, keep each belief's key terms)`,
    );
  }
  return errors;
}
