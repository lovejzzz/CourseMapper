# Scion Adapter Roadmap

**Architecture:** public Gemma 4 E2B base + small Scion adapter + Scion compiler = Scion Vx

**Status:** exact-QAT smoke training, deterministic GGUF conversion, browser activation, rollback, frozen paired evaluation, source-bound blind-review plumbing, an explicit provenance-bound Codex judge lane, separate human research lanes, and a semantic four-profile device protocol are implemented; no quality adapter has yet supplied the required five-domain Codex comparison, burden, device, factual, export, or browser-runtime evidence

**Release boundary:** no current public Scion request claims to use trained weights

## v0.16.15 — One Judge, Two Orders

**Goal:** let Codex be Scion's standing quality judge without fabricating a panel, instructor review, independence, or classroom validation.

**Lane:** `honest-quality-benchmark-v1` preregisters either `qualified-human` or `single-model-judge` as the primary preference evidence. Scion uses the model lane. Every comparison binds one exact Codex model, runtime or session revision, and prompt SHA-256. Candidate and control rubric scores must be byte-verified and carry that same judge provenance before a pairwise preference is accepted. Each preference also binds both output hashes and both scorecard hashes with a scoring-first attestation.

**Order control:** every distinct candidate/control output pair receives at least one A/B and one B/A pass. The analyzer unblinds each pass, counts one stable trial outcome only when both orders agree, retains missing and position-sensitive passes, and computes the preference interval over stable trial outcomes rather than treating repeated readings by one model as independent judges.

**Frozen bar:** the five preregistered domains—World Languages, World Literature, Psychology, Nutrition, and Astronomy—require ten distinct trials each. The minimum campaign is therefore fifty stable outcomes and one hundred recorded Codex passes. Promotion additionally requires a positive score-difference interval inside every domain, a preference Wilson lower bound above 0.5, a strictly lower compiler-call interval, exact arm and scorecard identities, factual and source gates, valid packages, the four-profile real-device matrix, activation, rollback, recovery, and memory evidence.

**Executable proof:** `npm run audit:scion:codex-judge` verifies the prompt, template, held-out manifest, registry thresholds, and all SHA-256 bindings. `npm run test:quality-benchmark` and `npm run test:quality-benchmark:unit` prove the happy path and fail-closed behavior for missing reverse order, position sensitivity, judge revision drift, scorecard drift, duplicate trials, swapped arms, and unbound scores.

**Release boundary:** this release changes the ruler and promotion policy, not model weights or hosted inference. The bake-off still reports `no-model-promoted`; no real adapter win, paid-reference parity, human validation, or device result is claimed. Public Scion remains the pinned browser-local base plus the model-neutral compiler.

## v0.16.14 — Solo Signal: useful judgment without fake independence

**Goal:** make the product founder's blind judgments useful to Scion research without misrepresenting one conflicted reviewer as independent instructor validation.

**Lane:** every domain packet now keeps the qualified `review.html` instructor lane and adds a separate `founder-review.html` over the same hash-bound anonymous cases. Both pages show one case at a time, report completion progress, autosave locally, and support back, next, direct jumps, and flags. The founder export carries its own protocol, `founder-review` evidence class, product-founder role, declared conflict, non-independent status, and `claimEligible: false` boundary. Its validator is separate, and the production instructor validator and ingestion path reject it.

**Research use:** founder review may identify answer-key mismatches, source contradictions, ambiguous options, weak distractors, unsupported generalization, and overclaim. Those findings can become compiler tests and repairs or motivate a non-promotable research experiment. If a founder and a separately recorded model judge disagree, the disagreement is a diagnostic queue—not an automatic training label.

**Release boundary:** founder judgments do not enter the approved production corpus, satisfy the two-instructor preference gate, unlock candidate training, or promote an adapter. v0.16.14 changes evaluation workflow only; public Scion remains the pinned browser-local base plus the model-neutral compiler, with zero approved training pairs and no learned quality claim.

## v0.16.12 — Device Truth: hashes are not browser proof

**Goal:** make the browser-device promotion gate prove runtime behavior rather than accept any correctly hashed file labeled `pass`.

