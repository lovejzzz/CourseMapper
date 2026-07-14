# CourseMapper evaluation system

CourseMapper now separates four different questions that the old 40-fixture score blurred together:

1. **Compiler contract:** did deterministic generation and packaging behavior regress?
2. **Evidence-aware quality benchmark:** what observable rubric profile, failure caps, coverage, evidence class, and uncertainty does the bound artifact support?
3. **Independent instructor benchmark:** would two unrelated instructors use the generated materials with no more than minor edits?
4. **Production canary:** did a real provider produce a retained, inspectable package that passes operational, deterministic, and rendered visual checks?

The 40 fixtures remain valuable, but only as contract tests. They do not constitute independent evidence that a course is teachable. The v1 rubric, research basis, scoring rules, corpus, and comparison protocol are documented in `docs/QUALITY_BENCHMARK_V1.md` and `docs/QUALITY_BENCHMARK_RESEARCH.md`.

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

The manifest is `evaluation/scion-contrast-matrix.json`; the report is written to `verification-output/scion-contrast-matrix/latest.md`. Public Scion, saved local checkpoints, and the current local route are aggregated separately across six full-course pairs and five domains. The matrix fails closed when a project lacks authored lesson, multiple-choice, or short-answer evidence, and its cross-snapshot pairs remain diagnostic rather than a pooled model ranking. Twelve additional compact source-capture pairs are explicitly `blind-review-only`: they contribute source-bound atom candidates but are excluded from full-course denominators.

## Source-bound capture campaign

Build or verify the compact research evidence with:

```bash
npm run audit:scion:source-capture:local
npm run audit:scion:source-capture:reference
npm run audit:scion:source-capture:recover
npm run audit:scion:source-capture:verify
npm run audit:scion:source-capture:expansion:local
npm run audit:scion:source-capture:expansion:reference
npm run audit:scion:source-capture:expansion:recover
npm run audit:scion:source-capture:expansion:verify
```

The original campaign is `evaluation/scion-source-capture-campaign.json`; its 16 tracked projects remain unchanged under `evaluation/scion-source-capture-evidence/`. The additive v0.16.17 campaign is `evaluation/scion-source-capture-expansion-v0.16.17.json`; its eight projects live under `evaluation/scion-source-capture-expansion-evidence/`. Together, the two campaigns cover twelve exact course groups: three in each of Computer Science, Geology, Music Theory, and UX. The expansion selects six source-anchored Curriculum Genome kernels per group, so each arm receives 24 additional compact prompts and 96 requested atom seats. The project verifier reconstructs the exact source selection, attribution, canonical course input, prompt set, raw response, admitted response, model identity, compile graph, burden, and recovery provenance. Missing, duplicated, malformed, or digest-mismatched calls fail the whole artifact set.

Raw and compiled burden are deliberately separate. The base-only Gemma arm generated 92 and admitted 62 of 96 expected atoms before recovery; GPT-5.4-mini generated 96 and admitted 91. Gemma's raw burden is 34 atoms versus 5, a 29-atom or 30.2084-point deficit. One bounded recovery call for the only zero-atom response raised compiled local admission to 63 and left 33 burden atoms. The compiler also began admitting valid multiple-choice and key-term siblings independently instead of discarding an entire prompt when one output type failed. This preserves more good evidence without weakening any atom gate and without disguising the raw model gap.

The additive campaign used the same exact pinned base and reference contracts in real calls. Base-only Gemma admitted 70 of 96 requested atoms; GPT-5.4-mini admitted 86. Local burden was therefore 26 atoms versus 10, a 16-atom or 16.6666-percentage-point deficit. Across both campaigns, compiled local admission is 133 of 192 versus 177 of 192 for the reference, leaving 59 burden atoms versus 15. This is enough source-bound evidence to run the declared research review, but it is still a measured base-model loss—not an adapter result or a Scion quality win.

Source capture proves model/compiler behavior and creates neutral A/B candidates. It does not establish factual superiority, instructor preference, or teachability. A bounded Scion quality ranking additionally requires the frozen factual, full-course, export, device, compiler-burden, and explicit Codex single-model-judge gates; human or instructor claims remain separate and unavailable without their own evidence.

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

