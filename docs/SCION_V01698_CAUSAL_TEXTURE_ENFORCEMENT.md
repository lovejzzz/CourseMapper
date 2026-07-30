# Scion V0.16.98 — Causal Texture and Enforced Ratchets

## Goal

Make the retained cross-package texture measurement complete, causal, and
enforceable before merge; preserve ordinary website output; and publish the
result without implying a production or teaching-quality claim.

## Verdict on the post-V0.16.97 work items

The review was materially correct. Its strongest findings were not requests for
more copy; they were requests to make the existing measurement complete,
causal, and enforceable. V0.16.98 implements those findings without changing
Gemma weights, enabling the inactive adapter, or adding audit payloads to
ordinary projects.

One recommendation needed a correction. The V0.16.97 repair reduced broad
reader exposure while increasing the number of pair-local clusters. A K=2
ceiling against the old pre-repair baseline would therefore fail the shipped
release immediately. V0.16.98 keeps the pre-repair baseline for broad rates and
uses the retained post-repair V8 receipt as the support-shape ceiling.

## Lane 1 — Complete and enforce the measurement

### Complete published summary

`latest-{thin,gold}.md` now carries:

- eligible teaching units;
- total clusters with support K≥2;
- the explicit K=2 pair-local count;
- full support distribution;
- support burden, reader exposure, and cross-package excess;
- compiler-frame matched and unknown counts;
- exact provenance coverage;
- consumed-slot results and input-mask divergence;
- every support-shape ratchet result.

### Stronger comparator

The comparator fails when:

1. any pre-repair rate regresses;
2. universal or universal high-salience counts exceed the pre-repair baseline;
3. K=2 exceeds the V0.16.97 post-repair reference;
4. a cluster already present in that reference gains package support or
   occurrences;
5. a new universal high-salience cluster appears;
6. causal provenance falls below 50% of teaching units;
7. any reader-visible path is unclassified.

Synthetic regressions prove that better aggregate exposure cannot hide
pair-local growth, existing-cluster growth, or a new universal frame.

### Causal realization coverage

Existing semantic variant receipts remain first authority. An opt-in compiler
boundary receipt adds path ownership for finalized strings that were not
selected through a named variant pool. It is attached through the existing
non-enumerable symbol and is active only when `traceRealization: true`.

The complete-package regression proves that trace-on and trace-off output have
identical keys and identical `JSON.stringify()` bytes.

| Panel | V0.16.97 matched | V0.16.98 matched | Teaching units |   Coverage |
| ----- | ---------------: | ---------------: | -------------: | ---------: |
| Thin  |              942 |           22,805 |         25,335 | **90.01%** |
| Gold  |              189 |           13,336 |         14,475 | **92.13%** |

Both retained panels exceed the proposed 50% acceptance threshold.

### Causal result

| Panel | Input-mask exposure | Consumed-slot exposure |        Divergence |
| ----- | ------------------: | ---------------------: | ----------------: |
| Thin  |               9.78% |             **38.47%** | **+28.70 points** |
| Gold  |              19.32% |             **19.40%** |      +0.08 points |

The thin panel is intentionally sparse. Its large gap says that broad input
masking credited source influence the compiler did not actually consume. This
is the clearest next repair signal: identify the highest-exposure generic
owners under sparse evidence and improve their decision structure, rather than
increase the number of interchangeable sentence frames.

The gold panel’s near-zero divergence says its richer fixtures genuinely
contribute much of the language that broad masking attributed to them.

### Enforcement and repository truth

- Fast verification recompiles both retained panels with
  `--compare-baseline`; it no longer stops at baseline-file readability.
- The aggregate `Fast verification` status is the intended required merge
  check. Deep Proof remains defense in depth rather than making every pull
  request wait for the slowest suite.
- `bundle:check` freezes the full compiler family:
  `courseBlueprintCompiler.js` plus `src/lib/courseCompiler*.js`.
- The Trellis report now states the actual ledger: E1 green, E2 not run, E3 and
  E5 partial.

## Release Boundary

This release characterizes two retained deterministic compiler panels. It does
not yet provide generic fallback exposure for fresh browser-local Scion
production output. It does not prove a teaching-quality increase, a factual or
accessibility certification, instructor approval, classroom outcomes, adapter
superiority, paid-model parity, or changed model weights.

## Next decision

Run the production panel only after this receipt path is deployed:

- at least six fresh instructor-style briefs;
- two strong-source, two partial-source, and two missing-source cases;
- exact browser-local route receipts;
- complete ZIP text extraction across Office artifacts;
- the same causal ruler over realized output;
- one published generic-fallback exposure number, initially as
  characterization with no pass threshold.

That panel decides whether to repair a small set of dominant fallback owners or
invest in a larger authoring-architecture change. It should not be replaced by
another synthetic synonym pass.
