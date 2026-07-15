# Scion Adapter Roadmap

**Architecture:** public Gemma 4 E2B base + small Scion adapter + Scion compiler = Scion Vx

**Status:** exact-QAT smoke training, a timestamp-independent dataset identity with source and split receipts, a pinned Apple MLX toolchain, dual-seeded ORPO launch, hash-bound plan and completion receipts, schema-v3 learned-adapter provenance through GGUF conversion, deterministic GGUF conversion, browser activation and rollback, a dual size budget with bounded streaming and atomic adapter installation, one registry-coordinated canary/install/activation/deactivation path with rollback quarantine, frozen paired evaluation, a promotion-independent package identity, semantic factual and production canaries, a provenance-bound Codex comparison and training-preference lane, semantic promotion verification against both base and the pinned paid reference, 128 source-bound review cases across sixteen course groups, one outcome-sealed 128-case A/B Codex pass, a Git-tracked B/A-only fresh-task handoff that reconstructs from its frozen canonical source, an eight-chunk one-session B/A workbook with canonical in-memory assembly, dual-envelope plaintext-free ingestion, deterministic incomplete-explanation recovery, a two-campaign cross-arm compiler-lift replay, shared key-term semantics, bounded local defect recovery, conservative cross-attempt field retention, separate optional human research lanes, a semantic four-profile device protocol, and one real passing Apple-Silicon recovery profile are implemented; the fresh B/A judgment, stable training preferences, quality adapter, other three device profiles, and five-domain adapter win do not exist yet

**Release boundary:** no current public Scion request claims to use trained weights

## v0.16.31 — Seed Before You Graft

**Goal:** make the learned delta reproducible before the clean-room judgment creates its first approved preference rows. A dataset hash and a final weight hash are not enough if the run between them depends on an unrecorded RNG state, changing library defaults, a dirty checkout, or an unnamed local toolchain.

**Dataset identity:** schema-v3 datasets now retain a regular-file receipt for every present source and an explicit missing receipt for absent optional sources. Their canonical identity excludes generation time and binds the verified source bytes, admitted train/validation/test bytes and row counts, evidence and domain distributions, course-group split identities, leakage result, training schema, and production/research gate state. Every split projects heterogeneous source rows into one explicit `chosen`/`rejected` conversation schema with the prompt present in both arms and one fixed provenance object; the model sees the conditional conversation while pair, source-line, split, domain, group, and evidence identity remain auditable. Training re-parses every JSONL row and independently checks all bytes, hashes, counts, source receipts, format, and canonical identity.

**Pinned trainer:** `evaluation/scion-adapters/training-toolchain-v1.json` pins Python 3.13.3, MLX 0.31.2, MLX-VLM 0.6.3, NumPy 2.5.1, Transformers 5.13.0, Hugging Face Hub 1.22.0, Safetensors 0.8.0, Datasets 5.0.0, PyArrow 25.0.0, Tokenizers 0.22.2, and exact hashes for `mlx_vlm.lora`, the LoRA layer implementation, ORPO trainer, dataset adapter, prompt renderer, and Gemma 4 processor. The CI-safe contract audit exercises the wrapper without Apple ML dependencies; the live audit imports the installed stack and compares its actual versions and module bytes.

**Seed and plan:** MLX-VLM 0.6.3 shuffles with NumPy and initializes LoRA tensors with MLX randomness but exposes no seed flag. `scion_seeded_mlx_vlm_lora.py` sets both sources before trainer import. `scionAdapterTrainingRun.mjs` refuses a dirty repository, wrong base snapshot, drifting toolchain, changed source or split, unsafe file, or incomplete profile; records every ORPO parameter and command explicitly; and derives the adapter ID from the plan identity rather than the current time.

**Completion and conversion:** the completion receipt binds the canonical plan, final adapter configuration and weight bytes, and a digest of the locally retained log. Raw logs are not added to the distributed package. Manifest schema v3 makes direct receipts mandatory for research, candidate, and promoted MLX packages. Browser conversion first verifies that MLX package, then copies its plan, result, and source manifest into the GGUF package and binds all three through the conversion receipt. Schema v2 remains valid only for historical smoke or rejected mechanics artifacts.

**Release boundary:** the new contract was tested against synthetic byte-bound outputs and the real installed toolchain. It does not train a new quality adapter, change the public base, complete the fresh B/A judgment, create stable preferences, add a device profile, beat exact base, or match the paid reference. Hosted Scion remains the pinned public base plus compiler.

## v0.16.30 — The Handoff Is the Evidence

**Goal:** make the exact reverse-order Codex judgment input survive a clean checkout and remain paired with the already sealed 128-case A/B pass. The clean-room boundary is meaningless if a receipt exists but the payload is ignored locally or rebuilt from a different candidate pool.

**Defect found:** the canonical `audit:scion:codex-fresh-handoff` command reconstructed from mutable source-capture candidates. Later candidate changes now produce 123 B/A cases with different packet, organizer, pair-set, template, and file digests, so the audit correctly failed against the historical 128-case receipt. The original blank workbook still verified on the development machine, but both it and its five-file canonical source lived under ignored `verification-output`; a clean checkout contained neither. Regenerating or accepting the 123-case packet would break reversed-order comparability with the sealed A/B pass.

**Tracked clean-room kit:** `evaluation/scion-adapters/handoffs/fresh-b-a-canonical-v0.16.19/` now retains the verified five-file B/A-only canonical source, while `fresh-b-a-workbook-v0.16.30/` retains the exact prompt, instructions, manifest, eight 16-case review chunks, and eight blank decision chunks. The new receipt binds all 128 cases and every file byte. Both validators reject added, missing, changed, linked, nonblank, outcome-bearing, organizer, mapping, identity, key, ciphertext, or plaintext inputs. No prior result was opened or copied into the kit.

