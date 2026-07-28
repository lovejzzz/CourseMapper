import fs from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { patchScionRuntime } from '../buildScionRuntime.mjs';

describe('Scion pinned wllama runtime patch', () => {
  it('makes split downloads positional, atomic, and explicit about browser storage exhaustion', async () => {
    const source = await fs.readFile(new URL('../../public/scion/runtime/v1/wllama.js', import.meta.url), 'utf8');
    const patched = patchScionRuntime(source);

    expect(patched).toContain('const destinationCapacity = Math.max(0, buffer.byteLength - destinationOffset);');
    expect(patched).toContain('destinationCapacity,\\n        backingCapacity');
    expect(patched).toContain('accessHandle.write(source, { at: writePosition })');
    expect(patched).toContain('signedCount === -8');
    expect(patched).toContain('browser storage is full while caching');
    expect(patched).toContain('await discardOpenFile();');
    expect(patched).toContain('await cacheDir.removeEntry(filename);');
    expect(patched).toContain('signal: refreshController.signal');
    expect(patched).toContain('await Promise.allSettled(promises);');
    expect(patched).toContain('Wllama action \\"${argAction}\\" failed before producing a valid response');
    expect(patched).toContain('outputLen > heapByteLength - outputHeapOffset');
    expect(patched).not.toContain('const outputBuffer = new Uint8Array(outputLen);\\n      const outputHeapOffset');
  });
});
