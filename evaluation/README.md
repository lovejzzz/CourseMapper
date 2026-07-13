# CourseMapper evaluation system

CourseMapper now separates three different questions that the old 40-fixture score blurred together:

1. **Compiler contract:** did deterministic generation and packaging behavior regress?
2. **Independent instructor benchmark:** would two unrelated instructors use the generated materials with no more than minor edits?
3. **Production canary:** did a real provider produce a retained, inspectable package that passes operational, quality, and rendered visual checks?

The 40 fixtures remain valuable, but only as contract tests. They do not constitute independent evidence that a course is teachable.

For model improvement, use the paired quiz diagnostic on two saved real generations. It compares authoring behaviors instead of trusting model names, surfaces only measured reference advantages as learning targets, preserves candidate advantages, and calls out shared weaknesses:

```bash
npm run audit:quiz:contrast -- \
  --strict \
  --candidate /path/to/scion/project.json \
  --reference /path/to/reference/project.json \
  --candidate-label Scion \
  --reference-label Reference
```

The report is written to `verification-output/quiz-contrast/latest.md`. `--strict` exits nonzero unless the candidate covers at least 12 lessons and clears the explicit applied-reasoning, supported-inference, contrastive-rationale, scenario, and short-answer bars. A single pair is still directional evidence for prompt and compiler changes; passing strict mode is not a substitute for the independent benchmark or production canaries.

For the route-separated multi-domain diagnostic, run:

```bash
npm run audit:scion:matrix
```

The manifest is `evaluation/scion-contrast-matrix.json`; the report is written to `verification-output/scion-contrast-matrix/latest.md`. Public Scion, saved local checkpoints, and the current local route are aggregated separately across five pairs and five domains. The matrix fails closed when a project lacks authored lesson, multiple-choice, or short-answer evidence, and its cross-snapshot pairs remain diagnostic rather than a pooled model ranking.

## Source-anchored factual canaries

Validate the frozen factual packet with:

```bash
npm run audit:scion:factual-canaries
```

The manifest is `evaluation/scion-factual-canaries.json`. It contains 25 questions—five each for computer science, geology, world literature, research methods, and music theory—resolved from source-anchored Curriculum Genome kernels. Correct-option positions rotate, every domain must be 5/5, and malformed or partial answer vectors fail closed.

For a live OpenAI-compatible model run, supply `--endpoint`, `--model`, and `--label`. Use `--grounded` only when explicitly measuring the Scion system with its verified Curriculum Genome support; cold and grounded scores must never be pooled. The production-safe verifier runs one item per call and constrains the response to one of the exact option texts, avoiding the index-translation and long-batch bias measured in the first local experiment.

Current local evidence is deliberately separated:

- GPT-5.4-mini cold: 25/25;
- Scion-1 cold, exact-option protocol: 23/25; and
- Scion-1 source-grounded, exact-option protocol: 25/25.

The result shows raw Scion still trails the paid model on this factual packet, while the source-backed Scion system closes the measured gap. It does not prove general model superiority or teachability.

## Local foundation-model bake-off

List and evaluate the registered local candidates with:

```bash
npm run audit:scion:model-bakeoff:list
npm run audit:scion:model-bakeoff
```

The registry is `evaluation/scion-model-candidates.json`; promotion evidence is retained under `evaluation/scion-model-evidence/`, while generated reports are written under `verification-output/scion-model-bakeoff/`. Keeping the small evidence ledgers in the repository makes the default audit reproducible after a fresh clone instead of depending on one ignored local run folder. A live screen requires an exact registered candidate/model pair and runs every factual case one at a time in both cold and source-grounded mode. Two passing runs of each mode are required; transient failed sessions remain in the evidence ledger but cannot poison a later clean, exact-identity rerun.

## Scion adapter lane

The adapter lane evaluates a learned delta separately from both the public Gemma 4 E2B base and the Scion compiler. Its architecture, exact base revisions, browser limitations, and milestone exits are defined in `docs/SCION_ADAPTER_ROADMAP.md`.

