# Bounded complete-source atomic proposals

One fixed first pass through four new bilingual source packets, using the selected local v3 Scion runtime and unchanged base weights. `plan.json` freezes the runner, resolver and input hashes before inference. References are separate and never sent to Scion. All 32 initial calls, including failures, are in `first-run-raw.json`.

| Case | Calls | Whole runner time | Semantic result |
|---|---:|---:|---|
| Pooling English | 7 | 11,362 ms | Incomplete; repeated group names remain ambiguous, dependent counts skipped |
| Pooling Chinese | 7 | 7,958 ms | Incomplete; rewritten/general/repeated group names, dependent counts skipped |
| Union English | 9 | 9,495 ms | All source roles correct; zero implementer corrections |
| Union Chinese | 9 | 9,237 ms | All source roles correct; zero implementer corrections |

The runner asks bounded short questions, requires exact source evidence, preserves located fields and allows at most 12 serial calls. Dependent roles wait for their source owner. A unique longer quote can disambiguate an occurrence without changing its global index; multi-count excerpts require narrower evidence. Explicit UNKNOWN is not repeatedly retried. Parseable truncated output is not admitted. Cancellation returns no partial draft bindings.

Only union-bounds on the verified grammar runtime is promoted into the existing source-review entry. Pooling remains research-only; dates and comparison paths are unchanged. Two successful cases establish a useful development path, not broad reliability, a classifier, an adapter improvement, or classroom acceptance. Teacher confirmation is still required.

The actual application was exercised in the existing Chinese review panel. `browser-route-raw.json` records nine calls with all existing selections preserved. An empty browser fill did not clear the field, so it is not evidence of missing-field adoption. In the separate `browser-adoption-raw.json` run, the DOM was first verified to contain the invalid phrase 待定位; after nine calls it contained the correct original phrase 三十五 and asked for review. These two replays are integration checks, not fresh benchmark cases. Their original receipts measure source questions after the public entry's preload; subsequent accounting includes that preload in total elapsed/load time.

Both first-pass union results were explicitly reviewed by the implementer, then compiled using the actual task creation and material exporters. Eight final PDF/Word pairs and saved projects are in `.audit-work/v0200-teaching-system/atomic-union-02/`. The first capture is retained: output review caught an assignment error explanation accidentally drawn from a different partial response. Union presentation v5 fixes that association; older versions remain reproducible. All 24 final PDF pages were visually inspected. Office visual verification and full-course acceptance remain outstanding. See `research/teaching/v0.20.0/atomic-union-review.json` for checksums, limitations and the real 25→35 source revision/reopen evidence.
