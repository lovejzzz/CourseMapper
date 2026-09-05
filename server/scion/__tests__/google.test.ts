import { afterEach, describe, expect, it, vi } from 'vitest';
import { completeGoogle, countGoogleTokens, googleRequest, HOSTED_GEMMA, type HostedGemma } from '../google';
const request = {
  system: 'Write a complete task.',
  prompt: 'Use this fictional material.',
  seed: 71,
  maxTokens: 4096,
  thinking: true,
  schema: { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'] },
};
afterEach(() => vi.unstubAllGlobals());
describe('free Gemma hosted transport', () => {
  it('allows a bounded retry for empty generation but does not retry a policy block', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ candidates: [{ finishReason: 'STOP' }] }))
      .mockResolvedValueOnce(Response.json({ candidates: [{ finishReason: 'MAX_TOKENS' }] }))
      .mockResolvedValueOnce(Response.json({ candidates: [{ finishReason: 'SAFETY' }] }));
    vi.stubGlobal('fetch', fetch);
    await expect(completeGoogle(request, 'secret')).rejects.toMatchObject({ status: 502, retryAfter: 30 });
    await expect(completeGoogle(request, 'secret')).rejects.toMatchObject({ status: 502, retryAfter: 30 });
    await expect(completeGoogle(request, 'secret')).rejects.toMatchObject({ status: 422, retryAfter: 0 });
  });
  it('counts the full generation request and fails closed on an unavailable or invalid count', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ totalTokens: 4231 }))
      .mockResolvedValueOnce(Response.json({ error: 'private provider detail' }, { status: 429 }))
      .mockResolvedValueOnce(Response.json({ totalTokens: -1 }));
    vi.stubGlobal('fetch', fetch);
    expect(await countGoogleTokens(request, 'secret')).toBe(4231);
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.generateContentRequest).toEqual({ model: `models/${HOSTED_GEMMA}`, ...googleRequest(request) });
    expect(body).not.toHaveProperty('contents');
    await expect(countGoogleTokens(request, 'secret')).rejects.toMatchObject({ status: 429, retryAfter: 60 });
    await expect(countGoogleTokens(request, 'secret')).rejects.toMatchObject({ status: 502 });
  });
  it('keeps reasoning enabled and the schema in the prompt without forcing its reasoning channel into JSON', () => {
    const body = googleRequest(request);
    expect(body.generationConfig.thinkingConfig.thinkingLevel).toBe('high');
    expect(body.generationConfig).not.toHaveProperty('responseJsonSchema');
    expect(body.systemInstruction.parts[0].text).toContain(JSON.stringify(request.schema));
    expect(body.systemInstruction.parts[0].text).toContain('exact schema');
    expect(body.contents[0].parts[0].text).toBe(request.prompt);
  });
  it('uses only the configured free model and preserves the returned model identity', async () => {
    const fetch = vi.fn<(url: string, options?: RequestInit) => Promise<Response>>().mockResolvedValue(
      Response.json({
        modelVersion: HOSTED_GEMMA,
        candidates: [
          {
            finishReason: 'STOP',
            content: {
              parts: [{ text: 'internal thought', thought: true }, { text: '{"answer":"A complete response."}' }],
            },
          },
        ],
        usageMetadata: { promptTokenCount: 22, candidatesTokenCount: 12, thoughtsTokenCount: 6 },
      }),
    );
    vi.stubGlobal('fetch', fetch);
    const result = await completeGoogle(request, 'server-secret');
    expect(result.model).toBe(`google/${HOSTED_GEMMA}`);
    expect(result.text).not.toContain('thought');
    expect(result.outputTokens).toBe(18);
    expect(JSON.stringify(result)).not.toContain('server-secret');
    expect(fetch.mock.calls[0][0]).toBe(
      `https://generativelanguage.googleapis.com/v1beta/models/${HOSTED_GEMMA}:streamGenerateContent?alt=sse`,
    );
    await expect(completeGoogle(request, 'server-secret', 'gemini-paid-model' as HostedGemma)).rejects.toThrow(
      'Only explicitly free',
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('does not retry a quota failure through a paid model or expose provider diagnostics', async () => {
    const fetch = vi.fn(async () =>
      Response.json({ error: { message: 'private server diagnostic' } }, { status: 429 }),
    );
    vi.stubGlobal('fetch', fetch);
    await expect(completeGoogle(request, 'secret')).rejects.toMatchObject({ status: 429, retryAfter: 60 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('assembles split UTF-8 SSE events, excludes thought parts and keeps cumulative usage without double counting', async () => {
    const events = [
      {
        modelVersion: HOSTED_GEMMA,
        candidates: [{ content: { parts: [{ text: 'hidden', thought: true }, { text: '{"答案":"' }] } }],
        usageMetadata: { promptTokenCount: 22, candidatesTokenCount: 4 },
      },
      {
        modelVersion: HOSTED_GEMMA,
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '完整"}' }] } }],
        usageMetadata: { promptTokenCount: 22, candidatesTokenCount: 12, thoughtsTokenCount: 6 },
      },
    ];
    const bytes = new TextEncoder().encode(events.map((event) => `data: ${JSON.stringify(event)}\r\n\r\n`).join(''));
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            new ReadableStream({
              start(controller) {
                for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7));
                controller.close();
              },
            }),
            { headers: { 'Content-Type': 'text/event-stream' } },
          ),
      ),
    );
    expect(await completeGoogle(request, 'secret')).toMatchObject({
      text: '{"答案":"完整"}',
      finishReason: 'stop',
      inputTokens: 22,
      outputTokens: 18,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(`data: ${JSON.stringify(events[0])}\n\n`, { headers: { 'Content-Type': 'text/event-stream' } }),
      ),
    );
    expect((await completeGoogle(request, 'secret')).finishReason).toBe('unknown');
  });
  it('rejects an unexpected model and preserves truncation rather than admitting it as a complete course part', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          modelVersion: 'unrelated-model',
          candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'text' }] } }],
        }),
      ),
    );
    await expect(completeGoogle(request, 'secret')).rejects.toThrow('identity');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          modelVersion: HOSTED_GEMMA,
          candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"partial":' }] } }],
        }),
      ),
    );
    expect((await completeGoogle(request, 'secret')).finishReason).toBe('length');
  });
});