The dataset builder accepts only pair-audited, deduplicated records with an explicit domain and course/project group, then keeps each group inside one deterministic split. Schema v3 exposes SHA-256 `domain:course` group identities and separate evidence counts in the manifest, allowing held-out and primary-judge checks without publishing raw course names. A dataset without that proof cannot qualify for the frozen benchmark. Splits are domain-stratified: once a domain has three groups, one complete course group is assigned to test, one to validation, and the remainder to training. A `smoke` package may prove loading mechanics but is permanently non-promotable. A `research` package requires a `research-ready` dataset with at least 100 stable single-model Codex preferences across four domains and twelve groups, with at least 20 in every qualifying domain; it is also permanently non-promotable. A `candidate` or `promoted` manifest is invalid unless the bound dataset is `ready` with at least 3,000 verified pairs across five domains and fifteen groups, including at least 100 qualifying Codex preferences distributed at 20 or more per domain. The adapter manifest carries per-domain group and model-judge counts plus all three split counts, so aggregate totals cannot conceal a one-domain corpus or an empty held-out split. Instructor counts remain optional observability and cannot substitute for the declared primary lane. Promotion additionally requires exact active base/adapter identity, five clean matched full courses, lower compiler burden, hash-bound factual, device, and production evidence, plus the held-out Codex comparison.

The pre-review boundary uses the same unit. `audit:scion:review-candidates` gives every atom an exact-input course-group ID and digest; one explicit label cannot be reused across changed inputs. `audit:scion:review-packet` first verifies all source-capture projects, then balances by domain, group, and kind. Neutral packet protocol v4 hashes each public case, separately hashes the private source row and A/B mapping, folds the organizer digest into the packet hash, and keeps the optional instructor-review protocol distinct. The current receipt records 437 available atoms and 160 selected cases across sixteen distinct courses, four per research domain. Source-first round-robin selection retains 128 cases with the same neutral source claims above both anonymous candidates; 32 legacy fill cases remain visible in the packet but are excluded from Codex training review. One isolated A/B pass now covers all 128 source-backed cases and is outcome-sealed. The B/A pass and stable approved preferences remain zero, so this is not yet training evidence.

The browser-device boundary is now semantic too. `evaluation/scion-adapters/browser-device-matrix-protocol-v1.json` freezes four profiles: Chrome on integrated 8 GB hardware, Edge on integrated 16 GB hardware, Chrome or Edge on a discrete GPU with at least 8 GB VRAM, and Chrome on Apple Silicon with at least 16 GB unified memory. `npm run audit:scion:browser-device-matrix -- --manifest ... --evidence ...` recomputes the immutable adapter-package identity, checks the exact base/runtime/scale, evaluates load, completion, activation, rollback, memory, interruption, storage, device-loss, and repeat-run requirements, and verifies every retained artifact byte. The adapter promotion audit reruns this semantic verifier after checking the evidence file SHA-256; a hash-correct JSON label can no longer satisfy the device gate. No promotable candidate currently has a passing profile, so the device matrix remains 0/4.

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

Factual screening is not promotion. Promotion additionally requires five passing 12-lesson courses across five domains, 99/A with zero P0/P1, five domain-matched control courses, no more than 1.25× the control's Scion quality-pass calls, and the named browser-device classes. The controlled quality comparison must use ten distinct trials in each frozen domain and one exact Codex model/revision/prompt identity, score both anonymous artifacts before preference, and record both A/B and B/A orders. At least fifty stable trial outcomes and one hundred passes are required; the effective win rate must have a 95% Wilson lower bound above 0.50, every domain's score-difference interval must be positive, and the compiler-call interval must be strictly lower. This is single-model-judge evidence, never human or instructor validation. Crucible imports verify the exact source-weight ID, not merely the endpoint's friendly name:

```bash
npm run audit:scion:model-bakeoff -- \
  --candidate qwen3.5-4b \
  --import-crucible verification-output/crucible/<round>
```

