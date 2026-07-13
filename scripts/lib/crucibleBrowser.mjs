// Crucible browser-run module — drives one CourseMapper generation end-to-end
// against a vite preview server and captures the artifacts the grader needs
// (zip, verbatim console log, [CM][DIGEST] json, failure screenshots).
//
// Flow/selector logic is borrowed from the proven v0.8.x loop in
// scripts/liveBrowserQualityLoop.mjs (cited inline). That file stays as-is;
// this is the cleaner reusable build for scripts/crucible.mjs.
import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROVIDER_KEY_RULES, pickApiKeyFromEnvText } from './crucibleRound.mjs';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(moduleDir, '..', '..');
export const defaultApiEnvPath = path.join(repoRoot, 'API-dontComit', 'api.ev');

const MODEL_DISPLAY_NAMES = {
  'gpt-5.4-mini': 'GPT-5.4 mini',
  'gpt-5.4': 'GPT-5.4',
  // V0.14.5 WS-E (E1): per-provider Crucible defaults (see PROVIDER_DEFAULT_MODELS
  // in crucibleRound.mjs for why these exact ids).
  'claude-haiku-4-5': 'Claude Haiku 4.5',
  'gemini-2.5-flash-lite': 'Gemini 2.5 Flash Lite',
  'scion-public': 'Scion Draft',
};

export function modelDisplayName(modelId) {
  return MODEL_DISPLAY_NAMES[modelId] || modelId;
}

// Borrowed from scripts/liveBrowserQualityLoop.mjs (redact). E1: covers all
// three provider key shapes — sk-ant-… matches the sk- rule; AIza… (Google)
// gets its own rule.
export function redactSecrets(value) {
  return String(value || '')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[redacted-api-key]')
    .replace(/\bAIza[0-9A-Za-z_-]{8,}\b/g, '[redacted-google-key]');
}

// ── V0.14.5 WS-E (E1): provider-aware API key loading ───────────────────────
// The pure half (PROVIDER_KEY_RULES + pickApiKeyFromEnvText) lives in
// crucibleRound.mjs so it is unit-testable without this module's Playwright
// import; this is the fs/env half.
export { pickApiKeyFromEnvText };

/**
 * Borrowed from scripts/liveBrowserQualityLoop.mjs (readApiKey), extended for
 * provider breadth (E1): per-provider env fallbacks first, then the
 * API-dontComit/api.ev file. A missing key throws a CLEAR, actionable message
 * naming the provider, the env vars checked, and the expected key shape —
 * the driver exits on it before any server/browser/spend.
 */
export async function loadApiKey(apiEnvPath = defaultApiEnvPath, provider = 'openai') {
  // Scion (V2.1 D): the local provider is keyless — "credentials" are the
  // running server, validated by the app's own /v1/models probe.
  if (provider === 'local' || provider === 'public') return '';
  const rules = PROVIDER_KEY_RULES[provider];
  if (!rules) throw new Error(`Unknown provider "${provider}" (expected openai, anthropic, or google)`);
  for (const envVar of rules.envVars) {
    const fromEnv = process.env[envVar];
    if (fromEnv?.trim()) return fromEnv.trim();
  }

  const content = await fs.readFile(apiEnvPath, 'utf8').catch(() => '');
  const picked = pickApiKeyFromEnvText(content, provider);
  if (picked) return picked;
  throw new Error(
    `No ${provider} API key found — checked env (${rules.envVars.join(', ')}) and ${apiEnvPath} ` +
      `for a ${rules.shapeHint} key. Add one or run with a provider whose key is configured.`,
  );
}

// Borrowed from scripts/liveBrowserQualityLoop.mjs (isPortFree/findFreePort).
async function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

async function findFreePort(startPort) {
  for (let port = startPort; port < startPort + 50; port += 1) {
    if (await isPortFree(port)) return port;
  }
  throw new Error(`Could not find a free port starting at ${startPort}`);
}

