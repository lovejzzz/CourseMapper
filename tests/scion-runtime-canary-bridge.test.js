import { describe, expect, it, vi } from 'vitest';

import { installScionRuntimeCanaryBridge, isScionRuntimeCanaryLocation } from '../src/lib/scionRuntimeCanaryBridge.js';
import { armScionRuntimeCanary } from '../src/lib/scionRuntimeCanaryGate.js';

function location(href) {
  const url = new URL(href);
  return { href: url.href, hostname: url.hostname };
}

describe('Scion runtime canary bridge', () => {
  it('does not load the heavy bridge on a production origin', () => {
    const loadBridge = vi.fn();
    expect(
      armScionRuntimeCanary({
        locationLike: location('https://edutool.dev/?scion-runtime-canary=1'),
        globalLike: {},
        loadBridge,
      }),
    ).toBeNull();
    expect(loadBridge).not.toHaveBeenCalled();
  });

  it('can be enabled only on an explicit localhost canary URL', () => {
    expect(isScionRuntimeCanaryLocation(location('http://127.0.0.1:4179/?scion-runtime-canary=1'))).toBe(true);
    expect(isScionRuntimeCanaryLocation(location('http://localhost:4179/?scion-runtime-canary=1'))).toBe(true);
    expect(isScionRuntimeCanaryLocation(location('http://127.0.0.1:4179/'))).toBe(false);
    expect(isScionRuntimeCanaryLocation(location('https://edutool.dev/?scion-runtime-canary=1'))).toBe(false);
  });

  it('exposes only the bounded runtime proof API', async () => {
    const globalLike = {};
    const loadRuntime = vi.fn(async () => ({
      loadScionBrowserWllama: vi.fn(),
      completeScionBrowserWllama: vi.fn(),
      applyScionBrowserWllamaAdapter: vi.fn(),
      probeScionBrowserWllamaAdapter: vi.fn(),
      rollbackScionBrowserWllamaAdapter: vi.fn(),
      unloadScionBrowserWllama: vi.fn(),
      getScionBrowserWllamaStatus: vi.fn(),
      validateScionAdapterManifest: vi.fn(),
      sha256Hex: vi.fn(),
      internalSecret: 'not exposed',
    }));
    const ready = installScionRuntimeCanaryBridge({
      locationLike: location('http://127.0.0.1:4179/?scion-runtime-canary=1'),
      globalLike,
      loadRuntime,
    });
    const api = await ready;
    expect(api).toBe(globalLike.__scionRuntimeCanary);
    expect(Object.keys(globalLike.__scionRuntimeCanary).sort()).toEqual(
      [
        'applyAdapter',
        'complete',
        'load',
        'probeAdapter',
        'rollbackAdapter',
        'runAdapterCanary',
        'status',
        'unload',
      ].sort(),
    );
    expect(globalLike.__scionRuntimeCanary.internalSecret).toBeUndefined();
  });
});
