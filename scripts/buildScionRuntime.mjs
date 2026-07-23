#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const sourcePath = path.join(repoRoot, 'public/scion/runtime/v1/wllama.js');
const outputPath = path.join(repoRoot, 'public/scion/runtime/v2/wllama.js');
const expectedSourceSha256 = 'ca1b99d084b649a89400d8a839f3e772a46d1f65f145b80d9aa49bc43ddbc41a';

const patches = [
  {
    name: 'track the active OPFS file and write cursor',
    before: 'let accessHandle;\\nlet abortController = new AbortController();',
    after: [
      'let accessHandle;',
      'let activeFileName = null;',
      'let activeCacheDir = null;',
      'let writePosition = 0;',
      'let abortController = new AbortController();',
    ].join('\\n'),
  },
  {
    name: 'retain the active OPFS cache directory and filename',
    before: [
      "  const cacheDir = await opfsRoot.getDirectoryHandle('cache', { create: true });",
      '  const fileHandler = await cacheDir.getFileHandle(filename, { create: true });',
    ].join('\\n'),
    after: [
      "  activeCacheDir = await opfsRoot.getDirectoryHandle('cache', { create: true });",
      '  const fileHandler = await activeCacheDir.getFileHandle(filename, { create: true });',
      '  activeFileName = filename;',
    ].join('\\n'),
  },
  {
    name: 'reset the cursor when a file opens',
    before:
      '  accessHandle = await fileHandler.createSyncAccessHandle();\\n  accessHandle.truncate(0); // clear file content',
    after:
      '  accessHandle = await fileHandler.createSyncAccessHandle();\\n  accessHandle.truncate(0); // clear file content\\n  writePosition = 0;',
  },
  {
    name: 'append every streamed chunk and reject short writes',
    before: 'async function writeFile(buf) {\\n  accessHandle.write(buf);\\n}',
    after: [
      'async function writeFile(buf) {',
      '  const source = buf instanceof Uint8Array ? buf : new Uint8Array(buf);',
      '  const count = Number(accessHandle.write(source, { at: writePosition }));',
      '  const signedCount = count > 0x7fffffff ? count - 0x100000000 : count;',
      '  if (signedCount === -8) {',
      '    throw new Error(',
      '      `OPFS Worker: browser storage is full while caching ${activeFileName} at byte ${writePosition}`',
      '    );',
      '  }',
      '  if (!Number.isFinite(count) || signedCount !== source.byteLength) {',
      '    throw new Error(',
      '      `OPFS Worker: wrote ${signedCount} of ${source.byteLength} requested bytes for ${activeFileName}`',
      '    );',
      '  }',
      '  writePosition += source.byteLength;',
      '  return count;',
      '}',
    ].join('\\n'),
  },
  {
    name: 'verify persisted bytes before closing',
    before: 'async function closeFile() {\\n  accessHandle.flush();\\n  accessHandle.close();\\n}',
    after: [
      'async function closeFile() {',
      '  accessHandle.flush();',
      '  const persistedSize = accessHandle.getSize();',
      '  if (persistedSize !== writePosition) {',
      '    throw new Error(',
      '      `OPFS Worker: cached ${persistedSize} bytes but expected ${writePosition}`',
      '    );',
      '  }',
      '  accessHandle.close();',
      '  accessHandle = null;',
      '  activeFileName = null;',
      '  activeCacheDir = null;',
      '}',
    ].join('\\n'),
  },
  {
    name: 'discard incomplete OPFS downloads',
    before: ['async function writeTextFile(filename, str) {', '  await openFile(filename);'].join('\\n'),
    after: [
      'async function discardOpenFile() {',
      '  const filename = activeFileName;',
      '  const cacheDir = activeCacheDir;',
      '  try {',
      '    accessHandle?.close();',
      '  } catch {',
      '    // The failed handle may already be closed by the browser.',
      '  }',
      '  accessHandle = null;',
      '  activeFileName = null;',
      '  activeCacheDir = null;',
      '  writePosition = 0;',
      '  if (filename && cacheDir) {',
      '    try {',
      '      await cacheDir.removeEntry(filename);',
      '    } catch {',
      '      // A missing partial file is already clean.',
      '    }',
      '  }',
      '}',
      '',
      'async function writeTextFile(filename, str) {',
      '  await openFile(filename);',
    ].join('\\n'),
  },
  {
    name: 'clean partial OPFS files before reporting worker failures',
    before: [
      "    throw new Error('OPFS Worker: Invalid action', e.data);",
      '  } catch (err) {',
      '    return resErr(err);',
    ].join('\\n'),
    after: [
      "    throw new Error('OPFS Worker: Invalid action', e.data);",
      '  } catch (err) {',
      '    await discardOpenFile();',
      '    return resErr({',
      "      name: err?.name || 'Error',",
      '      message: err?.message || String(err),',
      '    });',
    ].join('\\n'),
  },
  {
    name: 'share one abort boundary across parallel shard downloads',
    before: [
      '    const totalSize = await this.getTotalDownloadSize(urls);',
      '    const loadedSize = [];',
      '    const worker = async () => {',
    ].join('\n'),
    after: [
      '    const totalSize = await this.getTotalDownloadSize(urls);',
      '    const loadedSize = [];',
      '    const refreshController = new AbortController();',
      '    const abortRefresh = () => refreshController.abort(options.signal?.reason);',
      '    if (options.signal?.aborted) {',
      '      abortRefresh();',
      '    } else {',
      "      options.signal?.addEventListener('abort', abortRefresh, { once: true });",
      '    }',
      '    const worker = async () => {',
    ].join('\n'),
  },
  {
    name: 'route every shard through the shared abort signal',
    before: [
      '        await this.modelManager.cacheManager.download(w.url, {',
      '          ...options,',
      '          progressCallback: ({ loaded }) => {',
    ].join('\n'),
    after: [
      '        await this.modelManager.cacheManager.download(w.url, {',
      '          ...options,',
      '          signal: refreshController.signal,',
      '          progressCallback: ({ loaded }) => {',
    ].join('\n'),
  },
  {
    name: 'settle stopped sibling shards before cache cleanup',
    before: [
      '    await Promise.all(promises);',
      '    this.files = this.getAllFiles(await this.modelManager.cacheManager.list());',
    ].join('\n'),
    after: [
      '    try {',
      '      await Promise.all(promises);',
      '    } catch (err) {',
      '      refreshController.abort(err);',
      '      await Promise.allSettled(promises);',
      '      throw err;',
      '    } finally {',
      "      options.signal?.removeEventListener('abort', abortRefresh);",
      '    }',
      '    this.files = this.getAllFiles(await this.modelManager.cacheManager.list());',
    ].join('\n'),
  },
];

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function replaceExactlyOnce(source, { name, before, after }) {
  const first = source.indexOf(before);
  const last = source.lastIndexOf(before);
  if (first < 0 || first !== last) {
    throw new Error(`Scion runtime patch "${name}" expected exactly one source match.`);
  }
  return `${source.slice(0, first)}${after}${source.slice(first + before.length)}`;
}

