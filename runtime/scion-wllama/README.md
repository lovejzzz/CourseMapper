# Scion WebGPU GGUF runtime

This directory makes Scion's experimental browser LoRA runtime reproducible and auditable. The shipped JavaScript and WebAssembly artifacts live under `public/scion/runtime/v1/`; they contain runtime code only. They do not contain Gemma weights or Scion adapter weights.

## Exact source

- wllama fork source: `reeselevine/wllama@58903000dbea6acfc0eb9c738d8be50d1052cf23`
- llama.cpp submodule: `5ec717d1256e34558a44dc09adf1e6e16f2e2682`
- Scion LoRA patch: `scion-lora.patch`
- Emscripten: `4.0.20` (`6913738ec5371a88c4af5a80db0ab42bad3de681`)
- Dawn: `v20260317.182325`
- target: WebGPU, JSPI, Memory64, single-thread

`upstream.json` binds those inputs to the exact browser artifact hashes. Run `npm run audit:scion:browser-lora` after rebuilding or changing any file.

## Rebuild outline

1. Clone the pinned wllama revision and initialize its llama.cpp submodule.
2. Verify the submodule is at the pinned llama.cpp revision.
3. Apply `scion-lora.patch` with `git apply --check`, then `git apply`.
4. Generate glue messages, build the JSPI single-thread WebGPU target with Emscripten 4.0.20 and the pinned Dawn package, embed the worker, and run the upstream TypeScript bundle.
5. Copy `esm/index.js` to `public/scion/runtime/v1/wllama.js` and the JSPI WASM file to `public/scion/runtime/v1/jspi-single-thread/wllama.wasm`.
6. Run the runtime audit and the real-browser canary before accepting the artifacts.

The upstream Docker build records the exact compile flags in `scripts/docker-compose.yml`. The important target flags are `-DGGML_WEBGPU_JSPI=ON`, `-DLLAMA_WASM_MEM64=ON`, `-fwasm-exceptions`, `-sJSPI`, and `-sMEMORY64=1`.

## Prompt boundary

The upstream wrapper's legacy chat formatter cannot execute Gemma 4's embedded Jinja template and returns an empty string. Scion therefore formats the supported text-only Gemma 4 turn contract itself in `src/lib/scionGemma4Prompt.js` and sends it through `createCompletion`. The format was checked against the same pinned llama.cpp native CLI and then exercised in the real browser.

This is intentionally narrow: one optional leading system turn plus user and assistant text turns. Reserved Gemma control markers in user content are neutralized. Tools, images, audio, and thinking channels are not silently approximated.

## Claim boundary

The browser canary proves that the runtime:

- downloads and runs a public Gemma 4 GGUF with WebGPU;
- loads a separate GGUF LoRA file;
- reports native adapter metadata;
- changes deterministic inference while the adapter is active; and
- clears the adapter and restores the exact base output.

It does not promote the legacy smoke adapter. That artifact has no eligible preference corpus and was trained against an earlier, non-QAT base identity. A production Scion adapter must be trained against the exact public QAT base declared by the official GGUF repository, beat base-only Scion across five held-out domains, reduce compiler burden, win blind instructor preference, and pass every release gate.
