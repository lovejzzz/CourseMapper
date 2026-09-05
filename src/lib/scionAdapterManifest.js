import {
  SCION_ADAPTER_TASK_FAMILIES,
  resolveScionAdapterTaskRoute as resolveTaskRoute,
  validateScionAdapterTaskScope,
} from './scionAdapterTaskScope.js';

export const SCION_ADAPTER_MANIFEST_SCHEMA_VERSION = 4;
const SUPPORTED_SCION_ADAPTER_MANIFEST_SCHEMA_VERSIONS = new Set([2, 3, SCION_ADAPTER_MANIFEST_SCHEMA_VERSION]);

export const SCION_LLAMA_CPP_REVISION = '5ec717d1256e34558a44dc09adf1e6e16f2e2682';
export const SCION_LLAMA_CPP_LORA_CONVERTER_SHA256 = '7e82b74442df2faab81c30e7d83614d10905294cec92092ec2a1749700d1a378';
export const SCION_BROWSER_ADAPTER_CONVERSION_PIPELINE = 'mlx-lora-to-peft-to-gguf-v1';

export const SCION_GEMMA4_E2B_BASE = Object.freeze({
  modelId: 'google/gemma-4-E2B-it-qat-q4_0-unquantized',
  revision: '1ca4dd94b623b6e0dd9da00c2239ab84b4f3e5ce',
  architecture: 'gemma4',
  role: 'instruction',
});

// A browser adapter is an optional delta, never a second copy of the base.
// Keep the absolute cap easy to explain while also binding it to the exact
// pinned 3.35 GB browser artifact. The ratio gate is slightly stricter than
// 64 MiB for the current base and therefore remains the effective ceiling.
export const SCION_GEMMA4_E2B_BROWSER_BASE_BYTES = 3349514112;
export const SCION_BROWSER_ADAPTER_MAX_TOTAL_BYTES = 64 * 1024 * 1024;
export const SCION_BROWSER_ADAPTER_MAX_BASE_FRACTION = 0.02;

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
  'transformers-js-webgpu': Object.freeze({
    dynamicAdapter: false,
    formats: Object.freeze([]),
    baseOnlyFallback: true,
    reason: 'Transformers.js runs the pinned Gemma 4 base in WebGPU but does not expose separate LoRA activation.',
  }),
  wllama: Object.freeze({
    dynamicAdapter: false,
    formats: Object.freeze([]),
    baseOnlyFallback: false,
    reason: 'The maintained browser wrapper currently lists LoRA loading as unsupported.',
  }),
  'scion-wllama-webgpu-jspi-v1': Object.freeze({
    dynamicAdapter: true,
    formats: Object.freeze(['gguf-lora']),
    baseOnlyFallback: true,
    evidenceStatus: 'mechanical-browser-canary',
  }),
});

const SHA256_RE = /^[a-f0-9]{64}$/;
const REVISION_RE = /^[a-f0-9]{40}$/;
const ADAPTER_ID_RE = /^[a-z0-9][a-z0-9._-]{2,79}$/;
const ALLOWED_FORMATS = new Set(['mlx-lora-safetensors', 'peft-safetensors', 'gguf-lora']);
const ALLOWED_PROMOTION_STATUSES = new Set(['smoke', 'research', 'candidate', 'rejected', 'promoted']);

function clean(value) {
  return String(value ?? '').trim();
}

function countDomainsAtLeast(value, minimum) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 0;
  return Object.values(value).filter((count) => Number.isSafeInteger(count) && count >= minimum).length;
}

function validSplitCounts(training, minimumDomains) {
  const counts = training?.splitCounts;
  const domainCounts = training?.splitDomainCounts;
  const splitCountsValid = ['train', 'valid', 'test'].every(
    (split) => Number.isSafeInteger(counts?.[split]) && counts[split] > 0,
  );
  const splitTotal = ['train', 'valid', 'test'].reduce((sum, split) => sum + Number(counts?.[split] || 0), 0);
  const splitDomainsValid = ['train', 'valid', 'test'].every(
    (split) => Number.isSafeInteger(domainCounts?.[split]) && domainCounts[split] >= minimumDomains,
  );
  return splitCountsValid && splitTotal === training?.pairCount && splitDomainsValid;
}