**Reproducible audit:** workbook construction without an explicit new packet first verifies the frozen canonical handoff against its v0.16.19 receipt and reads only that exact B/A template. The canonical audit verifies the committed workbook against its v0.16.30 receipt, rebuilds it into a temporary directory from the frozen source, and requires byte equality. Legacy audit/build defaults now verify the frozen canonical artifact instead of silently following mutable upstream inputs. Receipt failures retain the fail-closed `tracked-receipt-mismatch` summary and add bounded exact JSON paths such as `$.selectedCases`; focused tests prove frozen-source reconstruction after the original packet directory is removed.

**Release boundary:** this repairs delivery of the missing judgment input; it does not perform the B/A judgment, decrypt the sealed A/B result, derive a stable preference, add an approved training row, train or activate a quality adapter, change Gemma weights, complete another device profile, beat base across five held-out domains, or match the paid reference. Hosted Scion remains the pinned public base plus compiler.

## v0.16.29 — No Circular Proof

**Goal:** make every external adapter-promotion gate semantic and make the exact adapter identity constructible. A candidate must not pass because a JSON file is hash-correct and says `pass`, and an evidence protocol must not require a circular fixed-point hash that no legitimate manifest can produce.

**Stable identity:** v0.16.28 bound single-model judgment to the SHA-256 of the manifest that also contains the judgment-file SHA-256. That is circular: adding the evidence attestation changes the manifest hash recorded inside the evidence. v0.16.29 replaces promotion identity with `computeScionAdapterPackageIdentity`, which covers the adapter, base, training, files, runtime, and conversion contract while excluding mutable promotion attestations. The manifest still hashes each evidence file, while each evidence file binds the stable package identity. The contract audit proves that adding promotion evidence changes no package identity.

**Factual canary:** `evaluation/scion-adapters/factual-canary-promotion.template.json` requires exactly two cold and two source-grounded browser runs against the frozen 25-case, five-domain packet. Each run binds the exact public base revision, native browser runtime, adapter ID, package identity, scale, native LoRA metadata, one request per case, and retained raw option text. The audit reconstructs the selected option from raw text and independently rescores every answer. Cold runs need at least 23/25; grounded runs need 25/25 and perfect per-domain results. Duplicate runs, endpoint relabeling, mixed packets, malformed vectors, convenient extra trials, and pass-shaped summaries fail.

**Production canary:** `evaluation/scion-adapters/production-canary-promotion.template.json` requires exactly three predeclared recent live-browser runs across at least two domains. Every run needs twelve lessons, public Scion, a clean 40-character compiler commit, Scion-version match, Codex visual QA, complete requests, 99 quality, and zero P0/P1/P2. The audit byte-verifies regular campaign-local ZIP, trace, console-log, and runtime-receipt artifacts; opens the ZIP; parses `PACKAGE_MANIFEST.json`; verifies file count, app version, readiness, and quality; parses trace gates; and cross-checks the exact native adapter receipt and every digest. Legacy base-only canaries remain useful operational history but cannot certify an adapter because they contain no adapter runtime receipt.

**Promotion integration:** factual, single-model-judge, browser-device-matrix, and production-canary attestations are all parsed and semantically audited by `scionAdapterPromotionAudit.mjs`. `npm run audit:scion:adapter:canaries:contract` verifies both canonical templates, the stable-identity invariant, and rejection of hashable factual and production dummies. Standalone factual and production commands audit future real campaigns. Adversarial fixtures additionally reject refreshed false summaries, raw-answer/index disagreement, duplicate artifacts, traversal, missing identity, and retained-package drift.

**Release boundary:** this release repairs and strengthens the ruler. It does not perform the fresh B/A judgment, train or activate a quality adapter, change Gemma weights, complete the remaining device profiles, beat exact base across five held-out domains, or match the paid reference. Hosted Scion remains the pinned public base plus compiler.

## v0.16.28 — Proof, Not a Pass

**Goal:** prevent a syntactically valid, hash-correct, but semantically empty judge attestation from satisfying adapter promotion, while preserving the fresh-task boundary around the missing reverse-order judgment.

**Canonical evidence wrapper:** `evaluation/scion-adapters/single-model-judge-promotion.template.json` binds `honest-quality-benchmark-v1`, its exact manifest, rubric, and single-judge prompt, the frozen five-course benchmark, exact adapter identity, base revision, adapter scale, and a concrete GPT-5.4-mini reference revision. Exactly two comparison roles are allowed: adapter versus exact base-only Scion and the identical adapter outputs versus the pinned paid reference. A floating paid alias, missing role, changed hash, mismatched model identity, or different candidate artifact blocks promotion. v0.16.29 corrects this historical wrapper's circular full-manifest digest to the promotion-independent package identity.

**Recomputed judgment:** every comparison contains exactly ten trials in each of Mandarin/world-languages, World Literature, Psychology, Nutrition, and Astronomy. The audit recomputes source and input bindings, all nine rubric dimensions, byte-verified scoring-first scorecards, balanced candidate side placement, the exact judge identity, one A/B and one B/A pass, unblinded order consistency, aggregate and per-domain score intervals, aggregate and per-domain preference bounds, and compiler burden. Candidate outputs and scorecards must be reused across both controls so control-specific regeneration cannot masquerade as a matched comparison.

**Path integrity:** scorecards must be regular non-symlink files under the comparison directory. Absolute paths, traversal, escaping real paths, and symlinks fail before content or hashes are trusted. The promotion Markdown report now shows semantic status and issues for each external evidence class rather than only a Boolean gate.

**Proof:** `npm run audit:scion:adapter:judge:contract` verifies the canonical bindings and proves that a hashable `{ type: "single-model-judge", status: "pass" }` object is blocked. `npm run audit:scion:adapter:judge -- --manifest <adapter.json> --evidence <campaign.json>` audits a real campaign. Focused fixtures also prove the positive 5×10×2 path and reject a missing reverse pass, source substitution, incomplete dimensions, side imbalance, a floating paid revision, path escape, and non-reused candidate bytes.

**Release boundary:** no real judgment is created by this release. The earlier A/B result stays sealed, the B/A reading still belongs in a genuinely fresh task with no prior outcome, and approved preferences, quality adapter weights, held-out wins, paid-reference parity, and production activation remain absent. Hosted Scion stays base-only.

## v0.16.27 — Corrections That Correct

