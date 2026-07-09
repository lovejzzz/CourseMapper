import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveCourses } from '../crucible/courses.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, '../..');
export const SCION_MODEL_ID = 'scion-1.2';
export const SCION_MODEL_NAME = 'Scion-1.2';
export const SCION_GAUNTLET_ROOT = path.join(repoRoot, 'verification-output', 'scion-1.2-gauntlet');
export const DEFAULT_SCION_COURSES = ['music-theory', 'cs-python', 'geology', 'world-lit-readings'];
export const DEFAULT_SCION_THRESHOLDS = {
  minOverall: 98,
  maxP0: 0,
  maxP1: 1,
  minTexture: 92,
  maxCostUsd: 0,
};
export const SCION_11_MODEL_ID = SCION_MODEL_ID;
export const SCION_11_MODEL_NAME = SCION_MODEL_NAME;
export const SCION_11_GAUNTLET_ROOT = SCION_GAUNTLET_ROOT;
export const DEFAULT_SCION_11_COURSES = DEFAULT_SCION_COURSES;
export const DEFAULT_SCION_11_THRESHOLDS = DEFAULT_SCION_THRESHOLDS;

function timestampId(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

export function parseScionGauntletArgs(argv = []) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const [rawKey, inlineValue] = arg.slice(2).split('=');
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (inlineValue !== undefined) {
      options[key] = inlineValue;
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      options[key] = true;
      continue;
    }
    options[key] = next;
    index += 1;
  }
  return options;
}

export function resolveScionCourseIds(spec = 'scion12') {
  const value = String(spec || 'scion12').trim();
  if (!value || value === 'scion12' || value === 'scion11' || value === 'default') return [...DEFAULT_SCION_COURSES];
  return resolveCourses(value).map((course) => course.id);
}

export function providerCourseId(courseId, provider = 'local') {
  return provider && provider !== 'openai' ? `${courseId}--${provider}` : courseId;
}

export function baseCourseId(courseId = '') {
  return String(courseId).replace(/--(?:local|openai|anthropic|google|e2b|native|prose|quiet|voiced)$/i, '');
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

async function listRoundReportDirs(roundDir) {
  const entries = await fs.readdir(roundDir, { withFileTypes: true });
  const dirs = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const reportPath = path.join(roundDir, entry.name, 'report.json');
    const report = await readJsonIfExists(reportPath);
    if (report) dirs.push({ id: entry.name, dir: path.join(roundDir, entry.name), report });
  }
  return dirs;
}

export async function loadScionRoundEntries(roundDir, { courseIds = [], provider = 'local' } = {}) {
  const resolvedRoundDir = path.resolve(repoRoot, roundDir);
  const reportDirs = await listRoundReportDirs(resolvedRoundDir);
  const byId = new Map(reportDirs.map((entry) => [entry.id, entry]));
  const targets =
    courseIds.length > 0
      ? courseIds.map((courseId) => ({ baseId: courseId, id: providerCourseId(courseId, provider) }))
      : reportDirs.map((entry) => ({ baseId: baseCourseId(entry.id), id: entry.id }));
  const loaded = [];
  const missing = [];
  for (const target of targets) {
    const match = byId.get(target.id) || byId.get(target.baseId);
    if (!match) {
      missing.push(target);
      continue;
    }
    const digest = await readJsonIfExists(path.join(match.dir, 'digest.json'));
    const course = await readJsonIfExists(path.join(match.dir, 'course.json'));
    loaded.push(summarizeScionCourse({ baseId: target.baseId, id: match.id, report: match.report, digest, course }));
  }
  return { roundDir: resolvedRoundDir, entries: loaded, missing };
}

export function summarizeScionCourse({ baseId, id, report, digest, course }) {
  const normalized = report?.normalized || {};
  const scores = normalized.scores || {};
  return {
    courseId: id || report?.courseId || course?.id || baseId,
    baseId: baseId || course?.baseId || baseCourseId(id || report?.courseId || course?.id),
    title: course?.title || '',
    status: report?.run?.status || normalized.status || 'unknown',
    modelId: course?.modelId || digest?.run?.models?.[0] || '',
    provider: course?.provider || digest?.run?.provider || '',
    durationMs: Number(report?.run?.durationMs) || Number(digest?.elapsedMs) || 0,
    costUsd: Number(digest?.cost?.totalUsd) || 0,
    costDisplay: digest?.cost?.totalDisplay || '$0.00',
    overall: Number(normalized.overall),
    overallGrade: normalized.overallGrade || '',
    p0: Number(normalized.p0Count) || 0,
    p1: Number(normalized.p1Count) || 0,
    texture: Number(scores.texture),
    scores,
    findingCount: Array.isArray(normalized.findings) ? normalized.findings.length : 0,
  };
}

