#!/usr/bin/env node
import { execFile as execFileCallback } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { chromium } from '@playwright/test';
import { createServer as createViteServer } from 'vite';

import { SCION_BROWSER_GEMMA4_GGUF } from '../src/lib/scionBrowserConstants.js';
import { auditScionBrowserDeviceMatrix } from './lib/scionBrowserDeviceMatrix.mjs';
import {
  artifactReceipt,
  buildAppleSiliconDeviceRun,
  buildPartialDeviceEvidence,
  buildScionAppleDeviceRunId,
  sanitizeAppleHardwareProbe,
  sanitizeScionDeviceTraceArchive,
  scionReleaseIdentityFromManifest,
  sha256File,
} from './lib/scionBrowserDeviceCapture.mjs';

const execFile = promisify(execFileCallback);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_MANIFEST = path.join(
  os.homedir(),
  '.cache/coursemapper/scion-adapters/scion-g4e2b-qat-smoke-v0167-browser/scion-adapter.json',
);
const DEFAULT_PROFILE = path.join(os.homedir(), '.cache/coursemapper/scion-device-profiles/apple-silicon-16gb-chrome');
const DEFAULT_OUTPUT = path.join(root, 'evaluation/scion-adapters/evidence/browser-device-apple-silicon-v0.16.25');
const PROTOCOL_PATH = path.join(root, 'evaluation/scion-adapters/browser-device-matrix-protocol-v1.json');
const EXPECTED_PARTIAL_ISSUES = [
  'missing-device-profile:discrete-8gb',
  'missing-device-profile:integrated-16gb',
  'missing-device-profile:integrated-8gb',
];
const PROVENANCE_FILE_NAMES = new Set([
  'conversion-receipt.json',
  'source-adapter-manifest.json',
  'training-plan.json',
  'training-result.json',
]);
const PROVENANCE_FILE_MAX_BYTES = 1024 * 1024;

