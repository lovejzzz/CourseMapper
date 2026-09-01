// API credentials are intentionally scoped to the current browser tab.
// sessionStorage survives a reload but is discarded when the tab closes.

const OBFUSCATION_PREFIX = 'obf:';
const LEGACY_XOR_KEY = 'CM$ecur3';
const memoryFallback = new Map();

function decodeLegacy(stored) {
  if (!stored?.startsWith(OBFUSCATION_PREFIX)) return stored;
  try {
    const encoded = atob(stored.slice(OBFUSCATION_PREFIX.length));
    let decoded = '';
    for (let i = 0; i < encoded.length; i += 1) {
      decoded += String.fromCharCode(encoded.charCodeAt(i) ^ LEGACY_XOR_KEY.charCodeAt(i % LEGACY_XOR_KEY.length));
    }
    return decoded;
  } catch {
    return '';
  }
}

function readSession(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return memoryFallback.get(key) ?? null;
  }
}

/** Store a credential for this browser tab only. */
export function setSecure(key, value) {
  const normalized = String(value ?? '');
  try {
    sessionStorage.setItem(key, normalized);
  } catch {
    memoryFallback.set(key, normalized);
  }
  try {
    localStorage.removeItem(key);
  } catch {}
}

/**
 * Retrieve a tab-scoped credential. Existing localStorage credentials are
 * migrated once into sessionStorage and then removed from persistent storage.
 */
export function getSecure(key) {
  const current = readSession(key);
  if (current != null) return current;

  try {
    const legacy = localStorage.getItem(key);
    if (legacy == null) return null;
    const migrated = decodeLegacy(legacy);
    localStorage.removeItem(key);
    if (migrated) setSecure(key, migrated);
    return migrated;
  } catch {
    return null;
  }
}

/** Remove both current-session and obsolete persistent copies. */
export function removeSecure(key) {
  memoryFallback.delete(key);
  try {
    sessionStorage.removeItem(key);
  } catch {}
  try {
    localStorage.removeItem(key);
  } catch {}
}
