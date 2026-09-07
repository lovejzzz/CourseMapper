# Comparison source proposal development experiment

This is development evidence, not final Scion acceptance. Both input packets were
already exposed during compiler development. No model training or adapter change
is part of this experiment.

## Baseline: 2026-09-07

The actual application source-review button ran `scion-teaching-source-bindings-v2`
on experiment-dev-01 (English) and experiment-dev-02 (Chinese), serially in one
Chrome tab. Each received one proposal and one bounded repair. The prompt contained
only the objective and source records, not the fixture bindings or reference answer.
The existing teacher-confirmed selections were retained in the editor; this does
not measure how much manual work a new blank draft would need.

| Receipt         | SHA-256                                                          | Calls | Total ms | Observation                                                                                                                                      |
| --------------- | ---------------------------------------------------------------- | ----: | -------: | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| en-initial.json | 009017832abdfd4d3d56b67ae0977fe1a732731aa0ea660e13c25d1a57acda75 |     2 |    46571 | Both replies incomplete JSON; observed treatments taken from the future plan; repair names seconds as the experimental unit.                     |
| zh-initial.json | f4dbdc071f6f0a65df0e99d453e8eddb684966b7bbbb3e1f945572a266f39bbf |     2 |    26630 | Both replies incomplete JSON; treatments and competing settings merged, count includes the object name, some excerpts include unrelated clauses. |

These are failed proposals. Parser rejection must remain; the teacher-completed
task is not evidence that the model succeeded. The English cache load took 4220 ms;
the Chinese load took 0 ms in the same model instance. This is not a cold download
measurement. Runtime/weight identity and exact messages are inside the receipts.

## Hypothesis fixed before follow-up inference

The flat response repeats a source object for every role and poorly separates
observed conditions from future resources. Group the response into two observations
(each owns treatment and competing-setting quotes) and one future-test record
(owns factor names, independent unit, count, controls, measurement, outcome).
Copying fewer repeated objects may reduce malformed output and incorrect ownership.
Explicitly distinguish a factor name from its observed settings, and an independent
unit from a measurement unit. This is a hypothesis, not a demonstrated improvement.

The program translates the grouped transport into the existing canonical bindings.
It must still reject invented quotes, ambiguous occurrences, unknown fields,
forged approval, missing premises and invalid operation constraints. It must not
silently close malformed JSON or insert correct answers from fixtures.

Follow-up budget: one application proposal per same English and Chinese input,
serially in the existing tab; each allows at most one repair (maximum four actual
model calls). Keep temperature 0, seed 7, output limit 1024 and current base-model
route. Save all raw attempts, including failures, before deciding another experiment.
Compare parse success, exact-source validity, semantic role suitability and latency
separately. These two exposed inputs cannot count toward the twelve fresh units.

## Grouped v1 result and next fixed hypothesis

Both languages used two calls and still failed transport validation. All four
replies are complete JSON, but each returns the count as a JSON number. The Chinese
first reply invents four observation groups; its repair correctly keeps two and
identifies one cup, but omits occurrence indices for repeated factor names. English
treatment excerpts include the competing temperature, and its repair replaces the
competing settings with absent `N/A` text. Exact receipts: `en-grouped.json` and
`zh-grouped.json`. English elapsed 15767 ms; each load was 0 ms. See the receipts
for other timings. There is no semantic pass or teacher-correction timing here.

Before the next inference: use a consistent `{quote, occurrence}` object for every
phrase, explicitly requiring string quotes even for counts; replace the observations
array with exactly named first/second groups. Retain the existing two-record/new-test
split. Reject overlap between a treatment excerpt and its competing setting, so a
whole condition sentence cannot masquerade as a treatment alone. Report the actual
field path when a phrase is invalid, keeping other valid source suggestions for
review instead of rejecting the entire reply for one wrong phrase type.

Budget remains one new proposal per same English/Chinese packet, at most one repair
each, same model/settings/tab. All results remain exposed development evidence.

## Grouped v2 findings, index correction and bounded reasoning trial

The English reply used one call (13382 ms); Chinese used two (27850 ms).
Both still have substantive role errors. English `otherSetting` points to the
observed median rather than the competing temperature. Chinese instead quotes the
opposite group's full observation from the wrong owner. Longer phrase objects did
not improve semantic extraction on these inputs.

The English receipt originally records zero issues. This is **a validator false
positive**, not model success: every phrase requests occurrence 1 despite having
only one match (index 0). The assessor silently ignored explicit indices for unique
quotes. Correct that in the assessor, suggestion merge and draft application;
retain automatic index 0 only when an index is absent and the quote is unique.
Preserve the original receipt bytes, and record stricter replay results separately.

Next hypothesis, fixed before inference: retain the v2 prompt, enable the native
reasoning option already implemented by the local runtime, and allow 2048 output
tokens so that reasoning and final JSON can finish. The corrected index validator
is also active, so acceptance rates are not directly comparable to the faulty v2
validator. All other sampling/settings/input/runtime identity stay unchanged. Run
one English and one Chinese proposal in the existing tab, each at most one repair;
record truncation or incomplete reasoning as failure. Do not make reasoning mode
the final default if this bounded trial does not demonstrate a useful improvement.

## Reasoning outcome and staged extraction hypothesis

