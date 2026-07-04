// Corrective blending — roadmap v0.1.2 item 2.
// The deterministic pairing pass (and the "quote the corrective" prompt
// style) guarantee the classroom instrument, but both judge seats named
// the price: explanations that end in pasted corrective sentences read as
// "repeated feedback blocks" (quiz 7 vs bar 8). This pass rewrites those
// explanations into natural paragraphs — and a rewrite is accepted ONLY
// if the confrontation gate still passes, so the blend is cosmetic by
// construction: the guarantee can survive a failed blend, never the
// other way around.
//
// Candidates are found by SCANNING for the machine signature (the
// corrective included verbatim) rather than by threading append lists
// through the repair loop — repair re-authoring makes carried lists
// stale, and the scan also catches model-QUOTED correctives, which the
// judge reads exactly the same way.

import { callModel } from '../providers.mjs';
import { misconceptionsForConcept } from '../graph/schema.mjs';
import { confrontsCorrective } from '../judgment/checks/j3bPairing.mjs';
import { distractorCatches, catchTextsFor } from '../judgment/checks/j11Catch.mjs';
import { beliefTextFromStatement } from '../graph/autoAlign.mjs';

const BATCH = 12;

function lessonMisconceptions(graph, lesson) {
  return [...new Set([...lesson.introduces, ...(lesson.reinforces ?? [])])].flatMap((cid) =>
    misconceptionsForConcept(graph, cid),
  );
}

export function findBlendCandidates(graph, authored) {
  const candidates = [];
  for (const lesson of graph.lessons) {
    const art = authored[lesson.id];
    if (!art) continue;
    const misconceptions = lessonMisconceptions(graph, lesson);
    art.quizItems.forEach((item, itemIndex) => {
      // ALL pasted correctives ride the same rewrite — validating only the
      // first would let a blend silently drop the second one's confrontation
      // (a guarantee leak the A/B round's review caught).
      const correctives = misconceptions
        .map((m) => String(m.corrective ?? ''))
        .filter((c) => c.length >= 40 && String(item.explanation ?? '').includes(c));
      if (correctives.length === 0) return;
      candidates.push({ lessonId: lesson.id, itemIndex, correctives, explanation: item.explanation });
    });
  }
  return candidates;
}

const REWRITES_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['rewrites'],
  properties: {
    rewrites: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['index', 'text'],
        properties: {
          index: { type: 'integer', minimum: 0 },
          text: { type: 'string' },
        },
      },
    },
  },
};

function validateRewrites(batch) {
  return (parsed) => {
    const errors = [];
    if (!Array.isArray(parsed?.rewrites)) return ['rewrites must be an array'];
    const seen = new Set();
    for (const rewrite of parsed.rewrites) {
      const entry = batch[rewrite.index];
      if (!entry) {
        errors.push(`rewrites: index ${rewrite.index} does not exist`);
        continue;
      }
      const text = String(rewrite.text ?? '').trim();
      if (text.length < 40) errors.push(`rewrites[${rewrite.index}]: too short — a real explanation, not a stub`);
      if (text.length > 700) errors.push(`rewrites[${rewrite.index}]: too long — tighten to a paragraph`);
      // The guarantee: a blend that loses ANY confrontation is rejected and
      // the appended version stays. Cosmetic-only, by construction.
      for (const corrective of entry.correctives) {
        if (!confrontsCorrective(text, corrective)) {
          errors.push(
            `rewrites[${rewrite.index}]: every corrective's content must survive the rewrite — keep at least half the key terms of: "${corrective.slice(0, 100)}"`,
          );
        }
      }
      const key = text.toLowerCase();
      if (seen.has(key)) errors.push(`rewrites[${rewrite.index}]: identical to another rewrite — vary the wording`);
      seen.add(key);
    }
    return errors;
  };
}

export async function blendCorrectives(graph, authored, { tier = 'nano', ledger = null, budgetUsd = null } = {}) {
  const candidates = findBlendCandidates(graph, authored);
  if (candidates.length === 0) return { candidates: 0, blended: 0 };

  let blended = 0;
  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH);
    try {
      const { result } = await callModel({
        tier,
        stage: 'blend',
        ledger,
        budgetUsd,
        schema: REWRITES_SCHEMA,
        schemaName: 'explanation_rewrites',
        validate: validateRewrites(batch),
        maxOutputTokens: 4000,
        system:
          'You polish quiz explanations. Each entry contains one or more corrective sentences that were pasted in mechanically, so the text reads as two voices. ' +
          'Rewrite each as ONE natural explanation (2-3 sentences, under 60 words) that makes every corrective’s content its own point — keep at least half of EACH corrective’s key terms (a lexical gate checks this), never paste one as a standalone sentence. ' +
          'Vary the openers: no two rewrites may start with the same words, and none may open with "Remember" or "Note that". Return {rewrites:[{index, text}]} covering every entry.',
        user: JSON.stringify(
          batch.map((entry, index) => ({ index, explanation: entry.explanation, correctives: entry.correctives })),
          null,
          1,
        ),
      });
      for (const rewrite of result.rewrites) {
        const entry = batch[rewrite.index];
        if (!entry) continue;
        const art = authored[entry.lessonId];
        const item = art?.quizItems?.[entry.itemIndex];
        // The item may have moved under a concurrent transform; apply only
        // when the explanation is still the one we sampled.
        if (!item || item.explanation !== entry.explanation) continue;
        item.explanation = String(rewrite.text).trim();
        blended += 1;
      }
    } catch {
      // A failed batch keeps its appended explanations — the guarantee
      // stands, the polish is skipped, the digest discloses the ratio.
    }
  }
  return { candidates: candidates.length, blended };
}