**Goal:** recover the exact fourteen local key-term deficits exposed by v0.16.26 without weakening admission, inventing semantic content in the compiler, changing model weights, or manufacturing adapter evidence.

**Shared admission contract:** compact Scion JSON, full provider JSON, and legacy line output now normalize through one script-aware key-term contract. A valid atom needs a lesson-specific term, non-circular definition, concrete example, plausible misconception, separately worded correction, and source indexes within the supplied claim packet. The public browser provider evaluates the whole lesson response, accumulates earlier defects across at most two retries, and supplies focused feedback. Native Pass B retries contract-incomplete kernels for every provider, not only missing objects.

**Conservative compiler recovery:** when separate model attempts contain complementary fields, the compiler may retain an earlier model-authored field only if the swap strictly reduces deterministic issue count. It records exact before/after provenance under `crossAttemptContractMerge`, marks the result training-ineligible, and makes no semantic claim. The compiler does not write a new correction, misconception, definition, or source grounding.

**Real result:** `npm run audit:scion:key-term-recovery` verifies a hash-bound installed-Chrome run using the exact revision-pinned 3,349,514,112-byte public Gemma 4 GGUF. All 14 frozen v0.16.26 deficits admitted: nine on the first attempt and five after one bounded retry. Three accepted responses became admissible only by retaining a lower-issue earlier model-authored field. The copied-clause detector rejected superficial definition reuse and caused the five real retries. Every source project, prompt, input, message, output, decision, base identity, baseline receipt, and relevant implementation byte is SHA-256-bound.

**Lane:** the shared contract, legacy/full parsing, and native incomplete-kernel recovery are model-neutral and therefore can help paid providers too. Focused browser feedback, local issue accumulation, and cross-attempt response merging are Scion-local. No Gemma weight changed and no adapter is active.

**Release Boundary:** this is exact known-deficit contract recovery in a real local browser. It is not factual verification, educational-quality superiority, full-course parity, an adapter win, paid-reference quality parity, independent review, human validation, or a completed fresh B/A judgment.

## v0.16.26 — One Compiler, Two Models

**Goal:** measure, on immutable matched evidence, how much the current model-neutral compiler helps local Gemma and GPT-5.4-mini, then separate repairable compiler burden from the remaining model or adapter target.

**Cross-arm replay:** `npm run audit:scion:compiler-lift` materializes both frozen source-capture manifests and verifies all 24 retained projects across twelve course groups before replay. That covers 48 prompts and 192 requested atoms per arm. Every source packet, prompt set, course input, raw and recovery call, model response, admission decision, compiled graph, evidence byte, and relevant implementation byte is SHA-256-bound. The audit makes no model call and never rewrites a retained project.

**Measured lift:** the same compiler moves local Gemma from 132/192 raw admissions to 168/192, a 36-atom or 18.75-point lift. It moves the paid reference from 177/192 to 182/192, a 5-atom or 2.6042-point lift. The measured admission gap contracts from 45 atoms to 14: 31/45, or 68.8889%, is closed by deterministic compilation. Both arms reach 86/96 MC contract admissions.

**What remains:** MC equality here means only that both sets clear the deterministic item contract at the same rate. It does not establish equivalent correctness or teaching value. All fourteen remaining cross-arm admission differences are local key terms: twelve correction fields repeat their definitions, one source-fact index is invalid, and one expected seat is missing. Those are semantic generation targets for a future adapter; the compiler must not invent the missing misconception correction or source grounding.

**Release boundary:** this is compiler-contract admission evidence on retained research-domain responses. It is not a factual certificate, educational-quality comparison, model or adapter win, held-out-domain result, paid-reference quality parity, independent review, or human validation. Public Scion stays base-only, and the real reverse-order B/A judgment still belongs in a genuinely separate clean task.

## v0.16.25 — One Real Machine

**Goal:** replace the semantic device protocol's zero-run state with one reproducible, artifact-bound real profile while preserving the four-profile and quality claim boundaries.

**Capture path:** `npm run capture:scion:browser-device -- --reset-profile` launches installed Google Chrome in a dedicated profile, serves the product runtime and exact external smoke adapter on localhost, and keeps the base URL pinned directly to Hugging Face. The run aborts the first base download, recovers it, finds the exact OPFS file, computes the full SHA-256 in Node, drives base and adapter completions, rolls back, evicts and redownloads the adapter, restarts Chrome's GPU process, reloads, and retains a browser trace, console log, sanitized hardware probe, and redacted runtime snapshot. `--finalize-existing` can finish an already completed capture after a receipt-format failure without repeating the 3.35 GB transfer.

**Real result:** Chrome 150 on macOS 26.5.1 arm64, Apple M4 Max, 48 GiB unified memory, and 40 GPU cores passes `apple-silicon-16gb`. The pinned 3,349,514,112-byte base hash is `3646b4c147cd235a44d91df1546d3b7d8e29b547dbe4e1f80856419aa455e6fd`. Cold recovery load was 35,626 ms; warm load was 1,041 ms; base and adapter first-token times were 285 ms and 316 ms; peak Chrome working set was 5,312 MiB.

**Recovery and rollback:** the network abort occurred after 8,731,096 bytes. Adapter eviction forced a fresh bounded download and verification. A real `Browser.crashGpuProcess` caused the old completion to fail; unload, cached reload, and a fresh completion succeeded. Scale-16 activation changed the output digest from `0783c7…` to `3fb49f…`, and rollback restored the exact base digest plus the unchanged project-data digest. The runtime proof API now returns the native status that was already included in its proof hash, so future receipts can retain direct metadata rather than derive it from the guarded activation contract. `adapter-lifecycle-v0.16.25.json` rebinds that runtime change while preserving the historical v0.16.24 receipt.

**Hash-bound evidence:** `npm run audit:scion:browser-device-evidence` verifies the manifest, protocol, run digest, all four artifact bytes, and every frozen scenario. Trace finalization replaces private workspace, profile, and home paths before hashing; the retained-evidence audit also rejects local absolute paths, non-empty cookies, sensitive request headers, and secret-bearing URLs. It accepts exactly one passing Apple-Silicon run and requires the matrix to remain blocked only on `integrated-8gb`, `integrated-16gb`, and `discrete-8gb`.

