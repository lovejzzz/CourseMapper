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
    name: 'track the OPFS write cursor',
    before: 'let accessHandle;\\nlet abortController = new AbortController();',
    after: 'let accessHandle;\\nlet writePosition = 0;\\nlet abortController = new AbortController();',
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
      '  if (!Number.isFinite(count) || count !== source.byteLength) {',
      '    throw new Error(',
      '      `OPFS Worker: wrote ${count} of ${source.byteLength} requested bytes`',
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
      '}',
    ].join('\\n'),
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
