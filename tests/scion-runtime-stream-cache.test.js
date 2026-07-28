import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import vm from 'node:vm';

import { describe, expect, it } from 'vitest';

import { patchScionRuntime } from '../scripts/buildScionRuntime.mjs';
import { SCION_BROWSER_GEMMA4_GGUF, SCION_BROWSER_GEMMA4_GGUF_URL } from '../src/lib/scionBrowserConstants.js';

const sourcePath = new URL('../public/scion/runtime/v1/wllama.js', import.meta.url);

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function extractLlamaWorkerCode(runtimeSource) {
  const prefix = 'var LLAMA_CPP_WORKER_CODE = ';
  const suffix = ';\nvar OPFS_UTILS_WORKER_CODE = ';
  const start = runtimeSource.indexOf(prefix);
  const end = runtimeSource.indexOf(suffix, start);
  if (start < 0 || end < 0) throw new Error('Unable to locate the generated llama worker.');
  return JSON.parse(runtimeSource.slice(start + prefix.length, end));
}

describe('Scion browser runtime stream cache', () => {
  it('pins a browser-safe shard manifest for the unchanged public Gemma 4 artifact', () => {
    const { browserDelivery, runtimeArtifact } = SCION_BROWSER_GEMMA4_GGUF;

    expect(browserDelivery.shards).toHaveLength(5);
    expect(browserDelivery.shards.reduce((total, shard) => total + shard.bytes, 0)).toBe(browserDelivery.bytes);
    expect(Math.max(...browserDelivery.shards.map((shard) => shard.bytes))).toBeLessThan(2_000_000_000);
    expect(browserDelivery.sourceArtifactSha256).toBe(runtimeArtifact.sha256);
    expect(SCION_BROWSER_GEMMA4_GGUF_URL).toBe(
      `https://huggingface.co/${browserDelivery.modelId}/resolve/${browserDelivery.revision}/${browserDelivery.entryFile}`,
    );
  });

  it('appends remote chunks at an explicit cursor and verifies the persisted file length', async () => {
    const source = await fs.readFile(sourcePath, 'utf8');
    const patched = patchScionRuntime(source);

    expect(patched).toContain('let writePosition = 0;');
    expect(patched).toContain('Number(accessHandle.write(source, { at: writePosition }))');
    expect(patched).toContain('signedCount !== source.byteLength');
    expect(patched).toContain('signedCount === -8');
    expect(patched).toContain('writePosition += source.byteLength;');
    expect(patched).toContain('if (persistedSize !== writePosition)');
    expect(patched).not.toContain('async function writeFile(buf) {\\n  accessHandle.write(buf);\\n}');
    expect(sha256(patched)).toBe(SCION_BROWSER_GEMMA4_GGUF.runtime.moduleSha256);
  });

  it('streams large OPFS reads through browser-safe destination views', async () => {
    const source = await fs.readFile(sourcePath, 'utf8');
    const patched = patchScionRuntime(source);

    expect(patched).toContain('const OPFS_READ_CHUNK_BYTES = 64 * 1024 * 1024;');
    expect(patched).toContain('const destinationCapacity = Math.max(0, buffer.byteLength - destinationOffset);');
    expect(patched).toContain('buffer.buffer.byteLength - buffer.byteOffset - destinationOffset');
    expect(patched).toContain('destinationCapacity,\\n        backingCapacity');
    expect(patched).toContain('const chunkSize = Math.min(OPFS_READ_CHUNK_BYTES, toRead - totalRead);');
    expect(patched).toContain('buffer.byteOffset + destinationOffset + totalRead');
    expect(patched).toContain('Number(syncHandle.read(view, { at: Number(position) + totalRead }))');
    expect(patched).toContain('if (count === 0) break;');
    expect(patched).toContain('totalRead += count;');
    expect(patched).toContain('Wllama action \\"${argAction}\\" failed before producing a valid response');
    expect(patched).toContain('outputLen > heapByteLength - outputHeapOffset');
    expect(patched).not.toContain(
      'const view = new Uint8Array(\\n        buffer.buffer,\\n        buffer.byteOffset + destinationOffset,\\n        toRead',
    );
    expect(patched).not.toContain('const toRead = Math.min(length, size - position);');
  });

  it('splits a read larger than one chunk without skipping destination or file bytes', async () => {
    const source = await fs.readFile(sourcePath, 'utf8');
    const workerCode = extractLlamaWorkerCode(patchScionRuntime(source));
    const context = vm.createContext({ console, postMessage: () => {} });
    vm.runInContext(
      `${workerCode}
globalThis.installOpfsReadTest = (module, handles) => {
  Module = module;
  Object.assign(opfsHandles, handles);
  patchMEMFS();
};`,
      context,
    );

    const streamOps = {
      read: () => 0,
      write: () => 0,
      llseek: () => 0,
      allocate: () => {},
      mmap: () => ({ ptr: 0, allocated: false }),
      msync: () => 0,
    };
    const module = {
      MEMFS: {
        stream_ops: streamOps,
        ops_table: { file: { stream: {} } },
      },
      FS: {
        mkdir: () => {},
        mount: () => {},
      },
      HEAPU8: new Uint8Array(0),
    };
    const calls = [];
    const chunkBytes = 64 * 1024 * 1024;
    const totalBytes = chunkBytes + 257;
    context.installOpfsReadTest(module, {
      'model.gguf': {
        size: totalBytes,
        syncHandle: {
          read(view, { at }) {
            calls.push({ at, bytes: view.byteLength });
            return view.byteLength;
          },
        },
      },
    });

    const bytesRead = module.MEMFS.stream_ops.read(
      { node: { name: 'model.gguf' } },
      new Uint8Array(totalBytes),
      0,
      totalBytes,
      0,
    );

    expect(bytesRead).toBe(totalBytes);
    expect(calls).toEqual([
      { at: 0, bytes: chunkBytes },
      { at: chunkBytes, bytes: 257 },
    ]);
  });
});
