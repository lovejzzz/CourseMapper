import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSystemPrompt, streamChat } from '../useStreamProcessor';

function responseWithStream() {
  return {
    ok: true,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode('data: {"candidates":[{"content":{"parts":[{"text":"ok"}]}}]}\n\n'),
        );
        controller.close();
      },
    }),
    json: async () => ({}),
  };
}

describe('chat system prompt', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists DeepSeek with the other API-key providers', () => {
    const prompt = getSystemPrompt(null, null);

    expect(prompt).toContain('OpenAI');
    expect(prompt).toContain('Anthropic');
    expect(prompt).toContain('Google');
    expect(prompt).toContain('DeepSeek');
    expect(prompt).toContain('https://platform.deepseek.com/api_keys');
  });

  it('streams Google AI Studio chat through the Gemini endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(responseWithStream());

    await streamChat([{ role: 'user', content: 'Hi' }], 'System', null, 'AIza-test', 'google', 'gemini-2.5-flash');

    expect(fetchMock.mock.calls[0][0]).toContain('generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash');
  });

  it('streams Google Vertex chat through the Vertex endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(responseWithStream());

    await streamChat(
      [{ role: 'user', content: 'Hi' }],
      'System',
      null,
      'AQ.testVertexKeyForRoutingOnly0000000000000000000000',
      'google',
      'publishers/google/models/gemini-2.5-pro',
    );

    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toContain('aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.5-pro');
    expect(JSON.parse(request.body).systemInstruction.parts[0].text).toBe('System');
  });
});
