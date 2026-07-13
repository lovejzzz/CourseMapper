# Scion Adapter Roadmap

**Architecture:** public Gemma 4 E2B base + small Scion adapter + Scion compiler = Scion Vx

**Status:** architecture, distribution, and promotion contracts implemented; no adapter is allowed to ship before the evidence gates pass

**Release boundary:** no current public Scion request claims to use trained weights

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

The first target is `google/gemma-4-E2B-it` at Hugging Face revision `9dbdf8a839e4e9e0eb56ed80cc8886661d3817cf`. Training and evaluation use that exact revision. A browser deployment may use an official quantized derivative only when its relationship to the training base is recorded and the complete downloaded artifact has a verified digest.

The current official Q4 GGUF repository is `google/gemma-4-E2B-it-qat-q4_0-gguf` at revision `69536a21d70340464240401ba38223d805f6a709`; its text model is approximately 3.35 GB. That remains a first-use download. The adapter avoids distributing a second full customized checkpoint; it does not eliminate the public base download.

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

### Browser — capability-gated

WebLLM can download and cache custom full-weight variants, but its current documented runtime does not expose production-ready dynamic LoRA loading. Merging the adapter into the base before WebLLM conversion is a useful compatibility experiment, not the target architecture, because it restores the full customized-model download.

The browser lane therefore has three explicit states:

- `adapter-ready`: the runtime can apply the verified delta to the exact cached base;
- `base-only`: the public base runs through the Scion compiler and the UI truthfully says no learned adapter is active; or
- `unsupported`: device/runtime requirements are not met and Scion selects an honest fallback.

No silent merge, mislabeled base-only run, or unverified adapter is permitted.

Potential implementation paths are evaluated in this order:

1. add or upstream dynamic LoRA support to the WebLLM/MLC path;
2. evaluate a browser runtime that separately loads GGUF base and GGUF LoRA while meeting speed, WebGPU, structured-output, Safari, and memory requirements; and
3. retain a merged full-weight build only as a non-default compatibility fallback with its download cost disclosed.

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
- Course/domain groups cannot cross train, validation, and test splits.
- Every candidate retains its dataset-manifest digest and exact base revision.
- A smoke adapter proves mechanics only and is permanently ineligible for release.
- Rejected checkpoints stay rejected; promotion thresholds are never lowered after seeing results.

## Promotion gates

An adapter becomes part of public Scion only when all gates pass:

| Gate         | Requirement                                                                                                 |
| ------------ | ----------------------------------------------------------------------------------------------------------- |
| Corpus       | At least 3,000 pair-level verified, deduplicated preferences across multiple disciplines                    |
| Leakage      | No course, source packet, or near-duplicate group crosses dataset splits                                    |
| Contract     | Schema-valid first-pass rate improves; no regression in long JSON or typed kernel acceptance                |
| Factual      | Frozen source-anchored canaries remain 100% in grounded mode; cold mode is reported separately              |
| Package      | Five 12-lesson held-out domains reach 99/A with zero P0/P1 findings                                         |
| Efficiency   | Median model-call count falls at least 20% and never exceeds the base by more than 1.05x                    |
| Teachability | Blind instructors prefer the adapter on at least 65% of decisive cases; 95% Wilson lower bound exceeds 0.50 |
| Device       | Chrome/Edge on representative integrated and discrete GPUs pass memory, recovery, and completion tests      |
| Integrity    | Base revision, adapter files, manifest, and evaluation evidence are hash-bound                              |
| Rollback     | Removing one manifest entry restores base-only Scion without changing project data or compiler behavior     |

The base model, adapter, and compiler are evaluated separately as well as together. A package win that merely spends more repair calls is not an adapter win.

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

**Exit:** a supported browser demonstrably downloads the public base once and a separate smaller Scion adapter, then reports the exact active identities.

### M4 — Public Scion Adapter

