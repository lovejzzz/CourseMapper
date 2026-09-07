# Source region trial — frozen before execution

Run the same two exposed bilingual source packets once each through the real proposal entry, with `sourceAddressing: record-regions-v1`. Keep context 8192, output 1024 per stage, temperature 0, top-k 1, top-p 1, seed 7, no thinking or adapter, and two total calls. One reused Chrome page, serial model work.

Change: source text is presented in lossless numbered regions. Quotes identify a start region and a one-based match within it. They may extend into following regions. Grammar requires this address on quoted fields; integer resource counts retain existing whole-count source checks. Region resolution maps to exact original source offsets; invalid anchors never become a first-occurrence guess. Source revision hashes remain unchanged.

Hypothesis: explicit region choice is easier than counting matches across an entire record, and the addressed unit sentence helps the model choose the singular object phrase. Full success still requires all 14 source-valid roles and independent inspection of task semantics. A valid address on an incomplete object noun is not sufficient. No best-of selection, adaptive reruns or holdout credit.

## Outcome and decision

Rejected. Both actual outputs were valid JSON but nearly empty. English retained only the design-record owner (1/14 bindings), 7.676 seconds including 3.193 seconds cached loading. Chinese retained that owner and the resource count (2/14), 6.642 seconds with no reload; its `unknowns` copied field instructions instead of identifying missing evidence. Neither reached the second stage because no usable factor context existed.

The earlier constrained-quote trial produced 13/14 and 11/14 usable bindings. This is a regression on these same exposed inputs, not evidence that source-region references can never work. The 45 passing software tests establish the resolver's specified behavior, not model capability. There was no extra retry or larger-budget rescue run.

All integration and new application modules from this experiment were removed from shipping source. The exact candidate is preserved as `regions-candidate.patch`, applicable to `a1701517` (`git apply --check` verified). `regions.html` is an archived developer fixture: apply that candidate before replaying it; it is not the current product entry. The downloaded raw receipt is `regions-proposals.json`; concise accounting and hashes are in `regions-review.json`. Existing source code was restored byte-for-byte, avoiding another inactive protocol in the application.

## Next hypothesis

Separate extraction of a meaningful phrase from deterministic citation resolution. Investigate narrow compiler rules that recognize explicit declarations in the source, such as the text identifying one experimental unit. A rule may propose a complete source phrase only when the source explicitly states the relationship and the model's selected concept agrees. It must retain original spans, reject contradictory/negated or multiple declarations, preserve existing teacher choices, and expose unsupported cases for review. Never solve ambiguity by selecting the first occurrence or treating substring matches as proof of semantic equivalence.

Test any such rules on newly authored positive and adversarial examples before returning to these two exposed packets. Keep rule-derived suggestions distinct from actual Scion output in receipts. No claim of general language understanding or educational validity follows from matching a declaration.
