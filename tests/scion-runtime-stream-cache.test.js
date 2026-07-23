import crypto from 'node:crypto';
import fs from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { patchScionRuntime } from '../scripts/buildScionRuntime.mjs';
import { SCION_BROWSER_GEMMA4_GGUF, SCION_BROWSER_GEMMA4_GGUF_URL } from '../src/lib/scionBrowserConstants.js';

const sourcePath = new URL('../public/scion/runtime/v1/wllama.js', import.meta.url);

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
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
});
