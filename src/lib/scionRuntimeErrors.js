const NON_FALLBACK_SCION_RUNTIME_CODES = /^(?:SCION_WLLAMA_|SCION_LOCAL_RUNTIME_API$)/;

/**
 * A browser-runtime boundary failure cannot be repaired by asking the same
 * on-device model for a second output shape. Preserve it through native
 * authoring so the UI offers one deliberate retry instead of silently
 * starting another multi-gigabyte model download.
 */
export function isNonFallbackScionRuntimeError(error) {
  const visited = new Set();
  let current = error;
  while (current && !visited.has(current)) {
    visited.add(current);
    if (NON_FALLBACK_SCION_RUNTIME_CODES.test(String(current.code || ''))) return true;
    current = current.cause;
  }
  return false;
}
