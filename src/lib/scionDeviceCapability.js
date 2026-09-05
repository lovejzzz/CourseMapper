let sharedBrowserProbe = null;

function result(phase, code, message) {
  return Object.freeze({
    phase,
    code,
    message,
    localModel: phase === 'local-model',
    evidenceCompiler: phase === 'evidence-compiler',
  });
}

async function runProbe({ navigatorLike, globalLike }) {
  if (!navigatorLike?.gpu) {
    return result('evidence-compiler', 'SCION_WLLAMA_WEBGPU', 'WebGPU is not available in this browser.');
  }
  if (typeof globalLike?.WebAssembly?.Suspending !== 'function') {
    return result('evidence-compiler', 'SCION_WLLAMA_JSPI', 'WebAssembly JSPI is not available in this browser.');
  }
  try {
    let adapter = await navigatorLike.gpu.requestAdapter?.({ powerPreference: 'high-performance' });
    adapter ||= await navigatorLike.gpu.requestAdapter?.();
    if (!adapter) {
      return result(
        'evidence-compiler',
        'SCION_WLLAMA_WEBGPU_ADAPTER',
        'This browser could not start a WebGPU adapter for Scion.',
      );
    }
    return result('local-model', null, 'This browser can run the local Scion model.');
  } catch (error) {
    return result(
      'evidence-compiler',
      'SCION_WLLAMA_WEBGPU_ADAPTER',
      error?.message || 'This browser could not start a WebGPU adapter for Scion.',
    );
  }
}

/**
 * Resolve the Scion execution lane before any model download. The real global
 * browser probe is shared by setup and generation; injected test environments
 * stay isolated.
 */
export function detectScionDeviceCapability({ navigatorLike = globalThis.navigator, globalLike = globalThis } = {}) {
  const shared = navigatorLike === globalThis.navigator && globalLike === globalThis;
  if (!shared) return runProbe({ navigatorLike, globalLike });
  sharedBrowserProbe ||= runProbe({ navigatorLike, globalLike });
  return sharedBrowserProbe;
}

export async function requireScionLocalModelCapability(options = {}) {
  const capability = await detectScionDeviceCapability(options);
  if (capability.localModel) return capability;
  const error = new Error(capability.message);
  error.code = capability.code;
  throw error;
}

export function resetScionDeviceCapabilityProbeForTests() {
  sharedBrowserProbe = null;
}
