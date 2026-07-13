# Scion Next Level — Verified Learning, Not Model Imitation

> **Historical v0.16.6 plan.** v0.16.7 replaced the hosted Pollinations route with browser-local Scion; v0.16.8 froze a five-domain held-out ruler and made promotion evidence artifact-derived. The current architecture, adapter contract, and promotion gates live in [SCION_ADAPTER_ROADMAP.md](SCION_ADAPTER_ROADMAP.md).

**Status:** historical v0.16.6 adapter infrastructure and compiler-efficiency pass implemented; v0.16.7 completed an exact-QAT browser smoke and v0.16.8 completed the frozen paired-evidence harness, while production training remains correctly blocked by an empty independently qualified corpus
**North star:** Scion produces a more teachable, more internally coherent course than a paid frontier baseline at a fraction of the cost, and the evidence survives blind instructor review.

## v0.16.6 — Rootstock + Graft + Compiler

### Goal

Turn the Scion name into a technically honest, independently testable architecture:

```text
public Gemma 4 E2B base + small Scion adapter + Scion compiler -> Scion Vx
```

The base supplies general capability, the LoRA adapter learns recurring course-authoring behavior, and the compiler owns source truth, deterministic invariants, validation, repair, grading, and packaging. The adapter updates behavior without redistributing a second complete foundation model. It does not remove the first-use public-base download, and it does not make a browser private unless the browser runtime actually runs the complete path locally.

### Implemented foundation

- `src/lib/scionAdapterManifest.js` defines the exact Gemma 4 E2B base contract, adapter formats, runtime capabilities, promotion states, and fail-closed resolution. A candidate or promoted package is impossible below the ready/3,000-pair/five-domain dataset gate.
- `scripts/scionAdapterDataset.mjs` audits rows, deduplicates exact preference pairs, requires a known domain and explicit course/project group, assigns entire groups deterministically to one split, checks overlap, hashes every split, and preserves only source/line/reason metadata for quarantined rows.
- `trellis/tendril/distill/prepare_adapter_base.py` resolves a 40-character Hugging Face revision to one immutable snapshot; `run_orpo_g4.sh` trains outside Git and packages smoke/candidate artifacts separately.
- `scripts/scionAdapterPackage.mjs` binds every regular adapter file by safe relative path, bytes, and streaming SHA-256. The local shim verifies the package before model load, refuses a bare adapter directory, and exposes base revision, adapter state, adapter ID, manifest hash, and load errors through health and model discovery.
- `scripts/scionAdapterPromotionAudit.mjs` requires five matching held-out domains, exact active identity, 99/A and zero P0/P1 on every course, no per-domain call regression above 1.05×, at least 20% median call reduction, and hash-bound factual, instructor, device, and production evidence.

A real historical 52.8 MB adapter completed the local loading path and one schema-constrained inference. It is permanently marked smoke because its training provenance predates this contract and targets the older non-QAT base. The v0.16.6 production exporter admitted **0 of 471** rows, so the correct next input remains independent pair-level evidence—not a lower production threshold.

After this plan was written, v0.16.7 added a separate non-adoptable mechanics lane. It derived 101 smoke-only structural pairs across five explicit domain groups, trained ten iterations against the exact QAT parent, converted the MLX LoRA deterministically through PEFT and pinned llama.cpp into a 52.7 MB GGUF, and proved native browser activation plus exact rollback. The adapter changed the deterministic canary only at scale 16, not scales 1 or 4. This closes the training-to-browser plumbing gap; it does not change the zero independently qualified production-pair count or establish a quality improvement.

### Compiler audit from the Qwen/Gemma gap

The second-domain diff found that the shared applied-reasoning detector recognized only 6 of 45 Qwen multiple-choice items even though many already supplied a concrete business case and asked students to choose an ethical framework, legal interpretation, or action. That false negative triggered 33 rewrite actions, most of which were rejected, and inflated Qwen to 108 Scion pass calls.

The detector now recognizes domain-neutral case-to-framework/judgment frames only when the stem is complete, contains at least 12 words, and supplies either a concrete actor/action pair or inspectable evidence. It still rejects bare recall such as “Which ethical framework focuses on duties?” and incomplete model text. Replaying the retained Qwen graph recognizes 29 of 45 items (64%) while the retained Gemma graph remains 5 of 32 (16%), showing that the new rule distinguishes the actual model outputs instead of making every long question pass.

The repair budget now targets two applied multiple-choice seats per lesson rather than rewriting every non-recall seat. It never rewrites a stem when the item's immutable options or explanation already fail admission. Remaining topic repairs run once per lesson and receive two independent cold batch solves rather than up to two generation attempts plus two solves per item. Every accepted replacement strips model-authored A/B/C/D labels before projection.

