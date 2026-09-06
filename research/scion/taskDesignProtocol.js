/** A compact source-to-task contract: ask Scion for evidence selection and
 * explicit unknowns, leaving calculation and material projection to the
 * compiler. This protocol is separate from the existing adapter's training
 * task; passing its schema is structural validation, not semantic approval. */
export const SCION_TEACHING_TASK_DESIGN_PROTOCOL = 'scion-teaching-task-design-v1';
const textField = { type: 'string', minLength: 1, maxLength: 1000 };
const list = (items, minItems = 1, maxItems = 6) => ({ type: 'array', items, minItems, maxItems });
const record = (properties) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

export function buildScionTeachingTaskDesignPrompt({
  objective,
  sources,
  family = 'source-analysis',
  language = 'en',
}) {
  if (
    !Array.isArray(sources) ||
    !sources.length ||
    sources.some((source) => typeof source !== 'string' || !source.trim())
  )
    throw new Error('Task design requires complete source statements.');
  const reference = record({ source: { type: 'integer', minimum: 0, maximum: sources.length - 1 }, quote: textField });
  let properties;
  let instructions;
  if (family === 'calculation') {
    const count = record({ value: { type: 'integer', minimum: 0, maximum: 999999999 }, evidence: reference });
    properties = {
      canCalculate: { type: 'boolean' },
      numerator: count,
      denominator: count,
      requestedGroup: textField,
      unobservedGroup: textField,
      unknownOutcome: textField,
      unsupportedConclusion: textField,
      denominatorReason: textField,
    };
    instructions =
      'Select the numerator and denominator for the EXACT group requested. Do not compute decimals or percentages. Copy exact supporting quotations. If the record does not support this fraction, set canCalculate=false and use 0 for unsupported count values, citing the source that exposes the gap. unobservedGroup must NAME the group whose outcomes are absent, or explicitly say none is described. unknownOutcome must state WHAT IS NOT KNOWN about that group; repeating an observed fact is not an answer. unsupportedConclusion must be a specific tempting conclusion that the supplied observations cannot establish. Do not turn blanks or missing observations into known negative outcomes.';
  } else if (family === 'experiment') {
    properties = {
      intendedComparison: textField,
      measuredOutcome: textField,
      differingConditions: list(record({ name: textField, evidence: reference })),
      alternativeExplanation: textField,
      repairedProcedure: list(textField, 3, 6),
      stillUnknown: textField,
      invalidConclusion: textField,
    };
    instructions =
      'Distinguish the intended treatment from other conditions that change with it. Quote the actual source for each differing condition. If a condition or measurement is unspecified, say so. Give an executable hypothetical repair with a comparable measurement, allocation/order and independent replication where appropriate. A proposed design is NOT an observed result: stillUnknown must say what treatment conclusion needs new measurements. Do not invent observed outcomes, sample sizes, or empirical effects.';
  } else if (family === 'source-analysis') {
    properties = {
      comparedClaims: list(
        record({
          evidence: reference,
          claimType: { type: 'string', enum: ['observation', 'reported-claim', 'interpretation'] },
          eventOrSubject: textField,
        }),
        2,
        4,
      ),
      relationship: {
        type: 'string',
        enum: [
          'compatible-different-events',
          'conflicting-same-event',
          'claim-exceeds-evidence',
          'insufficient-evidence',
        ],
      },
      conclusion: textField,
      reasoning: list(textField, 2, 4),
      stillUnknown: textField,
      unsupportedClaim: textField,
      usefulAdditionalEvidence: textField,
    };
    instructions =
      'Copy exact source quotations. Compare what the statements claim, including whether dates describe the same event. A quotation of a speaker is not automatically the author position; an advertisement is not independent proof. Explain which claims are compatible or conflicting and why. If the packet cannot resolve a disagreement, leave it unresolved. stillUnknown must identify the specific missing knowledge, not repeat a known fact. usefulAdditionalEvidence is a proposal to seek, never a source you pretend to have read. Allow other defensible interpretations of an open question.';
  } else throw new Error(`Unsupported task design family: ${family}`);
  return {
    protocol: SCION_TEACHING_TASK_DESIGN_PROTOCOL,
    family,
    schema: { name: 'scion_teaching_task_design_v1', strict: true, schema: record(properties) },
    systemPrompt: `You design source-grounded educational tasks. Use only the supplied source packet. Return one JSON object with exactly the requested fields, no markdown. Write explanatory text in ${language === 'zh' ? 'Chinese' : 'English'}; keep quotations verbatim. ${instructions}`,
    userPrompt: `Objective: ${objective}\nSources (zero-based indices):\n${sources.map((source, index) => `[${index}] ${source}`).join('\n')}\nRequired JSON shape:\n${JSON.stringify(record(properties))}`,
  };
}

export function validateTeachingDesignQuotations(design, sources) {
  const issues = [];
  let references = 0;
  function visit(value, path = '') {
    if (!value || typeof value !== 'object') return;
    if ('source' in value && 'quote' in value) {
      references += 1;
      if (
        !Number.isInteger(value.source) ||
        typeof value.quote !== 'string' ||
        !value.quote.trim() ||
        typeof sources[value.source] !== 'string' ||
        !sources[value.source].includes(value.quote)
      )
        issues.push(`${path}: evidence must quote the indexed source exactly`);
    }
    for (const [key, child] of Object.entries(value)) visit(child, path ? `${path}.${key}` : key);
  }
  visit(design);
  if (!references) issues.push('No source quotations were supplied.');
  return {
    valid: issues.length === 0,
    references,
    issues,
    scope: 'quotation integrity only; semantic interpretation requires separate evaluation',
  };
}
