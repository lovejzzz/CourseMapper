import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkGrammar } from '../grammarChecker';

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('checkGrammar', () => {
  it('returns empty matches for short text (<20 chars) without calling fetch', async () => {
    const result = await checkGrammar('Too short.');
    expect(result).toEqual({ matches: [] });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns empty matches for empty text without calling fetch', async () => {
    const result = await checkGrammar('');
    expect(result).toEqual({ matches: [] });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('calls LanguageTool API POST with correct URL and params', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ matches: [] }),
    });

    const text = 'This is a sufficiently long text for grammar checking purposes.';
    await checkGrammar(text, 'en-US');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.languagetool.org/v2/check');
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/x-www-form-urlencoded');

    // Verify body params
    const body = options.body;
    expect(body).toBeInstanceOf(URLSearchParams);
    expect(body.get('text')).toBe(text);
    expect(body.get('language')).toBe('en-US');
    expect(body.get('disabledRules')).toContain('WHITESPACE_RULE');
  });

  it('parses matches correctly (message, shortMessage, replacements, rule, category)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        matches: [
          {
            message: 'Use "their" instead of "there".',
            shortMessage: 'Wrong word',
            offset: 5,
            length: 5,
            context: { text: 'Over there house is big.' },
            replacements: [
              { value: 'their' },
              { value: "they're" },
            ],
            rule: { id: 'THEIR_THERE', category: { name: 'Commonly Confused Words' } },
          },
        ],
      }),
    });

    const result = await checkGrammar('Over there house is big and it needs some more words here.');
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].message).toBe('Use "their" instead of "there".');
    expect(result.matches[0].shortMessage).toBe('Wrong word');
    expect(result.matches[0].offset).toBe(5);
    expect(result.matches[0].length).toBe(5);
    expect(result.matches[0].context).toBe('Over there house is big.');
    expect(result.matches[0].replacements).toEqual(['their', "they're"]);
    expect(result.matches[0].rule).toBe('THEIR_THERE');
    expect(result.matches[0].category).toBe('Commonly Confused Words');
  });

  it('limits replacements to 3', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        matches: [
          {
            message: 'Possible alternatives',
            offset: 0,
            length: 4,
            replacements: [
              { value: 'a' },
              { value: 'b' },
              { value: 'c' },
              { value: 'd' },
              { value: 'e' },
            ],
            rule: { id: 'TEST_RULE', category: { name: 'Test' } },
          },
        ],
      }),
    });

    const result = await checkGrammar('test long enough text to pass the minimum threshold check here.');
    expect(result.matches[0].replacements).toHaveLength(3);
    expect(result.matches[0].replacements).toEqual(['a', 'b', 'c']);
  });

  it('truncates text to 10000 chars', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ matches: [] }),
    });

    const longText = 'x'.repeat(15000);
    await checkGrammar(longText);

    const body = mockFetch.mock.calls[0][1].body;
    expect(body.get('text').length).toBe(10000);
  });

  it('returns empty matches with error on API failure', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const result = await checkGrammar('This text is long enough to be checked by the grammar API.');
    expect(result.matches).toEqual([]);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('500');
  });

  it('rethrows AbortError', async () => {
    const abortErr = new DOMException('Aborted', 'AbortError');
    mockFetch.mockRejectedValueOnce(abortErr);

    await expect(
      checkGrammar('This text is long enough to be checked by the grammar API.')
    ).rejects.toThrow();
  });
});
