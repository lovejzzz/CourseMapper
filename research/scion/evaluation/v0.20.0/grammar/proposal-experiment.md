# Constrained comparison proposal trial

Frozen before model execution, 2026-09-07. Run each of the existing English and Chinese v3 development source packets once, in that order, through `proposeTeachingSourceBindings` and the two-stage controller. No reference bindings, answers, or retries beyond the controller's existing total two calls. Candidate runtime from the mechanical canary; context 8192; output 1024 tokens per stage, temperature 0, top-k 1, top-p 1, seed 7, no thinking or adapter. One browser, one model, serial requests.

Change under test: application-owned GBNF enforces JSON structure, named keys, source-alias enum, nullability and bounded list/integer shapes. It does not constrain which quote is chosen or prove field meaning. Keep prompts and source checks unchanged. Old production runtime has no grammar capability and must not receive the new option.

Acceptance: report actual parsed shape, truncation, every exact-source issue, source roles and semantic defects for both languages. No best-of selection or substitution of previous output. A full proposal requires all 14 valid roles and correct meaning; a syntactically valid but wrong or null-filled answer fails. Neither input counts as an independent held-out unit.

## Outcome

Four actual calls produced four complete JSON objects, without truncation. English: 13/14 usable bindings, 11.050 seconds including model load. Chinese: 11/14 usable bindings, 7.804 seconds with the model already loaded. Exact timing and raw outputs remain in `constrained-proposals.json`; see `proposal-review.json` for the concise accounting.

Both languages correctly separated the treatment from temperature and retained the stated measurement procedures. English still chose ambiguous `card`. Chinese chose ambiguous factor names and `杯子`, omitting occurrence indices. Neither unit quote expresses the requested singular independently assigned object as well as the source's `one card` / `一只杯子`. Chinese treatment excerpts include the group noun, but do not include the competing temperature or measured result. No output is confirmed or promoted automatically.

The assessor's `missing` list describes absent fields, not all invalid fields: it is empty here while `issues` identifies rejected quotes and their returned bindings remain empty. Counting only `missing.length` would be a false pass. The result accounting counts usable bindings and inspects the actual quotes instead.

Conclusion: structure enforcement removes the observed formatting failure; it does not solve citation ambiguity or unit specificity. Next work should improve how sources are addressed (for example sentence/region anchors with exact offsets) rather than blindly selecting the first repeated word or increasing retries. Do not infer general reliability from two exposed inputs.
