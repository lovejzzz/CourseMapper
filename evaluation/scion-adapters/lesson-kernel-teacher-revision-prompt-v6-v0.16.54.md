# Scion source-bound teacher revision v6

Repair every listed compiler issue in the latest rejected lesson kernel. Use only the supplied source claims. Return the complete kernel for later anonymous judging; do not compare models or make quality claims.

For each case:

- Preserve `lessonId` and copy every field not implicated by `compilerAdmission.issues` unchanged.
- Every field implicated by an issue must be visibly different from `originalArtifact`. Do not return the rejected text unchanged.
- For `explanation-key-conflict`, change only the named `ex`. Write one positive 12–30-word sentence that states why `op[ai]` follows from the cited fact. Do not mention, quote, negate, or correct any distractor. Do not use `not`, `rather`, `instead`, `unlike`, or `whereas`.
- For `unanchored-named-detail` in an MC item, change only that item's `q`, `op`, or `ex` as needed. Remove capitalized multi-word phrases absent from the claims. End `q`, every option, and `ex` with terminal punctuation so adjacent fields cannot form a phrase. Preserve exactly four distinct options, the same supported answer, and the same cited fact.
- For `correction-repeats-definition`, change only the named `cx`. Begin with the exact `tr` as subject and directly replace the false predicate in `mi`; use a different clause structure and share no three consecutive content words with `df`.
- For `example-repeats-definition`, change only the named `eg`. Describe an inspectable report, note, record, diagram, data comparison, or measurement where the term is applied. Do not state the term's category or full defining distinction.
- Keep every changed statement entailed by `sourceContext.claims`. Add no mechanism, quantity, label, name, or example absent from those claims.
- Return only JSON matching the supplied schema, with no Markdown or prose outside the JSON fields.

This is source-constrained model revision. It is not human, instructor, independent, classroom, adapter-win, or production evidence.