**Lane:** one frozen v1 protocol now requires Chrome on 8 GB integrated hardware, Edge on 16 GB integrated hardware, Chrome or Edge on an 8 GB discrete GPU, and Chrome on Apple Silicon with at least 16 GB unified memory. Apple Silicon no longer substitutes for discrete-GPU coverage. Every run binds the stable adapter package identity, exact training and browser bases, manifest scale, and runtime, then proves cold and warm loads, base and adapter completions, native manifest-scale activation, exact rollback, three repeated completions, memory budgets, network-abort recovery, cache/storage recovery, and WebGPU-device-loss recovery. Browser trace, console, sanitized hardware probe, and runtime snapshot bytes are mandatory and hash-verified.

**Promotion integrity:** the adapter promotion audit now parses and reruns the semantic device audit after checking the evidence file digest. Missing profiles, fake browser families, insufficient RAM or VRAM, over-budget timings or memory, rehashed failed checks, changed artifacts, path traversal, symlinks, identity mismatch, and incomplete recovery all block promotion. A stable package-identity digest excludes only the mutable promotion block, avoiding an impossible manifest↔evidence hash cycle while still binding every model, training, file, runtime, and conversion field.

**Current truth:** the earlier exact-QAT Chrome smoke remains valuable mechanical evidence, but it is not a device matrix. It covered one Apple Silicon browser run and did not prove Edge, integrated or discrete hardware, measured memory, interrupted downloads, storage pressure, or device-loss recovery. There is still no quality adapter and zero passing v1 device profiles for a promotable candidate. Hosted Scion remains base-only.

## v0.16.11 — Source Orchard evidence + per-atom compiler harvest

**Goal:** create enough independent, source-bound course depth for a real research review campaign while measuring the raw local-model gap separately from compiler recovery.

**Lane:** eight new six-session course groups add two exact inputs in each current research domain. Three source-selected Curriculum Genome kernels per group produce 24 compact calls and 96 requested atoms per arm. Every local and reference project binds the source packet, course input, prompt set, raw and admitted response, model configuration, compile graph, burden, and any recovery call. Strict verification reconstructs all 16 projects before the review packet can be built. Atom-only captures are marked `blind-review-only` so they cannot borrow the authored-lesson and short-answer denominators required by the full-course matrix.

**Measured gap:** the pinned base-only Gemma research route generated 92 and admitted 62 of 96 expected atoms before recovery. GPT-5.4-mini generated 96 and admitted 91. Raw local compiler burden is therefore 34 atoms versus 5—a 29-atom, 30.2084-percentage-point deficit. One zero-atom local response received a bounded one-MC-plus-one-key-term retry, after which compiled local admission reached 63 of 96 and burden remained 33. This is evidence of a large base-model gap and one useful compiler recovery, not evidence that Scion beats the reference.

**Compiler change:** admission now harvests each valid multiple-choice and key-term sibling independently. A valid atom is no longer discarded because a different requested output type failed the contract. Source, factual-support, explanation-key, cue, and structure gates are unchanged; rejected siblings and missing seats remain visible in the burden report.

**Review state:** the ledger now contains 372 neutral candidates and the packet selects 160 across twelve exact course groups, three per domain. Sixty-three selected cases carry the exact neutral source claims, attribution, and license into the offline A/B reviewer without revealing model identity. The five frozen held-out domains remain excluded. Course-depth coverage is ready for research review, but completed independent reviews, approved training pairs, and trained quality adapters remain zero.

**Release Boundary:** public Scion V0.16.11 is still the pinned browser-local Gemma base plus the model-neutral compiler. This release ships evidence and compiler integrity only; it does not ship learned weights or claim adapter quality.

## v0.16.10 — Many Roots course-group integrity

**Goal:** make independent course inputs—not atom count—the unit of evidence diversity.

**Lane:** every neutral comparison derives a stable course-group ID and SHA-256 from its exact canonical input. An explicit manifest label improves readability but does not replace the input binding. Same-input model variants share one group; one label reused across different inputs excludes every affected pair. Blind packet selection round-robins across domain, course group, and atom kind. Protocol v3 binds each public case to the group hash, binds the private source row and A/B mapping in an organizer digest, folds that organizer digest into the public packet hash, and verifies both sides before carrying the group into an approved training row.

