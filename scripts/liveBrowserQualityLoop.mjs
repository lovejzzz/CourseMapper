#!/usr/bin/env node
import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { auditCourseMaterialsZip } from '../tests/lib/exportQualityAudit.js';

const execFileAsync = promisify(execFile);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const defaultApiEnvPath = path.join(repoRoot, 'API-dontComit', 'api.ev');
const expectedZipFolders = [
  'Course Map',
  'Syllabus',
  'Lesson Plans',
  'Slide Decks',
  'Assignment Briefs',
  'Rubrics',
  'Discussion Prompts',
  'Quiz & Exam Bank',
  'Study Guides',
  'Course FAQ',
];

const coursePool = [
  {
    title: 'Data Analytics for Decision-Making',
    prompt:
      'Data Analytics for Decision-Making, 15-week undergraduate course with spreadsheet labs, dashboard critiques, statistics quizzes, and a final analytics report. Covers data cleaning, descriptive statistics, visualization, SQL basics, spreadsheet modeling, correlation, regression, dashboard design, uncertainty, and communicating findings to nontechnical audiences.',
  },
  {
    title: 'Community Health Program Evaluation',
    prompt:
      'Community Health Program Evaluation, 12-week graduate public health course with needs assessment, logic model studios, stakeholder memo drafts, survey design labs, and a final evaluation plan. Covers evaluation questions, indicators, data collection, implementation fidelity, equity, ethics, analysis basics, and reporting findings to community partners.',
  },
  {
    title: 'Intro to Psychology',
    prompt:
      'Introduction to Psychology, 15-week undergraduate survey course with weekly lectures, discussion sections, low-stakes quizzes, a midterm, and a final applied reflection. Covers history of psychology, research methods, biological bases of behavior, sensation and perception, learning, memory, cognition, development, social psychology, and abnormal psychology.',
  },
  {
    title: 'UX Design Studio',
    prompt:
      'User Experience Design Studio, 12-week project-based undergraduate course with critique sessions, design journals, usability testing labs, prototype reviews, and a final portfolio case study. Covers design research, personas, journey maps, information architecture, wireframing, interaction patterns, accessibility, usability testing, and design handoff.',
  },
  {
    title: 'Spanish for Healthcare Professionals',
    prompt:
      'Spanish for Healthcare Professionals, 8-week skills course with role-play clinics, vocabulary practice, cultural humility reflections, oral proficiency checks, and a final patient-interview simulation. Covers intake questions, symptoms, medication instructions, family history, pain description, consent language, interpreter collaboration, and respectful patient communication.',
  },
  {
    title: 'Startup Finance and Venture Strategy',
    prompt:
      'Startup Finance and Venture Strategy, 6-week executive certificate course with async finance primers, live case workshops, valuation spreadsheets, investor memo practice, and a capstone pitch deck. Covers unit economics, runway, fundraising stages, cap tables, term sheets, valuation methods, scenario planning, and board-level financial storytelling.',
  },
  {
    title: 'Organic Chemistry Laboratory',
    prompt:
      'Organic Chemistry Laboratory, 8-week in-person undergraduate lab course with pre-lab checks, bench experiments, lab notebook grading, safety briefings, and formal lab reports. Covers purification, chromatography, spectroscopy, substitution and elimination reactions, synthesis planning, yield analysis, and lab safety practices.',
  },
  {
    title: 'Social Work Practice with Families',
    prompt:
      'Social Work Practice with Families, 14-week graduate seminar with case consultation, role-play labs, genogram exercises, reflective supervision notes, and a final family intervention plan. Covers engagement, assessment, family systems theory, trauma-informed practice, child welfare contexts, cultural humility, ethics, and documentation.',
  },
  {
    title: 'Applied Machine Learning Lab',
    prompt:
      'Applied Machine Learning Lab, 10-week graduate technical course with Python notebooks, weekly dataset labs, model critique discussions, and a final predictive modeling project. Covers supervised learning, train/test splits, regression, classification, decision trees, random forests, neural networks, evaluation metrics, overfitting, fairness, and model documentation.',
  },
  {
    title: 'Climate Justice and Community Resilience',
    prompt:
      'Climate Justice and Community Resilience, 7-week intensive seminar with policy labs, community case studies, environmental justice mapping, and a final resilience action plan. Covers climate science basics, environmental racism, adaptation planning, disaster recovery, energy transitions, Indigenous sovereignty, public participation, and climate policy tradeoffs.',
  },
];

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

