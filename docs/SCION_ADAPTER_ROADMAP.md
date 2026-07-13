# Scion Adapter Roadmap

**Architecture:** public Gemma 4 E2B base + small Scion adapter + Scion compiler = Scion Vx

**Status:** exact-QAT smoke training, deterministic GGUF conversion, browser activation, rollback, frozen paired evaluation, and a hash-bound instructor-review campaign are implemented; production adapter remains blocked by missing completed reviews, course-group depth, and the quality gates

**Release boundary:** no current public Scion request claims to use trained weights

## v0.16.9 — Clean-seed corpus + research adapter tier

The training-data audit now refuses model comparisons unless both saved projects carry the exact same canonical course input. It removed 68 World Literature atoms whose retained runs used different prompts. Conversely, it recovered 45 Music Theory atoms from byte-identical inputs by allowing lesson-number matching only when one course repeats a generic title; every such fallback is labeled. Each retained row binds the shared input plus both saved-project digests.

The blind review protocol is now immutable enough to support a learned-weight claim. A 160-case campaign selects exactly 40 cases from each of four training domains, excludes all five frozen held-out domains, hashes the candidate ledger and benchmark, hashes every randomized public A/B case, and hashes the complete packet. Review submissions carry both case and packet digests. Ingestion reconstructs the organizer packet and rejects any changed prompt, side, mapping, domain, packet, or attestation. Approved domain batches merge atomically by case digest, so reruns are idempotent and later batches cannot erase earlier evidence. This is a ready review campaign, not completed human evidence: it requires 320 judgments and currently has zero.

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

| Gate         | Requirement                                                                                                                                                                                          |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Corpus       | At least 3,000 pair-level verified, deduplicated preferences across five disciplines and fifteen course groups, including at least 20 blind-instructor-approved pairs in every qualifying discipline |
| Leakage      | No course, source packet, or near-duplicate group crosses dataset splits                                                                                                                             |
| Contract     | Schema-valid first-pass rate improves; no regression in long JSON or typed kernel acceptance                                                                                                         |
| Factual      | Frozen source-anchored canaries remain 100% in grounded mode; cold mode is reported separately                                                                                                       |
| Package      | Five 12-lesson held-out domains reach 99/A with zero P0/P1 findings                                                                                                                                  |
| Efficiency   | Median model-call count falls at least 20% and never exceeds the base by more than 1.05x                                                                                                             |
| Teachability | Blind instructors prefer the adapter on at least 65% of decisive cases; 95% Wilson lower bound exceeds 0.50                                                                                          |
| Device       | Chrome/Edge on representative integrated and discrete GPUs pass memory, recovery, and completion tests                                                                                               |
| Integrity    | Base revision, adapter files, manifest, and evaluation evidence are hash-bound                                                                                                                       |
| Rollback     | Removing one manifest entry restores base-only Scion without changing project data or compiler behavior                                                                                              |

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
- The v0.16.9 matched-corpus audit retains 309 neutral atoms across Computer Science, Geology, Music Theory, and UX after excluding 68 World Literature atoms with mismatched course inputs. A frozen 160-case campaign requires 320 independent instructor judgments. No judgments have been ingested, so both research and production datasets remain correctly blocked.
- `research-ready` is an experiment lane, not a relaxed release lane. It needs 100 approved pairs, at least 20 blind-instructor-approved pairs and three course groups in each of four domains; its adapter status is `research`, remains non-promotable in every runtime format, and exists only to decide whether collecting the next labels is empirically worthwhile.
- A ten-iteration exact-QAT MLX adapter was converted, packaged, semantically audited, and exercised in the browser. Native activation at scale 1 and scale 4 did not change the deterministic canary. Scale 16 changed it and rollback restored the exact base output. This is strong mechanical evidence and weak learning evidence; it is not a quality result.
- The packaged browser runtime now performs direct public base download, WebGPU inference, native dynamic LoRA activation, activation probing, and rollback. It also runs without cross-origin isolation, avoiding a global header change that could break Firebase sign-in popups.
- The public site now routes Scion generation through this browser-local base and no longer sends prompts to an anonymous model endpoint. Because no production adapter has passed promotion, the truthful product state is `base-only` local Scion plus the Scion compiler.
- The legacy smoke adapter targets the earlier non-QAT base and remains permanently excluded by base mismatch. The new exact-QAT smoke removes that provenance blocker but remains excluded by smoke-only data, insufficient training, missing quality evidence, and every unrun promotion gate.
- The model-neutral compiler audit is independently green on exact Qwen: its Business Ethics rerun reached 99/A and 38/38 export checks while Scion pass calls fell from 108 to 91, yielding 1.247× the 73-call exact-Gemma control. This strengthens every provider using the compiler; it is not adapter-quality evidence.
- The promotion audit now requires one unique, clean, hash-paired adapter/base course per domain. It rejects duplicate or reused comparisons, different inputs or sources, different compiler or grader settings, different exact base contracts, dirty worktrees, mismatched adapter scales, and controls that are not demonstrably base-only.
- The frozen v1 ruler defines five unseen domains and five exact prompt-only Crucible fixtures. Dataset schema v2 now includes SHA-256 `domain:course` group identities so the evaluator can prove group separation without publishing course names. Old manifests without that proof cannot qualify.
- `scripts/scionAdapterPairedEvidence.mjs` is the only promotion-evidence producer. It preflights a clean compiler and exact runtime state, stamps shared comparison identity into real Crucible runs, hashes seven retained artifacts per course, and emits candidate/base JSON plus a receipt. The promotion audit rejects records without its producer and artifact hashes.