function parseArgs(argv) {
  const args = {
    manifestPath: DEFAULT_MANIFEST,
    profileDir: DEFAULT_PROFILE,
    outputDir: DEFAULT_OUTPUT,
    resetProfile: false,
    finalizeExisting: false,
    headless: false,
    port: 0,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--manifest') args.manifestPath = path.resolve(argv[++index]);
    else if (arg === '--profile') args.profileDir = path.resolve(argv[++index]);
    else if (arg === '--output') args.outputDir = path.resolve(argv[++index]);
    else if (arg === '--reset-profile') args.resetProfile = true;
    else if (arg === '--finalize-existing') args.finalizeExisting = true;
    else if (arg === '--headless') args.headless = true;
    else if (arg === '--port') args.port = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function observedAtFromRunId(runId) {
  const match = /-(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(runId);
  if (!match) throw new Error(`Cannot recover capture timestamp from run ID: ${runId}`);
  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}.000Z`;
}

async function finalizeExistingCapture({ manifestPath, outputDir, profileDir }) {
  const manifest = await readJson(manifestPath);
  const releaseIdentity = scionReleaseIdentityFromManifest(manifest);
  const protocol = await readJson(PROTOCOL_PATH);
  const protocolSha256 = await sha256File(PROTOCOL_PATH);
  const expectedManifestSha256 = await sha256File(manifestPath);
  const artifactsDir = path.join(outputDir, 'artifacts');
  const names = await fsp.readdir(artifactsDir);
  const one = (suffix) => {
    const matches = names.filter((name) => name.endsWith(suffix));
    if (matches.length !== 1) throw new Error(`Expected one ${suffix} artifact, found ${matches.length}`);
    return path.join(artifactsDir, matches[0]);
  };
  const tracePath = one('-browser-trace.zip');
  const consolePath = one('-console-log.jsonl');
  const hardwarePath = one('-hardware-probe.json');
  const snapshotPath = one('-runtime-snapshot.json');
  const runId = path.basename(tracePath, '-browser-trace.zip');
  await sanitizeScionDeviceTraceArchive({
    tracePath,
    workspaceRoot: root,
    profileDir,
    homeDir: os.homedir(),
  });
  const [{ capture, memory }, hardwareProbe] = await Promise.all([readJson(snapshotPath), readJson(hardwarePath)]);
  const artifacts = await Promise.all([
    artifactReceipt({ evidenceDir: outputDir, type: 'browser-trace', filePath: tracePath }),
    artifactReceipt({ evidenceDir: outputDir, type: 'console-log', filePath: consolePath }),
    artifactReceipt({ evidenceDir: outputDir, type: 'hardware-probe', filePath: hardwarePath }),
    artifactReceipt({ evidenceDir: outputDir, type: 'runtime-snapshot', filePath: snapshotPath }),
  ]);
  const run = buildAppleSiliconDeviceRun({
    runId,
    observedAt: observedAtFromRunId(runId),
    manifest,
    hardwareProbe,
    capture,
    artifacts,
    peakBrowserWorkingSetMiB: memory?.peakMiB,
    baseSha256: capture?.cachedBaseVerification?.sha256,
  });
  const evidence = buildPartialDeviceEvidence({
    protocolSha256,
    manifest,
    generatedAt: new Date().toISOString(),
    runs: [run],
  });
  const evidencePath = path.join(outputDir, 'device-matrix.json');
  await writeJson(evidencePath, evidence);
  const audit = await auditScionBrowserDeviceMatrix({
    protocol,
    protocolSha256,
    evidence,
    evidencePath,
    adapterManifest: manifest,
  });
  const issues = [...audit.issues].sort();
  if (
    audit.status !== 'blocked' ||
    audit.passingRunCount !== 1 ||
    audit.passingDeviceProfiles.join(',') !== 'apple-silicon-16gb' ||
    JSON.stringify(issues) !== JSON.stringify([...EXPECTED_PARTIAL_ISSUES].sort())
  ) {
    throw new Error(`Partial device audit did not stop at the expected three profiles: ${audit.issues.join(', ')}`);
  }
  const receipt = {
    schemaVersion: 1,
    release: releaseIdentity.release,
    status: 'pass-one-profile-matrix-incomplete',
    promotionEligible: false,
    finalizedFromCompletedCapture: true,
    runId,
    evidencePath: path.relative(root, evidencePath),
    adapterManifestSha256: expectedManifestSha256,
    protocolSha256,
    passingDeviceProfiles: audit.passingDeviceProfiles,
    missingDeviceProfiles: ['integrated-8gb', 'integrated-16gb', 'discrete-8gb'],
    audit,
    nonClaims: evidence.nonClaims,
  };
  await writeJson(path.join(outputDir, 'capture-receipt.json'), receipt);
  return receipt;
}

async function copyAdapterProvenanceFiles({ adapterDir, manifest, outputDir }) {
  const copied = [];
  for (const file of manifest?.files || []) {
    const fileName = String(file?.path || '').trim();
    if (!PROVENANCE_FILE_NAMES.has(fileName)) continue;
    if (!Number.isSafeInteger(file.bytes) || file.bytes <= 0 || file.bytes > PROVENANCE_FILE_MAX_BYTES) {
      throw new Error(`Adapter provenance file exceeds its bounded receipt contract: ${fileName}`);
    }
    const source = path.resolve(adapterDir, fileName);
    if (path.dirname(source) !== path.resolve(adapterDir)) {
      throw new Error(`Adapter provenance file escaped its package directory: ${fileName}`);
    }
    const stats = await fsp.stat(source);
    if (!stats.isFile() || stats.size !== file.bytes || (await sha256File(source)) !== file.sha256) {
      throw new Error(`Adapter provenance file failed verification before capture: ${fileName}`);
    }
    const target = path.join(outputDir, fileName);
    await fsp.copyFile(source, target);
    copied.push({ path: fileName, bytes: file.bytes, sha256: file.sha256 });
  }
  return copied.sort((left, right) => left.path.localeCompare(right.path));
}

async function readJson(filePath) {
  return JSON.parse(await fsp.readFile(filePath, 'utf8'));
}

async function writeJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function safeRequestPath(value) {
  try {
    return decodeURIComponent(new URL(value, 'http://localhost').pathname);
  } catch {
    return '';
  }
}

function contentType(filePath) {
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filePath.endsWith('.gguf')) return 'application/octet-stream';
  return 'application/octet-stream';
}

async function createCaptureServer({ adapterDir, port }) {
  const vite = await createViteServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
  const server = http.createServer((request, response) => {
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    response.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    response.setHeader('Cache-Control', 'no-store');
    const requestPath = safeRequestPath(request.url);
    if (requestPath === '/scion-device-lab.html') {
      response.statusCode = 200;
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(`<!doctype html>
<html lang="en"><meta charset="utf-8"><title>Scion device capture</title>
<body><main><h1>Scion device capture</h1><pre id="status">loading</pre></main>
<script type="module">
  import * as lab from '/src/lib/scionBrowserDeviceLab.js';
  Object.defineProperty(window, '__scionDeviceLab', { value: lab });
  document.querySelector('#status').textContent = 'ready';
</script></body></html>`);
      return;
    }
    if (requestPath.startsWith('/device-adapter/')) {
      const relative = requestPath.slice('/device-adapter/'.length);
      if (!relative || relative.includes('/') || relative.includes('..')) {
        response.statusCode = 400;
        response.end('invalid adapter path');
        return;
      }
      const filePath = path.join(adapterDir, relative);
      fs.stat(filePath, (error, stats) => {
        if (error || !stats.isFile()) {
          response.statusCode = 404;
          response.end('missing adapter artifact');
          return;
        }
        response.statusCode = 200;
        response.setHeader('Content-Type', contentType(filePath));
        response.setHeader('Content-Length', stats.size);
        fs.createReadStream(filePath).pipe(response);
      });
      return;
    }
    vite.middlewares(request, response, () => {
      response.statusCode = 404;
      response.end('not found');
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  const address = server.address();
  return {
    origin: `http://localhost:${address.port}`,
    async close() {
      await vite.close();
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    },
  };
}

async function systemProbe() {
  const [{ stdout: profiler }, { stdout: osVersion }, { stdout: architecture }] = await Promise.all([
    execFile('system_profiler', ['-json', 'SPHardwareDataType', 'SPDisplaysDataType'], { maxBuffer: 5 * 1024 * 1024 }),
    execFile('sw_vers', ['-productVersion']),
    execFile('uname', ['-m']),
  ]);
  const report = JSON.parse(profiler);
  const hardware = report.SPHardwareDataType?.[0] || {};
  const display = report.SPDisplaysDataType?.[0] || {};
  const memoryMatch = /([0-9.]+)\s*GB/i.exec(String(hardware.physical_memory || ''));
  const processorMatch = /proc\s+(\d+)/.exec(String(hardware.number_processors || ''));
  return {
    hardware: {
      chip: hardware.chip_type,
      systemMemoryGiB: Number(memoryMatch?.[1]),
      cpuCoreCount: Number(processorMatch?.[1]),
      gpuCoreCount: Number(display.sppci_cores),
    },
    os: { family: 'macOS', version: osVersion.trim(), architecture: architecture.trim() },
  };
}

function parsePs(stdout) {
  return stdout
    .split('\n')
    .map((line) => /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(line))
    .filter(Boolean)
    .map((match) => ({ pid: Number(match[1]), ppid: Number(match[2]), rssKiB: Number(match[3]), command: match[4] }));
}

async function chromeWorkingSetMiB(profileDir) {
  const { stdout } = await execFile('ps', ['-axo', 'pid=,ppid=,rss=,command='], { maxBuffer: 20 * 1024 * 1024 });
  const processes = parsePs(stdout);
  const roots = processes.filter(
    (entry) => entry.command.includes(profileDir) && !entry.command.includes('scionBrowserDeviceCapture.mjs'),
  );
  if (roots.length === 0) return 0;
  const ids = new Set(roots.map((entry) => entry.pid));
  let changed = true;
  while (changed) {
    changed = false;
    for (const entry of processes) {
      if (!ids.has(entry.pid) && ids.has(entry.ppid)) {
        ids.add(entry.pid);
        changed = true;
      }
    }
  }
  const rssKiB = processes.filter((entry) => ids.has(entry.pid)).reduce((sum, entry) => sum + entry.rssKiB, 0);
  return rssKiB / 1024;
}

function startMemorySampler(profileDir) {
  let stopped = false;
  let peakMiB = 0;
  const samples = [];
  const sample = async () => {
    if (stopped) return;
    try {
      const workingSetMiB = await chromeWorkingSetMiB(profileDir);
      peakMiB = Math.max(peakMiB, workingSetMiB);
      samples.push({ observedAt: new Date().toISOString(), workingSetMiB: Math.round(workingSetMiB * 10) / 10 });
    } catch {
      // A missed operating-system sample cannot stop the browser run; the final gate still requires a nonzero peak.
    }
  };
  const timer = setInterval(sample, 1000);
  void sample();
  return {
    async stop() {
      stopped = true;
      clearInterval(timer);
      await sample();
      return { peakMiB, samples };
    },
  };
}

async function findFileByExactSize(directory, expectedBytes) {
  const pending = [directory];
  while (pending.length) {
    const current = pending.pop();
    let entries = [];
    try {
      entries = await fsp.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(target);
      else if (entry.isFile()) {
        const stats = await fsp.stat(target);
        if (stats.size === expectedBytes) return target;
      }
    }
  }
  return null;
}

function redactOutputs(value) {
  if (Array.isArray(value)) return value.map(redactOutputs);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        key === 'output' ? '[synthetic canary output redacted]' : redactOutputs(entry),
      ]),
    );
  }
  return value;
}

