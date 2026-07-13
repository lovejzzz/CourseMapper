export const SCION_ADAPTER_MANIFEST_SCHEMA_VERSION = 1;

export const SCION_GEMMA4_E2B_BASE = Object.freeze({
  modelId: 'google/gemma-4-E2B-it',
  revision: '9dbdf8a839e4e9e0eb56ed80cc8886661d3817cf',
  architecture: 'gemma4',
  role: 'instruction',
});

export const SCION_ADAPTER_RUNTIME_CAPABILITIES = Object.freeze({
  'mlx-vlm': Object.freeze({
    dynamicAdapter: true,
    formats: Object.freeze(['mlx-lora-safetensors']),
    baseOnlyFallback: true,
  }),
  webllm: Object.freeze({
    dynamicAdapter: false,
    formats: Object.freeze([]),
    baseOnlyFallback: true,
    reason: 'WebLLM does not currently expose the dynamic LoRA contract required by Scion.',
  }),
  wllama: Object.freeze({
    dynamicAdapter: false,
    formats: Object.freeze([]),
    baseOnlyFallback: false,
    reason: 'The maintained browser wrapper currently lists LoRA loading as unsupported.',
  }),
});

const SHA256_RE = /^[a-f0-9]{64}$/;
const REVISION_RE = /^[a-f0-9]{40}$/;
const ADAPTER_ID_RE = /^[a-z0-9][a-z0-9._-]{2,79}$/;
const ALLOWED_FORMATS = new Set(['mlx-lora-safetensors', 'peft-safetensors', 'gguf-lora']);
const ALLOWED_PROMOTION_STATUSES = new Set(['smoke', 'candidate', 'rejected', 'promoted']);

function clean(value) {
  return String(value ?? '').trim();
}

function sameModelId(left, right) {
  return clean(left).toLowerCase() === clean(right).toLowerCase();
}

