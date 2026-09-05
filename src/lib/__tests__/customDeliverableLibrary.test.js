import { afterEach, describe, expect, it, vi } from 'vitest';
import { autoFillCustomDeliverable } from '../customDeliverableLibrary';

const customConfig = {
  description: 'A custom student-facing reflection deliverable.',
  tone: 'Professional',
  style: 'Bullet points',
  length: 'Standard',
  iconLabel: 'Document',
  color: 'indigo',
  systemPrompt: 'Act as an instructional designer and return classroom-ready JSON.',
  userPromptTemplate: 'Generate one item per lesson from {{courseMap}}.',
};

describe('autoFillCustomDeliverable', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('routes Google Vertex-style keys through the Vertex generate endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify(customConfig) }] } }],
      }),
    });

    const result = await autoFillCustomDeliverable('Field Notes', {
      provider: 'google',
      apiKey: 'AQ.testVertexKeyForRoutingOnly0000000000000000000000',
      modelId: 'publishers/google/models/gemini-2.5-pro',
    });

    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toContain('aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.5-pro');
    expect(JSON.parse(request.body).systemInstruction.parts[0].text).toContain('instructional designer');
    expect(result.description).toBe(customConfig.description);
  });

  it('supports DeepSeek for custom deliverable auto-fill', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(customConfig) } }],
      }),
    });

    const result = await autoFillCustomDeliverable('Field Notes', {
      provider: 'deepseek',
      apiKey: 'test-key',
      modelId: 'deepseek-chat',
    });

    const [url, request] = fetchMock.mock.calls[0];
    const body = JSON.parse(request.body);
    expect(url).toBe('https://api.deepseek.com/v1/chat/completions');
    expect(body.max_tokens).toBe(1500);
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(result.color).toBe(customConfig.color);
  });
});
