import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  isAppServerPortFree,
  isDistFresh,
  isFatalAppConsoleMessage,
  isPreviewInfrastructureError,
  normalizeLlmShimResponse,
  stageProductionDist,
} from '../scripts/lib/crucibleBrowser.mjs';

const roots = [];
const servers = [];

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
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise((resolve) => {
          server.close(resolve);
        }),
    ),
  );
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

describe('Crucible preview isolation', () => {
  it('serves a verified temporary snapshot rather than mutable worktree bytes', async () => {
    const root = await fixture();
    await fs.mkdir(path.join(root, 'dist', 'assets'), { recursive: true });
    await fs.writeFile(path.join(root, 'dist', 'assets', 'app.js'), 'production bytes');
    const staged = await stageProductionDist({
      sourceDist: path.join(root, 'dist'),
      tempRoot: os.tmpdir(),
      attempts: 1,
    });
    roots.push(staged.stageRoot);

    expect(staged.stageRoot.startsWith(os.tmpdir())).toBe(true);
    expect(await fs.readFile(path.join(staged.distDir, 'assets', 'app.js'), 'utf8')).toBe('production bytes');
    await fs.writeFile(path.join(root, 'dist', 'assets', 'app.js'), 'changed after staging');
    expect(await fs.readFile(path.join(staged.distDir, 'assets', 'app.js'), 'utf8')).toBe('production bytes');
  });

  it('never selects the browser-forbidden ManageSieve port', async () => {
    expect(await isAppServerPortFree(4190)).toBe(false);
  });

  it('treats a wildcard-owned port as unavailable even when loopback could overlap it', async () => {
    const server = net.createServer();
    servers.push(server);
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '0.0.0.0', resolve);
    });

    expect(await isAppServerPortFree(server.address().port)).toBe(false);
  });

  it('classifies app-origin transport loss and error-boundary entry as fatal', () => {
    const appOrigin = 'http://127.0.0.1:4173';
    expect(
      isFatalAppConsoleMessage({
        type: 'error',
        text: 'Failed to load resource: net::ERR_CONNECTION_REFUSED',
        url: `${appOrigin}/assets/ExportSidePanel.js`,
        appOrigin,
      }),
    ).toBe(true);
    expect(
      isFatalAppConsoleMessage({
        type: 'error',
        text: 'ErrorBoundary caught: TypeError: Failed to fetch dynamically imported module',
        url: `${appOrigin}/assets/AppFlow.js`,
        appOrigin,
      }),
    ).toBe(true);
    expect(
      isFatalAppConsoleMessage({
        type: 'error',
        text: 'Failed to load resource: net::ERR_CONNECTION_REFUSED',
        url: 'http://127.0.0.1:8799/v1/chat/completions',
        appOrigin,
      }),
    ).toBe(false);
  });

  it('separates preview transport failures from model or content failures', () => {
    expect(
      isPreviewInfrastructureError(
        'CourseMapper preview request failed: http://127.0.0.1:4173/scion/runtime/wllama.wasm (net::ERR_EMPTY_RESPONSE)',
      ),
    ).toBe(true);
    expect(isPreviewInfrastructureError('Package was not ready to download after finalization')).toBe(false);
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
