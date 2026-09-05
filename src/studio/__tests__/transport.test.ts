import { afterEach, describe, expect, it, vi } from 'vitest';
import { serverInference } from '../scion';
const request = { system: 'Tutor', prompt: 'A task', seed: 71, maxTokens: 100, thinking: true };
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe('shared free service recovery', () => {
  it('respects short Retry-After, preserves the request, and records actual attempts', async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ error: 'Busy' }, { status: 429, headers: { 'Retry-After': '65' } }))
      .mockResolvedValueOnce(Response.json({ text: '{}', model: 'google/gemma-4-26b-a4b-it' }));
    vi.stubGlobal('fetch', fetch);
    const completion = serverInference('https://site.test/api').complete(request);
    await vi.advanceTimersByTimeAsync(65000);
    expect((await completion).transportAttempts).toBe(2);
    expect(fetch.mock.calls[0][1].body).toBe(fetch.mock.calls[1][1].body);
  });
  it('pauses for a daily quota instead of waiting indefinitely or switching models', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({ error: 'Daily allowance used' }, { status: 429, headers: { 'Retry-After': '7200' } }),
      );
    vi.stubGlobal('fetch', fetch);
    await expect(serverInference('https://site.test/api').complete(request)).rejects.toThrow('Daily allowance');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('lets pause cancel a retry immediately without starting another request', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const fetch = vi
      .fn()
      .mockResolvedValue(Response.json({ error: 'Busy' }, { status: 503, headers: { 'Retry-After': '30' } }));
    vi.stubGlobal('fetch', fetch);
    const completion = serverInference('https://site.test/api').complete(request, controller.signal);
    const rejection = expect(completion).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(1);
    controller.abort();
    await rejection;
    await vi.advanceTimersByTimeAsync(60000);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
