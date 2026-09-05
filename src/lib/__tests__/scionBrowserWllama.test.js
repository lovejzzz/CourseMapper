import { describe, expect, it, vi } from 'vitest';
import {
  classifyScionBrowserModelLoadError,
  estimateScionBrowserModelStorage,
  isExpectedScionRuntimeWarning,
} from '../scionBrowserWllama';
import { SCION_BROWSER_GEMMA4_GGUF } from '../scionBrowserConstants';

describe('Scion browser model storage recovery', () => {
  it.each([
    "load: control-looking token: 212 '</s>' was not control-type; this is probably a bug in the model. its type will be overridden",
    "load: special_eog_ids contains '<|tool_response>', removing '</s>' token from EOG list",
    'llama_context: n_ctx_seq (8192) < n_ctx_train (131072) -- the full capacity of the model will not be utilized',
    'llama_kv_cache_iswa: using full-size SWA cache',
    'Disabling multi-threading when using WebGPU backend',
  ])('classifies pinned native initialization diagnostics as informational: %s', (message) => {
    expect(isExpectedScionRuntimeWarning(message)).toBe(true);
  });

  it('preserves unknown model-runtime warnings for diagnosis', () => {
    expect(isExpectedScionRuntimeWarning('WebGPU device lost while generating token 42')).toBe(false);
    expect(isExpectedScionRuntimeWarning('Model file not found')).toBe(false);
  });

  it('recognizes Chromium no-space results returned as an unsigned integer', () => {
    expect(
      classifyScionBrowserModelLoadError(new Error('OPFS Worker: wrote 4294967288 of 933462 requested bytes')),
    ).toMatchObject({
      code: 'SCION_WLLAMA_STORAGE_FULL',
      kind: 'storage-full',
      clearCache: true,
    });
  });

  it('preserves a clear storage diagnosis after the runtime worker serializes the error', () => {
    const result = classifyScionBrowserModelLoadError({
      name: 'Error',
      message: 'OPFS Worker: browser storage is full while caching shard-2 at byte 1024',
    });

    expect(result.message).toContain('Free at least 4 GB');
    expect(result.message).not.toContain('Model file not found');
  });

  it('classifies an incomplete split cache separately from network or model identity failures', () => {
    expect(
      classifyScionBrowserModelLoadError(new Error('Model file not found: gemma-4-E2B_q4_0-it-00002-of-00005.gguf')),
    ).toMatchObject({
      code: 'SCION_WLLAMA_CACHE_INCOMPLETE',
      kind: 'cache-incomplete',
      clearCache: true,
    });
  });

  it('does not treat the stale GLUE protocol marker as proof that model bytes are corrupt', () => {
    expect(classifyScionBrowserModelLoadError(new RangeError('Invalid typed array length: 1163217991'))).toMatchObject({
      code: 'SCION_WLLAMA_LOAD',
      kind: 'other',
      clearCache: false,
      message: 'Invalid typed array length: 1163217991',
    });
  });

  it('classifies a WebGPU queue timeout as a retryable activation failure without clearing the model', () => {
    expect(
      classifyScionBrowserModelLoadError(new Error('ggml_webgpu: Queue wait timed out after 30000 ms')),
    ).toMatchObject({
      code: 'SCION_WLLAMA_ACTIVATION_TRANSIENT',
      kind: 'activation-transient',
      clearCache: false,
    });
  });

  it('reports usable quota and includes working headroom in the requirement', async () => {
    const estimate = vi.fn().mockResolvedValue({ quota: 10_000_000_000, usage: 2_000_000_000 });

    await expect(estimateScionBrowserModelStorage({ storage: { estimate } })).resolves.toEqual({
      quota: 10_000_000_000,
      usage: 2_000_000_000,
      available: 8_000_000_000,
      required: SCION_BROWSER_GEMMA4_GGUF.browserDelivery.bytes + 512 * 1024 * 1024,
    });
  });

  it('keeps storage estimation advisory when the browser does not expose it', async () => {
    await expect(estimateScionBrowserModelStorage({})).resolves.toBeNull();
    await expect(
      estimateScionBrowserModelStorage({
        storage: { estimate: vi.fn().mockRejectedValue(new Error('blocked')) },
      }),
    ).resolves.toBeNull();
  });
});
