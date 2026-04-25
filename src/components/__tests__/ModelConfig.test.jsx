import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkCredits } from '../ModelConfig';

describe('checkCredits', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('validates OpenAI GPT-5-class models with max_completion_tokens', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    const ok = await checkCredits('openai', 'test-key', 'gpt-5.4-mini');

    expect(ok).toBe(true);
    const [, request] = fetchMock.mock.calls[0];
    const body = JSON.parse(request.body);
    expect(body.max_completion_tokens).toBe(16);
    expect(body.max_tokens).toBeUndefined();
  });

  it('keeps DeepSeek validation on max_tokens', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    const ok = await checkCredits('deepseek', 'test-key', 'deepseek-chat');

    expect(ok).toBe(true);
    const [, request] = fetchMock.mock.calls[0];
    const body = JSON.parse(request.body);
    expect(body.max_tokens).toBe(1);
    expect(body.max_completion_tokens).toBeUndefined();
  });
});
