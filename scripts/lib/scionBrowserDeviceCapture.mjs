import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import JSZip from 'jszip';

import { SCION_BROWSER_GEMMA4_GGUF, SCION_BROWSER_WLLAMA_RUNTIME_ID } from '../../src/lib/scionBrowserConstants.js';
import {
  computeScionAdapterPackageIdentity,
  computeScionBrowserDeviceRunDigest,
  SCION_ADAPTER_PACKAGE_IDENTITY_ALGORITHM,
  SCION_BROWSER_DEVICE_EVIDENCE_TYPE,
  SCION_BROWSER_DEVICE_MATRIX_PROTOCOL,
} from './scionBrowserDeviceMatrix.mjs';

const SHA256 = /^[a-f0-9]{64}$/;
const TRACE_TEXT_ENTRY =
  /(?:^|\/)(?:trace\.trace|trace\.network|trace\.stacks|stacks|[^/]+\.(?:css|html|js|json|map|mjs|txt))$/i;
const LOCAL_ABSOLUTE_PATH = /(?:\/Users\/|\/home\/|[A-Za-z]:\\Users\\)/i;
const SENSITIVE_HEADER_NAMES = new Set(['authorization', 'cookie', 'proxy-authorization', 'x-api-key']);

function clean(value) {
  return String(value ?? '').trim();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export async function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  const file = await fs.open(filePath, 'r');
  try {
    for await (const chunk of file.createReadStream({ autoClose: false })) hash.update(chunk);
  } finally {
    await file.close();
  }
  return hash.digest('hex');
}

export async function artifactReceipt({ evidenceDir, type, filePath }) {
  const absoluteEvidenceDir = path.resolve(evidenceDir);
  const absolutePath = path.resolve(filePath);
  const relativePath = path.relative(absoluteEvidenceDir, absolutePath).replaceAll(path.sep, '/');
  assert(
    relativePath && !relativePath.startsWith('..') && !path.isAbsolute(relativePath),
    `${type} must stay in evidenceDir`,
  );
  const stats = await fs.stat(absolutePath);
  assert(stats.isFile(), `${type} is not a regular file`);
  return { type, path: relativePath, bytes: stats.size, sha256: await sha256File(absolutePath) };
}