```bash
npm run build:scion:adapter-dataset
npm run train:scion:adapter -- --smoke
npm run package:scion:adapter -- --adapter-dir ... --adapter-id ... --scion-version ... --dataset-manifest ...
npm run package:scion:adapter:browser -- --adapter-dir ... --output-dir ... --llama-cpp-dir ... --python ...
npm run audit:scion:adapter -- path/to/scion-adapter.json
npm run audit:scion:browser-adapter-smoke
npm run capture:scion:adapter:pairs -- --benchmark evaluation/scion-adapters/held-out-course-benchmark-v1.json --dataset-manifest ... --adapter-manifest ... --candidate-round ... --base-round ...
npm run audit:scion:adapter:promotion -- --manifest ... --candidate ... --base ...
```

The dataset builder accepts only pair-audited, deduplicated records with an explicit domain and course/project group, then keeps each group inside one deterministic split. Schema v2 exposes SHA-256 `domain:course` group identities in the manifest, allowing held-out checks without publishing raw course names. A dataset without that proof cannot qualify for the frozen benchmark. Splits are domain-stratified: once a domain has three groups, one complete course group is assigned to test, one to validation, and the remainder to training. A `smoke` package may prove loading mechanics but is permanently non-promotable. A `research` package requires a `research-ready` dataset with at least 100 blind-instructor-approved pairs across four domains and twelve groups, with at least 20 approved pairs in every qualifying domain; it is also permanently non-promotable. A `candidate` or `promoted` manifest is invalid unless the bound dataset is `ready` with at least 3,000 verified pairs across five domains and fifteen groups, including at least 100 blind-instructor-approved pairs distributed at 20 or more per qualifying domain. The adapter manifest carries the per-domain group and instructor counts plus all three split counts, so aggregate totals cannot conceal a one-domain corpus or an empty held-out split. Promotion additionally requires exact active base/adapter identity, five clean matched full courses, a 20% median Scion-call reduction with no per-domain regression above 1.05×, and hash-bound factual, instructor, device, and production evidence.

The pre-review boundary now uses the same unit. `audit:scion:review-candidates` gives every atom an exact-input course-group ID and digest; one explicit label cannot be reused across changed inputs. `audit:scion:review-packet` balances by domain, group, and kind. Protocol v3 hashes the public case, separately hashes the private source row and A/B mapping, folds that organizer digest into the public packet hash, and carries the verified group through reviewer JSON and the approved row. The v0.16.10 receipt shows why this matters: 309 atoms and 160 selected cases represent only four distinct courses, one per domain. The packet is reviewable, but its incomplete group coverage cannot be presented as a balanced training campaign.

The held-out ruler is `evaluation/scion-adapters/held-out-course-benchmark-v1.json`. It freezes World Languages, World Literature, Psychology, Nutrition, and Astronomy before another candidate is trained. Every course has 12–15 lessons and binds its complete prompt-only course input and source packet. The ruler also binds the exact QAT base contract and the grader file. Any benchmark domain or course group present in the candidate dataset blocks the run instead of triggering a convenient fixture substitution.

Run the two arms from the same clean commit, with the same pair-run ID and the appropriate Local server state:

```bash
npm run crucible -- \
  --llm local \
  --courses mandarin,world-lit-readings,psych-101,nutrition-101,astro-101 \
  --scion-benchmark evaluation/scion-adapters/held-out-course-benchmark-v1.json \
  --scion-dataset-manifest /absolute/path/to/dataset-manifest.json \
  --scion-adapter-manifest /absolute/path/to/scion-adapter.json \
  --scion-arm base-only \
  --scion-pair-run scion-candidate-001
```

Repeat with the verified adapter server and `--scion-arm adapter`, leaving every other argument unchanged. Then pass the two resulting round directories to `capture:scion:adapter:pairs`. The preflight refuses a partial fixture set, an exact-base mismatch, dirty compiler source, an inactive candidate adapter, or an adapter-active control before generation spends time.

