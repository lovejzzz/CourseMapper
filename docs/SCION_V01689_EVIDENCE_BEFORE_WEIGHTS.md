# Scion V0.16.89 — Evidence Before Weights

Date: July 28, 2026

Status: corrective release in verification

Claim boundary: compiler/runtime orchestration and exported-package evidence, not instructor approval or classroom effectiveness

## Goal

Make Scion decide that a complete, immutable source ledger belongs to the
deterministic compiler before the browser imports or activates Gemma. The
source-backed path must preserve the V0.16.88 course-quality and export
contract while using zero model downloads, zero runtime activation, zero
inference calls, and zero model tokens.

## Why V0.16.89 exists

The required V0.16.88 production audit generated the exact Digital
Accessibility acceptance course and passed the professor-facing contract:

- four named lessons in the requested order;
- 4/4 source-backed lesson kernels;
- all 9/9 generated material families and 10/10 public workspace surfaces;
- zero blockers, zero warnings, and zero deterministic findings;
- 69/100 Automated Readiness under the independent-evidence ceiling;
- 99/A package conformance, texture 97, and 38/38 export checks;
- a 37-file physical ZIP with 34 valid nested Office containers;
- six trusted concept-linked sources and 48/48 source-reference coverage;
- the Scion Agent cited the official W3C Accessible Forms and Labels pages,
  connected Lesson 3 evidence to Lesson 4 remediation, and preserved the
  boundary that one passing component check does not prove product
  conformance.

The exported manifest correctly recorded the `evidence-compiler` lane, zero
model inference, and zero downloaded weights for that run. The browser audit
nevertheless saw the cached Gemma runtime activate after the source ledger was
already complete. The cause was ordering inside `runScionLocalCompletion`:
Scion loaded Wllama and prepared the model route before checking whether
`buildPublicScionExactSourceLedgerResponse` could satisfy the request without a
model.

The output was correct, but the architecture still paid an unnecessary
multi-gigabyte risk boundary and emitted low-level model activation warnings.
That contradicts the purpose of Scion's zero-download evidence route.

## Lane 1 — Resolve the contract before the runtime

V0.16.89 computes the task family, fact-ledger contract, expected lessons,
messages, and exact source projection before calling the injected runtime
loader.

When every requested lesson has a direct numbered source ledger:

1. Scion projects those facts unchanged.
2. The compiler assesses the projected envelope.
3. Scion emits a compiler-owned route receipt.
4. The function returns at attempt 0 with token count 0.

The browser runtime module, model cache, public weights, adapter planner, and
completion method remain untouched.

When the ledger is incomplete or the task is not the exact source-ledger
contract, Scion continues through the existing local Gemma route. This is a
right-sized routing change, not removal of the neural authoring fallback.

## Lane 2 — Make zero-model work observable

The route receipt is explicit:

```json
{
  "protocol": "scion-compiler-exact-source-route-v1",
  "reason": "compiler-owned-exact-source-ledger",
  "factLedgerOnly": true,
  "exactSourceLedger": true,
  "modelCalls": 0
}
```

`useStreamReader` records this as `browser-compiler` execution at the
`local-compiler` stage with the label **Scion exact evidence projected**.
Local Gemma and adapter routes retain `browser-local` execution. Public UI and
exports still identify the product only as Scion.

## Lane 3 — Lock the expensive negative boundary

The focused provider regression injects a monitored runtime loader and requires:

- the runtime loader is never called;
- the model loader is never called;
- adapter route preparation is never called;
- completion/inference is never called;
- the exact source facts are unchanged;
- attempt, retry, and token counts remain zero;
- the compiler-owned zero-model receipt is present.

Existing tests continue to require model loading, bounded retries, task-family
routing, and optional-adapter behavior for non-exact requests.

## Lane 4 — Apply the Kimi lesson safely

The useful lesson from the Kimi K3 review is architectural:

- progressively expose the smallest capability needed for the task;
- freeze source and tool results into typed contracts;
- keep a canonical route/result ledger;
- spend model compute only after cheaper verified routes are exhausted;
- judge final state rather than rewarding hidden reasoning volume.

Scion does not copy Kimi K3's roughly terabyte-scale weights, mixture-of-experts
topology, hidden reasoning, or model-specific tool wire format. Those are not
appropriate browser dependencies. The local Agent remains read-only and
capability-scoped until mutation has a strict action envelope, canonical
call/result ledger, bounded context handoff, budgets, and final-state verifier
evidence.

## Lane 5 — Release proof

Before merge:

1. focused provider and stream-reader regressions;
2. complete unit and closed-loop suite;
3. complete Chromium suite;
4. 40/40 main layered evaluation and PR compiler-contract profile;
5. CurriculumOS source-provenance proof;
6. format, lint, build, bundle, release-history, and generated-runtime checks.

After deployment, repeat the exact Digital Accessibility prompt from a clean
workspace with current-source research enabled. Acceptance requires:

- the correct title and four ordered lesson topics;
- a complete Living Course Compiler sequence;
- 4/4 kernels, 9/9 material families, and zero blockers/warnings;
- all ten public surfaces and the exact cross-lesson Agent question;
- separate Automated Readiness and package conformance scores;
- no Gemma model progress, activation messages, or model-runtime console
  warnings on the exact source-ledger path;
- dark, light, and 390 px responsive inspection;
- one working Download ZIP action;
- outer ZIP and every nested DOCX/PPTX/XLSX container passing integrity checks;
- manifest receipts for zero model activation, zero inference, source research,
  source-reference coverage, and export verification.

## Release Boundary

V0.16.89 changes route ordering, route receipts, and tests. It does not change:

- the pinned Gemma 4 E2B weights or immutable revision;
- the optional adapter weights or inactive promotion state;
- the user's current-source consent boundary;
- CourseIR, compiler, grader, or the 69-point automated evidence ceiling;
- claims about factual correctness, accessibility certification, teaching
  quality, instructor approval, student outcomes, or paid-model superiority.

Held-out ruler V29 preserves the V28 five-course fixtures, base identity,
adapter-task policy, and grader. It binds the changed preflight implementation
without inheriting a V28 score, adapter result, or quality claim.
