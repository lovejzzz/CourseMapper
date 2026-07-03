// J10 RELEVANCE — a machine-proposed reading must share vocabulary with the
// concepts it claims to ground (subject-anchored, every provider — the
// v0.16.1 lesson). Scope: trust:'candidate' sources only. A 'verified'
// source has already passed the trust pipeline (human review or ledger
// verification), and legitimate textbook section titles ("Analyzing
// Findings") often carry none of the concept vocabulary — relevance gating
// exists to catch keyword bycatch at the point of machine proposal.
import { finding } from '../../graph/validate.mjs';
import { indexById } from '../../graph/schema.mjs';
import { tokenOverlapRatio } from '../text.mjs';

export function j10Relevance(graph, _authored, { minOverlap = 0.1 } = {}) {
  const findings = [];
  const concepts = indexById(graph.concepts);
  for (const source of graph.sources) {
    if (source.trust !== 'candidate') continue;
    const linked = source.conceptIds.map((id) => concepts.get(id)?.name ?? '').join(' ');
    const anchorText = `${linked} ${graph.course.subject} ${graph.course.title} ${source.topics ?? ''}`;
    const overlap = tokenOverlapRatio(source.title, anchorText);
    if (overlap < minOverlap) {
      findings.push(
        finding(
          'block',
          'J10_RELEVANCE',
          `source/${source.id}`,
          `candidate reading "${source.title.slice(0, 70)}" shares no vocabulary with its concepts or the course subject — keyword bycatch`,
        ),
      );
    }
  }
  return findings;
}