function isLessonKernelProductionProfile(training) {
  const families = Array.isArray(training?.taskScope?.families) ? training.taskScope.families : [];
  return (
    training?.taskScope?.mode === 'allowlist' &&
    training?.taskScope?.unclassifiedPolicy === 'base-only' &&
    training?.taskScope?.compositePolicy === 'exact-family-only' &&
    families.length === 1 &&
    families[0]?.id === SCION_ADAPTER_TASK_FAMILIES.SOURCE_GROUNDED_LESSON_KERNEL &&
    Number.isSafeInteger(training?.pairCount) &&
    training.pairCount < 3000 &&
    families[0]?.rows === training.pairCount
  );
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
  if (!SUPPORTED_SCION_ADAPTER_MANIFEST_SCHEMA_VERSIONS.has(manifest.schemaVersion)) issues.push('schema-version');
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
  if (
    ['smoke', 'research', 'candidate', 'rejected'].includes(promotionStatus) &&
    manifest.promotion?.promotable !== false
  ) {
    issues.push(`${promotionStatus || 'unknown'}-must-not-promote`);
  }
  if (promotionStatus === 'promoted' && manifest.promotion?.promotable !== true) issues.push('promoted-flag');
  if (
    manifest.schemaVersion < SCION_ADAPTER_MANIFEST_SCHEMA_VERSION &&
    !['smoke', 'rejected'].includes(promotionStatus)
  ) {
    issues.push('legacy-schema-mechanical-only');
  }
  const requiresTrainingRun = ['research', 'candidate', 'promoted'].includes(promotionStatus);
  if (requiresTrainingRun || manifest.training?.taskScope != null) {
    const scopeValidation = validateScionAdapterTaskScope(manifest.training?.taskScope, {
      expectedRows: manifest.training?.pairCount,
    });
    issues.push(...scopeValidation.issues);
  }
  const trainingRun = manifest.training?.run;
  if (requiresTrainingRun && manifest.schemaVersion !== SCION_ADAPTER_MANIFEST_SCHEMA_VERSION) {
    issues.push('training-run-schema-version');
  }
  if (requiresTrainingRun || trainingRun != null) {
    if (!trainingRun || typeof trainingRun !== 'object' || Array.isArray(trainingRun)) {
      issues.push('training-run-missing');
    } else {
      const expectedLane =
        promotionStatus === 'research' ? 'research' : promotionStatus === 'smoke' ? 'smoke' : 'production';
      if (clean(trainingRun.protocol) !== 'scion-adapter-training-run-v1') issues.push('training-run-protocol');
      if (clean(trainingRun.lane) !== expectedLane) issues.push('training-run-lane');
      if (!Number.isSafeInteger(trainingRun.seed) || trainingRun.seed < 0 || trainingRun.seed > 0xffffffff) {
        issues.push('training-run-seed');
      }
      for (const key of [
        'planSha256',
        'planIdentitySha256',
        'resultSha256',
        'resultIdentitySha256',
        'datasetIdentitySha256',
        'toolchainPolicySha256',
      ]) {
        if (!SHA256_RE.test(clean(trainingRun[key]))) issues.push(`training-run-${key}`);
      }
      if (!REVISION_RE.test(clean(trainingRun.repositoryCommit))) issues.push('training-run-repository-commit');
      if (!REVISION_RE.test(clean(trainingRun.repositoryTree))) issues.push('training-run-repository-tree');
      if (trainingRun.repositoryDirty !== false) issues.push('training-run-repository-dirty');
      if (!SHA256_RE.test(clean(manifest.training?.datasetIdentitySha256))) issues.push('dataset-identity-sha256');
      if (clean(manifest.training?.datasetIdentitySha256) !== clean(trainingRun.datasetIdentitySha256)) {
        issues.push('training-run-dataset-identity-mismatch');
      }
      const planPath = clean(trainingRun.planPath).replaceAll('\\', '/');
      const resultPath = clean(trainingRun.resultPath).replaceAll('\\', '/');
      if (!safeRelativePath(planPath)) issues.push('training-run-plan-path');
      if (!safeRelativePath(resultPath)) issues.push('training-run-result-path');
      if (planPath === resultPath) issues.push('training-run-receipt-path-collision');
      const planFile = files.find((file) => clean(file?.path).replaceAll('\\', '/') === planPath);
      const resultFile = files.find((file) => clean(file?.path).replaceAll('\\', '/') === resultPath);
      if (!planFile) issues.push('training-run-plan-unbound');
      else if (clean(planFile.sha256) !== clean(trainingRun.planSha256))
        issues.push('training-run-plan-sha256-mismatch');
      if (!resultFile) issues.push('training-run-result-unbound');
      else if (clean(resultFile.sha256) !== clean(trainingRun.resultSha256)) {
        issues.push('training-run-result-sha256-mismatch');
      }
    }
  }
  if (
    promotionStatus === 'promoted' &&
    !(Array.isArray(manifest.promotion?.evidence) ? manifest.promotion.evidence : []).some(
      (entry) => entry?.type === 'promotion-audit' && entry?.status === 'pass' && SHA256_RE.test(clean(entry?.sha256)),
    )
  ) {
    issues.push('promotion-audit-attestation');
  }
  if (promotionStatus === 'candidate' || promotionStatus === 'promoted') {
    const lessonKernelProfile = isLessonKernelProductionProfile(manifest.training);
    const minimums = lessonKernelProfile
      ? {
          pairs: 100,
          domains: 7,
          groups: 14,
          modelJudgePairs: 100,
          modelJudgeDomains: 7,
          groupsPerDomain: 2,
          modelJudgePairsPerDomain: 8,
          splitDomains: 7,
        }
      : {
          pairs: 3000,
          domains: 5,
          groups: 15,
          modelJudgePairs: 100,
          modelJudgeDomains: 5,
          groupsPerDomain: 3,
          modelJudgePairsPerDomain: 20,
          splitDomains: 5,
        };
    if (clean(manifest.training?.datasetStatus) !== 'ready') issues.push('candidate-dataset-not-ready');
    if (clean(manifest.training?.primaryPreferenceEvidence) !== 'single-model-judge') {
      issues.push('candidate-primary-preference-evidence');
    }
    if (!Number.isSafeInteger(manifest.training?.pairCount) || manifest.training.pairCount < minimums.pairs) {
      issues.push('candidate-pair-count');
    }
    if (!Number.isSafeInteger(manifest.training?.domainCount) || manifest.training.domainCount < minimums.domains) {
      issues.push('candidate-domain-count');
    }
    if (!Number.isSafeInteger(manifest.training?.groupCount) || manifest.training.groupCount < minimums.groups) {
      issues.push('candidate-group-count');
    }
    if (
      !Number.isSafeInteger(manifest.training?.modelJudgePairCount) ||
      manifest.training.modelJudgePairCount < minimums.modelJudgePairs
    ) {
      issues.push('candidate-model-judge-pair-count');
    }
    if (
      !Number.isSafeInteger(manifest.training?.modelJudgeDomainCount) ||
      manifest.training.modelJudgeDomainCount < minimums.modelJudgeDomains
    ) {
      issues.push('candidate-model-judge-domain-count');
    }
    if (countDomainsAtLeast(manifest.training?.domainGroupCounts, minimums.groupsPerDomain) < minimums.domains) {
      issues.push('candidate-domain-group-coverage');
    }
    if (
      countDomainsAtLeast(manifest.training?.modelJudgeDomainCounts, minimums.modelJudgePairsPerDomain) <
      minimums.modelJudgeDomains
    ) {
      issues.push('candidate-model-judge-domain-coverage');
    }
    if (!validSplitCounts(manifest.training, minimums.splitDomains)) issues.push('candidate-split-coverage');
  }
  if (promotionStatus === 'research') {
    if (clean(manifest.training?.datasetStatus) !== 'research-ready') issues.push('research-dataset-not-ready');
    if (clean(manifest.training?.primaryPreferenceEvidence) !== 'single-model-judge') {
      issues.push('research-primary-preference-evidence');
    }
    if (!Number.isSafeInteger(manifest.training?.pairCount) || manifest.training.pairCount < 100) {
      issues.push('research-pair-count');
    }
    if (!Number.isSafeInteger(manifest.training?.domainCount) || manifest.training.domainCount < 4) {
      issues.push('research-domain-count');
    }
    if (!Number.isSafeInteger(manifest.training?.groupCount) || manifest.training.groupCount < 12) {
      issues.push('research-group-count');
    }
    if (!Number.isSafeInteger(manifest.training?.modelJudgePairCount) || manifest.training.modelJudgePairCount < 100) {
      issues.push('research-model-judge-pair-count');
    }
    if (
      !Number.isSafeInteger(manifest.training?.modelJudgeDomainCount) ||
      manifest.training.modelJudgeDomainCount < 4
    ) {
      issues.push('research-model-judge-domain-count');
    }
    if (countDomainsAtLeast(manifest.training?.domainGroupCounts, 3) < 4) {
      issues.push('research-domain-group-coverage');
    }
    if (countDomainsAtLeast(manifest.training?.modelJudgeDomainCounts, 20) < 4) {
      issues.push('research-model-judge-domain-coverage');
    }
    if (!validSplitCounts(manifest.training, 4)) issues.push('research-split-coverage');
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

  const format = clean(manifest.adapter?.format);
  if (format === 'gguf-lora') {
    const declaredTotalBytes = files.reduce(
      (sum, file) => sum + (Number.isSafeInteger(file?.bytes) && file.bytes > 0 ? file.bytes : 0),
      0,
    );
    if (declaredTotalBytes > SCION_BROWSER_ADAPTER_MAX_TOTAL_BYTES) {
      issues.push('gguf-browser-size-budget');
    }
    if (declaredTotalBytes / SCION_GEMMA4_E2B_BROWSER_BASE_BYTES > SCION_BROWSER_ADAPTER_MAX_BASE_FRACTION) {
      issues.push('gguf-browser-base-fraction');
    }
    const scale = Number(manifest.adapter?.scale);
    if (!Number.isFinite(scale) || scale < 0.05 || scale > 16) issues.push('gguf-adapter-scale');
    const ggufFiles = files.filter((file) => clean(file?.path).toLowerCase().endsWith('.gguf'));
    if (ggufFiles.length !== 1) issues.push('gguf-adapter-file-count');
    const conversion = manifest.conversion;
    if (!conversion || typeof conversion !== 'object' || Array.isArray(conversion)) {
      issues.push('gguf-conversion-missing');
    } else {
      if (clean(conversion.pipeline) !== SCION_BROWSER_ADAPTER_CONVERSION_PIPELINE) {
        issues.push('gguf-conversion-pipeline');
      }
      if (!ADAPTER_ID_RE.test(clean(conversion.sourceAdapterId))) issues.push('gguf-source-adapter-id');
      if (!SHA256_RE.test(clean(conversion.sourceManifestSha256))) issues.push('gguf-source-manifest-sha256');
      const receiptPath = clean(conversion.receiptPath).replaceAll('\\', '/');
      if (!safeRelativePath(receiptPath)) issues.push('gguf-conversion-receipt-path');
      if (!paths.has(receiptPath)) issues.push('gguf-conversion-receipt-unbound');
      if (clean(conversion.converter?.id) !== 'ggml-org/llama.cpp/convert_lora_to_gguf.py') {
        issues.push('gguf-converter-id');
      }
      if (clean(conversion.converter?.revision) !== SCION_LLAMA_CPP_REVISION) {
        issues.push('gguf-converter-revision');
      }
      if (clean(conversion.converter?.sha256) !== SCION_LLAMA_CPP_LORA_CONVERTER_SHA256) {
        issues.push('gguf-converter-sha256');
      }
      if (clean(conversion.converter?.outputType) !== 'f16') issues.push('gguf-converter-output-type');
    }
    if (!runtimeIds.includes('scion-wllama-webgpu-jspi-v1')) issues.push('gguf-browser-runtime-missing');
    if (requiresTrainingRun) {
      if (!ADAPTER_ID_RE.test(clean(trainingRun?.sourceAdapterId))) issues.push('gguf-training-source-adapter-id');
      if (clean(trainingRun?.sourceAdapterId) !== clean(manifest.conversion?.sourceAdapterId)) {
        issues.push('gguf-training-source-adapter-mismatch');
      }
      if (!SHA256_RE.test(clean(trainingRun?.sourceManifestSha256))) {
        issues.push('gguf-training-source-manifest-sha256');
      }
      if (clean(trainingRun?.sourceManifestSha256) !== clean(manifest.conversion?.sourceManifestSha256)) {
        issues.push('gguf-training-source-manifest-mismatch');
      }
      const sourceManifestPath = clean(trainingRun?.sourceManifestPath).replaceAll('\\', '/');
      if (!safeRelativePath(sourceManifestPath)) issues.push('gguf-training-source-manifest-path');
      const sourceManifestFile = files.find((file) => clean(file?.path).replaceAll('\\', '/') === sourceManifestPath);
      if (!sourceManifestFile) issues.push('gguf-training-source-manifest-unbound');
      else if (clean(sourceManifestFile.sha256) !== clean(trainingRun?.sourceManifestSha256)) {
        issues.push('gguf-training-source-manifest-file-mismatch');
      }
    }
  } else if (manifest.conversion != null) {
    issues.push('conversion-only-valid-for-gguf');
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

export function resolveScionAdapterTaskRoute(options = {}) {
  return resolveTaskRoute(options);
}