// Borrowed from scripts/liveBrowserQualityLoop.mjs (waitForUrl).
async function waitForUrl(url, timeoutMs = 60_000) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError?.message || 'no response'}`);
}

async function newestMtimeUnder(rootDir) {
  let newest = 0;
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else {
        const stat = await fs.stat(full).catch(() => null);
        if (stat && stat.mtimeMs > newest) newest = stat.mtimeMs;
      }
    }
  }
  return newest;
}

// dist/ is considered fresh when its newest file is at least as new as every
// production input. public/** matters: Foundry writes genome shards there,
// and reusing a bundle older than those shards silently audits old knowledge.
export async function isDistFresh(root = repoRoot) {
  const distDir = path.join(root, 'dist');
  const distIndex = await fs.stat(path.join(distDir, 'index.html')).catch(() => null);
  if (!distIndex) return false;
  const distNewest = await newestMtimeUnder(distDir);
  let srcNewest = Math.max(
    await newestMtimeUnder(path.join(root, 'src')),
    await newestMtimeUnder(path.join(root, 'public')),
  );
  for (const extra of ['index.html', 'vite.config.js', 'package.json']) {
    const stat = await fs.stat(path.join(root, extra)).catch(() => null);
    if (stat && stat.mtimeMs > srcNewest) srcNewest = stat.mtimeMs;
  }
  return distNewest >= srcNewest;
}

async function runViteBuild() {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', 'build'], {
      cwd: repoRoot,
      env: { ...process.env, BROWSER: 'none' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve(redactSecrets(output));
      else reject(new Error(`vite build exited with code ${code}\n${redactSecrets(output).slice(-4000)}`));
    });
  });
}

/**
 * Start a vite preview server against the existing dist/ build.
 *
 * @param {object} [options]
 * @param {boolean|'auto'} [options.build='auto'] true: always rebuild;
 *   false: never rebuild (throws if dist/ is missing); 'auto' (default):
 *   reuse dist/ when it is newer than the newest src file, else `vite build`.
 * @param {number} [options.port=4173] preferred port (first free port wins).
 * @param {string} [options.logPath] optional file for preview-server output.
 * @returns {Promise<{ baseUrl: string, port: number, didBuild: boolean, stop: () => Promise<void> }>}
 */
export async function startAppServer({ build = 'auto', port: preferredPort = 4173, logPath } = {}) {
  let didBuild = false;
  if (build === true) {
    await runViteBuild();
    didBuild = true;
  } else if (build === false) {
    const distIndex = await fs.stat(path.join(repoRoot, 'dist', 'index.html')).catch(() => null);
    if (!distIndex)
      throw new Error('startAppServer({ build: false }) but dist/index.html is missing — run vite build first');
  } else if (!(await isDistFresh())) {
    await runViteBuild();
    didBuild = true;
  }

  const port = await findFreePort(preferredPort);
  const output = logPath ? await fs.open(logPath, 'a') : null;
  const child = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: repoRoot,
    env: { ...process.env, BROWSER: 'none' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => output?.write(redactSecrets(chunk)).catch(() => {}));
  child.stderr.on('data', (chunk) => output?.write(redactSecrets(chunk)).catch(() => {}));

  const closeOutput = async () => {
    try {
      await output?.close();
    } catch {
      // Output stream may already be closed if vite exits during cleanup.
    }
  };
  child.once('exit', () => {
    closeOutput();
  });

  await waitForUrl(`http://127.0.0.1:${port}/`, 60_000);

  return {
    baseUrl: `http://127.0.0.1:${port}/`,
    port,
    didBuild,
    async stop() {
      if (!child.killed) child.kill('SIGTERM');
      await closeOutput();
    },
  };
}

// Borrowed from scripts/liveBrowserQualityLoop.mjs (safeText).
async function safeText(locator) {
  try {
    if ((await locator.count()) === 0) return '';
    return ((await locator.first().innerText({ timeout: 2_000 })) || '').trim();
  } catch {
    return '';
  }
}

async function getZipAction(page) {
  const sidePanelZip = page.getByTestId('export-download-zip');
  if (
    (await sidePanelZip.count()) > 0 &&
    (await sidePanelZip
      .first()
      .isVisible()
      .catch(() => false))
  ) {
    return sidePanelZip.first();
  }

  const headerZip = page.getByTestId('primary-cta').filter({ hasText: /Download ZIP/i });
  if (
    (await headerZip.count()) > 0 &&
    (await headerZip
      .first()
      .isVisible()
      .catch(() => false))
  ) {
    return headerZip.first();
  }

  return sidePanelZip.first();
}

