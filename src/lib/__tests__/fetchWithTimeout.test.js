import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithTimeout, isTimeoutError } from '../fetchWithTimeout';

function mockAbortableFetch() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((_resource, options = {}) => {
    return new Promise((_resolve, reject) => {
      const signal = options.signal;
      if (!signal) return;
      if (signal.aborted) {
        reject(signal.reason || Object.assign(new Error('Aborted'), { name: 'AbortError' }));
        return;
      }
      signal.addEventListener(
        'abort',
        () => {
          reject(signal.reason || Object.assign(new Error('Aborted'), { name: 'AbortError' }));
        },
        { once: true },
      );
    });
  });
}

describe('fetchWithTimeout', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('resolves normally when the provider responds before the timeout', async () => {
    const response = { ok: true };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);

    await expect(fetchWithTimeout('https://example.test/models', {}, 1000)).resolves.toBe(response);
    expect(fetchMock.mock.calls[0][1].signal).toBeTruthy();
  });

  it('rejects hung provider calls with a timeout error', async () => {
    vi.useFakeTimers();
    mockAbortableFetch();

    const request = fetchWithTimeout('https://example.test/models', {}, 500);
    const expectation = expect(request).rejects.toMatchObject({ name: 'TimeoutError', isTimeout: true });
    await vi.advanceTimersByTimeAsync(500);

    await expectation;
  });

  it('can identify timeout errors', () => {
    const error = new Error('Request timed out');
    error.name = 'TimeoutError';

    expect(isTimeoutError(error)).toBe(true);
    expect(isTimeoutError(new Error('Other failure'))).toBe(false);
  });
});