Current evidence screens both Gemma 4 E2B and Qwen3.5 4B at 23/25 cold twice and 25/25 grounded twice. The first exact-provenance full-course pair is complete: on the same 12-lesson UX brief and current compiler, Qwen and Gemma both reached 99/A, zero P0/P1/P2, 101 extracted files, and $0 in 382 and 384 seconds. Qwen remains unpromoted because only one of five domains is complete, the four-profile device matrix and qualifying Codex comparison are absent, and its 85 Scion quality-pass calls are 1.64× Gemma's 52 calls—above the 1.25× ceiling.

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

Build and verify the anonymous packet, then emit the two Codex training-review orders with:

```bash
npm run audit:scion:review-packet
npm run build:scion:codex-training-reviews
```

The packet derives neutral atom pairs from safely matchable real artifact entries; candidate/reference identity is metadata, never a preference label. Before matching lessons it requires exact canonical prompt and attachment identity and binds both saved-project hashes. World Literature remains excluded because its retained runs used different prompts and it belongs to the frozen held-out ruler. The 160-case packet is balanced at 40 cases each across computer science, geology, music theory, and user-experience design; all five held-out domains are excluded. Every case and the complete packet carry SHA-256 identities.

The Codex templates contain only the 128 cases with neutral source context and reverse presentation order between files. Protocol v2 includes the exact source object and binds the atom-only prompt. Complete them in two isolated Codex passes with no prior outcome available, scoring both sides before selecting a winner, tie, or insufficient-evidence decision. Seal the first order before starting the second; after both fresh sealed orders exist, ingest both without restoring completed pass plaintext:

```bash
npm run ingest:scion:codex-sealed-training-reviews -- \
  --sealed /path/to/codex-review-a-b.sealed.json \
  --key /separate/path/to/a-b.key \
  --sealed /path/to/codex-review-b-a.sealed.json \
  --key /separate/path/to/b-a.key
```

The retained v0.16.18 A/B pass is verified without outcome disclosure by `npm run audit:scion:codex-sealed-pass`. Its AES-256-GCM key is intentionally absent from Git. At release time, two 0600 local copies outside the volatile template directory passed an exact unseal/plaintext-hash round trip; a fresh clone still requires a separate key transfer. Template regeneration replaces only the two order files and receipt, preserving other nested evidence. The tracked envelope proves one structurally complete single-model pass existed at the bound hash; it proves no stable winner, training row, adapter improvement, or human evidence.

v0.16.21 packages the reverse reading as a resumable workbook without putting the first reading in its context:

```bash
npm run build:scion:codex-fresh-handoff
npm run audit:scion:codex-fresh-handoff
```

The clean-room workbook contains eight immutable 16-case B/A templates, eight matching blank decisions skeletons, the exact judge prompt, fresh-task instructions, and a manifest. The tracked receipt binds the frozen packet, all 128 source-backed cases, every payload byte, each chunk's original review indices and pair-set digest, the canonical full-template hash, and exact reconstruction order. Modulo assignment interleaves the original packet so every chunk mixes Computer Science, Geology, Music Theory, and UX. The verifier requires the exact allowlist, regular non-symlink files, B/A presentation order, neutral source context, blank scorecards and decisions, and a null prior-outcome state. It rejects organizer mappings, source rows, sealed-envelope fields, key or plaintext identities, prior outcomes, and any added, missing, nested, modified, or linked file. Unknown files are never deleted during regeneration.

The fresh task copies all eight decisions skeletons to one working directory and completes them sequentially in the same fresh Codex session. The revision, runtime, session ID, completion time, no-prior-outcome statement, context-reset attestation, and judgment attestation must match across all chunks. It then runs the atomic path:

```bash
npm run complete:scion:codex-fresh-pass -- \
  --handoff verification-output/scion-codex-fresh-b-a-workbook \
  --receipt evaluation/scion-adapters/evidence/fresh-b-a-workbook-v0.16.21.json \
  --decisions-dir verification-output/scion-codex-fresh-b-a-working \
  --sealed-output verification-output/scion-codex-sealed-passes/v0.16.21-b-a.sealed.json \
  --key-output ~/.codex/scion-secrets/CourseMapper/v0.16.21-b-a.key
```

