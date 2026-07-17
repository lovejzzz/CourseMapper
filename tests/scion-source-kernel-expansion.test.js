import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { runScionSourceKernelExpansion } from '../scripts/scionSourceKernelExpansionV01647.mjs';
import { normalizeConceptKernel } from '../src/lib/genome/kernelSchema.js';

let root = '';

afterEach(async () => {
  if (root) await fs.rm(root, { recursive: true, force: true });
  root = '';
});

describe('Scion v0.16.47 source-kernel expansion', () => {
  it('adds eight valid source-anchored kernels and binds shard hashes idempotently', async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-source-kernel-expansion-'));
    await Promise.all([
      fs.mkdir(path.join(root, 'public/genome'), { recursive: true }),
      fs.mkdir(path.join(root, 'evaluation/scion-adapters/evidence'), { recursive: true }),
    ]);
    await Promise.all(
      ['manifest.json', 'music-intro.json', 'ux-intro.json'].map((name) =>
        fs.copyFile(path.join('public/genome', name), path.join(root, 'public/genome', name)),
      ),
    );

    const result = await runScionSourceKernelExpansion({ cwd: root, write: true });
    expect(result.receipt).toMatchObject({
      status: 'source-kernels-expanded',
      addedKernels: 8,
      addedByDomain: { 'music-theory': 4, 'user-experience-design': 4 },
      licenseBoundary: { researchCompatible: true, productionCompatible: false },
    });

    const [manifest, music, ux, musicExpansion, uxExpansion] = await Promise.all(
      ['manifest.json', 'music-intro.json', 'ux-intro.json', 'music-scion-v01647.json', 'ux-scion-v01647.json'].map(
        async (name) => JSON.parse(await fs.readFile(path.join(root, 'public/genome', name), 'utf8')),
      ),
    );
    expect(manifest).toMatchObject({
      version: '2026-07-16',
      conceptCount: 292,
      references: {
        'omt:texture': expect.objectContaining({ sourceUrl: expect.stringContaining('openmusictheory') }),
        'uswds:step-indicator': expect.objectContaining({ sourceUrl: expect.stringContaining('step-indicator') }),
      },
    });
    expect(music.kernels).toHaveLength(7);
    expect(ux.kernels).toHaveLength(6);
    expect(musicExpansion.kernels).toHaveLength(4);
    expect(uxExpansion.kernels).toHaveLength(4);
    const additions = [...musicExpansion.kernels, ...uxExpansion.kernels];
    expect(additions).toHaveLength(8);
    for (const raw of additions) {
      const normalized = normalizeConceptKernel(raw);
      expect(normalized.issues).toEqual([]);
      expect(normalized.kernel?.definition?.anchor).not.toBeNull();
      expect(normalized.kernel?.facts).toHaveLength(4);
      expect(normalized.kernel?.facts.every((entry) => entry.anchor)).toBe(true);
    }

    const firstReceipt = await fs.readFile(result.receiptFile, 'utf8');
    await expect(runScionSourceKernelExpansion({ cwd: root, write: false })).resolves.toMatchObject({ wrote: false });
    await expect(runScionSourceKernelExpansion({ cwd: root, write: true })).resolves.toMatchObject({ wrote: true });
    expect(await fs.readFile(result.receiptFile, 'utf8')).toBe(firstReceipt);
  });
});
