#!/usr/bin/env node
// The Crucible — CourseMapper's autonomous generate → grade → refine loop (driver half).
//
// Usage:
//   node scripts/crucible.mjs [--courses mandarin,cs-python,geology,world-lit|all|smoke]
//                             [--rounds 1] [--model gpt-5.4-mini] [--baseline <runDir>]
//                             [--dry-run] [--headed] [--skip-generate <dir>]
//                             [--import-baseline] [--api-env <path>]
//
// Modes:
//   (default)          run live rounds: server once per round → generate each course in a
//                      real browser → unzip → grade (tests/lib/deepQualityGrader.js, lazy)
//                      → per-course report.json/report.md → ROUND_REPORT.md. Exit 1 on any P0.
//   --dry-run          start server, open landing, verify every selector the flow needs,
//                      screenshot — NO generation, no API spend.
//   --skip-generate D  re-grade existing artifacts in run dir D (grader improvements can
//                      re-score old rounds without regenerating).
//   --import-baseline  package the manual V0.14 audit output into
//                      verification-output/crucible/baseline-v0140/ in run-dir format.
//
// The grader half (tests/lib/deepQualityGrader.js) is built separately; the driver
// degrades gracefully when it is not available yet.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import JSZip from 'jszip';
import {
  defaultApiEnvPath,
  loadApiKey,
  modelDisplayName,
  redactSecrets,
  repoRoot,
  runCourseInBrowser,
  startAppServer,
} from './lib/crucibleBrowser.mjs';
import { referenceCourses, resolveCourses, getCourseById } from './crucible/courses.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const crucibleRoot = path.join(repoRoot, 'verification-output', 'crucible');
const graderModuleUrl = new URL('../tests/lib/deepQualityGrader.js', import.meta.url);
const GRADER_UNAVAILABLE_MESSAGE = 'grader not yet available — artifacts saved for later grading';

// ── V0.14 manual-audit baseline source (see V0.14 output audit) ──
const V014_ROOT = '/Users/tianxing/Documents/NYU/NYUsliver/edutool-output/OUTPUT-V014';
const V014_LOG = path.join(V014_ROOT, 'edutool.dev-1781140215691.log');
const V014_EXTRACTED = path.join(V014_ROOT, 'extracted');
// Mapped to courses by lessonCount + run order in the log.
const V014_RUN_MAP = [
  { runId: 'run-1781139260539', courseId: 'cs-python' },
  { runId: 'run-1781139477370', courseId: 'geology' },
  { runId: 'run-1781139667572', courseId: 'mandarin' },
  { runId: 'run-1781139939678', courseId: 'world-lit' },
];
const BASELINE_DIR = path.join(crucibleRoot, 'baseline-v0140');

