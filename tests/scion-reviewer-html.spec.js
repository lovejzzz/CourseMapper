import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import {
  buildScionBlindReviewPacket,
  buildScionReviewerHtml,
  validateScionBlindReview,
  validateScionFounderReview,
} from '../scripts/scionBlindReviewPacket.mjs';

test('offline instructor form exports ingestion-compatible blind review JSON', async ({ page }) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-review-browser-'));
  const source = path.join(root, 'source.jsonl');
  const outputDir = path.join(root, 'packet');
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
  await fs.writeFile(
    source,
    `${JSON.stringify({
      kind: 'mc-item',
      prompt: 'Write one evidence-bearing navigation question.',
      sourceContext: {
        sourcePacketSha256: 'a'.repeat(64),
        kernelId: 'ux/navigation-evidence',
        term: 'Navigation evidence',
        claims: ['Repeated failure on the same labeled task is direct behavioral evidence.'],
        attribution: ['Public teaching source'],
        license: 'CC BY 4.0',
      },
      left: JSON.stringify(item),
      right: JSON.stringify({ ...item, q: 'Which evidence best justifies changing the navigation?' }),
      courseId: 'interaction-design',
      lessonId: 'lesson-1',
    })}\n`,
  );
  try {
    await buildScionBlindReviewPacket({ sources: [source], outputDir, limit: 1 });
    const html = await fs.readFile(
      path.join(outputDir, 'reviewer', 'by-domain', 'interaction-design', 'review.html'),
      'utf8',
    );
    const networkRequests = [];
    page.on('request', (request) => {
      if (/^https?:/.test(request.url())) networkRequests.push(request.url());
    });
    await page.setContent(html);
    await expect(page.getByRole('heading', { name: 'Neutral source claims' })).toBeVisible();
    await expect(
      page.getByText('Repeated failure on the same labeled task is direct behavioral evidence.'),
    ).toBeVisible();
    await expect(page.locator('.source-context li span').first()).toHaveText('1');
    await page.locator('[name="reviewerId"]').fill('ux-instructor-07');
    for (const name of ['factualCorrectnessA-0', 'factualCorrectnessB-0', 'teachabilityA-0', 'teachabilityB-0']) {
      await page.locator(`[name="${name}"]`).selectOption('5');
    }
    await page.locator('[name="choice-0"][value="A"]').check();
    await page
      .locator('[name="rationale-0"]')
      .fill('Package A connects the repeated task failure to a bounded navigation decision more directly.');
    await page.locator('[name="attestation"]').check();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download completed review JSON' }).click(),
    ]);
    expect(download.suggestedFilename()).toContain('scion-review-interaction-design-ux-instructor-07');
    const rows = JSON.parse(await fs.readFile(await download.path(), 'utf8'));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      reviewerId: 'ux-instructor-07',
      reviewerRole: 'working-instructor',
      reviewerDomain: 'interaction-design',
      disciplineFamiliarity: 'teaches-domain',
      independent: true,
      conflictOfInterest: false,
      choice: 'A',
      attestation: true,
    });
    expect(validateScionBlindReview(rows[0])).toEqual([]);
    expect(networkRequests).toEqual([]);

    const founderHtml = await fs.readFile(
      path.join(outputDir, 'reviewer', 'by-domain', 'interaction-design', 'founder-review.html'),
      'utf8',
    );
    await page.setContent(founderHtml);
    await expect(page.getByRole('heading', { name: 'Blind founder review' })).toBeVisible();
    await expect(page.locator('.case-card:visible')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Next case' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Download completed review JSON' })).toBeVisible();
    await page.locator('[name="reviewerId"]').fill('founder-07');
    for (const name of ['factualCorrectnessA-0', 'factualCorrectnessB-0', 'teachabilityA-0', 'teachabilityB-0']) {
      await page.locator(`[name="${name}"]`).selectOption('5');
    }
    await page.locator('[name="choice-0"][value="B"]').check();
    await page
      .locator('[name="rationale-0"]')
      .fill('Package B makes the bounded evidence decision more explicit for this founder research comparison.');
    await page.locator('[name="attestation"]').check();
    const [founderDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download completed review JSON' }).click(),
    ]);
    expect(founderDownload.suggestedFilename()).toContain('scion-founder-review-interaction-design-founder-07');
    const founderRows = JSON.parse(await fs.readFile(await founderDownload.path(), 'utf8'));
    expect(founderRows).toHaveLength(1);
    expect(founderRows[0]).toMatchObject({
      evidenceClass: 'founder-review',
      reviewerId: 'founder-07',
      reviewerRole: 'product-founder',
      reviewerDomain: 'interaction-design',
      disciplineFamiliarity: 'self-declared',
      independent: false,
      conflictOfInterest: true,
      claimEligible: false,
      choice: 'B',
      attestation: true,
    });
    expect(validateScionFounderReview(founderRows[0])).toEqual([]);
    expect(validateScionBlindReview(founderRows[0])).toContain('reviewer-not-working-instructor');
    expect(networkRequests).toEqual([]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('founder reviewer keeps one case visible and lets a flagged case move forward', async ({ page }) => {
  const cases = [0, 1].map((index) => ({
    pairId: `pair-${index}`,
    caseDigest: String(index + 1).repeat(64),
    domain: 'interaction-design',
    courseGroupSha256: 'a'.repeat(64),
    lessonId: `lesson-${index + 1}`,
    kind: 'mc-item',
    prompt: `Judge interaction-design item ${index + 1}.`,
    A: {
      q: `Which observation supports decision A${index + 1}?`,
      op: ['Repeated task failure', 'Color preference', 'Designer preference', 'Logo request'],
      ai: 0,
      ex: 'Repeated task failure is the directly observable evidence.',
    },
    B: {
      q: `Which observation supports decision B${index + 1}?`,
      op: ['Repeated task failure', 'Color preference', 'Designer preference', 'Logo request'],
      ai: 0,
      ex: 'Repeated task failure is the directly observable evidence.',
    },
  }));
  const html = buildScionReviewerHtml({
    meta: { packetId: 'navigation-packet', packetDigest: 'b'.repeat(64) },
    domain: 'interaction-design',
    cases,
    mode: 'founder',
  });
  await page.setContent(html);
  await expect(page.locator('.case-card:visible')).toHaveCount(1);
  await expect(page.locator('[data-case-index="0"]')).toBeVisible();

  await page.getByRole('button', { name: 'Next case' }).click();
  await expect(page.locator('#status')).toContainText('Complete this case or flag it');
  await expect(page.locator('[data-case-index="0"]')).toBeVisible();

  await page.getByRole('button', { name: 'Flag for later' }).click();
  await expect(page.locator('#case-state')).toContainText('flagged');
  await page.getByRole('button', { name: 'Next case' }).click();
  await expect(page.locator('[data-case-index="1"]')).toBeVisible();
  await expect(page.locator('#progress-label')).toHaveText('Case 2 of 2 · 0 complete');
  await expect(page.getByRole('button', { name: 'Download completed review JSON' })).toBeVisible();
});