function safeRelativePath(value) {
  const normalized = clean(value).replaceAll('\\', '/');
  if (!normalized || normalized.startsWith('/') || /^[a-z]:\//i.test(normalized)) return false;
  return normalized.split('/').every((part) => part && part !== '.' && part !== '..');
}

export function validateScionAdapterManifest(
  manifest,
  { expectedBase = SCION_GEMMA4_E2B_BASE, requirePromoted = false } = {},
) {
  const issues = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { valid: false, issues: ['manifest-not-object'] };
  }
  if (manifest.schemaVersion !== SCION_ADAPTER_MANIFEST_SCHEMA_VERSION) issues.push('schema-version');
  if (!ADAPTER_ID_RE.test(clean(manifest.adapter?.id))) issues.push('adapter-id');
  if (!/^\d+\.\d+\.\d+(?:[-+][a-z0-9.-]+)?$/i.test(clean(manifest.adapter?.scionVersion))) {
    issues.push('scion-version');
  }
  if (!ALLOWED_FORMATS.has(clean(manifest.adapter?.format))) issues.push('adapter-format');
  if (!sameModelId(manifest.base?.modelId, expectedBase.modelId)) issues.push('base-model-mismatch');
  if (!REVISION_RE.test(clean(manifest.base?.revision))) issues.push('base-revision');
  if (clean(manifest.base?.revision) !== expectedBase.revision) issues.push('base-revision-mismatch');
  if (clean(manifest.base?.architecture) !== expectedBase.architecture) issues.push('base-architecture-mismatch');
  if (manifest.base?.exactRevisionRequired !== true) issues.push('base-not-exact');
  if (!SHA256_RE.test(clean(manifest.training?.datasetManifestSha256))) issues.push('dataset-manifest-sha256');
  if (!clean(manifest.training?.method)) issues.push('training-method');

  const files = Array.isArray(manifest.files) ? manifest.files : [];
  if (files.length === 0) issues.push('adapter-files-empty');
  const paths = new Set();
  for (const file of files) {
    const filePath = clean(file?.path).replaceAll('\\', '/');
    if (!safeRelativePath(filePath)) issues.push('adapter-file-path');
    if (paths.has(filePath)) issues.push('adapter-file-duplicate');
    paths.add(filePath);
    if (!Number.isSafeInteger(file?.bytes) || file.bytes <= 0) issues.push('adapter-file-bytes');
    if (!SHA256_RE.test(clean(file?.sha256))) issues.push('adapter-file-sha256');
  }

  const promotionStatus = clean(manifest.promotion?.status);
  if (!ALLOWED_PROMOTION_STATUSES.has(promotionStatus)) issues.push('promotion-status');
  if (requirePromoted && promotionStatus !== 'promoted') issues.push('adapter-not-promoted');
  if (['smoke', 'candidate', 'rejected'].includes(promotionStatus) && manifest.promotion?.promotable !== false) {
    issues.push(`${promotionStatus || 'unknown'}-must-not-promote`);
  }
  if (promotionStatus === 'promoted' && manifest.promotion?.promotable !== true) issues.push('promoted-flag');
  if (
    promotionStatus === 'promoted' &&
    !(Array.isArray(manifest.promotion?.evidence) ? manifest.promotion.evidence : []).some(
      (entry) => entry?.type === 'promotion-audit' && entry?.status === 'pass' && SHA256_RE.test(clean(entry?.sha256)),
    )
  ) {
    issues.push('promotion-audit-attestation');
  }
  if (promotionStatus === 'candidate' || promotionStatus === 'promoted') {
    if (clean(manifest.training?.datasetStatus) !== 'ready') issues.push('candidate-dataset-not-ready');
    if (!Number.isSafeInteger(manifest.training?.pairCount) || manifest.training.pairCount < 3000) {
      issues.push('candidate-pair-count');
    }
    if (!Number.isSafeInteger(manifest.training?.domainCount) || manifest.training.domainCount < 5) {
      issues.push('candidate-domain-count');
    }
  }

  const runtimeIds = Array.isArray(manifest.runtime?.supported) ? manifest.runtime.supported.map(clean) : [];
  if (runtimeIds.length === 0) issues.push('runtime-support-empty');
  for (const runtimeId of runtimeIds) {
    const capability = SCION_ADAPTER_RUNTIME_CAPABILITIES[runtimeId];
    if (!capability?.dynamicAdapter) issues.push(`runtime-not-dynamic:${runtimeId || 'unknown'}`);
    else if (!capability.formats.includes(clean(manifest.adapter?.format))) {
      issues.push(`runtime-format-mismatch:${runtimeId}`);
    }
  }

  return { valid: issues.length === 0, issues: [...new Set(issues)] };
}

export function resolveScionAdapterRuntime({
  manifest,
  runtimeId,
  baseModelId,
  baseRevision,
  requirePromoted = false,
} = {}) {
  const capability = SCION_ADAPTER_RUNTIME_CAPABILITIES[clean(runtimeId)];
  if (!capability) {
    return {
      mode: 'unsupported',
      adapterActive: false,
      reason: 'unknown-runtime',
      issues: ['unknown-runtime'],
    };
  }
  const validation = validateScionAdapterManifest(manifest, { requirePromoted });
  const identityIssues = [];
  if (!sameModelId(baseModelId, manifest?.base?.modelId)) identityIssues.push('active-base-model-mismatch');
  if (clean(baseRevision) !== clean(manifest?.base?.revision)) identityIssues.push('active-base-revision-mismatch');
  const issues = [...validation.issues, ...identityIssues];
  if (issues.length > 0) {
    return { mode: 'unsupported', adapterActive: false, reason: issues[0], issues };
  }
  if (!capability.dynamicAdapter) {
    return {
      mode: capability.baseOnlyFallback ? 'base-only' : 'unsupported',
      adapterActive: false,
      reason: 'runtime-no-dynamic-adapter',
      issues: [],
    };
  }
  if (!capability.formats.includes(clean(manifest.adapter?.format))) {
    return {
      mode: 'unsupported',
      adapterActive: false,
      reason: 'runtime-format-mismatch',
      issues: ['runtime-format-mismatch'],
    };
  }
  return {
    mode: 'adapter-ready',
    adapterActive: true,
    adapterId: manifest.adapter.id,
    scionVersion: manifest.adapter.scionVersion,
    reason: null,
    issues: [],
  };
}