function getCourseCount(options) {
  if (options.courses) return Math.max(1, Math.min(coursePool.length, Number(options.courses) || 1));
  if (options.profile === 'weekly') return 10;
  if (options.profile === 'smoke') return 1;
  return 3;
}

function selectCourses(count, profile) {
  if (profile === 'smoke') {
    const smokeStart = Math.max(
      0,
      coursePool.findIndex((course) => course.title === 'Startup Finance and Venture Strategy'),
    );
    return Array.from({ length: count }, (_, index) => coursePool[(smokeStart + index) % coursePool.length]);
  }
  const dayOffset = Math.floor(Date.now() / 86_400_000) % coursePool.length;
  const selected = [];
  for (let index = 0; index < count; index += 1) {
    selected.push(coursePool[(dayOffset + index) % coursePool.length]);
  }
  return selected;
}

function redact(value) {
  return String(value || '').replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[redacted-openai-key]');
}

async function readApiKey(apiEnvPath) {
  const fromEnv = process.env.COURSEMAPPER_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (fromEnv?.trim()) return fromEnv.trim();

  const content = await fs.readFile(apiEnvPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/i);
    const key = match ? match[1] : '';
    let value = match ? match[2] : trimmed;
    value = value.trim().replace(/^['"]|['"]$/g, '');
    if ((/OPENAI|API_KEY/i.test(key) || value.startsWith('sk-')) && value.startsWith('sk-')) return value;
  }
  throw new Error(`No OpenAI API key found in ${apiEnvPath}`);
}

async function runGit(args) {
  const { stdout } = await execFileAsync('git', args, {
    cwd: repoRoot,
    maxBuffer: 1024 * 1024,
  });
  return stdout.trim();
}

async function verifyGitGate(skipGitGate) {
  if (skipGitGate) {
    const branch = await runGit(['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => 'unknown');
    const commit = await runGit(['rev-parse', '--short', 'HEAD']).catch(() => 'unknown');
    const aheadOfOriginMain = Number(await runGit(['rev-list', '--count', 'origin/main..HEAD']).catch(() => 0));
    const behindOriginMain = Number(await runGit(['rev-list', '--count', 'HEAD..origin/main']).catch(() => 0));
    return {
      skipped: true,
      branch,
      commit,
      base: 'origin/main',
      aheadOfOriginMain,
      behindOriginMain,
    };
  }

  const branch = await runGit(['rev-parse', '--abbrev-ref', 'HEAD']);
  const status = await runGit(['status', '--short']);
  await runGit(['fetch', 'origin', branch]);
  const upstream = `origin/${branch}`;
  const ahead = Number(await runGit(['rev-list', '--count', `${upstream}..HEAD`]));
  const behind = Number(await runGit(['rev-list', '--count', `HEAD..${upstream}`]));

  if (status || ahead > 0 || behind > 0) {
    throw new Error(
      [
        'Git gate blocked the browser-quality loop.',
        status ? `Dirty worktree:\n${status}` : '',
        ahead > 0 ? `Local branch is ${ahead} commit(s) ahead of ${upstream}.` : '',
        behind > 0 ? `Local branch is ${behind} commit(s) behind ${upstream}.` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }

  return {
    skipped: false,
    branch,
    upstream,
    commit: await runGit(['rev-parse', '--short', 'HEAD']),
  };
}

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

async function startDevServer({ port, logPath }) {
  const output = await fs.open(logPath, 'a');
  const child = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: repoRoot,
    env: { ...process.env, BROWSER: 'none' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => output.write(redact(chunk)));
  child.stderr.on('data', (chunk) => output.write(redact(chunk)));

  const closeOutput = async () => {
    try {
      await output.close();
    } catch {
      // The stream may already be closed if Vite exits while we are cleaning up.
    }
  };

  child.once('exit', () => {
    closeOutput();
  });

  await waitForUrl(`http://127.0.0.1:${port}/`, 60_000);

  return {
    baseUrl: `http://127.0.0.1:${port}/`,
    async stop() {
      if (!child.killed) child.kill('SIGTERM');
      await closeOutput();
    },
  };
}

async function safeText(locator) {
  try {
    if ((await locator.count()) === 0) return '';
    return ((await locator.first().innerText({ timeout: 2_000 })) || '').trim();
  } catch {
    return '';
  }
}

async function waitForExportIdle(page, timeoutMs = 240_000) {
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

export async function waitForExportSidePanel(page, timeoutMs = 600_000) {
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

export async function waitForReadinessPanel(page, timeoutMs = 600_000) {
  const panel = page.getByTestId('readiness-panel');
  try {
    await panel.waitFor({ timeout: timeoutMs });
    return panel;
  } catch (error) {
    const exportState = await safeText(page.getByTestId('export-side-panel'));
    throw new Error(
      `Readiness panel did not appear after ${Math.round(timeoutMs / 1000)}s. ${
        exportState ? `Export state:\n${exportState}` : 'No export-panel state was available.'
      }\n${error.message || error}`,
    );
  }
}

async function ensurePackageReady(page) {
  await waitForExportSidePanel(page);
  await page.getByTestId('export-scope-all').click();
  await waitForReadinessPanel(page);

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
      await waitForExportIdle(page);
      continue;
    }

    if (/Finish package/i.test(zipLabel)) {
      await page.getByTestId('export-download-zip').click();
      await waitForExportIdle(page);
      continue;
    }

    break;
  }

  const panelText = await safeText(page.getByTestId('export-side-panel'));
  throw new Error(`Package was not ready to download after finalization.\n${panelText}`);
}

async function downloadZip(page, destinationPath) {
  const zipButton = page.getByTestId('export-download-zip');
  await expect(zipButton).toContainText(/Download ZIP/, { timeout: 30_000 });
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 120_000 }), zipButton.click()]);
  const failure = await download.failure();
  if (failure) throw new Error(failure);
  await download.saveAs(destinationPath);
  const stat = await fs.stat(destinationPath);
  if (stat.size < 10_000) throw new Error(`Downloaded ZIP is unexpectedly small: ${stat.size} bytes`);
  return {
    suggestedFilename: download.suggestedFilename(),
    path: destinationPath,
    size: stat.size,
  };
}

async function runCourse({ browser, baseUrl, course, index, runDir, apiKey, modelId, modelName, headed }) {
  const courseSlug = course.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const courseDir = path.join(runDir, `${String(index + 1).padStart(2, '0')}-${courseSlug}`);
  await fs.mkdir(courseDir, { recursive: true });
  const progress = {
    title: course.title,
    phase: 'created',
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const writeProgress = async (phase, extra = {}) => {
    progress.phase = phase;
    progress.updatedAt = new Date().toISOString();
    Object.assign(progress, extra);
    await fs.writeFile(path.join(courseDir, 'progress.json'), `${JSON.stringify(progress, null, 2)}\n`);
  };
  await writeProgress('created');
  const browserLog = [];
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: headed ? { width: 1440, height: 960 } : { width: 1500, height: 1000 },
  });
  const page = await context.newPage();
  page.on('console', (message) => {
    browserLog.push(`${message.type()}: ${redact(message.text())}`);
  });
  page.on('pageerror', (error) => {
    browserLog.push(`pageerror: ${redact(error.message)}`);
  });

  try {
    await writeProgress('loading-landing');
    await page.addInitScript(
      ({ key, selectedModelId, selectedModelName }) => {
        localStorage.clear();
        sessionStorage.clear();
        localStorage.setItem('coursemapper-provider', 'openai');
        localStorage.setItem('coursemapper-apikey', key);
        localStorage.setItem('coursemapper-apikey-provider:openai', key);
        localStorage.setItem('coursemapper-modelid', selectedModelId);
        localStorage.setItem('coursemapper-modelname', selectedModelName);
      },
      { key: apiKey, selectedModelId: modelId, selectedModelName: modelName },
    );

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await writeProgress('validating-provider');
    await expect(page.getByText('Connected').first()).toBeVisible({ timeout: 120_000 });
    await writeProgress('provider-connected');
    await page.getByLabel('Describe your course').fill(course.prompt);
    const landingContinue = page.getByRole('button', { name: /^Continue$/ }).last();
    await expect(landingContinue).toBeEnabled({ timeout: 10_000 });
    await landingContinue.click();

    await writeProgress('selecting-package-contents');
    await page.getByTestId('feature-select-continue').waitFor({ timeout: 60_000 });
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

    await writeProgress('configuring-generation');
    const generateWorkspace = page.getByRole('button', { name: /Generate workspace/i }).last();
    await expect(generateWorkspace).toBeEnabled({ timeout: 60_000 });
    await generateWorkspace.click();

    await writeProgress('generating-workspace');
    await page.getByTestId('workspace-shell').waitFor({ timeout: 600_000 });
    await writeProgress('workspace-ready');
    await waitForExportSidePanel(page);
    await writeProgress('finalizing-package');
    await ensurePackageReady(page);

    await writeProgress('downloading-zip');
    const zipPath = path.join(courseDir, `${courseSlug || 'course'}-package.zip`);
    const download = await downloadZip(page, zipPath);
    await writeProgress('auditing-zip', { zipPath });
    const audit = await auditCourseMaterialsZip(zipPath, {
      expectedFolders: expectedZipFolders,
      minSpeakerNoteWords: 20,
      maxVisibleSlideWords: 120,
    });
    if (audit.issues.length > 0) {
      throw new Error(`ZIP audit found ${audit.issues.length} issue(s):\n${audit.issues.join('\n')}`);
    }

    await page.screenshot({ path: path.join(courseDir, 'workspace-ready.png'), fullPage: true });
    await fs.writeFile(path.join(courseDir, 'browser-console.log'), browserLog.join('\n'));
    await writeProgress('passed', { finishedAt: new Date().toISOString() });
    return {
      status: 'passed',
      title: course.title,
      zip: download,
      auditIssueCount: 0,
      consoleIssueCount: browserLog.filter((line) => /error|pageerror/i.test(line)).length,
    };
  } catch (error) {
    await page.screenshot({ path: path.join(courseDir, 'failure.png'), fullPage: true }).catch(() => {});
    await fs.writeFile(path.join(courseDir, 'browser-console.log'), browserLog.join('\n')).catch(() => {});
    await writeProgress('failed', { finishedAt: new Date().toISOString(), error: redact(error.message || '') }).catch(
      () => {},
    );
    return {
      status: 'failed',
      title: course.title,
      phase: progress.phase,
      error: redact(error.stack || error.message || String(error)),
      artifactDir: courseDir,
    };
  } finally {
    await context.close().catch(() => {});
  }
}

