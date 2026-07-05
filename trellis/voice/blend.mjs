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

// 18/batch: rewrites are ~60 words each, well inside the output caps —
// smaller batches were pure call-count waste (110-call audit, July 4).
const BATCH = 18;

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

// Per-entry gates. Batch-wide all-or-nothing validation was measured
// broken at batch 18 (July 4 diet run: 0/68 accepted, 30 calls burned in
// retries) — P(all N rewrites valid) collapses as N grows. Instead: ONE
// call per batch, accept each rewrite that passes its own gates, escalate
// only the rejects.
function schemaOnly(parsed) {
  return Array.isArray(parsed?.rewrites) ? [] : ['rewrites must be an array'];
}

async function logBlendPair(entry) {
  const { corpusLog } = await import('../tendril/corpus.mjs');
  await corpusLog(entry);
}

function explanationGate(entry, text, accepted) {
  if (text.length < 40 || text.length > 700) return false;
  for (const corrective of entry.correctives) {
    if (!confrontsCorrective(text, corrective)) return false;
  }
  if (accepted.has(text.toLowerCase())) return false;
  return true;
}

export async function blendCorrectives(
  graph,
  authored,
  { tier = 'nano', ledger = null, budgetUsd = null, sGenerate = null } = {},
) {
  const candidates = findBlendCandidates(graph, authored);
  if (candidates.length === 0) return { candidates: 0, blended: 0 };

  // Zero-API path: Tendril-S rewrites each two-voice explanation locally
  // (its trained blend task, 83.3% gated acceptance vs nano's 80%). Same
  // per-entry gates; a gate miss keeps the appended form, disclosed by
  // the standing digest line. No escalation tiers — there is no paid
  // tier to escalate to.
  if (sGenerate) {
    const { BLEND_SYSTEM } = await import('../tendril/sModel.mjs');
    const accepted = new Set();
    let blended = 0;
    for (const entry of candidates) {
      let text;
      try {
        text = String(
          await sGenerate({
            system: BLEND_SYSTEM,
            user: JSON.stringify({ text: entry.explanation }),
            source: entry.explanation,
          }),
        ).trim();
      } catch {
        continue; // S failure keeps the appended form
      }
      if (!explanationGate(entry, text, accepted)) {
        void logBlendPair({ task: 'blend-explanation', accepted: false, reason: 'explanation-gate', source: entry.explanation, target: text });
        continue;
      }
      const item = authored[entry.lessonId]?.quizItems?.[entry.itemIndex];
      if (!item || item.explanation !== entry.explanation) continue;
      void logBlendPair({ task: 'blend-explanation', accepted: true, source: entry.explanation, target: text });
      item.explanation = text;
      accepted.add(text.toLowerCase());
      blended += 1;
    }
    return { candidates: candidates.length, blended };
  }

  const callBatch = (batch, batchTier) =>
    callModel({
      tier: batchTier,
      stage: 'blend',
      ledger,
      budgetUsd,
      schema: REWRITES_SCHEMA,
      schemaName: 'explanation_rewrites',
      validate: schemaOnly,
      maxOutputTokens: 4000,
      system:
        'You polish quiz explanations. Each entry contains one or more corrective sentences that were pasted in mechanically, so the text reads as two voices. ' +
        'Rewrite each as ONE natural explanation (2-3 sentences; under 60 words for one corrective, plus 40 more words per additional corrective) that makes every corrective’s content its own point — keep at least half of EACH corrective’s key terms (a lexical gate checks this), never paste one as a standalone sentence. ' +
        'Vary the openers: no two rewrites may start with the same words. Return {rewrites:[{index, text}]} covering every entry.',
      user: JSON.stringify(
        batch.map((entry, index) => ({ index, explanation: entry.explanation, correctives: entry.correctives })),
        null,
        1,
      ),
    });

  const accepted = new Set();
  let blended = 0;
  const applyBatch = (batch, result) => {
    const rejected = new Set(batch.keys());
    for (const rewrite of result?.rewrites ?? []) {
      const entry = batch[rewrite.index];
      if (!entry) continue;
      const text = String(rewrite.text ?? '').trim();
      if (!explanationGate(entry, text, accepted)) {
        // Tendril corpus (T-M2): gate verdicts are training labels;
        // fire-and-forget so logging can never slow or break a blend.
        void logBlendPair({ task: 'blend-explanation', accepted: false, reason: 'explanation-gate', source: entry.explanation, target: text });
        continue;
      }
      const item = authored[entry.lessonId]?.quizItems?.[entry.itemIndex];
      // Apply only when the explanation is still the one we sampled.
      if (!item || item.explanation !== entry.explanation) continue;
      void logBlendPair({ task: 'blend-explanation', accepted: true, source: entry.explanation, target: text });
      item.explanation = text;
      accepted.add(text.toLowerCase());
      rejected.delete(rewrite.index);
      blended += 1;
    }
    return [...rejected].map((index) => batch[index]);
  };

  let pending = candidates;
  for (const batchTier of tier === 'cheap' ? ['cheap'] : [tier, 'cheap']) {
    const stillPending = [];
    for (let i = 0; i < pending.length; i += BATCH) {
      const batch = pending.slice(i, i + BATCH);
      try {
        const { result } = await callBatch(batch, batchTier);
        stillPending.push(...applyBatch(batch, result));
      } catch {
        stillPending.push(...batch); // call itself failed — keep for escalation
      }
    }
    pending = stillPending;
    if (pending.length === 0) break;
  }
  // B2 (v0.1.4): the reject tail — items both batch tiers failed get ONE
  // per-item mini rewrite with the full item as context (batch prompts
  // starve math-dense correctives of room; LA measured the tail at ~20%).
  // Bounded to 10 items; whatever still fails keeps its pasted form.
  for (const entry of pending.slice(0, 10)) {
    // Math-dense correctives need room (v0.1.5 item 3): 80 words here,
    // and a deepseek seat tries once after mini — different family,
    // different failure mode. Whatever still fails keeps the paste.
    for (const tailTier of ['cheap', 'ds']) {
      try {
        const { result } = await callModel({
          tier: tailTier,
          stage: 'blend',
          ledger,
          budgetUsd,
          schema: REWRITES_SCHEMA,
          schemaName: 'explanation_rewrites',
          validate: schemaOnly,
          maxOutputTokens: 700,
          system:
            'Rewrite ONE quiz explanation so the pasted corrective sentence(s) become its own natural argument (2-4 sentences; 80 words for one corrective, plus 40 per additional corrective). Keep at least half of EACH corrective’s key terms — a lexical gate checks. Return {rewrites:[{index:0, text}]}.',
          user: JSON.stringify({ explanation: entry.explanation, correctives: entry.correctives }, null, 1),
        });
        const text = String(result?.rewrites?.[0]?.text ?? '').trim();
        if (!explanationGate(entry, text, accepted)) continue;
        const item = authored[entry.lessonId]?.quizItems?.[entry.itemIndex];
        if (!item || item.explanation !== entry.explanation) break;
        item.explanation = text;
        accepted.add(text.toLowerCase());
        blended += 1;
        break;
      } catch {
        /* try the next tier; after the last, the paste stays — disclosed */
      }
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

function optionGate(entry, text, accepted) {
  if (text.length < 8 || text.length > 130) return false;
  // The rewrite must still catch (same lexical rule the classroom
  // instrument runs) or the pasted version stays.
  if (!entry.catchTexts.some((t) => distractorCatches(text, t))) return false;
  if (entry.otherOptions.some((other) => other.trim().toLowerCase() === text.toLowerCase())) return false;
  if (accepted.has(text.toLowerCase())) return false;
  return true;
}

export async function blendSplicedOptions(graph, authored, { tier = 'nano', ledger = null, budgetUsd = null } = {}) {
  const candidates = findSplicedOptionCandidates(graph, authored);
  if (candidates.length === 0) return { candidates: 0, blended: 0 };

  const callBatch = (batch, batchTier) =>
    callModel({
      tier: batchTier,
      stage: 'blend',
      ledger,
      budgetUsd,
      schema: REWRITES_SCHEMA,
      schemaName: 'option_rewrites',
      validate: schemaOnly,
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

  const accepted = new Set();
  let blended = 0;
  const applyBatch = (batch, result) => {
    const rejected = new Set(batch.keys());
    for (const rewrite of result?.rewrites ?? []) {
      const entry = batch[rewrite.index];
      if (!entry) continue;
      const text = String(rewrite.text ?? '').trim();
      if (!optionGate(entry, text, accepted)) continue;
      const item = authored[entry.lessonId]?.quizItems?.[entry.itemIndex];
      if (!item || item.options[entry.optionIndex] !== entry.option) continue;
      item.options[entry.optionIndex] = text;
      accepted.add(text.toLowerCase());
      rejected.delete(rewrite.index);
      blended += 1;
    }
    return [...rejected].map((index) => batch[index]);
  };

  let pending = candidates;
  for (const batchTier of tier === 'cheap' ? ['cheap'] : [tier, 'cheap']) {
    const stillPending = [];
    for (let i = 0; i < pending.length; i += BATCH) {
      const batch = pending.slice(i, i + BATCH);
      try {
        const { result } = await callBatch(batch, batchTier);
        stillPending.push(...applyBatch(batch, result));
      } catch {
        stillPending.push(...batch);
      }
    }
    pending = stillPending;
    if (pending.length === 0) break;
  }
  return { candidates: candidates.length, blended };
}