**Release boundary:** the tested adapter is still the permanently non-promotable ten-iteration scale-16 smoke. One device profile does not establish the four-profile matrix, normal-scale effect, educational quality, factual improvement, five-domain adapter wins, paid-reference parity, or a completed fresh B/A judgment. Hosted Scion remains base-only.

## v0.16.24 — One Path, Honest State

**Goal:** remove the second, weaker adapter path from the real mechanical browser canary and make every unproven rollback fail closed instead of reporting base-only state.

**One lifecycle:** the localhost canary no longer calls `fetch(...).arrayBuffer()` for either its manifest or adapter. It creates a registry store and delegates bounded install, cache verification, activation, and deactivation to the same coordinator intended for the product. The integrated canary test supplies streaming manifest, GGUF, and conversion-receipt responses whose `arrayBuffer()` fallback throws; the complete software path still installs, accepts the runtime's bound changed-inference proof, and rolls back without touching that fallback.

**Cache and identity:** installed records retain the exact original manifest bytes. Cache reuse re-hashes those bytes, compares the parsed record, validates the current schema and promotion boundary, checks record identity, total bytes, file cardinality, unique paths, storage keys, file sizes, and every file digest. An exact valid cache skips the adapter-file download. A different manifest under the currently active adapter ID is rejected after its trusted manifest is verified but before replacement files are requested.

**Honest rollback:** activation and deactivation both use the registry state machine. Base-only state requires an explicit `{ restored: true }` rollback proof after the browser runtime clears native LoRA state and reproduces the exact deterministic base output. Failure writes `recovery-required`, clears any claimed active identity, marks native state unknown, and blocks completions or another load. Only unloading the quarantined runtime and loading the pinned base afresh restores readiness.

**Hash-bound contract:** `npm run audit:scion:adapter-delivery` verifies `adapter-lifecycle-v0.16.24.json`, including the exact implementation/test hashes, retained 52,707,007-byte smoke budget, the absence of `arrayBuffer()` in the canary bridge, the lifecycle coordinator calls, active-replacement guard, cache revalidation, quarantine state, and blocked-inference recovery test. Forty-two focused tests pass.

**Release boundary:** this is adversarial software-contract evidence plus replay of the retained mechanical smoke identity. The exact-QAT artifact remains non-promotable and outside Git. v0.16.24 does not rerun the 3.35 GB model, execute a real interrupted-download/storage/device-loss trial, create a quality adapter, complete the fresh B/A judgment, or establish held-out wins or paid-reference parity. Hosted Scion remains base-only.

## v0.16.23 — Small Delta, Hard Boundary

**Goal:** make a separately downloaded browser adapter provably small and fail closed before a malformed response can consume unchecked browser memory or leave partial installed state.

**Dual package budget:** every browser adapter is capped at 64 MiB. A GGUF adapter for the exact 3,349,514,112-byte pinned base is also capped at 2% of that base, making 66,990,282 bytes the current effective ceiling. Package validation counts every declared file, including the conversion receipt, and the runtime registry uses the same absolute constant. The manifest response itself is capped at 1 MiB.

**Bounded transport:** installation requires a streaming response and never falls back to whole-response `arrayBuffer()` buffering. A Content-Length that disagrees with the manifest fails before the reader opens. Without that header, every chunk is counted against the exact expected bytes; overrun cancels the reader and truncation fails at end-of-stream. Each file then receives exact byte-count and SHA-256 checks. Progress observers cannot break the transaction, and IndexedDB is changed only after every file is staged and verified.

**Hash-bound replay:** `npm run audit:scion:adapter-delivery` binds the pinned base contract, v0.16.7 exact-QAT browser smoke evidence, manifest and registry implementations, and adversarial tests. The retained artifact plus conversion receipt totals 52,707,007 bytes, 1.573572% of the base, leaving 14,283,275 bytes below the effective ceiling. The GGUF metadata identifies a LoRA adapter and the package excludes base weights.

**Release boundary:** this proves bounded separate delivery for retained mechanical smoke evidence. The artifact remains non-promotable and outside Git. It is not a quality adapter, held-out win, paid-reference comparison, production device result, or completed B/A judgment. Hosted Scion remains base-only.

## v0.16.22 — Complete Thoughts

**Goal:** reduce the measured local MC compiler burden without inventing content, rewriting retained evidence, or turning a deterministic repair into a model-quality claim.

**Compiler path:** `repairScionMcItem` now applies one ordered recovery at every production boundary. If an explanation lacks terminal punctuation, it is recoverable only when the model already wrote a complete sentence of at least twenty characters. Scion retains that exact prefix, records the unfinished suffix and character counts, and marks the tail repair ineligible as a training preference. It then applies the existing conservative explanation/key alignment. Browser JSON repair, canonical kernel admission, cached graph attachment, and graph reopen share the same implementation and preserve the abbreviated or expanded field shape.

**Immutable replay:** `npm run audit:scion:mc-recovery` hashes the four exact v0.16.17 local capture files plus the implementation modules and replays all 24 calls and 48 MC items without modifying those projects. Historical admission is reproduced at 25/48. Conservative key alignment reaches 33/48, and the new incomplete-tail recovery reaches 45/48. Computer Science reaches 12/12; Geology, Music Theory, and UX each retain one longest-option cue. Twenty of twenty-three historical burden items are recovered, an 86.9565% reduction, while the remaining three stay rejected.

**Release boundary:** this is compiler-contract recovery on retained base-Gemma responses. It is not a fresh model run, factual-correctness certificate, adapter result, held-out-domain result, paid-reference comparison, or independent review. The real fresh B/A judgment remains missing, approved learned-quality rows remain zero, and hosted Scion remains base-only.

## v0.16.21 — Eight Small Readings

**Goal:** make the real 128-case reverse-order judgment operationally recoverable without weakening the rule that it is one isolated B/A reading from one fresh Codex session.

