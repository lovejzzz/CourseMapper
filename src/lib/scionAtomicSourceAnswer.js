import { quantityCountCatalog } from './scionQuantitySelection.js';

/** Resolve an atomic quoted answer, not an unrestricted model explanation.
 * A count may retain its unit/context in the response; select it only when
 * exactly one legal source count is contained in that exact source fragment.
 * This establishes provenance and lexical type, never semantic-role truth. */
export function resolveAtomicSourceAnswer(answer, inputs, { type = 'text', inputId, context } = {}) {
  const reject = (reason) => ({ status: 'needs-review', reason });
  if (!['text', 'count', 'record'].includes(type)) return reject('Unsupported source answer type.');
  if (typeof answer !== 'string' || !answer.trim()) return reject('No source answer.');
  if (answer.trim() === 'UNKNOWN') return { status: 'missing', reason: 'The model reports missing information.' };
  if (
    !Array.isArray(inputs) ||
    !inputs.length ||
    inputs.length > 8 ||
    inputs.some((i) => !i || typeof i.id !== 'string' || !i.id || typeof i.text !== 'string') ||
    new Set(inputs.map((i) => i.id)).size !== inputs.length ||
    inputs.reduce((n, i) => n + i.text.length, 0) > 6000
  )
    return reject('Use a focused packet with unique source IDs.');
  if (inputId !== undefined && !inputs.some((i) => i.id === inputId))
    return reject('The required source no longer exists.');
  if (context !== undefined) {
    const source = inputs.find((i) => i.id === context?.inputId);
    if (
      !source ||
      (inputId !== undefined && inputId !== source.id) ||
      !Number.isInteger(context.start) ||
      !Number.isInteger(context.end) ||
      context.start < 0 ||
      context.end <= context.start ||
      context.end > source.text.length ||
      source.text.slice(context.start, context.end) !== context.quote
    )
      return reject('The clarification context no longer matches its source.');
  }
  const quote = answer.trim(),
    matches = [];
  for (const input of inputs) {
    if ((inputId !== undefined && input.id !== inputId) || (context && input.id !== context.inputId)) continue;
    let start = -1,
      occurrence = -1;
    while ((start = input.text.indexOf(quote, start + 1)) >= 0) {
      occurrence++;
      if (context && (start < context.start || start + quote.length > context.end)) continue;
      matches.push({ inputId: input.id, quote, start, end: start + quote.length, occurrence });
      if (matches.length > 1) return reject('The answer occurs more than once; provide a unique source excerpt.');
    }
  }
  if (matches.length !== 1) return reject('The answer is not an exact source excerpt.');
  const witness = matches[0];
  let binding = { inputId: witness.inputId, quote: witness.quote, occurrence: witness.occurrence };
  if (type === 'record') {
    const input = inputs.find((i) => i.id === witness.inputId);
    binding = { inputId: input.id, quote: input.text, occurrence: 0 };
  }
  if (type === 'count') {
    let candidates;
    try {
      candidates = quantityCountCatalog(inputs).filter(
        (c) =>
          inputs[Number(c.source.slice(1)) - 1].id === witness.inputId &&
          c.start >= witness.start &&
          c.end <= witness.end,
      );
    } catch (error) {
      return reject(error.message);
    }
    if (candidates.length !== 1)
      return {
        ...reject(
          candidates.length
            ? 'The excerpt contains several counts; narrow the evidence.'
            : 'The excerpt does not contain a supported whole count.',
        ),
        witness,
      };
    const candidate = candidates[0];
    binding = { inputId: witness.inputId, quote: candidate.quote, occurrence: candidate.occurrence };
  }
  return { status: 'located', binding, witness, semanticReviewRequired: true };
}
