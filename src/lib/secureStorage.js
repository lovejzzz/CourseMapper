// src/lib/secureStorage.js — obfuscated localStorage wrapper for sensitive values
// NOT real encryption — just prevents casual plaintext exposure in DevTools.

const OBFUSCATION_PREFIX = 'obf:';

// Simple XOR cipher with a fixed key, then base64-encode the result.
const XOR_KEY = 'CM$ecur3';

function xorCipher(input) {
  const keyLen = XOR_KEY.length;
  let out = '';
  for (let i = 0; i < input.length; i++) {
    out += String.fromCharCode(input.charCodeAt(i) ^ XOR_KEY.charCodeAt(i % keyLen));
  }
  return out;
}

function encode(value) {
  const xored = xorCipher(value);
  return OBFUSCATION_PREFIX + btoa(xored);
}

function decode(stored) {
  const b64 = stored.slice(OBFUSCATION_PREFIX.length);
  const xored = atob(b64);
  return xorCipher(xored); // XOR is its own inverse
}

/**
 * Store a value in localStorage with obfuscation.
 */
export function setSecure(key, value) {
  localStorage.setItem(key, encode(value));
}

/**
 * Retrieve a value from localStorage, de-obfuscating if needed.
 * Falls back gracefully for old plaintext values (backwards compat).
 */
export function getSecure(key) {
  const raw = localStorage.getItem(key);
  if (raw == null) return raw;

  if (raw.startsWith(OBFUSCATION_PREFIX)) {
    try {
      return decode(raw);
    } catch {
      // Corrupted — return empty string rather than crash
      return '';
    }
  }

  // Old plaintext value — return as-is (will be re-stored obfuscated on next save)
  return raw;
}

/**
 * Remove a value from localStorage.
 */
export function removeSecure(key) {
  localStorage.removeItem(key);
}
