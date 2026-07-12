# Scion Next Level — Verified Learning, Not Model Imitation

**Status:** implementation in progress; compiler slice verified, training corpus intentionally empty
**North star:** Scion produces a more teachable, more internally coherent course than a paid frontier baseline at a fraction of the cost, and the evidence survives blind instructor review.

## Product thesis

Scion does not need to become the best general chatbot. It needs to become the best course-building intelligence: a specialized author inside a compiler that can plan, generate, verify, repair, preserve instructor intent, and improve from accepted differences.

The winning unit is the full system:

```text
source material
  -> canonical course graph
  -> Scion authoring
  -> deterministic contract gates
  -> pedagogy and answer-key critics
  -> bounded repair
  -> instructor review
  -> verified preference record
  -> held-out training and promotion gates
```

## Evidence at the start

- The compiler contract is strong: the retained Scion package reached 99/A and the local four-course Scion 1.2 gauntlet reached 99/A with zero P0/P1 findings.
- The saved paired diagnostic shows large Scion advantages on contrastive rationales, decision-ready scenarios, and cue-free short answers, but it is one course pair rather than a general ranking.
- Independent instructor evidence remains unverified: zero benchmark cases currently have two valid external reviews.
- Production evidence is now verified at the policy level: three release-passing runs retain hash-matched ZIPs, traces, console logs, and rendered reviews. The set includes the required public-Scion UX run plus local-Scion music-theory and compiler-hardened UX runs, satisfying 3/3 runs across two domains. This does not substitute for independent instructor evidence.
- The old preference corpus was not safe to train. The current strict audit finds **0 of 411 rows eligible**. All 411 remain quarantined: same-model agreement is not independent answer proof, unknown evidence kinds fail closed, applied-stem repairs still need explicit review approval, and post-hoc key realignment is never a training preference.

## Foundation-model bake-off — implemented, no replacement promoted

Scion now treats the backing model as a measured component rather than a permanent identity. `evaluation/scion-model-candidates.json` registers one control and four challengers; `npm run audit:scion:model-bakeoff` records exact source weights and separates factual screening from production promotion.

The screening policy requires two independent cold runs and two source-grounded runs over the frozen 25-case, five-domain packet. Gemma 4 E2B scored 23/25 cold twice and 25/25 grounded twice. Qwen3.5 4B produced the same scores twice, with a warm median of 8.19 seconds per 25-case pass versus 6.94 seconds for Gemma. The misses were stable but not identical, which supports a complementary-router hypothesis but not a Qwen quality win.

The matched full-course test used the real Local provider, exact `mlx-community/Qwen3.5-4B-4bit` provenance, voice off, the same 12-lesson UX prompt, real browser export, and the same grader. Qwen reached 99/A, zero P0/P1, 101 extracted files, readiness ready, $0, and 382 seconds. It required 85 `scionPass` calls and 42,414 estimated output tokens; the retained legacy control reached the same package grade in 380 seconds with 50 `scionPass` calls and 29,301 output tokens. That older control was run under the Gemma setup but predates exact source-weight capture, so it supports compiler-burden comparison without satisfying the new exact-provenance matched-control gate. Qwen is therefore **screened but not promoted**. It has one of five required full-course domains, a materially higher repair burden, and no qualifying device matrix or blind instructor win.

The bake-off also became a compiler audit. `npm run audit:scion:compiler-burden` measures calls, rejected repair actions, regeneration outcomes, and rejection reasons. The retained pair reports 85 versus 50 Scion calls (1.70×), 35 versus 21 rejected actions, and 27 versus 18 `not-applied` rejections. Future runs attribute every subcall by schema, and promotion rejects more than 1.25× amplification across five domain-matched controls. Replaying the improved depth detector over the retained Qwen inputs avoids 17 of 33 old rewrite targets; the repair prompt now requires an open evidence question and forbids copying options, labels, or answers into the stem.

The challenger run repaired runtime defects too: native SSE is no longer parsed as JSON by the legacy browser bridge; `--llm local` uses the app's real Local provider so keep-alive heartbeats survive; the server and Crucible retain exact source-weight identity; and local subprocess startup inherits the caller's timeout while always draining stderr so loader progress cannot deadlock the child.