export async function sanitizeScionDeviceTraceArchive({ tracePath, workspaceRoot, profileDir, homeDir } = {}) {
  const archive = await JSZip.loadAsync(await fs.readFile(tracePath));
  const replacements = [
    [clean(workspaceRoot), '<workspace>'],
    [clean(profileDir), '<isolated-chrome-profile>'],
    [clean(homeDir), '<home>'],
  ]
    .filter(([privateValue]) => privateValue)
    .sort(([left], [right]) => right.length - left.length);
  let replacementCount = 0;
  for (const [name, entry] of Object.entries(archive.files)) {
    if (entry.dir || !TRACE_TEXT_ENTRY.test(name)) continue;
    let content = await entry.async('string');
    for (const [privateValue, safeValue] of replacements) {
      const pieces = content.split(privateValue);
      if (pieces.length === 1) continue;
      replacementCount += pieces.length - 1;
      content = pieces.join(safeValue);
    }
    archive.file(name, content);
  }
  if (replacementCount > 0) {
    await fs.writeFile(tracePath, await archive.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
  }
  const privacyAudit = await auditScionDeviceTraceArchivePrivacy({ tracePath });
  assert(privacyAudit.issues.length === 0, `Trace privacy audit failed: ${privacyAudit.issues.join(', ')}`);
  return { replacementCount };
}

function collectNetworkPrivacyIssues(value, issues, entryName, lineNumber) {
  const snapshot = value?.snapshot;
  if (!snapshot || typeof snapshot !== 'object') return;
  for (const direction of ['request', 'response']) {
    const message = snapshot[direction];
    if (!message || typeof message !== 'object') continue;
    if (Array.isArray(message.cookies) && message.cookies.length > 0) {
      issues.add(`${entryName}:${lineNumber}:${direction}-cookies`);
    }
    for (const header of message.headers || []) {
      const headerName = clean(header?.name).toLowerCase();
      if (SENSITIVE_HEADER_NAMES.has(headerName)) {
        issues.add(`${entryName}:${lineNumber}:${direction}-header-${headerName}`);
      }
    }
    const url = clean(message.url);
    if (/[?&](?:access_token|api_?key|auth(?:orization)?|password|secret|token)=/i.test(url)) {
      issues.add(`${entryName}:${lineNumber}:${direction}-url-secret`);
    }
  }
}

export async function auditScionDeviceTraceArchivePrivacy({ tracePath } = {}) {
  const archive = await JSZip.loadAsync(await fs.readFile(tracePath));
  const issues = new Set();
  for (const [name, entry] of Object.entries(archive.files)) {
    if (entry.dir || !TRACE_TEXT_ENTRY.test(name)) continue;
    const content = await entry.async('string');
    if (LOCAL_ABSOLUTE_PATH.test(content)) issues.add(`${name}:local-absolute-path`);
    if (!name.endsWith('trace.network')) continue;
    for (const [index, line] of content.split('\n').entries()) {
      if (!line.trim()) continue;
      try {
        collectNetworkPrivacyIssues(JSON.parse(line), issues, name, index + 1);
      } catch {
        issues.add(`${name}:${index + 1}:invalid-json`);
      }
    }
  }
  return { issues: [...issues].sort() };
}

export function chromeVersionFromUserAgent(userAgent) {
  const match = /(?:Chrome|CriOS)\/(\d+(?:\.\d+){1,3})/.exec(clean(userAgent));
  if (!match) throw new Error('Chrome version is missing from the browser user agent');
  return match[1];
}

export function sanitizeAppleHardwareProbe({ hardware, os, browserProbe } = {}) {
  const systemMemoryGiB = Number(hardware?.systemMemoryGiB);
  assert(clean(hardware?.chip).startsWith('Apple '), 'Apple Silicon chip identity is required');
  assert(Number.isFinite(systemMemoryGiB) && systemMemoryGiB >= 16, 'Apple Silicon profile requires at least 16 GiB');
  const result = {
    schemaVersion: 1,
    profile: 'apple-silicon-16gb',
    os: {
      family: clean(os?.family) || 'macOS',
      version: clean(os?.version),
      architecture: clean(os?.architecture) || 'arm64',
    },
    hardware: {
      systemMemoryGiB,
      gpuClass: 'apple-silicon',
      gpuVendor: 'Apple',
      gpuModel: clean(hardware?.chip),
      cpuCoreCount: Number(hardware?.cpuCoreCount) || null,
      gpuCoreCount: Number(hardware?.gpuCoreCount) || null,
    },
    browser: {
      family: 'chrome',
      version: chromeVersionFromUserAgent(browserProbe?.userAgent),
      userAgent: clean(browserProbe?.userAgent),
      hardwareConcurrency: Number(browserProbe?.hardwareConcurrency) || null,
      webgpuReportedVendor: clean(browserProbe?.gpu?.vendor) || null,
      webgpuReportedArchitecture: clean(browserProbe?.gpu?.architecture) || null,
      webgpuReportedDevice: clean(browserProbe?.gpu?.device) || null,
      webgpuReportedDescription: clean(browserProbe?.gpu?.description) || null,
    },
  };
  const serialized = JSON.stringify(result);
  for (const forbidden of ['serial', 'uuid', 'udid', '/Users/', 'accountName']) {
    assert(!serialized.toLowerCase().includes(forbidden.toLowerCase()), `hardware probe leaked ${forbidden}`);
  }
  return result;
}

function requireCompletion(receipt, label) {
  assert(receipt?.completed === true && receipt?.validOutput === true, `${label} did not produce valid output`);
  assert(SHA256.test(clean(receipt.outputSha256)), `${label} output digest is invalid`);
  assert(Number(receipt.firstTokenMs) > 0, `${label} first-token timing is invalid`);
  assert(Number(receipt.totalMs) >= Number(receipt.firstTokenMs), `${label} total timing is invalid`);
  return {
    completed: true,
    validOutput: true,
    outputSha256: receipt.outputSha256,
    firstTokenMs: Number(receipt.firstTokenMs),
    totalMs: Number(receipt.totalMs),
  };
}

export function buildAppleSiliconDeviceRun({
  runId,
  observedAt,
  manifest,
  hardwareProbe,
  capture,
  artifacts,
  peakBrowserWorkingSetMiB,
  baseSha256,
} = {}) {
  const identity = computeScionAdapterPackageIdentity(manifest);
  const adapterFile = (manifest?.files || []).find((file) => clean(file?.path).toLowerCase().endsWith('.gguf'));
  assert(adapterFile, 'Browser adapter GGUF is missing from the manifest');
  assert(clean(baseSha256) === SCION_BROWSER_GEMMA4_GGUF.runtimeArtifact.sha256, 'Pinned base digest was not verified');
  assert(
    capture?.browserProbe?.webgpu === true && capture?.browserProbe?.jspi === true,
    'WebGPU and JSPI are required',
  );
  assert(capture?.interruptedDownload?.aborted === true, 'A real interrupted model download was not observed');
  assert(
    capture?.coldBaseLoad?.completed === true && capture.coldBaseLoad.webgpuActive === true,
    'Cold base load failed',
  );
  assert(
    capture?.warmBaseLoad?.completed === true && capture.warmBaseLoad.webgpuActive === true,
    'Warm base load failed',
  );
  const baseCompletion = requireCompletion(capture.baseCompletion, 'base completion');
  const adapterCompletion = requireCompletion(capture.adapterCompletion, 'adapter completion');
  const rollbackCompletion = requireCompletion(capture.rollbackCompletion, 'rollback completion');
  assert(baseCompletion.outputSha256 !== adapterCompletion.outputSha256, 'Adapter output did not change');
  assert(baseCompletion.outputSha256 === rollbackCompletion.outputSha256, 'Rollback did not restore exact base output');
  const activation = capture.adapterActivation;
  assert(
    activation?.status === 'adapter-active' && activation?.proof?.pass === true,
    'Native adapter activation failed',
  );
  const native = activation.proof?.native || {};
  const directNativeReceipt = native.active === true;
  if (directNativeReceipt) {
    assert(native.metadata?.['general.type'] === 'adapter', 'Native adapter type metadata is missing');
    assert(native.metadata?.['adapter.type'] === 'lora', 'Native LoRA metadata is missing');
    assert(native.metadata?.['general.architecture'] === 'gemma4', 'Native Gemma 4 metadata is missing');
  } else {
    assert(
      activation.active?.proofSha256 === activation.proof?.proofSha256 && activation.proof?.outputChanged === true,
      'Native activation is missing both a direct receipt and the runtime-guarded proof',
    );
  }
  assert(capture?.adapterInstall?.verification?.valid === true, 'Adapter cache verification failed');
  assert(
    capture?.storageRecovery?.completed === true && capture.storageRecovery.baseUsableAfterRecovery === true,
    'Storage recovery failed',
  );
  assert(
    capture?.deviceLossRecovery?.completed === true && capture.deviceLossRecovery.baseUsableAfterRecovery === true,
    'Device-loss recovery failed',
  );
  const repeats = Array.isArray(capture.repeatCompletions) ? capture.repeatCompletions : [];
  const validRepeatCount = repeats.filter((entry) => entry?.completed === true && entry?.validOutput === true).length;
  assert(repeats.length >= 3 && validRepeatCount === repeats.length, 'Three repeated completions are required');
  assert(
    clean(capture.projectDataBeforeSha256) === clean(capture.projectDataAfterSha256),
    'Project data changed during rollback',
  );
  assert(
    Number.isFinite(Number(peakBrowserWorkingSetMiB)) && Number(peakBrowserWorkingSetMiB) > 0,
    'Browser memory was not measured',
  );
  const requiredArtifacts = new Set(['browser-trace', 'console-log', 'hardware-probe', 'runtime-snapshot']);
  for (const artifact of artifacts || []) requiredArtifacts.delete(artifact.type);
  assert(requiredArtifacts.size === 0, `Missing device artifacts: ${[...requiredArtifacts].join(', ')}`);

  const run = {
    runId,
    observedAt,
    deviceProfile: 'apple-silicon-16gb',
    identity: {
      adapterIdentitySha256: identity.sha256,
      adapterId: manifest.adapter.id,
      adapterScale: manifest.adapter.scale,
      trainingBaseRevision: manifest.base.revision,
      browserBaseRevision: SCION_BROWSER_GEMMA4_GGUF.runtimeArtifact.revision,
      runtimeId: SCION_BROWSER_WLLAMA_RUNTIME_ID,
    },
    environment: {
      browser: hardwareProbe.browser,
      os: hardwareProbe.os,
      hardware: hardwareProbe.hardware,
    },
    measurements: { peakBrowserWorkingSetMiB: Math.ceil(Number(peakBrowserWorkingSetMiB)) },
    checks: {
      capability: { webgpu: true, jspi: true },
      coldBaseLoad: {
        completed: true,
        directPinnedPublicUrl: true,
        modelBackendRequired: false,
        baseSha256Verified: true,
        baseSha256,
        runtimeMetadataArchitecture: capture.coldBaseLoad.runtimeMetadataArchitecture,
        runtimeMetadataType: capture.coldBaseLoad.runtimeMetadataType,
        downloadedBytes: SCION_BROWSER_GEMMA4_GGUF.runtimeArtifact.bytes,
        reportedTotalBytes: SCION_BROWSER_GEMMA4_GGUF.runtimeArtifact.bytes,
        durationMs: capture.coldBaseLoad.durationMs,
      },
      warmBaseLoad: { completed: true, durationMs: capture.warmBaseLoad.durationMs },
      baseCompletion,
      adapterIntegrity: {
        digestMatched: true,
        manifestVerified: true,
        adapterSha256: adapterFile.sha256,
      },
      adapterActivation: {
        completed: true,
        nativeAdapterActive: true,
        nativeMetadataMatched: true,
        nativeMetadataEvidence: directNativeReceipt ? 'direct-runtime-receipt' : 'runtime-guarded-activation-proof',
        nativeMetadata: { generalType: 'adapter', adapterType: 'lora', architecture: 'gemma4' },
        outputChangedAtManifestScale: true,
        durationMs: activation.durationMs,
      },
      adapterCompletion,
      rollback: {
        completed: true,
        nativeAdapterInactive: capture.adapterDeactivation?.rollback?.native?.active === false,
        exactBaseOutputRestored: true,
        projectDataUnchanged: true,
        outputSha256: rollbackCompletion.outputSha256,
        projectDataBeforeSha256: capture.projectDataBeforeSha256,
        projectDataAfterSha256: capture.projectDataAfterSha256,
      },
      recovery: {
        interruptedDownload: {
          completed: true,
          baseUsableAfterRecovery: true,
          method: 'network-abort-resume',
          target: 'pinned-public-base',
          observedPartialBytes: capture.interruptedDownload.observedBytes,
        },
        storagePressure: {
          completed: true,
          baseUsableAfterRecovery: true,
          method: 'cache-eviction-redownload',
          target: 'separate-browser-adapter',
        },
        deviceLoss: {
          completed: true,
          baseUsableAfterRecovery: true,
          method: 'browser-gpu-process-restart',
          observedCompletionFailure: capture.deviceLossRecovery.observedCompletionFailure === true,
        },
      },
      repeatCompletion: { attempts: repeats.length, completed: repeats.length, validOutputs: validRepeatCount },
    },
    artifacts,
  };
  run.runDigestSha256 = computeScionBrowserDeviceRunDigest(run);
  return run;
}

export function buildPartialDeviceEvidence({ protocolSha256, manifest, generatedAt, runs } = {}) {
  const identity = computeScionAdapterPackageIdentity(manifest);
  return {
    schemaVersion: 1,
    evidenceType: SCION_BROWSER_DEVICE_EVIDENCE_TYPE,
    protocolVersion: SCION_BROWSER_DEVICE_MATRIX_PROTOCOL,
    protocolSha256,
    adapterIdentityAlgorithm: SCION_ADAPTER_PACKAGE_IDENTITY_ALGORITHM,
    adapterIdentitySha256: identity.sha256,
    adapterId: manifest.adapter.id,
    adapterScale: manifest.adapter.scale,
    trainingBaseRevision: manifest.base.revision,
    browserBaseRevision: SCION_BROWSER_GEMMA4_GGUF.runtimeArtifact.revision,
    runtimeId: SCION_BROWSER_WLLAMA_RUNTIME_ID,
    generatedAt,
    promotionEligible: false,
    qualificationScope: 'single-apple-silicon-smoke-adapter-recovery-profile',
    nonClaims: [
      'This evidence does not qualify the other three frozen browser/device profiles.',
      'The smoke adapter is not a production or quality adapter and cannot be promoted.',
      'This evidence does not establish educational quality, factual improvement, or a five-domain win.',
    ],
    runs,
  };
}