“Matched” is fail-closed and artifact-derived. Crucible stamps comparison protocol v1 into both real runs: one unique pair ID; the same frozen benchmark, course input, source packet, compiler commit and tree, compiler configuration, grader version and bytes, and exact base-contract digest; the same course ID and at least 12 lessons; and explicit `adapter` versus `base-only` variants. The candidate's adapter ID, manifest digest, base revision, and scale must match its manifest, while the control must report no active adapter and scale zero. The canonical producer hashes each course's `course.json`, saved project, report, digest, console, exported package manifest, and ZIP before emitting candidate/base evidence plus a receipt. The promotion audit rejects records without that producer and artifact identity. Missing courses, duplicate records, reused pair IDs, unmatched domains, settings mismatches, or a package-grade/P2 regression block promotion.

The production lane remains correctly blocked at 0 independently qualified preferences from the original 471-event audit. `evaluation/scion-adapters/evidence/dataset-gate-v0.16.6.json` retains that fail-closed count, gate issues, leakage result, and empty split hashes. `evaluation/scion-adapters/evidence/legacy-smoke-v0.16.6.json` separately retains the older base-mismatched loading proof and forbids using it as quality or promotion evidence.

The explicit mechanics lane has different claim boundaries. It may admit structurally evidenced rows only when an exact validator trace and an explicit course/domain registry establish the pair and split identity. The v0.16.7 smoke admitted 101 of the 471 events across five groups, trained ten iterations against the exact QAT parent, and produced a `smoke-only` dataset manifest. Those rows are not independently reviewed production preferences, and every package derived from them is permanently non-promotable.

`evaluation/scion-adapters/evidence/browser-adapter-smoke-v0.16.7.json` binds the exact source adapter, dataset, base, conversion mapping, llama.cpp converter, GGUF, and browser scale trials. Scale 1 and scale 4 activated natively without changing the deterministic canary. Scale 16 changed it, and rollback restored the exact base output. The audit status is deliberately `pass-mechanical-only`; it proves the end-to-end adapter path, not better courses.

Factual screening is not promotion. Promotion additionally requires five passing 12-lesson courses across five domains, 99/A with zero P0/P1, five domain-matched control courses, no more than 1.25× the control's Scion quality-pass calls, the named browser-device classes, and at least 50 blind cases with two independent domain-qualified reviews per case. The candidate's effective blind win rate must have a 95% Wilson lower bound above 0.50. Crucible imports verify the exact source-weight ID, not merely the endpoint's friendly name:

```bash
npm run audit:scion:model-bakeoff -- \
  --candidate qwen3.5-4b \
  --import-crucible verification-output/crucible/<round>
```

Current evidence screens both Gemma 4 E2B and Qwen3.5 4B at 23/25 cold twice and 25/25 grounded twice. The first exact-provenance full-course pair is complete: on the same 12-lesson UX brief and current compiler, Qwen and Gemma both reached 99/A, zero P0/P1/P2, 101 extracted files, and $0 in 382 and 384 seconds. Qwen remains unpromoted because only one of five domains is complete, device and instructor evidence are absent, and its 85 Scion quality-pass calls are 1.64× Gemma's 52 calls—above the 1.25× ceiling.

The second exact-provenance pair is retained as failed diagnostic evidence under `evaluation/scion-domain-evidence/business-ethics-v0.16.5.json`. Gemma's Business Ethics package initially reported 98/A but contains foreign music-theory material and regrades 74/C with one P0 under the corrected discipline gate. Qwen's matched package is 89/B with six named-reading identity P1s. Both models emitted all 12 native sessions and then stopped inside the top-level assessments array; the saved responses now replay through the narrow recovery to 12 sessions, 12 deterministic assessments, and 100% total weight. Neither package is `packageValid`, so Business Ethics does not increase passing-domain coverage.

The post-fix exact-Gemma browser run `round-2026-07-13T02-50-48-419Z` is retained in the compact domain record as compiler proof: 762 seconds, 38/38 export checks, 87/87 completed inner generations, zero failed generations, and no foreign-domain contamination. Its two live P1s were evaluator false positives for legitimate Business Ethics sources. The calibrated citation vocabulary regrades that exact saved package 99/A with zero findings, while the universal contamination check still catches multi-signal leakage even when a course uses the generic probe profile. It does not promote a model because there is no current-compiler matched candidate/control pair.

