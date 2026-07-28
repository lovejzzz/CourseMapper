export const SCION_BROWSER_MAX_NEW_TOKENS = 4096;

export const SCION_BROWSER_WLLAMA_RUNTIME_ID = 'scion-wllama-webgpu-jspi-v1';
export const SCION_BROWSER_WLLAMA_MODULE_PATH = '/scion/runtime/v2/wllama.js';
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
  browserDelivery: Object.freeze({
    modelId: 'ryanhlewis/gemma-4-E2B-it-qat-q4_0-gguf-webgpu',
    revision: '3ce648b4ba851cb23917b766f4bb2d9d47eaff81',
    entryFile: 'gemma-4-E2B_q4_0-it-00001-of-00005.gguf',
    bytes: 3349514688,
    format: 'gguf-split-q4_0-qat',
    sourceArtifactSha256: '3646b4c147cd235a44d91df1546d3b7d8e29b547dbe4e1f80856419aa455e6fd',
    shards: Object.freeze([
      Object.freeze({
        file: 'gemma-4-E2B_q4_0-it-00001-of-00005.gguf',
        bytes: 43313792,
        sha256: '5864e84bdcc425d3bc12ecf247b36e302b7b94ef1f38cf80796022f750b698a3',
      }),
      Object.freeze({
        file: 'gemma-4-E2B_q4_0-it-00002-of-00005.gguf',
        bytes: 1926758592,
        sha256: '37610bfc61e62293995cebeeb845f77c8dc732daad76d9d0d5a8a34f3337a5e8',
      }),
      Object.freeze({
        file: 'gemma-4-E2B_q4_0-it-00003-of-00005.gguf',
        bytes: 511960928,
        sha256: '35e1735782ab84ab059f41eea9b961f806e277469287a4ff9a92913ca1c3e28b',
      }),
      Object.freeze({
        file: 'gemma-4-E2B_q4_0-it-00004-of-00005.gguf',
        bytes: 505303456,
        sha256: 'dbb94db546f70dc0b150dafd8475e2d109f6738f7e564cb90462bc82f0cb587b',
      }),
      Object.freeze({
        file: 'gemma-4-E2B_q4_0-it-00005-of-00005.gguf',
        bytes: 362177920,
        sha256: 'bc05eed5f61dcc4a35bc1515603c2a917e5760ac2a409d837f72ecd6b168aa99',
      }),
    ]),
  }),
  runtime: Object.freeze({
    id: SCION_BROWSER_WLLAMA_RUNTIME_ID,
    modulePath: SCION_BROWSER_WLLAMA_MODULE_PATH,
    moduleSha256: '4b43ed59785ae9aa89aae67ac504534d9bf7b65e6340969b7bd13550146a6433',
    wasmPath: SCION_BROWSER_WLLAMA_WASM_PATH,
    wasmSha256: '732bac4661d613461cee0b3132660beab159b926910c8431181ee01608e44229',
    upstreamRevision: '58903000dbea6acfc0eb9c738d8be50d1052cf23',
    llamaCppRevision: '5ec717d1256e34558a44dc09adf1e6e16f2e2682',
  }),
  adapterMode: 'capability-gated',
});

export const SCION_BROWSER_GEMMA4_GGUF_URL = [
  'https://huggingface.co',
  SCION_BROWSER_GEMMA4_GGUF.browserDelivery.modelId,
  'resolve',
  SCION_BROWSER_GEMMA4_GGUF.browserDelivery.revision,
  SCION_BROWSER_GEMMA4_GGUF.browserDelivery.entryFile,
].join('/');

export const SCION_BROWSER_GEMMA4_DOWNLOAD_LABEL = `${(SCION_BROWSER_GEMMA4_GGUF.browserDelivery.bytes / 1_000_000_000).toFixed(2)} GB`;