## Non-negotiable learning rules

1. A model name is not a preference label. A GPT output is not automatically `chosen`, and a Scion output is not automatically `rejected`.
2. Every training pair needs evidence at the pair level: deterministic contract failure, answer agreement from at least two distinct verifier identities, blind human preference, or a calibrated order-reversed judge result.
3. The chosen response must pass the same contract the product ships.
4. Raw generation and flywheel logs are evidence ledgers, never training splits.
5. Training uses a curated split only. Quarantined rows cannot be recovered by lowering the gate.
6. A checkpoint is adopted only if it improves the target seat without regressing frozen structural, safety, grounding, and long-JSON rulers.
7. A foundation model is promoted only after repeated factual screening, at least five passing 12-lesson courses across five domains, five exact-provenance domain-matched control courses, no more than 1.25× control compiler-call amplification, the named browser-device matrix, and a blind instructor win whose 95% Wilson lower bound exceeds 0.50.

## Phase 1 — Stop teaching Scion its mistakes

**Implemented in this branch:**

- A regenerated multiple-choice item is solved twice after regeneration and ships only when both cold solves agree with its declared answer key. Those same-model solves are a runtime safety check, not independent training proof.
- Topic repairs receive the same answer-key verification.
- Answer-key repair rows require at least two distinct verifier identities before corpus admission. Applied-depth stem repairs additionally require explicit review approval, and post-hoc key realignment is permanently non-trainable.
- Replacements with truncation, process leakage, duplicate options, invalid bands, test-wiseness defects, or topic drift are rejected.
- Flywheel POSTs now include only verified chosen/rejected pairs with the exact training prompt and pair-level evidence.
- The local server serializes those events into a real preference-row shape instead of mixing telemetry with training data.
- The kernel prompt now actually includes the study-guide object it already promised in prose and required in Scion's schema.
- `npm run audit:scion:corpus` curates raw rows into an isolated split and reports every quarantine reason.
- The ORPO launcher now reads only that curated split and still refuses to train below 3,000 verified pairs.

## Phase 2 — Build the frontier-difference laboratory

**Implemented for the first matched course:** the paired audit emits separate quiz and multi-surface JSONL ledgers with the five outcomes below. The fresh graph-hardened User Experience Design Studio run produced 120 quiz records: 2 `learn`, 44 `preserve`, 2 `repair`, and 72 `parity`. The source-of-truth graph persists the repaired Lesson 7 key and its verified preference record; strict explanation-key alignment is now 37/37 for Scion vs. 44/44 for the reference. Scion leads four aggregate quiz dimensions and trails none on this pair.

The 72-record multi-surface ledger measures key-term depth, authentic assignment cores, assignment constraints, discussion tension, third-position reasoning, and authored study strategies. It preserves two Scion strengths—12/12 authentic assignment cores and 9/12 authored study strategies versus 0/12 in the reference—and identifies two consistent gaps: Scion bundled assignment constraints into two lines instead of separating scope, format, evidence, and time/length, and used binary discussions instead of an additional conditional or synthesis position. The prompts now request those deeper structures, and the fresh local run below verifies them in 7/7 lessons. The records remain diagnostic-only. The next gap is breadth: run this same lab across multiple disciplines before making any model-level claim.

**Fresh local verification:** the final production-safe music-theory run, `round-2026-07-11T19-20-32-320Z`, captured the live graph, extracted 61 files, graded 59 files at 99/A with zero P0/P1/P2 findings, completed 38/38 export checks with no failures or warnings, reported $0, and finished in 254 seconds across 38 provider calls. Its readiness gate reported zero blockers, zero warnings, and no readability flags. All seven lessons were genome-augmented. A relevance-ranked one-bank-per-lesson allocator reserves secondary concept banks for the later lesson where they become primary, and the merge discards model alternatives shadowed by a verified genome seat. The live graph therefore contains 28/28 source-backed, applied, supported, contrastively explained, answer-aligned, admission-clean MC items—exactly four in every lesson. The current difference lab has zero `repair` records across quiz, surface, and cross-artifact ledgers; the strict matrix row fails only its 12-lesson denominator. A more aggressive experiment had asked the weak model to backfill missing quiz seats and realign keys; it produced doubled option labels and several factually wrong music answers despite same-model solver agreement. That experiment was rejected and is disabled in the production path. The lesson is now a gate: structural 99/A is not factual correctness, and model self-agreement is not independent verification.

