import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildResearchProvider } from '../algiComposer.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('Algi bounded research provider', () => {
  it('keeps the timeout armed while the response body is being consumed', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      // Some fetch runtimes do not reject a body reader after headers have
      // arrived even when the originating signal is aborted.
      json: () => new Promise(() => {}),
    }));
    const provider = buildResearchProvider({
      enabled: true,
      gapMs: 0,
      timeoutMs: 25,
      maxRequests: 1,
      fetchImpl,
    });

    const request = provider.httpJson('https://sources.example.test/slow-body');
    const rejection = expect(request).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(30);

    await rejection;
    expect(provider.diagnostics().requestCount).toBe(1);
  });

  it('opens a per-origin circuit after repeated 429s instead of spending the course budget on every later query', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 429,
      headers: { get: () => '1' },
    }));
    const provider = buildResearchProvider({
      enabled: true,
      gapMs: 0,
      timeoutMs: 10_000,
      maxRequests: 20,
      fetchImpl,
    });

    const first = provider.httpJson('https://limited.example.test/first');
    const firstRejection = expect(first).rejects.toThrow('research-http-429');
    await vi.advanceTimersByTimeAsync(5_000);
    await firstRejection;

    await expect(provider.httpJson('https://limited.example.test/second')).rejects.toMatchObject({
      code: 'RESEARCH_ORIGIN_RATE_LIMITED',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(provider.diagnostics()).toMatchObject({
      requestCount: 3,
      rateLimitedOrigins: [{ origin: 'https://limited.example.test' }],
    });
  });
});