The release-gate browser run passed on exact `mlx-community/Qwen3.5-4B-4bit` revision `0e7ffd5c629ef7719d4cbc04069232580bfa9d9c`. The 12-lesson Business Ethics package reached 99/A with zero P0/P1/P2, 38/38 clean export checks, 101 files, and 104/104 completed local requests in 548 seconds. Scion pass calls fell from 108 in the previous exact-Qwen run to 91 (15.7%); the exact-Gemma control used 73, so the final 1.247× burden is inside the 1.25× model ceiling. An intermediate run exposed doubled answer-option labels after late topic repair; final normalization fixed the defect before this proof run. The retained records are `evaluation/scion-domain-evidence/business-ethics-v0.16.6.json` and `evaluation/scion-model-evidence/qwen3.5-4b/2026-07-13T05-19-06-343Z-full-course.json`.

### Remaining road

1. Acquire qualified preferences from the existing blinded, domain-balanced instructor packets and other independently verified pair evidence until the frozen 3,000/five-domain gate is met.
2. Train the first new adapter on the pinned Gemma base, package it as `candidate`, and compare exact base-only versus base-plus-adapter with the same prompts, compiler commit, browser, and grader.
3. Reject any checkpoint that fails factual canaries, final package quality, first-pass contract rate, the 20% repair-call reduction, or independent instructor preference.
4. Prototype separate adapter loading in a browser runtime. Until it passes the device/download/recovery matrix, WebLLM reports `base-only`; it must never claim the adapter is active.

The v0.16.8 implementation makes step 2 executable without post-hoc evidence assembly: the five course/domain fixtures are frozen and training-disjoint, Crucible stamps comparison identity into both arms, and `capture:scion:adapter:pairs` derives the promotion records from hash-bound artifacts. The remaining work in this historical plan is therefore real independently reviewed data, candidate training, and measured wins—not more comparison scaffolding. 5. Publish only the small adapter and signed/hash-bound metadata. Users cache the public base independently, receive smaller Scion updates, and can roll back by removing one adapter registry entry.

The detailed architecture and milestone exits live in [SCION_ADAPTER_ROADMAP.md](SCION_ADAPTER_ROADMAP.md).

## v0.16.5 — Domain Truth

### Goal

Use the second exact-provenance domain as a compiler and evaluator audit, even if neither model wins. Correct every false-green mechanism the matched Business Ethics pair exposes before counting another domain.

### Evidence

Gemma 4 E2B and Qwen3.5 4B ran the same 12-lesson Business Ethics brief through the real Local provider with voice off, one browser, the v0.16.4 compiler, ZIP export, and deep grader. Neither run qualifies. Gemma initially reported 98/A with two P2s, but the exported package contains music-theory material inside Business Ethics lesson surfaces; the v0.16.5 grader replay correctly produces 74/C with one foreign-domain P0. Qwen completed in 551 seconds at 89/B with six P1s because three named readings vanish from both lesson-plan materials and the syllabus schedule. Qwen's final package contains no music-theory contamination.

Both models independently returned all 12 native sessions and then stopped inside the top-level `assessments` array: 2,432 characters for Gemma and 5,546 for Qwen. The new recovery closes only an array prefix ending after a fully complete object, retains the sessions, synthesizes a complete per-session assessment cadence, and records the intervention. Replaying both saved responses now yields 12 sessions, 12 assessments, and exactly 100% total weight. A response ending inside an assessment object remains unrecoverable.

The pair exposed two false instruments. First, Gemma's first attempt crossed Crucible's 10-minute workspace wait just as enrichment finished; the driver mislabeled that generation timeout as `finalizing-package` and retried. Real Local-provider runs now receive the same 3× step cap as shim-routed runs. Second, the quiz best-of-two path literally said `Course: Music theory`, and later repair prompts asked the model to avoid `advanced theory` and `double-check the music theory`. Those strings are removed, and a multi-signal foreign music-theory detector now blocks non-music packages as P0 while exempting actual music courses.

Local evaluation telemetry now reports started, completed, failed, and in-flight inner model generations. Optional body logs carry per-request inner-call counts through async-local attribution, so a browser digest showing six provider calls can no longer erase dozens of local generations. Evidence imported from an external cache worktree is normalized to portable `verification-output/crucible/<round>` identifiers. The compact retained record is `evaluation/scion-domain-evidence/business-ethics-v0.16.5.json`.

The corrected compiler then completed a fresh exact-Gemma browser run, `round-2026-07-13T02-50-48-419Z`, in 762 seconds. It stayed on native authoring after the disclosed skeleton recovery, exported all 12 sessions, passed 38/38 export checks, and completed all 87 inner model generations with zero failures. Its live 89/B report contained only two evaluator false positives: `Utilitarianism` and `UL (safety organization)` were treated as unrelated to Business Ethics. A citation-only Business Ethics vocabulary now recognizes ethical frameworks and product-safety sources without enabling a discipline-density quota. The universal contamination gate also runs before generic-course probe suppression. Regrading the exact saved package produces 99/A with zero findings; the original report remains retained rather than rewritten.

### Release Boundary

v0.16.5 changes no model weights and promotes no candidate. The original Business Ethics pair is a failed diagnostic comparison; the post-fix Gemma package is successful compiler proof, but it is not a current-compiler matched candidate/control win. UX remains the only qualifying matched domain; four matched passing domains, the device matrix, and blind instructor evidence remain required.