function numericAverage(values) {
  const finite = values.map(Number).filter(Number.isFinite);
  if (finite.length === 0) return null;
  return Math.round((finite.reduce((sum, value) => sum + value, 0) / finite.length) * 100) / 100;
}

function check(name, passed, detail) {
  return { name, passed: Boolean(passed), detail };
}

export function evaluateScionGauntlet({ entries = [], missing = [], thresholds = DEFAULT_SCION_THRESHOLDS } = {}) {
  const allEntries = Array.isArray(entries) ? entries : [];
  const checks = [
    check('all requested courses produced reports', missing.length === 0, `${missing.length} missing`),
    check(
      'every course passed generation',
      allEntries.every((entry) => entry.status === 'passed'),
      allEntries.map((entry) => `${entry.courseId}:${entry.status}`).join(', ') || 'no entries',
    ),
    check(
      `every course has P0 <= ${thresholds.maxP0}`,
      allEntries.every((entry) => entry.p0 <= thresholds.maxP0),
      allEntries.map((entry) => `${entry.courseId}:${entry.p0}`).join(', ') || 'no entries',
    ),
    check(
      `every course has P1 <= ${thresholds.maxP1}`,
      allEntries.every((entry) => entry.p1 <= thresholds.maxP1),
      allEntries.map((entry) => `${entry.courseId}:${entry.p1}`).join(', ') || 'no entries',
    ),
    check(
      `every course overall >= ${thresholds.minOverall}`,
      allEntries.every((entry) => Number.isFinite(entry.overall) && entry.overall >= thresholds.minOverall),
      allEntries.map((entry) => `${entry.courseId}:${entry.overall}`).join(', ') || 'no entries',
    ),
    check(
      `every course texture >= ${thresholds.minTexture}`,
      allEntries.every((entry) => Number.isFinite(entry.texture) && entry.texture >= thresholds.minTexture),
      allEntries.map((entry) => `${entry.courseId}:${entry.texture}`).join(', ') || 'no entries',
    ),
    check(
      `every course cost <= $${thresholds.maxCostUsd.toFixed(2)}`,
      allEntries.every((entry) => entry.costUsd <= thresholds.maxCostUsd),
      allEntries.map((entry) => `${entry.courseId}:$${entry.costUsd.toFixed(4)}`).join(', ') || 'no entries',
    ),
  ];
  return {
    passed: allEntries.length > 0 && checks.every((entry) => entry.passed),
    checks,
    metrics: {
      courses: allEntries.length,
      avgOverall: numericAverage(allEntries.map((entry) => entry.overall)),
      avgTexture: numericAverage(allEntries.map((entry) => entry.texture)),
      totalP0: allEntries.reduce((sum, entry) => sum + entry.p0, 0),
      totalP1: allEntries.reduce((sum, entry) => sum + entry.p1, 0),
      totalCostUsd: Math.round(allEntries.reduce((sum, entry) => sum + entry.costUsd, 0) * 10000) / 10000,
      totalDurationMs: allEntries.reduce((sum, entry) => sum + entry.durationMs, 0),
    },
  };
}

function formatSeconds(ms) {
  return `${Math.round((Number(ms) || 0) / 1000)}s`;
}

