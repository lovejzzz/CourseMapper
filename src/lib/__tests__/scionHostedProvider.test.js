/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestHostedScion, runScionHostedCompletion } from '../scionHostedProvider';
import { readScionHostedConsent, saveScionHostedConsent, SCION_HOSTED_BACKING_MODEL } from '../scionHostedPolicy';

// Keep the dormant transport's contracts covered for an explicit relaunch.
// scionLocalOnly.test.js exercises the actual paused production policy.
vi.mock('../scionHostedPolicy', async (importOriginal) => ({
  ...(await importOriginal()),
  SCION_HOSTED_ENABLED: true,
}));

const receipt = (text = '{"answerIndex":2}') => ({
  text,
  model: SCION_HOSTED_BACKING_MODEL,
  route: 'server',
  finishReason: 'stop',
  inputTokens: 200,
  outputTokens: 30,
});
const options = {
  task: 'scionPass',
  userPrompt: 'Check the answer.',
  schema: {
    type: 'object',
    required: ['answerIndex'],
    properties: { answerIndex: { type: 'integer', minimum: 0, maximum: 3 } },
  },
  maxRetries: 0,
};

beforeEach(() => {
  const values = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('explicit hosted Scion boundary', () => {
  it('requires current browser permission before any network request', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(readScionHostedConsent()).toBe(false);
    await expect(runScionHostedCompletion(options)).rejects.toMatchObject({ code: 'SCION_HOSTED_CONSENT' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uses the production schema gate and reports the actual hosted identity and token usage', async () => {
    saveScionHostedConsent(true);
    const fetch = vi.fn(async () => Response.json(receipt()));
    vi.stubGlobal('fetch', fetch);
    const onAdapterRoute = vi.fn();
    const result = await runScionHostedCompletion({ ...options, onAdapterRoute });
    expect(result).toMatchObject({
      fullText: '{"answerIndex":2}',
      modelRequests: 1,
      inputTokens: 200,
      outputTokens: 30,
      finishReason: 'stop',
    });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ thinking: true, temperature: 1, maxTokens: 2400 });
    expect(JSON.parse(fetch.mock.calls[0][1].body).system).toContain(JSON.stringify(options.schema));
    expect(onAdapterRoute).toHaveBeenCalledWith(
      expect.objectContaining({ nativeAdapterActive: false, reason: 'hosted-free-base' }),
    );
  });

  it('rejects a syntactically valid but schema-invalid hosted answer', async () => {
    saveScionHostedConsent(true);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(receipt('{"answerIndex":9}'))),
    );
    await expect(runScionHostedCompletion(options)).rejects.toMatchObject({
      code: 'SCION_LOCAL_INCOMPLETE',
      admissionIssues: expect.arrayContaining([expect.stringContaining('response-contract')]),
    });
  });

  it('aborts in-flight data sharing when permission is revoked and releases the queue', async () => {
    saveScionHostedConsent(true);
    let entered;
    const started = new Promise((resolve) => {
      entered = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, request) =>
          new Promise((_resolve, reject) => {
            request.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
              once: true,
            });
            entered();
          }),
      ),
    );
    const active = runScionHostedCompletion(options);
    const rejection = expect(active).rejects.toMatchObject({ name: 'AbortError' });
    await started;
    saveScionHostedConsent(false);
    await rejection;
    saveScionHostedConsent(true);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(receipt())),
    );
    expect((await runScionHostedCompletion(options)).finishReason).toBe('stop');
  });

  it('retries only bounded transient allowance errors, never a daily limit or a paid fallback', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ scope: 'input-minute' }, { status: 429, headers: { 'Retry-After': '2' } }))
      .mockResolvedValueOnce(Response.json(receipt()));
    const sleep = vi.fn(async () => {});
    expect((await requestHostedScion({}, { fetchImpl, sleep })).transportAttempts).toBe(2);
    expect(sleep).toHaveBeenCalledWith(2000, undefined);
    const daily = vi.fn(async () =>
      Response.json(
        { scope: 'shared-day', error: 'Daily allowance used.' },
        { status: 429, headers: { 'Retry-After': '30' } },
      ),
    );
    await expect(requestHostedScion({}, { fetchImpl: daily, sleep })).rejects.toMatchObject({
      code: 'SCION_HOSTED_ALLOWANCE',
      scope: 'shared-day',
      retryable: false,
    });
    expect(daily).toHaveBeenCalledTimes(1);
  });

  it('rejects a substituted model identity even when its answer looks valid', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ ...receipt(), model: 'google/gemini-paid' }));
    await expect(requestHostedScion({}, { fetchImpl })).rejects.toMatchObject({ code: 'SCION_HOSTED_IDENTITY' });
  });
});
