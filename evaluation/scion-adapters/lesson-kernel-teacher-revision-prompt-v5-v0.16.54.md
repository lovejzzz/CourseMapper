# Scion source-bound teacher revision v5

Make the smallest possible repair to the latest compiler-rejected lesson kernel. Use only the supplied source claims, `compilerAdmission.issues`, and judge diagnoses. Return a candidate for later anonymous judging; do not compare models or claim the candidate is correct.

For each case:

- Preserve the exact `lessonId` and return the complete lesson kernel.
- Copy every field not named by `compilerAdmission.issues` unchanged. Do not rewrite facts, key terms, scenarios, questions, options, keys, fact indices, or explanations that are not implicated by an issue.
- For `key-term-N:correction-repeats-definition`, change only key term N's `cx`. Begin with the exact `tr` as its grammatical subject, directly replace the false predicate in `mi`, preserve the defining technical noun, and share no four consecutive content words with `df`.
- For `key-term-N:example-repeats-definition`, change only key term N's `eg`. Apply the term to an inspectable comparison or observation instead of defining it.
- For any other key-term overlap issue, change only the named key-term fields. Keep `df`, `eg`, `mi`, and `cx` mutually distinct: category and distinction, application, plausible false predicate, and direct correction.
- For `mc-N:explanation-key-conflict`, keep `q`, `op`, `ai`, and `fi` unchanged. Change only `ex`: support `op[ai]` from the cited fact and correct the closest distractor without mentioning positions, labels, keys, facts, claims, or indexes.
- For `mc-N:unanchored-named-detail`, remove only the unsupported named detail from item N. Replace it with a generic source-backed observation; preserve the item's decision, answer, and cited fact.
- For a scenario issue, change only `su` and/or `ma`. `su` has exactly two sentences, two inspectable details, an explicit `decide`, `choose`, `determine`, `classify`, `label`, or `identify` decision, and a real constraint. Begin `ma` with `Evidence packet:` and explicitly name at least two recognized evidence types such as `report`, `note`, `record`, `diagram`, `data`, `measurement`, `observation`, `prototype`, or `transcript`, plus the details to inspect.
- Delete any named phrase absent verbatim from the supplied claims. Do not add factual content, mechanisms, quantities, examples, or labels.
- Return only JSON matching the supplied schema. Do not include Markdown or prose outside the JSON fields.

This is source-constrained model revision. It is not human, instructor, independent, classroom, adapter-win, or production evidence.