- Complete the five-domain, device, instructor, and production-canary gates.
- Publish a signed release manifest and adapter artifact.
- Update product language from compiler-only Scion to base-plus-adapter Scion without hiding the public foundation model lineage.
- Keep base-only and paid-provider fallbacks.

**Exit:** Scion Vx truthfully means a verified Gemma base, a verified Scion adapter, and the versioned Scion compiler.

## Current truth

- The exact-base manifest, file-integrity verifier, capability resolver, leakage-safe dataset builder, pinned-snapshot training launcher, adapter packager, runtime identity telemetry, and promotion audit are implemented.
- Separate adapter loading works in the local MLX-VLM development path. A real historical 52.8 MB adapter smoke loaded on the pinned Gemma 4 E2B base, reported its exact base/adapter/manifest identities, and completed a schema-constrained inference. That artifact is permanently `smoke`, not a quality candidate.
- The production dataset build currently admits **0 of 471** audited rows. Rows without an explicit domain and course/project group are quarantined, and a candidate package cannot be created unless its dataset is `ready` with at least 3,000 verified pairs across five domains. `evaluation/scion-adapters/evidence/dataset-gate-v0.16.6.json` retains the count, split hashes, and gate result without retaining quarantined content. This is a healthy fail-closed result, not a reason to weaken the rules.
- Dynamic LoRA loading is not yet implemented in the production WebLLM browser path.
- The public site therefore remains compiler-only Scion until every layer above is real and verified.
- The model-neutral compiler audit is independently green on exact Qwen: its Business Ethics rerun reached 99/A and 38/38 export checks while Scion pass calls fell from 108 to 91, yielding 1.247× the 73-call exact-Gemma control. This strengthens every provider using the compiler; it is not adapter-quality evidence.

## Implementation ledger

| Layer             | Implemented contract                                                                                                                       | Proof command                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Base identity     | Exact Gemma repository, 40-character revision, architecture, and active-runtime identity must match                                        | `npx vitest run tests/scion-adapter-manifest.test.js`                                |
| Package integrity | Every regular adapter file is bound by relative path, byte count, and streaming SHA-256; mutations fail verification                       | `npx vitest run tests/scion-adapter-tooling.test.js`                                 |
| Dataset boundary  | Pair audit, deduplication, explicit domain/course grouping, deterministic group split, overlap check, file hashes, and quarantine ledger   | `npm run build:scion:adapter-dataset`                                                |
| Training          | Exact snapshot resolution, external-cache outputs, ORPO/LoRA training, smoke/candidate separation, and automatic packaging                 | `npm run train:scion:adapter`                                                        |
| Runtime truth     | The local shim refuses bare adapter directories, verifies the manifest before load, and reports base revision plus adapter state/ID/hash   | `npx vitest run scripts/__tests__/e2bOpenAIShim.test.mjs`                            |
| Promotion         | Five matched held-out domains, 99/A and zero P0/P1, per-domain call ceiling, 20% median call reduction, and four external evidence classes | `npm run audit:scion:adapter:promotion -- --manifest ... --candidate ... --base ...` |

The next non-mechanical milestone is corpus acquisition: independent instructor decisions and other admissible pair-level evidence must fill the verified dataset. Only then should a fresh adapter be trained and compared against exact base-only Scion on frozen prompts and the same compiler commit. Browser adapter work proceeds independently; until dynamic loading is proven, browsers must report `base-only` rather than pretending the adapter is active.

## References

- [Google Gemma model overview](https://ai.google.dev/gemma/docs)
- [Google Gemma fine-tuning guidance](https://ai.google.dev/gemma/docs/tune)
- [LoRA: Low-Rank Adaptation of Large Language Models](https://arxiv.org/abs/2106.09685)
- [WebLLM custom-model architecture](https://github.com/mlc-ai/web-llm)
- [MLC LoRA support request](https://github.com/mlc-ai/mlc-llm/issues/2625)
- [llama.cpp separate LoRA adapter support](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)
