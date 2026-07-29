# Scion V0.16.96 — Evidence First, End to End

## Release decision

Scion should seek trusted evidence because a lesson needs evidence, not because a browser failed a device-capability check.

V0.16.96 makes evidence coverage the authority for the current-source offer on every Scion route. It also closes the provenance, compilation, review-note, and language seams that could weaken or obscure admitted evidence after the user opted in.

## Goal

When a Scion coverage forecast identifies an unsupported lesson:

1. offer authoritative current-source research before generation on every device;
2. keep the network boundary explicit and consented;
3. preserve admitted source identity and support receipts through generation, Agent context, and export;
4. repair known malformed deterministic instructional language before it reaches any deliverable; and
5. tell the user the exact remaining review task rather than showing an unexplained generic warning.

## Lane

Scion coverage forecasting, explicit source-research consent, evidence normalization, native graph authoring, package-review communication, shared compiler language, and clean-browser/physical-export acceptance.

## Why this work was necessary

Scion already had separate decisions for evidence and authoring, but the setup UI accidentally coupled them. The current-source action was gated by `scionDeviceCapability.evidenceCompiler`. A browser capable of running the local Gemma base could therefore have uncovered lessons without receiving the same source option shown on the zero-download route.

That was the wrong boundary. WebGPU, storage, and runtime health should determine how Scion writes. They should not determine whether an unsupported lesson deserves authoritative evidence.

The audit also found three downstream seams:

- evidence normalization retained the visible citation but discarded provider, topic, tier, concept-link, and revision metadata;
- the public Scion research route used `scion-source-researched`, while native compilation preserved the full fact ledger only for the older internal `algi-researched` label; and
- Agent package notes replaced actionable grader findings with a generic request for instructor review.

A real generated sentence exposed a fourth seam in the deterministic compiler: prefixing an imperative routine with `During <lesson title>` produced malformed instructions such as “During urban biodiversity surveys trace whose evidence is represented…”.

## Implementation

### 1. Coverage-driven source action

`src/lib/scionEvidenceForecastAction.js` owns the setup decision:

```text
Scion selected
+ forecast ready
+ at least one uncovered lesson
+ research not already enabled
= offer current-source research
```

Device capability is intentionally absent. The device still selects the local Gemma or exact-source compiler route after evidence preparation.

Landing copy now states that the action sends only the course title and uncovered lesson topics to the named open-source providers, verifies source passages, stores compact evidence locally, and gives that evidence to the local course writer.

The expanded Scion card also replaces its implementation-heavy opening sentence with the product promise: **Scion is fully free—and always will be.** The technical model/compiler composition remains documented in the README rather than competing with the setup task.

### 2. First-party accessibility source families

The strict W3C/WAI catalog adds:

- [Understanding Conformance](https://www.w3.org/WAI/WCAG22/Understanding/conformance)
- [Evaluating web accessibility](https://www.w3.org/WAI/test-evaluate/)
- [Easy Checks](https://www.w3.org/WAI/test-evaluate/preliminary/)
- [WCAG-EM overview](https://www.w3.org/WAI/test-evaluate/conformance/wcag-em/)

These pages cover conformance, evaluation strategy, preliminary checks and their limits, and conformance-evaluation methodology. They complement the existing WAI topic tutorials without weakening evidence admission.

Shared words such as “accessibility,” “keyboard,” and “WCAG” appear across most WAI pages, so lexical overlap alone is not a safe source router. Scion now classifies the bounded WAI catalog into WCAG, page-structure, forms, and evaluation families. A testing lesson receives evaluation-method sources; an accessible-forms lesson keeps forms sources; a semantic-HTML lesson keeps structure sources. The instruction still comes from inspected live source text—the family is routing metadata, not hard-coded course content.

WAI pages do not all expose identical cross-origin behavior. Catalog loading therefore uses independent settled requests: one page that declines a browser fetch no longer erases the other verified pages in the batch.

### 3. Evidence adequacy and exact payload selection

A structurally complete genome kernel is no longer automatically treated as adequate. When an accessibility lesson explicitly promises an audit, evaluation, test, or remediation method, Scion checks whether the existing source ledger actually supports that method. A broad WCAG citation does not satisfy an evaluation-method promise; with consent enabled, the lesson proceeds to authoritative WAI research.

After research, the admitted facts and their citations move as one trust transaction. A newly researched ledger displaces older generally related content only when the candidate kernel reproduces the immutable admitted facts exactly. An older genome partial cannot overwrite current researched evidence, and current citations cannot be rebound onto yesterday’s facts merely because both payloads are structurally valid.

### 4. Provenance continuity

Citation normalization now preserves:

- provider or provider id;
- topic;
- source tier;
- concept links;
- revision id and timestamp;
- source kind; and
- claim-to-passage support receipt.

Native graph authoring treats both `algi-researched` and the production `scion-source-researched` origin as source-bound research. When every citation satisfies the trusted-source contract, the complete admitted immutable fact ledger reaches compilation.

This makes the intended path explicit:

```text
coverage gap
→ explicit research consent
→ admitted source passage and support receipt
→ Scion evidence layer
→ native lesson kernel
→ CourseGraph
→ Agent + package manifest + source report
```

### 5. One evidence truth for the Agent and export

The Agent and export now read every citation in the exact lesson evidence overlay before consulting capped classroom-resource projections. This matters because a lesson can legitimately retain several official receipts while the visible resource list stays compact.

For the accessibility acceptance course, Lesson 4 keeps all three distinct source roles:

- **Evaluating web accessibility** establishes that tools assist evaluation but do not replace knowledgeable human judgment.
- **Easy Checks** supports a preliminary review and explicitly does not prove comprehensive accessibility or conformance.
- **WCAG-EM overview** supplies the structured conformance-evaluation method.

The Agent can name all three boundaries, and `PACKAGE_MANIFEST.json` plus `SOURCE_REPORT.md` retain the same three Lesson 4 receipts. The visible resource cap can no longer silently truncate the evidence that ships.

### 6. Exact package review notes

The Agent package state now keeps up to five exact grader findings. Each item retains:

- the humanized quality dimension;
- the grader's actionable detail;
- the affected file or evidence when available;
- the aggregate count on the first item; and
- blocker or warning severity.

The compact status can remain concise, but **Show notes** no longer asks the user to guess what “review generated content” means.

### 7. Compiler-owned language repair

Evidence, feedback, and instructor routines now place the imperative before the lesson context:

```text
Trace whose evidence is represented during Urban biodiversity surveys.
```

The old construction is rejected:

```text
During Urban biodiversity surveys trace whose evidence is represented.
```

Because this repair sits in the shared deterministic compiler, Scion and every compatible paid-provider route inherit it.

Two unfinished-sounding labels found in the generated instructional surfaces were also replaced: **Draft-readiness scan** is now **Submission-readiness scan**, and “fits their draft” is now “fits their current work.”

### 8. Cache contract reset

Research cache protocol V17 and lesson-kernel contract V11 intentionally reject older entries. This is required correctness work, not cosmetic cache churn: replaying a pre-release entry could restore a source-family mismatch, a dangling source clause, a stale partial overlay, or a truncated evidence ledger before the repaired research path had a chance to run.

## Automated proof

Completed on the exact V0.16.96 release tree:

- focused regressions for the coverage action, W3C source-family selection and partial-fetch resilience, evidence adequacy, exact fact/citation selection, stale-partial protection, Agent source boundaries, full export-ledger coverage, exact review notes, cache invalidation, malformed compiler routines, and the fully-free landing copy;
- full unit suite: 476 files and 5,922 tests passed; 16 files and 162 tests intentionally skipped;
- lint and repository-wide formatting passed;
- production build and unchanged JavaScript/model-weight bundle budgets passed;
- all 152 Chromium scenarios passed, including mobile, tablet, desktop, dark mode, autosave, Agent, export, and the new Scion-copy assertion;
- CurriculumOS headless proof compiled 9/9 deliverables, linked 8/8 lessons, and graded 99/A with 0 P0 findings;
- all 40 main evaluation fixtures passed under the compiler-contract-only claim boundary;
- all 12 PR contract fixtures passed;
- all eight V0.16.96 release claims passed the release-history audit; and
- the frozen V29/V30 grader implementation receipt is rebound to the exact 15-file release implementation.

## Browser acceptance contract

Use a clean browser origin and build this exact course:

> Digital Accessibility for Product Teams, exactly four lessons: WCAG principles and conformance; semantic HTML and keyboard accessibility; accessible forms; evidence-based accessibility testing and remediation. Build an undergraduate project-based course with practical audits, source-grounded exercises, and a final remediation plan.

The acceptance must prove:

1. the coverage forecast offers **Use current sources & generate** even when local Gemma is available;
2. the consent copy names the network boundary before the click;
3. the Living Course Compiler transparently advances through evidence, map, enrichment, compilation, verification, and grading;
4. all four named lessons remain in order;
5. all nine material families complete and the package reaches its honest final state;
6. the Agent answers which official sources support accessible forms and how Lesson 3 evidence informs Lesson 4 testing and remediation;
7. exact package notes are actionable if any finding remains;
8. desktop, tablet, mobile, light, and dark states remain usable;
9. the browser console contains no application error; and
10. the one exported ZIP passes archive, nested-document, manifest, source-report, quality-report, and malformed-language checks.

## Browser and physical-package acceptance

The clean local acceptance used the exact four-lesson brief above.

Observed browser result:

- completed in 4 seconds on the warm exact-source route;
- preserved all four requested lessons in order;
- reached 4/4 knowledge kernels and 9/9 material families;
- showed 69/100 Automated Readiness, 99/100 (A) package conformance, texture 96, zero encoded findings, and one ZIP action;
- showed no application console errors or warnings in the inspected run;
- kept Lesson 2 on page-structure sources, Lesson 3 on forms sources, and Lesson 4 on evaluation sources; and
- answered “List every official source assigned to Lesson 4, including the evaluation methodology, and explain why Easy Checks cannot prove conformance” with all three official sources and the correct use boundary for each.

The expanded light-theme Scion card was then inspected again on the final tree: it showed Scion V0.16.96, the old implementation sentence was absent, the fully-free promise was visible, and the card remained aligned without clipping.

The accepted physical artifact is:

`/Users/tianxing/Downloads/Digital Accessibility for Product Teams - Course Materials (36).zip`

Physical inspection result:

- 689,702 bytes; SHA-256 `2a517c3d4e424e853a4010b3bc8806baf517f367d2d9ceeae2dd7ad16327d040`;
- outer ZIP and every nested DOCX, PPTX, and XLSX container passed archive integrity;
- manifest readiness is `ready`, with 0 blockers, 0 warnings, and 10/10 checked sections;
- the source ledger contains 14 retained receipts, including Evaluating web accessibility, Easy Checks, and WCAG-EM bound to Lesson 4;
- source-reference coverage is complete for 12/12 outcomes, 8/8 activities, 4/4 examples, 4/4 assessments, 12/12 rubric criteria, and 8/8 factual claims; and
- inspected Markdown, JSON, and Office XML contain none of the rejected clipped sentence, malformed `During … trace` frame, placeholder tokens, internal Algi name, or unfinished `draft` wording.

The two scores describe different things. **69/100 Automated Readiness** is intentionally capped because no independent human evidence exists. **99/A package conformance** means the encoded package checks found no defect; it does not raise the evidence tier or certify the content.

## Release Boundary

V0.16.96 changes evidence orchestration, source-provenance continuity, deterministic instructional language, and review-note specificity.

It does not change the pinned Gemma weights, claim a trained Scion model, activate the optional adapter, or prove factual correctness, teaching effectiveness, accessibility conformance, instructor approval, classroom outcomes, student outcomes, or paid-model superiority. Automated Readiness remains an engineering signal under its existing independent-evidence ceiling.