That command re-verifies every unchanged workbook chunk and the tracked receipt, rejects partial or extra working files, validates each completed decision set, requires one identical fresh session, restores canonical case order in memory, encrypts directly with AES-256-GCM, and creates one envelope plus one 0600 key exclusively. Working decision chunks contain judgment data and must be protected; the command writes no combined completed review pass and prints no winner. The historical v0.16.19 five-file monolith remains reproducible through the `:legacy` scripts. The real B/A pass is still missing until a genuinely fresh task performs all 128 judgments; the workbook itself creates no preference or model result.

v0.16.20 keeps both completed orders sealed until they can be opened together. The dual-envelope ingestion command rejects fewer or more than two envelopes or keys, duplicate paths, duplicate envelope or key identities, noncanonical keys, swapped keys, bad ciphertext or authentication tags, changed plaintext hashes, metadata drift, the wrong order pair, reused judge sessions, and any existing structural or qualification failure. Both batches are decrypted and validated in memory before the approved corpus or organizer report is touched. A failed second input therefore cannot partially ingest the first order or replace existing output bytes.

Successful ingestion writes only derived evidence: stable score-qualified chosen/rejected rows and a report containing counts, hashes, and quarantine reasons. It never writes either completed pass. Stable ties, insufficient evidence, low-quality relative winners, non-positive margins, missing defects, changed bytes, and order-sensitive winners remain quarantined. The derived rows explicitly remain single-model Codex evidence. The bridge is tested, but no real B/A judgment exists yet, so the real approved corpus, adapter, held-out wins, and paid-reference parity remain zero.

Ingestion reconstructs the organizer packet, verifies every prompt and artifact byte, binds four scorecards and two pass hashes, requires at least 4/5 for the winner on factual correctness, source fidelity, teachability, coherence, and task quality, and requires a positive aggregate margin plus concrete losing-side defects. Both orders must resolve to the same anonymous winner. Session reuse, identity drift, low scores, missing source context, changed bytes, missing passes, and position disagreement fail closed. The output is explicitly `single-model-judge` evidence—not human, instructor, independent, classroom, or multi-judge validation—and the dataset audit recomputes an exact training-pair digest before accepting it.

The separate optional working-instructor lane remains available. After two instructors who currently teach the relevant domain complete a domain's forms independently, ingest them with:

```bash
npm run audit:scion:reviews -- \
  --review /path/to/reviewer-1.json \
  --review /path/to/reviewer-2.json
```

Ingestion fails closed. It first reconstructs the organizer packet and recomputes every case and packet digest. Every review must name those exact digests and packet ID, include a valid review timestamp, attest that it was completed independently and without a conflict of interest, and contain a concrete rationale. Both reviewers need distinct IDs, matching case/reviewer domains, `teaches-domain` familiarity, working-instructor attestations, unanimous A/B preference, and scores of at least 4/5 for the winning side's factual correctness and teachability. The unblinded winner must still pass the shipping contract. Approved rows merge atomically by case digest: repeated ingestion is idempotent, new domain batches preserve earlier approvals, and conflicting content under one digest aborts the write. The script cannot verify a person's real-world identity; the organizer remains responsible for confirming that the attestations came from independent domain-qualified instructors.

Instructor ingestion is a separate evidence class and cannot satisfy or overwrite the primary Codex corpus requirement. It exists for optional human validation and calibration; its real-world identity attestations remain the organizer's responsibility.

## Gate profiles

| Profile      | Contract fixtures                                 | V1 quality benchmark       | Instructor benchmark | Production canaries | Allowed claim                                                              |
| ------------ | ------------------------------------------------- | -------------------------- | -------------------- | ------------------- | -------------------------------------------------------------------------- |
| Pull request | 12 representative fixtures plus impacted fixtures | Structural integrity       | Advisory             | Advisory            | Compiler contract and benchmark-protocol integrity                         |
| Main         | All 40 fixtures                                   | Structural integrity       | Advisory             | Advisory            | Compiler contract and benchmark-protocol integrity                         |
| Release      | All 40 fixtures                                   | Strict held-out validation | Strict               | Strict              | Independently validated only for the declared scope when every tier passes |

Run them with:

```bash
npm run audit:evaluation:pr -- --changed-from <base-sha>
npm run audit:evaluation:main
npm run audit:evaluation:release
```