function formatReport(summary) {
  const lines = [
    `# Browser Quality Loop - ${summary.status}`,
    '',
    `- Started: ${summary.startedAt}`,
    `- Finished: ${summary.finishedAt}`,
    `- Profile: ${summary.profile}`,
    `- Commit: ${summary.git?.commit || 'unknown'}`,
    `- Courses: ${summary.results.length}`,
    `- Passed: ${summary.results.filter((result) => result.status === 'passed').length}`,
    `- Failed: ${summary.results.filter((result) => result.status === 'failed').length}`,
    '',
    '## Results',
    '',
  ];

  for (const result of summary.results) {
    if (result.status === 'passed') {
      lines.push(`- PASS ${result.title}: ${path.relative(repoRoot, result.zip.path)} (${result.zip.size} bytes)`);
    } else {
      lines.push(
        `- FAIL ${result.title}${result.phase ? ` (${result.phase})` : ''}: ${
          result.error?.split('\n')[0] || 'Unknown error'
        }`,
      );
      lines.push(`  - Artifacts: ${path.relative(repoRoot, result.artifactDir)}`);
    }
  }

  if (summary.error) {
    lines.push('', '## Run Error', '', '```', summary.error, '```');
  }

  return `${lines.join('\n')}\n`;
}

async function writeSummary(runDir, summary) {
  const completed = {
    ...summary,
    finishedAt: new Date().toISOString(),
  };
  await fs.writeFile(path.join(runDir, 'summary.json'), `${JSON.stringify(completed, null, 2)}\n`);
  await fs.writeFile(path.join(runDir, 'report.md'), formatReport(completed));
}