The v0.16.6 exact-Qwen rerun `round-2026-07-13T05-09-35-402Z` provides current-compiler burden proof on the same 12-lesson brief: 548 seconds, 101 files, 99/A with zero findings, 38/38 clean export checks, and 104/104 completed local requests. Qwen's Scion pass calls fell from 108 to 91; compared with the 73-call exact-Gemma control, the resulting 1.247× burden passes the 1.25× ceiling. The compact record binds the package, project, console, and shim-body-log hashes in `evaluation/scion-domain-evidence/business-ethics-v0.16.6.json`. This is a compiler result, not a Qwen promotion or adapter result.

Audit the compiler—not just the model—with:

```bash
npm run audit:scion:compiler-burden -- \
  --candidate evaluation/scion-model-evidence/qwen3.5-4b/2026-07-12T16-53-18-295Z-full-course.json \
  --control evaluation/scion-model-evidence/gemma-4-e2b/2026-07-13T00-09-50-920Z-full-course.json \
  --domain ux-design-studio
```

On the exact UX pair, Qwen required 85 Scion subcalls (7.08 per lesson), 35 rejected quality actions, and 12 accepted regenerations versus Gemma's 52 calls (4.33 per lesson), 19 rejections, and seven regenerations. The audit reports 1.64× call amplification as compiler debt. Every Gemma call carries its schema purpose. Replaying the current depth detector against the retained Qwen Pass-B inputs avoids 17 of the 33 old rewrite targets (51.5%); the revised repair prompt also requires an open evidence question and forbids copying answer labels, option text, or the answer into the stem.

The shipped music genome now contains 28 source-anchored MC items—four for each of seven kernels—with answer positions balanced inside every bank. A partial genome/model merge remains genome-first, so those verified music keys fill the planned MC seats before unverified model questions.

The paired run also writes `learning-ledger.jsonl` for quiz behavior and `surface-learning-ledger.jsonl` for key terms, assignment cores and constraints, discussion structure, and authored study strategies. Each lesson/dimension record is classified as `learn`, `preserve`, `repair`, `parity`, or `uncertain`. Every record remains `diagnostic-only`; a model identity, field count, or aggregate score is never a pair-level preference label.

Audit the preference corpus separately:

```bash
npm run audit:scion:corpus
```

Raw teacher and app-flywheel rows are evidence ledgers. Only rows with a complete prompt, a contract-clean chosen response, and verified pair-level preference evidence enter the curated training split. Answer repairs require agreement from at least two distinct verifier identities, applied-stem repairs require explicit review approval, and post-hoc key realignment is always quarantined. The normal ORPO launcher reads only the production split and refuses fewer than 3,000 verified pairs. `npm run train:scion:adapter -- --research` accepts only the separate `research-ready` tier and emits a manifest-level non-promotable `research` adapter.

Build a blind instructor-review packet with:

```bash
npm run audit:scion:review-packet
```

The command derives neutral atom pairs from the safely matchable real artifact entries in `evaluation/scion-contrast-matrix.json`; candidate/reference identity is metadata, never a preference label. Before matching lessons it requires exact canonical prompt and attachment identity and binds both saved-project hashes. The v0.16.9 audit therefore excludes the retained World Literature pair because its model runs used different prompts, while a labeled lesson-number fallback recovers Music Theory from identical inputs whose reference course repeated one generic title. The generated reviewer directory splits anonymized A/B cases into `by-domain/` folders, while the organizer directory contains the mapping key. Each domain folder has a self-contained offline `review.html`: it stores drafts in local browser storage and downloads completed JSON without sending any network request or exposing the organizer key. The current 160-case packet is balanced at 40 cases each across computer science, geology, music theory, and user-experience design. All five frozen evaluation domains are excluded. Every public case and the complete packet have SHA-256 identities carried into reviewer submissions. After two instructors who currently teach the relevant domain complete that domain's forms independently, ingest them with:

```bash
npm run audit:scion:reviews -- \
  --review /path/to/reviewer-1.json \
  --review /path/to/reviewer-2.json
```

