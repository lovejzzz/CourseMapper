import { describe, it, expect, vi } from 'vitest';
import { connectIdentity } from '../../src/lib/authoring/identityLink.js';
function harness() {
  let listener;
  const popup = { location: { replace: vi.fn() }, close: vi.fn() };
  const windowObject = {
    location: { origin: 'https://edutool.dev' },
    addEventListener: vi.fn((_kind, fn) => {
      listener = fn;
    }),
    removeEventListener: vi.fn(),
  };
  const api = vi.fn(async (path) =>
    path.endsWith('start')
      ? { authorizationUrl: 'https://identity.test/authorize', state: 'expected-state' }
      : { linked: true },
  );
  const dispatch = (changes = {}) =>
    listener({
      origin: windowObject.location.origin,
      source: popup,
      data: { type: 'coursemapper-identity-link', state: 'expected-state', code: 'code' },
      ...changes,
    });
  return { api, popup, windowObject, dispatch };
}
describe('account linking popup', () => {
  it('accepts only the expected popup, exact origin and matching state, then disposes listeners', async () => {
    const h = harness();
    const done = connectIdentity(h);
    await Promise.resolve();
    h.dispatch({ origin: 'https://attacker.test' });
    h.dispatch({ source: {} });
    h.dispatch({ data: { type: 'coursemapper-identity-link', state: 'wrong', code: 'code' } });
    expect(h.api).toHaveBeenCalledTimes(1);
    h.dispatch();
    expect(await done).toEqual({ linked: true });
    expect(h.api).toHaveBeenLastCalledWith('connection/finish', { state: 'expected-state', code: 'code' });
    expect(h.popup.close).toHaveBeenCalledOnce();
    expect(h.windowObject.removeEventListener).toHaveBeenCalledOnce();
  });
  it('reports cancellation without sending a code to the exchange', async () => {
    const h = harness();
    const done = connectIdentity(h);
    await Promise.resolve();
    h.dispatch({ data: { type: 'coursemapper-identity-link', state: 'expected-state', error: true } });
    await expect(done).rejects.toThrow('cancelled');
    expect(h.api).toHaveBeenCalledTimes(1);
    expect(h.popup.close).toHaveBeenCalledOnce();
  });
  it('times out and removes listeners', async () => {
    const h = harness();
    await expect(connectIdentity({ ...h, timeoutMs: 1 })).rejects.toThrow('expired');
    expect(h.windowObject.removeEventListener).toHaveBeenCalledOnce();
  });
  it('detects a manually closed popup and clears its timers', async () => {
    vi.useFakeTimers();
    try {
      const h = harness();
      h.popup.closed = true;
      const done = connectIdentity(h);
      const rejected = expect(done).rejects.toThrow('cancelled');
      await vi.advanceTimersByTimeAsync(1500);
      await rejected;
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
  it('fails clearly when popups are blocked', async () => {
    const h = harness();
    await expect(connectIdentity({ ...h, popup: null })).rejects.toThrow('Allow');
    expect(h.api).not.toHaveBeenCalled();
  });
});
