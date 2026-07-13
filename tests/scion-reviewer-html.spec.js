import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { buildScionBlindReviewPacket, validateScionBlindReview } from '../scripts/scionBlindReviewPacket.mjs';

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
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
