import { describe, expect, it, vi } from 'vitest';
import { detectScionDeviceCapability, requireScionLocalModelCapability } from '../scionDeviceCapability';

const globalLike = {
  WebAssembly: {
    Suspending() {},
  },
};

describe('Scion device capability routing', () => {
  it('selects the zero-download evidence compiler when WebGPU is unavailable', async () => {
    await expect(detectScionDeviceCapability({ navigatorLike: {}, globalLike })).resolves.toMatchObject({
      phase: 'evidence-compiler',
      code: 'SCION_WLLAMA_WEBGPU',
      evidenceCompiler: true,
      localModel: false,
    });
  });

  it('selects the evidence compiler when WebAssembly JSPI is unavailable', async () => {
    await expect(
      detectScionDeviceCapability({
        navigatorLike: { gpu: { requestAdapter: vi.fn() } },
        globalLike: { WebAssembly: {} },
      }),
    ).resolves.toMatchObject({
      phase: 'evidence-compiler',
      code: 'SCION_WLLAMA_JSPI',
    });
  });

  it('uses the local model after one successful high-performance adapter probe', async () => {
    const adapter = {};
    const requestAdapter = vi.fn().mockResolvedValue(adapter);

    await expect(
      detectScionDeviceCapability({
        navigatorLike: { gpu: { requestAdapter } },
        globalLike,
      }),
    ).resolves.toMatchObject({
      phase: 'local-model',
      code: null,
      localModel: true,
    });
    expect(requestAdapter).toHaveBeenCalledTimes(1);
    expect(requestAdapter).toHaveBeenCalledWith({ powerPreference: 'high-performance' });
  });

  it('retries with the default adapter before choosing the local model', async () => {
    const requestAdapter = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({});

    await expect(
      detectScionDeviceCapability({
        navigatorLike: { gpu: { requestAdapter } },
        globalLike,
      }),
    ).resolves.toMatchObject({ phase: 'local-model' });
    expect(requestAdapter).toHaveBeenCalledTimes(2);
    expect(requestAdapter).toHaveBeenLastCalledWith();
  });

  it('selects the evidence compiler when neither adapter request succeeds', async () => {
    const requestAdapter = vi.fn().mockResolvedValue(null);

    await expect(
      detectScionDeviceCapability({
        navigatorLike: { gpu: { requestAdapter } },
        globalLike,
      }),
    ).resolves.toMatchObject({
      phase: 'evidence-compiler',
      code: 'SCION_WLLAMA_WEBGPU_ADAPTER',
      message: 'This browser could not start a WebGPU adapter for Scion.',
    });
    expect(requestAdapter).toHaveBeenCalledTimes(2);
  });

  it('turns an evidence route into the same explicit error expected by the local loader', async () => {
    await expect(
      requireScionLocalModelCapability({
        navigatorLike: {},
        globalLike,
      }),
    ).rejects.toMatchObject({
      code: 'SCION_WLLAMA_WEBGPU',
      message: 'WebGPU is not available in this browser.',
    });
  });
});
