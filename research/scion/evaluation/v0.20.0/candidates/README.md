# Joint operation and binding proposal — rejected for product integration

2026-09-08; development base `cfadf900`. Research module only, no production imports. This is the second bounded automatic entry experiment after the bare classifier was rejected. Do not enable either candidate in the UI.

The model returns an operation together with exact source bindings in one grammar-constrained reply, or `operation: null`. Existing quote, number, record-ownership and operation checks assess the reply. At most one structural repair is allowed, for a total of two calls. Null or missing roles stop. Even a structurally complete result carries `objectiveCoverage: unreviewed`, `semanticRoles: unreviewed`, `approved: false`.

## Fixed development run

The plan was saved before inference. One existing Chrome tab, sequential inference, selected v3 runtime, base-only weights, and unload in the harness finally block. All sixteen inputs were previously exposed; no evaluator reference entered the prompts. Complete raw messages, grammar, output, runtime identity, settings, finish reasons and timing are in `screening-receipt.json`; its checksum and per-case review are in `review.json`.

- 19 local calls over 16 cases; zero candidates reached review.
- Of the three cases fitting the current four-operation registry, both experiment cases failed and the chronology case was incorrectly refused.
- The English experiment retained one-based occurrence selections despite zero-based feedback. The Chinese experiment repair repeated text until truncation. The unchanged source/operation validator rejected both.
- The pooled-rate case initially attempted the wrong operation, then refused on repair. The opening-year correction attempted a rule-amendment contract, but missing effective-date and observation-limit roles stopped admission.
- Thirteen final null results include the supported chronology case. Refusal is therefore not evidence of quality; zero false admitted candidates here is accompanied by zero usable supported candidates.
- The experiment cases took 51.530 s and 68.513 s including load/repair; the supported chronology refusal took 3.156 s. These are development observations, not release latency statistics.

## Decision

Do not ship. Grammar and exact spans prevent certain invalid records from entering compilation; they do not supply missing operation coverage, correct semantics, or objective alignment. The roadmap's pooled-count, overlapping-set and additional source relations remain product requirements even though this registry cannot handle them. Do not relabel them as out of product scope.

Do not continue unbounded prompt variants on these exposed cases. Preserve the working manual review path and targeted proposal protocols while improving the underlying operation coverage and reducing unnecessary model-generated metadata. Any next automatic-entry design requires a new stated hypothesis and separate evidence, not a claim of progress based on refusal alone.

Regression tests cover call limits, cancellation, input snapshots, invalid runtime, false approval fields, fabricated citations, and pending semantic review. These tests are mechanical checks, not educational acceptance.
