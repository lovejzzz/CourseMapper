# Scion source-bound teacher revision v2

Revise every supplied lesson kernel using only its supplied source claims and diagnoses. You are producing a candidate for a later anonymous judge, not declaring it correct and not comparing models.

For each case:

- Preserve the exact `lessonId` and return every required field.
- Treat the supplied claims as the complete factual universe. Delete or rewrite any statement that requires outside textbook knowledge, even when that statement is generally true.
- Every fact, definition, example, correction, scenario inference, correct option, and explanation must be directly entailed by one or more supplied claims.
- If a claim names a term without defining it, do not invent a definition for that term; choose a different source-anchored term with enough supplied information.
- Write exactly five distinct facts. Each fact must be 8–20 words and directly traceable to a supplied claim.
- For every key term, copy `tr` as an exact 1–4-word phrase that appears verbatim in a supplied claim, and repeat that exact phrase verbatim in at least one fact. Do not invent compressed labels such as “question-fit test,” “change classification,” or “field energy location.”
- Key terms must make five different instructional moves across `tr`, `df`, `eg`, `mi`, and `cx` without repeating fields. `df` must state a real defining distinction. `eg` must apply the term to a small concrete case or comparison using substantially different wording from `df`; do not restate the definition as the example. `cx` must directly correct only the false predicate in `mi`, remain entailed by the supplied claims, and use substantially different wording from `df`; do not repeat the definition as the correction.
- Do not copy the full lesson title as a key term. Do not invent named people, places, organizations, studies, products, statistics, causes, mechanisms, or consequences. Every named phrase must appear verbatim in a supplied claim.
- Write `su` as exactly two specific sentences. Include at least two inspectable details, a decision the learner must make, and a genuine constraint or tension; do not use a generic one-sentence setup.
- Begin `ma` with the literal label `Evidence packet:` and explicitly name at least two details from `su` that the learner must use. Name at least two inspectable evidence types using concrete nouns such as `report`, `note`, `diagram`, `data`, `observation`, `quote`, `measurement`, `record`, `transcript`, `survey`, `passage`, or `plan`; a generic “sheet” does not count. Make the scenario resolvable from the supplied claims without introducing new disciplinary facts.
- Write exactly two multiple-choice items. Each `q` must be 20–45 words and ask about a concrete observation, comparison, decision, or case—not direct definition recall. Put the uniquely supported option first, set `ai` to `0`, and set `fi` to the one zero-based fact index that directly supports it. Options must be parallel and distinct. Only the correct option may closely repeat the supporting fact: each distractor must avoid copying three or more content words from any fact or supplied claim. Explanations must support the answer and correct the closest distractor without referring to answer position.
- Do not use absolute option language such as `always`, `never`, `only`, `all`, `none`, `must`, `cannot`, `entirely`, or `guarantees` unless that exact absolute is required by a supplied claim. Prefer a bounded, observable contrast.
- Address every diagnosis. Do not preserve unsupported detail merely because it appeared in the original artifact.
- Return only JSON matching the supplied schema. Do not include Markdown or prose outside the JSON fields.

This revision is source-constrained synthesis. It is not human, instructor, independent, classroom, or production evidence.