Ingestion fails closed. It first reconstructs the organizer packet and recomputes every case and packet digest. Every review must name those exact digests and packet ID, include a valid review timestamp, attest that it was completed independently and without a conflict of interest, and contain a concrete rationale. Both reviewers need distinct IDs, matching case/reviewer domains, `teaches-domain` familiarity, working-instructor attestations, unanimous A/B preference, and scores of at least 4/5 for the winning side's factual correctness and teachability. The unblinded winner must still pass the shipping contract. Approved rows merge atomically by case digest: repeated ingestion is idempotent, new domain batches preserve earlier approvals, and conflicting content under one digest aborts the write. The script cannot verify a person's real-world identity; the organizer remains responsible for confirming that the attestations came from independent domain-qualified instructors.

If an advisory model judge is added to a paired comparison, run the same packet twice with the order reversed (`A/B` and `B/A`). Normalize scores back to the real packet labels. If the preferred packet flips with position, either packet's score moves by more than two points, or both readings prefer the same letter position while the underlying packet preference flips, mark the judge verdict **inconclusive**. Do not average an order-biased pair into a claimed win.

## Gate profiles

| Profile      | Contract fixtures                                 | Instructor benchmark | Production canaries | Allowed claim                                    |
| ------------ | ------------------------------------------------- | -------------------- | ------------------- | ------------------------------------------------ |
| Pull request | 12 representative fixtures plus impacted fixtures | Advisory             | Advisory            | Compiler contract only                           |
| Main         | All 40 fixtures                                   | Advisory             | Advisory            | Compiler contract only                           |
| Release      | All 40 fixtures                                   | Strict               | Strict              | Independently validated only when all tiers pass |

Run them with:

```bash
npm run audit:evaluation:pr -- --changed-from <base-sha>
npm run audit:evaluation:main
npm run audit:evaluation:release
```

The release profile is deliberately red until the independent evidence exists. Do not replace missing reviews with AI-written reviewer forms or promote structural Office validation to rendered visual QA.

## Independent instructor benchmark

The benchmark roster lives in [`independent-benchmark/manifest.json`](independent-benchmark/manifest.json). It targets eight real syllabi across short, standard, and semester scope and at least four modalities. At least six cases must be completed.

Each completed case requires a hash-verified source syllabus, its hash-verified generated package, and two independent working instructors. The primary metric is whether both reviewers would teach that exact package as-is or with minor edits. Review forms are generated under `verification-output/independent-benchmark/review-forms/`; completed forms should be stored in a non-generated benchmark evidence directory and referenced from the manifest.

The benchmark passes only when:

- at least six cases are complete;
- at least four modalities and scopes 5, 8, and 14 are represented;
- at least 80% of completed cases are usable with minimal edits;
- median estimated editing time is no more than 15 minutes per lesson; and
- reviewer score spread stays within the agreement threshold.

## Production canaries

The canary policy lives in [`production-canaries/policy.json`](production-canaries/policy.json). A release needs at least three recent real-provider runs across two domains, including the public Scion provider family.

A proof-eligible run must retain the generated ZIP, trace, and console log by content hash and include fresh rendered visual QA. Operational success alone is recorded but cannot satisfy the release gate.

The current audit passes with three proof-eligible runs out of three required. `2026-07-10-ux-design-studio-scion-enriched` is the retained public-Scion UX run, `2026-07-12-music-theory-scion-source-backed` is the retained local-Scion music-theory run, and `2026-07-12-ux-design-studio-scion-compiler-hardened` is the retained 12-lesson local-Scion UX run. The third run reached 99/A with zero P0/P1 findings, paired all 63 provider starts with response completions, and passed fresh rendered inspection of 39 slides and 12 quiz pages. The aggregate now satisfies the run-count, two-domain, and required-public-provider conditions. `npm run retain:canary -- --run <run.json>` verifies the source hashes and rendered-QA status before copying evidence into the durable canary store; it refuses mismatches and partial visual review.

