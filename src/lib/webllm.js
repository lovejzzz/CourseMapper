/**
 * webllm.js — Browser-local LLM inference via WebLLM (MLC AI).
 *
 * Provides a singleton engine that downloads, caches, and runs
 * Qwen3-4B locally using WebGPU. No API key needed.
 *
 * This file is dynamically imported to avoid touching Local AI code for BYOK
 * users. The WebLLM runtime itself is loaded from a pinned CDN module only
 * only if legacy WebLLM code paths request it, so the static app does not ship
 * a multi-megabyte webllm asset to everyone.
 */
import { WEBLLM_DEFAULT_MODEL, WEBLLM_MAX_TOKENS } from './webllmConstants';

// Re-export constants for convenience
export { WEBLLM_MODELS, WEBLLM_DEFAULT_MODEL, WEBLLM_MAX_TOKENS, isWebGPUSupported } from './webllmConstants';

export const WEBLLM_MODULE_URL = 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.81/lib/index.js';

// ── Singleton engine ────────────────────────────────────────────────────────
let _webllm = null;
let _runtimePromise = null;
let _engine = null;
let _loadingPromise = null;
let _isReady = false;
let _loadedModelId = null;

/**
 * Load the WebLLM runtime from an external pinned ESM bundle.
 * Vite must not rewrite this dynamic import; otherwise production builds would
 * include the 6 MB runtime chunk again.
 */
async function loadWebLLMRuntime() {
  if (_webllm) return _webllm;
  if (_runtimePromise) return _runtimePromise;

  _runtimePromise = import(/* @vite-ignore */ WEBLLM_MODULE_URL)
    .then((mod) => {
      _webllm = mod;
      return _webllm;
    })
    .catch((err) => {
      _runtimePromise = null;
      throw new Error(
        `Failed to load the Local AI runtime. Check your network connection and try again. ${err?.message || ''}`.trim(),
      );
    });

  return _runtimePromise;
}

/**
 * Get the current engine status.
 */
export function isEngineReady() {
  return _isReady;
}

/**
 * Initialize and return the WebLLM engine.
 * Downloads the model on first use, cached in browser storage after that.
 *
 * @param {string} modelId - WebLLM model ID (e.g. 'Qwen3-4B-q4f16_1-MLC')
 * @param {function} onProgress - Called with { text, progress } during download
 * @returns {Promise<MLCEngine>}
 */
export async function getEngine(modelId, onProgress) {
  const targetModel = modelId || WEBLLM_DEFAULT_MODEL.id;

  // If already loaded with same model, return immediately
  if (_isReady && _engine && _loadedModelId === targetModel) return _engine;

  // If switching models, reset first
  if (_engine && _loadedModelId !== targetModel) {
    await resetEngine();
  }

  if (_loadingPromise) return _loadingPromise;

  _loadingPromise = (async () => {
    try {
      const webllm = await loadWebLLMRuntime();
      _engine = await webllm.CreateMLCEngine(targetModel, {
        initProgressCallback: (report) => {
          if (onProgress) {
            onProgress({
              text: report.text || '',
              progress: report.progress || 0,
            });
          }
        },
      });
      _isReady = true;
      _loadedModelId = targetModel;
      return _engine;
    } catch (err) {
      _loadingPromise = null;
      _engine = null;
      _isReady = false;
      _loadedModelId = null;
      throw err;
    }
  })();

  return _loadingPromise;
}

/**
 * Reset the engine (for cleanup / error recovery).
 */
export async function resetEngine() {
  if (_engine) {
    try {
      await _engine.unload();
    } catch {
      /* ignore */
    }
  }
  _engine = null;
  _loadingPromise = null;
  _isReady = false;
  _loadedModelId = null;
}

/**
 * Generate a streaming chat completion using the local WebLLM engine.
 *
 * @param {string} modelId - WebLLM model ID
 * @param {Array} messages - [{ role: 'system'|'user'|'assistant', content: string }]
 * @param {object} opts - { temperature, max_tokens, onChunk, signal, onProgress }
 * @returns {{ fullText: string }}
 */
export async function streamLocalChat(modelId, messages, opts = {}) {
  const { temperature = 0.3, max_tokens = WEBLLM_MAX_TOKENS, onChunk, signal, onProgress } = opts;

  const engine = await getEngine(modelId, onProgress);

  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const asyncIterator = await engine.chat.completions.create({
    messages,
    temperature,
    max_tokens,
    stream: true,
  });

  let fullText = '';
  let chunkCount = 0;

  for await (const chunk of asyncIterator) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const delta = chunk.choices?.[0]?.delta?.content;
    if (delta) {
      fullText += delta;
      chunkCount++;
      if (onChunk) onChunk(fullText, chunkCount);
    }
  }

  return { fullText };
}

/**
 * Non-streaming completion for agent mode.
 *
 * @param {string} modelId - WebLLM model ID
 * @param {Array} messages
 * @param {object} opts - { temperature, max_tokens, onProgress }
 * @returns {object} - OpenAI-compatible response
 */
export async function completeLocal(modelId, messages, opts = {}) {
  const { temperature = 0.3, max_tokens = WEBLLM_MAX_TOKENS, onProgress } = opts;

  const engine = await getEngine(modelId, onProgress);

  const response = await engine.chat.completions.create({
    messages,
    temperature,
    max_tokens,
    stream: false,
  });

  return response;
}
