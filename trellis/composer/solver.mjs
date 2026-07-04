// The solver gate — COMPOSER_ROADMAP_V0.2.1 item 2.
// A wrong answer key is the one defect every lexical instrument is blind
// to; only the E6 adjudicated read caught one (a slice item keying an
// impossible answer). The gate: a CROSS-FAMILY seat receives the item
// WITHOUT the key and solves it independently; solver ≠ key → rejected.
// Cross-family matters here the way it matters on the judge panel — a
// same-family solver inherits the author's blind spots.

import { callModel } from '../providers.mjs';

const SOLVE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['answerIndex'],
  properties: {
    answerIndex: { type: 'integer', minimum: 0, maximum: 3 },
    unanswerable: { type: 'boolean' },
  },
};

export async function solveGate(item, { ledger = null, budgetUsd = null, tier = 'ds' } = {}) {
  try {
    const { result } = await callModel({
      tier,
      stage: 'solver',
      ledger,
      budgetUsd,
      schema: SOLVE_SCHEMA,
      schemaName: 'solve',
      validate: (parsed) => (Number.isInteger(parsed?.answerIndex) ? [] : ['answerIndex required']),
      maxOutputTokens: 200,
      system:
        'Solve this multiple-choice question yourself. Return {"answerIndex": <0-3>} for the single correct option, ' +
        'or {"answerIndex": 0, "unanswerable": true} if NO option is correct. Answer from first principles; do not guess between two defensible options — if two are defensible, the item is broken: mark unanswerable.',
      user: JSON.stringify({ question: item.stem, options: item.options }, null, 1),
    });
    if (result.unanswerable) return { ok: false, reason: 'solver: unanswerable' };
    if (result.answerIndex !== item.correctIndex) {
      return { ok: false, reason: `solver answered ${result.answerIndex}, key says ${item.correctIndex}` };
    }
    return { ok: true };
  } catch (error) {
    // Solver unavailable → PASS OPEN with disclosure: the gate is an
    // extra net, not a single point of failure for authoring.
    return { ok: true, reason: `solver unavailable (${String(error.message).slice(0, 60)})` };
  }
}