function isWritableDirectoryError(error) {
  return ['EACCES', 'EPERM', 'EROFS'].includes(error?.code);
}

export async function prepareRunDirectory(outputRoot, runId, options = {}) {
  const requestedRunDir = path.join(outputRoot, runId);
  try {
    await fs.mkdir(requestedRunDir, { recursive: true });
    return {
      outputRoot,
      runDir: requestedRunDir,
      fallbackUsed: false,
      requestedRunDir,
    };
  } catch (error) {
    if (!isWritableDirectoryError(error)) throw error;

    const fallbackRoot = path.resolve(
      options.fallbackRoot || path.join(os.tmpdir(), 'coursemapper-verification-output', 'cron-browser'),
    );
    const fallbackRunDir = path.join(fallbackRoot, runId);
    await fs.mkdir(fallbackRunDir, { recursive: true });
    return {
      outputRoot: fallbackRoot,
      runDir: fallbackRunDir,
      fallbackUsed: true,
      requestedRunDir,
      fallbackReason: `${error.code}: ${error.message}`,
    };
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const profile = args.profile || 'nightly';
  const courseCount = getCourseCount(args);
  const selectedCourses = selectCourses(courseCount, profile);
  const outputRoot = path.resolve(repoRoot, args.out || path.join('verification-output', 'cron-browser'));
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const apiEnvPath = path.resolve(repoRoot, args.apiEnv || process.env.COURSEMAPPER_API_ENV || defaultApiEnvPath);
  const modelId = args.model || process.env.COURSEMAPPER_CRON_MODEL || 'gpt-5.4-mini';
  const modelName = args.modelName || process.env.COURSEMAPPER_CRON_MODEL_NAME || 'GPT-5.4 mini';
  const headed = Boolean(args.headed || args.headful);
  const runOutput = await prepareRunDirectory(outputRoot, runId);
  const runDir = runOutput.runDir;
  const summary = {
    status: 'running',
    startedAt: new Date().toISOString(),
    profile,
    modelId,
    outputRoot: runOutput.outputRoot,
    requestedOutputRoot: outputRoot,
    outputFallback: runOutput.fallbackUsed
      ? {
          requestedRunDir: runOutput.requestedRunDir,
          fallbackReason: runOutput.fallbackReason,
        }
      : null,
    selectedCourses: selectedCourses.map((course) => course.title),
    git: null,
    results: [],
  };

  await writeSummary(runDir, summary);

  let server = null;
  let browser = null;
  try {
    summary.git = await verifyGitGate(Boolean(args.skipGitGate));
    const apiKey = await readApiKey(apiEnvPath);
    const port = await findFreePort(Number(args.port || 5173));
    server = await startDevServer({ port, logPath: path.join(runDir, 'vite.log') });
    browser = await chromium.launch({ headless: !headed });

    for (let index = 0; index < selectedCourses.length; index += 1) {
      const result = await runCourse({
        browser,
        baseUrl: server.baseUrl,
        course: selectedCourses[index],
        index,
        runDir,
        apiKey,
        modelId,
        modelName,
        headed,
      });
      summary.results.push(result);
      await writeSummary(runDir, { ...summary, status: 'running' });
      if (result.status === 'failed' && args.stopOnFailure !== 'false') break;
    }

    const failures = summary.results.filter((result) => result.status === 'failed');
    summary.status = failures.length > 0 || summary.results.length !== selectedCourses.length ? 'failed' : 'passed';
    await writeSummary(runDir, summary);
    if (summary.status !== 'passed') process.exitCode = 1;
  } catch (error) {
    summary.status = 'failed';
    summary.error = redact(error.stack || error.message || String(error));
    await writeSummary(runDir, summary);
    process.exitCode = 1;
  } finally {
    await browser?.close().catch(() => {});
    await server?.stop().catch(() => {});
  }

  const reportPath = path.join(runDir, 'report.md');
  console.log(`Browser quality loop ${summary.status}: ${reportPath}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
