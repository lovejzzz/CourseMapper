# Scion V0.16.90 — Compiler Before Model

Date: July 28, 2026
Status: release candidate; production acceptance remains required

## Goal

Make Scion spend model compute only when an instructor’s requested structure or admitted evidence cannot already satisfy the typed course contract, while preserving the existing neural fallback and every release-quality boundary.

## Lane

V0.16.90 is a compiler-first routing, voice-pass admission, and telemetry lane. It does not train or replace a model, loosen evidence admission, or change the public product identity.

## Outcome

Scion now preserves an instructor’s complete, explicitly ordered lesson sequence as a typed course skeleton before importing the browser model runtime. When that skeleton is paired with a complete exact source ledger, the observed course can proceed through the shared compiler with zero model downloads, zero model inference, and zero model-token accounting.

This is a routing and contract improvement. It does not change Gemma weights, activate the optional Scion adapter, loosen source admission, or raise the automation-only readiness ceiling.

## What the V0.16.89 audit taught us

The deployed V0.16.89 Digital Accessibility run passed the professor-facing package contract:

- four named lessons in the requested order;
- 4/4 knowledge kernels and 9/9 material families;
- zero blockers, warnings, or findings;
- 69/100 Automated Readiness;
- 99/A deterministic package conformance and texture 97;
- 38/38 physical export checks;
- six trusted sources and 48/48 source-reference coverage;
- one valid archive containing 34 valid Office containers.

V0.16.89 correctly compiled exact evidence before model activation, but the complete run still took 32 seconds and made two cached-Gemma calls. The first restated the exact lesson sequence the instructor had already provided. The second sampled a cosmetic voice rewrite. Neither call added a measured package-quality improvement in this acceptance case.

## Kimi K3 lesson applied

The useful idea in the Kimi K3 review is progressive capability routing:

1. preserve explicit user intent in a typed result;
2. exhaust the smallest verified compiler capability first;
3. freeze evidence and tool results at contract boundaries;
4. invoke a model only for unresolved authoring work;
5. make the chosen route and its cost observable.

Scion does not copy Kimi weights, hidden reasoning, mixture-of-experts topology, or wire protocol. The improvement is architectural: stronger typed outcomes and less unnecessary model work.

## Route admission

`scion-compiler-explicit-sequence-route-v1` is admitted only when:

- the brief declares an exact lesson count;
- the brief supplies a complete ordered lesson list;
- the parsed list count equals the declared count;
- every item is a usable, distinct title;
- the existing topic-contract parser can preserve the sequence without ambiguity.

The route produces the native skeleton contract with `modelCalls: 0` and attaches a non-enumerable route receipt across the Pass A handoff.

Missing counts, mismatched counts, partial lists, duplicate titles, and ambiguous prose do not receive a fabricated skeleton. They retain the existing browser-local Gemma route and optional-adapter planner.

## Complete zero-download lane

The structure route composes with V0.16.89’s `scion-compiler-exact-source-route-v1`:

```text
exact instructor sequence
        ↓
typed course skeleton
        ↓
exact admitted source ledgers
        ↓
shared compiler and finalizer
        ↓
verified package
```

On that complete route:

- Wllama is not imported;
- model storage is not opened;
- no Gemma shard is downloaded or activated;
- no adapter is prepared;
- no model completion starts;
- the sampled voice pass is skipped;
- compiler projections are not counted as provider responses;
- no synthetic model-token usage is recorded.

If structure or evidence is unresolved, Scion still has its neural fallback. V0.16.90 removes unnecessary inference; it does not remove the model capability.

## Telemetry correction

The local browser audit found that exact compiler projections emitted provider-shaped completion events. The digest therefore showed three “model requests” even though no `providerRequestStart` occurred. V0.16.90 corrects that accounting:

- exact projections use `browser-compiler` execution;
- compiler work no longer receives estimated API usage;
- compiler responses do not overwrite `scionExecution` as local Gemma;
- the legacy enrichment pipeline field now says exact source ledgers were compiled with zero model inference instead of claiming that a model stage ran;
- the structure receipt, evidence receipt, and skipped voice pass remain inspectable;
- the run digest and export manifest can agree on zero model requests, tokens, weights, and cost.

## Local browser and export evidence

The exact acceptance prompt was:

> Digital Accessibility for Product Teams — create exactly 4 lessons: WCAG principles and conformance, semantic HTML and keyboard accessibility, accessible forms, and evidence-based accessibility testing and remediation. Make it practical for product designers and frontend developers, with source-grounded explanations, applied accessibility checks, and current open web evidence.

Observed local results after the telemetry correction:

| Measure                  | V0.16.89 production baseline |         V0.16.90 local candidate |
| ------------------------ | ---------------------------: | -------------------------------: |
| Full ready time          |                         32 s | 8 s first run; 4 s warm evidence |
| Model request starts     |                            2 |                                0 |
| Model weight requirement |            cached Gemma used |                             none |
| Lessons                  |                          4/4 |                              4/4 |
| Knowledge kernels        |                          4/4 |                              4/4 |
| Material families        |                          9/9 |                              9/9 |
| Automated Readiness      |                       69/100 |                           69/100 |
| Package conformance      |                         99/A |                             99/A |
| Texture                  |                           97 |                               97 |
| Export checks            |                        38/38 |                            38/38 |
| Trusted sources          |                            6 |                                6 |
| Source references        |                        48/48 |                            48/48 |

The local archive passed outer ZIP integrity and all 34 nested Office containers. Its manifest recorded the evidence-compiler lane, `modelInference: false`, `modelWeightsDownloaded: false`, `sourceResearch: true`, the skipped voice pass, zero blockers/warnings, and the same sealed quality results.

The time comparison is not a matched cold-network experiment: production and local source/cache conditions differ. The defensible claim is that the candidate route has zero model starts and no weight dependency while preserving the measured acceptance-package results.

## Claim boundary

V0.16.90 establishes:

- strict compiler-first routing for exact lesson sequences;
- a zero-model complete route when exact structure and evidence are both present;
- correct route and cost telemetry;
- local browser and physical-export regression evidence.

It does not establish:

- new Gemma or adapter weights;
- universal speed gains for ambiguous briefs;
- factual certification;
- instructor approval;
- accessibility certification;
- classroom effectiveness;
- superiority to a paid model.

Held-out ruler V30 binds the changed route and telemetry bytes without inheriting a V29 score or adapter result. Merged production generation, all ten surfaces, Agent evidence, responsive presentation, console, and physical ZIP remain release-blocking acceptance.

## Release Boundary

The release is not complete until the exact V0.16.90 commit passes the full automated regression, merges through green CI, deploys, and repeats the exact professor-facing production run with zero model activation, every public deliverable, the source-bound Agent response, responsive light/dark presentation, a clean console, and a physically verified ZIP whose manifest agrees with the live run.
