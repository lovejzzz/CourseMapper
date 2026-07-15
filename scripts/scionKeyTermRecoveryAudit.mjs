#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { chromium } from '@playwright/test';
import { createServer as createViteServer } from 'vite';

import { SCION_BROWSER_GEMMA4_GGUF } from '../src/lib/scionBrowserConstants.js';
import {
  SCION_KEY_TERM_RECOVERY_EXPECTED,
  SCION_KEY_TERM_RECOVERY_BASELINE,
  SCION_KEY_TERM_RECOVERY_PROTOCOL,
  SCION_KEY_TERM_RECOVERY_RELEASE,
  assessScionKeyTermRecoveryOutput,
  buildScionKeyTermRecoveryCases,
  buildScionKeyTermRecoveryMessages,
  canonicalScionRecoveryJson,
  recoveryCaseInputBinding,
  scionRecoverySha256,
} from './lib/scionKeyTermRecovery.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_PROFILE = path.join(os.homedir(), '.cache/coursemapper/scion-device-profiles/apple-silicon-16gb-chrome');
const DEFAULT_RECEIPT = path.join(root, 'evaluation/scion-adapters/evidence/key-term-recovery-v0.16.27.json');
const DEFAULT_PORT = 62343;
const IMPLEMENTATION_FILES = [
  'scripts/scionKeyTermRecoveryAudit.mjs',
  'scripts/lib/scionKeyTermRecovery.mjs',
  'scripts/lib/scionSourceCapture.mjs',
  'scripts/scionSourceCapture.mjs',
  'scripts/scionCompilerLiftReplayAudit.mjs',
  'scripts/scionMcContractRecoveryAudit.mjs',
  'src/lib/scionKeyTermContract.js',
  'src/lib/publicScionProvider.js',
  'src/lib/scionLocalProvider.js',
  'src/lib/blueprintEnrichmentPass.js',
  'src/hooks/useDeliverables.js',
  'src/lib/scionBrowserDeviceLab.js',
];
const TEMPERATURES = [0, 0.15, 0.3];

function parseArgs(argv) {
  const options = {
    capture: false,
    profileDir: DEFAULT_PROFILE,
    receipt: DEFAULT_RECEIPT,
    headless: false,
    // OPFS is origin-scoped. A stable port prevents each audit rerun from
    // caching another 3.35 GB copy of the same pinned public base.
    port: DEFAULT_PORT,
  };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--capture') options.capture = true;
    else if (argv[index] === '--headless') options.headless = true;
    else if (argv[index] === '--profile') options.profileDir = path.resolve(argv[++index]);
    else if (argv[index] === '--receipt') options.receipt = path.resolve(argv[++index]);
    else if (argv[index] === '--port') options.port = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  return options;
}

async function sha256File(filePath) {
  const hash = createHash('sha256');
  const stream = fs.createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest('hex');
}

async function implementationReceipts() {
  return Promise.all(
    IMPLEMENTATION_FILES.map(async (file) => {
      const bytes = await fsp.readFile(path.join(root, file));
      return { file, bytes: bytes.length, sha256: scionRecoverySha256(bytes) };
    }),
  );
}

async function findFileByExactSize(directory, expectedBytes) {
  const pending = [directory];
  while (pending.length > 0) {
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
      else if (entry.isFile() && (await fsp.stat(target)).size === expectedBytes) return target;
    }
  }
  return null;
}