**Workbook:** `build:scion:codex-fresh-handoff` now produces eight immutable 16-case review templates and matching blank decisions skeletons plus the exact judge prompt, instructions, and manifest. Original review indices are assigned modulo eight, mixing the four training domains across each chunk. The production workbook replaces the 543,277-byte review monolith and 123,877-byte decision skeleton with 66,742–70,779-byte review units and 16,021-byte decision units. A tracked receipt binds every payload byte, chunk index, pair-set digest, canonical full-template hash, and original-order reconstruction.

**One reading, not eight votes:** all working decision chunks must use the same judge revision, runtime, fresh session ID, completion time, no-prior-outcome statement, context-reset attestation, and judgment attestation. Chunk-local validation identifies the precise failing unit before output. Finalization verifies the untouched workbook, reconstructs the canonical 128-case decisions in original order in memory, re-runs full structural validation, and exclusively creates one AES-256-GCM envelope plus one 0600 key. Working decisions contain sensitive judgment data; no combined completed review pass is written.

**Release boundary:** this release improves feasibility and recovery only. The real fresh B/A judgment, stable preferences, approved training rows, adapter weights, held-out wins, device results, and paid-reference parity remain zero. Public Scion remains the pinned browser-local base plus the model-neutral compiler.

## v0.16.20 — Two Keys, No Plaintext

**Goal:** carry two isolated outcome-sealed readings into the preference corpus without restoring either completed judgment pass to disk or allowing one order to disclose an outcome by itself.

**Dual-envelope gate:** `ingest:scion:codex-sealed-training-reviews` requires exactly two distinct envelope paths and two distinct key paths. Both envelopes must have distinct byte identities and independently sealed key identities. Canonical key decoding, key and ciphertext hashes, AES-256-GCM authentication, plaintext hashes, envelope-to-batch metadata, source packet, prompt, exact judge identity, one A/B plus one B/A order, and two fresh session IDs all fail closed before derived evidence is written.

**Preference derivation:** both complete passes remain in memory while the existing honest-quality-benchmark-v1 validator recomputes every source, artifact, scorecard, decision, and pass hash. Stable ties, insufficient evidence, low winner floors, non-positive score margins, missing defects, changed bytes, and order-sensitive winners stay quarantined. Only stable score-qualified agreement becomes an unblinded chosen/rejected row carrying both pass hashes, all four scorecard hashes, exact training-pair identity, minimum scores, margin, and defects. That derived row is single-model Codex training evidence—not either pass plaintext and not human, instructor, independent, classroom, or multi-judge validation.

**Release boundary:** the real B/A judgment still has not occurred. v0.16.20 proves the two-order in-memory bridge with adversarial fixtures but ingests no real outcome and produces zero approved preferences, training rows, adapter weights, held-out wins, device results, or paid-reference parity. Public Scion remains the pinned browser-local base plus the model-neutral compiler.

## v0.16.19 — Clean Room Relay

**Goal:** make the required reverse-order judgment reproducible without exposing the first-order task, outcome, organizer mapping, unblinded identities, or any completed plaintext to the fresh Codex context.

**Handoff:** `build:scion:codex-fresh-handoff` reconstructs the frozen packet and emits exactly five files: the B/A-only template, immutable blank decisions skeleton, exact atom judge prompt, fresh-task instructions, and manifest. The tracked receipt binds all 128 cases, packet and organizer digests, prompt hash, and every payload byte. The verifier requires B/A presentation order, neutral source context, blank scorecards and preferences, a null outcome state, and the exact allowlist. Added, missing, modified, nested, or symlinked files and organizer, mapping, key, plaintext, sealed-envelope, or prior-outcome fields fail closed. Rerunning the builder refuses to delete unknown files.

**Atomic seal:** the fresh judge copies the blank decisions skeleton outside the immutable handoff. `complete:scion:codex-fresh-pass` re-verifies the handoff against the tracked receipt, validates every completed scorecard, decision, judge identity, fresh session, and attestation in memory, then encrypts directly with AES-256-GCM. It creates only a sealed envelope and 0600 key, prints no result, writes no completed plaintext, and uses exclusive file creation so retained evidence cannot be overwritten.

**Release boundary:** this release prepares the clean second reading; it does not perform it. The B/A outcome, stable preferences, research rows, quality adapter, five-domain win, and paid-reference parity remain zero. The A/B key and envelope were not read or modified while building the handoff. Public Scion remains the pinned browser-local base plus the model-neutral compiler.

## v0.16.18 — Outcome Under Seal

**Goal:** complete one real 128-case Codex judgment order without leaking its outcome into the reverse-order context or manufacturing preferences from ties, missing evidence, or atom-level claims the packet cannot support.

**Lane:** training review protocol v2 puts the exact neutral source object—not only its digest—above both anonymous artifacts. A separate hash-bound atom prompt scores factual correctness, source fidelity, teachability, coherence, and task quality. It explicitly excludes export, package, compiler burden, full-course coherence, device behavior, speed, and cost. The completed-review schema and semantic validator preserve `winner`, `tie`, and `insufficient-evidence`; low-quality relative winners remain qualification failures rather than structural corruption, and only two agreeing, score-qualified winner decisions can enter training.

**Sealed pass:** one fresh Codex session scored all 128 A/B cases before preference and bound the packet, source bytes, artifact bytes, scorecards, decisions, prompt, judge identity, and context-reset attestation. Structural validation passed for 128/128 cases. The plaintext was then encrypted with AES-256-GCM and deleted. The tracked envelope binds plaintext, ciphertext, key, packet, prompt, and judge identities by SHA-256 while disclosing no decisions. Two redundant 0600 key copies outside the volatile template directory passed an exact unseal round trip and remain absent from Git; template regeneration now preserves unknown nested evidence and replaces only its three generated files.

**Release Boundary:** one order is not a stable preference and the sealed pass is not an outcome claim. The reverse B/A order must be completed in a genuinely fresh Codex task that has not read the key, plaintext, or earlier result. Until that pass agrees after unblinding, approved quality preferences, training rows, learned quality weights, adapter wins, and paid-reference parity remain zero. Public Scion remains the pinned browser-local base plus the model-neutral compiler. The general strict release evaluator also remains `compiler-contract-only` because independently validated held-out cases and instructor reviews are both zero; the Codex lane does not impersonate that missing evidence.

