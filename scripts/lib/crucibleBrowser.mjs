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

// dist/ is considered fresh when its newest file is at least as new as the
// newest source input (src/**, index.html, vite.config.js, package.json).
export async function isDistFresh() {
  const distDir = path.join(repoRoot, 'dist');
  const distIndex = await fs.stat(path.join(distDir, 'index.html')).catch(() => null);
  if (!distIndex) return false;
  const distNewest = await newestMtimeUnder(distDir);
  let srcNewest = await newestMtimeUnder(path.join(repoRoot, 'src'));
  for (const extra of ['index.html', 'vite.config.js', 'package.json']) {
    const stat = await fs.stat(path.join(repoRoot, extra)).catch(() => null);
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
async function ensurePackageReady(page, remaining) {
  await waitForExportSidePanel(page, remaining(600_000));
  await page.getByTestId('export-scope-all').click();
  await page.getByTestId('readiness-panel').waitFor({ timeout: remaining(600_000) });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const status = await safeText(page.getByTestId('readiness-status'));
    const zipLabel = await safeText(page.getByTestId('export-download-zip'));
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
      await page.getByTestId('export-download-zip').click();
      await waitForExportIdle(page, remaining(240_000));
      continue;
    }

    break;
  }

  const panelText = await safeText(page.getByTestId('export-side-panel'));
  throw new Error(`Package was not ready to download after finalization.\n${panelText}`);
}

// Borrowed from scripts/liveBrowserQualityLoop.mjs (downloadZip).
async function downloadZip(page, destinationPath, remaining) {
  const zipButton = page.getByTestId('export-download-zip');
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
  // V0.14.5 WS-B3: 'native' seeds the coursemapper-authoring-mode flag so the
  // app runs the Pass A/B graph-authoring path; 'prose'/undefined seeds
  // nothing (absence IS the prose default — readAuthoringMode()).
  authoringMode,
  voiceMode, // v0.14.7 WS-D3: seeds 'coursemapper-voice-pass' when 'on'
  // V0.14.5 WS-E (E1): which provider the app should run against. Seeds
  // 'coursemapper-provider' plus the provider-scoped key slot the app reads
  // (src/contexts/AIConfigContext.jsx getSavedApiKeyForProvider).
  provider = 'openai',
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

  try {
    phase = 'loading-landing';
    // localStorage seeding borrowed from scripts/liveBrowserQualityLoop.mjs (runCourse).
    await page.addInitScript(
      ({ key, selectedModelId, selectedModelName, authoring, voice, selectedProvider }) => {
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
        // WS-B3: only 'native' is ever written — absence is the prose default.
        if (authoring === 'native') localStorage.setItem('coursemapper-authoring-mode', 'native');
        if (voice === 'on') localStorage.setItem('coursemapper-voice-pass', 'on');
      },
      {
        key: apiKey,
        selectedModelId: modelId,
        selectedModelName: modelName || modelDisplayName(modelId),
        authoring: authoringMode || null,
        voice: voiceMode || null,
        selectedProvider: provider || 'openai',
      },
    );
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

    phase = 'validating-provider';
    // "Connected" badge — src/screens/Landing.jsx:694 (selector borrowed from liveBrowserQualityLoop.mjs).
    await expect(page.getByText('Connected').first()).toBeVisible({ timeout: remaining(120_000) });

    phase = 'submitting-prompt';
    // aria-label "Describe your course" — src/screens/Landing.jsx:567.
    await page.getByLabel('Describe your course').fill(course.prompt);
    const landingContinue = page.getByRole('button', { name: /^Continue$/ }).last();
    await expect(landingContinue).toBeEnabled({ timeout: remaining(10_000) });
    await landingContinue.click();

    phase = 'selecting-package-contents';
    // data-testid feature-select-continue — src/screens/FeatureSelect.jsx:814.
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
    // data-testid config-generate-button ("Generate workspace") — src/screens/Config.jsx:2137.
    const generateButton = page.getByTestId('config-generate-button');
    await expect(generateButton).toBeEnabled({ timeout: remaining(60_000) });
    await generateButton.click();

    phase = 'generating-workspace';
    // Generation can take 5+ minutes; bounded by the overall budget.
    await page.getByTestId('workspace-shell').waitFor({ timeout: remaining(600_000) });

    phase = 'finalizing-package';
    await ensurePackageReady(page, remaining);

    phase = 'downloading-zip';
    zipPath = path.join(outDir, `${course.id}-package.zip`);
    await downloadZip(page, zipPath, remaining);

    phase = 'done';
    await page.screenshot({ path: path.join(outDir, 'workspace-ready.png'), fullPage: true }).catch(() => {});
    status = 'passed';
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
  };
  if (errorText) result.error = errorText;
  return result;
}
