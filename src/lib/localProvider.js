// src/lib/localProvider.js — the "Local" provider: the house model served
// on this device by `npm run local-model` (OpenAI-compatible; grammar-
// constrained decoding via llguidance; $0 per call).
//
// V2.1 Workstream B. The provider is KEYLESS (webllm precedent): "Connected"
// means the local server answers GET /v1/models.
//
// SCION (adopted 2026-07-07): the house model's name. In horticulture, the
// scion is the cultivated cutting grafted onto wild rootstock — Gemma is the
// rootstock; the Trellis harness and the house adapters are the scion. The
// first trained cut ships as Scion-1 (lab config name: E2B-MAX V2.1).

export const LOCAL_PROVIDER_ID = 'local';
export const DEFAULT_LOCAL_ENDPOINT = 'http://127.0.0.1:8799';
export const LOCAL_MODEL_ID = 'scion-1';
export const LOCAL_MODEL_NAME = 'Scion-1';

export function getLocalEndpoint() {
  try {
    return localStorage.getItem('coursemapper-local-endpoint') || DEFAULT_LOCAL_ENDPOINT;
  } catch {
    return DEFAULT_LOCAL_ENDPOINT;
  }
}

// Static capability profile — the local server is never live-probed the way
// paid providers are (each probe is a real on-device generation). The server
// enforces json_object AND json_schema at decode time (llguidance), streams
// SSE with keep-alive heartbeats, and has no tool-calling surface.
export function localModelOption() {
  return {
    id: LOCAL_MODEL_ID,
    name: LOCAL_MODEL_NAME,
    created: 1,
    maxInputTokens: 32000,
    maxOutputTokens: 16000,
    capabilities: {
      jsonMode: true,
      jsonSchema: true,
      toolCalling: false,
      streaming: true,
    },
  };
}
