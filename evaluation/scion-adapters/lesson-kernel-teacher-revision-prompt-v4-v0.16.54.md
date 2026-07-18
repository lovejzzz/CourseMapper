# Scion source-bound teacher revision v4

Repair the latest compiler-rejected revision for every supplied case. Use only the supplied source claims, the supplied compiler-admission issues, and the supplied judge diagnoses. Return a candidate for a later anonymous judge; do not claim it is correct and do not compare models.

For each case:

- Preserve the exact `lessonId` and return the complete lesson kernel. Treat the supplied claims as the entire factual universe.
- Fix every item in `compilerAdmission.issues`. Do not preserve a rejected sentence merely because it appeared in `originalArtifact`.
- Write exactly five distinct 8–20-word facts, three key terms, one decision-ready scenario, and two multiple-choice items.
- Every `tr` is an exact 1–4-word phrase appearing verbatim in a supplied claim and in at least one fact. Do not use the full lesson title.
- `df` is one complete sentence that states the term's category and defining distinction using only supplied claims.
- `eg` applies the term to a bounded comparison or observation. It must not paraphrase `df` and may use no named detail absent from the supplied claims.
- `mi` states one plausible false predicate about the term. It must not repeat or merely negate `df`.
- Begin every `cx` with its exact `tr` phrase as the grammatical subject. Then state the source-backed replacement for the false predicate in `mi`. Include the defining technical noun needed to preserve the term's identity. Do not copy four consecutive content words from `df`, do not repeat `mi` and negate it, and do not restate the complete definition.
- Delete any named phrase, person, place, organization, study, product, mechanism, statistic, or example that does not appear verbatim in a supplied claim. When repairing `unanchored-named-example`, start `eg` with the source-anchored proper noun or acronym itself, or remove it; do not place `When`, `Using`, `In`, or another capitalized sentence opener immediately before it.
- `su` has exactly two sentences with two inspectable details, a learner decision, and a real constraint or tension. State the decision with an explicit verb such as `decide`, `choose`, `determine`, `classify`, `label`, or `identify`; do not rely on `order`, `rank`, `compare`, or `evaluate` alone. Begin `ma` with `Evidence packet:` and name at least two concrete evidence types and the details to inspect.
- Each `q` has 20–45 words and asks about an observable distinction or case. Put the uniquely source-supported option first, use `ai: 0`, and cite exactly one supporting zero-based fact index in `fi`.
- Use four parallel, meaningfully different options. Only the correct option may closely echo the cited fact. Do not use `always`, `never`, `only`, `all`, `none`, `must`, `cannot`, `entirely`, or `guarantees` in any option.
- `ex` must directly support the first option from the cited fact and correct the closest distractor. Never mention answer position, option labels, keys, fact numbers, claim numbers, or source indexes.
- Return only JSON matching the supplied schema. Do not include Markdown or prose outside the JSON fields.

This is source-constrained model revision. It is not human, instructor, independent, classroom, adapter-win, or production evidence.
