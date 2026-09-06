import { buildScionTeachingTaskDesignPrompt, validateTeachingDesignQuotations } from './taskDesignProtocol.js';

// Research only: test semantic extraction separately from deterministic
// arithmetic. This protocol has not been promoted into the website pipeline.
export function buildScionTeachingTaskDesignPromptV2(input) {
  const prompt = buildScionTeachingTaskDesignPrompt(input);
  if (input.family !== 'calculation') {
    return {
      ...prompt,
      protocol: 'scion-teaching-task-design-v2',
      systemPrompt:
        prompt.systemPrompt +
        (input.family === 'experiment'
          ? ' First identify the variable the QUESTION wants to compare. A factor that happens to change is not necessarily the intended treatment. For example, comparing ink types when paper texture also changes requires holding paper texture comparable, assigning or balancing ink order, repeating measurements, and using one defined measurement. Choose controls appropriate to THIS source; do not copy the example. Write each procedural step so someone can carry it out, and never claim the proposed repair already produced results.'
          : ' Distinguish an amended rule with an effective date from two incompatible reports of one event. Classify separately what was personally observed, what another speaker reported, and what someone inferred. Additional evidence must name a concrete record to seek and what it would establish; repeating that evidence is missing is not a research proposal.'),
    };
  }
  const text = { type: 'string', minLength: 1, maxLength: 700 };
  const object = (properties) => ({
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  });
  const evidence = object({ source: { type: 'integer', minimum: 0, maximum: input.sources.length - 1 }, quote: text });
  const count = object({ value: { type: 'integer', minimum: 0, maximum: 999999999 }, evidence });
  const schema = object({
    operation: { type: 'string', enum: ['proportion', 'pooled-proportion', 'unknown-overlap', 'not-calculable'] },
    groups: { type: 'array', minItems: 0, maxItems: 6, items: object({ label: text, part: count, whole: count }) },
    requestedUnit: text,
    operationReason: text,
    unresolved: text,
    invalidApproach: text,
  });
  return {
    protocol: 'scion-teaching-task-design-v2',
    family: input.family,
    schema: { name: 'scion_teaching_task_design_v2', strict: true, schema },
    systemPrompt: `Extract a source-grounded calculation plan. Return only the requested JSON. Write explanations in ${input.language === 'zh' ? 'Chinese' : 'English'}, and copy evidence quotations exactly. Do NOT calculate an answer, add observed counts, or write decimals or percentages: a deterministic compiler will perform arithmetic. Each part and whole value must be a count explicitly present in its quoted evidence. For one proportion, return one group. For an overall proportion across separate groups, use pooled-proportion and return each group's original part and whole; do not add counts yourself or average the rates. For attendance at either of two events with unrecorded overlap, use unknown-overlap with two event counts as parts and the same membership total as each whole. Choose not-calculable and empty groups if even these counts are unavailable. requestedUnit names what is counted; never equate a household count with water volume. unresolved names what the supplied record cannot establish. invalidApproach states a tempting specific reasoning error without endorsing it.`,
    userPrompt: `Objective: ${input.objective}\nSources:\n${input.sources.map((source, index) => `[${index}] ${source}`).join('\n')}\nRequired JSON shape:\n${JSON.stringify(schema)}`,
  };
}

export function validateTaskDesignV2(design, sources) {
  const quotations = validateTeachingDesignQuotations(design, sources);
  const issues = [...quotations.issues];
  if (design?.operation) {
    for (const [index, group] of (design.groups || []).entries()) {
      for (const key of ['part', 'whole']) {
        const count = group[key];
        if (
          !Number.isInteger(count?.value) ||
          !new RegExp(`(?<![\\d.])${count.value}(?![\\d.])`).test(count?.evidence?.quote || '')
        )
          issues.push(`groups.${index}.${key}: count is not literally present in its quotation`);
      }
      if (group.part?.value > group.whole?.value || group.whole?.value <= 0)
        issues.push(`groups.${index}: invalid part–whole counts`);
    }
    if (design.operation === 'proportion' && design.groups?.length !== 1)
      issues.push('One proportion needs one group.');
    if (design.operation === 'pooled-proportion' && design.groups?.length < 2)
      issues.push('Pooling needs at least two groups.');
    if (
      design.operation === 'unknown-overlap' &&
      (design.groups?.length !== 2 || design.groups[0].whole.value !== design.groups[1].whole.value)
    )
      issues.push('Overlap bounds require two event counts in the same known population.');
  }
  return {
    valid: issues.length === 0,
    issues,
    scope:
      'Exact source quotations, literal counts and operation shape only; semantic selection and source interpretation remain unverified.',
  };
}