export function renderScionGauntletMarkdown(summary) {
  const lines = [
    `# Scion-1.2 Gauntlet — ${summary.label}`,
    '',
    `- Model: ${summary.modelId || SCION_MODEL_ID}`,
    `- Round: ${summary.roundDir}`,
    `- Status: ${summary.evaluation.passed ? 'PASS' : 'FAIL'}`,
    `- Courses: ${summary.evaluation.metrics.courses}`,
    `- Average overall: ${summary.evaluation.metrics.avgOverall ?? 'n/a'}`,
    `- Average texture: ${summary.evaluation.metrics.avgTexture ?? 'n/a'}`,
    `- Total P0/P1: ${summary.evaluation.metrics.totalP0}/${summary.evaluation.metrics.totalP1}`,
    `- Total cost: $${summary.evaluation.metrics.totalCostUsd.toFixed(4)}`,
    `- Total generation time: ${formatSeconds(summary.evaluation.metrics.totalDurationMs)}`,
    '',
    '## Course Results',
    '',
    '| Course | Status | Overall | Texture | P0 | P1 | Cost | Time | Model |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const entry of summary.entries) {
    lines.push(
      `| ${entry.courseId} | ${entry.status} | ${Number.isFinite(entry.overall) ? entry.overall : 'n/a'}${entry.overallGrade ? `/${entry.overallGrade}` : ''} | ${Number.isFinite(entry.texture) ? entry.texture : 'n/a'} | ${entry.p0} | ${entry.p1} | ${entry.costDisplay || `$${entry.costUsd.toFixed(4)}`} | ${formatSeconds(entry.durationMs)} | ${entry.modelId || 'n/a'} |`,
    );
  }
  if (summary.missing.length > 0) {
    lines.push('', '## Missing Courses', '');
    for (const entry of summary.missing) lines.push(`- ${entry.id}`);
  }
  lines.push('', '## Acceptance Checks', '');
  for (const item of summary.evaluation.checks) {
    lines.push(`- ${item.passed ? 'PASS' : 'FAIL'} ${item.name} (${item.detail})`);
  }
  return `${lines.join('\n')}\n`;
}

export async function writeScionGauntletReport(summary, { outputRoot = SCION_GAUNTLET_ROOT } = {}) {
  const reportDir = path.join(outputRoot, summary.label);
  await fs.mkdir(reportDir, { recursive: true });
  const jsonPath = path.join(reportDir, 'report.json');
  const mdPath = path.join(reportDir, 'report.md');
  const markdown = renderScionGauntletMarkdown(summary);
  await fs.writeFile(jsonPath, `${JSON.stringify(summary, null, 2)}\n`);
  await fs.writeFile(mdPath, markdown);
  await fs.mkdir(outputRoot, { recursive: true });
  await fs.writeFile(path.join(outputRoot, 'latest.json'), `${JSON.stringify(summary, null, 2)}\n`);
  await fs.writeFile(path.join(outputRoot, 'latest.md'), markdown);
  return { reportDir, jsonPath, mdPath };
}

export async function latestCrucibleRound(crucibleRoot = path.join(repoRoot, 'verification-output', 'crucible')) {
  const entries = await fs.readdir(crucibleRoot, { withFileTypes: true }).catch(() => []);
  const rounds = entries
    .filter((entry) => entry.isDirectory() && /^round-/.test(entry.name))
    .map((entry) => path.join(crucibleRoot, entry.name))
    .sort()
    .reverse();
  return rounds[0] || null;
}

export function buildCrucibleArgs({ courses, provider = 'local', model = SCION_MODEL_ID, concurrency = 1 } = {}) {
  const resolvedCourses = resolveScionCourseIds(courses || 'scion12').join(',');
  return [
    'scripts/crucible.mjs',
    '--courses',
    resolvedCourses,
    '--provider',
    provider,
    '--model',
    model,
    '--concurrency',
    String(concurrency),
  ];
}

async function appendLog(logPath, chunk) {
  if (!logPath) return;
  await fs.appendFile(logPath, chunk).catch(() => {});
}

export function extractLocalModelIds(modelsResponse) {
  const data = Array.isArray(modelsResponse?.data) ? modelsResponse.data : [];
  return data.map((entry) => entry?.id).filter(Boolean);
}