**Factual canary result:** a frozen 25-question gate draws five source-anchored questions each from computer science, geology, world literature, research methods, and music theory, with rotated answer positions and an exact 25/25 bar. GPT-5.4-mini scored 25/25 cold. Scion-1 scored 23/25 cold after the verifier protocol was corrected. When the same Scion model received the complete admitted Curriculum Genome support bundle and answered one item at a time under an exact-option enum, it scored 25/25. Earlier index-based and oversized-batch protocols scored as low as 9/25, proving that the verifier itself was corrupting the signal. The production blind-key pass now asks for exact option text instead of a zero-based index. This is source-backed system parity on one frozen packet, not a claim that the raw model matches or beats GPT.

**Source-backed music path implemented:** the seven shipped music kernels now carry four source-anchored, case-based MC items each, with answer positions balanced 0/1/2/3 inside every kernel. That creates 28 verified music seats from the existing fact anchors. The shard is owned by the offline foundry build, item-level lint drops fail the build, generic cross-discipline aliases are removed, and web anchors render as human source titles. The linker assigns one relevance-ranked bank owner per lesson so a secondary concept is not exhausted before its primary lesson; the genome-first merge fills shared seats once and drops shadow model alternatives. Tests compile every music kernel, and the real browser package proves all 28 distinct bank questions survive into exported materials—four per lesson.

**Source-backed UX path implemented:** six UX kernels now cover research planning, evidence-based personas, journey mapping, task-flow analysis, interactive prototyping, and accessibility/usability evaluation using independently retained Digital.gov, UK Government Service Manual, and W3C source snapshots. Each kernel carries four anchored, case-based, position-balanced MC items and a grounded example that activates the existing fail-closed scenario derivation contract. The final real browser capture, `round-2026-07-11T20-41-02-548Z`, reached 99/A with zero P0/P1, 101 extracted files, 38/38 clean export checks, six genome-linked lessons, 12/12 scenario coverage/readiness/materials, and a strict matrix pass. Against the saved Luna artifact, Scion has the same 27 applied MC items but a lower applied rate (27/48, 56.3%, vs. 27/44, 61.4%) because it ships four additional questions. Scion matches the 100% safety/alignment bars and leads substantially on rationale contrast, decision-ready scenarios, and cue-free claim-evidence-boundary short answers. This is a course-level compiler-route result, not a general model ranking.

The route-separated five-domain matrix still shows that the older local checkpoint trails badly across several comparisons, while the current UX route now clears every strict deterministic bar. The next model-learning target is reviewed, independently verified factual correctness and teachability across domains—not more synthetic volume and not a generalized win claim.

For each matched source lesson, run Scion and the selected frontier reference through the same typed contract. Compare at the smallest meaningful seat:

- course architecture;
- knowledge facts and key terms;
- evidence-to-decision scenarios;
- multiple-choice stems, distractors, keys, and explanations;
- authentic assignments and feedback loops;
- study-guide explanations and review strategies; and
- cross-artifact consistency after compilation.

Every difference receives one outcome:

- **learn:** reference wins with verified evidence;
- **preserve:** Scion wins and the behavior becomes a regression gate;
- **repair:** both fail and a human-authored target is required;
- **parity:** neither side supplies a useful preference signal; or
- **uncertain:** evidence is insufficient, so the pair remains out of training.

The laboratory must blind model identity and reverse presentation order. Aggregate model reputation never substitutes for a per-pair verdict.

## Phase 3 — Make instructor edits the highest-value signal

