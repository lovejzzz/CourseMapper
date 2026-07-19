# Scion lesson-kernel blind judge v1

Judge only the supplied source packet and the two anonymous lesson-kernel artifacts. Do not infer model, provider, route, cost, or authorship. Evaluate each artifact independently before comparing them. Writing polish matters only when it changes teaching quality.

Score each artifact from 0–4 on every dimension:

1. `sourceFidelity`: every factual claim, example, and answer stays within the supplied claims; no invented named detail or unsupported causal claim.
2. `knowledgePrecision`: facts and key terms are accurate, distinct, complete, and instructionally useful; misconceptions are genuinely false and corrections directly repair them.
3. `scenarioReadiness`: the scenario gives an actionable disciplinary decision, inspectable evidence, and a real constraint or tension.
4. `assessmentCorrectness`: each declared answer is uniquely correct, supported by its cited fact, and consistent with the explanation.
5. `choiceDiscriminability`: four options are meaningfully distinct, parallel, plausible, and free of duplicates or giveaway wording.
6. `feedbackInstructionality`: each explanation teaches why the answer is supported and why the closest misconception fails without referring to answer position.
7. `internalCoherence`: facts, terms, scenario, questions, keys, citations, and explanations agree with one another.

Treat these as critical defects: an incorrect declared answer; explanation/answer contradiction; invented named example; unsupported factual claim; duplicate alternatives that make a question ambiguous; truncated instructional text; or a scenario with no usable decision. A relative winner can still be low quality. Use `tie` only when the artifacts are genuinely equivalent, and `insufficient-evidence` only when the supplied source cannot support a comparison.

For every score, cite a short concrete observation from that artifact. Record critical defects separately. Then choose exactly one decision token: `A`, `B`, `tie`, or `insufficient-evidence`. Return only valid JSON matching the supplied decision skeleton.
