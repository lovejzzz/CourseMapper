export const SCION_BROWSER_MAX_NEW_TOKENS = 4096;

export const SCION_BROWSER_WLLAMA_RUNTIME_ID = 'scion-wllama-webgpu-jspi-v1';
export const SCION_BROWSER_WLLAMA_MODULE_PATH = '/scion/runtime/v1/wllama.js';
export const SCION_BROWSER_WLLAMA_WASM_PATH = '/scion/runtime/v1/jspi-single-thread/wllama.wasm';

export const SCION_BROWSER_GEMMA4_GGUF = Object.freeze({
  trainingBase: Object.freeze({
    modelId: 'google/gemma-4-E2B-it-qat-q4_0-unquantized',
    revision: '1ca4dd94b623b6e0dd9da00c2239ab84b4f3e5ce',
    architecture: 'gemma4',
  }),
  runtimeArtifact: Object.freeze({
    modelId: 'google/gemma-4-E2B-it-qat-q4_0-gguf',
    revision: '69536a21d70340464240401ba38223d805f6a709',
    file: 'gemma-4-E2B_q4_0-it.gguf',
    bytes: 3349514112,
    sha256: '3646b4c147cd235a44d91df1546d3b7d8e29b547dbe4e1f80856419aa455e6fd',
    format: 'gguf-q4_0-qat',
  }),
  runtime: Object.freeze({
    id: SCION_BROWSER_WLLAMA_RUNTIME_ID,
    modulePath: SCION_BROWSER_WLLAMA_MODULE_PATH,
    moduleSha256: 'ca1b99d084b649a89400d8a839f3e772a46d1f65f145b80d9aa49bc43ddbc41a',
    wasmPath: SCION_BROWSER_WLLAMA_WASM_PATH,
    wasmSha256: '732bac4661d613461cee0b3132660beab159b926910c8431181ee01608e44229',
    upstreamRevision: '58903000dbea6acfc0eb9c738d8be50d1052cf23',
    llamaCppRevision: '5ec717d1256e34558a44dc09adf1e6e16f2e2682',
  }),
  adapterMode: 'capability-gated',
});

export const SCION_BROWSER_GEMMA4_GGUF_URL = [
  'https://huggingface.co',
  SCION_BROWSER_GEMMA4_GGUF.runtimeArtifact.modelId,
  'resolve',
  SCION_BROWSER_GEMMA4_GGUF.runtimeArtifact.revision,
  SCION_BROWSER_GEMMA4_GGUF.runtimeArtifact.file,
].join('/');

export const SCION_BROWSER_GEMMA4_DOWNLOAD_LABEL = `${(SCION_BROWSER_GEMMA4_GGUF.runtimeArtifact.bytes / 1_000_000_000).toFixed(2)} GB`;
