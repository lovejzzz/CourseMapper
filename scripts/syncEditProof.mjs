// syncEditProof.mjs — v0.15 live proof: edit → sync suggestion → queue
// "Sync now" → re-grade → the downloaded ZIP carries the edit.
//
// Drives the PRODUCTION build (vite preview via startAppServer) with real
// Playwright input events — the dev-server HMR confounds that muddied the
// first in-browser attempt cannot occur here. Key seeding follows the
// crucible pattern (Node-side read, addInitScript) so the key never
// transits any transcript or HTTP-served file.
//
//   node scripts/syncEditProof.mjs            # ~$0.12, one generation
//
// Artifacts → verification-output/sync-proof/: console.log, screenshots,
// quiet/edited zips. Exit 0 only when EVERY step held.
import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadApiKey, startAppServer, redactSecrets, repoRoot } from './lib/crucibleBrowser.mjs';

const outDir = path.join(repoRoot, 'verification-output', 'sync-proof');
const PROMPT =
  'Beginning Korean I, a 12-lesson introductory college course on the Korean language: Hangul reading and writing, basic pronunciation, greetings and introductions, numbers and counters, particles, present-tense verb conjugation, honorifics and politeness levels, asking questions, food and ordering, daily routines, simple past tense, and a final conversation project.';
const EDIT_MARKER = 'with market bargaining practice';