async function createCaptureServer(port) {
  const vite = await createViteServer({
    root,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
    // This harness imports one known browser module. Automatic discovery
    // otherwise crawls retained HTML proof/runs and can restart the server
    // underneath the active WebGPU page.
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  const server = http.createServer((request, response) => {
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    response.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    response.setHeader('Cache-Control', 'no-store');
    if (new URL(request.url, 'http://localhost').pathname === '/scion-key-term-lab.html') {
      response.statusCode = 200;
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(`<!doctype html><meta charset="utf-8"><title>Scion key-term recovery</title>
<script type="module">import * as lab from '/src/lib/scionBrowserDeviceLab.js'; Object.defineProperty(window, '__scionDeviceLab', {value: lab});</script>`);
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
  return {
    origin: `http://localhost:${server.address().port}`,
    async close() {
      await vite.close();
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    },
  };
}

async function pageCall(page, method, args = {}) {
  return page.evaluate(
    async ({ method, args }) => {
      if (typeof globalThis.__scionDeviceLab?.[method] !== 'function') throw new Error(`Unknown lab method: ${method}`);
      return globalThis.__scionDeviceLab[method](args);
    },
    { method, args },
  );
}

function caseReceipt(entry, attempts) {
  const acceptedAttempt = attempts.findIndex((attempt) => attempt.assessment.eligible);
  return {
    input: recoveryCaseInputBinding(entry),
    inputSha256: scionRecoverySha256(canonicalScionRecoveryJson(recoveryCaseInputBinding(entry))),
    attempts,
    acceptedAttempt: acceptedAttempt >= 0 ? acceptedAttempt + 1 : null,
    admitted: acceptedAttempt >= 0,
  };
}

async function captureReceipt(options) {
  const cases = await buildScionKeyTermRecoveryCases({ cwd: root });
  const profileDir = path.resolve(options.profileDir);
  const cachedBasePath = await findFileByExactSize(profileDir, SCION_BROWSER_GEMMA4_GGUF.runtimeArtifact.bytes);
  if (!cachedBasePath) throw new Error('The exact pinned public browser base is not cached in the isolated profile.');
  const cachedBaseSha256 = await sha256File(cachedBasePath);
  if (cachedBaseSha256 !== SCION_BROWSER_GEMMA4_GGUF.runtimeArtifact.sha256) {
    throw new Error(`Cached browser base hash mismatch: ${cachedBaseSha256}`);
  }
  const server = await createCaptureServer(options.port);
  let context = null;
  try {
    context = await chromium.launchPersistentContext(profileDir, {
      channel: 'chrome',
      headless: options.headless,
      viewport: { width: 1440, height: 1000 },
      args: ['--enable-features=WebAssemblyJspi', '--disable-background-timer-throttling'],
    });
    context.setDefaultTimeout(30 * 60 * 1000);
    // A persistent Chrome profile may restore its startup tab after launch,
    // destroying an in-flight evaluation on that page. Keep the model lab on
    // a new page that is not owned by session restore.
    const page = await context.newPage();
    await Promise.all(
      context
        .pages()
        .filter((candidate) => candidate !== page)
        .map((candidate) => candidate.close().catch(() => {})),
    );
    await page.goto(`${server.origin}/scion-key-term-lab.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(globalThis.__scionDeviceLab), null, { timeout: 120000 });
    const browserProbe = await pageCall(page, 'probeScionDeviceBrowser');
    if (!browserProbe.webgpu || !browserProbe.jspi) throw new Error('Chrome did not expose WebGPU and JSPI.');
    const baseLoad = await pageCall(page, 'loadScionDeviceBase', { contextSize: 2048 });
    if (!baseLoad.completed) throw new Error('The pinned public base did not reach ready state.');

    const capturedCases = [];
    for (const [caseIndex, entry] of cases.entries()) {
      const attempts = [];
      let priorIssues = [];
      for (let attempt = 0; attempt < TEMPERATURES.length; attempt += 1) {
        const messages = buildScionKeyTermRecoveryMessages(entry, { attempt, priorIssues });
        const messagesSha256 = scionRecoverySha256(canonicalScionRecoveryJson(messages));
        const completion = await pageCall(page, 'completeScionDevicePrompt', {
          prompt: messages,
          maxNewTokens: 240,
          temperature: TEMPERATURES[attempt],
          seed: 7 + attempt,
        });
        const assessment = assessScionKeyTermRecoveryOutput(entry, completion.output);
        attempts.push({
          attempt: attempt + 1,
          temperature: TEMPERATURES[attempt],
          seed: 7 + attempt,
          messagesSha256,
          output: completion.output,
          outputSha256: completion.outputSha256,
          firstTokenMs: completion.firstTokenMs,
          totalMs: completion.totalMs,
          assessment,
        });
        priorIssues = [...new Set([...priorIssues, ...assessment.issues])];
        if (assessment.eligible) break;
      }
      const receipt = caseReceipt(entry, attempts);
      capturedCases.push(receipt);
      console.log(
        `[${caseIndex + 1}/${cases.length}] ${entry.id}: ${receipt.admitted ? `pass on attempt ${receipt.acceptedAttempt}` : 'failed'}`,
      );
    }
    const admitted = capturedCases.filter((entry) => entry.admitted).length;
    const baselineBytes = await fsp.readFile(path.join(root, SCION_KEY_TERM_RECOVERY_BASELINE.file));
    return {
      protocol: SCION_KEY_TERM_RECOVERY_PROTOCOL,
      release: SCION_KEY_TERM_RECOVERY_RELEASE,
      generatedAt: new Date().toISOString(),
      status: admitted === cases.length ? 'all-frozen-deficits-recovered' : 'partial-deficit-recovery',
      baseline: {
        file: SCION_KEY_TERM_RECOVERY_BASELINE.file,
        sha256: scionRecoverySha256(baselineBytes),
      },
      implementation: await implementationReceipts(),
      runtime: {
        route: 'real-browser-local-base-only',
        model: SCION_BROWSER_GEMMA4_GGUF.runtimeArtifact,
        browserProbe,
        baseLoad,
        cachedBase: {
          bytes: SCION_BROWSER_GEMMA4_GGUF.runtimeArtifact.bytes,
          sha256: cachedBaseSha256,
          profileRelativePath: path.relative(profileDir, cachedBasePath),
        },
        retryLadder: TEMPERATURES.map((temperature, index) => ({ temperature, seed: 7 + index })),
      },
      cases: capturedCases,
      summary: {
        frozenDeficits: cases.length,
        admitted,
        failed: cases.length - admitted,
        firstAttempt: capturedCases.filter((entry) => entry.acceptedAttempt === 1).length,
        retryRecovered: capturedCases.filter((entry) => Number(entry.acceptedAttempt) > 1).length,
        defectAccounting: SCION_KEY_TERM_RECOVERY_EXPECTED,
      },
      qualityBoundary: {
        evidenceType: 'real-browser-local-targeted-contract-recovery',
        claim:
          'the pinned public browser base can recover the exact frozen v0.16.26 key-term contract deficits under a bounded retry ladder',
        details:
          'Each case is rebuilt from hash-bound retained source-capture evidence. Existing-term repairs preserve term identity while allowing the production-style complete atom to be re-authored; the missing seat forbids duplicate term names. Admission checks structure and valid claim indexes only.',
        doesNotProve: [
          'factual-correctness',
          'educational-quality-superiority',
          'full-course-regeneration-parity',
          'adapter-win',
          'paid-reference-win',
          'human-or-independent-review',
        ],
      },
    };
  } finally {
    await context?.close().catch(() => {});
    await server.close();
  }
}

async function verifyReceipt(receiptPath) {
  const tracked = JSON.parse(await fsp.readFile(receiptPath, 'utf8'));
  if (tracked.protocol !== SCION_KEY_TERM_RECOVERY_PROTOCOL) throw new Error('Unsupported recovery receipt protocol.');
  const cases = await buildScionKeyTermRecoveryCases({ cwd: root });
  if (tracked.cases.length !== cases.length) throw new Error('Recovery receipt case count changed.');
  const implementation = await implementationReceipts();
  if (canonicalScionRecoveryJson(tracked.implementation) !== canonicalScionRecoveryJson(implementation)) {
    throw new Error('Recovery receipt implementation hashes changed.');
  }
  const baselineBytes = await fsp.readFile(path.join(root, SCION_KEY_TERM_RECOVERY_BASELINE.file));
  if (tracked.baseline?.sha256 !== scionRecoverySha256(baselineBytes))
    throw new Error('Baseline receipt hash changed.');
  if (tracked.runtime?.model?.sha256 !== SCION_BROWSER_GEMMA4_GGUF.runtimeArtifact.sha256) {
    throw new Error('Recovery receipt is not bound to the pinned public browser base.');
  }
  cases.forEach((entry, index) => {
    const trackedCase = tracked.cases[index];
    const input = recoveryCaseInputBinding(entry);
    if (canonicalScionRecoveryJson(trackedCase.input) !== canonicalScionRecoveryJson(input)) {
      throw new Error(`Recovery case input changed: ${entry.id}`);
    }
    if (trackedCase.inputSha256 !== scionRecoverySha256(canonicalScionRecoveryJson(input))) {
      throw new Error(`Recovery case input hash mismatch: ${entry.id}`);
    }
    trackedCase.attempts.forEach((attempt) => {
      if (attempt.outputSha256 !== scionRecoverySha256(attempt.output)) {
        throw new Error(`Recovery output hash mismatch: ${entry.id} attempt ${attempt.attempt}`);
      }
      const messages = buildScionKeyTermRecoveryMessages(entry, {
        attempt: attempt.attempt - 1,
        priorIssues:
          attempt.attempt > 1
            ? [
                ...new Set(
                  trackedCase.attempts
                    .slice(0, attempt.attempt - 1)
                    .flatMap((priorAttempt) => priorAttempt.assessment.issues),
                ),
              ]
            : [],
      });
      if (attempt.messagesSha256 !== scionRecoverySha256(canonicalScionRecoveryJson(messages))) {
        throw new Error(`Recovery prompt hash mismatch: ${entry.id} attempt ${attempt.attempt}`);
      }
      const assessment = assessScionKeyTermRecoveryOutput(entry, attempt.output);
      if (canonicalScionRecoveryJson(attempt.assessment) !== canonicalScionRecoveryJson(assessment)) {
        throw new Error(`Recovery assessment changed: ${entry.id} attempt ${attempt.attempt}`);
      }
    });
    const accepted = trackedCase.attempts.findIndex((attempt) => attempt.assessment.eligible);
    const acceptedAttempt = accepted >= 0 ? accepted + 1 : null;
    if (trackedCase.acceptedAttempt !== acceptedAttempt || trackedCase.admitted !== accepted >= 0) {
      throw new Error(`Recovery acceptance accounting mismatch: ${entry.id}`);
    }
  });
  const admitted = tracked.cases.filter((entry) => entry.admitted).length;
  if (tracked.summary.admitted !== admitted || tracked.summary.failed !== cases.length - admitted) {
    throw new Error('Recovery summary accounting mismatch.');
  }
  return tracked;
}

export async function runScionKeyTermRecoveryAudit(options = {}) {
  const receiptPath = path.resolve(options.receipt || DEFAULT_RECEIPT);
  if (options.capture) {
    const receipt = await captureReceipt(options);
    await fsp.mkdir(path.dirname(receiptPath), { recursive: true });
    await fsp.writeFile(receiptPath, canonicalScionRecoveryJson(receipt));
    return { receipt, receiptPath, wrote: true };
  }
  return { receipt: await verifyReceipt(receiptPath), receiptPath, wrote: false };
}

async function main() {
  const result = await runScionKeyTermRecoveryAudit(parseArgs(process.argv.slice(2)));
  const { summary, status } = result.receipt;
  console.log(`Scion browser key-term recovery: ${status}.`);
  console.log(
    `${summary.admitted}/${summary.frozenDeficits} frozen deficits admitted; ${summary.firstAttempt} first-attempt, ${summary.retryRecovered} bounded-retry recoveries.`,
  );
  console.log(
    'Boundary: targeted deterministic contract recovery only; no factual, educational, adapter, or model win.',
  );
  console.log(`${result.wrote ? 'Wrote' : 'Verified'}: ${path.relative(root, result.receiptPath)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
