import { describe, expect, it } from 'vitest';

import { sha256HexSync } from '../sha256Sync.js';

describe('sha256HexSync', () => {
  it('matches standard SHA-256 vectors, including UTF-8 input', async () => {
    expect(sha256HexSync('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256HexSync('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    const text = 'Marie parle souvent français.';
    const native = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    const nativeHex = [...new Uint8Array(native)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    expect(sha256HexSync(text)).toBe(nativeHex);
  });
});
