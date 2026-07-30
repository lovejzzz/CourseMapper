# EDUTOOL Code Review — Six-Round Review and PR #110 Follow-up

**Date:** 2026-07-30

**Reviewed revision:** `eb59946` (`main`)

**Follow-up revision:** `df606cc` (`codex/v0.17.00-trust-boundary`, PR #110)

**Reviewers:** Codex CLI, Claude CLI, and Antigravity CLI

**Method:** Six discussion rounds across two Roundtable sessions, followed by
independent verification in the working tree. PR #110 then received a separate
five-round, 15-turn review in Roundtable v0.0.0.25, followed by another
independent implementation audit.

## Evidence policy

This report treats source code, executable behavior, tests, and measured
repository facts as evidence. README, roadmap, changelog, specification, and
release-contract prose were excluded from conclusions about current behavior.
Some early Roundtable turns referenced documentation before the owner corrected
the review standard; those claims are not used here.

## Executive assessment

EDUTOOL is best understood from its implementation as a local-first curriculum
compiler. It turns source material into a course model, generates and compiles
aligned instructional artifacts, grades the assembled package, and exports a
multi-format ZIP with evidence reports. The code is far beyond a prompt wrapper:
it contains a substantial deterministic compiler, provenance machinery,
readiness checks, export verification, persistence, and a large automated test
surface.

The main risk is no longer missing capability. It is that the same package can
be represented through several overlapping trust, readiness, warning, and
lifecycle shapes. Those shapes are reconstructed by different UI and export
surfaces, and several boundaries lose or duplicate evidence. The most valuable
next phase is therefore to establish one canonical finish record and make every
consumer use it.

I would not rewrite EDUTOOL and I would not add another deliverable family now.
The engine is valuable. The next work should make its trust claims simpler,
order-independent, and testable end to end.

## Goal

Make the package finish record lossless, order-independent, and auditable from
the code path that produces it through every trust consumer.

## Lane

V0.17.00 is a deterministic package-trust stabilization lane: severity policy,
source-evidence handoff, warning ownership, and completed-receipt presentation.

## Release Boundary

This release does not migrate the full `AppFlow` lifecycle into a new state
machine and does not replace the native-generation positional API. It makes no
new model, provider, factual, accessibility, instructor, learner, or classroom
outcome claim.

## What is strong

### 1. The implementation has a coherent product engine

The runtime path spans source ingestion, CourseIR/course-graph authoring,
generation, deterministic compilation, package finalization, quality grading,
and ZIP assembly. The largest implementation units—especially
`courseBlueprintCompiler.js`, `useDeliverables.js`, and `AppFlow.jsx`—show that
the product is designed to maintain alignment across many artifacts rather than
generate isolated text.

### 2. Source and export evidence are real implementation concerns

`buildCourseMaterialsZip()` builds a package manifest and emits source,
readiness, and quality reports. The assemble-only path merges ledger bundles
and CourseIR source proof. `deepQualityGrader` runs source-ledger checks and can
turn missing or weak proof into graded findings. This is a meaningful
architectural strength.

### 3. Privacy defaults are conservative

The public Scion research gate defaults off through
`readScionResearchEnabled()`. External course-topic research is suppressed when
that setting is disabled. Compiler-installed, verbatim-counted source markers
also reduce reliance on unverified model claims.

### 4. The test surface is unusually extensive

Baseline verification at the reviewed revision completed successfully:

| Check                      |                    Result |
| -------------------------- | ------------------------: |
| Unit/component suite       | 5,984 passed, 162 skipped |
| Test files                 |    480 passed, 16 skipped |
| Production build           |                    Passed |
| Lint                       |                    Passed |
| Bundle/repository ratchets |                    Passed |

The suite is a real asset. The concern is not lack of tests; it is that some
architectural tests cover selected files or synthetic shapes rather than the
producer-to-consumer contracts most likely to drift.

## Prioritized findings

### P0 — Trust classification depends on finding order

`buildQualityReviewIssues()` in
[`src/lib/packageTrustStatus.js`](../src/lib/packageTrustStatus.js) keeps grader
insertion order and slices to five items. `getPackageTrustStatus()` then uses
only `qualityIssues[0]` to decide whether quality contributes a blocker.

An executable probe confirmed the behavior:

- finish status: `ready`
- blocker count: `0`
- findings: P1 first, P0 second
- finding counts: `p0: 1, p1: 1`
- result: `state: review`, `blocked: false`, `canDownload: true`

This is an order-dependent trust contract. A P0 after position five can also be
omitted from the visible review list.

There is an important limitation to the severity claim:
[`buildQualityGateIssues()`](../src/lib/packageFinalizer.js) normally adds a
readiness blocker for non-exempt P0 findings, which independently prevents
download. Partial-scope discipline-density findings are deliberately exempted.
Therefore the probe proves the trust helper is unsafe and internally
inconsistent; it does **not** prove every ordinary finalizer-produced P0 package
can bypass export.

**Recommendation:** derive blocker presence from all P0 findings and/or
`findingCounts.p0`, never from the first displayed issue. Severity-sort for
display while always retaining P0s. Add mixed-severity, late-P0, restored-pass,
and partial-scope exemption tests.

### P1 — The canonical source evidence is discarded at the finalize boundary

[`buildCourseMaterialsZip()`](../src/lib/packageZipExporter.js) constructs
structured source evidence in its manifest. `deepQualityGrader` consumes that
manifest, so source defects can reach generic quality findings.

However,
[`gradePackageAtFinalize()`](../src/lib/quality/finalizeQualityGate.js) returns
selected quality fields and discards the assembled manifest. Later,
`buildSourceLedgerIssues()` in `packageTrustStatus.js` expects six receipt keys
that no producer in `src/` writes. That dedicated source-trust branch is dead,
even though generic quality grading still sees some source failures.

**Recommendation:** have `gradePackageAtFinalize()` return a compact,
normalized `sourceEvidence` derived from the manifest it already owns. Store it
on the finish record and have the trust layer consume that representation.
Integration-test an actual source-review row through assembly, grading, and
trust status.

### P1 — Warning evidence is lossy and can be counted more than once

[`AppFlow.jsx`](../src/AppFlow.jsx) produces an aggregate warning count from
readiness, retry, and export domains. `buildQualityReceipt()` is called with
`includeWarnings: finalStatus !== 'ready'`; on warning-bearing ready packages,
the embedded receipt drops some warning detail while the parent pass retains a
warning count.

`getPackageTrustStatus()` then sums overlapping package, readiness, quality,
export, and source views. The Roundtable constructed a valid arithmetic example
where five independent warnings could be reported as seven. A blanket
`Math.max` is not a solution because it can undercount independent domains.

**Recommendation:** make the finalizer emit non-overlapping named domains or
stable issue IDs, for example:

```text
readiness + retry + export + quality + source
```

Consumers should read that canonical representation once. Legacy restored
passes can use a separate, explicitly tested fallback. Persist all evidence;
filter only when rendering.

### P1 — Export receipt summaries are unreachable for real warning shapes

`finishSummary` in
[`src/components/ExportSidePanel.jsx`](../src/components/ExportSidePanel.jsx)
returns early unless strict `isPackageReady()` is true. A real export warning
increases `packageQualityPass.warnings`, making that predicate false. The JSX
adds a second `!hasWarnings` guard.

The existing readiness test supplies `warnings: 0` together with
`receipt.exportWarningCount: 1`, a shape the `AppFlow` finalizer does not
produce, and asserts that the export warning is absent. This test ratifies the
dead behavior instead of exercising the producer contract.

**Recommendation:** recognize a completed receipt independently from a clean
package, display repair/export summary information alongside warnings, and
replace the fixture with a producer-valid warning-bearing pass.

### P1 — Workflow state authority is incomplete

`derivePipelineState()` is consumed once in production through
`buildRibbonModel`. `AppFlow` still combines `packageGenerationBusy`,
`gen.isStreaming`, `deliv.isGenerating`, sync state, and other flags to decide
workflow behavior. Chat, export, and ribbon surfaces use different combinations
of phase, strict readiness, trust status, and downloadability.

`tests/v0152-machine-selectors.test.js` scans five selected UI files for direct
status reads but omits `AppFlow`; importing a selector is treated as evidence of
migration even when transition ownership remains elsewhere.

**Recommendation:** after trust semantics are fixed, create one immutable
workflow snapshot with explicitly named capabilities and transition commands.
Migrate one vertical path—generation start through finish and download—and add
scenario tests proving all surfaces receive the same capabilities.

### P2 — Native-generation boundaries use fragile positional contracts

The native generation route crosses
`useGeneration → courseIRAuthoringRuntime → nativeSkeletonGenerationRuntime →
completeCourseMapGeneration` using a 14-element input array and an 18-element
output array. Positional drift can remain syntactically valid and is difficult
to review.

**Recommendation:** replace the arrays with named `context` and `effects`
objects. Add a successful native-flow test that pins state updates, provenance
events, and completion cleanup, not only failure cases.

### P2 — The repository is carrying a large coordination surface

Measured implementation sizes at the reviewed revision:

| File/surface                 |         Size |
| ---------------------------- | -----------: |
| `courseBlueprintCompiler.js` | 28,005 lines |
| `useDeliverables.js`         |  6,033 lines |
| `AppFlow.jsx`                |  4,365 lines |
| `pipelineMachine.js`         |    236 lines |
| Package scripts              |          385 |

The scale is not automatically a defect—the test suite and compiler breadth
explain part of it—but it increases the cost of every competing truth shape.
Extraction should be driven by verified producer/consumer seams, not a
clean-room rewrite.

## Recommended implementation sequence

1. **Harden the download trust gate.** Make P0 detection order-independent,
   preserve every P0 in visible issues, and pin partial-scope semantics.
2. **Define the canonical finish record.** Preserve all warning domains and
   stable issue identity. Return structured `sourceEvidence` from the real
   finalize-time assembly boundary.
3. **Repair immediate UI truth.** Fix the double-gated finish summary and use
   producer-valid fixtures.
4. **Name readiness semantics explicitly.** Distinguish clean, downloadable,
   and finish-complete only where the product genuinely needs separate states.
5. **Transfer workflow ownership.** Move `AppFlow` lifecycle decisions behind
   one snapshot/capability boundary and extend architectural tests beyond
   hand-picked imports.
6. **Replace positional orchestration arrays.** Introduce named context/effects
   objects and a successful end-to-end native-flow test.
7. **Add workflow evidence without a second truth system.** If user-observation
   instrumentation is wanted, derive a user-readable `WORKFLOW_RECEIPT.md` from
   the canonical finish record and place it beside existing ZIP reports.

## V0.17.00 implementation disposition

I agree with the findings at the package trust boundary, and V0.17.00
implements them together because they describe one producer-to-consumer
contract:

| Finding                                               | V0.17.00 disposition                                                                                                                                                                                                               |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0 classification depends on finding order            | Fixed. Blocking counts now inspect every finding through one shared policy; displayed findings are severity-stable and late P0s remain visible. The partial-scope discipline-density exemption is preserved and regression-tested. |
| Finalize drops structured source evidence             | Fixed. Finalize grading now returns a compact `sourceEvidence` snapshot from the assembled manifest, stores it on the finish record, and lets trust surfaces consume exact source findings with legacy fallback support.           |
| Warning evidence is lossy and overlapping             | Fixed. Ready receipts retain their warnings, and new finishes publish one versioned `warningDomains` ledger. Source findings are removed from the general quality subtotal so they are counted once.                               |
| Repair/export summaries disappear when warnings exist | Fixed. A completed receipt—not a pristine-green predicate—controls summary availability, and the warning-bearing component fixture now matches the producer shape.                                                                 |

### PR #110 follow-up audit

The follow-up discussion was explicitly steered to inspect implementation and
tests rather than release prose. The agents traced
`AppFlow → packageFinishEvidence → packageTrustStatus`, then challenged one
another with concrete producer and restored-record shapes. I rechecked every
accepted point against the branch before changing code.

| Code-backed finding                                                                 | Disposition                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Export blockers could be represented by a readiness row, a quality P0, and a scalar | Added versioned `blockerDomains` ownership for structural readiness, actual blocking quality findings, and export failures. The collapsed `qualityGate` readiness row remains explanatory but is excluded from the structural count.                |
| Source warning ownership subtracted unrelated quality advisories                    | Source-owned subtraction now uses only source-classified quality findings. Structured review/missing/dangling counts cannot remove format, accessibility, or content advisories.                                                                    |
| Versioned ledgers still trusted a stored `total`                                    | Canonical warning and blocker totals are recomputed from their named domains. Persisted `total` is informational and cannot override the ledger.                                                                                                    |
| Successful non-graded assembly lost manifest source evidence                        | Finalize returns compact source evidence and selected feature IDs after any successful assembly, even when grading returns `not-graded`.                                                                                                            |
| The source classifier matched the bare word “source”                                | Classification now requires an explicit source domain or source-specific terms such as citation, provenance, source ref, ledger, report, review, or coverage.                                                                                       |
| One exact source finding suppressed all structured source debt                      | Trust review now retains exact source findings alongside review-required, missing-reference, and dangling-reference evidence, with stable severity order and duplicate suppression.                                                                 |
| The pending quality-proof warning had no ledger owner                               | A successful but non-graded finish owns exactly one quality-domain advisory; the trust selector no longer adds a second synthetic count.                                                                                                            |
| ChatPanel rebuilt several lossy package-pass shapes                                 | All direct-finish, receipt, and progress adapters now share one trust-preserving builder carrying warning domains, blocker domains, quality, and source evidence.                                                                                   |
| ExportSidePanel recombined explanatory rows into false item counts                  | The panel uses the canonical trust blocker count, removes the collapsed quality-gate row when detailed P0s exist, and no longer labels blocker arithmetic as “affected items.”                                                                      |
| Truncated finding arrays could fail open against `findingCounts`                    | Blocking and advisory policies reconcile summary counts with available detail. Known partial-scope discipline-density exemptions remain advisory, while unseen summary P0s fail closed.                                                             |
| Legacy reconstruction could collapse independent content and export blockers        | Independent audit fix. When a legacy inclusive scalar is absent, trust reconstructs `max(readiness, quality) + export`; when the scalar exists, it is treated as an inclusive floor and is never appended to the same export failure a second time. |

The resulting contract is intentionally migration-safe. New finishes use
versioned, non-overlapping ledgers. Restored legacy finishes use conservative
reconciliation without pretending their overlapping scalars have exact domain
ownership.

The workflow-state migration and the positional native-generation API are real
architecture concerns, but I do not think they belong in the same release.
Both cross broad lifecycle boundaries and deserve separate scenario-driven
changes after this finish-record contract is established. Expanding V0.17.00
into those areas would make the trust correction harder to verify and revert.

### V0.17.00 verification

| Check                         |                            Result |
| ----------------------------- | --------------------------------: |
| Unit/component suite          |         6,008 passed, 162 skipped |
| Test files                    |            484 passed, 16 skipped |
| Fast blueprint quality matrix |                         24 passed |
| PR compiler contract          |     14/40 profile fixtures passed |
| Layered PR evaluation         | Passed (`compiler-contract-only`) |
| Production build              |                            Passed |
| Lint and format               |                            Passed |
| Bundle/repository ratchets    |                            Passed |
| Release-history claims        |                      6/6 verified |

## What the review rounds changed

- **Rounds 1–3:** identified the overall compiler/evidence strength, incomplete
  state ownership, and lack of user-workflow instrumentation. The owner then
  required code-only evidence, invalidating document-led claims.
- **Round 4:** found warning-count overlap, the double-gated export summary, and
  a runtime-impossible test fixture.
- **Round 5:** established that `Math.max` would undercount independent warning
  domains, found lossy ready-package receipts, and exposed the unpopulated
  source-trust input fields.
- **Round 6:** traced real source evidence through ZIP assembly and deep grading
  to the exact boundary where structure is lost, then found the
  insertion-order-dependent P0 classification.

The separate five-round PR #110 follow-up concentrated on adversarial migration
shapes: stale totals, truncated details, non-graded success, double-owned
quality-gate rows, and the three ChatPanel reconstruction paths. It also exposed
two Roundtable problems during real use: a completed room could retain the
default ports, and disposable copies lacked a safe branch-diff substitute for
the omitted `.git` directory. Those are corrected in Roundtable v0.0.0.26 with
per-launch free ports and sanitized `.roundtable-context` evidence.

The discussion did not reach full consensus on whether the final model needs
two or three readiness predicates, the exact finish-record schema, or how the
partial-scope P0 exemption should appear in trust status. Those are appropriate
implementation design questions; the evidence-loss and order-dependence defects
should be fixed first.

## My view

EDUTOOL’s moat is not the number of generated formats. It is the possibility of
one inspectable course model producing aligned artifacts with honest source and
quality evidence. The implementation already contains most of that machinery.

The project’s danger is that it keeps adding evidence systems around a finish
record that is not yet singular. Each new surface then reconstructs “ready,”
“warning,” “source-grounded,” and “downloadable” from a different subset. That
is how a codebase with thousands of passing tests can still hide dead branches,
impossible fixtures, and order-dependent trust decisions.

My recommendation is a focused stabilization cycle, not a redesign:

- fix mixed-severity trust classification;
- carry source evidence through the boundary that already computes it;
- make the finish record lossless and domain-owned;
- delete reconstruction logic as consumers migrate.

After that, instrument a few real instructor workflows and let observed friction
choose the next extraction. Human validation should guide architecture
priorities, but it should not be confused with the code findings in this
report.

## Scope note

This report began as a review-only artifact. V0.17.00 subsequently implemented
the package-trust findings listed above, completed a separate 15-turn PR audit,
and added producer, migration, consumer, adapter, and component regressions.
The workflow-state and positional-API findings remain recommendations rather
than implied completed work.
