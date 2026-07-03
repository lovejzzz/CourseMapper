// J5 CITE_RESOLVES — every authored claim ref resolves to a real graph node
// of the right class; AUTHORED-GROUNDED must actually be grounded.
import { finding } from '../../graph/validate.mjs';
import { indexById } from '../../graph/schema.mjs';

export function j5CiteResolves(graph, authored) {
  const findings = [];
  const concepts = indexById(graph.concepts);
  const misconceptions = indexById(graph.misconceptions);
  const sources = indexById(graph.sources);
  for (const [lessonId, art] of Object.entries(authored)) {
    for (const claim of art.claims ?? []) {
      if (claim.ref === null) continue; // JUDGED-class, honest
      const [kind, id] = String(claim.ref).split(':');
      const ok =
        (kind === 'kernel' && concepts.has(id)) ||
        (kind === 'misconception' && misconceptions.has(id)) ||
        (kind === 'source' && sources.has(id) && sources.get(id).trust !== 'rejected');
      if (!ok) {
        findings.push(
          finding(
            'block',
            'J5_CITE_RESOLVES',
            `authored/${lessonId}/${claim.path}`,
            `claim ref "${claim.ref}" does not resolve`,
          ),
        );
      }
    }
  }
  return findings;
}