async function pageCall(page, method, args) {
  return page.evaluate(
    async ({ methodName, methodArgs }) => {
      const api = globalThis.__scionDeviceLab;
      if (!api || typeof api[methodName] !== 'function')
        throw new Error(`Unknown Scion device lab method: ${methodName}`);
      return api[methodName](methodArgs);
    },
    { methodName: method, methodArgs: args },
  );
}

async function ensureLabReady(page, origin) {
  await page.goto(`${origin}/scion-device-lab.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(globalThis.__scionDeviceLab), null, { timeout: 120000 });
}

async function recoverAfterGpuRestart({ page, context, origin }) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Browser.crashGpuProcess');
  await page.waitForTimeout(3000);
  let observedCompletionFailure = false;
  let postCrashResult = null;
  try {
    postCrashResult = await page.evaluate(async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort('post-gpu-restart-timeout'), 30000);
      try {
        return await globalThis.__scionDeviceLab.completeScionDevicePrompt({
          maxNewTokens: 16,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
    });
  } catch (error) {
    observedCompletionFailure = true;
    postCrashResult = { errorName: error?.name || null, errorMessage: error?.message || String(error) };
  }
  try {
    await pageCall(page, 'unloadScionDeviceBase');
  } catch {
    await ensureLabReady(page, origin);
  }
  const recoveryLoad = await pageCall(page, 'loadScionDeviceBase', { contextSize: 2048 });
  const recoveryCompletion = await pageCall(page, 'completeScionDevicePrompt', { maxNewTokens: 32 });
  return {
    completed: recoveryLoad.completed === true && recoveryCompletion.validOutput === true,
    baseUsableAfterRecovery: recoveryCompletion.validOutput === true,
    observedCompletionFailure,
    postCrashResult: redactOutputs(postCrashResult),
    recoveryLoad,
    recoveryCompletion: redactOutputs(recoveryCompletion),
  };
}

export async function runScionBrowserDeviceCapture(options = {}) {
  const manifestPath = path.resolve(options.manifestPath || DEFAULT_MANIFEST);
  const profileDir = path.resolve(options.profileDir || DEFAULT_PROFILE);
  const outputDir = path.resolve(options.outputDir || DEFAULT_OUTPUT);
  if (options.finalizeExisting) return finalizeExistingCapture({ manifestPath, outputDir, profileDir });
  const adapterDir = path.dirname(manifestPath);
  const manifest = await readJson(manifestPath);
  const releaseIdentity = scionReleaseIdentityFromManifest(manifest);
  const expectedManifestSha256 = await sha256File(manifestPath);
  const protocol = await readJson(PROTOCOL_PATH);
  const protocolSha256 = await sha256File(PROTOCOL_PATH);
  if (options.resetProfile) await fsp.rm(profileDir, { recursive: true, force: true });
  await fsp.mkdir(profileDir, { recursive: true });
  await fsp.rm(outputDir, { recursive: true, force: true });
  const artifactsDir = path.join(outputDir, 'artifacts');
  await fsp.mkdir(artifactsDir, { recursive: true });
  await fsp.copyFile(manifestPath, path.join(outputDir, 'adapter-manifest.json'));
  const retainedAdapterProvenance = await copyAdapterProvenanceFiles({ adapterDir, manifest, outputDir });

  const server = await createCaptureServer({ adapterDir, port: Number(options.port || 0) });
  let context = null;
  const consoleEntries = [];
  const startedAt = new Date();
  const runId = buildScionAppleDeviceRunId({ manifest, observedAt: startedAt });
  let memorySampler = null;
  let traceStarted = false;
  try {
    context = await chromium.launchPersistentContext(profileDir, {
      channel: 'chrome',
      headless: options.headless === true,
      viewport: { width: 1440, height: 1000 },
      args: ['--enable-features=WebAssemblyJspi', '--disable-background-timer-throttling'],
    });
    context.setDefaultTimeout(30 * 60 * 1000);
    context.setDefaultNavigationTimeout(120000);
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    traceStarted = true;
    const pages = context.pages();
    const page = pages[0] || (await context.newPage());
    page.on('console', (message) => {
      consoleEntries.push({
        observedAt: new Date().toISOString(),
        level: message.type(),
        text: message.text().slice(0, 4000),
      });
    });
    page.on('pageerror', (error) => {
      consoleEntries.push({
        observedAt: new Date().toISOString(),
        level: 'pageerror',
        text: String(error?.message || error).slice(0, 4000),
      });
    });
    memorySampler = startMemorySampler(profileDir);
    await ensureLabReady(page, server.origin);
    const browserProbe = await pageCall(page, 'probeScionDeviceBrowser');
    if (!browserProbe.webgpu || !browserProbe.jspi)
      throw new Error('Chrome did not expose WebGPU and JSPI on this device');
    await pageCall(page, 'clearScionDeviceAdapterCache');
    if (options.resetProfile) await pageCall(page, 'clearScionDeviceModelCache');

    const interruptedDownload = await pageCall(page, 'abortScionDeviceBaseDownload', {
      abortAfterBytes: 8 * 1024 * 1024,
      contextSize: 2048,
    });
    const coldBaseLoad = await pageCall(page, 'loadScionDeviceBase', { contextSize: 2048 });
    const cachedBasePath = await findFileByExactSize(profileDir, SCION_BROWSER_GEMMA4_GGUF.runtimeArtifact.bytes);
    if (!cachedBasePath)
      throw new Error('The exact cached public base file was not found in the isolated Chrome profile');
    const baseSha256 = await sha256File(cachedBasePath);
    const baseCompletion = await pageCall(page, 'completeScionDevicePrompt', { maxNewTokens: 64 });
    const projectFixture = { id: 'scion-device-capture', revision: 1, userData: false };
    const projectDataBeforeSha256 = await pageCall(page, 'digestScionDeviceProject', projectFixture);
    const manifestUrl = `${server.origin}/device-adapter/${path.basename(manifestPath)}`;
    const adapterInstall = await pageCall(page, 'installScionDeviceAdapter', {
      manifestUrl,
      expectedManifestSha256,
    });
    const adapterActivation = await pageCall(page, 'activateScionDeviceAdapter');
    if (adapterActivation.status !== 'adapter-active' || adapterActivation.proof?.pass !== true) {
      throw new Error(
        `The exact smoke adapter did not reach native active state: ${JSON.stringify(adapterActivation.resolution || {})}`,
      );
    }
    const adapterCompletion = await pageCall(page, 'completeScionDevicePrompt', { maxNewTokens: 64 });
    const adapterDeactivation = await pageCall(page, 'deactivateScionDeviceAdapter');
    const rollbackCompletion = await pageCall(page, 'completeScionDevicePrompt', { maxNewTokens: 64 });
    const projectDataAfterSha256 = await pageCall(page, 'digestScionDeviceProject', projectFixture);

    await pageCall(page, 'evictScionDeviceAdapter');
    const adapterRedownload = await pageCall(page, 'installScionDeviceAdapter', {
      manifestUrl,
      expectedManifestSha256,
    });
    const storageBaseCompletion = await pageCall(page, 'completeScionDevicePrompt', { maxNewTokens: 32 });
    const storageRecovery = {
      completed: adapterRedownload.verification.valid === true && storageBaseCompletion.validOutput === true,
      baseUsableAfterRecovery: storageBaseCompletion.validOutput === true,
      adapterRedownload,
      baseCompletion: redactOutputs(storageBaseCompletion),
    };

    const repeatCompletions = [];
    for (let index = 0; index < 3; index += 1) {
      repeatCompletions.push(await pageCall(page, 'completeScionDevicePrompt', { maxNewTokens: 32 }));
    }
    await pageCall(page, 'unloadScionDeviceBase');
    const warmBaseLoad = await pageCall(page, 'loadScionDeviceBase', { contextSize: 2048 });
    const deviceLossRecovery = await recoverAfterGpuRestart({ page, context, origin: server.origin });
    const runtimeSnapshot = await pageCall(page, 'snapshotScionDeviceRuntime');
    const capture = {
      browserProbe,
      interruptedDownload,
      coldBaseLoad,
      warmBaseLoad,
      baseCompletion,
      adapterInstall,
      adapterActivation,
      adapterCompletion,
      adapterDeactivation,
      rollbackCompletion,
      storageRecovery,
      deviceLossRecovery,
      repeatCompletions,
      projectDataBeforeSha256,
      projectDataAfterSha256,
      runtimeSnapshot,
      cachedBaseVerification: {
        bytes: SCION_BROWSER_GEMMA4_GGUF.runtimeArtifact.bytes,
        sha256: baseSha256,
        profileRelativePath: path.relative(profileDir, cachedBasePath),
      },
    };
    const memory = await memorySampler.stop();
    memorySampler = null;
    await writeJson(
      path.join(artifactsDir, `${runId}-hardware-probe.json`),
      sanitizeAppleHardwareProbe({ ...(await systemProbe()), browserProbe }),
    );
    await writeJson(path.join(artifactsDir, `${runId}-runtime-snapshot.json`), redactOutputs({ capture, memory }));
    await fsp.writeFile(
      path.join(artifactsDir, `${runId}-console-log.jsonl`),
      `${consoleEntries.map((entry) => JSON.stringify(entry)).join('\n')}\n`,
    );
    const tracePath = path.join(artifactsDir, `${runId}-browser-trace.zip`);
    await context.tracing.stop({ path: tracePath });
    traceStarted = false;
    await sanitizeScionDeviceTraceArchive({
      tracePath,
      workspaceRoot: root,
      profileDir,
      homeDir: os.homedir(),
    });
    const hardwareProbe = await readJson(path.join(artifactsDir, `${runId}-hardware-probe.json`));
    const artifacts = await Promise.all([
      artifactReceipt({ evidenceDir: outputDir, type: 'browser-trace', filePath: tracePath }),
      artifactReceipt({
        evidenceDir: outputDir,
        type: 'console-log',
        filePath: path.join(artifactsDir, `${runId}-console-log.jsonl`),
      }),
      artifactReceipt({
        evidenceDir: outputDir,
        type: 'hardware-probe',
        filePath: path.join(artifactsDir, `${runId}-hardware-probe.json`),
      }),
      artifactReceipt({
        evidenceDir: outputDir,
        type: 'runtime-snapshot',
        filePath: path.join(artifactsDir, `${runId}-runtime-snapshot.json`),
      }),
    ]);
    const observedAt = startedAt.toISOString();
    const run = buildAppleSiliconDeviceRun({
      runId,
      observedAt,
      manifest,
      hardwareProbe,
      capture,
      artifacts,
      peakBrowserWorkingSetMiB: memory.peakMiB,
      baseSha256,
    });
    const evidence = buildPartialDeviceEvidence({
      protocolSha256,
      manifest,
      generatedAt: new Date().toISOString(),
      runs: [run],
    });
    const evidencePath = path.join(outputDir, 'device-matrix.json');
    await writeJson(evidencePath, evidence);
    const audit = await auditScionBrowserDeviceMatrix({
      protocol,
      protocolSha256,
      evidence,
      evidencePath,
      adapterManifest: manifest,
    });
    const issues = [...audit.issues].sort();
    if (
      audit.status !== 'blocked' ||
      audit.passingRunCount !== 1 ||
      audit.passingDeviceProfiles.join(',') !== 'apple-silicon-16gb' ||
      JSON.stringify(issues) !== JSON.stringify([...EXPECTED_PARTIAL_ISSUES].sort())
    ) {
      throw new Error(`Partial device audit did not stop at the expected three profiles: ${audit.issues.join(', ')}`);
    }
    const receipt = {
      schemaVersion: 1,
      release: releaseIdentity.release,
      status: 'pass-one-profile-matrix-incomplete',
      promotionEligible: false,
      runId,
      evidencePath: path.relative(root, evidencePath),
      adapterManifestSha256: expectedManifestSha256,
      protocolSha256,
      retainedAdapterProvenance,
      passingDeviceProfiles: audit.passingDeviceProfiles,
      missingDeviceProfiles: ['integrated-8gb', 'integrated-16gb', 'discrete-8gb'],
      audit,
      nonClaims: evidence.nonClaims,
    };
    await writeJson(path.join(outputDir, 'capture-receipt.json'), receipt);
    return receipt;
  } finally {
    if (memorySampler) await memorySampler.stop();
    if (context) {
      if (traceStarted) {
        try {
          await context.tracing.stop();
        } catch {
          // Preserve the original capture error.
        }
      }
      await context.close();
    }
    await server.close();
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  runScionBrowserDeviceCapture(parseArgs(process.argv.slice(2)))
    .then((receipt) => console.log(JSON.stringify(receipt, null, 2)))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