// Borrowed from scripts/liveBrowserQualityLoop.mjs (parseArgs).
function parseArgs(argv) {
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

function timestampId() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function log(message) {
  console.log(`[crucible] ${message}`);
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

// ── ZIP extraction ─────────────────────────────────────────────────────────
async function extractZip(zipPath, destDir) {
  const buffer = await fs.readFile(zipPath);
  const zip = await JSZip.loadAsync(buffer);
  let fileCount = 0;
  for (const entry of Object.values(zip.files)) {
    const safeRelative = entry.name.replace(/\\/g, '/');
    if (safeRelative.split('/').some((part) => part === '..')) continue; // zip-slip guard
    const target = path.join(destDir, safeRelative);
    if (entry.dir) {
      await fs.mkdir(target, { recursive: true });
      continue;
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, await entry.async('nodebuffer'));
    fileCount += 1;
  }
  return fileCount;
}

// ── Grader integration (built concurrently; import lazily, degrade gracefully) ──
let graderLoadAttempted = false;
let graderModule = null;
let graderLoadError = null;

async function loadGrader() {
  if (graderLoadAttempted) return graderModule;
  graderLoadAttempted = true;
  try {
    const mod = await import(graderModuleUrl.href);
    const candidate =
      typeof mod.grade === 'function' ? mod : typeof mod.default?.grade === 'function' ? mod.default : null;
    if (!candidate) throw new Error('deepQualityGrader.js loaded but exports no grade() function');
    graderModule = candidate;
  } catch (error) {
    graderLoadError = error?.message || String(error);
    graderModule = null;
  }
  return graderModule;
}

function normalizeSeverity(finding) {
  const raw = finding?.severity ?? finding?.priority ?? finding?.level ?? '';
  const text = String(raw).toUpperCase();
  const match = text.match(/P[0-4]/);
  if (match) return match[0];
  if (/critical|blocker/i.test(text)) return 'P0';
  if (/major|high/i.test(text)) return 'P1';
  if (/minor|medium/i.test(text)) return 'P2';
  return text || 'P?';
}

// Tolerant normalization: the grader's exact result shape is owned by the
// grader half, so accept the common field spellings and keep the raw result.
function normalizeGradeResult(raw) {
  const findingsSource = raw?.findings ?? raw?.defects ?? raw?.issues ?? [];
  // deepQualityGrader findings: { id, severity, dimension, file, detail, evidence }.
  const findings = (Array.isArray(findingsSource) ? findingsSource : []).map((finding) => ({
    severity: normalizeSeverity(finding),
    dimension: finding?.dimension ?? '',
    title: finding?.title ?? finding?.detail ?? finding?.message ?? finding?.id ?? 'untitled finding',
    detail: finding?.detail ?? finding?.description ?? finding?.message ?? '',
    evidence: finding?.evidence ?? finding?.quote ?? finding?.excerpt ?? finding?.sample ?? '',
    file: finding?.file ?? finding?.path ?? finding?.artifact ?? '',
  }));

  let scores = raw?.scores ?? raw?.dimensions ?? null;
  if (Array.isArray(scores)) {
    scores = Object.fromEntries(
      scores
        .map((entry) => [entry?.dimension ?? entry?.name ?? entry?.id, entry?.score ?? entry?.value])
        .filter(([key, value]) => key && Number.isFinite(Number(value)))
        .map(([key, value]) => [key, Number(value)]),
    );
  }
  if (scores && typeof scores === 'object') {
    scores = Object.fromEntries(
      Object.entries(scores)
        .filter(([, value]) => Number.isFinite(Number(value)))
        .map(([key, value]) => [key, Number(value)]),
    );
  }

  // deepQualityGrader returns overall as { score, grade }; accept plain numbers too.
  const overall = [raw?.overall?.score, raw?.overall, raw?.overallScore, raw?.score, raw?.total]
    .map((value) => Number(value))
    .find((value) => Number.isFinite(value));

  return {
    graded: true,
    overall: Number.isFinite(overall) ? overall : null,
    overallGrade: raw?.overall?.grade ?? null,
    scores: scores && Object.keys(scores).length > 0 ? scores : null,
    findings,
    p0Count: findings.filter((f) => f.severity === 'P0').length,
    p1Count: findings.filter((f) => f.severity === 'P1').length,
    summary: raw?.summary ?? raw?.verdict ?? '',
  };
}

async function gradeCourseDir({ courseDir, course }) {
  const consoleLogText = await fs.readFile(path.join(courseDir, 'console.log'), 'utf8').catch(() => '');
  const digest = await readJsonIfExists(path.join(courseDir, 'digest.json'));
  const extractedDir = path.join(courseDir, 'extracted');
  const hasExtracted = await fs
    .stat(extractedDir)
    .then((stat) => stat.isDirectory())
    .catch(() => false);
  if (!hasExtracted) {
    return { graded: false, status: 'no-artifacts', message: `no extracted/ directory in ${courseDir}` };
  }

  const grader = await loadGrader();
  if (!grader) {
    return { graded: false, status: 'pending-grader', message: GRADER_UNAVAILABLE_MESSAGE, loadError: graderLoadError };
  }

  const rawResult = await grader.grade({ extractedDir, consoleLogText, digest, course });
  const normalized = normalizeGradeResult(rawResult);
  return { ...normalized, status: 'graded', raw: rawResult };
}

// ── Per-course + round reports ─────────────────────────────────────────────
function formatFinding(finding) {
  const lines = [`- **${finding.severity}** ${finding.title}${finding.file ? ` (${finding.file})` : ''}`];
  if (finding.detail && finding.detail !== finding.title) lines.push(`  - ${finding.detail}`);
  if (finding.evidence) lines.push(`  - Evidence: "${String(finding.evidence).slice(0, 400)}"`);
  return lines.join('\n');
}

function formatCourseReportMd({ course, runResult, gradeResult }) {
  const lines = [`# Crucible report — ${course.title} (${course.id})`, ''];
  if (runResult) {
    lines.push(
      `- Generation: ${runResult.status} in ${Math.round((runResult.durationMs || 0) / 1000)}s (phase: ${runResult.phase})`,
    );
    if (runResult.error) lines.push(`- Error: ${runResult.error.split('\n')[0]}`);
  }
  const digest = runResult?.digest || gradeResult?.digest || null;
  if (digest) {
    lines.push(
      `- Digest: app v${digest.appVersion}, ${digest.run?.lessonCount} lessons, ${digest.run?.providerCalls} provider calls, cost ${digest.cost?.totalDisplay || 'n/a'}`,
    );
  }
  lines.push('');
  if (!gradeResult?.graded) {
    lines.push(`## Grading`, '', `Not graded: ${gradeResult?.message || 'unknown reason'}`, '');
    return `${lines.join('\n')}\n`;
  }
  lines.push('## Scores', '');
  if (gradeResult.overall !== null) lines.push(`- Overall: ${gradeResult.overall}`);
  for (const [dimension, score] of Object.entries(gradeResult.scores || {})) {
    lines.push(`- ${dimension}: ${score}`);
  }
  if (gradeResult.summary) lines.push('', `> ${gradeResult.summary}`);
  lines.push('', `## Findings (${gradeResult.findings.length})`, '');
  if (gradeResult.findings.length === 0) lines.push('No findings.');
  for (const finding of gradeResult.findings) lines.push(formatFinding(finding));
  return `${lines.join('\n')}\n`;
}

async function loadBaselineReports(baselineDir) {
  if (!baselineDir) return null;
  const resolved = path.resolve(repoRoot, baselineDir);
  const reports = {};
  for (const course of referenceCourses) {
    const report = await readJsonIfExists(path.join(resolved, course.id, 'report.json'));
    if (report) reports[course.id] = { normalized: report.normalized || null, raw: report.raw || null };
  }
  return { dir: resolved, reports };
}

function formatScoreDelta(current, baseline) {
  if (!Number.isFinite(current) || !Number.isFinite(baseline)) return 'n/a';
  const delta = current - baseline;
  const sign = delta > 0 ? '+' : '';
  return `${current} (${sign}${Math.round(delta * 100) / 100} vs baseline ${baseline})`;
}

function buildRoundReportMd({ roundLabel, modelId, entries, baseline, totals }) {
  const lines = [
    `# Crucible Round Report — ${roundLabel}`,
    '',
    `- Model: ${modelId}`,
    `- Courses: ${entries.length}`,
    `- Total generation time: ${Math.round(totals.durationMs / 1000)}s`,
    `- Total cost (from digests): $${totals.costUsd.toFixed(4)}`,
    baseline ? `- Baseline: ${baseline.dir}` : '- Baseline: none',
    '',
    '## Scores',
    '',
  ];

  const dimensions = [];
  for (const entry of entries) {
    for (const dimension of Object.keys(entry.gradeResult?.scores || {})) {
      if (!dimensions.includes(dimension)) dimensions.push(dimension);
    }
  }
  const header = ['Course', 'Status', 'Overall', ...dimensions, 'P0', 'P1'];
  lines.push(`| ${header.join(' | ')} |`);
  lines.push(`| ${header.map(() => '---').join(' | ')} |`);
  for (const entry of entries) {
    const grade = entry.gradeResult;
    const baselineGrade = baseline?.reports?.[entry.course.id]?.normalized || null;
    const cells = [
      entry.course.id,
      entry.runResult ? entry.runResult.status : grade?.status || 'regrade',
      grade?.graded
        ? baselineGrade
          ? formatScoreDelta(grade.overall, baselineGrade.overall)
          : String(grade.overall ?? 'n/a')
        : grade?.status || 'not graded',
      ...dimensions.map((dimension) => {
        const score = grade?.scores?.[dimension];
        if (!Number.isFinite(score)) return '—';
        const baselineScore = baselineGrade?.scores?.[dimension];
        return Number.isFinite(baselineScore) ? formatScoreDelta(score, baselineScore) : String(score);
      }),
      grade?.graded ? String(grade.p0Count) : '—',
      grade?.graded ? String(grade.p1Count) : '—',
    ];
    lines.push(`| ${cells.join(' | ')} |`);
  }

  const p0Findings = [];
  const p1Findings = [];
  for (const entry of entries) {
    for (const finding of entry.gradeResult?.findings || []) {
      if (finding.severity === 'P0') p0Findings.push({ courseId: entry.course.id, finding });
      else if (finding.severity === 'P1') p1Findings.push({ courseId: entry.course.id, finding });
    }
  }
  // Identical findings repeat per occurrence; collapse them here so the round
  // report stays readable. Full per-occurrence lists live in each course's
  // report.json / report.md.
  const collapseFindings = (items) => {
    const map = new Map();
    for (const { courseId, finding } of items) {
      const key = `${courseId}|${finding.title}|${finding.file}`;
      if (!map.has(key)) map.set(key, { courseId, finding, count: 0 });
      map.get(key).count += 1;
    }
    return [...map.values()];
  };
  const emitFindingSection = (label, items) => {
    const collapsed = collapseFindings(items);
    lines.push('', `## ${label} findings (${items.length} occurrence(s), ${collapsed.length} distinct)`, '');
    if (collapsed.length === 0) lines.push('None.');
    for (const { courseId, finding, count } of collapsed) {
      lines.push(
        formatFinding({ ...finding, title: `[${courseId}] ${finding.title}${count > 1 ? ` (×${count})` : ''}` }),
      );
    }
  };
  emitFindingSection('P0', p0Findings);
  emitFindingSection('P1', p1Findings);

  const ungraded = entries.filter((entry) => !entry.gradeResult?.graded);
  if (ungraded.length > 0) {
    lines.push('', '## Grading status', '');
    for (const entry of ungraded) {
      lines.push(`- ${entry.course.id}: ${entry.gradeResult?.message || 'not graded'}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function printRoundTable(entries) {
  const rows = [['course', 'status', 'overall', 'P0', 'P1', 'cost', 'time']];
  for (const entry of entries) {
    const grade = entry.gradeResult;
    const digest = entry.runResult?.digest || entry.digest || null;
    rows.push([
      entry.course.id,
      entry.runResult ? entry.runResult.status : grade?.status || 'regrade',
      grade?.graded
        ? `${grade.overall ?? 'n/a'}${grade.overallGrade ? ` (${grade.overallGrade})` : ''}`
        : grade?.status || '—',
      grade?.graded ? String(grade.p0Count) : '—',
      grade?.graded ? String(grade.p1Count) : '—',
      digest?.cost?.totalDisplay || '—',
      entry.runResult ? `${Math.round((entry.runResult.durationMs || 0) / 1000)}s` : '—',
    ]);
  }
  const widths = rows[0].map((_, col) => Math.max(...rows.map((row) => row[col].length)));
  for (const [index, row] of rows.entries()) {
    console.log(`  ${row.map((cell, col) => cell.padEnd(widths[col])).join('  ')}`);
    if (index === 0) console.log(`  ${widths.map((w) => '-'.repeat(w)).join('  ')}`);
  }
}

// ── Mode: --import-baseline ────────────────────────────────────────────────
function sliceLogIntoRunSegments(logText) {
  const lines = logText.split(/\r?\n/);
  const boundaries = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (/\[CM\]\[API\] reset \{"label":"New course package generation"/.test(lines[index])) {
      boundaries.push(index);
    }
  }
  const segments = [];
  for (let index = 0; index < boundaries.length; index += 1) {
    const start = boundaries[index];
    const end = index + 1 < boundaries.length ? boundaries[index + 1] : lines.length;
    segments.push(lines.slice(start, end).join('\n'));
  }
  return segments;
}

function parseDigestsFromText(text) {
  const digests = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/\[CM\]\[DIGEST\]\s*(\{.*\})\s*$/);
    if (!match) continue;
    try {
      digests.push(JSON.parse(match[1]));
    } catch {
      // Skip malformed digest lines (truncated console capture).
    }
  }
  return digests;
}

async function importBaseline() {
  log(`importing V0.14 manual-audit baseline from ${V014_ROOT}`);
  const logText = await fs.readFile(V014_LOG, 'utf8');
  const segments = sliceLogIntoRunSegments(logText);
  if (segments.length !== V014_RUN_MAP.length) {
    throw new Error(`Expected ${V014_RUN_MAP.length} run segments in the audit log, found ${segments.length}`);
  }

  await fs.mkdir(BASELINE_DIR, { recursive: true });
  const imported = [];
  for (const [index, { runId, courseId }] of V014_RUN_MAP.entries()) {
    const course = getCourseById(courseId);
    const segment = segments[index];
    if (!segment.includes(runId)) {
      throw new Error(`Log segment ${index + 1} does not mention expected ${runId} (${courseId}) — order mismatch?`);
    }
    const digests = parseDigestsFromText(segment).filter((digest) => digest.runId === runId);
    if (digests.length === 0) throw new Error(`No [CM][DIGEST] lines for ${runId} (${courseId}) in its log segment`);
    const digest = digests[digests.length - 1]; // last finish digest is the final state
    if (digest.run?.lessonCount !== course.lessonCount) {
      throw new Error(
        `Digest lessonCount ${digest.run?.lessonCount} for ${runId} does not match ${courseId} (${course.lessonCount})`,
      );
    }

    const sourceExtracted = path.join(V014_EXTRACTED, course.title);
    const courseDir = path.join(BASELINE_DIR, courseId);
    await fs.rm(courseDir, { recursive: true, force: true });
    await fs.mkdir(courseDir, { recursive: true });
    await fs.cp(sourceExtracted, path.join(courseDir, 'extracted'), { recursive: true });
    await fs.writeFile(path.join(courseDir, 'console.log'), `${segment}\n`);
    await writeJson(path.join(courseDir, 'digest.json'), digest);
    await writeJson(path.join(courseDir, 'course.json'), {
      ...course,
      source: 'imported-v0.14.0-manual-audit',
      runId,
      importedFrom: { extracted: sourceExtracted, log: V014_LOG },
      importedAt: new Date().toISOString(),
    });
    const extractedEntries = await fs.readdir(path.join(courseDir, 'extracted'));
    imported.push({ courseId, runId, lessonCount: course.lessonCount, extractedEntries: extractedEntries.length });
    log(
      `  ${courseId}: ${runId} → ${path.relative(repoRoot, courseDir)} (${extractedEntries.length} top-level entries)`,
    );
  }

  await writeJson(path.join(BASELINE_DIR, 'round.json'), {
    mode: 'import-baseline',
    label: 'baseline-v0140',
    appVersion: '0.14.0',
    source: { root: V014_ROOT, log: V014_LOG },
    importedAt: new Date().toISOString(),
    courses: imported,
  });
  log(`baseline ready at ${path.relative(repoRoot, BASELINE_DIR)}`);
  log(`grade it with: node scripts/crucible.mjs --skip-generate ${path.relative(repoRoot, BASELINE_DIR)}`);
}

// ── Mode: --dry-run ────────────────────────────────────────────────────────
// Every data-testid/selector the live flow depends on. 'export-scope-' is the
// template prefix for export-scope-all (src/components/ExportSidePanel.jsx:1077).
const FLOW_BUNDLE_SELECTORS = [
  'feature-select-continue', // src/screens/FeatureSelect.jsx:814
  'config-generate-button', // src/screens/Config.jsx:2137
  'workspace-shell', // src/AppFlow.jsx:4126
  'workspace-agent-panel', // src/AppFlow.jsx:4132
  'export-side-panel', // src/components/ExportSidePanel.jsx:1004
  'export-scope-', // src/components/ExportSidePanel.jsx:1077 (export-scope-all)
  'readiness-panel', // src/components/ExportSidePanel.jsx:343
  'readiness-status', // src/components/ExportSidePanel.jsx:352
  'readiness-finish-package', // src/components/ExportSidePanel.jsx:471
  'export-download-zip', // src/components/ExportSidePanel.jsx:1192
  'coursemapper-apikey', // localStorage seed key (src/contexts/AIConfigContext.jsx)
  'coursemapper-modelid',
  'Describe your course', // src/screens/Landing.jsx:567
  'Generate workspace', // src/screens/Config.jsx:2147
  'Download ZIP',
  '[CM][DIGEST]', // digest line the driver parses
];

async function readBuiltBundleText() {
  const assetsDir = path.join(repoRoot, 'dist', 'assets');
  const entries = await fs.readdir(assetsDir).catch(() => []);
  let combined = '';
  for (const entry of entries) {
    if (entry.endsWith('.js')) combined += await fs.readFile(path.join(assetsDir, entry), 'utf8');
  }
  return combined;
}

async function dryRun(options) {
  const outDir = path.join(crucibleRoot, `dry-run-${timestampId()}`);
  await fs.mkdir(outDir, { recursive: true });
  log('dry run: building/reusing dist and starting preview server (no generation, no API spend)');
  const server = await startAppServer({
    build: options.build === 'true' ? true : 'auto',
    logPath: path.join(outDir, 'server.log'),
  });
  log(`server up at ${server.baseUrl} (dist ${server.didBuild ? 'rebuilt' : 'reused'})`);

  const checks = [];
  const addCheck = (name, ok, detail = '') => {
    checks.push({ name, ok, detail });
    log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  };

  let browser = null;
  try {
    browser = await chromium.launch({ headless: !options.headed });
    const page = await browser.newPage();
    await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });

    // Live landing checks (no API key seeded → "Connected" is not expected).
    // Wait for React to mount before asserting — domcontentloaded fires earlier.
    const describeBox = page.getByLabel('Describe your course');
    const describeVisible = await describeBox
      .first()
      .waitFor({ timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    addCheck('landing: "Describe your course" input', describeVisible);
    const continueButton = page.getByRole('button', { name: /^Continue$/ }).last();
    const continueVisible = await continueButton
      .waitFor({ timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    addCheck('landing: Continue button', continueVisible);
    if (describeVisible)
      await describeBox
        .first()
        .fill('Dry-run wiring check — no generation.')
        .catch(() => {});
    await page.screenshot({ path: path.join(outDir, 'landing.png'), fullPage: true });
    log(`  screenshot saved: ${path.relative(repoRoot, path.join(outDir, 'landing.png'))}`);

    // Downstream screens only exist after a paid generation, so verify their
    // selector strings against the BUILT bundle the server is actually serving.
    const bundleText = await readBuiltBundleText();
    addCheck(
      'built bundle: dist/assets/*.js readable',
      bundleText.length > 0,
      `${Math.round(bundleText.length / 1024)} KB`,
    );
    for (const selector of FLOW_BUNDLE_SELECTORS) {
      addCheck(`bundle selector: ${selector}`, bundleText.includes(selector));
    }
  } finally {
    await browser?.close().catch(() => {});
    await server.stop().catch(() => {});
  }

  const failed = checks.filter((check) => !check.ok);
  await writeJson(path.join(outDir, 'dry-run-report.json'), {
    mode: 'dry-run',
    at: new Date().toISOString(),
    baseUrl: server.baseUrl,
    didBuild: server.didBuild,
    checks,
    failedCount: failed.length,
  });
  log(
    `dry run ${failed.length === 0 ? 'GREEN' : `FAILED (${failed.length} check(s))`} — report: ${path.relative(repoRoot, outDir)}`,
  );
  if (failed.length > 0) process.exitCode = 1;
}

// ── Shared: grade a set of course dirs and write reports ───────────────────
async function gradeAndReport({ courseDir, course, runResult, baselineRaw = null }) {
  let gradeResult;
  try {
    gradeResult = await gradeCourseDir({ courseDir, course });
  } catch (error) {
    gradeResult = {
      graded: false,
      status: 'grader-error',
      message: redactSecrets(error.stack || error.message || String(error)),
    };
  }
  await writeJson(path.join(courseDir, 'report.json'), {
    courseId: course.id,
    gradedAt: new Date().toISOString(),
    run: runResult
      ? {
          status: runResult.status,
          durationMs: runResult.durationMs,
          phase: runResult.phase,
          error: runResult.error || null,
        }
      : null,
    normalized: gradeResult,
    raw: gradeResult.raw ?? null,
  });

  // Prefer the grader's own evidence-quoting markdown report when available.
  let reportMd = null;
  if (gradeResult.raw && typeof graderModule?.renderReportMarkdown === 'function') {
    try {
      reportMd = graderModule.renderReportMarkdown(gradeResult.raw, {
        courseTitle: course.title,
        baselineResult: baselineRaw,
      });
    } catch {
      reportMd = null;
    }
  }
  if (!reportMd) reportMd = formatCourseReportMd({ course, runResult, gradeResult });
  await fs.writeFile(path.join(courseDir, 'report.md'), reportMd);
  return gradeResult;
}

function computeTotals(entries) {
  let costUsd = 0;
  let durationMs = 0;
  for (const entry of entries) {
    const digest = entry.runResult?.digest || entry.digest || null;
    if (Number.isFinite(digest?.cost?.totalUsd)) costUsd += digest.cost.totalUsd;
    if (Number.isFinite(entry.runResult?.durationMs)) durationMs += entry.runResult.durationMs;
  }
  return { costUsd, durationMs };
}

async function finishRound({ roundDir, roundLabel, modelId, entries, baseline }) {
  const totals = computeTotals(entries);
  const reportMd = buildRoundReportMd({ roundLabel, modelId, entries, baseline, totals });
  await fs.writeFile(path.join(roundDir, 'ROUND_REPORT.md'), reportMd);
  await writeJson(path.join(roundDir, 'round.json'), {
    label: roundLabel,
    modelId,
    finishedAt: new Date().toISOString(),
    baseline: baseline?.dir || null,
    totals,
    courses: entries.map((entry) => ({
      id: entry.course.id,
      runStatus: entry.runResult?.status || null,
      gradeStatus: entry.gradeResult?.status || null,
      overall: entry.gradeResult?.overall ?? null,
      p0Count: entry.gradeResult?.p0Count ?? null,
      p1Count: entry.gradeResult?.p1Count ?? null,
    })),
  });

  console.log('');
  log(`round ${roundLabel} summary:`);
  printRoundTable(entries);
  console.log('');
  log(`round report: ${path.relative(repoRoot, path.join(roundDir, 'ROUND_REPORT.md'))}`);

  const anyP0 = entries.some((entry) => (entry.gradeResult?.p0Count || 0) > 0);
  const anyRunFailure = entries.some((entry) => entry.runResult && entry.runResult.status !== 'passed');
  if (anyP0 || anyRunFailure) process.exitCode = 1;
}

// ── Mode: --skip-generate <dir> ────────────────────────────────────────────
async function regradeExisting(options) {
  const sourceDir = path.resolve(repoRoot, String(options.skipGenerate));
  log(`re-grading existing artifacts in ${sourceDir} (no generation)`);
  const baseline = options.baseline ? await loadBaselineReports(options.baseline) : null;
  const entries = [];
  const dirEntries = await fs.readdir(sourceDir, { withFileTypes: true });
  for (const dirEntry of dirEntries) {
    if (!dirEntry.isDirectory()) continue;
    const courseDir = path.join(sourceDir, dirEntry.name);
    const courseJson = await readJsonIfExists(path.join(courseDir, 'course.json'));
    const course = courseJson || getCourseById(dirEntry.name);
    if (!course) continue; // not a course dir
    const hasExtracted = await fs
      .stat(path.join(courseDir, 'extracted'))
      .then((stat) => stat.isDirectory())
      .catch(() => false);
    if (!hasExtracted) continue;
    log(`  grading ${course.id}...`);
    const digest = await readJsonIfExists(path.join(courseDir, 'digest.json'));
    const gradeResult = await gradeAndReport({
      courseDir,
      course,
      runResult: null,
      baselineRaw: baseline?.reports?.[course.id]?.raw || null,
    });
    entries.push({ course, runResult: null, gradeResult, digest });
  }
  if (entries.length === 0) {
    throw new Error(`No gradeable course dirs (with extracted/) found under ${sourceDir}`);
  }
  await finishRound({
    roundDir: sourceDir,
    roundLabel: `regrade ${path.basename(sourceDir)}`,
    modelId: entries[0]?.digest?.run?.models?.[0] || 'unknown',
    entries,
    baseline,
  });
}

// ── Mode: live rounds (default) ────────────────────────────────────────────
async function runLiveRounds(options) {
  const courses = resolveCourses(options.courses);
  const rounds = Math.max(1, Number(options.rounds) || 1);
  const modelId = options.model || 'gpt-5.4-mini';
  const modelName = options.modelName || modelDisplayName(modelId);
  const headed = Boolean(options.headed);
  const apiEnvPath = options.apiEnv ? path.resolve(repoRoot, options.apiEnv) : defaultApiEnvPath;
  const apiKey = await loadApiKey(apiEnvPath);
  const baseline = options.baseline ? await loadBaselineReports(options.baseline) : null;
  if (options.baseline && Object.keys(baseline.reports).length === 0) {
    log(`warning: baseline ${baseline.dir} has no report.json files — grade it first with --skip-generate`);
  }

  for (let roundIndex = 1; roundIndex <= rounds; roundIndex += 1) {
    const roundLabel = `round-${timestampId()}`;
    const roundDir = path.join(crucibleRoot, roundLabel);
    await fs.mkdir(roundDir, { recursive: true });
    log(`${roundLabel} (${roundIndex}/${rounds}): model ${modelId}, courses: ${courses.map((c) => c.id).join(', ')}`);

    // Start the preview server once per round, reused across courses.
    const server = await startAppServer({ logPath: path.join(roundDir, 'server.log') });
    log(`server up at ${server.baseUrl} (dist ${server.didBuild ? 'rebuilt' : 'reused'})`);
    const entries = [];
    try {
      for (const course of courses) {
        const courseDir = path.join(roundDir, course.id);
        await fs.mkdir(courseDir, { recursive: true });
        await writeJson(path.join(courseDir, 'course.json'), { ...course, modelId, roundLabel });

        log(`  generating ${course.id} (${course.lessonCount} lessons)...`);
        const runResult = await runCourseInBrowser({
          baseUrl: server.baseUrl,
          course,
          apiKey,
          modelId,
          modelName,
          outDir: courseDir,
          headed,
        });
        log(
          `  ${course.id}: ${runResult.status} in ${Math.round(runResult.durationMs / 1000)}s` +
            (runResult.status !== 'passed' ? ` (failed during ${runResult.phase})` : ''),
        );

        if (runResult.status === 'passed' && runResult.zipPath) {
          const fileCount = await extractZip(runResult.zipPath, path.join(courseDir, 'extracted'));
          log(`  ${course.id}: extracted ${fileCount} files`);
        }
        if (runResult.digest && runResult.digest.run?.lessonCount !== course.lessonCount) {
          log(
            `  warning: ${course.id} digest lessonCount ${runResult.digest.run?.lessonCount} != expected ${course.lessonCount}`,
          );
        }

        const gradeResult = await gradeAndReport({
          courseDir,
          course,
          runResult,
          baselineRaw: baseline?.reports?.[course.id]?.raw || null,
        });
        if (gradeResult.status === 'pending-grader') log(`  ${course.id}: ${GRADER_UNAVAILABLE_MESSAGE}`);
        entries.push({ course, runResult, gradeResult });
      }
    } finally {
      await server.stop().catch(() => {});
    }

    await finishRound({ roundDir, roundLabel, modelId, entries, baseline });
  }
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const options = parseArgs(process.argv.slice(2));
  await fs.mkdir(crucibleRoot, { recursive: true });

  if (options.importBaseline) return importBaseline();
  if (options.dryRun) return dryRun(options);
  if (options.skipGenerate && options.skipGenerate !== true) return regradeExisting(options);
  if (options.skipGenerate === true) throw new Error('--skip-generate requires a run directory argument');
  return runLiveRounds(options);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[crucible] FATAL: ${redactSecrets(error.stack || error.message || String(error))}`);
    process.exitCode = 1;
  });
}

export { normalizeGradeResult, sliceLogIntoRunSegments, parseDigestsFromText, scriptDir };
