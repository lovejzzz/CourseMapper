import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { prepareRunDirectory, waitForExportSidePanel, waitForReadinessPanel } from '../liveBrowserQualityLoop.mjs';

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

describe('waitForExportSidePanel', () => {
  it('uses the full generation timeout instead of a short fixed panel wait', async () => {
    const waitFor = vi.fn().mockResolvedValue();
    const page = {
      getByTestId: vi.fn(() => ({ waitFor })),
    };

    await waitForExportSidePanel(page);

    expect(page.getByTestId).toHaveBeenCalledWith('export-side-panel');
    expect(waitFor).toHaveBeenCalledWith({ timeout: 600_000 });
  });

  it('includes current workspace state when the export panel never appears', async () => {
    const textLocator = (text) => ({
      count: vi.fn().mockResolvedValue(1),
      first: vi.fn(() => ({
        innerText: vi.fn().mockResolvedValue(text),
      })),
    });
    const locators = {
      'export-side-panel': {
        waitFor: vi.fn().mockRejectedValue(new Error('Timeout waiting for export-side-panel')),
      },
      'workspace-agent-panel': textLocator('Finishing package\n10 lessons - no generated materials yet'),
      'workspace-shell': textLocator('Course Map Preview\nCommunity Health Program Evaluation'),
    };
    const page = {
      getByTestId: vi.fn((testId) => locators[testId] || { count: vi.fn().mockResolvedValue(0) }),
    };

    await expect(waitForExportSidePanel(page, 1_000)).rejects.toThrow(/Finishing package[\s\S]*Course Map Preview/);
  });
});

describe('waitForReadinessPanel', () => {
  it('uses the full finalizer timeout instead of a short fixed readiness wait', async () => {
    const waitFor = vi.fn().mockResolvedValue();
    const page = {
      getByTestId: vi.fn(() => ({ waitFor })),
    };

    await waitForReadinessPanel(page);

    expect(page.getByTestId).toHaveBeenCalledWith('readiness-panel');
    expect(waitFor).toHaveBeenCalledWith({ timeout: 600_000 });
  });

  it('includes current export state when the finalizer never reaches readiness', async () => {
    const exportPanel = {
      count: vi.fn().mockResolvedValue(1),
      first: vi.fn(() => ({
        innerText: vi.fn().mockResolvedValue('Finishing package\nRetry pass 1/2, fixing 2 weak areas'),
      })),
    };
    const page = {
      getByTestId: vi.fn((testId) => {
        if (testId === 'readiness-panel') {
          return { waitFor: vi.fn().mockRejectedValue(new Error('Timeout waiting for readiness-panel')) };
        }
        if (testId === 'export-side-panel') return exportPanel;
        return { count: vi.fn().mockResolvedValue(0) };
      }),
    };

    await expect(waitForReadinessPanel(page, 1_000)).rejects.toThrow(
      /Finishing package[\s\S]*Timeout waiting for readiness-panel/,
    );
  });
});
