# Count-context pooling trial

Four new inputs, one fixed pass, 44 real local calls (11 each). Unit and outcome questions read a verified count's source sentence; exact global offsets are retained. References are never sent to Scion. The candidate and source hashes were frozen in plan.json before inference.

| Case | Time | First-run result |
|---|---:|---|
| English complete | 13,514 ms | All source roles semantically correct, zero corrections |
| Chinese complete | 9,308 ms | Reuses first whole as first part; explicit diagnostic rejects it |
| English missing membership | 8,492 ms | False structural pass: quotes “Whether the groups share learners is unknown.” as disjointness evidence |
| Chinese missing total | 8,944 ms | Uses the outcome count as both second part and total; rejected |

The false structural pass remains unchanged in first-run-raw.json. Subsequent product validation rejects explicit membership uncertainty supplied as disjointness evidence. This is a narrow contradiction detector, not proof that every other passage establishes disjoint membership. Teacher review remains necessary. Count reuse is now reported even when unrelated fields are missing; when all source fields are located, full ownership/arithmetic diagnostics still run, with duplicate messages removed. Existing actual repair-selection regressions caught and verified the ordering fix.

The atomic pooling route remains experimental and is not dispatched by the public product entry. English source extraction demonstrates progress but does not justify general promotion or claims of bilingual reliability. A future bounded semantic-repair phase can use the unused twelfth call for a concrete role conflict; it must not invent missing totals or membership premises, or erase located fields. Do not tune repeatedly on these exposed inputs.

Only the English complete case was reviewed for output, without correcting any model field. Actual compiler/export captures are .audit-work/v0200-teaching-system/atomic-pooling-01 (retained initial output) and atomic-pooling-02 (final). Four PDF/Word pairs, 12 visually reviewed PDF pages, and a real browser 16→20 source edit, nine-material update, save and reload are recorded in research/teaching/v0.20.0/atomic-pooling-review.json. Pooling presentation v5 fixes an assignment feedback mismatch while retaining older presentations. Dense teacher keys, Office rendering and full-course/independent classroom acceptance remain outstanding.
