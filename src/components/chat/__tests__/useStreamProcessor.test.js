import { describe, expect, it } from 'vitest';
import { getSystemPrompt } from '../useStreamProcessor';

describe('chat system prompt', () => {
  it('lists DeepSeek with the other API-key providers', () => {
    const prompt = getSystemPrompt(null, null);

    expect(prompt).toContain('OpenAI');
    expect(prompt).toContain('Anthropic');
    expect(prompt).toContain('Google');
    expect(prompt).toContain('DeepSeek');
    expect(prompt).toContain('https://platform.deepseek.com/api_keys');
  });
});
