/**
 * fileProviders.js — browser-safe FileProvider implementations (v0.14.3 A1).
 *
 * The deep quality grader reads packages through the FileProvider seam:
 *   { list(): relative forward-slashed paths,
 *     readBinary(path) → Uint8Array (may be async),
 *     readText(path) → string (may be async) }.
 *
 * This module holds the BROWSER side: createMemoryFileProvider over the
 * in-memory file map packageZipExporter assembles before zipping (path →
 * string | Uint8Array | ArrayBuffer | Blob). The Node side
 * (createFsFileProvider) lives in fsFileProvider.node.js, imported ONLY by
 * the tests/lib shim / Crucible path so no node:fs is reachable from the
 * browser entry.
 */

async function toUint8Array(value, path) {
  if (value == null) throw new Error(`memory file provider: no content for "${path}"`);
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (typeof value === 'string') return new TextEncoder().encode(value);
  if (typeof value.arrayBuffer === 'function') return new Uint8Array(await value.arrayBuffer());
  throw new Error(`memory file provider: unsupported content type for "${path}"`);
}

export function createMemoryFileProvider(fileMap = {}) {
  const entries = fileMap instanceof Map ? new Map(fileMap) : new Map(Object.entries(fileMap));
  return {
    list: () => [...entries.keys()],
    readBinary: async (path) => toUint8Array(entries.get(path), path),
    readText: async (path) => {
      const value = entries.get(path);
      if (value == null) throw new Error(`memory file provider: no content for "${path}"`);
      if (typeof value === 'string') return value;
      return new TextDecoder().decode(await toUint8Array(value, path));
    },
  };
}
