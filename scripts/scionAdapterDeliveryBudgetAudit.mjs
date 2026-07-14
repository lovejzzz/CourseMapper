#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  SCION_BROWSER_ADAPTER_MAX_BASE_FRACTION,
  SCION_BROWSER_ADAPTER_MAX_TOTAL_BYTES,
  SCION_GEMMA4_E2B_BROWSER_BASE_BYTES,
} from '../src/lib/scionAdapterManifest.js';
import { SCION_ADAPTER_MANIFEST_MAX_BYTES, SCION_ADAPTER_MAX_TOTAL_BYTES } from '../src/lib/scionAdapterRegistry.js';

const DEFAULT_RECEIPT = 'evaluation/scion-adapters/evidence/adapter-lifecycle-v0.16.25.json';
const BASE_CONTRACT = 'evaluation/scion-adapters/base-contracts/gemma-4-e2b.json';
const SMOKE_EVIDENCE = 'evaluation/scion-adapters/evidence/browser-adapter-smoke-v0.16.7.json';
const IMPLEMENTATION_FILES = [
  'scripts/scionAdapterDeliveryBudgetAudit.mjs',
  'src/lib/scionAdapterManifest.js',
  'src/lib/scionAdapterRegistry.js',
  'src/lib/scionBrowserWllama.js',
  'src/lib/scionRuntimeCanaryBridge.js',
  'tests/scion-adapter-manifest.test.js',
  'tests/scion-adapter-registry.test.js',
  'tests/scion-browser-wllama.test.js',
  'tests/scion-runtime-canary-bridge.test.js',
];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonical(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function readBoundJson(cwd, file) {
  const bytes = await fs.readFile(path.join(cwd, file));
  return {
    file,
    bytes: bytes.length,
    sha256: sha256(bytes),
    value: JSON.parse(bytes.toString('utf8')),
  };
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

export async function buildScionAdapterDeliveryBudgetReport({ cwd = process.cwd(), generatedAt } = {}) {
  const baseInput = await readBoundJson(cwd, BASE_CONTRACT);
  const smokeInput = await readBoundJson(cwd, SMOKE_EVIDENCE);
  const baseBytes = baseInput.value?.browserArtifact?.bytes;
  const artifactBytes = smokeInput.value?.adapter?.artifact?.bytes;
  const conversionReceiptBytes = smokeInput.value?.adapter?.conversionReceipt?.bytes;
  const packageBytes = artifactBytes + conversionReceiptBytes;
  const ratioCeilingBytes = Math.floor(baseBytes * SCION_BROWSER_ADAPTER_MAX_BASE_FRACTION);
  const effectiveLimitBytes = Math.min(SCION_BROWSER_ADAPTER_MAX_TOTAL_BYTES, ratioCeilingBytes);
  const baseFraction = packageBytes / baseBytes;

  requireCondition(baseBytes === SCION_GEMMA4_E2B_BROWSER_BASE_BYTES, 'Pinned browser base byte count drifted.');
  requireCondition(
    SCION_ADAPTER_MAX_TOTAL_BYTES === SCION_BROWSER_ADAPTER_MAX_TOTAL_BYTES,
    'Registry and manifest adapter ceilings differ.',
  );
  requireCondition(Number.isSafeInteger(artifactBytes) && artifactBytes > 0, 'Smoke adapter bytes are invalid.');
  requireCondition(
    Number.isSafeInteger(conversionReceiptBytes) && conversionReceiptBytes > 0,
    'Conversion receipt bytes are invalid.',
  );
  requireCondition(packageBytes <= SCION_BROWSER_ADAPTER_MAX_TOTAL_BYTES, 'Smoke package exceeds 64 MiB.');
  requireCondition(
    baseFraction <= SCION_BROWSER_ADAPTER_MAX_BASE_FRACTION,
    'Smoke package exceeds two percent of the pinned base.',
  );
  requireCondition(smokeInput.value?.conversion?.ggufMetadata?.type === 'adapter', 'GGUF is not marked as an adapter.');
  requireCondition(
    smokeInput.value?.base?.browserSha256 === baseInput.value?.browserArtifact?.sha256,
    'Smoke evidence and base contract name different browser artifacts.',
  );
  requireCondition(smokeInput.value?.promotionEligible === false, 'Mechanical smoke evidence became promotable.');

  const implementation = [];
  for (const file of IMPLEMENTATION_FILES) {
    const bytes = await fs.readFile(path.join(cwd, file));
    implementation.push({ file, bytes: bytes.length, sha256: sha256(bytes) });
  }
  const registrySource = await fs.readFile(path.join(cwd, 'src/lib/scionAdapterRegistry.js'), 'utf8');
  const registryTests = await fs.readFile(path.join(cwd, 'tests/scion-adapter-registry.test.js'), 'utf8');
  const browserRuntimeSource = await fs.readFile(path.join(cwd, 'src/lib/scionBrowserWllama.js'), 'utf8');
  const canarySource = await fs.readFile(path.join(cwd, 'src/lib/scionRuntimeCanaryBridge.js'), 'utf8');
  const canaryTests = await fs.readFile(path.join(cwd, 'tests/scion-runtime-canary-bridge.test.js'), 'utf8');
  for (const marker of [
    'SCION_ADAPTER_STREAM_REQUIRED',
    'SCION_ADAPTER_CONTENT_LENGTH',
    'SCION_ADAPTER_STREAM_OVERRUN',
    'SCION_ADAPTER_STREAM_TRUNCATED',
  ]) {
    requireCondition(registrySource.includes(marker), `Registry is missing ${marker}.`);
    requireCondition(registryTests.includes(marker), `Adversarial tests are missing ${marker}.`);
  }
  requireCondition(!registrySource.includes('return response.arrayBuffer()'), 'Registry restored unbounded buffering.');
  requireCondition(!canarySource.includes('.arrayBuffer()'), 'Browser canary bypasses bounded streaming.');
  for (const marker of [
    'installScionBrowserAdapter',
    'verifyInstalledScionAdapter',
    'activateInstalledScionAdapter',
    'deactivateInstalledScionAdapter',
  ]) {
    requireCondition(canarySource.includes(marker), `Browser canary is missing ${marker}.`);
    requireCondition(canaryTests.includes(marker), `Browser canary tests are missing ${marker}.`);
  }
  for (const marker of [
    'SCION_ADAPTER_ACTIVE_REPLACEMENT',
    'cached-manifest-record-mismatch',
    "phase: 'cached'",
    "mode: 'recovery-required'",
  ]) {
    requireCondition(registrySource.includes(marker), `Registry lifecycle is missing ${marker}.`);
    requireCondition(registryTests.includes(marker), `Registry lifecycle tests are missing ${marker}.`);
  }
  for (const marker of ['SCION_WLLAMA_RECOVERY_REQUIRED', "phase: 'recovery-required'", "nativeState: 'unknown'"]) {
    requireCondition(browserRuntimeSource.includes(marker), `Browser runtime recovery is missing ${marker}.`);
  }
  requireCondition(
    canaryTests.includes('unchecked arrayBuffer fallback used') && canaryTests.includes('arrayBufferFallbacks'),
    'Integrated canary test does not prove the whole-response fallback stayed unused.',
  );

  return {
    schemaVersion: 1,
    protocol: 'scion-adapter-delivery-lifecycle-v2',
    release: 'v0.16.25',
    generatedAt: generatedAt || new Date().toISOString(),
    status: 'pass-bounded-lifecycle-contract',
    promotionEligible: false,
    inputs: [
      { file: baseInput.file, bytes: baseInput.bytes, sha256: baseInput.sha256 },
      { file: smokeInput.file, bytes: smokeInput.bytes, sha256: smokeInput.sha256 },
    ],
    implementation,
    budget: {
      pinnedBaseBytes: baseBytes,
      absoluteLimitBytes: SCION_BROWSER_ADAPTER_MAX_TOTAL_BYTES,
      maxBaseFraction: SCION_BROWSER_ADAPTER_MAX_BASE_FRACTION,
      ratioCeilingBytes,
      effectiveLimitBytes,
      manifestLimitBytes: SCION_ADAPTER_MANIFEST_MAX_BYTES,
    },
    smokePackage: {
      adapterId: smokeInput.value.adapter.id,
      artifactBytes,
      conversionReceiptBytes,
      packageBytes,
      baseFraction: Number(baseFraction.toFixed(9)),
      basePercent: Number((baseFraction * 100).toFixed(6)),
      effectiveHeadroomBytes: effectiveLimitBytes - packageBytes,
      withinAbsoluteLimit: true,
      withinBaseFraction: true,
      baseWeightsIncluded: false,
    },
    guarantees: [
      'browser-adapter-manifests-fail-above-64-mib',
      'gguf-browser-adapters-fail-above-two-percent-of-pinned-base',
      'manifest-responses-fail-above-one-mib',
      'adapter-responses-require-streaming-and-exact-length',
      'declared-length-mismatch-fails-before-reader-open',
      'headerless-overrun-is-cancelled',
      'headerless-truncation-is-rejected',
      'registry-commit-occurs-only-after-every-file-passes-size-and-sha256',
      'localhost-browser-canary-uses-the-same-bounded-registry-path',
      'cached-manifest-bytes-and-files-are-reverified-before-reuse',
      'active-adapter-id-cannot-be-replaced-by-a-different-manifest',
      'activation-and-deactivation-use-one-registry-lifecycle-coordinator',
      'failed-exact-rollback-quarantines-the-runtime',
      'generation-remains-blocked-until-quarantined-runtime-unload-and-reload',
    ],
    qualityBoundary: {
      evidenceType: 'hash-bound-mechanical-smoke-replay-and-adversarial-lifecycle-software-contract',
      claim: 'bounded-separate-adapter-delivery-and-lifecycle-only',
      doesNotProve: [
        'production-adapter-quality',
        'held-out-domain-win',
        'paid-reference-parity',
        'production-device-matrix',
        'real-device-recovery-run',
        'human-or-instructor-validation',
      ],
    },
  };
}

function parseArgs(argv) {
  const options = { write: false, receipt: DEFAULT_RECEIPT };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--write') options.write = true;
    else if (argv[index] === '--receipt') options.receipt = argv[++index] || options.receipt;
  }
  return options;
}

export async function runScionAdapterDeliveryBudgetAudit(options = {}) {
  const cwd = options.cwd || process.cwd();
  const receipt = options.receipt || DEFAULT_RECEIPT;
  const receiptPath = path.join(cwd, receipt);
  if (options.write) {
    const report = await buildScionAdapterDeliveryBudgetReport({ cwd });
    await fs.mkdir(path.dirname(receiptPath), { recursive: true });
    await fs.writeFile(receiptPath, canonical(report));
    return { report, receipt, wrote: true };
  }

  const tracked = JSON.parse(await fs.readFile(receiptPath, 'utf8'));
  const report = await buildScionAdapterDeliveryBudgetReport({ cwd, generatedAt: tracked.generatedAt });
  if (canonical(report) !== canonical(tracked)) {
    throw new Error(`${receipt} does not match the pinned inputs, budget, and implementation hashes.`);
  }
  return { report, receipt, wrote: false };
}

async function main() {
  const result = await runScionAdapterDeliveryBudgetAudit(parseArgs(process.argv.slice(2)));
  const { budget, smokePackage } = result.report;
  console.log(`Scion adapter delivery: ${result.report.status}`);
  console.log(
    `${smokePackage.packageBytes} bytes (${smokePackage.basePercent}% of base), ` +
      `${smokePackage.effectiveHeadroomBytes} bytes below the ${budget.effectiveLimitBytes}-byte effective ceiling.`,
  );
  console.log(`${result.wrote ? 'Wrote' : 'Verified'}: ${result.receipt}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
