// @vitest-environment happy-dom

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ScionRuntimeStatusBanner from '../src/components/ScionRuntimeStatusBanner';
import { loadScionBrowserWllama, unloadScionBrowserWllama } from '../src/lib/scionBrowserWllama';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let finishDownload;

class DeferredWllama {
  async loadModelFromUrl(_url, options) {
    options.progressCallback({ loaded: 50, total: 100 });
    await new Promise((resolve) => {
      finishDownload = resolve;
    });
    this.loaded = true;
  }

  isModelLoaded() {
    return this.loaded;
  }

  usingWebGPU() {
    return true;
  }

  getModelMetadata() {
    return { meta: { 'general.architecture': 'gemma4', 'general.type': 'model' } };
  }

  async getLoraAdapterStatus() {
    return { active: false };
  }

  async exit() {
    this.loaded = false;
  }
}

let root;
let container;

beforeEach(async () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<ScionRuntimeStatusBanner enabled />));
});

afterEach(async () => {
  finishDownload?.();
  await act(async () => unloadScionBrowserWllama());
  await act(async () => root.unmount());
  container.remove();
  finishDownload = null;
});

describe('Scion runtime status banner', () => {
  it('shows truthful first-use download progress and disappears when the local model is ready', async () => {
    let loadPromise;
    await act(async () => {
      loadPromise = loadScionBrowserWllama({
        navigatorLike: { gpu: {} },
        globalLike: { WebAssembly: { Suspending: function Suspending() {} } },
        locationLike: { href: 'https://edutool.dev/' },
        runtimeLoader: async () => ({ Wllama: DeferredWllama }),
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    const banner = container.querySelector('[data-testid="scion-runtime-status"]');
    expect(banner).not.toBeNull();
    expect(banner.textContent).toContain('Preparing Scion on this device');
    expect(banner.textContent).toContain('3.35 GB');
    expect(banner.textContent).toContain('50%');

    await act(async () => {
      finishDownload();
      await loadPromise;
    });
    expect(container.querySelector('[data-testid="scion-runtime-status"]')).toBeNull();
  });
});
