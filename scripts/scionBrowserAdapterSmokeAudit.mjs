#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  SCION_ADAPTER_MANIFEST_SCHEMA_VERSION,
  SCION_BROWSER_ADAPTER_CONVERSION_PIPELINE,
  SCION_GEMMA4_E2B_BASE,
  SCION_LLAMA_CPP_LORA_CONVERTER_SHA256,
  SCION_LLAMA_CPP_REVISION,
} from '../src/lib/scionAdapterManifest.js';
import { SCION_BROWSER_GEMMA4_GGUF, SCION_BROWSER_WLLAMA_RUNTIME_ID } from '../src/lib/scionBrowserConstants.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidencePath = path.resolve(
  process.argv[2] || path.join(root, 'evaluation/scion-adapters/evidence/browser-adapter-smoke-v0.16.7.json'),
);
const SHA256 = /^[a-f0-9]{64}$/;

function assertion(assertions, name, pass, details) {
  assertions.push({ name, pass: Boolean(pass), ...(details ? { details } : {}) });
}

const evidence = JSON.parse(await fs.readFile(evidencePath, 'utf8'));
const assertions = [];
assertion(assertions, 'evidence-type', evidence.evidenceType === 'scion-browser-adapter-smoke');
assertion(assertions, 'mechanical-only', evidence.status === 'pass-mechanical-only');
assertion(assertions, 'not-promotion-evidence', evidence.promotionEligible === false);
assertion(
  assertions,
  'adapter-smoke-only',
  evidence.adapter?.promotionStatus === 'smoke' && evidence.adapter?.promotable === false,
);
assertion(
  assertions,
  'manifest-schema',
  evidence.adapter?.manifestSchemaVersion === SCION_ADAPTER_MANIFEST_SCHEMA_VERSION,
);
assertion(
  assertions,
  'artifact-identity',
  evidence.adapter?.artifact?.bytes > 1024 &&
    evidence.adapter.artifact.bytes < 256 * 1024 * 1024 &&
    SHA256.test(evidence.adapter.artifact.sha256) &&
    SHA256.test(evidence.adapter.manifestSha256),
);
assertion(
  assertions,
  'training-base-pinned',
  evidence.base?.trainingModelId === SCION_GEMMA4_E2B_BASE.modelId &&
    evidence.base?.trainingRevision === SCION_GEMMA4_E2B_BASE.revision,
);
assertion(
  assertions,
  'browser-base-pinned',
  evidence.base?.browserModelId === SCION_BROWSER_GEMMA4_GGUF.runtimeArtifact.modelId &&
    evidence.base?.browserRevision === SCION_BROWSER_GEMMA4_GGUF.runtimeArtifact.revision &&
    evidence.base?.browserSha256 === SCION_BROWSER_GEMMA4_GGUF.runtimeArtifact.sha256,
);
assertion(
  assertions,
  'dataset-remains-smoke',
  evidence.source?.datasetStatus === 'smoke-only' &&
    evidence.source?.verifiedPairCount === 101 &&
    evidence.source?.requiredProductionPairCount === 3000 &&
    evidence.source?.verifiedPairCount < evidence.source?.requiredProductionPairCount &&
    evidence.source?.domainCount === 5,
);
assertion(
  assertions,
  'conversion-pinned',
  evidence.conversion?.pipeline === SCION_BROWSER_ADAPTER_CONVERSION_PIPELINE &&
    evidence.conversion?.llamaCppRevision === SCION_LLAMA_CPP_REVISION &&
    evidence.conversion?.converterSha256 === SCION_LLAMA_CPP_LORA_CONVERTER_SHA256,
);
assertion(
  assertions,
  'gguf-semantics',
  evidence.conversion?.ggufMetadata?.version === 3 &&
    evidence.conversion?.ggufMetadata?.architecture === 'gemma4' &&
    evidence.conversion?.ggufMetadata?.type === 'adapter' &&
    evidence.conversion?.ggufMetadata?.adapterType === 'lora' &&
    evidence.conversion?.tensorCount === 552 &&
    evidence.conversion?.pairCount === 276 &&
    evidence.conversion?.tensorType === 'F16',
);
assertion(assertions, 'browser-runtime-pinned', evidence.browser?.runtimeId === SCION_BROWSER_WLLAMA_RUNTIME_ID);
const trials = evidence.browser?.scaleTrials || [];
assertion(
  assertions,
  'honest-scale-trials',
  trials.length === 3 &&
    trials[0]?.scale === 1 &&
    trials[0]?.nativeAdapterActive === true &&
    trials[0]?.outputChanged === false &&
    trials[1]?.scale === 4 &&
    trials[1]?.nativeAdapterActive === true &&
    trials[1]?.outputChanged === false &&
    trials[2]?.scale === 16 &&
    trials[2]?.nativeAdapterActive === true &&
    trials[2]?.outputChanged === true &&
    trials.every((trial) => trial.rollbackRestoredExactBaseOutput === true),
);
assertion(
  assertions,
  'proof-hash',
  trials[2]?.status === 'pass-mechanical-only' && SHA256.test(trials[2]?.proofSha256 || ''),
);
assertion(
  assertions,
  'rollback-final-state',
  evidence.browser?.finalState?.mode === 'base-only' &&
    evidence.browser?.finalState?.adapterActive === false &&
    evidence.browser?.finalState?.nativeAdapterActive === false,
);
assertion(assertions, 'non-claims-present', Array.isArray(evidence.nonClaims) && evidence.nonClaims.length >= 4);

const failed = assertions.filter((entry) => !entry.pass);
const report = {
  schemaVersion: 1,
  audit: 'scion-browser-adapter-smoke',
  status: failed.length === 0 ? 'pass-mechanical-only' : 'fail',
  promotionEligible: false,
  evidencePath,
  assertions,
};
console.log(JSON.stringify(report, null, 2));
if (failed.length) process.exitCode = 1;