## v0.16.17 — Enough to Judge

**Goal:** cross the honest 100-case research-review threshold without rewriting historical capture evidence or claiming that a larger corpus improved the model.

**Additive lane:** `evaluation/scion-source-capture-expansion-v0.16.17.json` adds one exact source-bound course group per research domain and keeps the v0.16.11 campaign byte-stable. Its 24 real local prompts and 24 real GPT-5.4-mini prompts bind the same pinned base/reference identities, sources, raw responses, compiler decisions, and burden accounting as the original campaign. The review builder now takes source-backed cases first, round-robin by domain, group, and atom kind, then uses ungrounded legacy cases only as visible packet fill.

**Measured gap:** the expansion's base-only Gemma arm admitted 70 of 96 requested atoms; GPT-5.4-mini admitted 86. Local burden was 26 atoms versus 10, a 16-atom or 16.6666-percentage-point deficit. Across both source-capture campaigns, compiled local admission is 133 of 192 versus 177 of 192 and burden is 59 versus 15. This is a measured base-model loss and a concrete compiler/model diagnostic, not an adapter result or a Scion win.

**Review state:** the exact-input ledger contains 437 neutral candidates. The frozen packet selects 160 across sixteen groups, four per domain; 128 carry neutral source context into both anonymous reversed-order Codex templates, and 32 legacy cases are excluded from training review. Both templates are hash-bound and integrity-verified, but neither pass is completed. Approved single-model-judge preferences and qualifying model-judge rows therefore remain zero; the research dataset gate stays blocked even though 76 older deterministic-contract rows remain available for non-quality diagnostics. Trained quality adapters and held-out adapter wins remain zero.

**Release boundary:** v0.16.17 changes evidence collection, review selection, and cold-start measurement only. The local capture timeout now accommodates the observed approximately 24-minute recursive first import of the 9.5 GB pinned base so a healthy cold load is not recorded as compiler burden. It does not change model weights, relax an atom gate, or activate an adapter. Public Scion remains the pinned browser-local base plus the model-neutral compiler.

## v0.16.16 — Judge to Gradient

**Goal:** let the declared Codex judge create honest adapter-training preferences without fabricating human review, independent judges, or a model win.

**Training lane:** neutral atom packet protocol v4 is separate from the optional instructor-review protocol. `build:scion:codex-training-reviews` reconstructs the hash-bound organizer packet and emits A/B and B/A templates only for cases carrying neutral source context. `ingest:scion:codex-training-reviews` requires the exact Codex model, revision, runtime, prompt digest, two fresh sessions, no prior outcome, scores before preference, and the same winner after unblinding both orders.

**Fail-closed evidence:** every accepted preference binds the packet, case, source row, source context, course group, prompt, chosen/rejected artifacts, four scorecards, two complete passes, and the exact derived training pair. The winner must score at least 4/5 on factual correctness, source fidelity, teachability, coherence, and task quality, beat the loser on aggregate score, and name concrete defects. Changed bytes, reused sessions, missing order, low scores, vague evidence, or position disagreement are rejected or quarantined.

**Corpus contract:** dataset schema v3 makes `single-model-judge` the primary preference class. Research requires 100 stable preferences across four domains, at least 20 per domain, and three isolated course groups per domain. Candidate training still requires 3,000 verified pairs across five domains and fifteen groups, including at least 100 qualifying Codex preferences distributed at 20 or more in each domain. Instructor and founder counts remain optional observability; they cannot substitute for or impersonate the declared Codex lane.

**Measured state:** the real packet contains 160 cases, but only 63 include neutral source context; 97 are excluded from Codex training review. The two templates are generated and integrity-verified, but neither has been completed. Approved Codex preferences, research rows, trained quality adapters, and held-out adapter wins therefore remain zero. Public Scion remains base-only.

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
2. `research-ready` now requires at least 100 stable Codex preferences, with at least 20 and three isolated course groups in each of four domains, and can create only a `research` adapter; and
3. `ready` retains the public bar of at least 3,000 verified pairs across five domains and fifteen groups, including at least 100 stable Codex preferences with 20 in each qualifying domain, before candidate training.

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
- Same-model self-agreement is never independent evidence. A Codex preference counts only as explicitly labeled single-model evidence after two fresh, reversed-order, scoring-first passes agree.
- Course/domain groups cannot cross train, validation, and test splits; production and research tiers require at least three course groups per included domain so every domain has isolated train, validation, and test courses.
- Research requires at least 20 stable Codex preferences in each of four domains; production candidate data requires the same floor in each of five domains. Aggregate totals cannot substitute for domain coverage.
- Adapter manifests carry per-domain course-group counts, per-domain model-judge counts, optional instructor counts, split row counts, and split domain counts so a balanced dataset claim remains auditable after training.
- Every candidate retains its dataset-manifest digest and exact base revision.
- A smoke adapter proves mechanics only and is permanently ineligible for release.
- Rejected checkpoints stay rejected; promotion thresholds are never lowered after seeing results.

## Promotion gates

An adapter becomes part of public Scion only when all gates pass:

| Gate       | Requirement                                                                                                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Corpus     | At least 3,000 pair-level verified, deduplicated preferences across five disciplines and fifteen course groups, including at least 100 stable Codex preferences and 20 in every qualifying discipline   |
| Leakage    | No course, source packet, or near-duplicate group crosses dataset splits                                                                                                                                |
| Contract   | Schema-valid first-pass rate improves; no regression in long JSON or typed kernel acceptance                                                                                                            |
| Factual    | Frozen source-anchored canaries remain 100% in grounded mode; cold mode is reported separately                                                                                                          |
| Package    | Five 12-lesson held-out domains reach 99/A with zero P0/P1 findings                                                                                                                                     |
| Efficiency | Median model-call count falls at least 20% and never exceeds the base by more than 1.05x                                                                                                                |
| Preference | One exact Codex judge produces stable A/B and B/A outcomes over ten trials in each held-out domain; 95% Wilson lower bound exceeds 0.50, with positive per-domain score intervals                       |
| Device     | Chrome and Edge pass the frozen integrated-8 GB, integrated-16 GB, discrete-8 GB, and Apple-Silicon-16 GB profiles with semantic memory, recovery, completion, activation, artifact, and rollback proof |
| Integrity  | Base revision, adapter files, manifest, and evaluation evidence are hash-bound                                                                                                                          |
| Rollback   | Removing one manifest entry restores base-only Scion without changing project data or compiler behavior                                                                                                 |

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

