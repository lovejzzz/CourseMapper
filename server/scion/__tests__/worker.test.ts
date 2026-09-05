import { afterEach, describe, it, expect, vi } from 'vitest';
import type { DurableObjectState } from '@cloudflare/workers-types';
import worker, { ScionQuota } from '../worker';
type Env = Parameters<typeof worker.fetch>[1];
const env = {
  GOOGLE_AI_KEY: 'synthetic-test-key',
  ALLOWED_ORIGIN: 'https://edutool.dev',
  DAILY_REQUESTS: '20',
  MINUTE_REQUESTS: '6',
  VISITOR_DAILY_REQUESTS: '2',
} as Env;
const request = (method = 'POST', country = 'US', origin = 'https://edutool.dev', body = '{}') =>
  Object.assign(
    new Request('https://worker.test/api/scion/complete', {
      method,
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      ...(method === 'POST' ? { body } : {}),
    }),
    { cf: { country } },
  );
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('public gateway admission', () => {
  it('health checks the same quota as completion without reserving a call or contacting Google when exhausted', async () => {
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);
    const quotaFetch = vi
      .fn()
      .mockImplementation(async () => Response.json({ scope: 'visitor-day', retryAfter: 3600 }, { status: 429 }));
    const testEnv = {
      ...env,
      SCION_QUOTA: { idFromName: () => 'quota', get: () => ({ fetch: quotaFetch }) },
    } as unknown as Env;
    const health = Object.assign(
      new Request('https://worker.test/api/scion/health', { headers: { Origin: 'https://edutool.dev' } }),
      { cf: { country: 'US' } },
    );
    const status = await worker.fetch(health, testEnv);
    expect(status.status).toBe(429);
    expect(await status.json()).toMatchObject({ ready: false, scope: 'visitor-day' });
    expect(status.headers.get('Retry-After')).toBe('3600');
    const completion = await worker.fetch(
      request(
        'POST',
        'US',
        'https://edutool.dev',
        JSON.stringify({ system: 'Return JSON', prompt: 'What is 16/20?', seed: 1, maxTokens: 64, thinking: false }),
      ),
      testEnv,
    );
    expect(completion.status).toBe(429);
    expect(quotaFetch.mock.calls[0][1].body).toBe(quotaFetch.mock.calls[1][1].body);
    expect(quotaFetch.mock.calls.every(([url]) => url.endsWith('/check'))).toBe(true);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('rejects a different origin, unavailable region, malformed input and paid model configuration before contacting Google', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect((await worker.fetch(request('POST', 'US', 'https://unrelated.test'), env)).status).toBe(403);
    expect((await worker.fetch(request('POST', 'GB'), env)).status).toBe(451);
    expect((await worker.fetch(request(), env)).status).toBe(400);
    expect((await worker.fetch(request('POST', 'US', 'https://edutool.dev', '{broken'), env)).status).toBe(400);
    expect((await worker.fetch(request(), { ...env, HOSTED_MODEL: 'gemini-paid' })).status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('bounds untrusted request bytes without sending the credential upstream', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const response = await worker.fetch(request('POST', 'US', 'https://edutool.dev', 'a'.repeat(150001)), env);
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain(env.GOOGLE_AI_KEY);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('shared free allowance', () => {
  it('enforces visitor and global minute limits atomically and expires only old counters', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-05T12:00:00Z'));
    const records = new Map<string, unknown>();
    let alarm: number | null = null;
    let serial = Promise.resolve();
    const tx = {
      get: async (key: string) => records.get(key),
      put: async (key: string, value: unknown) => {
        records.set(key, value);
      },
      list: async () => new Map(records),
      delete: async (keys: string[]) => {
        keys.forEach((key) => records.delete(key));
      },
      getAlarm: async () => alarm,
      setAlarm: async (time: number) => {
        alarm = time;
      },
    };
    const state = {
      storage: {
        transaction: (action: (transaction: typeof tx) => Promise<unknown>) => {
          const next = serial.then(() => action(tx));
          serial = next.then(() => undefined);
          return next;
        },
      },
    } as unknown as DurableObjectState;
    const quota = new ScionQuota(state, env);
    const admit = (visitor: string, tokens = 100) =>
      quota.fetch(
        new Request('https://quota.internal/reserve', { method: 'POST', body: JSON.stringify({ visitor, tokens }) }),
      );
    const check = () =>
      quota.fetch(
        new Request('https://quota.internal/check', { method: 'POST', body: JSON.stringify({ visitor: 'one' }) }),
      );
    expect((await check()).status).toBe(200);
    expect(records.size).toBe(0);
    expect((await admit('one')).status).toBe(200);
    expect((await admit('one')).status).toBe(200);
    const visitorDenied = await admit('one');
    expect(visitorDenied.status).toBe(429);
    expect(await visitorDenied.json()).toMatchObject({ scope: 'visitor-day' });
    const concurrent = await Promise.all(['two', 'three', 'four', 'five', 'six'].map((visitor) => admit(visitor)));
    expect(concurrent.filter((r) => r.status === 200)).toHaveLength(4);
    expect(concurrent.filter((r) => r.status === 429)).toHaveLength(1);
    const tokens = (count: number) => admit('token-visitor-' + Math.random(), count);
    vi.setSystemTime(new Date('2026-09-05T12:01:59Z'));
    expect((await tokens(9000)).status).toBe(200);
    vi.setSystemTime(new Date('2026-09-05T12:02:01Z'));
    const beforeDenial = JSON.stringify([...records]);
    const overflow = await tokens(6000);
    expect(overflow.status).toBe(429);
    expect(await overflow.json()).toEqual({ scope: 'input-minute', retryAfter: 63 });
    expect(JSON.stringify([...records])).toBe(beforeDenial);
    const tokenRace = await Promise.all([tokens(3000), tokens(3000)]);
    expect(tokenRace.filter((r) => r.ok)).toHaveLength(1);
    expect(records.get('day')).toMatchObject({ count: 8 });
    expect((await tokens(14000)).status).toBe(413);
    expect((await tokens(-1)).status).toBe(413);
    expect(records.get('day')).toMatchObject({ count: 8 });
    vi.setSystemTime(new Date('2026-09-05T12:03:04Z'));
    expect((await tokens(9000)).status).toBe(200);
    expect(records.get('tokens')).toMatchObject({ count: 12128 });
    vi.setSystemTime(new Date('2026-09-06T00:00:01Z'));
    await admit('new-day');
    await quota.alarm();
    expect(records.has('visitor:one')).toBe(false);
    expect(records.has('visitor:new-day')).toBe(true);
    expect(records.get('day')).toMatchObject({ count: 1 });
  });
});