Native reasoning was observed in all four trial calls. Chinese took 103411 ms,
English 121130 ms, two calls each, without truncation. Both still failed. English
condition roles improved, but all explicit match indices remained wrong and the
repair omitted the new-test owner. Chinese retained broad/misowned conditions.
This does not justify enabling reasoning by default; restore 1024 tokens and no
reasoning. The raw records are `en-reasoning.json` and `zh-reasoning.json`.

Next fixed experiment: two distinct bounded stages, without a repair loop. First
extract the new-test factor names, independent unit, available count, controls,
measurement and metric. Only if those source selections are usable, ask for the
settings of those named factors in the observed records, excluding the selected
future-test record. Both stages use the same frozen input snapshot. The compiler
combines their disjoint roles, validates all source ownership and premises, and
still requires teacher review. Failure in stage two retains only the completed
source selections from stage one, never unfinished output.

To reduce format burden, unique excerpts can be strings; repeated excerpts use
`{quote, match}` with explicitly one-based match numbers (not the canonical
zero-based occurrence). A quoted count may also be a safe nonnegative JSON integer;
convert its decimal representation only to locate an exact, whole-number source
span. Do not strip words, infer counts, ignore explicit match numbers or insert a
fixture value. Field definitions and transport changes precede the next inference.

Budget: one English and one Chinese staged proposal, at most two actual local
calls each, temperature 0 / seed 7 / 1024 tokens / reasoning off, same tab and model.
This remains an exposed development experiment with no claim of generalization.

## Staged v1 outcome and refinement fixed before the next run

Both resource replies completed quickly (English 3471 ms; Chinese 5326 ms), each
one call. They omitted `unknowns` and copied the schema's descriptive unit placeholder
literally. The strict root rejected each reply before stage two. Their real records
are `en-staged.json` and `zh-staged.json`; speed alone does not make these successful.

For staged v2, use null schema placeholders and describe the fields outside the
schema. An absent `unknowns` means no model-reported uncertainty, not proof that
nothing is unknown; an explicitly malformed unknowns value is still rejected.
Stage two depends on the two exact factor-name excerpts and the selected record,
not on unit/count/measurement completeness. Missing occurrence selection for a
repeated factor name may supply that exact text as provisional question context;
its canonical binding remains empty until reviewed. An explicit invalid occurrence,
absent quote or invalid owner must not supply context. This allows independent
observed-setting extraction without admitting unresolved resource roles.

Keep the same two-case, two-call-per-case budget and settings. Save all outcomes;
do not reset the earlier failed results or count these as new benchmark units.

## Staged v2 result and directly named settings

Chinese used two calls / 10756 ms. Its observed settings are semantically appropriate;
the canonical draft retains eleven exact selections and leaves both repeated factor
locations and the incomplete unit `只` unresolved. The latter is caught as ambiguous
text, not because the program understands that a classifier alone is not a unit.
English used two calls / 9004 ms but still placed temperatures in factorSetting,
left competingSetting null and failed to locate the repeated unit `card`. Neither
is a complete pass. These are proposal reviews, not actual correction-time measures.

Before staged v3 inference: name the two setting keys with the factor excerpts
already obtained from the source, so the model fills source-named settings instead
of translating them into abstract factorSetting/competingSetting roles. Validate
the exact key set and map it back to the same canonical roles. The unit instruction
now explicitly asks for its object noun together with any stated singular determiner
or classifier. Keep all source validation and unresolved-position boundaries.

Run the same English/Chinese pair once each, at most two calls each, with the same
1024-token/no-reasoning settings. This is the final protocol trial in this development
batch; archive and review it before expanding the case set or planning another trial.

## Final batch result

The batch has **14 exact receipts / 24 actual calls on only two exposed inputs**.
Checksums, per-attempt diagnostics and settings are in [review.json](review.json).
Final staged v3 English: two calls / 11186 ms, thirteen exact source selections.
The four observed settings are correctly attributed; the unit `card` still has four
matches and no selected occurrence. It is a partial proposal, not a pass.
Final staged v3 Chinese: one call / 5944 ms. The unit improves from a classifier to
`杯子`, but the `unknowns` array contains an invalid key/value pair. The whole reply
is rejected; stage two does not run. Its score is zero usable selections. Do not
replace it with the earlier Chinese v2 result (eleven usable selections / 10756 ms).

The final default remains a development candidate. Narrowing and directly naming
the observed settings helped the English case, but this batch has not established
bilingual reliability. No model weights changed, no teacher correction-time study
was performed, and no final fresh-unit acceptance was completed.

`npm run check` passed: 58 studio + 544 compatibility + 831 Scion = 1433 software
test executions, plus 14 historical benchmark-checker tests, types, lint, build and
bundle checks. These are not independent educational cases. The exact final English
and Chinese requests/outputs are replayed in regression tests, including rejection
of the Chinese malformed reply. Initial JS gzip is 89.817 KiB. UI tests and actual
browser runs retain the teacher's existing selections and keep failure details folded.

Next investigation: verify structural constraints in the pinned local sampler before
adding more prompt revisions. The shipped wrapper exposes a grammar request field,
but an older mechanical probe produced repeated `OK` for a grammar that should allow
one `OK`; that unversioned probe is a warning to inspect state advancement and stopping,
not proof of present support. A passing grammar canary would prove structure only;
factor roles and experimental-unit meaning still need separate semantic evaluation.
