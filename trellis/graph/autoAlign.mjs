// Deterministic metadata repairs — the machine never writes prose (D2), but
// tags and labels are VERIFIED-class metadata it may correct, disclosed.
//
// autoAlignBloom: an outcome whose verb sits >1 Bloom tier from its tag gets
// the tag realigned to the verb (the verb is the teaching commitment; the
// tag is derived metadata). Kills the J2 residual class that lesson
// re-authoring could never fix.
//
// downgradeDanglingClaims: a claim whose ref does not resolve is downgraded
// to ref:null — an unverifiable citation becomes an explicit JUDGED-class
// statement instead of false grounding. Counted and disclosed, never silent.

import { levelForVerb } from '../judgment/checks/j2BloomMatch.mjs';
import { indexById, misconceptionsForConcept } from './schema.mjs';
import { distractorCatches } from '../judgment/checks/j11Catch.mjs';
import { tokenOverlapRatio } from '../judgment/text.mjs';

const ORDER = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'];

export function autoAlignBloom(graph) {
  const realigned = [];
  for (const outcome of graph.outcomes) {
    const verb = outcome.statement.trim().split(/\s+/)[0];
    const verbLevel = levelForVerb(verb);
    if (!verbLevel) continue;
    const distance = Math.abs(ORDER.indexOf(verbLevel) - ORDER.indexOf(outcome.bloom));
    if (distance > 1) {
      realigned.push({ outcomeId: outcome.id, verb, from: outcome.bloom, to: verbLevel });
      outcome.bloom = verbLevel;
    }
  }
  return realigned;
}

export function downgradeDanglingClaims(graph, authored) {
  const concepts = indexById(graph.concepts);
  const misconceptions = indexById(graph.misconceptions);
  const sources = indexById(graph.sources);
  const downgraded = [];
  for (const [lessonId, art] of Object.entries(authored)) {
    for (const claim of art.claims ?? []) {
      if (claim.ref === null) continue;
      const [kind, id] = String(claim.ref).split(':');
      const resolves =
        (kind === 'kernel' && concepts.has(id)) ||
        (kind === 'misconception' && misconceptions.has(id)) ||
        (kind === 'source' && sources.has(id) && sources.get(id).trust !== 'rejected');
      if (!resolves) {
        downgraded.push({ lessonId, path: claim.path, ref: claim.ref });
        claim.ref = null;
      }
    }
  }
  return downgraded;
}

// Catch splicing — the deterministic answer to J11's hard bar. Models (nano
// AND mini) paraphrase misconceptions into distractors, which fails the
// catch rule Prof's classroom applies. The graph holds the documented wrong
// belief VERBATIM, and quoting graph content into an options slot is
// assembly (the same legitimacy as tables quoting registry keys), not
// machine prose. Every splice is returned for digest disclosure.

const BELIEF_PREFIX_RE =
  /^students?\s+(?:may|might|often|commonly|sometimes|frequently)?\s*(?:think|believe|assume|treat|say|expect|conclude)\s*(?:that)?\s*/i;

export function beliefTextFromStatement(statement) {
  const stripped = String(statement).replace(BELIEF_PREFIX_RE, '').trim();
  const text = stripped.length >= 12 ? stripped : String(statement).trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function spliceCatchDistractors(graph, authored) {
  const splices = [];
  for (const lesson of graph.lessons) {
    const art = authored[lesson.id];
    if (!art) continue;
    const usedSlots = new Set();
    for (const conceptId of lesson.introduces) {
      const conceptName = graph.concepts.find((c) => c.id === conceptId)?.name ?? '';
      for (const m of misconceptionsForConcept(graph, conceptId)) {
        const alreadyCaught = art.quizItems.some((item) =>
          item.options.some((option, oi) => oi !== item.correctIndex && distractorCatches(option, m.statement)),
        );
        if (alreadyCaught) continue;
        // Best item: highest stem overlap with the concept name.
        let best = 0;
        let bestScore = -1;
        art.quizItems.forEach((item, index) => {
          const score = tokenOverlapRatio(conceptName, item.stem);
          if (score > bestScore && !usedSlots.has(index)) {
            bestScore = score;
            best = index;
          }
        });
        const item = art.quizItems[best];
        // Weakest distractor slot: least overlap with the stem.
        let slot = -1;
        let slotScore = Infinity;
        item.options.forEach((option, oi) => {
          if (oi === item.correctIndex) return;
          const score = tokenOverlapRatio(option, item.stem);
          if (score < slotScore) {
            slotScore = score;
            slot = oi;
          }
        });
        if (slot === -1) continue;
        item.options[slot] = beliefTextFromStatement(m.statement);
        usedSlots.add(best);
        splices.push({ lessonId: lesson.id, misconceptionId: m.id, item: best, slot });
      }
    }
  }
  return splices;
}
