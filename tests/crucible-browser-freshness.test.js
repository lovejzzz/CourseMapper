import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { isDistFresh, normalizeLlmShimResponse } from '../scripts/lib/crucibleBrowser.mjs';

const roots = [];

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'crucible-freshness-'));
  roots.push(root);
  await Promise.all([
    fs.mkdir(path.join(root, 'dist'), { recursive: true }),
    fs.mkdir(path.join(root, 'src'), { recursive: true }),
    fs.mkdir(path.join(root, 'public', 'genome'), { recursive: true }),
  ]);
  await Promise.all([
    fs.writeFile(path.join(root, 'dist', 'index.html'), 'built'),
    fs.writeFile(path.join(root, 'src', 'main.js'), 'source'),
    fs.writeFile(path.join(root, 'public', 'genome', 'music-intro.json'), '{}'),
    fs.writeFile(path.join(root, 'index.html'), 'entry'),
    fs.writeFile(path.join(root, 'vite.config.js'), 'export default {}'),
    fs.writeFile(path.join(root, 'package.json'), '{}'),
  ]);
  return root;
}

async function setMtime(file, epochMs) {
  const at = new Date(epochMs);
  await fs.utimes(file, at, at);
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe('Crucible production-bundle freshness', () => {
  it('rejects a dist bundle older than a generated public genome shard', async () => {
    const root = await fixture();
    const base = Date.now() - 10_000;
    await setMtime(path.join(root, 'dist', 'index.html'), base + 1_000);
    await setMtime(path.join(root, 'public', 'genome', 'music-intro.json'), base + 2_000);
    expect(await isDistFresh(root)).toBe(false);
  });

  it('accepts a dist bundle newer than source and public inputs', async () => {
    const root = await fixture();
    const base = Date.now() - 10_000;
    for (const file of [
      'src/main.js',
      'public/genome/music-intro.json',
      'index.html',
      'vite.config.js',
      'package.json',
    ]) {
      await setMtime(path.join(root, file), base + 1_000);
    }
    await setMtime(path.join(root, 'dist', 'index.html'), base + 2_000);
    expect(await isDistFresh(root)).toBe(true);
  });
});

describe('Crucible local-model streaming bridge', () => {
  it('passes a real shim SSE response through without trying to parse it as JSON', () => {
    const sse = 'data: {"type":"response.output_text.delta","delta":"{\\"ok\\":true}"}\n\ndata: [DONE]\n\n';
    expect(
      normalizeLlmShimResponse({
        bodyText: sse,
        contentType: 'text/event-stream; charset=utf-8',
        wantsStream: true,
        isResponses: true,
      }),
    ).toEqual({ status: 200, contentType: 'text/event-stream', body: sse });
  });

  it('wraps a legacy non-streaming JSON response when the browser requested a stream', () => {
    const normalized = normalizeLlmShimResponse({
      bodyText: JSON.stringify({ output_text: '{"ok":true}' }),
      contentType: 'application/json',
      wantsStream: true,
      isResponses: true,
    });
    expect(normalized.contentType).toBe('text/event-stream');
    expect(normalized.body).toContain('response.output_text.delta');
    expect(normalized.body).toContain('data: [DONE]');
  });
});
