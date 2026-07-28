import { describe, expect, it, vi } from 'vitest';
import { classifyScionBrowserModelLoadError, estimateScionBrowserModelStorage } from '../scionBrowserWllama';
import { SCION_BROWSER_GEMMA4_GGUF } from '../scionBrowserConstants';

describe('Scion browser model storage recovery', () => {
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
