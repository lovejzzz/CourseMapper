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

const BATCH = 12;

export function findBlendCandidates(graph, authored) {
  const candidates = [];
  for (const lesson of graph.lessons) {
    const art = authored[lesson.id];
    if (!art) continue;
    const misconceptions = [...new Set([...lesson.introduces, ...(lesson.reinforces ?? [])])].flatMap((cid) =>
      misconceptionsForConcept(graph, cid),
    );
    art.quizItems.forEach((item, itemIndex) => {
      for (const m of misconceptions) {
        const corrective = String(m.corrective ?? '');
        if (corrective.length < 40) continue;
        if (!String(item.explanation ?? '').includes(corrective)) continue;
        candidates.push({ lessonId: lesson.id, itemIndex, corrective, explanation: item.explanation });
        break; // one rewrite per item; multiple pasted correctives blend together
      }
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
      // The guarantee: a blend that loses the confrontation is rejected and
      // the appended version stays. Cosmetic-only, by construction.
      if (!confrontsCorrective(text, entry.corrective)) {
        errors.push(
          `rewrites[${rewrite.index}]: the corrective's content must survive the rewrite — keep at least half its key terms: "${entry.corrective.slice(0, 100)}"`,
        );
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
          'You polish quiz explanations. Each entry contains a corrective sentence that was pasted in mechanically, so the text reads as two voices. ' +
          'Rewrite each as ONE natural explanation (2-3 sentences, under 60 words) that makes the corrective’s content its own point — keep at least half of the corrective’s key terms (a lexical gate checks this), never paste it as a standalone sentence. ' +
          'Vary the openers: no two rewrites may start with the same words, and none may open with "Remember" or "Note that". Return {rewrites:[{index, text}]} covering every entry.',
        user: JSON.stringify(
          batch.map((entry, index) => ({ index, explanation: entry.explanation, corrective: entry.corrective })),
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
