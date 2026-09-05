/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { getSecure, removeSecure, setSecure } from '../secureStorage.js';

function createStorage() {
  const values = new Map();
  return {
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  };
}

describe('tab-scoped credential storage', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: createStorage() });
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: createStorage() });
  });

  it('stores credentials in sessionStorage, never localStorage', () => {
    setSecure('api-key', 'secret');

    expect(sessionStorage.getItem('api-key')).toBe('secret');
    expect(localStorage.getItem('api-key')).toBeNull();
    expect(getSecure('api-key')).toBe('secret');
  });

  it('migrates an old obfuscated localStorage value once', () => {
    const key = 'CM$ecur3';
    const encoded = Array.from('legacy-secret', (char, index) =>
      String.fromCharCode(char.charCodeAt(0) ^ key.charCodeAt(index % key.length)),
    ).join('');
    localStorage.setItem('api-key', `obf:${btoa(encoded)}`);

    expect(getSecure('api-key')).toBe('legacy-secret');
    expect(sessionStorage.getItem('api-key')).toBe('legacy-secret');
    expect(localStorage.getItem('api-key')).toBeNull();
  });

  it('removes current and legacy credential copies', () => {
    sessionStorage.setItem('api-key', 'session-secret');
    localStorage.setItem('api-key', 'legacy-secret');

    removeSecure('api-key');

    expect(sessionStorage.getItem('api-key')).toBeNull();
    expect(localStorage.getItem('api-key')).toBeNull();
  });
});