The original User Experience Design Studio run is intentionally preserved at 89/B with one P1. The fresh graph-hardened public Scion run (`round-2026-07-11T02-12-21-181Z`) records 99/A, 12/12 enriched lesson kernels, zero P0/P1 findings, and reported cost $0. Against the saved reference packet it measures 67.6% vs. 59.1% applied MC, 100% vs. 100% supported inference, 100% vs. 9.1% contrastive rationales, 100% vs. 58.3% decision-ready scenarios, and 100% vs. 0% for both cue-free and claim-evidence-boundary short answers. Its repaired source-of-truth graph is 37/37 on explanation-key alignment vs. 44/44 for the reference, so the strengthened strict bar passes. The lesson-level ledger records 2 `learn`, 44 `preserve`, 2 `repair`, and 72 `parity` outcomes. An earlier order-reversed advisory judge preferred the second packet in both orders and moved one packet by more than two points, so that verdict remains inconclusive rather than a model win. Rendered QA covered representative Lessons 1, 8, and 12; it found and then verified the fix for a blank trailing quiz page. The artifacts are local rather than durably retained in the canary store, and this is still one matched course without independent instructor review, so it remains operational evidence and **is not production-canary proof or a general superiority claim**.

The current local route's production-safe capture is the 7-lesson music-theory run `round-2026-07-11T19-20-32-320Z`: 61 extracted files, 59 graded files, 99/A, zero P0/P1/P2, 38/38 clean export checks, $0 reported cost, 254 seconds, and 38 provider calls. The readiness gate reported zero blockers, zero warnings, and no readability flags. All seven lessons are genome-augmented. The live graph contains exactly four source-backed MC items per lesson: 28/28 are applied, source-matched, supported, contrastively explained, answer-key aligned, and admission-lint clean. The current route records 35 `preserve` and 35 `parity` quiz outcomes, 7 `preserve` and 35 `parity` surface outcomes, and 9 `preserve` and 40 `parity` cross-artifact outcomes, with zero `learn`, `repair`, or `uncertain` records. Every content bar passes; the strict row remains failed only because 7 lessons do not satisfy the 12-lesson denominator. A model-backfill experiment generated doubled option labels and factually wrong music keys despite same-model solver agreement, so it was rejected and disabled in production. This demonstrates why structural grade, factual verification, and human teachability are reported separately.

The current local UX comparison row points to `round-2026-07-11T20-41-02-548Z`. Its real 12-lesson run reached 99/A with zero P0/P1, 101 extracted files, clean 38/38 export verification, six genome-linked lessons, and a strict matrix pass. The candidate records 27/48 applied MC items (56.3%) versus Luna's 27/44 (61.4%), so the applied rate still trails even though the applied-item count is equal. Both artifacts reach 100% supported inference, explanation-key alignment, scenario coverage, and concrete scenario materials. Scion reaches 100% contrastive rationales versus 9.1%, 100% decision-ready scenarios versus 58.3%, and 100% cue-free plus claim-evidence-boundary short answers versus 0%. The derived scenarios retain explicit `derived-kernel-fallback` provenance. These are deterministic paired diagnostics from one course; the production-canary gate now passes independently, but independent instructor evidence is still required for a teachability or general superiority claim.

The final v0.16.6 production adapter audit loaded 471 raw model/compiler events and admitted 0. The events did not satisfy the independent-evidence and explicit split-identity gates, so the production train, validation, and test files were empty by design. The audit found zero group overlap and bound all three empty split hashes. The corrected review packet freezes 160 cases across four non-held-out domains and requires 320 independent instructor judgments, but v0.16.10 also proves that those cases come from only one course group per domain. No instructor decision is counted until valid completed forms are ingested, and no research split is ready until course depth reaches three groups per domain.

For v0.16.7 mechanics only, the stricter structural-evidence derivation admitted 101 rows across five explicit course/domain groups and produced a smoke-only split. That split has now exercised exact-QAT training, deterministic conversion, GGUF semantic inspection, browser activation, effect probing, and rollback. It does not increase the independently reviewed production corpus above zero.

## Current claim

CourseMapper may now claim that its deterministic compiler contract and retained production-canary policy pass. It may not claim that the exported materials are independently instructor-validated, instructor-ready in general, or superior to a paid model until the human benchmark passes.
