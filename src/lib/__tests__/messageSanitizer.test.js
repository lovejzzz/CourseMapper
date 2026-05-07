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
});
