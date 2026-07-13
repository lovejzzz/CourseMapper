import { describe, expect, it } from 'vitest';

import {
  SCION_ADAPTER_MANIFEST_SCHEMA_VERSION,
  SCION_BROWSER_ADAPTER_CONVERSION_PIPELINE,
  resolveScionAdapterRuntime,
  SCION_GEMMA4_E2B_BASE,
  SCION_LLAMA_CPP_LORA_CONVERTER_SHA256,
  SCION_LLAMA_CPP_REVISION,
  validateScionAdapterManifest,
} from '../src/lib/scionAdapterManifest.js';

const HASH = 'a'.repeat(64);

function manifest(overrides = {}) {
  return {
    schemaVersion: SCION_ADAPTER_MANIFEST_SCHEMA_VERSION,
    adapter: { id: 'scion-g4e2b-v1', scionVersion: '0.16.6', format: 'mlx-lora-safetensors' },
    base: { ...SCION_GEMMA4_E2B_BASE, exactRevisionRequired: true },
    training: {
      method: 'orpo-lora',
      datasetManifestSha256: HASH,
      datasetStatus: 'ready',
      pairCount: 3000,
      domainCount: 5,
    },
    files: [{ path: 'adapters.safetensors', bytes: 1024, sha256: HASH }],
    runtime: { supported: ['mlx-vlm'] },
    promotion: { status: 'candidate', promotable: false },
    ...overrides,
  };
}

function browserConversion() {
  return {
    pipeline: SCION_BROWSER_ADAPTER_CONVERSION_PIPELINE,
    sourceAdapterId: 'scion-g4e2b-mlx-v1',
    sourceManifestSha256: HASH,
    receiptPath: 'conversion-receipt.json',
    converter: {
      id: 'ggml-org/llama.cpp/convert_lora_to_gguf.py',
      revision: SCION_LLAMA_CPP_REVISION,
      sha256: SCION_LLAMA_CPP_LORA_CONVERTER_SHA256,
      outputType: 'f16',
    },
  };
}

describe('Scion adapter manifest', () => {
  it('accepts an exact-base MLX candidate and resolves it as adapter-ready', () => {
    const candidate = manifest();
    expect(validateScionAdapterManifest(candidate)).toEqual({ valid: true, issues: [] });
    expect(
      resolveScionAdapterRuntime({
        manifest: candidate,
        runtimeId: 'mlx-vlm',
        baseModelId: SCION_GEMMA4_E2B_BASE.modelId,
        baseRevision: SCION_GEMMA4_E2B_BASE.revision,
      }),
    ).toMatchObject({ mode: 'adapter-ready', adapterActive: true, adapterId: 'scion-g4e2b-v1' });
  });

  it('fails closed when the active base revision differs', () => {
    const resolution = resolveScionAdapterRuntime({
      manifest: manifest(),
      runtimeId: 'mlx-vlm',
      baseModelId: SCION_GEMMA4_E2B_BASE.modelId,
      baseRevision: 'b'.repeat(40),
    });
    expect(resolution).toMatchObject({ mode: 'unsupported', adapterActive: false });
    expect(resolution.issues).toContain('active-base-revision-mismatch');
  });

  it('reports WebLLM truthfully as base-only instead of claiming the adapter is active', () => {
    const resolution = resolveScionAdapterRuntime({
      manifest: manifest({ runtime: { supported: ['mlx-vlm'] } }),
      runtimeId: 'webllm',
      baseModelId: SCION_GEMMA4_E2B_BASE.modelId,
      baseRevision: SCION_GEMMA4_E2B_BASE.revision,
    });
    expect(resolution).toMatchObject({
      mode: 'base-only',
      adapterActive: false,
      reason: 'runtime-no-dynamic-adapter',
    });
  });

  it('keeps the Transformers.js Gemma runtime base-only until separate adapter activation exists', () => {
    const resolution = resolveScionAdapterRuntime({
      manifest: manifest({ runtime: { supported: ['mlx-vlm'] } }),
      runtimeId: 'transformers-js-webgpu',
      baseModelId: SCION_GEMMA4_E2B_BASE.modelId,
      baseRevision: SCION_GEMMA4_E2B_BASE.revision,
    });
    expect(resolution).toMatchObject({
      mode: 'base-only',
      adapterActive: false,
      reason: 'runtime-no-dynamic-adapter',
    });
  });

  it('accepts a GGUF LoRA only for the hash-bound Scion browser runtime', () => {
    const candidate = manifest({
      adapter: { id: 'scion-g4e2b-v1', scionVersion: '0.16.7', format: 'gguf-lora', scale: 1 },
      files: [
        { path: 'scion-g4e2b-v1.gguf', bytes: 2048, sha256: HASH },
        { path: 'conversion-receipt.json', bytes: 1024, sha256: HASH },
      ],
      runtime: { supported: ['scion-wllama-webgpu-jspi-v1'] },
      conversion: browserConversion(),
    });
    expect(validateScionAdapterManifest(candidate)).toEqual({ valid: true, issues: [] });
    expect(
      resolveScionAdapterRuntime({
        manifest: candidate,
        runtimeId: 'scion-wllama-webgpu-jspi-v1',
        baseModelId: SCION_GEMMA4_E2B_BASE.modelId,
        baseRevision: SCION_GEMMA4_E2B_BASE.revision,
      }),
    ).toMatchObject({ mode: 'adapter-ready', adapterActive: true });
  });

  it('rejects an untraceable GGUF even when its file digest is present', () => {
    const result = validateScionAdapterManifest(
      manifest({
        adapter: { id: 'scion-g4e2b-v1', scionVersion: '0.16.7', format: 'gguf-lora', scale: 1 },
        files: [{ path: 'scion-g4e2b-v1.gguf', bytes: 2048, sha256: HASH }],
        runtime: { supported: ['scion-wllama-webgpu-jspi-v1'] },
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.issues).toContain('gguf-conversion-missing');
  });

  it('rejects smoke manifests that can be promoted or contain unsafe paths', () => {
    const result = validateScionAdapterManifest(
      manifest({
        files: [{ path: '../adapter.safetensors', bytes: 12, sha256: HASH }],
        promotion: { status: 'smoke', promotable: true },
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining(['adapter-file-path', 'smoke-must-not-promote']));
  });

  it('refuses candidate status for a smoke-sized or unidentified dataset', () => {
    const result = validateScionAdapterManifest(
      manifest({
        training: {
          method: 'orpo-lora',
          datasetManifestSha256: HASH,
          datasetStatus: 'smoke-only',
          pairCount: 2999,
          domainCount: 4,
        },
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining(['candidate-dataset-not-ready', 'candidate-pair-count', 'candidate-domain-count']),
    );
  });

  it('requires an explicit promotion ceremony instead of trusting a candidate flag', () => {
    const result = validateScionAdapterManifest(manifest({ promotion: { status: 'candidate', promotable: true } }));
    expect(result.valid).toBe(false);
    expect(result.issues).toContain('candidate-must-not-promote');
  });

  it('rejects a promoted label without a hash-bound passing promotion audit', () => {
    const result = validateScionAdapterManifest(
      manifest({ promotion: { status: 'promoted', promotable: true, evidence: [] } }),
    );
    expect(result.valid).toBe(false);
    expect(result.issues).toContain('promotion-audit-attestation');
  });
});
