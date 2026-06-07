import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { prepareRunDirectory } from '../liveBrowserQualityLoop.mjs';

describe('prepareRunDirectory', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the requested output root when it is writable', async () => {
    const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'coursemapper-browser-root-'));
    const result = await prepareRunDirectory(outputRoot, 'run-1');

    expect(result.fallbackUsed).toBe(false);
    expect(result.runDir).toBe(path.join(outputRoot, 'run-1'));
    await expect(fs.stat(result.runDir)).resolves.toMatchObject({ isDirectory: expect.any(Function) });
  });

  it('falls back to a temp output root when the requested root is not writable', async () => {
    const requestedRoot = '/unwritable/root';
    const fallbackRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'coursemapper-browser-fallback-'));
    const originalMkdir = fs.mkdir.bind(fs);
    const mkdirSpy = vi.spyOn(fs, 'mkdir');
    mkdirSpy.mockImplementation(async (target, options) => {
      if (target === path.join(requestedRoot, 'run-2')) {
        const error = new Error('operation not permitted');
        error.code = 'EPERM';
        throw error;
      }
      return originalMkdir(target, options);
    });

    const result = await prepareRunDirectory(requestedRoot, 'run-2', { fallbackRoot });

    expect(result.fallbackUsed).toBe(true);
    expect(result.requestedRunDir).toBe(path.join(requestedRoot, 'run-2'));
    expect(result.runDir).toBe(path.join(fallbackRoot, 'run-2'));
    expect(result.fallbackReason).toContain('EPERM');
    await expect(fs.stat(result.runDir)).resolves.toMatchObject({ isDirectory: expect.any(Function) });
  });

  it('rethrows non-permission mkdir failures', async () => {
    const mkdirSpy = vi.spyOn(fs, 'mkdir').mockRejectedValueOnce(Object.assign(new Error('boom'), { code: 'ENOENT' }));

    await expect(prepareRunDirectory('/missing/root', 'run-3')).rejects.toMatchObject({ code: 'ENOENT' });
    expect(mkdirSpy).toHaveBeenCalled();
  });
});
