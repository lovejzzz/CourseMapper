# Native grammar acceptance investigation — 2026-09-07

Status: the native candidate was rebuilt and all eight real-browser mechanical cases passed. Production paths remain unchanged. No source-proposal semantic or teaching-quality pass is claimed.

## Finding

The pinned upstream `cpp/actions.hpp` initializes grammar from the request, but `action_sampling_accept` always calls `wcommon_sampler_accept(..., false)`. In `cpp/helpers/wsampling.cpp`, that boolean controls whether `llama_sampler_accept(gsmpl->grmr, token)` executes. The high-level completion loop calls the same acceptance action for prompt tokens and generated tokens. Consequently the exposed acceptance path never advances the grammar state for generated output.

Pinned sources:

- [Native actions](https://github.com/reeselevine/wllama/blob/58903000dbea6acfc0eb9c738d8be50d1052cf23/cpp/actions.hpp#L562)
- [Sampler acceptance](https://github.com/reeselevine/wllama/blob/58903000dbea6acfc0eb9c738d8be50d1052cf23/cpp/helpers/wsampling.cpp#L256)
- [Completion loop](https://github.com/reeselevine/wllama/blob/58903000dbea6acfc0eb9c738d8be50d1052cf23/src/wllama.ts#L860)

The separately maintained LoRA patch does not repair this path. The currently shipped v2 JavaScript also uses the same acceptance request without a grammar flag. This explains a plausible mechanism for the old repeated-`OK` receipt; its missing runtime identity still prevents treating it as a current binary canary.

## Candidate repair

Apply `runtime/scion-wllama/scion-grammar.patch` **after** the existing LoRA patch and initial glue generation. It adds an explicit required `accept_grammar` wire field. Prompt acceptance passes false; generated acceptance passes true. Sampling initialization continues to replay prompt/history without advancing grammar. The low-level API defaults to false to preserve historical callers; callers accepting generated tokens must explicitly pass true.

Both protocol definitions advance from GLUE_VERSION 2 to 3. A new JS bundle must never be paired with the old WASM. Regenerate glue, build the matching binary and bundle, and publish them under a new immutable runtime path only after canary verification. Existing v1/v2 artifacts and their hashes remain untouched.

`node scripts/checkScionGrammarSource.mjs <patched-upstream-checkout>` executes the actual upstream completion and acceptance methods after TypeScript transpilation, with fake token sampling and a captured transport. It checks cached/uncached prompt handling, generated-token acceptance, EOG, explicit stop and cancellation. It also compiles the actual native acceptance action with a recording sampler stub and verifies the flag reaches the sampler. Seven routing cases pass; the unpatched upstream is a failing control. This is a routing regression, **not a test of llama grammar parsing or constrained inference**.

## Required next evidence

1. Build with the pinned llama.cpp, Emscripten and Dawn identities, retaining existing cache and LoRA fixes. Limit build concurrency; no simultaneous model inference.
2. Validate new protocol mismatch rejection, invalid grammar handling and runtime identities. Check native grammar initialization does not silently discard malformed grammars.
3. One browser/model: literal `OK` must terminate once; a small JSON grammar must parse, support Chinese strings and escaped characters, and terminate within budget. Test unconstrained generation, cancellation and a fresh subsequent request too.
4. Only then expose application-owned schema constraints to the source-proposal pipeline. Do not let source documents supply executable grammar or use permissive JSON repair to hide failures.
5. Rerun both exposed cases without selecting the best result, followed by fresh held-out tasks. Grammar proves structure only; role attribution, units, evidence and teaching value need separate review.

## Rebuild and browser result

The build used the pinned llama.cpp archive, Emscripten 4.0.20 (actual `emcc --version` revision `6913738ec5371a88c4af5a80db0ab42bad3de681`), Dawn v20260317.182325 and CMake 3.31.6. Emsdk's release-build hash is separately recorded: the Emscripten source revision is not an emsdk repository revision. Downloads, output hashes and the two-job compile limit are in `build-review.json`.

The candidate additionally rejects a null grammar sampler before allocating the sampling chain. Its initialization action preserves the prior sampler on failure and returns `success: false`. Invalid syntax therefore cannot silently turn a constrained request into an unconstrained request.

The generated worker contains only the rebuilt JSPI backend; unsupported Asyncify entries throw explicitly. The existing OPFS streaming, bounded-read, native-response and cancellation patches are applied to the new bundle with an explicit recorded input digest. The production v2 builder retains its original fixed digest and output. Candidate files are isolated under `/scion/runtime/v3-candidate/`; the application still selects v2.

`canary.html` is a local-only, manually triggered developer fixture served by the existing development server. It loads one base model, records the fetched JS/WASM hashes, runs serially, and unloads the model in `finally`. The initial fixture import failed because Vite rejects static imports of public JS; using the same absolute dynamic import as the product fixed the fixture before any model inference. This was a fixture failure, not a model attempt.

The exact downloaded `browser-canary.json` records:

- `OK` once and then termination: 543 ms.
- Chinese JSON: 1,594 ms; escaped quotes/newline JSON: 1,525 ms. Both parse to the exact required objects.
- Invalid grammar: rejected before output in 4 ms; a subsequent valid request succeeds.
- Cancellation after two emitted tokens: stops; a subsequent valid request succeeds.
- Unconstrained request: emits `Hello` and terminates, 208 ms.

Cached model loading took 4,310 ms. All eight cases passed, with no receipt-level errors. Literal grammars deliberately prescribe the output: **they test runtime enforcement, not model reasoning or schema-filling competence**. Neither schema choice nor token budgets were tuned after observing these results. The fixture and receipt retain the actual tested boundaries, including low-level cancellation returning partial text; the product completion boundary separately rejects cancelled text.

Remaining: dynamic object schemas and source-proposal integration; executable protocol mismatch check; adapter apply/clear regression with the rebuilt binary; independent semantic and educational evaluation. The runtime candidate is not promoted by this receipt.

The subsequent constrained source-proposal trial is documented in `proposal-experiment.md` and `proposal-review.json`. It adds real variable JSON values (not prescribed literal answers): all four calls parse, but both proposals remain partial. The source-routing checker now also compiles the actual native glue header and verifies v3 flag roundtrips and v2 rejection, for eight source/protocol checks total. Adapter and held-out educational validation remain pending.


## Runtime selection after adapter and protocol checks (2026-09-08)

The historical pending items above describe the state of those receipts. `adapter/browser-receipt.json` now records seven real native adapter checks; `adapter/mismatch-receipt.json` records rejection of a deliberately incompatible pair. The tiny adapter is untrained, reproducible via `adapter/create_smoke.py`, and not shipped. These are mechanical compatibility checks, not quality evidence.

The development branch now selects the identical verified JS/WASM hashes under `/scion/runtime/v3/`. Prebuild validates both hashes; old paths remain intact. `adapter/application-receipt.json` confirms that the actual application uses this pair and the compact source protocol: one call, all nine roles located, zero manual role corrections on the exposed chronology development case. Full held-out teaching and release validation remain incomplete.
