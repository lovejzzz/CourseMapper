// Tendril-E typed-answer diagnosis (docs/TENDRIL.md §5.1, T-M1c).
// The Tutor shows an item; the student TYPES an answer. Diagnosis maps
// that free text to the nearest misconception family of the item's
// kernel — or to null when nothing is close enough (a correct or
// unrelated answer must not trigger a corrective). This is
// classification by embedding proximity: exactly what a 25MB model does
// well, and the difference between a quiz and a tutor.
//
// Exemplars per (kernel × family): the family statement itself plus the
// wrong options of the family's bank items. All exemplars come from the
// gate-passed bank — Tendril reads the library, never writes it (T-2).

import { cosine, cachedEmbed, makeEmbedder } from './embedder.mjs';

// Operating profiles measured in T-M1c and re-verified per embedder round
// (cache/diagnosis-eval.json, frozen ds-paraphrase rulers, n=240/120).
// DEPLOYED (tendril-e2c, adopted 2026-07-04): standard = 80.4% family
// accuracy / 20.0% false-fire at margin 0 — the joint bar, met on round 3.
// The E1-era numbers below remain the original T-M1c record:
//   standard     — item-local grading (typed answer vs the item's own
//                  distractors and correct option): 81.7% family accuracy
//                  (bar ≥80% MET), 33% false-fire on correct answers. The
//                  Tutor mitigates false fires with confirm-style prompts
//                  ("you might be thinking X — is that what you meant?"),
//                  never assertive correctives.
//   conservative — standard AND kernel-wide contrastive agreement:
//                  16.7% false-fire at 67.1% sensitivity. For surfaces
//                  where interrupting a correct student is worse than
//                  missing a misconception.
// False-fire floor is the named Tendril-D lever (TENDRIL.md §4).
export const DIAGNOSIS_PROFILES = {
  standard: { floor: 0.35, margin: 0, mode: 'item-options' },
  conservative: { floor: 0.35, margin: 0, mode: 'and-gate' },
};

// Item-local diagnosis — the deployment configuration. The caller passes
// the answered item's surfaces; returns { family|null, confidence,
// wrongTop, nullTop }. family is the item's familyKey when the wrong side
// wins by `margin` over the correct side (both must clear `floor`).
export function diagnoseAgainstItem(item, answerVector, vectorOf, { floor = 0.35, margin = 0 } = {}) {
  const distractors = (item.options ?? []).filter((_, i) => i !== item.correctIndex);
  const correctText = item.options?.[item.correctIndex];
  const wrongTop = Math.max(...distractors.map((d) => cosine(answerVector, vectorOf(d))), -1);
  const nullTop = correctText ? cosine(answerVector, vectorOf(correctText)) : -1;
  const fires = wrongTop >= floor && wrongTop > nullTop + margin;
  return {
    family: fires ? (item.familyKey ?? null) : null,
    confidence: wrongTop,
    wrongTop,
    nullTop,
  };
}

export function exemplarsFromBank(bank) {
  const byKernel = new Map();
  for (const item of bank.items) {
    if (!item.familyKey) continue;
    if (!byKernel.has(item.kernelId)) byKernel.set(item.kernelId, []);
    const list = byKernel.get(item.kernelId);
    const seen = new Set(list.map((e) => e.text));
    const push = (text, source) => {
      if (typeof text === 'string' && text.length >= 8 && !seen.has(text)) {
        list.push({ family: item.familyKey, text, source, itemId: item.id });
        seen.add(text);
      }
    };
    push(item.familyKey, 'family-statement');
    (item.options ?? []).forEach((opt, i) => {
      if (i !== item.correctIndex) push(opt, 'distractor');
    });
  }
  return byKernel;
}

export async function buildDiagnosisIndex(bank, { embedder = null, cacheName = 'diagnosis-exemplars' } = {}) {
  const emb = embedder ?? makeEmbedder();
  const byKernel = exemplarsFromBank(bank);
  const all = [...byKernel.values()].flat();
  const vectors = await cachedEmbed(
    all.map((e) => e.text),
    { name: cacheName, embedder: emb },
  );
  all.forEach((e, i) => {
    e.vector = vectors[i];
  });
  return { byKernel, embedder: emb };
}

// k-NN vote among the kernel's exemplars, score-weighted, thresholded.
// Returns { family|null, confidence, top } — null means "no corrective
// fires"; the Tutor treats it as correct-or-novel and moves on.
//
// CONTRASTIVE MODE (the null-rejection fix, measured in T-M1c): absolute
// similarity measures TOPIC, not truth-polarity — a correct typed answer
// sits nearly as close to the misconception exemplars as a wrong one
// (0.84-0.97 false-fire in the absolute eval). But the Tutor always knows
// WHICH item the student is answering, so pass the item's correct answer
// as nullVectors: a family fires only if it beats the correct-answer
// similarity by `margin`. Correctness is judged relatively, not absolutely.
export async function diagnose(
  index,
  kernelId,
  answerText,
  { threshold = 0.35, k = 3, queryVector = null, nullVectors = null, margin = 0.05 } = {},
) {
  const exemplars = index.byKernel.get(kernelId) ?? [];
  if (exemplars.length === 0) return { family: null, confidence: 0, top: [] };
  const q = queryVector ?? (await index.embedder.embedOne(answerText));
  const scored = exemplars
    .map((e) => ({ family: e.family, text: e.text, source: e.source, score: cosine(q, e.vector) }))
    .sort((a, b) => b.score - a.score);
  const nullScore = nullVectors?.length ? Math.max(...nullVectors.map((v) => cosine(q, v))) : null;
  const bar = nullScore === null ? threshold : Math.max(threshold, nullScore + margin);
  const top = scored.slice(0, k).filter((s) => s.score >= bar);
  if (top.length === 0) {
    return { family: null, confidence: scored[0]?.score ?? 0, nullScore, top: scored.slice(0, k) };
  }
  const votes = new Map();
  for (const t of top) votes.set(t.family, (votes.get(t.family) ?? 0) + t.score);
  const [family] = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
  return { family, confidence: top[0].score, nullScore, top: scored.slice(0, k) };
}
