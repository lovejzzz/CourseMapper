# CourseMapper evaluation system

CourseMapper now separates three different questions that the old 40-fixture score blurred together:

1. **Compiler contract:** did deterministic generation and packaging behavior regress?
2. **Independent instructor benchmark:** would two unrelated instructors use the generated materials with no more than minor edits?
3. **Production canary:** did a real provider produce a retained, inspectable package that passes operational, quality, and rendered visual checks?

The 40 fixtures remain valuable, but only as contract tests. They do not constitute independent evidence that a course is teachable.

For model improvement, use the paired quiz diagnostic on two saved real generations. It compares authoring behaviors instead of trusting model names, surfaces only measured reference advantages as learning targets, preserves candidate advantages, and calls out shared weaknesses:

```bash
npm run audit:quiz:contrast -- \
  --candidate /path/to/scion/project.json \
  --reference /path/to/reference/project.json \
  --candidate-label Scion \
  --reference-label Reference
```

The report is written to `verification-output/quiz-contrast/latest.md`. A single pair is directional evidence for prompt and compiler changes; it is not a substitute for the independent benchmark or production canaries.

If an advisory model judge is added to a paired comparison, run the same packet twice with the order reversed (`A/B` and `B/A`). Normalize scores back to the real packet labels. If the preferred packet flips with position, either packet's score moves by more than two points, or both readings prefer the same letter position while the underlying packet preference flips, mark the judge verdict **inconclusive**. Do not average an order-biased pair into a claimed win.

## Gate profiles

| Profile      | Contract fixtures                                 | Instructor benchmark | Production canaries | Allowed claim                                    |
| ------------ | ------------------------------------------------- | -------------------- | ------------------- | ------------------------------------------------ |
| Pull request | 12 representative fixtures plus impacted fixtures | Advisory             | Advisory            | Compiler contract only                           |
| Main         | All 40 fixtures                                   | Advisory             | Advisory            | Compiler contract only                           |
| Release      | All 40 fixtures                                   | Strict               | Strict              | Independently validated only when all tiers pass |

Run them with:

```bash
npm run audit:evaluation:pr -- --changed-from <base-sha>
npm run audit:evaluation:main
npm run audit:evaluation:release
```

The release profile is deliberately red until the independent evidence exists. Do not replace missing reviews with AI-written reviewer forms or promote structural Office validation to rendered visual QA.

## Independent instructor benchmark

The benchmark roster lives in [`independent-benchmark/manifest.json`](independent-benchmark/manifest.json). It targets eight real syllabi across short, standard, and semester scope and at least four modalities. At least six cases must be completed.

Each completed case requires a hash-verified source syllabus, its hash-verified generated package, and two independent working instructors. The primary metric is whether both reviewers would teach that exact package as-is or with minor edits. Review forms are generated under `verification-output/independent-benchmark/review-forms/`; completed forms should be stored in a non-generated benchmark evidence directory and referenced from the manifest.

The benchmark passes only when:

- at least six cases are complete;
- at least four modalities and scopes 5, 8, and 14 are represented;
- at least 80% of completed cases are usable with minimal edits;
- median estimated editing time is no more than 15 minutes per lesson; and
- reviewer score spread stays within the agreement threshold.

## Production canaries

The canary policy lives in [`production-canaries/policy.json`](production-canaries/policy.json). A release needs at least three recent real-provider runs across two domains, including the public Scion provider family.

A proof-eligible run must retain the generated ZIP, trace, and console log by content hash and include fresh rendered visual QA. Operational success alone is recorded but cannot satisfy the release gate.

The original User Experience Design Studio run is intentionally preserved at 89/B with one P1. The latest local follow-up records the real improvement to 99/A, 12/12 authored lesson kernels, and zero P0/P1 findings. Its deterministic paired quiz diagnostic matches the Luna packet's applied-MC share, preserves Scion's stronger contrastive rationales, and clears the cue-free plus claim-evidence-boundary short-answer checks that both earlier packets failed. An order-reversed advisory judge preferred the second packet in both orders and moved one packet by more than two points, so that verdict is correctly recorded as inconclusive rather than a model win. Fresh rendered QA passed for representative quiz documents. The artifacts are not durably retained, so the runs remain useful operational evidence and **are not release proof**.

## Current claim

Until the human benchmark and canary policy pass, CourseMapper may claim that its deterministic compiler contract passes. It may not claim that the exported materials are independently validated, instructor-ready, or production-proven.