// Borrowed from scripts/liveBrowserQualityLoop.mjs (waitForExportIdle).
async function waitForExportIdle(page, timeoutMs) {
  await page.waitForFunction(
    () => {
      /* global document */
      const panel = document.querySelector('[data-testid="export-side-panel"]')?.innerText || '';
      return !/Finishing package|checking materials|Generating course materials|Preparing export/i.test(panel);
    },
    null,
    { timeout: timeoutMs },
  );
  await page.waitForTimeout(750);
}

// Borrowed from scripts/liveBrowserQualityLoop.mjs (waitForExportSidePanel).
async function waitForExportSidePanel(page, timeoutMs) {
  const panel = page.getByTestId('export-side-panel');
  try {
    await panel.waitFor({ timeout: timeoutMs });
    return panel;
  } catch (error) {
    const [agentState, workspaceState] = await Promise.all([
      safeText(page.getByTestId('workspace-agent-panel')),
      safeText(page.getByTestId('workspace-shell')),
    ]);
    const stateDetails = [
      agentState ? `Agent state:\n${agentState}` : '',
      workspaceState ? `Workspace state:\n${workspaceState.slice(0, 1200)}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
    throw new Error(
      `Export side panel did not appear after ${Math.round(timeoutMs / 1000)}s. ${
        stateDetails || 'No workspace state was available.'
      }\n${error.message || error}`,
    );
  }
}

// Borrowed from scripts/liveBrowserQualityLoop.mjs (ensurePackageReady):
// switch scope to the full package, then click through "Finish package"
// states until the ZIP button reads "Download ZIP".
export async function ensurePackageReady(page, remaining) {
  await waitForExportSidePanel(page, remaining(600_000));
  await page.getByTestId('export-scope-all').click();
  await page.getByTestId('readiness-panel').waitFor({ timeout: remaining(600_000) });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const status = await safeText(page.getByTestId('readiness-status'));
    const zipButton = await getZipAction(page);
    const zipLabel = await safeText(zipButton);
    if (/Ready to download|Ready/i.test(status) && /Download ZIP/i.test(zipLabel)) return;

    const inlineFinish = page.getByTestId('readiness-finish-package');
    if (
      (await inlineFinish.count()) > 0 &&
      (await inlineFinish
        .first()
        .isVisible()
        .catch(() => false))
    ) {
      await inlineFinish.first().click();
      await waitForExportIdle(page, remaining(240_000));
      continue;
    }

    if (/Finish package/i.test(zipLabel)) {
      await zipButton.click();
      await waitForExportIdle(page, remaining(240_000));
      continue;
    }

    break;
  }

  const panelText = await safeText(page.getByTestId('export-side-panel'));
  throw new Error(`Package was not ready to download after finalization.\n${panelText}`);
}

// Borrowed from scripts/liveBrowserQualityLoop.mjs (downloadZip).
export async function downloadZip(page, destinationPath, remaining) {
  const zipButton = await getZipAction(page);
  await expect(zipButton).toContainText(/Download ZIP/, { timeout: remaining(30_000) });
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: remaining(120_000) }),
    zipButton.click(),
  ]);
  const failure = await download.failure();
  if (failure) throw new Error(failure);
  await download.saveAs(destinationPath);
  const stat = await fs.stat(destinationPath);
  if (stat.size < 10_000) throw new Error(`Downloaded ZIP is unexpectedly small: ${stat.size} bytes`);
  return { suggestedFilename: download.suggestedFilename(), path: destinationPath, size: stat.size };
}

function parseDigestLine(text) {
  const match = String(text || '').match(/\[CM\]\[DIGEST\]\s*(\{[\s\S]*\})/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

// ── Local-model shim reroute (--llm local; legacy alias: e2b) ────────────────
// Forward one intercepted api.openai.com request to the local shim. GET
// /v1/models (the "Connected" key validation) is answered inline. Streaming
// shim replies pass through byte-for-byte; non-streaming replies are wrapped
// only when a compatibility shim returns JSON despite stream:true.
export function normalizeLlmShimResponse({ bodyText, contentType = '', wantsStream, isResponses, status = 200 }) {
  if (!wantsStream) return { status, contentType: 'application/json', body: bodyText };
  if (String(contentType).toLowerCase().includes('text/event-stream')) {
    return { status, contentType: 'text/event-stream', body: bodyText };
  }
  let payload = {};
  try {
    payload = JSON.parse(bodyText);
  } catch {
    /* malformed compatibility response becomes an empty model delta */
  }
  const text = isResponses ? (payload.output_text ?? '') : (payload.choices?.[0]?.message?.content ?? '');
  const events = isResponses
    ? [
        { type: 'response.output_text.delta', delta: text },
        { type: 'response.completed', response: payload },
      ]
    : [
        {
          id: 'local-shim',
          object: 'chat.completion.chunk',
          choices: [{ index: 0, delta: { role: 'assistant', content: text }, finish_reason: null }],
        },
        {
          id: 'local-shim',
          object: 'chat.completion.chunk',
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        },
      ];
  return {
    status,
    contentType: 'text/event-stream',
    body: `${events.map((event) => `data: ${JSON.stringify(event)}`).join('\n\n')}\n\ndata: [DONE]\n\n`,
  };
}

async function forwardToLlmShim(route, llmShimUrl) {
  const request = route.request();
  const url = new URL(request.url());
  if (request.method() !== 'POST') {
    // The app filters this catalog through OPENAI_INCLUDE (useStreamReader
    // fetchModelsFromProvider) — the id must be one it recognizes, so
    // advertise the seeded modelId's family, not the actual local model.
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        object: 'list',
        data: [
          { id: 'gpt-5.4-mini', object: 'model', created: 1 },
          { id: 'gpt-5.4', object: 'model', created: 1 },
        ],
      }),
    });
    return;
  }
  const postData = request.postData() || '';
  let wantsStream = false;
  try {
    wantsStream = JSON.parse(postData)?.stream === true;
  } catch {
    /* empty */
  }
  try {
    const upstream = await fetch(`${llmShimUrl}${url.pathname}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: postData,
    });
    const bodyText = await upstream.text();
    const isResponses = url.pathname.includes('/responses');
    await route.fulfill(
      normalizeLlmShimResponse({
        bodyText,
        contentType: upstream.headers.get('content-type') || '',
        wantsStream,
        isResponses,
        status: upstream.status,
      }),
    );
  } catch (error) {
    await route.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({ error: { message: `E2B shim unreachable: ${error.message}` } }),
    });
  }
}