## Implementation ledger

| Layer              | Implemented contract                                                                                                                                                                                                  | Proof command                                                                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Base identity      | Exact Gemma repository, 40-character revision, architecture, and active-runtime identity must match                                                                                                                   | `npx vitest run tests/scion-adapter-manifest.test.js`                                                                                         |
| Package integrity  | Every regular adapter file is bound by relative path, byte count, and streaming SHA-256; mutations fail verification                                                                                                  | `npx vitest run tests/scion-adapter-tooling.test.js`                                                                                          |
| Dataset boundary   | Pair audit, deduplication, explicit domain/course grouping, deterministic group split, overlap check, file hashes, and quarantine ledger                                                                              | `npm run build:scion:adapter-dataset`                                                                                                         |
| Held-out ruler     | Five fixed 12–15 lesson domains, prompt/source hashes, exact base-contract digest, grader digest, and domain/group separation proof                                                                                   | `npx vitest run tests/scion-adapter-tooling.test.js`                                                                                          |
| Training           | Exact snapshot resolution, external-cache outputs, ORPO/LoRA training, smoke/candidate separation, and automatic packaging                                                                                            | `npm run train:scion:adapter`                                                                                                                 |
| Browser conversion | Exact source/base verification, deterministic MLX-to-PEFT mapping, pinned official llama.cpp conversion, semantic GGUF audit, and receipt binding                                                                     | `npm run package:scion:adapter:browser -- --adapter-dir ... --output-dir ...`                                                                 |
| Runtime truth      | Local and browser runtimes report exact base and adapter identity; browser activation requires native metadata, changed inference, and exact rollback                                                                 | `npx vitest run scripts/__tests__/e2bOpenAIShim.test.mjs tests/scion-browser-wllama.test.js tests/scion-runtime-status-banner.test.jsx`       |
| Browser delivery   | Pinned same-origin runtime assets load a direct public 3.35 GB GGUF on WebGPU; prompts never enter a generation fetch; first-use progress is visible                                                                  | `npm run audit:scion:browser-base && npm run audit:scion:browser-lora`                                                                        |
| Smoke truth        | Retained exact-QAT artifact, conversion hashes, scale trials, final base-only state, and explicit non-claims agree                                                                                                    | `npm run audit:scion:browser-adapter-smoke`                                                                                                   |
| Promotion          | Five unique hash-paired held-out domains on one clean compiler/grader protocol, exact adapter/base state, 99/A and zero P0/P1, per-domain call ceiling, 20% median call reduction, and four external evidence classes | `npm run audit:scion:adapter:promotion -- --manifest ... --candidate ... --base ...`                                                          |
| Evidence capture   | Real project/report/digest/console/manifest/ZIP artifacts are hashed into paired candidate/base evidence; manually shaped records are rejected                                                                        | `npm run capture:scion:adapter:pairs -- --benchmark ... --dataset-manifest ... --adapter-manifest ... --candidate-round ... --base-round ...` |

The next milestone is learning signal and measured quality, not more evidence plumbing. Independently verified preferences must replace smoke-only structural evidence; the resulting candidate must then run both arms of the frozen benchmark and beat exact base-only Scion at normal scale. The scale-16 smoke result makes “adapter active” an inadequate success signal: the real experiment must measure contract acceptance, factual correctness, course quality, and repair burden. Browsers continue to report `base-only` until a production adapter passes every promotion gate.

## References

- [Google Gemma model overview](https://ai.google.dev/gemma/docs)
- [Google Gemma fine-tuning guidance](https://ai.google.dev/gemma/docs/tune)
- [LoRA: Low-Rank Adaptation of Large Language Models](https://arxiv.org/abs/2106.09685)
- [WebLLM custom-model architecture](https://github.com/mlc-ai/web-llm)
- [MLC LoRA support request](https://github.com/mlc-ai/mlc-llm/issues/2625)
- [llama.cpp separate LoRA adapter support](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)
