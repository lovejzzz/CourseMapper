import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchModelsFromProvider } from '../useStreamReader';

describe('fetchModelsFromProvider', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('keeps new OpenAI text-generation models returned by the live catalog', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: 'gpt-6.0', created: 1_800_000_000 },
          { id: 'gpt-6.0-2026-05-01', created: 1_799_000_000 },
          { id: 'chatgpt-5o-latest', created: 1_700_000_000 },
          { id: 'gpt-image-2', created: 1_900_000_000 },
          { id: 'text-embedding-3-large', created: 1_900_000_001 },
        ],
      }),
    });

    const models = await fetchModelsFromProvider('openai', 'sk-test');

    expect(models.map((model) => model.id)).toEqual(['gpt-6.0', 'gpt-6.0-2026-05-01', 'chatgpt-5o-latest']);
    expect(models[0]).toMatchObject({ name: 'GPT-6.0', maxOutputTokens: 128000 });
  });

  it('times out stalled provider model discovery calls', async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, options = {}) => {
      return new Promise((_resolve, reject) => {
        options.signal?.addEventListener(
          'abort',
          () => reject(options.signal.reason || Object.assign(new Error('Aborted'), { name: 'AbortError' })),
          { once: true },
        );
      });
    });

    const request = fetchModelsFromProvider('openai', 'sk-test', { timeoutMs: 50 });
    const expectation = expect(request).rejects.toMatchObject({ name: 'TimeoutError', isTimeout: true });
    await vi.advanceTimersByTimeAsync(50);

    await expectation;
  });

  it('keeps Google Gemini preview/snapshot models that support content generation', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      return {
        ok: true,
        json: async () => ({
          models: [
            {
              name: 'models/gemini-3.0-pro-preview-01-15',
              displayName: 'Gemini 3.0 Pro Preview',
              supportedGenerationMethods: ['generateContent', 'countTokens'],
              outputTokenLimit: 65536,
            },
            {
              name: 'models/gemini-2.5-flash-preview-05-20',
              displayName: 'Gemini 2.5 Flash Preview 05-20',
              supportedGenerationMethods: ['streamGenerateContent'],
              outputTokenLimit: 65536,
            },
            {
              name: 'models/gemini-3-pro-preview',
              displayName: 'Gemini 3 Pro Preview',
              supportedGenerationMethods: ['generateContent'],
              outputTokenLimit: 65536,
            },
            {
              name: 'models/gemini-2.0-flash-preview-image-generation',
              displayName: 'Gemini 2.0 Flash Preview Image Generation',
              supportedGenerationMethods: ['generateContent'],
            },
            {
              name: 'models/text-embedding-004',
              displayName: 'Text Embedding',
              supportedGenerationMethods: ['embedContent'],
            },
          ],
        }),
      };
    });

    const models = await fetchModelsFromProvider('google', 'AIza-test');

    expect(fetchMock.mock.calls[0][0]).toContain('generativelanguage.googleapis.com/v1beta/models');
    expect(models.map((model) => model.id)).toEqual(['gemini-3.0-pro-preview-01-15', 'gemini-2.5-flash-preview-05-20']);
  });

  it('uses conservative Vertex Express fallbacks instead of unsupported catalog/probe endpoints', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const requestUrl = String(url);
      if (requestUrl.includes('v1beta1/publishers/google/models?')) throw new Error('unexpected catalog call');
      if (requestUrl.includes('generativelanguage.googleapis.com/v1beta/models?'))
        throw new Error('unexpected Gemini API catalog call');
      if (requestUrl.includes(':countTokens')) throw new Error('unexpected model probe call');
      return { ok: true, json: async () => ({}) };
    });

    const models = await fetchModelsFromProvider('google', 'VertexExpressKeyWithEnoughLength1234567890');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(models.map((model) => model.id).slice(0, 3)).toEqual([
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
    ]);
  });

  it('does not add guessed Google models that are missing from the live catalog', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const requestUrl = String(url);
      if (requestUrl.includes('generativelanguage.googleapis.com/v1beta/models?')) {
        return {
          ok: true,
          json: async () => ({
            models: [
              {
                name: 'models/gemini-2.5-flash',
                displayName: 'Gemini 2.5 Flash',
                supportedGenerationMethods: ['generateContent', 'streamGenerateContent'],
                outputTokenLimit: 65536,
              },
            ],
          }),
        };
      }
      throw new Error(`unexpected request: ${requestUrl}`);
    });

    const models = await fetchModelsFromProvider('google', 'AIza-test');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(models.map((model) => model.id)).toEqual(['gemini-2.5-flash']);
  });

  it('uses the current Vertex Express fallback without Gemini API-only models', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({}) });

    const models = await fetchModelsFromProvider('google', 'VertexExpressKeyWithEnoughLength1234567890');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(models.map((model) => model.id).slice(0, 5)).toEqual([
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      'gemini-2.0-flash',
      'gemini-2.0-flash-001',
    ]);
    expect(models.map((model) => model.id)).not.toContain('gemini-3.5-flash');
    expect(models.map((model) => model.id)).not.toContain('gemini-3-pro-preview');
  });

  it('keeps dated Anthropic model IDs instead of collapsing to display names', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 'claude-sonnet-5-20260101',
            display_name: 'Claude Sonnet 5',
            created_at: '2026-01-01T00:00:00Z',
          },
          {
            id: 'claude-sonnet-5-20260401',
            display_name: 'Claude Sonnet 5',
            created_at: '2026-04-01T00:00:00Z',
          },
        ],
      }),
    });

    const models = await fetchModelsFromProvider('anthropic', 'sk-ant-test');

    expect(models.map((model) => model.id)).toEqual(['claude-sonnet-5-20260401', 'claude-sonnet-5-20260101']);
  });

  it('infers larger DeepSeek V4 limits from model family names', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: 'deepseek-v4-pro' }, { id: 'deepseek-chat' }],
      }),
    });

    const models = await fetchModelsFromProvider('deepseek', 'sk-test');

    expect(models.find((model) => model.id === 'deepseek-v4-pro')).toMatchObject({
      maxInputTokens: 1000000,
      maxOutputTokens: 384000,
    });
    expect(models.find((model) => model.id === 'deepseek-chat')).toMatchObject({ maxOutputTokens: 8192 });
  });
});
