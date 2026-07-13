import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { SCION_BROWSER_GEMMA4_GGUF, SCION_BROWSER_WLLAMA_RUNTIME_ID } from '../../src/lib/scionBrowserConstants.js';
import { validateScionAdapterManifest } from '../../src/lib/scionAdapterManifest.js';

export const SCION_BROWSER_DEVICE_MATRIX_PROTOCOL = 'scion-browser-device-matrix-v1';
export const SCION_BROWSER_DEVICE_EVIDENCE_TYPE = 'scion-browser-device-matrix';
export const SCION_ADAPTER_PACKAGE_IDENTITY_ALGORITHM = 'scion-adapter-package-identity-v1';

const SHA256 = /^[a-f0-9]{64}$/;
const RUN_ID = /^[a-z0-9][a-z0-9._:-]{2,127}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function clean(value) {
  return String(value ?? '').trim();
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((key) => value[key] !== undefined)
        .map((key) => [key, canonicalValue(value[key])]),
    );
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

export function sha256Text(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function computeScionAdapterPackageIdentity(manifest) {
  const payload = {
    algorithm: SCION_ADAPTER_PACKAGE_IDENTITY_ALGORITHM,
    schemaVersion: manifest?.schemaVersion,
    adapter: manifest?.adapter,
    base: manifest?.base,
    training: manifest?.training,
    files: manifest?.files,
    runtime: manifest?.runtime,
    conversion: manifest?.conversion ?? null,
  };
  return {
    algorithm: SCION_ADAPTER_PACKAGE_IDENTITY_ALGORITHM,
    sha256: sha256Text(canonicalJson(payload)),
    payload,
  };
}

export function computeScionBrowserDeviceRunDigest(run) {
  const payload = structuredClone(run || {});
  delete payload.runDigestSha256;
  return sha256Text(canonicalJson(payload));
}

function safeRelativePath(value) {
  const normalized = clean(value).replaceAll('\\', '/');
  if (!normalized || normalized.startsWith('/') || /^[a-z]:\//i.test(normalized)) return false;
  return normalized.split('/').every((part) => part && part !== '.' && part !== '..');
}

function issueWhen(issues, condition, issue) {
  if (condition) issues.push(issue);
}

function profileIndex(protocol) {
  return new Map((protocol?.requiredDeviceProfiles || []).map((profile) => [clean(profile?.id), profile]));
}

function validateProtocol(protocol) {
  const issues = [];
  issueWhen(issues, protocol?.schemaVersion !== 1, 'protocol:schema-version');
  issueWhen(issues, protocol?.protocolVersion !== SCION_BROWSER_DEVICE_MATRIX_PROTOCOL, 'protocol:version');
  issueWhen(issues, protocol?.evidenceType !== SCION_BROWSER_DEVICE_EVIDENCE_TYPE, 'protocol:evidence-type');
  issueWhen(
    issues,
    protocol?.adapterIdentityAlgorithm !== SCION_ADAPTER_PACKAGE_IDENTITY_ALGORITHM,
    'protocol:adapter-identity-algorithm',
  );
  const profiles = Array.isArray(protocol?.requiredDeviceProfiles) ? protocol.requiredDeviceProfiles : [];
  issueWhen(issues, profiles.length < 4, 'protocol:device-profile-count');
  issueWhen(
    issues,
    new Set(profiles.map((entry) => clean(entry?.id))).size !== profiles.length,
    'protocol:duplicate-profile',
  );
  const requiredClasses = new Set(profiles.flatMap((entry) => entry?.gpuClasses || []));
  issueWhen(issues, !requiredClasses.has('integrated'), 'protocol:missing-integrated-gpu');
  issueWhen(issues, !requiredClasses.has('discrete'), 'protocol:missing-discrete-gpu');
  issueWhen(
    issues,
    !profiles.some((entry) => (entry?.browserFamilies || []).includes('chrome')),
    'protocol:missing-chrome',
  );
  issueWhen(
    issues,
    !profiles.some((entry) => (entry?.browserFamilies || []).includes('edge')),
    'protocol:missing-edge',
  );
  issueWhen(
    issues,
    !Array.isArray(protocol?.requiredScenarios) || protocol.requiredScenarios.length < 10,
    'protocol:required-scenarios',
  );
  issueWhen(
    issues,
    !Array.isArray(protocol?.requiredArtifactTypes) || protocol.requiredArtifactTypes.length < 4,
    'protocol:required-artifacts',
  );
  issueWhen(
    issues,
    !Number.isSafeInteger(protocol?.minimumRepeatedCompletions) || protocol.minimumRepeatedCompletions < 3,
    'protocol:repeat-count',
  );
  return [...new Set(issues)];
}

function validateEnvironment(run, profile) {
  const issues = [];
  const browser = run?.environment?.browser || {};
  const os = run?.environment?.os || {};
  const hardware = run?.environment?.hardware || {};
  const family = clean(browser.family).toLowerCase();
  const gpuClass = clean(hardware.gpuClass).toLowerCase();
  const systemMemoryGiB = Number(hardware.systemMemoryGiB);
  const dedicatedGpuMemoryGiB = Number(hardware.dedicatedGpuMemoryGiB);
  issueWhen(issues, !(profile?.browserFamilies || []).includes(family), 'browser-family');
  issueWhen(issues, !/^\d+(?:\.\d+){1,3}$/.test(clean(browser.version)), 'browser-version');
  issueWhen(issues, !clean(browser.userAgent), 'browser-user-agent');
  issueWhen(issues, !clean(os.family) || !clean(os.version) || !clean(os.architecture), 'os-identity');
  issueWhen(issues, !(profile?.gpuClasses || []).includes(gpuClass), 'gpu-class');
  issueWhen(issues, !clean(hardware.gpuVendor) || !clean(hardware.gpuModel), 'gpu-identity');
  issueWhen(issues, !Number.isFinite(systemMemoryGiB), 'system-memory');
  issueWhen(issues, systemMemoryGiB < Number(profile?.minimumSystemMemoryGiB || 0), 'system-memory-below-profile');
  issueWhen(
    issues,
    Number.isFinite(Number(profile?.maximumSystemMemoryGiB)) &&
      systemMemoryGiB > Number(profile.maximumSystemMemoryGiB),
    'system-memory-above-profile',
  );
  issueWhen(
    issues,
    Number.isFinite(Number(profile?.minimumDedicatedGpuMemoryGiB)) &&
      (!Number.isFinite(dedicatedGpuMemoryGiB) || dedicatedGpuMemoryGiB < profile.minimumDedicatedGpuMemoryGiB),
    'dedicated-gpu-memory-below-profile',
  );
  return issues;
}

function validRecovery(value, allowedMethods) {
  return (
    value?.completed === true &&
    value?.baseUsableAfterRecovery === true &&
    (allowedMethods || []).includes(clean(value?.method))
  );
}

function validateScenarios(run, protocol, profile, expectedBrowserArtifact, expectedAdapterSha256) {
  const issues = [];
  const checks = run?.checks || {};
  const measurements = run?.measurements || {};
  const recovery = checks.recovery || {};
  const browserMemory = Number(measurements.peakBrowserWorkingSetMiB);
  const gpuMemory = Number(measurements.peakGpuMemoryMiB);
  const systemMemoryMiB = Number(run?.environment?.hardware?.systemMemoryGiB) * 1024;
  const dedicatedGpuMemoryMiB = Number(run?.environment?.hardware?.dedicatedGpuMemoryGiB) * 1024;

  issueWhen(issues, checks.capability?.webgpu !== true || checks.capability?.jspi !== true, 'capability');
  issueWhen(
    issues,
    checks.coldBaseLoad?.completed !== true ||
      checks.coldBaseLoad?.directPinnedPublicUrl !== true ||
      checks.coldBaseLoad?.modelBackendRequired !== false ||
      checks.coldBaseLoad?.baseSha256Verified !== true ||
      clean(checks.coldBaseLoad?.baseSha256) !== clean(expectedBrowserArtifact?.sha256) ||
      clean(checks.coldBaseLoad?.runtimeMetadataArchitecture) !== 'gemma4' ||
      clean(checks.coldBaseLoad?.runtimeMetadataType) !== 'model' ||
      Number(checks.coldBaseLoad?.downloadedBytes) !== expectedBrowserArtifact?.bytes ||
      Number(checks.coldBaseLoad?.reportedTotalBytes) !== expectedBrowserArtifact?.bytes ||
      !Number.isFinite(Number(checks.coldBaseLoad?.durationMs)) ||
      Number(checks.coldBaseLoad.durationMs) <= 0,
    'cold-base-load',
  );
  issueWhen(
    issues,
    checks.warmBaseLoad?.completed !== true ||
      !Number.isFinite(Number(checks.warmBaseLoad?.durationMs)) ||
      Number(checks.warmBaseLoad.durationMs) <= 0 ||
      Number(checks.warmBaseLoad.durationMs) > Number(profile?.maximumWarmLoadMs),
    'warm-base-load',
  );
  for (const key of ['baseCompletion', 'adapterCompletion']) {
    const completion = checks[key] || {};
    issueWhen(
      issues,
      completion.completed !== true ||
        completion.validOutput !== true ||
        !SHA256.test(clean(completion.outputSha256)) ||
        !Number.isFinite(Number(completion.firstTokenMs)) ||
        Number(completion.firstTokenMs) <= 0 ||
        Number(completion.firstTokenMs) > Number(profile?.maximumFirstTokenMs) ||
        !Number.isFinite(Number(completion.totalMs)) ||
        Number(completion.totalMs) < Number(completion.firstTokenMs) ||
        Number(completion.totalMs) > Number(profile?.maximumCompletionMs),
      key === 'baseCompletion' ? 'base-completion' : 'adapter-completion',
    );
  }
  issueWhen(
    issues,
    checks.adapterIntegrity?.digestMatched !== true ||
      checks.adapterIntegrity?.manifestVerified !== true ||
      clean(checks.adapterIntegrity?.adapterSha256) !== clean(expectedAdapterSha256),
    'adapter-integrity',
  );
  issueWhen(
    issues,
    checks.adapterActivation?.completed !== true ||
      checks.adapterActivation?.nativeAdapterActive !== true ||
      checks.adapterActivation?.nativeMetadataMatched !== true ||
      clean(checks.adapterActivation?.nativeMetadata?.generalType) !== 'adapter' ||
      clean(checks.adapterActivation?.nativeMetadata?.adapterType) !== 'lora' ||
      clean(checks.adapterActivation?.nativeMetadata?.architecture) !== 'gemma4' ||
      checks.adapterActivation?.outputChangedAtManifestScale !== true ||
      !Number.isFinite(Number(checks.adapterActivation?.durationMs)) ||
      Number(checks.adapterActivation.durationMs) <= 0 ||
      Number(checks.adapterActivation.durationMs) > Number(profile?.maximumCompletionMs),
    'adapter-activation',
  );
  issueWhen(
    issues,
    clean(checks.adapterCompletion?.outputSha256) === clean(checks.baseCompletion?.outputSha256),
    'adapter-output-unchanged',
  );
  issueWhen(
    issues,
    checks.rollback?.completed !== true ||
      checks.rollback?.nativeAdapterInactive !== true ||
      checks.rollback?.exactBaseOutputRestored !== true ||
      checks.rollback?.projectDataUnchanged !== true ||
      !SHA256.test(clean(checks.rollback?.outputSha256)) ||
      clean(checks.rollback?.outputSha256) !== clean(checks.baseCompletion?.outputSha256) ||
      !SHA256.test(clean(checks.rollback?.projectDataBeforeSha256)) ||
      clean(checks.rollback?.projectDataBeforeSha256) !== clean(checks.rollback?.projectDataAfterSha256),
    'rollback',
  );
  issueWhen(
    issues,
    !validRecovery(recovery.interruptedDownload, protocol?.allowedRecoveryMethods?.interruptedDownload),
    'interrupted-download-recovery',
  );
  issueWhen(
    issues,
    !validRecovery(recovery.storagePressure, protocol?.allowedRecoveryMethods?.storagePressure),
    'storage-pressure-recovery',
  );
  issueWhen(
    issues,
    !validRecovery(recovery.deviceLoss, protocol?.allowedRecoveryMethods?.deviceLoss),
    'device-loss-recovery',
  );
  const repeated = checks.repeatCompletion || {};
  issueWhen(
    issues,
    !Number.isSafeInteger(repeated.attempts) ||
      repeated.attempts < protocol.minimumRepeatedCompletions ||
      repeated.completed !== repeated.attempts ||
      repeated.validOutputs !== repeated.attempts,
    'repeat-completion',
  );
  issueWhen(
    issues,
    !Number.isFinite(browserMemory) ||
      browserMemory <= 0 ||
      browserMemory > systemMemoryMiB * Number(profile?.maximumBrowserMemoryFraction),
    'browser-memory-budget',
  );
  if (Number.isFinite(Number(profile?.minimumDedicatedGpuMemoryGiB))) {
    issueWhen(
      issues,
      !Number.isFinite(gpuMemory) ||
        gpuMemory <= 0 ||
        gpuMemory > dedicatedGpuMemoryMiB * Number(profile?.maximumGpuMemoryFraction),
      'gpu-memory-budget',
    );
  }
  return issues;
}

async function validateArtifacts(run, protocol, evidenceDir, verifyArtifacts) {
  const issues = [];
  const artifacts = Array.isArray(run?.artifacts) ? run.artifacts : [];
  const types = new Set();
  const paths = new Set();
  const verified = [];
  for (const artifact of artifacts) {
    const type = clean(artifact?.type);
    const relativePath = clean(artifact?.path).replaceAll('\\', '/');
    if (types.has(type)) issues.push(`duplicate-artifact-type:${type || '?'}`);
    if (paths.has(relativePath)) issues.push(`duplicate-artifact-path:${relativePath || '?'}`);
    types.add(type);
    paths.add(relativePath);
    if (!safeRelativePath(relativePath)) {
      issues.push(`artifact-path:${relativePath || '?'}`);
      continue;
    }
    if (!Number.isSafeInteger(artifact?.bytes) || artifact.bytes <= 0) issues.push(`artifact-bytes:${relativePath}`);
    if (!SHA256.test(clean(artifact?.sha256))) issues.push(`artifact-sha256:${relativePath}`);
    if (!verifyArtifacts) continue;
    try {
      const absolutePath = path.resolve(evidenceDir, relativePath);
      const relativeToEvidence = path.relative(evidenceDir, absolutePath);
      if (relativeToEvidence.startsWith('..') || path.isAbsolute(relativeToEvidence)) {
        throw new Error('artifact escapes evidence directory');
      }
      const stats = await fs.lstat(absolutePath);
      if (!stats.isFile() || stats.isSymbolicLink()) throw new Error('artifact must be a regular file');
      const bytes = await fs.readFile(absolutePath);
      const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
      if (stats.size !== artifact.bytes) issues.push(`artifact-bytes-mismatch:${relativePath}`);
      if (sha256 !== artifact.sha256) issues.push(`artifact-sha256-mismatch:${relativePath}`);
      verified.push({ type, path: relativePath, bytes: stats.size, sha256 });
    } catch (error) {
      issues.push(`artifact-read:${relativePath}:${clean(error?.message || error)}`);
    }
  }
  for (const type of protocol?.requiredArtifactTypes || []) {
    if (!types.has(type)) issues.push(`missing-artifact-type:${type}`);
  }
  return { issues, verified };
}

export async function auditScionBrowserDeviceMatrix({
  protocol,
  protocolSha256,
  evidence,
  evidencePath,
  adapterManifest,
  verifyArtifacts = true,
} = {}) {
  const issues = validateProtocol(protocol);
  const manifestValidation = validateScionAdapterManifest(adapterManifest);
  const packageIdentity = computeScionAdapterPackageIdentity(adapterManifest);
  const evidenceDir = path.dirname(path.resolve(evidencePath || '.'));
  issueWhen(issues, manifestValidation.valid !== true, `manifest:${manifestValidation.issues.join(',') || 'invalid'}`);
  issueWhen(issues, adapterManifest?.adapter?.format !== 'gguf-lora', 'manifest:not-browser-gguf-lora');
  issueWhen(issues, evidence?.schemaVersion !== 1, 'evidence:schema-version');
  issueWhen(issues, evidence?.evidenceType !== SCION_BROWSER_DEVICE_EVIDENCE_TYPE, 'evidence:type');
  issueWhen(issues, evidence?.protocolVersion !== SCION_BROWSER_DEVICE_MATRIX_PROTOCOL, 'evidence:protocol-version');
  issueWhen(issues, !SHA256.test(clean(protocolSha256)), 'evidence:protocol-sha256-shape');
  issueWhen(issues, clean(evidence?.protocolSha256) !== clean(protocolSha256), 'evidence:protocol-sha256');
  issueWhen(
    issues,
    evidence?.adapterIdentityAlgorithm !== SCION_ADAPTER_PACKAGE_IDENTITY_ALGORITHM,
    'evidence:adapter-identity-algorithm',
  );
  issueWhen(issues, clean(evidence?.adapterIdentitySha256) !== packageIdentity.sha256, 'evidence:adapter-identity');
  issueWhen(issues, clean(evidence?.adapterId) !== clean(adapterManifest?.adapter?.id), 'evidence:adapter-id');
  issueWhen(
    issues,
    Number(evidence?.adapterScale) !== Number(adapterManifest?.adapter?.scale),
    'evidence:adapter-scale',
  );
  issueWhen(
    issues,
    clean(evidence?.trainingBaseRevision) !== clean(adapterManifest?.base?.revision),
    'evidence:training-base-revision',
  );
  issueWhen(
    issues,
    clean(evidence?.browserBaseRevision) !== clean(SCION_BROWSER_GEMMA4_GGUF.runtimeArtifact.revision),
    'evidence:browser-base-revision',
  );
  issueWhen(issues, evidence?.runtimeId !== SCION_BROWSER_WLLAMA_RUNTIME_ID, 'evidence:runtime-id');
  issueWhen(issues, !ISO_DATE.test(clean(evidence?.generatedAt)), 'evidence:generated-at');

  const profiles = profileIndex(protocol);
  const browserAdapterFile = (adapterManifest?.files || []).find((file) =>
    clean(file?.path).toLowerCase().endsWith('.gguf'),
  );
  const runs = Array.isArray(evidence?.runs) ? evidence.runs : [];
  const seenRunIds = new Set();
  const passingProfiles = new Set();
  const runChecks = [];
  for (const run of runs) {
    const runIssues = [];
    const runId = clean(run?.runId);
    const profileId = clean(run?.deviceProfile);
    const profile = profiles.get(profileId);
    issueWhen(runIssues, !RUN_ID.test(runId), 'run-id');
    issueWhen(runIssues, seenRunIds.has(runId), 'duplicate-run-id');
    seenRunIds.add(runId);
    issueWhen(runIssues, !ISO_DATE.test(clean(run?.observedAt)), 'observed-at');
    issueWhen(runIssues, !profile, 'unknown-device-profile');
    issueWhen(runIssues, clean(run?.identity?.adapterIdentitySha256) !== packageIdentity.sha256, 'adapter-identity');
    issueWhen(runIssues, clean(run?.identity?.adapterId) !== clean(adapterManifest?.adapter?.id), 'adapter-id');
    issueWhen(
      runIssues,
      Number(run?.identity?.adapterScale) !== Number(adapterManifest?.adapter?.scale),
      'adapter-scale',
    );
    issueWhen(
      runIssues,
      clean(run?.identity?.trainingBaseRevision) !== clean(adapterManifest?.base?.revision),
      'training-base-revision',
    );
    issueWhen(
      runIssues,
      clean(run?.identity?.browserBaseRevision) !== clean(SCION_BROWSER_GEMMA4_GGUF.runtimeArtifact.revision),
      'browser-base-revision',
    );
    issueWhen(runIssues, run?.identity?.runtimeId !== SCION_BROWSER_WLLAMA_RUNTIME_ID, 'runtime-id');
    issueWhen(runIssues, clean(run?.runDigestSha256) !== computeScionBrowserDeviceRunDigest(run), 'run-digest');
    if (profile) {
      runIssues.push(...validateEnvironment(run, profile));
      runIssues.push(
        ...validateScenarios(
          run,
          protocol,
          profile,
          SCION_BROWSER_GEMMA4_GGUF.runtimeArtifact,
          browserAdapterFile?.sha256,
        ),
      );
    }
    const artifacts = await validateArtifacts(run, protocol, evidenceDir, verifyArtifacts);
    runIssues.push(...artifacts.issues);
    const uniqueIssues = [...new Set(runIssues)];
    if (uniqueIssues.length === 0) passingProfiles.add(profileId);
    runChecks.push({
      runId: runId || null,
      deviceProfile: profileId || null,
      browserFamily: clean(run?.environment?.browser?.family).toLowerCase() || null,
      gpuClass: clean(run?.environment?.hardware?.gpuClass).toLowerCase() || null,
      pass: uniqueIssues.length === 0,
      issues: uniqueIssues,
      verifiedArtifacts: artifacts.verified,
    });
  }
  for (const profileId of profiles.keys()) {
    if (!passingProfiles.has(profileId)) issues.push(`missing-device-profile:${profileId}`);
  }
  issues.push(...runChecks.flatMap((run) => run.issues.map((issue) => `run:${run.runId || '?'}:${issue}`)));
  const uniqueIssues = [...new Set(issues)];
  return {
    schemaVersion: 1,
    audit: 'scion-browser-device-matrix',
    status: uniqueIssues.length === 0 ? 'pass' : 'blocked',
    promotionEligible: uniqueIssues.length === 0,
    protocolVersion: SCION_BROWSER_DEVICE_MATRIX_PROTOCOL,
    protocolSha256: clean(protocolSha256) || null,
    adapterIdentity: packageIdentity,
    requiredDeviceProfiles: [...profiles.keys()],
    passingDeviceProfiles: [...passingProfiles].sort(),
    runCount: runs.length,
    passingRunCount: runChecks.filter((run) => run.pass).length,
    issues: uniqueIssues,
    runChecks,
  };
}