- Complete the five-domain Codex comparison, device, factual, export, burden, and production-canary gates.
- Publish a signed release manifest and adapter artifact.
- Update product language from compiler-only Scion to base-plus-adapter Scion without hiding the public foundation model lineage.
- Keep base-only and paid-provider fallbacks.

**Exit:** Scion Vx truthfully means a verified Gemma base, a verified Scion adapter, and the versioned Scion compiler.

## Current truth

- The exact-base manifest, file-integrity verifier, capability resolver, leakage-safe dataset builder, canonical dataset identity, pinned and audited MLX toolchain, dual-seeded training launcher, plan/result receipts, adapter packager, runtime identity telemetry, and promotion audit are implemented.
- The adapter manifest is schema v3 for learned packages. Research, candidate, and promoted MLX packages must bind their training plan and completion result; converted browser GGUF packages must additionally bind the source MLX manifest through the conversion chain. Schema v2 remains accepted only for historical smoke and rejected mechanics artifacts.
- The deterministic `mlx-lora-to-peft-to-gguf-v1` bridge validates the exact QAT base, maps and transposes 276 complete LoRA A/B pairs, ignores only documented quantization bookkeeping, and invokes the official llama.cpp converter pinned at revision `5ec717d1256e34558a44dc09adf1e6e16f2e2682`. The 52,704,096-byte F16 GGUF contains 552 tensors and native `gemma4`/`lora` metadata.
- Dataset truth is split by claim. The strict v0.16.6 production audit admitted **0 of 471** raw events because independent evidence and explicit split identity were missing. The v0.16.7 `--smoke` derivation admitted 101 structurally evidenced pairs across five registered domains solely to prove training and packaging. Its manifest is `smoke-only`; it is not a production corpus and cannot create a candidate or promoted package.
- The matched-corpus audit retains 437 neutral atoms across Computer Science, Geology, Music Theory, and UX after excluding World Literature atoms with mismatched course inputs. The two additive source campaigns bring the packet to sixteen input-bound course groups, exactly four per current domain. Source-first selection keeps 128 of 160 cases in both Codex order templates; 32 ungrounded legacy cases are excluded. One A/B pass is complete and outcome-sealed, but no reverse-order agreement has been ingested, so research and production datasets remain correctly blocked.
- `research-ready` is an experiment lane, not a relaxed release lane. It needs 100 stable Codex preferences, at least 20 and three course groups in each of four domains; its adapter status is `research`, remains non-promotable in every runtime format, and exists only to decide whether collecting more labels is empirically worthwhile.
- A ten-iteration exact-QAT MLX adapter was converted, packaged, semantically audited, and exercised in the browser. Native activation at scale 1 and scale 4 did not change the deterministic canary. Scale 16 changed it and rollback restored the exact base output. This is strong mechanical evidence and weak learning evidence; it is not a quality result.
- The packaged browser runtime now performs direct public base download, WebGPU inference, native dynamic LoRA activation, activation probing, and rollback. It also runs without cross-origin isolation, avoiding a global header change that could break Firebase sign-in popups.
- The public site now routes Scion generation through this browser-local base and no longer sends prompts to an anonymous model endpoint. Because no production adapter has passed promotion, the truthful product state is `base-only` local Scion plus the Scion compiler.
- The legacy smoke adapter targets the earlier non-QAT base and remains permanently excluded by base mismatch. The new exact-QAT smoke removes that provenance blocker but remains excluded by smoke-only data, insufficient training, missing quality evidence, and every unrun promotion gate.
- The model-neutral compiler audit is independently green on exact Qwen: its Business Ethics rerun reached 99/A and 38/38 export checks while Scion pass calls fell from 108 to 91, yielding 1.247× the 73-call exact-Gemma control. This strengthens every provider using the compiler; it is not adapter-quality evidence.
- The promotion audit now requires one unique, clean, hash-paired adapter/base course per domain. It rejects duplicate or reused comparisons, different inputs or sources, different compiler or grader settings, different exact base contracts, dirty worktrees, mismatched adapter scales, and controls that are not demonstrably base-only.
- Browser-device evidence is now semantic rather than label-based. The promotion audit recomputes a stable adapter-package identity, verifies all retained artifact bytes, and requires all four frozen browser/device profiles plus activation, memory, repeated completion, interrupted-download, storage-pressure, device-loss, and exact-rollback checks. The earlier one-machine smoke does not satisfy this matrix.
- The frozen v1 ruler defines five unseen domains and five exact prompt-only Crucible fixtures. Dataset schema v3 includes SHA-256 `domain:course` group identities plus model-judge evidence distribution, so the evaluator can prove separation and primary-lane coverage without publishing course names. Old manifests without that proof cannot qualify.
- `scripts/scionAdapterPairedEvidence.mjs` is the only promotion-evidence producer. It preflights a clean compiler and exact runtime state, stamps shared comparison identity into real Crucible runs, hashes seven retained artifacts per course, and emits candidate/base JSON plus a receipt. The promotion audit rejects records without its producer and artifact hashes.

## Implementation ledger

