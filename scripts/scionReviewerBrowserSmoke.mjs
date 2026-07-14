#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { chromium } from 'playwright';

import {
  buildScionBlindReviewPacket,
  validateScionBlindReview,
  validateScionFounderReview,
} from './scionBlindReviewPacket.mjs';

const item = {
  q: 'Which observation most directly supports revising the navigation?',
  op: [
    'Three participants fail the same labeled task',
    'One participant likes the colors',
    'The designer prefers the current version',
    'A stakeholder requests a larger logo',
  ],
  ai: 0,
  ex: 'Repeated task failure is direct behavioral evidence; the other observations do not establish a navigation breakdown.',
};

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-review-browser-smoke-'));
  const source = path.join(root, 'source.jsonl');
  const outputDir = path.join(root, 'packet');
  let browser;
  try {
    await fs.writeFile(
      source,
      `${JSON.stringify({
        kind: 'mc-item',
        prompt: 'Write one evidence-bearing navigation question.',
        left: JSON.stringify(item),
        right: JSON.stringify({ ...item, q: 'Which evidence best justifies changing the navigation?' }),
        domain: 'interaction-design',
        courseGroupId: 'interaction-design-navigation',
        pairSource: { courseInputSha256: '1'.repeat(64) },
        lessonId: 'lesson-1',
      })}\n`,
    );
    const packet = await buildScionBlindReviewPacket({ sources: [source], outputDir, limit: 1 });
    const html = await fs.readFile(
      path.join(outputDir, 'reviewer', 'by-domain', 'interaction-design', 'review.html'),
      'utf8',
    );
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ acceptDownloads: true });
    const networkRequests = [];
    page.on('request', (request) => {
      if (/^https?:/.test(request.url())) networkRequests.push(request.url());
    });
    await page.setContent(html);
    await page.locator('[name="reviewerId"]').fill('ux-instructor-smoke');
    for (const name of ['factualCorrectnessA-0', 'factualCorrectnessB-0', 'teachabilityA-0', 'teachabilityB-0']) {
      await page.locator(`[name="${name}"]`).selectOption('5');
    }
    await page.locator('[name="choice-0"][value="A"]').check();
    await page
      .locator('[name="rationale-0"]')
      .fill('Package A connects repeated task failure to a bounded navigation decision more directly.');
    await page.locator('[name="attestation"]').check();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download completed review JSON' }).click();
    const download = await downloadPromise;
    const downloadedRows = JSON.parse(await fs.readFile(await download.path(), 'utf8'));
    assert.equal(downloadedRows.length, 1);
    assert.equal(downloadedRows[0].courseGroupSha256, packet.cases[0].courseGroupSha256);
    assert.deepEqual(validateScionBlindReview(downloadedRows[0]), []);
    assert.deepEqual(networkRequests, []);
    assert.match(await page.locator('#status').textContent(), /downloaded/i);

    const founderHtml = await fs.readFile(
      path.join(outputDir, 'reviewer', 'by-domain', 'interaction-design', 'founder-review.html'),
      'utf8',
    );
    await page.setContent(founderHtml);
    assert.equal(await page.locator('.case-card:visible').count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Next case' }).isHidden(), true);
    assert.equal(await page.getByRole('button', { name: 'Download completed review JSON' }).isVisible(), true);
    await page.locator('[name="reviewerId"]').fill('founder-smoke');
    for (const name of ['factualCorrectnessA-0', 'factualCorrectnessB-0', 'teachabilityA-0', 'teachabilityB-0']) {
      await page.locator(`[name="${name}"]`).selectOption('5');
    }
    await page.locator('[name="choice-0"][value="B"]').check();
    await page
      .locator('[name="rationale-0"]')
      .fill('Package B states the bounded navigation decision more clearly for this founder research pass.');
    await page.locator('[name="attestation"]').check();
    const founderDownloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download completed review JSON' }).click();
    const founderDownload = await founderDownloadPromise;
    assert.match(founderDownload.suggestedFilename(), /^scion-founder-review-/);
    const founderRows = JSON.parse(await fs.readFile(await founderDownload.path(), 'utf8'));
    assert.equal(founderRows.length, 1);
    assert.deepEqual(validateScionFounderReview(founderRows[0]), []);
    assert.equal(founderRows[0].independent, false);
    assert.equal(founderRows[0].claimEligible, false);
    assert.equal(validateScionBlindReview(founderRows[0]).includes('reviewer-not-working-instructor'), true);
    assert.deepEqual(networkRequests, []);
    assert.match(await page.locator('#status').textContent(), /non-independent/i);
    console.log(
      'Scion reviewer browser smoke passed: instructor and founder exports, honest provenance, and zero network requests.',
    );
  } finally {
    await browser?.close();
    await fs.rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
