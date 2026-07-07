#!/usr/bin/env node
// The Crucible — CourseMapper's autonomous generate → grade → refine loop (driver half).
//
// Usage:
//   node scripts/crucible.mjs [--courses all|extended|smoke|<id,id,…>]
//                             [--rounds 1] [--model gpt-5.4-mini] [--baseline <runDir>]
//                             [--concurrency 2] [--max-spend 2.50] [--stranger]
//                             [--authoring prose|native|both]
//                             [--provider openai|anthropic|google]
//                             [--llm e2b] [--shim-url http://127.0.0.1:8799]
//                             [--judge] [--dry-run] [--headed] [--skip-generate <dir>]
//                             [--calibrate] [--history] [--diff <roundDirA> <roundDirB>]
//                             [--import-baseline] [--api-env <path>]
//
//   --provider: (V0.14.5 WS-E E1) run the round against another provider. The
//               driver seeds the app's provider switch (coursemapper-provider
//               + the provider-scoped key slot) and picks that provider's
//               cheapest generation-capable default model
//               (PROVIDER_DEFAULT_MODELS; --model still overrides). API keys
//               resolve per provider from env / API-dontComit/api.ev by key
//               shape (sk-… / sk-ant-… / AIza…); a missing key exits with a
//               clear message before any server, browser, or spend. Non-openai
//               course run dirs gain a provider suffix (cs-python--anthropic)
//               so provider rounds never collide with openai history, and the
//               drift ledger (--calibrate) keys verdicts by
//               (checkId, course, provider) — provider deltas are FINDINGS
//               (drift documentation), never conflated with regression. Only
//               P0s gate, same as openai rounds.
//
//   --llm e2b:  run the round's GENERATION on the local Gemma 4 E2B model —
//               every api.openai.com call from the app is rerouted (playwright
//               context.route) to scripts/crucible/e2bOpenAIShim.mjs, which
//               must already be running (node scripts/crucible/e2bOpenAIShim.mjs).
//               No paid key is needed for generation (a dummy key is seeded;
//               the Connected probe is answered by the reroute). Run dirs are
//               suffixed --e2b so E2B rounds never enter paid history. --judge
//               still speaks real OpenAI and loads its own key. Per-course
//               budget stretches to 45 minutes (on-device inference is slow).
//
//   --authoring: (V0.14.5 WS-B3) seed the app's 'coursemapper-authoring-mode'
//                flag. 'prose' (default) keeps today's behavior and run-dir
//                naming exactly; 'native' runs the Pass A/B graph-authoring
//                path (run dirs suffixed --native); 'both' runs each course
//                TWICE (course--prose / course--native), the round report
//                gaining an "Authoring side-by-side" section with paired
//                score/cost/wall-clock/kernel-coverage columns + deltas. The
//                P0 and drift gates apply to each run independently.
//
//   --judge: (advisory, off by default) on a live or --skip-generate run, sample
//            3 artifacts per non-stranger course (mid-lesson lesson plan + quiz
//            bank + study guide) and make ONE gpt-5.4-mini call scoring "would a
//            professor teach from this as-is?" (1–10 + verdict). Surfaces a
//            "## Advisory judge" section per course report.md and a 'judge'
//            round-table column; counts ~$0.05/course toward --max-spend. NEVER
//            affects the exit code, the P0 gate, or the drift gate; a parse
//            failure logs 'judge: unparseable' and changes nothing.
//
//   --courses: 'all' = the four audit courses (release-comparable bar);
//              'extended' = all ten (audit + the six genome courses);
//              'smoke' = cs-python; or a comma list of ids.
//   --stranger: append one rotating-pool course (WS-B3) — generic probes only,
//               findings filed to stranger-findings.md, never gates.
//
// Modes:
//   (default)          run live rounds: server once per round → generate each course in a
//                      real browser → unzip → grade (tests/lib/deepQualityGrader.js, lazy)
//                      → per-course report.json/report.md → ROUND_REPORT.md. Exit 1 on any P0.
//                      E1: up to --concurrency courses (default 2, max 3) generate in
//                      parallel browser contexts of ONE chromium; summary order stays
//                      course-list order. E2: --max-spend (default $2.50) aborts the round
//                      before starting a course that could blow the cap (in-flight runs are
//                      never killed). E3: a failed generation retries once with a fresh
//                      page; both attempts' failure artifacts are kept (-attempt1/-attempt2).
//   --dry-run          start server, open landing, verify every selector the flow needs,
//                      screenshot — NO generation, no API spend.
//   --skip-generate D  re-grade existing artifacts in run dir D (grader improvements can
//                      re-score old rounds without regenerating).
//   --calibrate        E4: re-grade ALL stored rounds in-memory (no report writes) and diff
//                      the findings against scripts/crucible/verdicts.json. Any known
//                      true-positive now missed, or known false-positive resurfacing,
//                      exits 1 — this gates grader edits against the loop's whole history.
//   --history          E5: print the per-course score trajectory across all stored rounds.
//   --diff A B         E6: per-course, per-deliverable heading-level content diff between
//                      two stored rounds + score deltas; writes DIFF_<A>_vs_<B>.md into the
//                      newer round's dir.
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
import { referenceCourses, resolveCourses, getCourseById, pickStranger } from './crucible/courses.mjs';
import {
  DEFAULT_MAX_SPEND_USD,
  INAPP_SCORE_DRIFT_LIMIT,
  JUDGE_MODEL,
  PROVIDER_DEFAULT_MODELS,
  buildAuthoringComparison,
  buildHistoryTable,
  buildJudgePrompt,
  clampConcurrency,
  computeJudgeMeans,
  JUDGE_MEANS_BASELINE,
  JUDGE_MEANS_TARGET,
  renderJudgeMeansSection,
  expandCoursesForAuthoring,
  expandCoursesForVoice,
  pairVoiceAbEntries,
  renderVoiceAbSection,
  expandCoursesForProvider,
  findingProvider,
  pairAuthoringEntries,
  parseAuthoringFlag,
  parseVoiceFlag,
  parseProviderFlag,
  renderAuthoringSection,
  deriveCheckId,
  diffLedger,
  diffSections,
  digestCostUsd,
  findingEvidenceHash,
  inAppDriftDecision,
  inAppScoreFromManifest,
  judgeOverallCell,
  judgeSpendUsd,
  pairExtractedFiles,
  parseJudgeResponse,
  parseRoundDirTimestamp,
  renderJudgeSection,
  runPool,
  sampleJudgeArtifacts,
  sectionizeFile,
  spendGuardDecision,
  summarizeCourseAttempts,
} from './lib/crucibleRound.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const crucibleRoot = path.join(repoRoot, 'verification-output', 'crucible');
const graderModuleUrl = new URL('../tests/lib/deepQualityGrader.js', import.meta.url);
const verdictsLedgerPath = path.join(scriptDir, 'crucible', 'verdicts.json');
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