// ── spliced-option blending ─────────────────────────────────────────────────
// The catch splice pastes DOCUMENTED beliefForm sentences verbatim into
// option slots. The instrument is satisfied; the judge is not — both A/B
// seats called those options "bloated, partly repetitive, awkwardly
// phrased" (quiz 5/10). Rewrite each pasted option into a concise
// reason-bearing distractor; a rewrite is accepted ONLY if it still
// catches the same misconception (the same distractorCatches rule Prof
// runs), so J11 and the classroom catch bar survive every blend.

export function findSplicedOptionCandidates(graph, authored) {
  const candidates = [];
  for (const lesson of graph.lessons) {
    const art = authored[lesson.id];
    if (!art) continue;
    const misconceptions = lessonMisconceptions(graph, lesson);
    art.quizItems.forEach((item, itemIndex) => {
      item.options.forEach((option, optionIndex) => {
        if (optionIndex === item.correctIndex) return;
        const pasted = misconceptions.find((m) => {
          const spliceTexts = [m.beliefForm, beliefTextFromStatement(m.statement)].filter(Boolean);
          return spliceTexts.some((text) => option.trim() === text.trim());
        });
        if (!pasted) return;
        candidates.push({
          lessonId: lesson.id,
          itemIndex,
          optionIndex,
          option,
          stem: item.stem,
          otherOptions: item.options.filter((_, oi) => oi !== optionIndex),
          catchTexts: catchTextsFor(pasted),
        });
      });
    });
  }
  return candidates;
}

function validateOptionRewrites(batch) {
  return (parsed) => {
    const errors = [];
    if (!Array.isArray(parsed?.rewrites)) return ['rewrites must be an array'];
    const seen = new Set();
    for (const rewrite of parsed.rewrites) {
      const entry = batch[rewrite.index];
      if (!entry) {
        errors.push(`rewrites: index ${rewrite.index} does not exist`);
        continue;
      }
      const text = String(rewrite.text ?? '').trim();
      if (text.length < 8) errors.push(`rewrites[${rewrite.index}]: too short to be a plausible option`);
      if (text.length > 130)
        errors.push(`rewrites[${rewrite.index}]: still too long — a quiz option, not a sentence from a database`);
      // The guarantee: the rewrite must still catch (same lexical rule the
      // classroom instrument runs) or the pasted version stays.
      if (!entry.catchTexts.some((t) => distractorCatches(text, t))) {
        errors.push(
          `rewrites[${rewrite.index}]: the wrong belief's key technical terms must survive — a student who holds it must still recognize it (source: "${entry.catchTexts[0].slice(0, 90)}")`,
        );
      }
      if (entry.otherOptions.some((other) => other.trim().toLowerCase() === text.toLowerCase())) {
        errors.push(`rewrites[${rewrite.index}]: duplicates another option in the same item`);
      }
      const key = text.toLowerCase();
      if (seen.has(key)) errors.push(`rewrites[${rewrite.index}]: identical to another rewrite — vary the wording`);
      seen.add(key);
    }
    return errors;
  };
}

export async function blendSplicedOptions(graph, authored, { tier = 'nano', ledger = null, budgetUsd = null } = {}) {
  const candidates = findSplicedOptionCandidates(graph, authored);
  if (candidates.length === 0) return { candidates: 0, blended: 0 };

  let blended = 0;
  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH);
    try {
      const { result } = await callModel({
        tier,
        stage: 'blend',
        ledger,
        budgetUsd,
        schema: REWRITES_SCHEMA,
        schemaName: 'option_rewrites',
        validate: validateOptionRewrites(batch),
        maxOutputTokens: 3000,
        system:
          'You polish multiple-choice options. Each entry is a WRONG option that was pasted verbatim from a misconception database — it reads as a documented sentence, not something a student would pick. ' +
          'Rewrite each as a concise, plausible distractor (at most ~15 words) in the visual style of the item’s other options, keeping the wrong belief’s key technical terms (a lexical gate checks them). ' +
          'It must stay WRONG — never soften it into something defensible. Vary the phrasing: no two rewrites alike. Return {rewrites:[{index, text}]} covering every entry.',
        user: JSON.stringify(
          batch.map((entry, index) => ({
            index,
            pastedOption: entry.option,
            stem: entry.stem,
            otherOptions: entry.otherOptions,
          })),
          null,
          1,
        ),
      });
      for (const rewrite of result.rewrites) {
        const entry = batch[rewrite.index];
        if (!entry) continue;
        const item = authored[entry.lessonId]?.quizItems?.[entry.itemIndex];
        if (!item || item.options[entry.optionIndex] !== entry.option) continue;
        item.options[entry.optionIndex] = String(rewrite.text).trim();
        blended += 1;
      }
    } catch {
      // A failed batch keeps its pasted options — the catch guarantee
      // stands, the polish is skipped, the digest discloses the ratio.
    }
  }
  return { candidates: candidates.length, blended };
}
