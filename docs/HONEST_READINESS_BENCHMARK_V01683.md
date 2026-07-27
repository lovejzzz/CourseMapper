# Honest Automated Readiness Benchmark

## V0.16.83 — A Score That Knows What It Cannot Prove

### Goal

Replace the generous 99/A product signal with a bounded, reproducible readiness measure that distinguishes automated evidence from deterministic package conformance and independent educational validation.

### Lane

This release changes measurement, reporting, Algi composition diagnostics, and score consistency. It does not change Gemma weights, activate the optional adapter, claim a model win, or treat automated checks as instructor or classroom evidence.

### Release Boundary

V0.16.83 proves that one automated readiness protocol can:

- score low-evidence packages materially below polished structural conformance;
- reward exact brief fidelity and trusted source breadth without crossing the independent-evidence boundary;
- resist fake grounding from internal reference fields;
- explain the result through five stable components;
- preserve one finish-pass score across the workspace, manifest, and ZIP report; and
- fail closed when Algi research cannot compose enough lesson-owned evidence.

It does not prove factual correctness, teachability, accessibility, instructor approval, classroom outcomes, paid-provider parity, Scion superiority, Algi superiority, or adapter superiority.

## The measurement model

Automated Readiness is shown on a 0–100 scale. The current automated evidence tier has a hard ceiling of 69:

| Component                 | Weight | Evidence examined                                                                                              |
| ------------------------- | -----: | -------------------------------------------------------------------------------------------------------------- |
| Curriculum fidelity       |     25 | Exact course title, lesson count, requested sequence, and lesson identity                                      |
| Evidence grounding        |     25 | Trusted concept-linked sources, source breadth, and real source support rather than internal reference strings |
| Instructional specificity |     20 | Concrete learner-visible activities, decisions, products, and evidence use                                     |
| Assessment coherence      |     15 | Observable assessment demands and alignment across the package                                                 |
| Package integrity         |     15 | Encoded findings, finish state, export verification, and material completeness                                 |

Package conformance remains a separate deterministic result. It is valuable for detecting encoded defects, but it is not presented as the readiness or teaching-quality score.

## Locked benchmark V1

The benchmark cases are frozen in `evaluation/automated-readiness/v1/cases.json`. The executable audit is `npm run audit:automated-readiness`.

| Case                                | Allowed window | Current result | Purpose                                                                                  |
| ----------------------------------- | -------------: | -------------: | ---------------------------------------------------------------------------------------- |
| Generic Algi, zero trusted evidence |          20–35 |             26 | Prevent polished templates and internal references from earning a generous score         |
| Exact Scion, source-thin            |          55–64 |             61 | Reward real fidelity and specific materials while keeping weak source breadth visible    |
| Exact, source-rich positive control |          65–69 |             68 | Verify that stronger automated evidence approaches but cannot cross the independent tier |

The audit also requires correct ordering, the 69-point ceiling, the claim-boundary text, a score distinct from the conformance fixture, and case-specific component behavior.

## Anti-gaming rules

1. `sourceRef` coverage without trusted concept-linked source rows earns no grounding credit.
2. A single trusted source cannot make a multi-lesson package look broadly grounded.
3. Structural conformance cannot substitute for evidence grounding.
4. The positive control cannot cross 69 without a different evidence-tier protocol.
5. Changing the evaluator changes the transitive grader receipt and requires a new frozen held-out ruler.

## Real browser result

The five-lesson Urban Heat Resilience and Environmental Justice brief preserved its exact title, lesson count, and requested sequence. The opt-in research route found sources, but only one lesson kernel cleared composition. The final result was:

- Automated Readiness: 54/100
- Package conformance: 89/B
- Curriculum fidelity: 100
- Evidence grounding: 28
- Instructional specificity: 98
- Assessment coherence: 90
- Package integrity: 92
- Admitted lesson kernels: 1/5

The result stayed in refinement rather than receiving a false green state. The verified package action downloaded a valid 56-entry ZIP.

The first archive exposed a score-consistency defect: the workspace retained the finish-pass 54/100 result while ZIP assembly interpreted `quizBank` as a missing physical file, discarded the receipt, and recomputed 51/100 from a narrower snapshot. The fix recognizes logical evidence surfaces separately from physical paths. A second archive retained 54/100 in the workspace, `PACKAGE_MANIFEST.json`, and `QUALITY_REPORT.md`.

## Algi diagnostics learned from the benchmark

Algi now records why evidence could not compose:

- candidate and required term counts;
- selected concepts;
- per-term decline reasons;
- bounded attempt history; and
- a reason histogram for the run trace.

Composition can use a later exact anchored passage when a weak abstract lead omits the lesson term. Evidence-based multiple-choice items reject duplicate source excerpts and use explicit evidence-absence alternatives instead of inventing distinctions. Wrapper-heavy research titles are narrowed, while already-specific lesson titles preserve their exact search intent.

## Frozen grader boundary

Deep grader v1.11.0 imports the readiness evaluator and reports conformance separately. Held-out benchmark V25 binds the complete 15-file transitive implementation receipt. V25 preserves the same five prompt-only Crucible fixtures and runtime-task policy as V24 but inherits no prior score, adapter result, or promotion claim.

## Next evidence tier

Scores above 69 require a new protocol with independent evidence. The next legitimate work is:

1. qualified instructor review against a fixed rubric;
2. observed learner use or classroom evidence where feasible;
3. independent accessibility review;
4. held-out factual/source verification; and
5. matched multi-route comparisons using identical briefs, sources, compiler commit, and export boundary.

Until that evidence exists, the product should remain proud of a truthful 54 or 68 instead of displaying an unearned 99.
