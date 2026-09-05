import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchOpenAIImageModels, generateImages, OPENAI_SLIDE_IMAGE_MODEL } from '../imageSearch';

describe('generateImages', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // ── No API key ──────────────────────────────────────────────────────────

  it('returns error when no API key is provided', async () => {
    const result = await generateImages('test query', { provider: 'openai' });
    expect(result).toEqual({ images: [], error: 'No API key configured.' });
  });

  it('returns error when options are omitted entirely', async () => {
    const result = await generateImages('test query');
    expect(result).toEqual({ images: [], error: 'No API key configured.' });
  });

  // ── OpenAI / DALL-E 3 ─────────────────────────────────────────────────

  it('generates an image via OpenAI DALL-E 3', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ url: 'https://example.com/img.png', revised_prompt: 'revised' }],
      }),
    });

    const result = await generateImages('a cat', {
      provider: 'openai',
      apiKey: 'sk-test',
      count: 1,
    });

    expect(result.images).toHaveLength(1);
    expect(result.images[0]).toMatchObject({
      url: 'https://example.com/img.png',
      revisedPrompt: 'revised',
      provider: 'dall-e-3',
    });
    expect(result.images[0].id).toMatch(/^dalle-/);

    // Verify fetch was called to the OpenAI endpoint
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/images/generations',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-test',
        }),
      }),
    );
  });

  it('handles OpenAI 429 rate limit error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({
        error: { message: 'Rate limited — too many requests' },
      }),
    });

    const result = await generateImages('a dog', {
      provider: 'openai',
      apiKey: 'sk-test',
      count: 1,
    });

    expect(result.images).toEqual([]);
    expect(result.error).toMatch(/Rate limited/);
  });

  it('generates multiple images with sequential OpenAI requests', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      return {
        ok: true,
        json: async () => ({
          data: [{ url: `https://example.com/img${callCount}.png`, revised_prompt: `revised ${callCount}` }],
        }),
      };
    });

    const result = await generateImages('landscapes', {
      provider: 'openai',
      apiKey: 'sk-test',
      count: 2,
    });

    expect(result.images).toHaveLength(2);
    expect(result.images[0].url).toBe('https://example.com/img1.png');
    expect(result.images[1].url).toBe('https://example.com/img2.png');
    expect(result.images[0].provider).toBe('dall-e-3');
    expect(result.images[1].provider).toBe('dall-e-3');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('generates a slide image via OpenAI GPT Image', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ b64_json: 'abc123', revised_prompt: 'revised slide prompt' }],
      }),
    });

    const result = await generateImages('educational diagram', {
      provider: 'openai',
      apiKey: 'sk-test',
      count: 1,
      model: OPENAI_SLIDE_IMAGE_MODEL,
    });

    expect(result.images).toHaveLength(1);
    expect(result.images[0]).toMatchObject({
      url: 'data:image/png;base64,abc123',
      revisedPrompt: 'revised slide prompt',
      provider: OPENAI_SLIDE_IMAGE_MODEL,
    });
    expect(result.images[0].id).toMatch(/^gpt-image-/);

    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body).toMatchObject({
      model: OPENAI_SLIDE_IMAGE_MODEL,
      prompt: 'educational diagram',
      n: 1,
      size: '1024x1024',
    });
    expect(body.response_format).toBeUndefined();
  });

  it('falls back when the selected GPT Image model is unavailable', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({
          error: { message: 'Your organization must be verified to use the model `gpt-image-2`.' },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ b64_json: 'fallback123', revised_prompt: 'fallback revised' }],
        }),
      });

    const result = await generateImages('educational diagram', {
      provider: 'openai',
      apiKey: 'sk-test',
      count: 1,
      model: 'gpt-image-2',
    });

    expect(result.images).toHaveLength(1);
    expect(result.images[0]).toMatchObject({
      url: 'data:image/png;base64,fallback123',
      revisedPrompt: 'fallback revised',
      provider: 'gpt-image-1.5',
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(globalThis.fetch.mock.calls[0][1].body).model).toBe('gpt-image-2');
    expect(JSON.parse(globalThis.fetch.mock.calls[1][1].body).model).toBe('gpt-image-1.5');
  });

  it('fetches and sorts OpenAI image models with newest first', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: 'gpt-5.4-mini' },
          { id: 'dall-e-3' },
          { id: 'gpt-image-1' },
          { id: 'gpt-image-2' },
          { id: 'gpt-image-2-2026-04-21' },
          { id: 'gpt-image-1-mini' },
        ],
      }),
    });

    const models = await fetchOpenAIImageModels('sk-test');

    expect(models).toEqual(['gpt-image-2', 'gpt-image-2-2026-04-21', 'gpt-image-1', 'gpt-image-1-mini', 'dall-e-3']);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/models',
      expect.objectContaining({
        headers: { Authorization: 'Bearer sk-test' },
      }),
    );
  });

  // ── Google / Imagen 3 ────────────────────────────────────────────────

  it('generates an image via Google Imagen 3', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        predictions: [{ bytesBase64Encoded: 'abc123' }],
      }),
    });

    const result = await generateImages('a sunset', {
      provider: 'google',
      apiKey: 'goog-test',
      count: 1,
    });

    expect(result.images).toHaveLength(1);
    expect(result.images[0].url).toBe('data:image/png;base64,abc123');
    expect(result.images[0].provider).toBe('imagen-3');
    expect(result.images[0].id).toMatch(/^imagen-/);
  });

  it('handles Google Imagen 400 error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: { message: 'Invalid request payload' },
      }),
    });

    const result = await generateImages('bad query', {
      provider: 'google',
      apiKey: 'goog-test',
      count: 1,
    });

    expect(result.images).toEqual([]);
    expect(result.error).toMatch(/Invalid request payload/);
  });

  // ── Anthropic ────────────────────────────────────────────────────────

  it('returns not-supported error for Anthropic without calling fetch', async () => {
    globalThis.fetch = vi.fn();

    const result = await generateImages('test', {
      provider: 'anthropic',
      apiKey: 'ant-key',
    });

    expect(result.images).toEqual([]);
    expect(result.error).toMatch(/not supported/i);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  // ── Unknown provider ────────────────────────────────────────────────

  it('returns not-supported error for unknown provider', async () => {
    globalThis.fetch = vi.fn();

    const result = await generateImages('test', {
      provider: 'unknown-provider',
      apiKey: 'some-key',
    });

    expect(result.images).toEqual([]);
    expect(result.error).toMatch(/not supported/i);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  // ── AbortError ───────────────────────────────────────────────────────

  it('rethrows AbortError from fetch', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    globalThis.fetch = vi.fn().mockRejectedValue(abortError);

    await expect(generateImages('test', { provider: 'openai', apiKey: 'sk-test', count: 1 })).rejects.toThrow();

    // Also test for Google provider
    await expect(generateImages('test', { provider: 'google', apiKey: 'goog-test', count: 1 })).rejects.toThrow();
  });
});