The release profile is deliberately red until qualified held-out and independent evidence exists. Do not replace missing reviews with AI-written reviewer forms or promote structural Office validation to rendered visual QA.

## Evidence-aware quality benchmark v1

The versioned rubric and 13-case dev/calibration/public-governed-held-out corpus live in `evaluation/quality-benchmark/v1/`. Run `npm run audit:quality-benchmark` for schema, hash, rights, split, leakage-policy, deliverable-inventory, and adversarial-coverage integrity. `npm run audit:quality-benchmark:validated` is intentionally locked/red by default. A real held-out run additionally requires `--unlock-heldout` plus exact git, dirty-tree, and contamination declarations; it still remains red until at least four held-out cases have two qualified independent reviews with acceptable ordinal agreement and per-review coverage.

The v1 score is an evidence-capped profile, not a replacement name for the deterministic 99/A package defect grade. Automated evidence caps at 69, model-judge evidence at 79, and one-human or disputed evidence at 89. Fabricated sources, material factual errors, unsafe guidance, rights/privacy breaches, wrong-course contamination, and missing/corrupt deliverables cap the package below publishable. Missing and not-applicable evidence are explicit states.

Controlled comparisons are fail-closed too. Candidate/control arms, predeclared cases, unique trials and seeds, source/settings hashes, output hashes, scorecard files, evidence tiers, qualified blind preferences, latency/cost/failure telemetry, and compiler burden are all bound. Repeated output pairs, duplicate reviewer rows, arbitrary numeric scores, or a hand-written win summary cannot promote a Scion model or adapter.

## Independent instructor benchmark

The benchmark roster lives in [`independent-benchmark/manifest.json`](independent-benchmark/manifest.json). It targets eight real syllabi across short, standard, and semester scope and at least four modalities. At least six cases must be completed.

Each completed case requires a hash-verified source syllabus, its hash-verified generated package, rendered QA, and two independent domain-matched working instructors. Schema v2 uses the evidence-aware 0–4 criterion rubric, explicit evidence states, critical failures, edit burden, and evaluator attestations. The primary metric is whether both reviewers would use that exact package as-is or with minor edits, while the profile remains at least 80 with no critical failure. Review forms are generated under `verification-output/independent-benchmark/review-forms/`; completed forms should be stored in a non-generated benchmark evidence directory and referenced from the manifest.

The benchmark passes only when:

- at least six cases are complete;
- at least four modalities and scopes 5, 8, and 14 are represented;
- at least 80% of completed cases are usable with minimal edits;
- median estimated editing time is no more than 15 minutes per lesson; and
- ordinal agreement satisfies the declared reliability policy, with exact/adjacent agreement and uncertainty reported.

## Production canaries

The canary policy lives in [`production-canaries/policy.json`](production-canaries/policy.json). A release needs at least three recent real-provider runs across two domains, including the public Scion provider family.

A proof-eligible run must retain the generated ZIP, trace, and console log by content hash and include fresh rendered visual QA. Operational success alone is recorded but cannot satisfy the release gate.

The current audit passes with three proof-eligible runs out of three required. `2026-07-10-ux-design-studio-scion-enriched` is the retained public-Scion UX run, `2026-07-12-music-theory-scion-source-backed` is the retained local-Scion music-theory run, and `2026-07-12-ux-design-studio-scion-compiler-hardened` is the retained 12-lesson local-Scion UX run. The third run reached 99/A with zero P0/P1 findings, paired all 63 provider starts with response completions, and passed fresh rendered inspection of 39 slides and 12 quiz pages. The aggregate now satisfies the run-count, two-domain, and required-public-provider conditions. `npm run retain:canary -- --run <run.json>` verifies the source hashes and rendered-QA status before copying evidence into the durable canary store; it refuses mismatches and partial visual review.

