import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchModelsFromProvider } from '../useStreamReader';

describe('fetchModelsFromProvider', () => {
  afterEach(() => {
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

  it('keeps Google Gemini preview/snapshot models that support content generation', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
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
    });

    const models = await fetchModelsFromProvider('google', 'AIza-test');

    expect(fetchMock.mock.calls[0][0]).toContain('generativelanguage.googleapis.com/v1beta/models');
    expect(models.map((model) => model.id)).toEqual(['gemini-3.0-pro-preview-01-15', 'gemini-2.5-flash-preview-05-20']);
  });

  it('fetches Vertex publisher models for Google Express keys instead of returning the short fallback', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        publisherModels: [
          {
            name: 'publishers/google/models/gemini-3.5-flash',
            displayName: 'Gemini 3.5 Flash',
            supportedActions: ['predict'],
            outputTokenLimit: 65536,
          },
          {
            name: 'publishers/google/models/gemini-3-flash-preview',
            displayName: 'Gemini 3 Flash Preview',
            supportedActions: ['predict'],
            outputTokenLimit: 65536,
          },
        ],
      }),
    });

    const models = await fetchModelsFromProvider('google', 'VertexExpressKeyWithEnoughLength1234567890');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('aiplatform.googleapis.com/v1beta1/publishers/google/models');
    expect(models.map((model) => model.id)).toEqual(['gemini-3.5-flash', 'gemini-3-flash-preview']);
  });

  it('uses the current documented Gemini fallback when a Vertex key cannot list models', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).includes('/v1beta1/publishers/google/models')) {
        return { ok: false, json: async () => ({ error: { message: 'catalog unavailable' } }) };
      }
      return { ok: true, json: async () => ({ totalTokens: 1 }) };
    });

    const models = await fetchModelsFromProvider('google', 'VertexExpressKeyWithEnoughLength1234567890');

    expect(models.map((model) => model.id).slice(0, 5)).toEqual([
      'gemini-3.1-pro-preview',
      'gemini-3.5-flash',
      'gemini-3-flash-preview',
      'gemini-3.1-flash-lite',
      'gemini-3.1-flash-lite-preview',
    ]);
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
});