**Release Boundary:** the corrected audit finds 309 eligible atoms and 160 selected cases but only four course groups—one in each current domain. The packet remains usable for gathering judgments, but its receipt is `reviewable-incomplete-coverage`; it cannot support a balanced campaign, research-dataset, or learned-quality claim until every included domain has at least three distinct groups and the domain target is met. Completed instructor reviews remain zero and public Scion remains base-only.

## v0.16.9 — Clean-seed corpus + research adapter tier

The training-data audit now refuses model comparisons unless both saved projects carry the exact same canonical course input. It removed 68 World Literature atoms whose retained runs used different prompts. Conversely, it recovered 45 Music Theory atoms from byte-identical inputs by allowing lesson-number matching only when one course repeats a generic title; every such fallback is labeled. Each retained row binds the shared input plus both saved-project digests.

The blind review protocol became tamper-resistant enough to collect learned-weight evidence. A 160-case packet selects exactly 40 cases from each of four training domains, excludes all five frozen held-out domains, hashes the candidate ledger and benchmark, hashes every randomized public A/B case, and hashes the complete packet. Review submissions carry both case and packet digests. Ingestion reconstructs the organizer packet and rejects any changed prompt, side, mapping, domain, packet, or attestation. Approved domain batches merge atomically by case digest, so reruns are idempotent and later batches cannot erase earlier evidence. v0.16.10 subsequently found that these rows represent only one course input per domain, so the packet is reviewable evidence—not a campaign-readiness claim.

Training now has three honest tiers:

1. `smoke-only` proves mechanics and is permanently non-promotable;
2. `research-ready` requires at least 100 approved pairs, with at least 20 instructor-approved pairs and three isolated course groups in each of four domains, and can create only a `research` adapter; and
3. `ready` retains the public bar of at least 3,000 approved pairs across five domains and fifteen groups, with at least 20 instructor-approved pairs in each qualifying domain, before candidate training.