export function patchScionRuntime(source) {
  const sourceSha256 = sha256(source);
  if (sourceSha256 !== expectedSourceSha256) {
    throw new Error(
      `Pinned Scion runtime changed: expected ${expectedSourceSha256}, received ${sourceSha256}. ` +
        'Review the upstream delta before carrying the streaming-cache patch forward.',
    );
  }
  return patches.reduce(replaceExactlyOnce, source);
}

export async function buildScionRuntime({ checkOnly = false } = {}) {
  const source = await fs.readFile(sourcePath, 'utf8');
  const patched = patchScionRuntime(source);
  const outputSha256 = sha256(patched);

  if (checkOnly) {
    const current = await fs.readFile(outputPath, 'utf8').catch(() => '');
    if (current !== patched) {
      throw new Error(`Generated Scion runtime is missing or stale: ${path.relative(repoRoot, outputPath)}`);
    }
  } else {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, patched);
  }

  return {
    status: checkOnly ? 'verified' : 'generated',
    source: path.relative(repoRoot, sourcePath),
    sourceSha256: expectedSourceSha256,
    output: path.relative(repoRoot, outputPath),
    outputSha256,
    patches: patches.map(({ name }) => name),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await buildScionRuntime({ checkOnly: process.argv.includes('--check') })));
}