const consoleLines = [];
function log(message) {
  console.log(`[sync-proof] ${message}`);
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  const apiKey = await loadApiKey(undefined, 'openai');
  const server = await startAppServer({ logPath: path.join(outDir, 'server.log') });
  log(`server up at ${server.baseUrl} (dist ${server.didBuild ? 'rebuilt' : 'reused'})`);
  const browser = await chromium.launch({ headless: true });
  let status = 'failed';
  let phase = 'init';
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('console', (msg) => consoleLines.push(`${msg.type()}: ${redactSecrets(msg.text())}`));
    page.on('pageerror', (err) => consoleLines.push(`PAGEERROR: ${redactSecrets(err.stack || String(err))}`));
    await page.addInitScript(
      ({ key }) => {
        if (localStorage.getItem('coursemapper-apikey')) return;
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
    const quickStart = page.getByRole('button', { name: 'Generate with defaults' });
    await expect(quickStart).toBeVisible({ timeout: 15_000 });
    await quickStart.click();
    await page.getByTestId('workspace-shell').waitFor({ timeout: 600_000 });
    // Ready = the morphing CTA exists (review or download state) and the
    // quality chip carries a grade.
    await page.getByTestId('workspace-quality-chip').waitFor({ timeout: 420_000 });
    log('generation ready (quality chip rendered)');
    await page.screenshot({ path: path.join(outDir, '1-ready.png'), fullPage: false });

    const ctaBefore =
      (await page
        .getByTestId('primary-cta')
        .textContent()
        .catch(() => '')) || '';
    const headlineBefore = Number((ctaBefore.match(/Review (\d+)/) || [])[1] || 0);
    log(`CTA before edit: "${ctaBefore.trim()}" (headline ${headlineBefore})`);

    phase = 'edit';
    const cellSpan = page
      .locator('td[data-lesson-index="2"][data-field-key="topicSection"] span[role="button"]')
      .first();
    const originalTopic = ((await cellSpan.textContent()) || '').trim();
    await cellSpan.click();
    const editor = page.locator('td[data-lesson-index="2"][data-field-key="topicSection"] textarea');
    await editor.waitFor({ timeout: 10_000 });
    await editor.fill(`${originalTopic} ${EDIT_MARKER}`);
    await editor.press('Enter');
    log(`edited topic cell: "${originalTopic}" + marker`);

    phase = 'suggestion';
    // The 2s debounce → recompile-diff → chat message → durable queue source.
    // Wait for the count to actually CHANGE — /Review \d+/ matches the
    // pre-edit text instantly (the first run of this proof failed on that).
    const editAt = Date.now();
    let changed = false;
    for (let tick = 0; tick < 36 && !changed; tick += 1) {
      await page.waitForTimeout(5_000);
      const text = (
        (await page
          .getByTestId('primary-cta')
          .textContent()
          .catch(() => '')) || ''
      ).trim();
      log(`t+${Math.round((Date.now() - editAt) / 1000)}s CTA: "${text}"`);
      changed = text !== ctaBefore.trim();
    }
    if (!changed) throw new Error('CTA never changed within 180s of the edit');
    const ctaAfter = (await page.getByTestId('primary-cta').textContent()) || '';
    const headlineAfter = Number((ctaAfter.match(/Review (\d+)/) || [])[1] || 0);
    log(`CTA after edit: "${ctaAfter.trim()}" (headline ${headlineAfter})`);
    if (!(headlineAfter > headlineBefore)) {
      throw new Error(
        `headline did not rise with pending syncs (before ${headlineBefore}, after ${headlineAfter}) — the durable sync source is not feeding the queue`,
      );
    }
    await page.screenshot({ path: path.join(outDir, '2-suggestion.png'), fullPage: false });

    phase = 'drawer';
    await page.getByTestId('primary-cta').click();
    await page.getByTestId('review-queue-drawer').waitFor({ timeout: 10_000 });
    const syncClass = page.getByTestId('review-queue-class-sync');
    await syncClass.waitFor({ timeout: 5_000 });
    const syncItems = await syncClass.getByTestId('review-queue-item').count();
    log(`drawer open: sync class carries ${syncItems} item(s)`);
    await page.screenshot({ path: path.join(outDir, '3-drawer.png'), fullPage: false });

    phase = 'sync';
    await page.getByTestId('review-queue-sync-now').first().click();
    // Sync executes → post-sync finish pass re-grades (source:'sync').
    await page.waitForFunction(() => !globalThis.document.querySelector('[data-testid="trust-chip-stale"]'), {
      timeout: 240_000,
    });
    await expect(page.getByTestId('workspace-quality-chip')).toContainText(/Quality \d+/, { timeout: 240_000 });
    log('sync executed; stale chips cleared; package re-graded');
    await page.screenshot({ path: path.join(outDir, '4-after-sync.png'), fullPage: false });

    phase = 'verify-state';
    const stateProbe = await page.evaluate((marker) => {
      const snap = globalThis.__COURSEMAPPER_WORKSPACE_SNAPSHOT__;
      const hits = [];
      for (const [featureId, entry] of Object.entries(snap?.deliverables || {})) {
        const text = JSON.stringify(entry?.data || {});
        if (text.includes(marker)) hits.push(featureId);
      }
      const cell = globalThis.document.querySelector('td[data-lesson-index="2"][data-field-key="topicSection"]');
      return {
        mapHasMarker: JSON.stringify(snap?.courseMap || {}).includes(marker),
        snapshotAgeMs: snap?.savedAt ? Date.now() - snap.savedAt : null,
        cellDomHasMarker: Boolean(cell && cell.textContent.includes(marker)),
        localStorageHasMarker: (globalThis.localStorage.getItem('coursemapper-project') || '').includes(marker),
        deliverablesWithMarker: hits,
      };
    }, EDIT_MARKER);
    log(`state probe: ${JSON.stringify(stateProbe)}`);
    const stateOk = stateProbe.cellDomHasMarker && stateProbe.deliverablesWithMarker.length >= 0;
    if (!stateProbe.cellDomHasMarker) {
      log('WARNING: the DOM cell lost the marker after sync — collecting the zip anyway for evidence');
    }

    phase = 'download';
    const zipButton = page.getByTestId('export-download-zip');
    await expect(zipButton).toBeEnabled({ timeout: 60_000 });
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 180_000 }), zipButton.click()]);
    const zipPath = path.join(outDir, 'edited-package.zip');
    await download.saveAs(zipPath);
    const stat = await fs.stat(zipPath);
    log(`zip downloaded: ${stat.size} bytes → ${zipPath}`);

    status = stateOk && stateProbe.cellDomHasMarker ? 'passed' : 'failed';
  } catch (error) {
    log(`FAILED during ${phase}: ${redactSecrets(error.stack || String(error))}`);
    // Diagnostics: which half is broken — suggestion production or queue?
    try {
      const page = (await browser.contexts())[0]?.pages()?.[0];
      if (page) {
        await page.screenshot({ path: path.join(outDir, `failure-${phase}.png`), fullPage: true });
        const diag = await page.evaluate(() => {
          const snap = globalThis.__COURSEMAPPER_WORKSPACE_SNAPSHOT__ || {};
          return {
            chatRoles: (snap.chatHistory || []).map((m) => `${m.role}:${m.status || ''}`),
            staleFeatures: Object.entries(snap.deliverables || {})
              .filter(([, v]) => v?.stale)
              .map(([k]) => k),
            syncCardInDom: globalThis.document.body.textContent.includes('Need Syncing'),
            syncAllStaleButton: [...globalThis.document.querySelectorAll('button')].some((b) =>
              /Sync all stale/.test(b.textContent),
            ),
          };
        });
        log(`diagnostics: ${JSON.stringify(diag)}`);
      }
    } catch (diagErr) {
      log(`diagnostics failed: ${diagErr?.message || diagErr}`);
    }
  } finally {
    await fs.writeFile(path.join(outDir, 'console.log'), consoleLines.join('\n')).catch(() => {});
    await browser.close().catch(() => {});
    await server.stop().catch(() => {});
  }
  log(`result: ${status}`);
  process.exit(status === 'passed' ? 0 : 1);
}

main();
