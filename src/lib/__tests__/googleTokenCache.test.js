import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cacheToken, clearTokenCache, getCachedToken, hasValidToken } from '../googleTokenCache.js';

describe('googleTokenCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-07T12:00:00Z'));
    clearTokenCache();
  });

  afterEach(() => {
    clearTokenCache();
    vi.useRealTimers();
  });

  it('returns cached tokens until the five-minute expiry buffer', () => {
    cacheToken('drive-token');

    expect(getCachedToken()).toBe('drive-token');
    expect(hasValidToken()).toBe(true);

    vi.advanceTimersByTime(54 * 60 * 1000);
    expect(getCachedToken()).toBe('drive-token');
    expect(hasValidToken()).toBe(true);

    vi.advanceTimersByTime(2 * 60 * 1000);
    expect(getCachedToken()).toBe('');
    expect(hasValidToken()).toBe(false);
  });

  it('clears cached token state', () => {
    cacheToken('drive-token');
    clearTokenCache();

    expect(getCachedToken()).toBe('');
    expect(hasValidToken()).toBe(false);
  });
});