async function fetchLocalScionModels(endpoint) {
  const response = await fetch(`${endpoint}/v1/models`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  return { payload, modelIds: extractLocalModelIds(payload) };
}

async function waitForLocalScionServer(endpoint, { timeoutMs = 120000, expectedModel = '' } = {}) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const result = await fetchLocalScionModels(endpoint);
      if (expectedModel && !result.modelIds.includes(expectedModel)) {
        const advertised = result.modelIds.length > 0 ? result.modelIds.join(', ') : 'no model ids';
        const error = new Error(
          `${endpoint}/v1/models advertises ${advertised}, but Scion-1.2 gauntlet requires ${expectedModel}. ` +
            'Stop the stale local model server on port 8799 and rerun.',
        );
        error.code = 'SCION_MODEL_MISMATCH';
        throw error;
      }
      return result;
    } catch (error) {
      if (error?.code === 'SCION_MODEL_MISMATCH') throw error;
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for ${endpoint}/v1/models: ${lastError?.message || 'no response'}`);
}

export async function startLocalScionServer({
  endpoint = 'http://127.0.0.1:8799',
  port = 8799,
  adapter = '',
  model = SCION_MODEL_ID,
  logPath = path.join(SCION_GAUNTLET_ROOT, 'local-model.log'),
} = {}) {
  if (!adapter) {
    try {
      const existing = await waitForLocalScionServer(endpoint, { timeoutMs: 1500, expectedModel: model });
      return { started: false, endpoint, logPath, models: existing.modelIds, stop: async () => {} };
    } catch (error) {
      if (error?.code === 'SCION_MODEL_MISMATCH') throw error;
      /* start a managed server below */
    }
  } else {
    try {
      const existing = await fetchLocalScionModels(endpoint);
      if (existing.modelIds.length > 0) {
        const error = new Error(
          `${endpoint} is already serving ${existing.modelIds.join(', ')}. Stop the existing local server before running an adapter gauntlet, or choose a free port.`,
        );
        error.code = 'SCION_ADAPTER_SERVER_CONFLICT';
        throw error;
      }
    } catch (error) {
      if (error?.code === 'SCION_ADAPTER_SERVER_CONFLICT') throw error;
      /* no server responded; start a managed adapter server below */
    }
  }
  await fs.mkdir(path.dirname(logPath), { recursive: true });
  await fs.writeFile(logPath, `# ${SCION_MODEL_NAME} local server\nstarted=${new Date().toISOString()}\n`);
  const child = spawn(process.execPath, ['scripts/crucible/e2bOpenAIShim.mjs', String(port)], {
    cwd: repoRoot,
    env: {
      ...process.env,
      LOCAL_MODEL_ID: model,
      LOCAL_MODEL_NAME: SCION_MODEL_NAME,
      ...(adapter ? { G4_ADAPTERS: adapter } : {}),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => {
    appendLog(logPath, chunk);
  });
  child.stderr.on('data', (chunk) => {
    appendLog(logPath, chunk);
  });
  const ready = await waitForLocalScionServer(endpoint, { expectedModel: model });
  return {
    started: true,
    endpoint,
    logPath,
    models: ready.modelIds,
    stop: async () => {
      if (child.exitCode !== null) return;
      child.kill('SIGTERM');
      await new Promise((resolve) => {
        const timer = setTimeout(() => {
          if (child.exitCode === null) child.kill('SIGKILL');
          resolve();
        }, 5000);
        child.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    },
  };
}

export async function runCrucibleForScion(options = {}) {
  const args = buildCrucibleArgs(options);
  const env = {
    ...process.env,
    LOCAL_MODEL_ID: options.model || SCION_MODEL_ID,
    LOCAL_MODEL_NAME: SCION_MODEL_NAME,
    ...(options.adapter ? { G4_ADAPTERS: options.adapter } : {}),
  };
  const startedAt = Date.now();
  let server = null;
  try {
    if ((options.provider || 'local') === 'local' && !options.externalServer) {
      server = await startLocalScionServer({
        adapter: options.adapter || '',
        model: options.model || SCION_MODEL_ID,
        logPath: options.serverLogPath,
      });
    }
    const exitCode = await new Promise((resolve) => {
      const child = spawn(process.execPath, args, {
        cwd: repoRoot,
        env,
        stdio: 'inherit',
      });
      child.on('exit', (code) => resolve(Number(code) || 0));
    });
    return {
      args: [process.execPath, ...args],
      exitCode,
      durationMs: Date.now() - startedAt,
      localServer: server
        ? { started: server.started, endpoint: server.endpoint, logPath: server.logPath, models: server.models || [] }
        : null,
    };
  } finally {
    await server?.stop?.();
  }
}

export async function buildScionGauntletSummary({
  roundDir,
  courses = 'scion12',
  provider = 'local',
  modelId = SCION_MODEL_ID,
  thresholds = DEFAULT_SCION_THRESHOLDS,
  label = `gauntlet-${timestampId()}`,
} = {}) {
  const courseIds = resolveScionCourseIds(courses);
  const loaded = await loadScionRoundEntries(roundDir, { courseIds, provider });
  const evaluation = evaluateScionGauntlet({ ...loaded, thresholds });
  return {
    label,
    modelId,
    provider,
    courses: courseIds,
    roundDir: loaded.roundDir,
    entries: loaded.entries,
    missing: loaded.missing,
    thresholds,
    evaluation,
  };
}
