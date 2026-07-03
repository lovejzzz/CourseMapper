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
import { indexById } from './schema.mjs';

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