| Layer              | Implemented contract                                                                                                                                                                                                                               | Proof command                                                                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Base identity      | Exact Gemma repository, 40-character revision, architecture, and active-runtime identity must match                                                                                                                                                | `npx vitest run tests/scion-adapter-manifest.test.js`                                                                                         |
| Package integrity  | Every regular adapter file is bound by relative path, byte count, and streaming SHA-256; schema-v3 learned packages also bind their plan, completion result, and source conversion chain                                                           | `npx vitest run tests/scion-adapter-tooling.test.js tests/scion-adapter-training-run.test.js`                                                 |
| Dataset boundary   | Pair audit, deduplication, explicit domain/course grouping, deterministic group split, model-judge distribution, overlap check, source receipts, split receipts, canonical identity, and quarantine ledger                                         | `npm run build:scion:adapter-dataset && npx vitest run tests/scion-adapter-training-run.test.js`                                              |
| Review identity    | Exact-input course grouping, neutral packet integrity, source-context filtering, two fresh reversed-order Codex sessions, score and artifact hashes, position-bias quarantine, and exact training-pair binding                                     | `npm run audit:scion:review-packet && npm run build:scion:codex-training-reviews`                                                             |
| Held-out ruler     | Five fixed 12–15 lesson domains, prompt/source hashes, exact base-contract digest, grader digest, and domain/group separation proof                                                                                                                | `npx vitest run tests/scion-adapter-tooling.test.js`                                                                                          |
| Training           | Exact snapshot, clean Git tree, pinned live toolchain, dual RNG seed, explicit ORPO parameters, derived run identity, external-cache outputs, completion receipt, and smoke/research/candidate separation                                          | `npm run audit:scion:adapter:training:contract && npm run audit:scion:adapter:training:toolchain`                                             |
| Browser conversion | Exact source/base verification, inherited MLX plan/result/source manifest, deterministic MLX-to-PEFT mapping, pinned official llama.cpp conversion, semantic GGUF audit, and receipt binding                                                       | `npm run package:scion:adapter:browser -- --source-manifest ... --dataset-manifest ... --output-dir ...`                                      |
| Runtime truth      | Local and browser runtimes report exact base and adapter identity; browser activation requires native metadata, changed inference, and exact rollback                                                                                              | `npx vitest run scripts/__tests__/e2bOpenAIShim.test.mjs tests/scion-browser-wllama.test.js tests/scion-runtime-status-banner.test.jsx`       |
| Browser delivery   | Pinned runtime assets load the public 3.35 GB GGUF; the real canary uses the registry's bounded stream, exact cache revalidation, active-ID guard, coordinated activation/deactivation, and rollback quarantine                                    | `npm run audit:scion:browser-base && npm run audit:scion:browser-lora && npm run audit:scion:adapter-delivery`                                |
| Smoke truth        | Retained exact-QAT artifact, conversion hashes, scale trials, final base-only state, and explicit non-claims agree                                                                                                                                 | `npm run audit:scion:browser-adapter-smoke`                                                                                                   |
| Device truth       | Four frozen Chrome/Edge hardware profiles bind exact adapter identity, measured budgets, completion, recovery, activation, rollback, and retained artifact bytes; Apple Silicon currently passes 1/4                                               | `npm run audit:scion:browser-device-evidence` and `npm run audit:scion:browser-device-matrix -- --manifest ... --evidence ...`                |
| Promotion          | Five unique hash-paired held-out domains on one clean compiler/grader protocol, exact adapter/base state, 99/A and zero P0/P1, per-domain call ceiling, 20% median call reduction, and semantic base-plus-paid-reference Codex comparison evidence | `npm run audit:scion:adapter:judge:contract && npm run audit:scion:adapter:promotion -- --manifest ... --candidate ... --base ...`            |
| Evidence capture   | Real project/report/digest/console/manifest/ZIP artifacts are hashed into paired candidate/base evidence; manually shaped records are rejected                                                                                                     | `npm run capture:scion:adapter:pairs -- --benchmark ... --dataset-manifest ... --adapter-manifest ... --candidate-round ... --base-round ...` |

The research campaign now has sixteen exact-input groups—four per current training domain—and 128 source-backed cases. The first isolated A/B pass is complete and outcome-sealed. v0.16.19 defines the B/A-only clean-room handoff; v0.16.20 adds dual-envelope in-memory ingestion after both isolated passes exist; v0.16.21 makes the second reading resumable as eight hash-bound chunks while retaining one fresh judge session and one canonical sealed pass. v0.16.22 reduces known MC contract burden on immutable research responses, v0.16.23 bounds the separately downloaded delta, v0.16.24 removes the mechanical canary's weaker delivery and lifecycle bypasses, v0.16.25 closes one of four real recovery-device profiles, v0.16.26 measures the current compiler's lift on both immutable model arms without changing judgment state, v0.16.27 recovers every exact residual key-term contract deficit with the pinned base plus bounded compiler recovery, v0.16.28 makes the eventual base-plus-paid-reference judgment semantically promotion-grade instead of hash-only, v0.16.29 removes its circular identity while making factual and production canaries semantic, v0.16.30 moves the exact 128-case B/A kit out of ignored local output and makes its clean-checkout reconstruction depend only on the frozen canonical handoff, and v0.16.31 makes the future training step seeded, toolchain-pinned, receipt-bound, and traceable through browser conversion. The next quality dependency remains the actual B/A judgment in a genuinely fresh task with no prior outcome available; the project must not manufacture both passes from one continuous judging context. Only stable, score-qualified, reverse-order agreements may enter a non-promotable research dataset. That research adapter must then beat exact base-only Scion at normal scale on the frozen ruler before production-scale collection is justified. The scale-16 smoke result makes “adapter active” an inadequate success signal: the real experiment must measure contract acceptance, factual correctness, course quality, repair burden, memory, and recovery. Browsers continue to report `base-only` until a production adapter passes every promotion gate.

## References

- [Google Gemma model overview](https://ai.google.dev/gemma/docs)
- [Google Gemma fine-tuning guidance](https://ai.google.dev/gemma/docs/tune)
- [LoRA: Low-Rank Adaptation of Large Language Models](https://arxiv.org/abs/2106.09685)
- [WebLLM custom-model architecture](https://github.com/mlc-ai/web-llm)
- [MLC LoRA support request](https://github.com/mlc-ai/mlc-llm/issues/2625)
- [llama.cpp separate LoRA adapter support](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)