// A5(4): the in-app quality score the package graded itself with at finalize
// (WS-A writes manifest.quality). Returns null for older artifacts / timeout
// grades — those are SKIPPED by the drift gate, never failed.
async function readInAppScore(courseDir) {
  const manifest = await readJsonIfExists(path.join(courseDir, 'extracted', 'PACKAGE_MANIFEST.json'));
  return inAppScoreFromManifest(manifest);
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
  // WS-C C4: the legacy-branch hit line — the live half of the deletion proof.
  const legacyHits = Object.entries(runResult?.legacyPathTelemetry || {})
    .map(([id, entry]) => `${id}=${entry?.hits ?? 0}`)
    .join(', ');
  lines.push(`- legacyPathHits: ${legacyHits || 'none'}`);
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

function buildRoundReportMd({ roundLabel, modelId, entries, baseline, totals, provider = 'openai' }) {
  const lines = [
    // E1: the title carries provider+model so a provider round is identifiable
    // from the first line of its report.
    `# Crucible Round Report — ${roundLabel} (${provider} · ${modelId})`,
    '',
    `- Provider: ${provider}`,
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
  // E7: the 'Judge' column carries the advisory LLM overall (blank when --judge
  // is off or the response was unparseable). It NEVER feeds the P0/drift gates.
  const header = ['Course', 'Status', 'Overall', 'In-app', 'Judge', ...dimensions, 'P0', 'P1'];
  lines.push(`| ${header.join(' | ')} |`);
  lines.push(`| ${header.map(() => '---').join(' | ')} |`);
  for (const entry of entries) {
    const grade = entry.gradeResult;
    // Authoring runs (course--prose / course--native) compare against the
    // base course's baseline report.
    const baselineGrade = baseline?.reports?.[entry.course.baseId || entry.course.id]?.normalized || null;
    const cells = [
      entry.course.id,
      entry.runResult ? entry.runResult.statusLabel || entry.runResult.status : grade?.status || 'regrade',
      grade?.graded
        ? baselineGrade
          ? formatScoreDelta(grade.overall, baselineGrade.overall)
          : String(grade.overall ?? 'n/a')
        : grade?.status || 'not graded',
      grade?.graded ? inAppCell(entry) : '—',
      judgeOverallCell(entry.judge),
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

  // V0.14.5 WS-B3: the prose-vs-native paired comparison (only when the round
  // actually carries authoring-tagged entries — plain rounds render nothing).
  const authoringSection = renderAuthoringSection(buildAuthoringComparison(pairAuthoringEntries(entries)));
  if (authoringSection) lines.push('', authoringSection);

  const ungraded = entries.filter((entry) => !entry.gradeResult?.graded);
  if (ungraded.length > 0) {
    lines.push('', '## Grading status', '');
    for (const entry of ungraded) {
      lines.push(`- ${entry.course.id}: ${entry.gradeResult?.message || 'not graded'}`);
    }
  }

  // E7: the advisory-judge roll-up (only when --judge ran). Per-artifact detail
  // lives in each course's report.md; this is the overall + verdict at a glance.
  const judged = entries.filter((entry) => entry.judge);
  if (judged.length > 0) {
    lines.push(
      '',
      '## Advisory judge (LLM, non-gating)',
      '',
      '_An LLM professor-read on 3 sampled artifacts per course. Advisory only — never gates, never overrides the deterministic grade._',
      '',
    );
    for (const entry of judged) {
      const parsed = entry.judge?.parsed;
      if (!parsed) {
        lines.push(`- **${entry.course.id}**: ${entry.judge?.note || 'judge: unparseable'}`);
        continue;
      }
      lines.push(
        `- **${entry.course.id}: ${Number.isFinite(parsed.overall) ? `${parsed.overall}/10` : 'n/a'}** — ${parsed.verdict || '(no verdict)'}`,
      );
    }
  }
  return `${lines.join('\n')}\n`;
}

// A5(4): the 'in-app' cell shows the package's self-grade and the drift vs the
// Crucible's score; 'DRIFT!' when beyond INAPP_SCORE_DRIFT_LIMIT, '—' when the
// package carries no quality block (older artifact / timeout grade).
function inAppCell(entry) {
  const decision = inAppDriftDecision(entry.gradeResult?.overall, entry.inAppScore);
  if (decision.skip) return '—';
  return `${entry.inAppScore} (Δ${decision.drift}${decision.ok ? '' : ' DRIFT!'})`;
}

function printRoundTable(entries) {
  // E7: the 'judge' column is blank everywhere when --judge is off; it only
  // carries a value for non-stranger courses with a parseable judge response.
  const rows = [['course', 'status', 'overall', 'in-app', 'judge', 'P0', 'P1', 'cost', 'time']];
  for (const entry of entries) {
    const grade = entry.gradeResult;
    const digest = entry.runResult?.digest || entry.digest || null;
    // Retried courses report BOTH attempts' spend (spendUsd), not just the
    // final digest's display string.
    const costCell = Number.isFinite(entry.runResult?.spendUsd)
      ? `$${entry.runResult.spendUsd.toFixed(2)}`
      : digest?.cost?.totalDisplay || '—';
    const durationMs = Number.isFinite(entry.runResult?.attemptsDurationMs)
      ? entry.runResult.attemptsDurationMs
      : entry.runResult?.durationMs;
    rows.push([
      entry.course.id,
      entry.runResult ? entry.runResult.statusLabel || entry.runResult.status : grade?.status || 'regrade',
      grade?.graded
        ? `${grade.overall ?? 'n/a'}${grade.overallGrade ? ` (${grade.overallGrade})` : ''}`
        : grade?.status || '—',
      grade?.graded ? inAppCell(entry) : '—',
      judgeOverallCell(entry.judge),
      grade?.graded ? String(grade.p0Count) : '—',
      grade?.graded ? String(grade.p1Count) : '—',
      costCell,
      entry.runResult ? `${Math.round((durationMs || 0) / 1000)}s` : '—',
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
  'coursemapper-authoring-mode', // WS-B3 native-authoring flag (src/lib/nativeGraphAuthoring.js)
  'coursemapper-voice-pass', // v0.14.7 WS-D2 voice-pass flag (src/lib/voicePass.js)
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
          // WS-C: durably persist the compiler legacy-branch hit counts so the
          // deletion proof is auditable after the round, not only in the report
          // markdown (the matrix is the primary evidence; this is the live net).
          legacyPathTelemetry: runResult.legacyPathTelemetry || null,
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
    // spendUsd/attemptsDurationMs (set by the live-round worker) include FAILED
    // retry attempts; the digest fallback covers regrades and older entries.
    if (Number.isFinite(entry.runResult?.spendUsd)) {
      costUsd += entry.runResult.spendUsd;
    } else {
      const digest = entry.runResult?.digest || entry.digest || null;
      costUsd += digestCostUsd(digest);
    }
    if (Number.isFinite(entry.runResult?.attemptsDurationMs)) durationMs += entry.runResult.attemptsDurationMs;
    else if (Number.isFinite(entry.runResult?.durationMs)) durationMs += entry.runResult.durationMs;
    // E7: the advisory-judge call cost counts toward the round's spend total.
    if (Number.isFinite(entry.judge?.spendUsd)) costUsd += entry.judge.spendUsd;
  }
  return { costUsd, durationMs };
}

// ── E5: stored-round history (scan + render) ───────────────────────────────
// A "stored round" is any round-*/ or baseline-*/ dir under
// verification-output/crucible/ whose course dirs carry report.json files.
async function listStoredRoundDirNames() {
  const dirents = await fs.readdir(crucibleRoot, { withFileTypes: true }).catch(() => []);
  return dirents
    .filter((dirent) => dirent.isDirectory() && /^(?:round-|baseline-)/.test(dirent.name))
    .map((dirent) => dirent.name);
}

async function readRoundSummary(dirName) {
  const dirPath = path.join(crucibleRoot, dirName);
  const roundJson = await readJsonIfExists(path.join(dirPath, 'round.json'));
  const courseDirents = await fs.readdir(dirPath, { withFileTypes: true }).catch(() => []);
  // v0.15 T3: the advisory judge joins the trajectory — round.json already
  // stores judgeOverall per course; surface it so the 4–6/10 ceiling is
  // visible release-over-release in one table.
  const judgeById = new Map(
    (roundJson?.courses || [])
      .filter((course) => Number.isFinite(course.judgeOverall))
      .map((course) => [course.id, course.judgeOverall]),
  );
  const courses = [];
  let costUsd = 0;
  let costSeen = false;
  for (const dirent of courseDirents) {
    if (!dirent.isDirectory()) continue;
    const report = await readJsonIfExists(path.join(dirPath, dirent.name, 'report.json'));
    const digest = await readJsonIfExists(path.join(dirPath, dirent.name, 'digest.json'));
    if (!report && !digest) continue;
    const normalized = report?.normalized || {};
    courses.push({
      id: dirent.name,
      overall: Number.isFinite(normalized.overall) ? normalized.overall : null,
      p0: Number.isFinite(normalized.p0Count) ? normalized.p0Count : null,
      p1: Number.isFinite(normalized.p1Count) ? normalized.p1Count : null,
      judge: judgeById.has(dirent.name) ? judgeById.get(dirent.name) : null,
    });
    if (digest) {
      costUsd += digestCostUsd(digest);
      costSeen = true;
    }
  }
  if (courses.length === 0) return null;
  return {
    dirName,
    timestamp: parseRoundDirTimestamp(dirName),
    finishedAt: roundJson?.finishedAt || null,
    courses,
    costUsd: costSeen ? costUsd : Number.isFinite(roundJson?.totals?.costUsd) ? roundJson.totals.costUsd : null,
  };
}

async function scanRoundHistory() {
  const summaries = [];
  for (const dirName of await listStoredRoundDirNames()) {
    const summary = await readRoundSummary(dirName);
    if (summary) summaries.push(summary);
  }
  return summaries;
}

function renderHistoryMarkdown(summaries) {
  const { header, rows } = buildHistoryTable(
    summaries,
    referenceCourses.map((course) => course.id),
  );
  const lines = [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
    '',
    '_Cell format: overall · P0/P1 (· jN = advisory judge /10 when the round ran --judge)._',
  ];
  return lines.join('\n');
}

function printAlignedTable(header, rows) {
  const all = [header, ...rows];
  const widths = header.map((_, col) => Math.max(...all.map((row) => String(row[col] ?? '').length)));
  for (const [index, row] of all.entries()) {
    console.log(`  ${row.map((cell, col) => String(cell ?? '').padEnd(widths[col])).join('  ')}`);
    if (index === 0) console.log(`  ${widths.map((w) => '-'.repeat(w)).join('  ')}`);
  }
}

// ── Mode: --history ─────────────────────────────────────────────────────────
async function showHistory() {
  const summaries = await scanRoundHistory();
  if (summaries.length === 0) {
    log(`no stored rounds under ${path.relative(repoRoot, crucibleRoot)}`);
    return;
  }
  const { header, rows } = buildHistoryTable(
    summaries,
    referenceCourses.map((course) => course.id),
  );
  log(`score trajectory across ${summaries.length} stored round(s) (cell = overall · P0/P1):`);
  printAlignedTable(header, rows);
  // v0.15.3 D2: the KPI readout — per-course judge means ± sd vs baseline.
  const means = computeJudgeMeans(summaries);
  if (means.length > 0) {
    console.log('');
    log(`per-course judge means (KPI target: ${JUDGE_MEANS_TARGET}):`);
    printAlignedTable(
      ['course', 'n', 'mean', 'sd', 'range', 'Δ vs baseline'],
      means.map((row) => {
        const base = JUDGE_MEANS_BASELINE.means?.[row.id];
        return [
          row.id,
          row.n,
          row.mean.toFixed(2),
          row.sd.toFixed(2),
          `${row.min}-${row.max}`,
          Number.isFinite(base) ? `${row.mean - base >= 0 ? '+' : ''}${(row.mean - base).toFixed(2)}` : '—',
        ];
      }),
    );
  }
}

async function finishRound({ roundDir, roundLabel, modelId, entries, baseline, spendAbortReason = null, provider }) {
  const totals = computeTotals(entries);
  // Regrades infer the provider from the course entries (course.json carries
  // it since E1); absent everywhere → openai (all pre-E1 history is openai).
  const roundProvider = provider || entries.map((entry) => entry.course?.provider).find(Boolean) || 'openai';
  const reportMd = buildRoundReportMd({ roundLabel, modelId, entries, baseline, totals, provider: roundProvider });
  await fs.writeFile(path.join(roundDir, 'ROUND_REPORT.md'), reportMd);
  await writeJson(path.join(roundDir, 'round.json'), {
    label: roundLabel,
    modelId,
    provider: roundProvider,
    finishedAt: new Date().toISOString(),
    baseline: baseline?.dir || null,
    spendAbortReason,
    totals,
    courses: entries.map((entry) => ({
      id: entry.course.id,
      runStatus: entry.runResult?.status || null,
      runStatusLabel: entry.runResult?.statusLabel || entry.runResult?.status || null,
      attemptCount: entry.runResult?.attemptCount ?? null,
      spendUsd: entry.runResult?.spendUsd ?? null,
      gradeStatus: entry.gradeResult?.status || null,
      overall: entry.gradeResult?.overall ?? null,
      inAppScore: entry.inAppScore ?? null,
      p0Count: entry.gradeResult?.p0Count ?? null,
      p1Count: entry.gradeResult?.p1Count ?? null,
      // E7: advisory judge overall (null when off/unparseable) — never gates.
      judgeOverall: entry.judge?.parsed?.overall ?? null,
      judgeSpendUsd: entry.judge?.spendUsd ?? null,
      stranger: isStranger(entry.course) || undefined,
      // V0.14.5 WS-B3: authoring-tagged runs keep their pairing identity.
      authoring: entry.course.authoring || undefined,
      // V0.14.5 WS-E (E1): non-openai runs keep their provider identity.
      provider: entry.course.provider && entry.course.provider !== 'openai' ? entry.course.provider : undefined,
      baseId: entry.course.baseId && entry.course.baseId !== entry.course.id ? entry.course.baseId : undefined,
    })),
  });

  // E5: every new ROUND_REPORT carries the score trajectory across all stored
  // rounds (this round included — its round.json was just written above).
  // v0.15.3 D2: followed by the per-course judge MEANS — the variance note's
  // KPI — so the ruler reads itself on every round.
  try {
    const summaries = await scanRoundHistory();
    if (summaries.length > 0) {
      await fs.appendFile(
        path.join(roundDir, 'ROUND_REPORT.md'),
        `\n## Score trajectory (all stored rounds)\n\n${renderHistoryMarkdown(summaries)}\n` +
          `\n${renderJudgeMeansSection(computeJudgeMeans(summaries))}\n`,
      );
    }
  } catch (error) {
    log(`warning: could not append score trajectory: ${error.message}`);
  }

  console.log('');
  log(`round ${roundLabel} summary:`);
  printRoundTable(entries);
  console.log('');
  log(`round report: ${path.relative(repoRoot, path.join(roundDir, 'ROUND_REPORT.md'))}`);
  if (spendAbortReason) log(`SPEND CAP: ${spendAbortReason} — remaining generations were skipped; exit 1`);

  // WS-B3: strangers (probeProfile 'generic') are excluded from the P0 gate and
  // the pass/fail summary — they exist to break assumptions, not to pass. Their
  // findings live in stranger-findings.md (written by runLiveRounds).
  const gating = entries.filter((entry) => !isStranger(entry.course));
  const anyP0 = gating.some((entry) => (entry.gradeResult?.p0Count || 0) > 0);
  const anyRunFailure = gating.some((entry) => entry.runResult && entry.runResult.status !== 'passed');

  // A5(4): the in-app self-grade and the Crucible's grade run the same code over
  // the same artifacts — a drift beyond INAPP_SCORE_DRIFT_LIMIT means they
  // diverged silently and the round fails. Skipped when manifest.quality is
  // absent (older artifacts) or the course is a stranger.
  const drifted = [];
  for (const entry of gating) {
    if (!entry.gradeResult?.graded) continue;
    const decision = inAppDriftDecision(entry.gradeResult.overall, entry.inAppScore);
    if (!decision.skip && !decision.ok) drifted.push({ entry, decision });
  }
  for (const { entry, decision } of drifted) {
    log(
      `IN-APP DRIFT: ${entry.course.id} Crucible=${entry.gradeResult.overall} vs in-app=${entry.inAppScore} ` +
        `(Δ${decision.drift} > ${INAPP_SCORE_DRIFT_LIMIT}) — the two graders diverged silently`,
    );
  }

  if (anyP0 || anyRunFailure || drifted.length > 0) process.exitCode = 1;
}

// WS-B3: a stranger is a generic-probe-profile course (the rotating-pool slot).
function isStranger(course) {
  return String(course?.probeProfile || '').toLowerCase() === 'generic';
}

// ── Mode: --skip-generate <dir> ────────────────────────────────────────────
async function regradeExisting(options) {
  const sourceDir = path.resolve(repoRoot, String(options.skipGenerate));
  log(`re-grading existing artifacts in ${sourceDir} (no generation)`);
  const baseline = options.baseline ? await loadBaselineReports(options.baseline) : null;
  // E7: --judge needs an API key + the grader's extractor. Loaded once; a
  // missing key disables the judge (advisory) rather than failing the regrade.
  let judgeApiKey = null;
  let judgeGrader = null;
  if (options.judge) {
    const apiEnvPath = options.apiEnv ? path.resolve(repoRoot, options.apiEnv) : defaultApiEnvPath;
    judgeApiKey = await loadApiKey(apiEnvPath).catch((error) => {
      log(`--judge: no API key (${redactSecrets(error.message)}) — judge disabled, regrade continues`);
      return null;
    });
    judgeGrader = await loadGrader();
  }
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
    const inAppScore = await readInAppScore(courseDir);
    const judge = await maybeJudgeCourse({
      options,
      grader: judgeGrader,
      apiKey: judgeApiKey,
      courseDir,
      course,
    });
    entries.push({ course, runResult: null, gradeResult, digest, inAppScore, judge });
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

// ── Mode: --calibrate (E4) ──────────────────────────────────────────────────
// Re-grade ALL stored rounds in-memory (no report writes) and diff the current
// grader's P0/P1 findings against the durable verdict ledger at
// scripts/crucible/verdicts.json. P2s are excluded: the ledger gates the P0/P1
// severities that gate rounds.
// V0.14.5 E3: matching is namespaced by (checkId, course, PROVIDER). Ledger
// entries and course dirs without a provider field default to 'openai' — the
// whole pre-provider history stays valid without a rewrite.
async function collectCourseDirs(roundDirPath) {
  const dirents = await fs.readdir(roundDirPath, { withFileTypes: true }).catch(() => []);
  const out = [];
  for (const dirent of dirents) {
    if (!dirent.isDirectory()) continue;
    const courseDir = path.join(roundDirPath, dirent.name);
    const hasExtracted = await fs
      .stat(path.join(courseDir, 'extracted'))
      .then((stat) => stat.isDirectory())
      .catch(() => false);
    if (!hasExtracted) continue;
    const courseJson = await readJsonIfExists(path.join(courseDir, 'course.json'));
    const course = courseJson || getCourseById(dirent.name) || { id: dirent.name, title: dirent.name };
    out.push({ courseDir, course });
  }
  return out;
}

async function calibrate() {
  const ledger = await readJsonIfExists(verdictsLedgerPath);
  if (!Array.isArray(ledger) || ledger.length === 0) {
    throw new Error(`verdict ledger missing or empty at ${path.relative(repoRoot, verdictsLedgerPath)}`);
  }
  const grader = await loadGrader();
  if (!grader) throw new Error(`cannot calibrate without the grader: ${graderLoadError}`);

  const roundDirNames = await listStoredRoundDirNames();
  if (roundDirNames.length === 0) {
    throw new Error(`no stored rounds under ${path.relative(repoRoot, crucibleRoot)} — nothing to calibrate against`);
  }

  log(`calibrating grader against ${ledger.length} ledger verdict(s) across ${roundDirNames.length} stored round(s)`);
  const findings = [];
  const storedRoundIds = [];
  for (const roundId of roundDirNames.sort()) {
    const courseEntries = await collectCourseDirs(path.join(crucibleRoot, roundId));
    if (courseEntries.length === 0) continue;
    storedRoundIds.push(roundId);
    for (const { courseDir, course } of courseEntries) {
      log(`  re-grading ${roundId}/${course.id} (in-memory, no report writes)...`);
      const gradeResult = await gradeCourseDir({ courseDir, course });
      if (!gradeResult.graded) {
        log(`  warning: ${roundId}/${course.id} not gradeable: ${gradeResult.message || gradeResult.status}`);
        continue;
      }
      for (const finding of gradeResult.findings) {
        if (finding.severity !== 'P0' && finding.severity !== 'P1') continue;
        findings.push({
          roundId,
          courseId: course.id,
          // E3: namespace by provider (course.json carries it for E1 runs;
          // pre-provider dirs default to openai) so an Anthropic-only finding
          // never reads as an OpenAI regression.
          provider: findingProvider(course),
          checkId: deriveCheckId(finding),
          evidenceHash: findingEvidenceHash(finding),
          severity: finding.severity,
          detail: finding.detail || finding.title,
          file: finding.file,
        });
      }
    }
  }

  const diff = diffLedger({ ledger, findings, storedRoundIds });

  console.log('');
  log(`calibration vs ${path.relative(repoRoot, verdictsLedgerPath)}:`);
  const shortRound = (roundId) => roundId.replace(/^round-2026-06-11T/, 'round-…T');
  const rows = [];
  for (const { entry, status } of [
    ...diff.verified,
    ...diff.missingTruePositives,
    ...diff.quietFalsePositives,
    ...diff.resurfacedFalsePositives,
    ...diff.skipped,
  ]) {
    rows.push([
      shortRound(entry.roundId),
      entry.courseId,
      findingProvider(entry),
      entry.verdict,
      entry.checkId.slice(0, 56),
      status,
    ]);
  }
  rows.sort((a, b) => `${a[0]}|${a[1]}|${a[4]}`.localeCompare(`${b[0]}|${b[1]}|${b[4]}`));
  printAlignedTable(['round', 'course', 'provider', 'verdict', 'checkId', 'status'], rows);

  if (diff.unvetted.length > 0) {
    console.log('');
    log(`unvetted findings (add a verdict to ${path.relative(repoRoot, verdictsLedgerPath)} — include the provider):`);
    const unvettedRows = diff.unvetted
      .sort((a, b) =>
        `${a.roundId}|${a.courseId}|${a.checkId}`.localeCompare(`${b.roundId}|${b.courseId}|${b.checkId}`),
      )
      .map((item) => [
        shortRound(item.roundId),
        item.courseId,
        // E3: unvetted findings list their provider so a new verdict lands in
        // the right namespace.
        findingProvider(item),
        item.severity,
        item.checkId.slice(0, 56),
        `×${item.count}`,
      ]);
    printAlignedTable(['round', 'course', 'provider', 'sev', 'checkId', 'count'], unvettedRows);
  }

  console.log('');
  if (!diff.ok) {
    for (const { entry } of diff.missingTruePositives) {
      log(
        `CALIBRATION FAILURE: true positive missing — ${entry.roundId}/${entry.courseId} ` +
          `[${findingProvider(entry)}] ${entry.checkId}` +
          (entry.note ? ` (${entry.note})` : ''),
      );
    }
    for (const { entry } of diff.resurfacedFalsePositives) {
      log(
        `CALIBRATION FAILURE: false positive resurfaced — ${entry.roundId}/${entry.courseId} ` +
          `[${findingProvider(entry)}] ${entry.checkId}` +
          (entry.note ? ` (${entry.note})` : ''),
      );
    }
    process.exitCode = 1;
    return;
  }
  log(
    `calibration GREEN: ${diff.verified.length} true positive(s) still detected, ` +
      `${diff.quietFalsePositives.length} false positive(s) still quiet` +
      (diff.skipped.length > 0 ? `, ${diff.skipped.length} verdict(s) skipped (round not stored)` : '') +
      (diff.unvetted.length > 0 ? `, ${diff.unvetted.length} unvetted finding group(s) listed above` : ''),
  );
}

// ── Mode: --diff <roundDirA> <roundDirB> (E6) ───────────────────────────────
async function resolveRoundDir(spec) {
  const candidates = [path.resolve(repoRoot, String(spec)), path.join(crucibleRoot, String(spec))];
  for (const candidate of candidates) {
    const isDir = await fs
      .stat(candidate)
      .then((stat) => stat.isDirectory())
      .catch(() => false);
    if (isDir) return candidate;
  }
  throw new Error(`--diff: round dir "${spec}" not found (tried ${candidates.join(', ')})`);
}

function lessonTag(file) {
  return file.lessonNumber != null ? `L${String(file.lessonNumber).padStart(2, '0')}` : 'course';
}

// The grader's extractPackage takes a FileProvider since the v0.14.3 WS-A move
// (the tests/lib shim re-exports createFsFileProvider); older builds took the
// extracted dir directly. Support both so the lazy import keeps degrading
// gracefully.
async function extractPackageFromDir(grader, extractedDir) {
  if (typeof grader.createFsFileProvider === 'function') {
    return grader.extractPackage(grader.createFsFileProvider(extractedDir));
  }
  return grader.extractPackage(extractedDir);
}

// ── E7: the advisory judge (--judge) — the fetch half ───────────────────────
// Per non-stranger course: sample 3 artifacts deterministically (reusing the
// grader's extraction), make ONE OpenAI chat-completions call bundling all 3,
// parse defensively, append a "## Advisory judge" section to the course
// report.md, and return { parsed, spendUsd, note }. ADVISORY ONLY: any failure
// logs and yields { parsed: null } — never throws, never gates, never touches
// the exit code. The cost counts toward --max-spend accounting via the caller.
const maxLessonNumber = (files) =>
  (files || []).reduce((max, file) => (file.lessonNumber > max ? file.lessonNumber : max), 0);

async function judgeCourse({ grader, courseDir, course, apiKey }) {
  try {
    const pkg = await extractPackageFromDir(grader, path.join(courseDir, 'extracted'));
    const lessonCount = course.lessonCount || maxLessonNumber(pkg.files);
    const artifacts = sampleJudgeArtifacts(pkg.files, lessonCount);
    if (artifacts.length === 0) {
      log(`  ${course.id}: judge: no sampleable artifacts — skipped`);
      return { parsed: null, spendUsd: 0, note: 'judge: no sampleable artifacts' };
    }
    const prompt = buildJudgePrompt(course, artifacts);
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: JUDGE_MODEL,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      }),
    });
    if (!response.ok) {
      log(`  ${course.id}: judge HTTP ${response.status} — advisory, ignored`);
      return { parsed: null, spendUsd: 0, note: `judge: HTTP ${response.status}` };
    }
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || '';
    const parsed = parseJudgeResponse(content);
    const spendUsd = judgeSpendUsd(data?.usage);
    if (!parsed) log(`  ${course.id}: judge: unparseable`);
    else log(`  ${course.id}: judge overall ${parsed.overall ?? 'n/a'}/10 ($${spendUsd.toFixed(3)})`);
    return { parsed, spendUsd, note: parsed ? null : 'judge: unparseable' };
  } catch (error) {
    log(`  ${course.id}: judge call failed (${redactSecrets(error.message || String(error))}) — advisory, ignored`);
    return { parsed: null, spendUsd: 0, note: 'judge: error' };
  }
}

// Run the advisory judge for a course (when --judge is set and the course is
// not a stranger), append its section to report.md, and return the judge
// result. Strangers and missing grader/key are no-ops returning null.
async function maybeJudgeCourse({ options, grader, apiKey, courseDir, course }) {
  if (!options.judge || isStranger(course) || !grader || !apiKey) return null;
  const judge = await judgeCourse({ grader, courseDir, course, apiKey });
  await fs.appendFile(path.join(courseDir, 'report.md'), `\n${renderJudgeSection(judge)}`).catch(() => {});
  return judge;
}

async function diffRounds(specA, specB) {
  const dirA = await resolveRoundDir(specA);
  const dirB = await resolveRoundDir(specB);
  const nameA = path.basename(dirA);
  const nameB = path.basename(dirB);
  const grader = await loadGrader();
  if (!grader || typeof grader.extractPackage !== 'function') {
    throw new Error(`--diff needs the grader's extractPackage export: ${graderLoadError || 'not exported'}`);
  }

  const coursesA = await collectCourseDirs(dirA);
  const coursesB = await collectCourseDirs(dirB);
  const byIdB = new Map(coursesB.map((entry) => [entry.course.id, entry]));
  const common = coursesA.filter((entry) => byIdB.has(entry.course.id));
  if (common.length === 0) throw new Error(`--diff: no course present in both ${nameA} and ${nameB}`);

  const lines = [
    `# Crucible round diff — ${nameA} vs ${nameB}`,
    '',
    `- A: ${path.relative(repoRoot, dirA)}`,
    `- B: ${path.relative(repoRoot, dirB)}`,
    `- Courses compared: ${common.map((entry) => entry.course.id).join(', ')}`,
    `- Generated: ${new Date().toISOString()}`,
    '',
  ];

  for (const entryA of common) {
    const courseId = entryA.course.id;
    const entryB = byIdB.get(courseId);
    log(`diffing ${courseId} (${nameA} → ${nameB})...`);
    const reportA = await readJsonIfExists(path.join(entryA.courseDir, 'report.json'));
    const reportB = await readJsonIfExists(path.join(entryB.courseDir, 'report.json'));
    const normA = reportA?.normalized || {};
    const normB = reportB?.normalized || {};

    lines.push(`## ${courseId}`, '');
    if (Number.isFinite(normA.overall) || Number.isFinite(normB.overall)) {
      const delta =
        Number.isFinite(normA.overall) && Number.isFinite(normB.overall)
          ? ` (Δ ${normB.overall - normA.overall >= 0 ? '+' : ''}${normB.overall - normA.overall})`
          : '';
      lines.push(
        `- Scores: overall ${normA.overall ?? 'n/a'} → ${normB.overall ?? 'n/a'}${delta} · ` +
          `P0 ${normA.p0Count ?? '?'} → ${normB.p0Count ?? '?'} · P1 ${normA.p1Count ?? '?'} → ${normB.p1Count ?? '?'}`,
      );
    }

    const pkgA = await extractPackageFromDir(grader, path.join(entryA.courseDir, 'extracted'));
    const pkgB = await extractPackageFromDir(grader, path.join(entryB.courseDir, 'extracted'));
    const { pairs, onlyA, onlyB } = pairExtractedFiles(pkgA.files, pkgB.files);
    lines.push(
      `- Files: ${pkgA.files.length} in A, ${pkgB.files.length} in B ` +
        `(${pairs.length} paired, ${onlyA.length} only in A, ${onlyB.length} only in B)`,
    );

    // Aggregate section-level changes per deliverable type (top folder).
    const byTop = new Map();
    const topOf = (file) => file.top || '(root)';
    for (const { a, b } of pairs) {
      const top = topOf(a);
      if (!byTop.has(top)) {
        byTop.set(top, { paired: 0, filesChanged: 0, added: 0, removed: 0, changed: 0, changedTitles: [] });
      }
      const bucket = byTop.get(top);
      bucket.paired += 1;
      const delta = diffSections(sectionizeFile(a), sectionizeFile(b));
      if (delta.added.length || delta.removed.length || delta.changed.length) bucket.filesChanged += 1;
      bucket.added += delta.added.length;
      bucket.removed += delta.removed.length;
      bucket.changed += delta.changed.length;
      for (const heading of delta.changed) bucket.changedTitles.push(`${lessonTag(a)} "${heading}"`);
    }

    lines.push('', '| Deliverable | Files differing | Sections changed | Added | Removed |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const top of [...byTop.keys()].sort()) {
      const bucket = byTop.get(top);
      lines.push(
        `| ${top} | ${bucket.filesChanged}/${bucket.paired} | ${bucket.changed} | ${bucket.added} | ${bucket.removed} |`,
      );
    }

    const changedSummaries = [...byTop.entries()].filter(([, bucket]) => bucket.changedTitles.length > 0);
    if (changedSummaries.length > 0) {
      lines.push('', 'Changed sections (by heading):');
      for (const [top, bucket] of changedSummaries.sort(([a], [b]) => a.localeCompare(b))) {
        const cap = 8;
        const shown = bucket.changedTitles.slice(0, cap).join(', ');
        const more = bucket.changedTitles.length > cap ? ` … (+${bucket.changedTitles.length - cap} more)` : '';
        lines.push(`- ${top}: ${shown}${more}`);
      }
    }
    if (onlyA.length > 0) lines.push('', `Only in A: ${onlyA.map((file) => file.path).join(', ')}`);
    if (onlyB.length > 0) lines.push('', `Only in B: ${onlyB.map((file) => file.path).join(', ')}`);
    lines.push('');
  }

  const output = `${lines.join('\n')}\n`;
  console.log('');
  console.log(output);

  // Write the diff into the NEWER round's dir.
  const keyOf = (dirPath) => parseRoundDirTimestamp(path.basename(dirPath)) || '';
  const newerDir = keyOf(dirB) >= keyOf(dirA) ? dirB : dirA;
  const diffPath = path.join(newerDir, `DIFF_${nameA}_vs_${nameB}.md`);
  await fs.writeFile(diffPath, output);
  log(`diff written: ${path.relative(repoRoot, diffPath)}`);
}

// ── Mode: live rounds (default) ────────────────────────────────────────────

// E3: after a FAILED attempt, suffix its artifacts -attemptN so both attempts'
// failure evidence survives. Attempt 1's files are RENAMED (clean slate for the
// retry); a failed attempt 2's console log is COPIED so the canonical
// console.log the grader reads stays in place.
async function archiveFailedAttemptArtifacts(courseDir, attemptNumber) {
  const suffix = `-attempt${attemptNumber}`;
  const names = await fs.readdir(courseDir).catch(() => []);
  for (const name of names) {
    const fullPath = path.join(courseDir, name);
    if (name === 'console.log') {
      if (attemptNumber === 1) await fs.rename(fullPath, path.join(courseDir, `console${suffix}.log`));
      else await fs.copyFile(fullPath, path.join(courseDir, `console${suffix}.log`));
    } else if (/^failure-.*\.png$/.test(name) && !/-attempt\d+\.png$/.test(name)) {
      await fs.rename(fullPath, path.join(courseDir, name.replace(/\.png$/, `${suffix}.png`)));
    } else if (name === 'digest.json' && attemptNumber === 1) {
      // Keep attempt 1's digest for spend forensics, and make room so a
      // digest-less attempt 2 can't be graded against stale numbers.
      await fs.rename(fullPath, path.join(courseDir, `digest${suffix}.json`));
    }
  }
}

// WS-B3: write the appended stranger's grade to stranger-findings.md (it never
// gates, so its findings are filed separately from the round report).
async function writeStrangerFindings(roundDir, strangerEntries) {
  if (strangerEntries.length === 0) return;
  const lines = [
    '# Crucible stranger findings',
    '',
    '_Strangers grade on generic dimensions only (discipline probes + genome bar off) and never gate. They exist to break assumptions, not to pass._',
    '',
  ];
  for (const entry of strangerEntries) {
    const grade = entry.gradeResult;
    lines.push(`## ${entry.course.title} (${entry.course.id})`, '');
    if (!grade?.graded) {
      lines.push(`Not graded: ${grade?.message || grade?.status || 'unknown'}`, '');
      continue;
    }
    lines.push(
      `- Overall: ${grade.overall ?? 'n/a'}${grade.overallGrade ? ` (${grade.overallGrade})` : ''} · ` +
        `${grade.p0Count} P0 · ${grade.p1Count} P1`,
      '',
    );
    const ranked = [...grade.findings].sort(
      (a, b) => ({ P0: 0, P1: 1, P2: 2 })[a.severity] - { P0: 0, P1: 1, P2: 2 }[b.severity],
    );
    if (ranked.length === 0) lines.push('No findings.', '');
    for (const finding of ranked) lines.push(formatFinding(finding));
    lines.push('');
  }
  await fs.writeFile(path.join(roundDir, 'stranger-findings.md'), `${lines.join('\n')}\n`);
}

async function runLiveRounds(options) {
  const baseCourses = resolveCourses(options.courses);
  // WS-B3: --stranger appends one rotating-pool course (deterministic per day).
  if (options.stranger) {
    const stranger = pickStranger();
    if (stranger && !baseCourses.some((course) => course.id === stranger.id)) {
      baseCourses.push(stranger);
      log(`stranger slot: appended "${stranger.title}" (${stranger.id}) — generic probes, never gates`);
    }
  }
  // V0.15.1 post-flip: omitted --authoring keeps the plain current-default app
  // path and run-dir naming. Explicit 'both' runs every course twice
  // (course--prose / course--native run dirs).
  const authoring = parseAuthoringFlag(options.authoring);
  // V0.14.5 WS-E (E1): --provider openai|anthropic|google. Non-openai runs
  // suffix the course run dirs (cs-python--anthropic) so provider rounds
  // never collide with openai history. Applied AFTER the authoring expansion
  // so baseId stays the original course id for baseline lookups and pairing.
  const provider = parseProviderFlag(options.provider);
  // v0.14.7 WS-D3: --voice off|on|both — voiced/quiet twins for the voice
  // pass proof rounds (applied after authoring, before provider suffixing).
  const voice = parseVoiceFlag(options.voice);
  let courses = expandCoursesForProvider(
    expandCoursesForVoice(expandCoursesForAuthoring(baseCourses, authoring), voice),
    provider,
  );
  // E2B experiment (--llm e2b): the app compiler runs against the LOCAL
  // Gemma 4 E2B shim (scripts/crucible/e2bOpenAIShim.mjs) — api.openai.com is
  // rerouted per browser context, no paid generation spend, no src/ change.
  // Run dirs are suffixed --e2b (same pattern as provider suffixing) so these
  // rounds never collide with paid history; baseId keeps baseline pairing.
  const llmShimUrl = options.llm === 'e2b' ? (options.shimUrl || 'http://127.0.0.1:8799') : null;
  if (options.llm && options.llm !== 'e2b') {
    throw new Error(`--llm supports only "e2b" (got "${options.llm}")`);
  }
  if (llmShimUrl) {
    if (provider !== 'openai') throw new Error('--llm e2b reroutes api.openai.com — use it with the openai provider');
    courses = courses.map((course) => ({ ...course, baseId: course.baseId || course.id, id: `${course.id}--e2b` }));
  }
  if (authoring !== 'prose') {
    log(`authoring mode: ${authoring} — ${courses.length} run(s) across ${baseCourses.length} course(s)`);
  }
  if (voice !== 'off') {
    log(`voice mode: ${voice} — ${courses.length} run(s) across ${baseCourses.length} course(s)`);
  }
  const rounds = Math.max(1, Number(options.rounds) || 1);
  // E1: each provider defaults to its cheapest generation-capable model
  // (documented at PROVIDER_DEFAULT_MODELS); --model still overrides.
  const modelId = options.model || PROVIDER_DEFAULT_MODELS[provider];
  const modelName = options.modelName || modelDisplayName(modelId);
  if (provider !== 'openai') log(`provider: ${provider} (model ${modelId})`);
  const headed = Boolean(options.headed);
  // E1: parallel generation (browser CONTEXTS in one chromium; the app is
  // stateless across tabs). --concurrency 1 is the sequential fallback.
  const concurrency = clampConcurrency(options.concurrency, { fallback: 2, max: 3 });
  // E2: spend cap. A runaway round can never become a bill.
  const maxSpendUsd = options.maxSpend === undefined ? DEFAULT_MAX_SPEND_USD : Number(options.maxSpend);
  if (!Number.isFinite(maxSpendUsd) || maxSpendUsd <= 0) {
    throw new Error(`--max-spend must be a positive dollar amount (got "${options.maxSpend}")`);
  }
  const apiEnvPath = options.apiEnv ? path.resolve(repoRoot, options.apiEnv) : defaultApiEnvPath;
  // E1: a missing key for the REQUESTED provider exits with the loader's
  // actionable message (provider, env vars checked, expected key shape) —
  // a clean exit before any server, browser, or spend; never a mid-round crash.
  let apiKey;
  if (llmShimUrl) {
    // No paid key needed for generation — every api.openai.com call is
    // intercepted before the network. The dummy passes the app's sk- shape
    // check; the "Connected" probe is answered by the reroute itself.
    apiKey = 'sk-e2b-local-shim-000000000000000000000000';
    try {
      const probe = await fetch(llmShimUrl, { method: 'GET' });
      log(`LLM: Gemma 4 E2B via local shim ${llmShimUrl} (probe HTTP ${probe.status}) — $0 generation`);
    } catch {
      log(`ABORTED: --llm e2b but no shim answers at ${llmShimUrl} — start it first: node scripts/crucible/e2bOpenAIShim.mjs`);
      process.exitCode = 1;
      return;
    }
  } else {
    try {
      apiKey = await loadApiKey(apiEnvPath, provider);
    } catch (error) {
      log(`ABORTED: ${redactSecrets(error.message)}`);
      process.exitCode = 1;
      return;
    }
  }
  // E1×E7: the advisory judge always speaks OpenAI (JUDGE_MODEL). On a
  // non-openai round (or an --llm e2b round, whose generation key is a dummy)
  // it needs its own key; when absent the judge is disabled (advisory — the
  // round itself is unaffected).
  let judgeApiKey = apiKey;
  if (options.judge && (provider !== 'openai' || llmShimUrl)) {
    judgeApiKey = await loadApiKey(apiEnvPath, 'openai').catch((error) => {
      log(
        `--judge: no OpenAI key for the judge on a ${provider} round (${redactSecrets(error.message)}) — judge disabled`,
      );
      return null;
    });
  }
  const baseline = options.baseline ? await loadBaselineReports(options.baseline) : null;
  if (options.baseline && Object.keys(baseline.reports).length === 0) {
    log(`warning: baseline ${baseline.dir} has no report.json files — grade it first with --skip-generate`);
  }

  for (let roundIndex = 1; roundIndex <= rounds; roundIndex += 1) {
    const roundLabel = `round-${timestampId()}`;
    const roundDir = path.join(crucibleRoot, roundLabel);
    await fs.mkdir(roundDir, { recursive: true });
    log(
      `${roundLabel} (${roundIndex}/${rounds}): model ${modelId}, concurrency ${concurrency}, ` +
        `spend cap $${maxSpendUsd.toFixed(2)}, courses: ${courses.map((c) => c.id).join(', ')}`,
    );

    // Start the preview server once per round, reused across courses; ONE
    // chromium instance shared by all lanes (each course gets its own context).
    const server = await startAppServer({ logPath: path.join(roundDir, 'server.log') });
    log(`server up at ${server.baseUrl} (dist ${server.didBuild ? 'rebuilt' : 'reused'})`);
    const browser = await chromium.launch({ headless: !headed });
    // Shared spend state: completed-course spend only (in-flight runs are
    // never killed — the guard gates new STARTS at pull time).
    const spendState = { spentUsd: 0, abortReason: null };
    let entries = [];
    try {
      entries = await runPool(courses, concurrency, async (course) => {
        const courseDir = path.join(roundDir, course.id);
        await fs.mkdir(courseDir, { recursive: true });
        // E3: course.json carries the provider so --calibrate can namespace
        // this run's findings (absent on pre-E1 dirs → openai by default).
        await writeJson(path.join(courseDir, 'course.json'), {
          ...course,
          provider,
          modelId,
          roundLabel,
          ...(llmShimUrl ? { llm: 'gemma-4-e2b (local shim)', llmShimUrl } : {}),
        });

        if (!spendState.abortReason) {
          const decision = spendGuardDecision({ spentUsd: spendState.spentUsd, maxSpendUsd });
          if (decision.abort) {
            spendState.abortReason = decision.reason;
            log(`SPEND CAP: ${decision.reason} — aborting remaining generations`);
          }
        }
        if (spendState.abortReason) {
          log(`  ${course.id}: skipped (spend cap)`);
          const runResult = {
            status: 'skipped (spend cap)',
            statusLabel: 'skipped (spend cap)',
            zipPath: null,
            digest: null,
            durationMs: 0,
            phase: 'skipped',
            spendUsd: 0,
            attemptCount: 0,
            error: spendState.abortReason,
          };
          const gradeResult = { graded: false, status: 'skipped (spend cap)', message: spendState.abortReason };
          await writeJson(path.join(courseDir, 'report.json'), {
            courseId: course.id,
            gradedAt: new Date().toISOString(),
            run: { status: runResult.status, durationMs: 0, phase: 'skipped', error: spendState.abortReason },
            normalized: gradeResult,
            raw: null,
          });
          return { course, runResult, gradeResult };
        }

        log(`  generating ${course.id} (${course.lessonCount} lessons)...`);
        const attempts = [];
        let runResult = null;
        for (let attempt = 1; attempt <= 2; attempt += 1) {
          runResult = await runCourseInBrowser({
            baseUrl: server.baseUrl,
            course,
            apiKey,
            modelId,
            modelName,
            outDir: courseDir,
            headed,
            browser,
            // WS-B3: seed 'coursemapper-authoring-mode' alongside the other
            // localStorage keys ('prose'/undefined seeds nothing — default).
            authoringMode: course.authoring,
            voiceMode: course.voice,
            // E1: seed the app's provider switch + provider-scoped key slot.
            provider,
            // --llm e2b: reroute api.openai.com to the local shim; on-device
            // generation is slow, so the per-course budget stretches to 45min.
            llmShimUrl,
            ...(llmShimUrl ? { overallTimeoutMs: 45 * 60_000 } : {}),
          });
          attempts.push(runResult);
          if (runResult.status === 'passed') break;
          await archiveFailedAttemptArtifacts(courseDir, attempt).catch(() => {});
          if (attempt === 1) {
            log(`  ${course.id}: attempt 1 failed during ${runResult.phase} — retrying once with a fresh page`);
          }
        }
        const attemptSummary = summarizeCourseAttempts(attempts);
        spendState.spentUsd += attemptSummary.spendUsd;
        runResult.statusLabel = attemptSummary.statusLabel;
        runResult.retried = attemptSummary.retried;
        runResult.attemptCount = attemptSummary.attemptCount;
        runResult.spendUsd = attemptSummary.spendUsd;
        runResult.attemptsDurationMs = attemptSummary.durationMs;
        log(
          `  ${course.id}: ${attemptSummary.statusLabel} in ${Math.round(attemptSummary.durationMs / 1000)}s` +
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
          baselineRaw: baseline?.reports?.[course.baseId || course.id]?.raw || null,
        });
        if (gradeResult.status === 'pending-grader') log(`  ${course.id}: ${GRADER_UNAVAILABLE_MESSAGE}`);
        // A5(4): cross-check the in-app self-grade against the Crucible's.
        const inAppScore = await readInAppScore(courseDir);
        // E7: the advisory judge (off by default). Its spend counts toward the
        // --max-spend accounting; it never gates and never changes exit code.
        // E1: the judge speaks OpenAI — on non-openai rounds judgeApiKey is the
        // separately-loaded OpenAI key (or null → judge disabled, advisory).
        const judge = await maybeJudgeCourse({
          options,
          grader: await loadGrader(),
          apiKey: judgeApiKey,
          courseDir,
          course,
        });
        if (Number.isFinite(judge?.spendUsd)) spendState.spentUsd += judge.spendUsd;

        // v0.14.9 C2: --voice ab — the voiced twin from the SAME generation.
        // The driver exported it after the quiet zip; grade and judge it as
        // its own entry (id `${course.id}--voiced`) so the round table and
        // the A/B verdict section carry both arms. The voice pass's own
        // spend (runVoicePass ledger) joins the round's spend accounting.
        let abTwin = null;
        if (course.voice === 'ab' && runResult.status === 'passed' && runResult.voiceAb?.voicedZipPath) {
          const voicedCourse = {
            ...course,
            id: `${course.id}--voiced`,
            baseId: course.baseId || course.id,
            abArm: 'voiced',
          };
          const voicedDir = path.join(roundDir, voicedCourse.id);
          await fs.mkdir(voicedDir, { recursive: true });
          await writeJson(path.join(voicedDir, 'course.json'), { ...voicedCourse, provider, modelId, roundLabel });
          const voiceSpend = Number(runResult.voiceAb.outcome?.spentUsd) || 0;
          spendState.spentUsd += voiceSpend;
          const voicedRun = {
            ...runResult,
            zipPath: runResult.voiceAb.voicedZipPath,
            spendUsd: voiceSpend,
            statusLabel: 'passed (voiced twin)',
            voiceAb: null,
          };
          const voicedFiles = await extractZip(voicedRun.zipPath, path.join(voicedDir, 'extracted'));
          log(`  ${voicedCourse.id}: extracted ${voicedFiles} files (same-generation voiced twin)`);
          const voicedGrade = await gradeAndReport({
            courseDir: voicedDir,
            course: voicedCourse,
            runResult: voicedRun,
            baselineRaw: null,
          });
          const voicedJudge = await maybeJudgeCourse({
            options,
            grader: await loadGrader(),
            apiKey: judgeApiKey,
            courseDir: voicedDir,
            course: voicedCourse,
          });
          if (Number.isFinite(voicedJudge?.spendUsd)) spendState.spentUsd += voicedJudge.spendUsd;
          abTwin = {
            course: voicedCourse,
            runResult: voicedRun,
            gradeResult: voicedGrade,
            inAppScore: null,
            judge: voicedJudge,
          };
        }
        return { course, runResult, gradeResult, inAppScore, judge, abTwin };
      });
      // Flatten the ab twins into the entry list — every downstream consumer
      // (tables, history, stranger findings) sees each arm as its own course.
      entries = entries.flatMap((entry) => (entry.abTwin ? [entry, { ...entry.abTwin }] : [entry]));
    } finally {
      await browser.close().catch(() => {});
      await server.stop().catch(() => {});
    }

    // WS-B3: stranger findings file separately (and never gate).
    await writeStrangerFindings(
      roundDir,
      entries.filter((entry) => isStranger(entry.course)),
    );
    await finishRound({
      roundDir,
      roundLabel,
      modelId,
      entries,
      baseline,
      spendAbortReason: spendState.abortReason,
      provider,
    });

    // v0.14.9 C2: the same-generation A/B verdict — appended to the round
    // report when --voice ab ran, so the de-confounded comparison reads in
    // one place (per-course arms + the tally against the bar).
    if (voice === 'ab') {
      const abSection = renderVoiceAbSection(pairVoiceAbEntries(entries));
      if (abSection) {
        await fs.appendFile(path.join(roundDir, 'ROUND_REPORT.md'), `\n${abSection}`).catch(() => {});
        const tally = abSection.split('\n').find((line) => line.startsWith('**Tally:**'));
        if (tally) log(`  voice A/B ${tally.replace(/\*\*/g, '')}`);
      }
    }
  }
}

// ── Main ───────────────────────────────────────────────────────────────────
// parseArgs consumes ONE value per flag; --diff takes two round dirs, so its
// second positional is read straight from argv.
function diffArgsFrom(argv, options) {
  const flagIndex = argv.indexOf('--diff');
  if (flagIndex >= 0) return [argv[flagIndex + 1], argv[flagIndex + 2]];
  const inlineIndex = argv.findIndex((arg) => arg.startsWith('--diff='));
  if (inlineIndex >= 0) return [argv[inlineIndex].slice('--diff='.length), argv[inlineIndex + 1]];
  return [typeof options.diff === 'string' ? options.diff : null, null];
}

async function main() {
  const argv = process.argv.slice(2);
  const options = parseArgs(argv);
  await fs.mkdir(crucibleRoot, { recursive: true });

  if (options.importBaseline) return importBaseline();
  if (options.dryRun) return dryRun(options);
  if (options.history) return showHistory();
  if (options.calibrate) return calibrate();
  if (options.diff) {
    const [specA, specB] = diffArgsFrom(argv, options);
    if (!specA || !specB || String(specA).startsWith('--') || String(specB).startsWith('--')) {
      throw new Error('--diff requires two round directory arguments: --diff <roundDirA> <roundDirB>');
    }
    return diffRounds(specA, specB);
  }
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
