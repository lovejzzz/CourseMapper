# Native grammar acceptance investigation — 2026-09-07

Status: a pinned-source defect is confirmed and a candidate patch passes source routing regressions. No rebuilt WASM, browser grammar canary, or teaching-quality pass is claimed.

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
