# Scion V0.16.86 — Production Runtime Recovery

> **Historical outcome:** V0.16.86 successfully stopped the hidden prose fallback and duplicate multi-gigabyte transfer, but its production proof did not close. The next audit decoded `1,163,217,991` as the stale `GLUE` protocol marker and exposed the actual native cause: no WebGPU adapter was available. V0.16.87 validates the real adapter before download and adds a zero-download Scion evidence/compiler route; see `SCION_V01687_ADAPTIVE_DEVICE_ROUTE.md`.

## Goal

Make Scion’s first production run reliable and legible: one bounded public-model download, one activation attempt, one explicit recovery path, and no silent second multi-gigabyte transfer.

## Why this patch exists

The V0.16.85 production-origin audit found a failure that automated UI tests could not expose. Chrome downloaded all five pinned Gemma 4 shards, reported 100%, then failed while the custom WebGPU runtime streamed the OPFS-backed model into llama.cpp. Native authoring treated that device failure like a response-shape failure and entered the prose fallback, which invoked the same local provider again and started another full download.

The browser had roughly 11.6 GB of quota, WebGPU and WebAssembly JSPI were available, and the remote shard sizes matched the pinned manifest. The defect was therefore at the runtime boundary, not the prompt, compiler, model identity, or available storage boundary.

## Implemented architecture

### Lane 1 — Bound every OPFS read

The runtime builder patches the pinned, reviewed Wllama fork rather than editing a generated artifact by hand. Before it constructs a destination `Uint8Array`, each read is capped by:

- the caller’s requested length;
- the remaining bytes in the model shard;
- the remaining capacity in the destination typed-array view; and
- the remaining capacity in the underlying `ArrayBuffer`.

This removed out-of-range destination views, but the required follow-up audit proved that the remaining integer was not a model-read length. It was the unchanged `GLUE` request header after native loading returned no response. V0.16.87 preserves that native cause and addresses the unavailable GPU adapter before any download.

### Lane 2 — Stop duplicate model work

Errors with a Scion browser-runtime code now cross the native authoring boundary unchanged. They do not enter the prose course-map fallback because a different output shape cannot repair a failed WebGPU/OPFS runtime. The top-level generation UI receives one classified failure and can offer one deliberate retry.

### Lane 3 — Clean up in the right order

When a fresh model activation proves its cache incomplete, Scion exits the runtime first, releases OPFS handles, removes the failed cache second, and stops. A previously saved incomplete copy may still receive the existing single automatic repair, but unrelated failures do not clear the cache.

### Lane 4 — Tell the truth about progress

Download completion and activation are separate states. The last download frame reads `Download complete · activating Scion…`. A clean replacement says so explicitly, and an activation error preserves the last reached progress instead of resetting the model meter to zero. Engineering logs retain a prompt-free cause chain while the visible message remains concise.

## Verification contract

Before release:

1. Generated-runtime source pin and digest pass.
2. Focused runtime, cleanup-order, and orchestration tests pass.
3. Full unit, lint, format, build, bundle, evaluation, release-history, and Chromium suites pass.
4. Main-branch CI and deployment pass.
5. Production Chrome completes a fresh Scion generation without a second model download.
6. The Living Course Compiler is inspected through model, map, enrich, compile, verify, grade, Agent, responsive UI, console, and physical ZIP handoff.

## Release Boundary

V0.16.86 changes the browser runtime and orchestration around the public Gemma 4 base. It does not change model weights, activate the optional adapter, or establish a new content-quality result. Browser and automated proof demonstrate engineering behavior only; they do not prove factual correctness, instructor approval, accessibility certification, student outcomes, or classroom effectiveness.
