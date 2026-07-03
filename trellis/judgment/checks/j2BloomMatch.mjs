// J2 BLOOM_MATCH — the outcome's verb must agree with its Bloom tag.
import { finding } from '../../graph/validate.mjs';

const VERB_LEVELS = {
  remember: ['define', 'list', 'recall', 'name', 'identify', 'state', 'label', 'recognize'],
  understand: ['explain', 'describe', 'summarize', 'classify', 'discuss', 'interpret', 'restate', 'paraphrase'],
  apply: ['apply', 'use', 'solve', 'demonstrate', 'implement', 'execute', 'compute', 'construct'],
  analyze: ['analyze', 'compare', 'contrast', 'distinguish', 'differentiate', 'examine', 'trace', 'debug'],
  evaluate: ['evaluate', 'judge', 'critique', 'justify', 'assess', 'defend', 'appraise', 'argue'],
  create: ['create', 'design', 'formulate', 'compose', 'develop', 'write', 'produce', 'build', 'plan'],
};
const ORDER = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'];

export function levelForVerb(verb) {
  const v = String(verb).toLowerCase();
  for (const [level, verbs] of Object.entries(VERB_LEVELS)) {
    if (verbs.includes(v)) return level;
  }
  return null;
}

export function j2BloomMatch(graph) {
  const findings = [];
  for (const outcome of graph.outcomes) {
    const verb = outcome.statement.trim().split(/\s+/)[0];
    const verbLevel = levelForVerb(verb);
    if (!verbLevel) continue; // unknown verb: no claim either way
    const distance = Math.abs(ORDER.indexOf(verbLevel) - ORDER.indexOf(outcome.bloom));
    if (distance > 1) {
      findings.push(
        finding(
          'block',
          'J2_BLOOM_MATCH',
          `outcome/${outcome.id}`,
          `verb "${verb}" reads as ${verbLevel} but the outcome is tagged ${outcome.bloom} — the alignment error a professional catches in seconds`,
        ),
      );
    } else if (distance === 1) {
      findings.push(
        finding(
          'warn',
          'J2_BLOOM_MATCH',
          `outcome/${outcome.id}`,
          `verb "${verb}" (${verbLevel}) is one tier from tag ${outcome.bloom}`,
        ),
      );
    }
  }
  return findings;
}
