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
    const admit = (visitor: string) =>
      quota.fetch(new Request('https://quota.internal/admit', { method: 'POST', body: visitor }));
    expect((await admit('one')).status).toBe(200);
    expect((await admit('one')).status).toBe(200);
    expect((await admit('one')).status).toBe(429);
    const concurrent = await Promise.all(['two', 'three', 'four', 'five', 'six'].map(admit));
    expect(concurrent.filter((r) => r.status === 200)).toHaveLength(4);
    expect(concurrent.filter((r) => r.status === 429)).toHaveLength(1);
    const tokens = (count: number) =>
      quota.fetch(
        new Request('https://quota.internal/tokens', {
          method: 'POST',
          body: JSON.stringify({ tokens: count }),
        }),
      );
    vi.setSystemTime(new Date('2026-09-05T12:00:59Z'));
    expect((await tokens(9000)).status).toBe(200);
    vi.setSystemTime(new Date('2026-09-05T12:01:01Z'));
    const overflow = await tokens(6000);
    expect(overflow.status).toBe(429);
    expect(await overflow.json()).toEqual({ retryAfter: 63 });
    const tokenRace = await Promise.all([tokens(3000), tokens(3000)]);
    expect(tokenRace.filter((r) => r.ok)).toHaveLength(1);
    expect((await tokens(14000)).status).toBe(413);
    expect((await tokens(-1)).status).toBe(413);
    vi.setSystemTime(new Date('2026-09-05T12:02:04Z'));
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