The original User Experience Design Studio run is intentionally preserved at 89/B with one P1. The fresh graph-hardened public Scion run (`round-2026-07-11T02-12-21-181Z`) records 99/A, 12/12 enriched lesson kernels, zero P0/P1 findings, and reported cost $0. Against the saved reference packet it measures 67.6% vs. 59.1% applied MC, 100% vs. 100% supported inference, 100% vs. 9.1% contrastive rationales, 100% vs. 58.3% decision-ready scenarios, and 100% vs. 0% for both cue-free and claim-evidence-boundary short answers. Its repaired source-of-truth graph is 37/37 on explanation-key alignment vs. 44/44 for the reference, so the strengthened strict bar passes. The lesson-level ledger records 2 `learn`, 44 `preserve`, 2 `repair`, and 72 `parity` outcomes. An earlier order-reversed advisory judge preferred the second packet in both orders and moved one packet by more than two points, so that verdict remains inconclusive rather than a model win. Rendered QA covered representative Lessons 1, 8, and 12; it found and then verified the fix for a blank trailing quiz page. The artifacts are local rather than durably retained in the canary store, and this is still one matched course without independent instructor review, so it remains operational evidence and **is not production-canary proof or a general superiority claim**.

The current local route's production-safe capture is the 7-lesson music-theory run `round-2026-07-11T19-20-32-320Z`: 61 extracted files, 59 graded files, 99/A, zero P0/P1/P2, 38/38 clean export checks, $0 reported cost, 254 seconds, and 38 provider calls. The readiness gate reported zero blockers, zero warnings, and no readability flags. All seven lessons are genome-augmented. The live graph contains exactly four source-backed MC items per lesson: 28/28 are applied, source-matched, supported, contrastively explained, answer-key aligned, and admission-lint clean. The current route records 35 `preserve` and 35 `parity` quiz outcomes, 7 `preserve` and 35 `parity` surface outcomes, and 9 `preserve` and 40 `parity` cross-artifact outcomes, with zero `learn`, `repair`, or `uncertain` records. Every content bar passes; the strict row remains failed only because 7 lessons do not satisfy the 12-lesson denominator. A model-backfill experiment generated doubled option labels and factually wrong music keys despite same-model solver agreement, so it was rejected and disabled in production. This demonstrates why structural grade, factual verification, and human teachability are reported separately.

The current local UX comparison row points to `round-2026-07-11T20-41-02-548Z`. Its real 12-lesson run reached 99/A with zero P0/P1, 101 extracted files, clean 38/38 export verification, six genome-linked lessons, and a strict matrix pass. The candidate records 27/48 applied MC items (56.3%) versus Luna's 27/44 (61.4%), so the applied rate still trails even though the applied-item count is equal. Both artifacts reach 100% supported inference, explanation-key alignment, scenario coverage, and concrete scenario materials. Scion reaches 100% contrastive rationales versus 9.1%, 100% decision-ready scenarios versus 58.3%, and 100% cue-free plus claim-evidence-boundary short answers versus 0%. The derived scenarios retain explicit `derived-kernel-fallback` provenance. These are deterministic paired diagnostics from one course; the production-canary gate now passes independently, but independent instructor evidence is still required for a teachability or general superiority claim.

The final v0.16.6 production adapter audit loaded 471 raw model/compiler events and admitted 0. The events did not satisfy pair-evidence and explicit split-identity gates, so the production train, validation, and test files were empty by design. The audit found zero group overlap and bound all three empty split hashes. The current packet freezes 160 cases across four non-held-out domains and sixteen course groups; 128 are source-backed enough for Codex review and 32 are excluded. One A/B Codex batch is complete and outcome-sealed, but no pair has the required fresh reverse-order agreement, so approved model-judge pairs and qualifying single-model-judge rows remain zero. The research dataset gate remains blocked; its 76 older deterministic-contract rows do not satisfy learned-quality evidence.

For v0.16.7 mechanics only, the stricter structural-evidence derivation admitted 101 rows across five explicit course/domain groups and produced a smoke-only split. That split has now exercised exact-QAT training, deterministic conversion, GGUF semantic inspection, browser activation, effect probing, and rollback. It does not increase the independently reviewed production corpus above zero.

## Current claim

CourseMapper may now claim that its deterministic compiler contract, retained production-canary policy, and v1 benchmark protocol/corpus structural audit pass. V1 held-out validation remains at zero qualified cases. It may not claim that exported materials are independently instructor-validated, instructor-ready in general, effective for learners, Quality Matters reviewed, or superior to another model until the corresponding human evidence and comparison protocol pass.
