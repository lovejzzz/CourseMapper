import { describe, expect, it } from 'vitest';
import { sanitizeMessagesForPersistence, stripMessageSecrets } from '../messageSanitizer';

describe('stripMessageSecrets', () => {
  it('removes API keys and token fields recursively without mutating input', () => {
    const input = {
      role: 'imageSearch',
      apiKey: 'sk-secret',
      imageSearch: {
        query: 'neural networks',
        accessToken: 'access-secret',
        nested: { authorization: 'Bearer secret', safe: 'keep' },
      },
    };

    const result = stripMessageSecrets(input);

    expect(result).toEqual({
      role: 'imageSearch',
      imageSearch: {
        query: 'neural networks',
        nested: { safe: 'keep' },
      },
    });
    expect(input.apiKey).toBe('sk-secret');
    expect(input.imageSearch.accessToken).toBe('access-secret');
  });

  it('redacts key-like values in message strings', () => {
    const openAiKey = 'sk-proj-abcdefghijklmnopqrstuvwxyz1234567890';
    const bearerToken = 'Bearer abcdefghijklmnopqrstuvwxyz1234567890';

    const result = stripMessageSecrets({
      role: 'user',
      text: `Use ${openAiKey} only locally.`,
      nested: {
        content: `Authorization copied into chat: ${bearerToken}`,
      },
    });

    expect(result).toEqual({
      role: 'user',
      text: 'Use [redacted secret] only locally.',
      nested: {
        content: 'Authorization copied into chat: [redacted secret]',
      },
    });
  });
});

describe('sanitizeMessagesForPersistence', () => {
  it('returns sanitized message arrays', () => {
    const result = sanitizeMessagesForPersistence([
      { role: 'user', text: 'hello' },
      { role: 'imageSearch', api_key: 'sk-secret', imageSearch: { query: 'cells' } },
    ]);

    expect(result).toEqual([
      { role: 'user', text: 'hello' },
      { role: 'imageSearch', imageSearch: { query: 'cells' } },
    ]);
  });

  it('returns an empty array for invalid message collections', () => {
    expect(sanitizeMessagesForPersistence(null)).toEqual([]);
    expect(sanitizeMessagesForPersistence({ apiKey: 'sk-secret' })).toEqual([]);
  });

  it('redacts key-like text before persistence', () => {
    const result = sanitizeMessagesForPersistence([
      {
        role: 'user',
        text: 'I pasted sk-ant-abcdefghijklmnopqrstuvwxyz1234567890 into chat.',
      },
      {
        role: 'assistant',
        text: 'Do not save AIzaabcdefghijklmnopqrstuvwxyz1234567890.',
      },
    ]);

    expect(result).toEqual([
      {
        role: 'user',
        text: 'I pasted [redacted secret] into chat.',
      },
      {
        role: 'assistant',
        text: 'Do not save [redacted secret].',
      },
    ]);
  });
});
