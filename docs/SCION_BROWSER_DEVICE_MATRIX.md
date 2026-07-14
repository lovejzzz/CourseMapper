# Scion browser device matrix

The device gate answers one narrow question: can one exact, separately downloaded Scion GGUF adapter run, recover, and roll back on the browsers and hardware that public Scion promises to support?

It does **not** answer whether the adapter writes better courses. Factual, held-out-course, compiler-burden, blind-instructor, and production-canary gates remain separate.

## Current status

The matrix is **1/4**. v0.16.25 adds one real passing `apple-silicon-16gb` run for the permanently non-promotable scale-16 smoke adapter. Installed Chrome 150 on an Apple M4 Max with 48 GiB unified memory downloaded and independently hash-verified the exact public base, completed cold and warm loads, activated and rolled back the separate adapter, stayed inside the memory budget, recovered from a real network-aborted base download and adapter-cache eviction, and recovered after Chrome's actual GPU process was restarted. The retained path-scrubbed browser trace, console, sanitized hardware probe, runtime snapshot, and semantic run all verify.

The complete matrix still fails, as it must: `integrated-8gb`, `integrated-16gb` with Edge, and `discrete-8gb` have no runs. No quality adapter exists, and this smoke run establishes neither normal-scale effect nor educational improvement. It cannot satisfy promotion evidence by itself.

## Frozen v1 profiles

The protocol lives at `evaluation/scion-adapters/browser-device-matrix-protocol-v1.json`. A promotion matrix needs one passing run for every profile:

| Profile              | Browser        | Hardware floor                                                                   |
| -------------------- | -------------- | -------------------------------------------------------------------------------- |
| `integrated-8gb`     | Chrome         | integrated GPU; 8–15.99 GiB system memory                                        |
| `integrated-16gb`    | Edge           | integrated GPU; at least 16 GiB system memory                                    |
| `discrete-8gb`       | Chrome or Edge | discrete GPU with at least 8 GiB dedicated memory; at least 16 GiB system memory |
| `apple-silicon-16gb` | Chrome         | Apple Silicon; at least 16 GiB unified memory                                    |

Apple Silicon is its own profile. It no longer substitutes for the discrete-GPU run.

## Required proof on every device

Each run binds the stable adapter-package identity, exact training and browser-base revisions, adapter scale, and packaged runtime. It must then prove:

1. WebGPU and WebAssembly JSPI capability;
2. a cold load of the exact 3,349,514,112-byte pinned public base without a model backend;
3. a warm cached load inside the profile budget;
4. valid base-only completion;
5. adapter manifest and byte-digest verification;
6. native Gemma 4 LoRA activation and a cryptographically different output at the manifest's production scale;
7. valid adapter completion;
8. native deactivation, an output digest equal to the pre-adapter base digest, and matching before/after project-data digests;
9. recovery after a real network-aborted model download;
10. recovery after cache eviction or quota exhaustion;
11. recovery after a destroyed WebGPU device or browser GPU-process restart;
12. at least three consecutive valid completions; and
13. measured browser working-set usage inside the profile budget, plus GPU-memory usage for the discrete profile.

Every run also retains four byte-counted, SHA-256-bound artifacts: a browser trace, console log, sanitized hardware probe, and runtime snapshot. Artifact paths must stay inside the evidence directory; absolute paths, traversal, symlinks, missing files, changed bytes, and duplicate artifact identities fail the run.

## Adapter identity without a hash cycle

An adapter manifest names promotion evidence, so the complete manifest digest cannot also be embedded inside that evidence without creating a circular hash dependency. The device protocol instead computes `scion-adapter-package-identity-v1` from the immutable package fields:

- manifest schema;
- adapter ID, version, format, and scale;
- exact base contract;
- training and dataset identity;
- packaged file identities;
- supported runtime; and
- conversion receipt and pinned converter.

The mutable `promotion` block is intentionally excluded. The promotion audit recomputes this identity from the candidate manifest and requires every device run to match it.

## Audit command

```bash
npm run audit:scion:browser-device-matrix -- \
  --manifest /path/to/browser/scion-adapter.json \
  --evidence /path/to/device-matrix.json
```

The command writes `verification-output/scion-browser-device-matrix/latest.json` and exits nonzero unless the entire frozen matrix passes. `npm run audit:scion:adapter:promotion` runs the same semantic audit again when it verifies the manifest's `browser-device-matrix` evidence entry. A correct file hash is necessary but no longer sufficient.

The reproducible Apple-Silicon capture and its expected-incomplete audit are:

```bash
npm run capture:scion:browser-device -- --reset-profile
npm run audit:scion:browser-device-evidence
```

The capture keeps the 3.35 GB model and 52.7 MB GGUF outside Git. The tracked directory `evaluation/scion-adapters/evidence/browser-device-apple-silicon-v0.16.25/` contains only the adapter manifest, semantic evidence/receipt, and the four bounded run artifacts. If the browser work completed but final receipt formatting failed, `--finalize-existing` reuses the finished artifacts instead of downloading the base again.

## Evidence hygiene

Hardware probes must remove serial numbers, UUIDs, account names, local absolute paths, and device-management identifiers before retention. Keep only the operating-system family/version/architecture, coarse system-memory amount, GPU class/vendor/model, browser family/version, and measurements needed by the protocol. Capture finalization scrubs actual workspace, browser-profile, and home paths from every text-like trace entry. The retained-evidence audit independently rejects generic macOS, Linux, or Windows user paths, non-empty network cookies, authorization or API-key headers, and secret-bearing URLs. Review the trace and console log for prompts or course content before publishing them.

## Claim boundary

A passing smoke adapter can prove mechanics but remains non-promotable. A passing quality-candidate matrix proves browser loadability and recovery only. Public Scion may say an adapter is active only after the same candidate also clears the complete corpus, leakage, contract, factual, five-domain package, compiler-efficiency, blind-instructor, integrity, rollback, and production gates.
