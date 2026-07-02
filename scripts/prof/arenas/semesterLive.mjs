#!/usr/bin/env node
/**
 * scripts/prof/arenas/semesterLive.mjs — Arena A3, one live timeline (P2).
 * Modeled on scripts/syncEditProof.mjs (the standing sync harness): generate
 * through the real UI, plant an edit-survival marker, deal disruption events
 * from the seeded deck, apply each THROUGH the product (cell edit → sync
 * suggestion → apply), then download the ZIP, regrade it offline, and check
 * the invariants:
 *   - the instructor's marker survived every mutation (edit survival)
 *   - the regrade has zero P0s (post-mutation package integrity)
 *   - registered exams still carry exam content (this week's live bug class)
 *
 *   node scripts/prof/arenas/semesterLive.mjs --seed 7 --events 2
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, expect } from '@playwright/test';
import {
  loadApiKey,
  startAppServer,
  redactSecrets,
  repoRoot,
  ensurePackageReady,
  downloadZip,
} from '../../lib/crucibleBrowser.mjs';
import { dealTimeline } from '../semesterClock.mjs';

const PROMPT =
  'Introduction to Computer Science with Python, a 15-lesson introductory college course with weekly autograded quizzes and hands-on coding labs.';
const MARKER = 'EDIT-SURVIVAL-MARKER-7391';

function parseArgs(argv) {
  const args = { seed: 7, events: 2 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--seed') args.seed = Number(argv[++i] || 7);
    if (argv[i] === '--events') args.events = Number(argv[++i] || 2);
  }
  return args;
}

async function settleWorkspace(page) {
  // Close any drawer/overlay left from the previous sync and make sure the
  // course-map grid is the active surface before touching cells.
  await page.keyboard.press('Escape').catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});
  const mapTab = page.getByRole('button', { name: 'Course Map' }).first();
  if (await mapTab.isVisible().catch(() => false)) await mapTab.click().catch(() => {});
  await page.waitForTimeout(1500);
}

async function applyCellEdit(page, log, { lessonIndex, fieldKey, text }) {
  await settleWorkspace(page);
  const cellSpan = page
    .locator(`td[data-lesson-index="${lessonIndex}"][data-field-key="${fieldKey}"] span[role="button"]`)
    .first();
  await cellSpan.scrollIntoViewIfNeeded({ timeout: 30_000 }).catch(async () => {
    await page.evaluate(
      ({ lessonIndex, fieldKey }) => {
        const cell = globalThis.document.querySelector(
          `td[data-lesson-index="${lessonIndex}"][data-field-key="${fieldKey}"]`,
        );
        cell?.scrollIntoView({ block: 'center', inline: 'center' });
      },
      { lessonIndex, fieldKey },
    );
  });
  const original = ((await cellSpan.textContent()) || '').trim();
  await cellSpan.click();
  const editor = page.locator(`td[data-lesson-index="${lessonIndex}"][data-field-key="${fieldKey}"] textarea`);
  await editor.waitFor({ timeout: 10_000 });
  await editor.fill(`${original}\n${text}`);
  await editor.press('Enter');
  log(`edited L${lessonIndex}/${fieldKey}: + "${text.slice(0, 50)}…"`);
}

async function waitAndSync(page, log) {
  const editAt = Date.now();
  // In ready state the CTA stays "Download ZIP" — staleness is signaled by
  // the trust chips ("N stale") and per-tab badges, not CTA text.
  await page.waitForSelector('[data-testid="trust-chip-stale"]', { timeout: 180_000 });
  log(`stale chips appeared ${Math.round((Date.now() - editAt) / 1000)}s after the edit`);
  // Prefer the agent's bulk sync; fall back to the review-queue drawer.
  const syncAll = page.getByRole('button', { name: /sync all/i }).first();
  if (await syncAll.isVisible().catch(() => false)) {
    await syncAll.click();
  } else {
    await page.getByTestId('primary-cta').click();
    await page.getByTestId('review-queue-drawer').waitFor({ timeout: 10_000 });
    await page.getByTestId('review-queue-sync-now').first().click();
  }
  await page.waitForFunction(() => !globalThis.document.querySelector('[data-testid="trust-chip-stale"]'), undefined, {
    timeout: 240_000,
  });
  // Post-sync state varies (Quality N / Not graded / Fix required) and the
  // graded chip's testid only exists WHEN graded — assert on header text and
  // wait out any still-streaming resyncs. The offline ZIP regrade is the
  // authoritative verdict; this wait only ensures the app settled.
  await page.waitForFunction(() => !/is still streaming/.test(globalThis.document.body.textContent || ''), undefined, {
    timeout: 240_000,
  });
  await page.waitForFunction(
    () => /Quality \d+|Not graded|Fix required/.test(globalThis.document.body.textContent || ''),
    undefined,
    { timeout: 240_000 },
  );
  const chipText = await page.evaluate(
    () => (globalThis.document.body.textContent.match(/Quality \d+|Not graded|Fix required/) || [''])[0],
  );
  await page.keyboard.press('Escape').catch(() => {});
  log(`sync executed in ${Math.round((Date.now() - editAt) / 1000)}s; chip: "${chipText}"`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.join(repoRoot, 'verification-output', 'prof', `term-${startedAt}-semester-live`);
  await fs.mkdir(outDir, { recursive: true });
  const lines = [];
  const log = (msg) => {
    lines.push(`${new Date().toISOString()} ${msg}`);
    console.log(`[prof:a3] ${msg}`);
  };

  // Rows beyond the first screens are collapsed/virtualized in the preview
  // grid — the minimum timeline stays within rendered lessons (2..5). Deep-row
  // navigation is a P3 harness improvement, not a product finding.
  const timeline = dealTimeline({ seed: args.seed, count: args.events, lessonCount: 6 });
  log(`timeline (seed ${args.seed}): ${timeline.map((e) => `${e.class}@L${e.lessonIndex + 1}`).join(' → ')}`);

  const apiKey = await loadApiKey(undefined, 'openai');
  const server = await startAppServer({ logPath: path.join(outDir, 'server.log') });
  log(`server up at ${server.baseUrl}`);
  const browser = await chromium.launch({ headless: true });
  let status = 'failed';
  let phase = 'init';
  const survival = { markerPlanted: false, markerAfterEachEvent: [], regrade: null, examIntegrity: null };
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('pageerror', (err) => lines.push(`PAGEERROR: ${redactSecrets(err.stack || String(err))}`));
    await page.addInitScript(
      ({ key }) => {
        localStorage.clear();
        sessionStorage.clear();
        localStorage.setItem('coursemapper-provider', 'openai');
        localStorage.setItem('coursemapper-apikey', key);
        localStorage.setItem('coursemapper-apikey-provider:openai', key);
        localStorage.setItem('coursemapper-modelid', 'gpt-5.4-mini');
        localStorage.setItem('coursemapper-modelname', 'GPT-5.4 mini');
      },
      { key: apiKey },
    );

    phase = 'generate';
    await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Connected').first()).toBeVisible({ timeout: 120_000 });
    await page.getByLabel('Describe your course').fill(PROMPT);
    await page.getByRole('button', { name: 'Generate with defaults' }).click();
    await page.getByTestId('workspace-shell').waitFor({ timeout: 600_000 });
    await page.getByTestId('workspace-quality-chip').waitFor({ timeout: 420_000 });
    log('generation ready');

    phase = 'plant-marker';
    await applyCellEdit(page, log, { lessonIndex: 2, fieldKey: 'topicSection', text: MARKER });
    await waitAndSync(page, log);
    survival.markerPlanted = true;

    for (const event of timeline) {
      phase = `event-${event.class}`;
      log(`WEEK ${event.week}: ${event.description} (stresses: ${event.stresses})`);
      await applyCellEdit(page, log, {
        lessonIndex: event.lessonIndex,
        fieldKey: event.edit.fieldKey,
        text: event.edit.text,
      });
      await waitAndSync(page, log);
      const markerAlive = await page.evaluate(
        (marker) => (globalThis.localStorage.getItem('coursemapper-project') || '').includes(marker),
        MARKER,
      );
      survival.markerAfterEachEvent.push({ event: event.class, markerAlive });
      log(`edit survival after ${event.class}: marker ${markerAlive ? 'ALIVE' : 'LOST'}`);
      if (!markerAlive) throw new Error(`edit-survival invariant broken after ${event.class}`);
    }

    phase = 'download';
    // The crucible's proven flow: run the finish pass if the action reads
    // "Finish package", then download.
    const deadline = Date.now() + 600_000;
    const remaining = (cap) => Math.max(5_000, Math.min(cap, deadline - Date.now()));
    await ensurePackageReady(page, remaining);
    const zipPath = path.join(outDir, 'semester-final.zip');
    await downloadZip(page, zipPath, remaining);
    log(`final package downloaded`);

    phase = 'regrade';
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(await fs.readFile(zipPath));
    const fileMap = {};
    for (const [name, entry] of Object.entries(zip.files)) {
      if (!entry.dir) fileMap[name] = await entry.async('uint8array');
    }
    const { grade, extractPackage } = await import(
      pathToFileURL(path.join(repoRoot, 'tests/lib/deepQualityGrader.js')).href
    );
    const { createMemoryFileProvider } = await import(
      pathToFileURL(path.join(repoRoot, 'src/lib/quality/fileProviders.js')).href
    );
    const provider = createMemoryFileProvider(fileMap);
    const graded = await grade({ fileProvider: provider, course: { title: PROMPT } });
    const findings = graded.findings || [];
    const p0 = findings.filter((f) => f.severity === 'P0');
    const examFindings = p0.filter((f) => /exam/i.test(f.detail));
    const overallScore =
      typeof graded.overall === 'object'
        ? (graded.overall?.score ?? graded.overall?.overall ?? null)
        : (graded.overall ?? null);
    survival.regrade = { overall: overallScore, p0: p0.length };
    survival.examIntegrity = examFindings.length === 0;
    log(
      `post-mutation regrade: ${JSON.stringify(survival.regrade.overall)} · P0 ${p0.length} · exam integrity ${survival.examIntegrity ? 'HELD' : 'BROKEN'}`,
    );
    // The marker must be IN the final exported package, not just app state.
    const extractedFinal = await extractPackage(createMemoryFileProvider(fileMap));
    const markerInPackage = extractedFinal.files.some((file) => (file.text || '').includes(MARKER));
    log(`marker in exported package: ${markerInPackage ? 'YES' : 'NO'}`);

    status =
      p0.length === 0 && survival.markerAfterEachEvent.every((e) => e.markerAlive) && markerInPackage
        ? 'passed'
        : 'failed';
    survival.markerInPackage = markerInPackage;
  } catch (error) {
    log(`FAILED during ${phase}: ${redactSecrets(error.stack || String(error)).split('\n')[0]}`);
    try {
      const page = (await browser.contexts())[0]?.pages()?.[0];
      if (page) {
        await page.screenshot({ path: path.join(outDir, `failure-${phase}.png`), fullPage: true });
        const dump = await page.evaluate(() => globalThis.localStorage.getItem('coursemapper-project'));
        if (dump) await fs.writeFile(path.join(outDir, `project-at-failure-${phase}.json`), dump);
      }
    } catch {
      /* forensics are best-effort */
    }
  } finally {
    await fs.writeFile(
      path.join(outDir, 'timeline-result.json'),
      JSON.stringify({ timeline, survival, status }, null, 2),
    );
    await fs.writeFile(path.join(outDir, 'console.log'), lines.join('\n')).catch(() => {});
    await browser.close().catch(() => {});
    await server.stop().catch(() => {});
  }
  log(`A3 timeline result: ${status}`);
  process.exit(status === 'passed' ? 0 : 1);
}

main();
