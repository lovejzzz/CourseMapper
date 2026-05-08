/**
 * webllmConstants.js — Static constants for WebLLM integration.
 * Kept separate from webllm.js so importing these doesn't touch the external
 * Local AI runtime loader.
 */

export const WEBLLM_MODELS = [
  { id: 'Qwen3-4B-q4f16_1-MLC', name: 'Qwen 3 4B (Local)', size: '~2.3 GB', vram: 3432, maxTokens: 4096 },
  { id: 'Qwen3-1.7B-q4f16_1-MLC', name: 'Qwen 3 1.7B (Local)', size: '~1.3 GB', vram: 2037, maxTokens: 4096 },
];
export const WEBLLM_DEFAULT_MODEL = WEBLLM_MODELS[0];
export const WEBLLM_MAX_TOKENS = 4096;

/**
 * Check if the browser supports WebGPU.
 */
export function isWebGPUSupported() {
  return typeof navigator !== 'undefined' && !!navigator.gpu;
}
