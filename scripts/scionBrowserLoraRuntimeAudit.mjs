import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const provenancePath = path.join(root, 'runtime/scion-wllama/upstream.json');
const evidencePath = path.join(root, 'evaluation/scion-adapters/evidence/browser-lora-canary-v0.16.7.json');
const baseContractPath = path.join(root, 'evaluation/scion-adapters/base-contracts/gemma-4-e2b.json');

async function json(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function digest(file) {
  const bytes = await readFile(file);
  return createHash('sha256').update(bytes).digest('hex');
}

function check(assertions, name, pass, details) {
  assertions.push({ name, pass: Boolean(pass), ...(details ? { details } : {}) });
}

const [provenance, evidence, baseContract] = await Promise.all([
  json(provenancePath),
  json(evidencePath),
  json(baseContractPath),
]);
const assertions = [];

check(assertions, 'runtime-id', provenance.runtimeId === 'scion-wllama-webgpu-jspi-v1');
check(assertions, 'mechanical-only-status', provenance.status === 'experimental-mechanical-canary');
check(assertions, 'evidence-not-promotable', evidence.promotable === false);
check(assertions, 'direct-public-url-passed', evidence.distribution?.directPinnedPublicUrl === 'pass');
check(
  assertions,
  'direct-public-byte-count',
  evidence.distribution?.downloadedBytes === baseContract.browserArtifact?.bytes &&
    evidence.distribution?.reportedTotalBytes === baseContract.browserArtifact?.bytes,
);
check(assertions, 'local-split-canary-passed', evidence.distribution?.localSplitCanary === 'pass');
check(
  assertions,
  'non-isolated-single-thread-canary',
  evidence.browser?.crossOriginIsolationRequired === false &&
    evidence.browser?.nonIsolatedSingleThreadCanary?.status === 'pass' &&
    evidence.browser?.nonIsolatedSingleThreadCanary?.crossOriginIsolated === false,
);
check(assertions, 'runtime-matches-evidence', evidence.runtime?.id === provenance.runtimeId);
check(
  assertions,
  'base-digest-bound',
  evidence.base?.sha256 === baseContract.browserArtifact?.sha256 &&
    baseContract.browserArtifact?.integrityStatus === 'full-file-digest-verified',
);
check(
  assertions,
  'qat-training-base-bound',
  baseContract.trainingBase?.modelId === 'google/gemma-4-E2B-it-qat-q4_0-unquantized' &&
    baseContract.browserArtifact?.declaredBaseModelId === baseContract.trainingBase?.modelId,
);
check(
  assertions,
  'prompt-contract-fixed',
  evidence.promptContract?.runtimeJinjaFormatterOutput === '' &&
    evidence.promptContract?.nativeReferenceMatched === true,
);

for (const key of [
  'directPublicModelLoaded',
  'baseLoaded',
  'webgpuActive',
  'baseStartsWithoutAdapter',
  'adapterDigestMatched',
  'nativeAdapterActive',
  'nativeAdapterTypeMatched',
  'outputChanged',
  'adapterCleared',
  'rollbackRestoredExactBaseOutput',
  'baseOutputCoherentAfterPromptFix',
]) {
  check(assertions, `browser-check:${key}`, evidence.checks?.[key] === true);
}

for (const artifact of [provenance.patch, ...provenance.artifacts]) {
  const absolute = path.join(root, artifact.path);
  const [fileStat, sha256] = await Promise.all([stat(absolute), digest(absolute)]);
  check(assertions, `artifact-bytes:${artifact.path}`, fileStat.size === artifact.bytes, {
    expected: artifact.bytes,
    actual: fileStat.size,
  });
  check(assertions, `artifact-sha256:${artifact.path}`, sha256 === artifact.sha256, {
    expected: artifact.sha256,
    actual: sha256,
  });
}

const failed = assertions.filter((entry) => !entry.pass);
const report = {
  schemaVersion: 1,
  audit: 'scion-browser-lora-runtime',
  status: failed.length === 0 ? 'pass-mechanical-only' : 'fail',
  promotionEligible: false,
  directPublicDownloadProven: evidence.distribution?.directPinnedPublicUrl === 'pass',
  assertions,
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) process.exitCode = 1;