## v0.16.4 — Exact Control

### Goal

Replace the legacy model comparison with a current-compiler, exact-source-weight Gemma control and make local model readiness observable rather than inferred from an open HTTP port.

### Lane

This release advances the foundation-model bakeoff and local-runtime lanes: one matched UX control, portable compiler-burden evidence, truthful model preload state, and concurrent-start safety. It does not change the public Pollinations-backed Scion route or foundation-model weights.

### Release Boundary

v0.16.4 proves one matched Gemma/Qwen course and a local-worker readiness contract. It does not promote Qwen, establish multi-domain superiority, complete the browser-device matrix, create qualifying training data, or claim independent instructor readiness. Four additional matched domains and external review remain open work.

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
- The old preference corpus was not safe to train. The current strict audit finds **0 of 418 rows eligible**. The exact Gemma control added seven raw repair pairs, and all 418 remain quarantined: same-model agreement is not independent answer proof, unknown evidence kinds fail closed, applied-stem repairs still need explicit review approval, and post-hoc key realignment is never a training preference.

## Foundation-model bake-off — implemented, no replacement promoted

Scion now treats the backing model as a measured component rather than a permanent identity. `evaluation/scion-model-candidates.json` registers one control and four challengers; `npm run audit:scion:model-bakeoff` records exact source weights and separates factual screening from production promotion.

The screening policy requires two independent cold runs and two source-grounded runs over the frozen 25-case, five-domain packet. Gemma 4 E2B scored 23/25 cold twice and 25/25 grounded twice. Qwen3.5 4B produced the same scores twice, with a warm median of 8.19 seconds per 25-case pass versus 6.94 seconds for Gemma. The misses were stable but not identical, which supports a complementary-router hypothesis but not a Qwen quality win.

The matched full-course test now has an exact control on both sides. Qwen used `mlx-community/Qwen3.5-4B-4bit`; Gemma used `google/gemma-4-e2b-it`. Both ran through the real Local provider with voice off, the same 12-lesson UX prompt, current compiler, browser export, and grader. Qwen and Gemma both reached 99/A, zero P0/P1/P2, 101 extracted files, readiness ready, and $0 in 382 and 384 seconds respectively. Qwen required 85 `scionPass` calls and 42,414 estimated output tokens; Gemma required 52 calls and 29,592 output tokens. The exact pair therefore records 1.64× call amplification, above the 1.25× promotion ceiling. Qwen is **screened but not promoted**: it has one of five required full-course domains, a materially higher repair burden, and no qualifying device matrix or blind instructor win.

The bake-off also became a compiler audit. `npm run audit:scion:compiler-burden` accepts either raw course directories or committed model-evidence JSON, measures calls, rejected repair actions, regeneration outcomes, and rejection reasons, and can select a shared domain. The exact UX pair reports 85 versus 52 Scion calls (1.64×) and 35 versus 19 rejected actions; all 52 Gemma calls carry schema attribution. Promotion rejects more than 1.25× amplification across five domain-matched controls. Replaying the improved depth detector over the retained Qwen inputs avoids 17 of 33 old rewrite targets; the repair prompt now requires an open evidence question and forbids copying options, labels, or answers into the stem.

The challenger run repaired runtime defects too: native SSE is no longer parsed as JSON by the legacy browser bridge; `--llm local` uses the app's real Local provider so keep-alive heartbeats survive; the server and Crucible retain exact source-weight identity; and local subprocess startup inherits the caller's timeout while always draining stderr so loader progress cannot deadlock the child. The exact Gemma control then exposed startup truth: the HTTP shim previously reported ready before the model worker loaded. It now preloads the worker, exposes loading/ready/failed state and load duration, retries a failed preload on demand, and makes concurrent first calls await one shared ready promise. On the current machine the first Python/Transformers import took about 14 minutes; a warm-cache preload took 4.8 seconds.

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
- The ORPO launcher reads only a curated split. Candidate and production modes refuse to train below 3,000 verified pairs; the explicit `--smoke` mode may run below that bar but can emit only permanently non-promotable mechanics artifacts.

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
4. Generate the first 50 reviewed, pair-level verified records across five modalities. **Current: 50 blind candidates balanced across five domains; 0 approved. The separate 101-pair structural smoke set is not a substitute for instructor approval.**
5. ~~Run a small non-adoptable training smoke test to validate mechanics only.~~ **Completed July 13, 2026:** exact-QAT training, deterministic MLX-to-GGUF conversion, native browser activation, scale trials, and exact rollback all passed mechanically; normal-scale quality did not.
6. Grow to the 3,000-pair threshold without relaxing the filters.
7. Train candidate adapters, run frozen rulers, and retain every rejection.
8. Conduct the independent instructor benchmark and production canaries before changing the public quality claim.

## Definition of “next-level Scion”

Scion is next-level when the feedback loop itself is trustworthy: every shipped repair is verified, every training preference has evidence, every checkpoint can be rejected, and every superiority claim is tied to blind human and production results. Better weights matter, but a model that learns only from proven wins is the durable advantage.