/**
 * Generate ONE course end-to-end in a real browser and collect artifacts.
 *
 * @param {object} options
 * @param {string} options.baseUrl preview-server URL from startAppServer().
 * @param {{ id: string, title: string, lessonCount: number, prompt: string }} options.course
 * @param {string} options.apiKey OpenAI API key.
 * @param {string} [options.modelId='gpt-5.4-mini']
 * @param {string} [options.modelName] display name (defaults from modelId).
 * @param {string} options.outDir artifact directory for this course run.
 * @param {boolean} [options.headed=false]
 * @param {import('@playwright/test').Browser} [options.browser] optional shared browser.
 * @param {number} [options.overallTimeoutMs=720000] hard 12-minute budget per course.
 * @returns {Promise<{ status: 'passed'|'failed', zipPath: string|null, consoleLogPath: string,
 *   digest: object|null, digestPath: string|null, durationMs: number, phase: string, error?: string }>}
 */
export async function runCourseInBrowser({
  baseUrl,
  course,
  apiKey,
  modelId = 'gpt-5.4-mini',
  modelName,
  outDir,
  headed = false,
  browser: sharedBrowser,
  overallTimeoutMs = 12 * 60_000,
  // V0.15.1 post-flip: undefined seeds nothing so the app's current default
  // path is tested. Explicit 'prose' / 'native' arms still seed their mode for
  // controlled comparisons.
  authoringMode,
  voiceMode, // v0.14.7 WS-D3: seeds 'coursemapper-voice-pass' when 'on'
  // V0.14.5 WS-E (E1): which provider the app should run against. Seeds
  // 'coursemapper-provider' plus the provider-scoped key slot the app reads
  // (src/contexts/AIConfigContext.jsx getSavedApiKeyForProvider).
  provider = 'openai',
  // E2B experiment (--llm e2b): reroute every api.openai.com call this
  // context makes to the local OpenAI-compatible shim
  // (scripts/crucible/e2bOpenAIShim.mjs) — the app compiler runs with the
  // on-device model as its ONLY LLM, zero src/ changes, zero paid spend.
  llmShimUrl = null,
  // Real Local-provider route. Unlike llmShimUrl, this is called directly by
  // the page so SSE keep-alive heartbeats are not buffered by Playwright.
  localEndpoint = null,
}) {
  const startedAt = Date.now();
  const deadlineAt = startedAt + overallTimeoutMs;
  const remaining = (capMs) => {
    const left = deadlineAt - Date.now();
    if (left <= 0) {
      throw new Error(`Course run exceeded the overall ${Math.round(overallTimeoutMs / 60_000)}-minute budget`);
    }
    return capMs ? Math.min(capMs, left) : left;
  };

  await fs.mkdir(outDir, { recursive: true });
  const consoleLogPath = path.join(outDir, 'console.log');
  const consoleHandle = await fs.open(consoleLogPath, 'w');
  // Serialize writes so the console log keeps browser message order.
  let consoleWriteQueue = Promise.resolve();
  let lastDigest = null;
  const appendConsoleLine = (line) => {
    consoleWriteQueue = consoleWriteQueue.then(() => consoleHandle.write(`${line}\n`)).catch(() => {});
  };

  const browser = sharedBrowser || (await chromium.launch({ headless: !headed }));
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: headed ? { width: 1440, height: 960 } : { width: 1500, height: 1000 },
  });
  if (llmShimUrl) {
    await context.route('https://api.openai.com/**', (route) => forwardToLlmShim(route, llmShimUrl));
  }
  const page = await context.newPage();

  // Every console message, timestamped, message text VERBATIM — the [CM]
  // lines are the pipeline story and must be preserved exactly (only API
  // keys are redacted, and those never appear in [CM] lines).
  page.on('console', (message) => {
    const text = redactSecrets(message.text());
    appendConsoleLine(`${new Date().toISOString()} [${message.type()}] ${text}`);
    const digest = parseDigestLine(text);
    if (digest) lastDigest = digest;
  });
  page.on('pageerror', (error) => {
    appendConsoleLine(`${new Date().toISOString()} [pageerror] ${redactSecrets(error.message)}`);
  });

  let phase = 'starting';
  let zipPath = null;
  let status = 'failed';
  let errorText = null;
  let legacyPathTelemetry = null;
  // v0.14.9 C2: --voice ab twin output ({ voicedZipPath, outcome }) or null.
  let voiceAb = null;

  try {
    phase = 'loading-landing';
    // localStorage seeding borrowed from scripts/liveBrowserQualityLoop.mjs (runCourse).
    await page.addInitScript(
      ({ key, selectedModelId, selectedModelName, authoring, voice, selectedProvider, selectedLocalEndpoint }) => {
        localStorage.clear();
        sessionStorage.clear();
        // E1: the app reads the provider from 'coursemapper-provider' and the
        // key from the provider-scoped slot (plaintext is accepted — the
        // secureStorage getter falls back to plaintext for legacy values).
        localStorage.setItem('coursemapper-provider', selectedProvider);
        localStorage.setItem('coursemapper-apikey', key);
        localStorage.setItem(`coursemapper-apikey-provider:${selectedProvider}`, key);
        localStorage.setItem('coursemapper-modelid', selectedModelId);
        localStorage.setItem('coursemapper-modelname', selectedModelName);
        if (selectedProvider === 'local') {
          localStorage.setItem('coursemapper-enable-local-provider', 'true');
          if (selectedLocalEndpoint) localStorage.setItem('coursemapper-local-endpoint', selectedLocalEndpoint);
        }
        // v0.15.1 (post-flip): the app defaults are native + voiced. Plain
        // rounds seed NOTHING (test what users get); explicit arms seed
        // their mode, including the opt-outs ('prose', 'off') that the
        // quiet/ab twins depend on for a voice-free generation.
        if (authoring === 'native') localStorage.setItem('coursemapper-authoring-mode', 'native');
        if (authoring === 'prose') localStorage.setItem('coursemapper-authoring-mode', 'prose');
        if (voice === 'on') localStorage.setItem('coursemapper-voice-pass', 'on');
        if (voice === 'off' || voice === 'ab') localStorage.setItem('coursemapper-voice-pass', 'off');
      },
      {
        key: apiKey,
        selectedModelId: modelId,
        selectedModelName: modelName || modelDisplayName(modelId),
        authoring: authoringMode || null,
        voice: voiceMode || null,
        selectedProvider: provider || 'openai',
        selectedLocalEndpoint: localEndpoint || null,
      },
    );
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

    phase = 'validating-provider';
    // "Connected" badge — src/screens/Landing.jsx:694 (selector borrowed from liveBrowserQualityLoop.mjs).
    await expect(page.getByText('Connected').first()).toBeVisible({ timeout: remaining(120_000) });

    phase = 'submitting-prompt';
    // aria-label "Describe your course" — src/screens/Landing.jsx:567.
    await page.getByLabel('Describe your course').fill(course.prompt);
    const quickStart = page.getByTestId('landing-quick-start');
    const canQuickStart =
      (await quickStart.count()) > 0 &&
      (await quickStart
        .first()
        .isVisible()
        .catch(() => false));
    if (canQuickStart) {
      // v0.16.3: the full-course action is the primary first-run path and
      // selects the same complete package this harness used to choose across
      // FeatureSelect + Config. Test the real primary journey when available.
      await expect(quickStart).toBeEnabled({ timeout: remaining(10_000) });
      await quickStart.click();
    } else {
      // Compatibility path for historical release checkouts.
      const landingContinue = page.getByRole('button', { name: /^(Continue|Adjust setup|Customize package)$/ }).last();
      await expect(landingContinue).toBeEnabled({ timeout: remaining(10_000) });
      await landingContinue.click();

      phase = 'selecting-package-contents';
      await page.getByTestId('feature-select-continue').waitFor({ timeout: remaining(60_000) });
      const selectAll = page.getByRole('button', { name: /^Select all$/ });
      if (
        (await selectAll.count()) > 0 &&
        (await selectAll
          .first()
          .isVisible()
          .catch(() => false))
      ) {
        await selectAll.first().click();
      }
      await page.getByTestId('feature-select-continue').click();

      phase = 'configuring-generation';
      const generateButton = page.getByTestId('config-generate-button');
      await expect(generateButton).toBeEnabled({ timeout: remaining(60_000) });
      await generateButton.click();
    }

    phase = 'generating-workspace';
    // Generation can take 5+ minutes; bounded by the overall budget. On-device
    // LLM retry ladders run ~2min/call — shim rounds get 3× step caps so the
    // app's own recovery path can finish instead of the driver aborting it.
    const stepCap = llmShimUrl || localEndpoint ? (cap) => remaining(cap ? cap * 3 : cap) : remaining;
    await page.getByTestId('workspace-shell').waitFor({ timeout: stepCap(600_000) });

    phase = 'finalizing-package';
    await ensurePackageReady(page, stepCap);

    phase = 'downloading-zip';
    zipPath = path.join(outDir, `${course.id}-package.zip`);
    await downloadZip(page, zipPath, remaining);

    // v0.14.9 C2: --voice ab — the same-generation A/B. The generation above
    // ran with the voice flag OFF, so the zip just saved is the QUIET twin.
    // Enable the flag, run the post-hoc voice pass over the SAME compiled
    // state (the app's driver event hook), and export the VOICED twin: two
    // packages from one generation, differing only by voiced surfaces.
    if (voiceMode === 'ab') {
      phase = 'voice-ab-pass';
      const voiceOutcome = await page.evaluate(async () => {
        localStorage.setItem('coursemapper-voice-pass', 'on');
        return await new Promise((resolve) => {
          const timer = setTimeout(() => resolve({ ran: false, reason: 'timeout waiting for voice pass' }), 240_000);
          const onDone = (event) => {
            clearTimeout(timer);
            globalThis.removeEventListener('coursemapper:dev-voice-pass-done', onDone);
            resolve(event.detail || null);
          };
          globalThis.addEventListener('coursemapper:dev-voice-pass-done', onDone);
          globalThis.dispatchEvent(new CustomEvent('coursemapper:dev-run-voice-pass'));
        });
      });
      appendConsoleLine(
        `${new Date().toISOString()} [crucible-driver] voice ab pass: ${JSON.stringify(voiceOutcome || null)}`,
      );
      if (!voiceOutcome?.ran) {
        throw new Error(`voice ab pass did not run: ${voiceOutcome?.reason || 'no outcome'}`);
      }
      phase = 'voice-ab-download';
      const voicedZipPath = path.join(outDir, `${course.id}-voiced-package.zip`);
      await downloadZip(page, voicedZipPath, remaining);
      voiceAb = { voicedZipPath, outcome: voiceOutcome };
    }

    phase = 'done';
    await page.screenshot({ path: path.join(outDir, 'workspace-ready.png'), fullPage: true }).catch(() => {});
    status = 'passed';
    // Twin protocol (Prof): capture the GENERATION itself, not just its
    // export. The autosaved project (course map + enrichment + graph) is the
    // raw material for same-generation A/B — compile it under two compiler
    // versions and any judged difference is the compiler's, with generation
    // variance cancelled. Failure runs already dump this for forensics;
    // success runs need it for measurement.
    // Project autosave is deliberately debounced by 3s. Wait through that
    // boundary so the captured graph and deliverables describe the finished
    // package rather than the earlier `streaming` render.
    await page.waitForTimeout(3500);
    const projectAtSuccess = await page.evaluate(() => localStorage.getItem('coursemapper-project')).catch(() => null);
    if (projectAtSuccess) {
      await fs.writeFile(path.join(outDir, 'project.json'), projectAtSuccess).catch(() => {});
    }
    // WS-C C4: read the compiler's legacy-branch telemetry while the page is alive.
    legacyPathTelemetry = await page
      .evaluate(() =>
        typeof globalThis.__cmLegacyPathTelemetry === 'function' ? globalThis.__cmLegacyPathTelemetry() : null,
      )
      .catch(() => null);
  } catch (error) {
    errorText = redactSecrets(error.stack || error.message || String(error));
    appendConsoleLine(
      `${new Date().toISOString()} [crucible-driver] FAILED during ${phase}: ${errorText.split('\n')[0]}`,
    );
    await page.screenshot({ path: path.join(outDir, `failure-${phase}.png`), fullPage: true }).catch(() => {});
    // Failure forensics: the autosaved project (course map + compiled
    // deliverables + quality report) is the only way to re-grade a blocked
    // package headlessly — screenshots alone made the exam-content P0
    // undiagnosable from round artifacts.
    const projectDump = await page.evaluate(() => localStorage.getItem('coursemapper-project')).catch(() => null);
    if (projectDump) {
      await fs.writeFile(path.join(outDir, `project-at-failure-${phase}.json`), projectDump).catch(() => {});
    }
  } finally {
    await context.close().catch(() => {});
    if (!sharedBrowser) await browser.close().catch(() => {});
    await consoleWriteQueue.catch(() => {});
    await consoleHandle.close().catch(() => {});
  }

  let digestPath = null;
  if (lastDigest) {
    digestPath = path.join(outDir, 'digest.json');
    await fs.writeFile(digestPath, `${JSON.stringify(lastDigest, null, 2)}\n`);
  }

  const result = {
    status,
    zipPath,
    consoleLogPath,
    digest: lastDigest,
    digestPath,
    durationMs: Date.now() - startedAt,
    phase,
    legacyPathTelemetry,
    voiceAb,
  };
  if (errorText) result.error = errorText;
  return result;
}