The research tier exists to test whether a small, unusually clean corpus can move the frozen ruler before collecting thousands of labels. That is consistent with the sample-efficiency results in [LIMA](https://arxiv.org/abs/2305.11206) and [QLoRA](https://arxiv.org/abs/2305.14314), while the chosen/rejected training objective follows [ORPO](https://aclanthology.org/2024.emnlp-main.626/). It does not lower promotion requirements after seeing a result: research artifacts remain manifest-level non-promotable, including after browser conversion.

## v0.16.8 — Frozen held-out ruler + artifact-derived paired evidence

The quality lane now has one canonical five-domain benchmark fixed before candidate training: World Languages, World Literature, Psychology, Nutrition, and Astronomy. Its five real Crucible fixtures span 12–15 lessons and bind the exact prompt-only course input, source packet, QAT base contract, and grader bytes by SHA-256. Training manifests publish metadata-minimizing hashes of every `domain:course` group rather than the raw identifiers; missing group proof or any domain/group overlap makes the benchmark ineligible.

Crucible records the comparison identity while generation happens. Both arms must use all five frozen fixtures, one clean compiler commit and tree, byte-identical compiler configuration and grader, and the exact QAT parent. The adapter arm must report the manifest's active adapter ID, digest, and scale; the control must report base-only state. The evidence producer then reads and hashes each real `course.json`, saved project, report, digest, console, exported package manifest, and ZIP. Promotion refuses evidence without this producer and artifact receipt.

This closes an evaluation-provenance gap, not the quality gap. No current candidate has run the frozen ruler, no independently reviewed training corpus exists, and the hosted product remains base-only.

## v0.16.7 — Browser-local base + dynamic adapter mechanics

### Goal

Run the immutable public Gemma base and the Scion compiler in the browser without a model backend, while preserving the separate, independently verifiable adapter architecture.

### Lane

The current product lane is `base-only`: pinned public GGUF + packaged WebGPU-JSPI runtime + Scion compiler. The candidate lane adds a separately downloaded GGUF LoRA only after manifest verification, native activation proof, and every promotion gate.

### Release Boundary

v0.16.7 proves local model delivery, coherent Gemma 4 prompting, native dynamic LoRA mechanics, exact-parent MLX-to-GGUF conversion, effect detection, and exact rollback. It does not promote an adapter. The exact-QAT artifact is a ten-iteration smoke trained from 101 structurally evidenced pairs, not independently reviewed production preferences; scale 1 and scale 4 produced no deterministic canary change, while scale 16 did. The original production audit still has 0 independently qualified preferences from 471 raw events.

## Product thesis

Scion should not fork and redistribute an entire foundation model every time its educational behavior improves. The public base weights remain immutable. EduTool trains and distributes only a parameter-efficient Scion adapter, while the compiler continues to own source grounding, typed contracts, deterministic validation, bounded repair, package compilation, and export.

```text
exact public Gemma 4 E2B base
  + integrity-checked Scion LoRA adapter
  + source and Curriculum Genome context
  + deterministic Scion compiler
  = versioned Scion course-authoring system
```

This creates three independently testable layers:

1. **Rootstock — foundation model.** A public, revision-pinned Gemma 4 E2B checkpoint supplies general language and reasoning capability.
2. **Graft — Scion adapter.** A small learned delta specializes recurring course-authoring behavior that deterministic code should not imitate.
3. **Cultivation — compiler.** Model-neutral contracts, evidence gates, recovery, grading, and packaging make the output reliable. Paid providers continue to benefit from this layer.

## What the adapter should learn

The adapter is for repeated model behavior, not facts that belong in sources and not invariants that belong in code.

Good adapter targets:

- obeying Scion's compact kernel and typed JSON contracts on the first attempt;
- writing authentic evidence-to-decision scenarios;
- authoring parallel, cue-free distractors and contrastive explanations;
- producing applied questions without copying the answer into the stem;
- writing precise key-term definitions, examples, misconceptions, and corrections;
- using concise professor-like prose without process language; and
- reducing predictable repair calls across held-out disciplines.

Compiler-only responsibilities:

- source identity, citation, and provenance;
- deterministic schema, length, and admission rules;
- answer-key and cross-artifact consistency checks;
- user edits, artifact propagation, and package assembly;
- privacy, integrity, rollback, and release truth; and
- provider-neutral quality improvements.

The adapter must never be trained to memorize unsupported course facts, conceal compiler failures, or reproduce one grader's lexical shortcuts.

## Exact base contract

The production adapter target is the exact unquantized QAT parent `google/gemma-4-E2B-it-qat-q4_0-unquantized` at Hugging Face revision `1ca4dd94b623b6e0dd9da00c2239ab84b4f3e5ce`. Training and evaluation must use that exact revision. The earlier non-QAT `google/gemma-4-E2B-it` contract remains historical evaluation evidence but is not compatible production-adapter provenance for the browser QAT artifact.

The browser artifact is `google/gemma-4-E2B-it-qat-q4_0-gguf` at revision `69536a21d70340464240401ba38223d805f6a709`, file `gemma-4-E2B_q4_0-it.gguf`: 3,349,514,112 bytes with SHA-256 `3646b4c147cd235a44d91df1546d3b7d8e29b547dbe4e1f80856419aa455e6fd`. Hugging Face declares the exact QAT parent above. The base remains a first-use download; the adapter avoids distributing a second full customized checkpoint, not the public base download.

Every Scion adapter manifest must bind:

- Scion adapter ID and product version;
- exact base repository and revision;
- training method and dataset-manifest digest;
- every adapter file's byte count and SHA-256 digest;
- supported runtime and adapter format;
- evaluation evidence and promotion status; and
- fallback behavior when the adapter cannot be applied.

An adapter/base mismatch fails closed. The UI may say the base Scion route is available, but it may not say the adapter is active.

## Runtime strategy

### Local development — supported first

The existing MLX-VLM server already accepts a separate adapter path. The new manifest gate will validate the adapter package and exact base contract before the worker loads it. This is the first end-to-end implementation and the reference behavior for evaluation.

### Browser — implemented mechanics, capability-gated promotion

Scion now packages a reproducible wllama/llama.cpp WebGPU-JSPI runtime with native dynamic GGUF LoRA loading. The browser caches the immutable GGUF base independently, verifies adapter manifests and bytes before activation, checks native adapter metadata, proves that inference changed, and proves exact base-output restoration after clearing the adapter. The patched runtime, upstream revisions, WASM, and proof evidence are hash-bound under `runtime/scion-wllama/` and `evaluation/scion-adapters/evidence/`.

The browser lane therefore has three explicit states:

- `adapter-ready`: the runtime can apply the verified delta to the exact cached base;
- `base-only`: the public base runs through the Scion compiler and the UI truthfully says no learned adapter is active; or
- `unsupported`: device/runtime requirements are not met and Scion selects an honest fallback.

No silent merge, mislabeled base-only run, or unverified adapter is permitted.

The implemented path is separate GGUF base plus separate GGUF LoRA. A merged full-weight Scion build remains prohibited as the default because it would erase independent adapter identity and force a complete model redownload for every adapter update. WebLLM/MLC remains a possible future runtime only if it exposes the same separately verifiable dynamic-adapter contract.

## Data and training pipeline

```text
raw model/compiler events
  -> pair-level evidence audit
  -> quarantine or eligible record
  -> deduplicate and group by course/domain
  -> leakage-safe train/validation/test split
  -> dataset manifest + hashes
  -> LoRA/ORPO candidate training
  -> adapter package + hashes
  -> frozen and full-course evaluation
  -> promote or reject
```

Rules:

- Raw flywheel rows are evidence ledgers, never training data.
- Only the curated exporter may create a training split.
- Same-model self-agreement is a runtime check, not independent preference evidence.
- Course/domain groups cannot cross train, validation, and test splits; production and research tiers require at least three course groups per included domain so every domain has isolated train, validation, and test courses.
- Research requires at least 20 approved blind-instructor pairs in each of four domains; production candidate data requires the same floor in each of five domains. Aggregate review totals cannot substitute for domain coverage.
- Adapter manifests carry per-domain course-group counts, per-domain instructor-pair counts, split row counts, and split domain counts so a balanced dataset claim remains independently auditable after training.
- Every candidate retains its dataset-manifest digest and exact base revision.
- A smoke adapter proves mechanics only and is permanently ineligible for release.
- Rejected checkpoints stay rejected; promotion thresholds are never lowered after seeing results.

## Promotion gates

An adapter becomes part of public Scion only when all gates pass:

| Gate         | Requirement                                                                                                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Corpus       | At least 3,000 pair-level verified, deduplicated preferences across five disciplines and fifteen course groups, including at least 20 blind-instructor-approved pairs in every qualifying discipline    |
| Leakage      | No course, source packet, or near-duplicate group crosses dataset splits                                                                                                                                |
| Contract     | Schema-valid first-pass rate improves; no regression in long JSON or typed kernel acceptance                                                                                                            |
| Factual      | Frozen source-anchored canaries remain 100% in grounded mode; cold mode is reported separately                                                                                                          |
| Package      | Five 12-lesson held-out domains reach 99/A with zero P0/P1 findings                                                                                                                                     |
| Efficiency   | Median model-call count falls at least 20% and never exceeds the base by more than 1.05x                                                                                                                |
| Teachability | Blind instructors prefer the adapter on at least 65% of decisive cases; 95% Wilson lower bound exceeds 0.50                                                                                             |
| Device       | Chrome and Edge pass the frozen integrated-8 GB, integrated-16 GB, discrete-8 GB, and Apple-Silicon-16 GB profiles with semantic memory, recovery, completion, activation, artifact, and rollback proof |
| Integrity    | Base revision, adapter files, manifest, and evaluation evidence are hash-bound                                                                                                                          |
| Rollback     | Removing one manifest entry restores base-only Scion without changing project data or compiler behavior                                                                                                 |

The base model, adapter, and compiler are evaluated separately as well as together. A package win that merely spends more repair calls is not an adapter win.

Every adapter/base course comparison is now an artifact-derived paired experiment rather than two records that merely share a domain label. Both arms must bind the frozen benchmark, the same course input, source packet, clean compiler commit and tree, compiler configuration, grader version and bytes, exact base-contract digest, course identity, and 12-lesson minimum. The candidate arm must use the manifest's exact adapter and scale; the control must prove base-only state. Every candidate domain needs a control and vice versa, and the adapter may not regress package grade or P2 findings. Duplicate domain records, reused pair IDs, dirty compiler trees, unmatched domains, mismatched settings, missing artifact receipts, or evidence not emitted by the canonical producer fail promotion.

## Milestones

### M0 — Distribution truth

- Add a versioned adapter-manifest schema and validator.
- Pin the exact Gemma base contract.
- Hash every adapter file and dataset split.
- Expose runtime capability and fail-closed fallback states.
- Make the local model health response report base revision, adapter ID, and whether the adapter is actually active.

**Exit:** a mislabeled, mismatched, modified, or unsupported adapter cannot start as Scion Adapter.

### M1 — Reproducible learning pipeline

- Export leakage-safe curated ORPO splits from eligible flywheel rows.
- Produce a dataset manifest with counts, domains, groups, and SHA-256 digests.
- Pin the Gemma snapshot before training.
- Train outside the Git worktree and package only the small adapter plus manifest.
- Mark every smoke artifact permanently non-promotable.

**Exit:** another machine can reproduce the dataset identity, base identity, and adapter package without copying a full tuned model into the repository.

### M2 — Adapter evaluation

- Compare exact base-only and base-plus-adapter runs on the same prompts, compiler commit, browser, and grader.
- Measure first-pass acceptance, repair reasons, calls, tokens, runtime, factual canaries, and final package quality.
- Retain request/response autopsy logs and exact ZIP evidence.
- Reject any checkpoint with a frozen-ruler or efficiency regression.

**Exit:** at least one adapter candidate reduces repair burden on unseen domains without lowering package quality.

### M3 — Browser delta prototype

- Implement or integrate dynamic adapter loading without merging full weights.
- Cache base and adapter independently.
- Verify hashes before GPU allocation.
- Test unload, rollback, interrupted download, storage pressure, device loss, and version upgrade.
- Measure first-use and repeat-use download and load time.

**Exit:** mechanically achieved in Chrome on July 13, 2026. A real browser downloaded the immutable 3.35 GB base directly from Hugging Face, ran coherent base inference on WebGPU, hash-verified and loaded a separately converted exact-QAT GGUF adapter, reported native Gemma 4 LoRA identity, detected a changed strict course-authoring canary at scale 16, cleared the adapter, and reproduced exact base output. Scale 1 and scale 4 activated natively but did not change the deterministic canary. Broader device qualification remains part of M4 and none of these smoke trials establish adapter quality.

### M4 — Public Scion Adapter

- Complete the five-domain, device, instructor, and production-canary gates.
- Publish a signed release manifest and adapter artifact.
- Update product language from compiler-only Scion to base-plus-adapter Scion without hiding the public foundation model lineage.
- Keep base-only and paid-provider fallbacks.

**Exit:** Scion Vx truthfully means a verified Gemma base, a verified Scion adapter, and the versioned Scion compiler.

## Current truth

- The exact-base manifest, file-integrity verifier, capability resolver, leakage-safe dataset builder, pinned-snapshot training launcher, adapter packager, runtime identity telemetry, and promotion audit are implemented.
- The adapter manifest is schema v2 for browser GGUF packages. It binds the source adapter and manifest, inference scale, conversion receipt, exact llama.cpp revision and converter digest, browser runtime, and the single GGUF artifact's bytes and SHA-256.
- The deterministic `mlx-lora-to-peft-to-gguf-v1` bridge validates the exact QAT base, maps and transposes 276 complete LoRA A/B pairs, ignores only documented quantization bookkeeping, and invokes the official llama.cpp converter pinned at revision `5ec717d1256e34558a44dc09adf1e6e16f2e2682`. The 52,704,096-byte F16 GGUF contains 552 tensors and native `gemma4`/`lora` metadata.
- Dataset truth is split by claim. The strict v0.16.6 production audit admitted **0 of 471** raw events because independent evidence and explicit split identity were missing. The v0.16.7 `--smoke` derivation admitted 101 structurally evidenced pairs across five registered domains solely to prove training and packaging. Its manifest is `smoke-only`; it is not a production corpus and cannot create a candidate or promoted package.
- The matched-corpus audit now retains 372 neutral atoms across Computer Science, Geology, Music Theory, and UX after excluding 68 World Literature atoms with mismatched course inputs. Eight source-bound additions bring the packet to twelve input-bound course groups, exactly three per current domain. The frozen 160-case packet still needs 320 judgments; no judgments have been ingested, so research and production datasets remain correctly blocked even though research course-depth coverage is ready.
- `research-ready` is an experiment lane, not a relaxed release lane. It needs 100 approved pairs, at least 20 blind-instructor-approved pairs and three course groups in each of four domains; its adapter status is `research`, remains non-promotable in every runtime format, and exists only to decide whether collecting the next labels is empirically worthwhile.
- A ten-iteration exact-QAT MLX adapter was converted, packaged, semantically audited, and exercised in the browser. Native activation at scale 1 and scale 4 did not change the deterministic canary. Scale 16 changed it and rollback restored the exact base output. This is strong mechanical evidence and weak learning evidence; it is not a quality result.
- The packaged browser runtime now performs direct public base download, WebGPU inference, native dynamic LoRA activation, activation probing, and rollback. It also runs without cross-origin isolation, avoiding a global header change that could break Firebase sign-in popups.
- The public site now routes Scion generation through this browser-local base and no longer sends prompts to an anonymous model endpoint. Because no production adapter has passed promotion, the truthful product state is `base-only` local Scion plus the Scion compiler.
- The legacy smoke adapter targets the earlier non-QAT base and remains permanently excluded by base mismatch. The new exact-QAT smoke removes that provenance blocker but remains excluded by smoke-only data, insufficient training, missing quality evidence, and every unrun promotion gate.
- The model-neutral compiler audit is independently green on exact Qwen: its Business Ethics rerun reached 99/A and 38/38 export checks while Scion pass calls fell from 108 to 91, yielding 1.247× the 73-call exact-Gemma control. This strengthens every provider using the compiler; it is not adapter-quality evidence.
- The promotion audit now requires one unique, clean, hash-paired adapter/base course per domain. It rejects duplicate or reused comparisons, different inputs or sources, different compiler or grader settings, different exact base contracts, dirty worktrees, mismatched adapter scales, and controls that are not demonstrably base-only.
- Browser-device evidence is now semantic rather than label-based. The promotion audit recomputes a stable adapter-package identity, verifies all retained artifact bytes, and requires all four frozen browser/device profiles plus activation, memory, repeated completion, interrupted-download, storage-pressure, device-loss, and exact-rollback checks. The earlier one-machine smoke does not satisfy this matrix.
- The frozen v1 ruler defines five unseen domains and five exact prompt-only Crucible fixtures. Dataset schema v2 now includes SHA-256 `domain:course` group identities so the evaluator can prove group separation without publishing course names. Old manifests without that proof cannot qualify.
- `scripts/scionAdapterPairedEvidence.mjs` is the only promotion-evidence producer. It preflights a clean compiler and exact runtime state, stamps shared comparison identity into real Crucible runs, hashes seven retained artifacts per course, and emits candidate/base JSON plus a receipt. The promotion audit rejects records without its producer and artifact hashes.

## Implementation ledger

| Layer              | Implemented contract                                                                                                                                                                                                  | Proof command                                                                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Base identity      | Exact Gemma repository, 40-character revision, architecture, and active-runtime identity must match                                                                                                                   | `npx vitest run tests/scion-adapter-manifest.test.js`                                                                                         |
| Package integrity  | Every regular adapter file is bound by relative path, byte count, and streaming SHA-256; mutations fail verification                                                                                                  | `npx vitest run tests/scion-adapter-tooling.test.js`                                                                                          |
| Dataset boundary   | Pair audit, deduplication, explicit domain/course grouping, deterministic group split, overlap check, file hashes, and quarantine ledger                                                                              | `npm run build:scion:adapter-dataset`                                                                                                         |
| Review identity    | Exact-input course-group derivation, explicit-label collision rejection, group-balanced selection, public case/packet hash binding, and ingestion carry-through                                                       | `npm run audit:scion:review-packet`                                                                                                           |
| Held-out ruler     | Five fixed 12–15 lesson domains, prompt/source hashes, exact base-contract digest, grader digest, and domain/group separation proof                                                                                   | `npx vitest run tests/scion-adapter-tooling.test.js`                                                                                          |
| Training           | Exact snapshot resolution, external-cache outputs, ORPO/LoRA training, smoke/candidate separation, and automatic packaging                                                                                            | `npm run train:scion:adapter`                                                                                                                 |
| Browser conversion | Exact source/base verification, deterministic MLX-to-PEFT mapping, pinned official llama.cpp conversion, semantic GGUF audit, and receipt binding                                                                     | `npm run package:scion:adapter:browser -- --adapter-dir ... --output-dir ...`                                                                 |
| Runtime truth      | Local and browser runtimes report exact base and adapter identity; browser activation requires native metadata, changed inference, and exact rollback                                                                 | `npx vitest run scripts/__tests__/e2bOpenAIShim.test.mjs tests/scion-browser-wllama.test.js tests/scion-runtime-status-banner.test.jsx`       |
| Browser delivery   | Pinned same-origin runtime assets load a direct public 3.35 GB GGUF on WebGPU; prompts never enter a generation fetch; first-use progress is visible                                                                  | `npm run audit:scion:browser-base && npm run audit:scion:browser-lora`                                                                        |
| Smoke truth        | Retained exact-QAT artifact, conversion hashes, scale trials, final base-only state, and explicit non-claims agree                                                                                                    | `npm run audit:scion:browser-adapter-smoke`                                                                                                   |
| Device truth       | Four frozen Chrome/Edge hardware profiles bind exact adapter identity, measured budgets, completion, recovery, activation, rollback, and retained artifact bytes; a file hash alone cannot pass                       | `npm run audit:scion:browser-device-matrix -- --manifest ... --evidence ...`                                                                  |
| Promotion          | Five unique hash-paired held-out domains on one clean compiler/grader protocol, exact adapter/base state, 99/A and zero P0/P1, per-domain call ceiling, 20% median call reduction, and four external evidence classes | `npm run audit:scion:adapter:promotion -- --manifest ... --candidate ... --base ...`                                                          |
| Evidence capture   | Real project/report/digest/console/manifest/ZIP artifacts are hashed into paired candidate/base evidence; manually shaped records are rejected                                                                        | `npm run capture:scion:adapter:pairs -- --benchmark ... --dataset-manifest ... --adapter-manifest ... --candidate-round ... --base-round ...` |

The research campaign now has twelve exact-input groups—three per current training domain—so the next learned-quality dependency is independent review, not more unreviewed atoms. Independently verified preferences must replace smoke-only structural evidence; the resulting candidate must then run both arms of the frozen benchmark, beat exact base-only Scion at normal scale, and complete the four-profile device matrix. The scale-16 smoke result makes “adapter active” an inadequate success signal: the real experiment must measure contract acceptance, factual correctness, course quality, repair burden, memory, and recovery. Browsers continue to report `base-only` until a production adapter passes every promotion gate.

## References

- [Google Gemma model overview](https://ai.google.dev/gemma/docs)
- [Google Gemma fine-tuning guidance](https://ai.google.dev/gemma/docs/tune)
- [LoRA: Low-Rank Adaptation of Large Language Models](https://arxiv.org/abs/2106.09685)
- [WebLLM custom-model architecture](https://github.com/mlc-ai/web-llm)
- [MLC LoRA support request](https://github.com/mlc-ai/mlc-llm/issues/2625)
- [llama.cpp separate LoRA adapter support](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)