**Review machinery implemented:** `npm run audit:scion:review-packet` derives 332 neutral, contract-clean atom pairs from the four real matched-artifact entries that can be aligned safely; after contract admission and the legacy music source, 515 candidates are available for sampling. It then builds a deterministic 50-case A/B packet. Model/source identity is removed from the reviewer packet, the A/B assignment is hash-randomized, and the mapping stays in an organizer-only key. The resulting packet is exactly balanced: ten cases each for computer science, geology, music theory, user-experience design, and world literature; 25 MC and 25 key-term cases. Each domain folder includes a self-contained offline `review.html` that saves drafts locally and downloads packet-bound JSON without network access or access to the organizer key. `npm run audit:scion:reviews -- --review <reviewer-1.json> --review <reviewer-2.json>` admits a pair only when two distinct self-attested working instructors who currently teach that domain independently choose the same winner, both score that side at least 4/5 for factual correctness and teachability, the review names the exact packet ID and timestamp, both reviewers attest independent work and no conflict of interest, and the unblinded winner still passes the shipping contract. No reviews have been fabricated: the approved count remains zero.

The website should record an instructor edit only with explicit consent and a reversible local boundary:

- original Scion atom;
- accepted instructor revision;
- source context and stable artifact identity;
- reason taxonomy selected or confirmed by the instructor;
- downstream artifacts affected by the edit; and
- whether the revision survived later teaching or semester reuse.

An instructor-accepted revision outranks a synthetic teacher pair. Repeated edits should produce targeted specialists or adapters for quiz validity, assessment authenticity, feedback design, disciplinary explanation, and prose texture rather than one undifferentiated corpus.

## Phase 4 — Train specialists and route by uncertainty

Scion should use the smallest capable seat:

- deterministic compiler for structure and propagation;
- base Scion for contract-stable authoring;
- task adapter for a measured weak artifact class;
- critic and repair pass for medium-confidence output; and
- optional frontier escalation for unresolved, high-impact uncertainty.

The router records why escalation occurred. The product goal is not zero frontier calls at any cost; it is the best publishable course per dollar, with Scion owning the canonical result.

## Phase 5 — Promotion gates

A Scion checkpoint can become the default only when all of these are true:

| Gate                   | Required evidence                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| Corpus integrity       | At least 3,000 verified, deduplicated pairs; no quarantined row enters training                            |
| Frozen rulers          | No regression in schema validity, grounding, answer-key stability, safety, long JSON, or compiler contract |
| Factual canaries       | 100% on frozen source-anchored questions in every domain; raw and grounded modes reported separately       |
| Artifact quality       | Target artifact improves across at least 12 matched seats and multiple disciplines                         |
| Blind model comparison | Scion wins at least 60% of decisive matched comparisons with order effects controlled                      |
| Instructor preference  | At least 65% blind preference against the named paid baseline                                              |
| Editing burden         | At least 50% less instructor editing time than the baseline                                                |
| Product economics      | At least 10x lower generation cost per publishable course                                                  |
| Production proof       | Three retained canaries across at least two domains, with rendered visual QA                               |

The first checkpoint that clears only structural gates remains experimental. “Instructor-ready” and “beats the paid baseline” become allowed claims only after the corresponding external evidence passes.

## Immediate execution order

1. Keep the runtime repair, graph-source persistence, and corpus quarantine gates green.
2. Extend the matched difference lab from quizzes to assignments, rubrics, study guides, and cross-artifact consistency.
3. Run the same source-matched comparison across multiple disciplines and scopes.
4. Generate the first 50 reviewed, pair-level verified records across five modalities. **Current: 50 blind candidates balanced across five domains; 0 approved; 387 raw records quarantined.**
5. Run a small non-adoptable training smoke test to validate mechanics only.
6. Grow to the 3,000-pair threshold without relaxing the filters.
7. Train candidate adapters, run frozen rulers, and retain every rejection.
8. Conduct the independent instructor benchmark and production canaries before changing the public quality claim.

## Definition of “next-level Scion”

Scion is next-level when the feedback loop itself is trustworthy: every shipped repair is verified, every training preference has evidence, every checkpoint can be rejected, and every superiority claim is tied to blind human and production results. Better weights matter, but a model that learns only from proven wins is the durable advantage.
