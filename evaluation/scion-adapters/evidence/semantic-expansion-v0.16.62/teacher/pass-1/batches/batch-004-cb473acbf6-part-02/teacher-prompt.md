# Scion source-ledger teacher revision v8

Repair every compiler-rejected or judge-rejected lesson kernel using only its supplied source claims, current `compilerAdmission.issues`, and anonymous judge diagnoses. Return a candidate for later anonymous reversed-order judging. Do not compare models or declare the candidate correct.

For each case:

- Preserve the exact `lessonId`. Copy the supplied source claims into `facts` exactly, in the same order and with identical wording and punctuation. The source ledger is immutable.
- Return the complete lesson kernel. Copy every field not implicated by a current compiler issue or judge diagnosis unchanged.
- Treat the source claims as the complete factual and vocabulary universe. Add no outside mechanism, quantity, category, named actor, named feature, named artifact, or disciplinary example—even when generally true. A concrete example may recombine literal source phrases, but every subject and object it names must occur in the supplied claims.
- Repair every listed current compiler issue and every winner critical defect. When a diagnosis names one key-term atom such as `eg`, change that atom and preserve the other key-term atoms unless they share the defect.
- If an issue names an MC item, re-author that complete item (`q`, `op`, `ai`, `fi`, and `ex`) because its stem, choices, citation, key, and explanation form one semantic unit.
- Each MC stem is a 20–45-word observable distinction, comparison, or decision. It must supply enough source-grounded context for exactly one answer.
- Put the uniquely supported option first and set `ai` to `0`. Set `fi` to the one or two zero-based source-fact indexes directly needed to prove that option.
- Write exactly four parallel 4–10-word options. Every distractor must be false or inapplicable under the cited claims. No two options may be algebraically, logically, or comparatively equivalent; swapping subjects with inverse words still counts as equivalent.
- Never use `always`, `never`, `all`, `none`, `only`, `unchanged`, `unmodified`, `no other`, or `without` in an option unless the cited source fact states that exact restriction. Do not use answer positions, option labels, fact numbers, claim numbers, or template instructions anywhere in learner-facing text.
- `ex` first states why `op[ai]` follows from the cited claims, then corrects exactly one closest distractor. It must not affirm, permit, or partially support a second option.
- If a scenario issue is listed, change only `scenario`. `su` must have exactly two specific sentences, at least two inspectable details, an explicit `decide`, `choose`, `determine`, `classify`, `label`, or `identify` decision, and a real constraint. `ma` must name at least two concrete records, observations, passages, notations, measurements, or designs to inspect. Add no unsupported quantity or disciplinary fact.
- Keep `df`, `eg`, `mi`, and `cx` as four different instructional moves: defining distinction, bounded application, genuinely false learner belief, and direct source-backed correction. The correction must resolve the misconception without repeating the definition or example.
- Every changed field must be visibly different from the rejected field and must remain directly warranted by the supplied claims.
- Return only JSON matching the supplied schema. Do not include Markdown or prose outside the JSON fields.

This is source-constrained model revision. It is not human, instructor, independent, classroom, adapter-win, or production evidence.
