import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';

import {
  capturePackageRenderAuditV1,
  captureRenderAuditV1,
  verifyPackageRenderAuditV1,
  verifyRenderAuditV1,
} from '../lib/renderAuditV1.mjs';

async function makePage(filePath, { inset = 10, size = 80 } = {}) {
  const overlay = Buffer.from(
    `<svg width="100" height="100"><rect x="${inset}" y="${inset}" width="${size}" height="${size}" fill="#111827"/></svg>`,
  );
  await sharp({ create: { width: 100, height: 100, channels: 3, background: '#ffffff' } })
    .composite([{ input: overlay }])
    .png()
    .toFile(filePath);
}

describe('render-audit-v1', () => {
  let root;

  afterEach(async () => {
    if (root) await fs.rm(root, { recursive: true, force: true });
    root = null;
  });

  async function capture({ sparse = false } = {}) {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'render-audit-v1-'));
    await fs.mkdir(path.join(root, 'renders'));
    await fs.writeFile(path.join(root, 'artifact.docx'), 'test source');
    await makePage(path.join(root, 'renders/page-1.png'), sparse ? { inset: 48, size: 4 } : {});
    const reviewedAt = '2026-08-04T18:00:00.000Z';
    return captureRenderAuditV1({
      root,
      sourcePath: 'artifact.docx',
      renderDirectory: 'renders',
      kind: 'docx',
      inspection: { status: 'complete', reviewerId: 'codex-render-review', reviewedAt, reviewedItemIds: ['page-1'] },
      renderer: { id: 'libreoffice-pdf-poppler', version: 'test-1' },
      replay: { command: 'render artifact.docx', environment: 'test fixture' },
      capturedAt: reviewedAt,
    });
  }

  it('recomputes source, render, occupancy, summary, inspection coverage, and receipt hashes', async () => {
    const receipt = await capture();
    expect(receipt.status).toBe('passed');
    await expect(verifyRenderAuditV1(receipt, { root })).resolves.toMatchObject({ valid: true, passed: true });
  });

  it('fails a sparse unexplained body page instead of laundering it through a score', async () => {
    const receipt = await capture({ sparse: true });
    expect(receipt.status).toBe('failed');
    expect(receipt.summary.lowOccupancyBodyItemIds).toEqual(['page-1']);
    expect(receipt.findings).toEqual([expect.objectContaining({ type: 'low-body-occupancy', itemId: 'page-1' })]);
    expect(receipt.summary.findingCounts['low-body-occupancy']).toBe(1);
  });

  it('detects a changed render after the receipt is captured', async () => {
    const receipt = await capture();
    await makePage(path.join(root, 'renders/page-1.png'), { inset: 20, size: 40 });
    const result = await verifyRenderAuditV1(receipt, { root });
    expect(result.passed).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([expect.stringContaining('hash mismatch')]));
  });

  it('does not call an unreviewed raster pass', async () => {
    const receipt = await capture();
    const unreviewed = await captureRenderAuditV1({
      root,
      sourcePath: 'artifact.docx',
      renderDirectory: 'renders',
      kind: 'docx',
      inspection: { reviewedItemIds: ['page-1'] },
      renderer: { id: 'libreoffice-pdf-poppler', version: 'test-1' },
      replay: { command: 'render artifact.docx', environment: 'test fixture' },
    });
    expect(receipt.status).toBe('passed');
    expect(unreviewed.status).toBe('failed');
  });

  it('rejects invented occupancy-exemption roles', async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'render-audit-role-'));
    await fs.mkdir(path.join(root, 'renders'));
    await fs.writeFile(path.join(root, 'artifact.pptx'), 'test source');
    await makePage(path.join(root, 'renders/slide-1.png'));
    await expect(
      captureRenderAuditV1({
        root,
        sourcePath: 'artifact.pptx',
        renderDirectory: 'renders',
        kind: 'pptx',
        roles: { 'slide-1': 'intentional-blank' },
      }),
    ).rejects.toThrow('Unsupported render role');
  });

  it('permits a reviewed sparse worksheet without weakening document or slide policy', async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'render-audit-sparse-worksheet-'));
    await fs.mkdir(path.join(root, 'renders'));
    await fs.writeFile(path.join(root, 'artifact.xlsx'), 'test source');
    await makePage(path.join(root, 'renders/page-1.png'), { inset: 48, size: 4 });
    const reviewedAt = '2026-08-04T18:00:00.000Z';
    const receipt = await captureRenderAuditV1({
      root,
      sourcePath: 'artifact.xlsx',
      renderDirectory: 'renders',
      kind: 'xlsx',
      roles: { 'page-1': 'sparse-worksheet' },
      inspection: {
        status: 'complete',
        reviewerId: 'codex-render-review',
        reviewedAt,
        reviewedItemIds: ['page-1'],
      },
      renderer: { id: 'libreoffice-pdf-poppler', version: 'test-1' },
      replay: { command: 'render artifact.xlsx', environment: 'test fixture' },
      capturedAt: reviewedAt,
    });
    expect(receipt.status).toBe('passed');
    expect(receipt.items[0]).toMatchObject({ role: 'sparse-worksheet' });
    expect(receipt.summary.lowOccupancyBodyItemIds).toEqual([]);
    await expect(verifyRenderAuditV1(receipt, { root })).resolves.toMatchObject({ valid: true, passed: true });

    await fs.writeFile(path.join(root, 'artifact.docx'), 'test source');
    await expect(
      captureRenderAuditV1({
        root,
        sourcePath: 'artifact.docx',
        renderDirectory: 'renders',
        kind: 'docx',
        roles: { 'page-1': 'sparse-worksheet' },
      }),
    ).rejects.toThrow('Unsupported render role');
  });

  it('aggregates every Office artifact without averaging away a missing receipt', async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'package-render-audit-v1-'));
    await fs.mkdir(path.join(root, 'package/Lesson Plans'), { recursive: true });
    await fs.mkdir(path.join(root, 'renders/docx'), { recursive: true });
    await fs.mkdir(path.join(root, 'renders/pptx'), { recursive: true });
    await fs.mkdir(path.join(root, 'renders/xlsx'), { recursive: true });
    await fs.mkdir(path.join(root, 'receipts'), { recursive: true });
    await fs.writeFile(path.join(root, 'package.zip'), 'package bytes');
    await fs.writeFile(path.join(root, 'package/Lesson Plans/lesson.docx'), 'docx source');
    await fs.writeFile(path.join(root, 'package/Lesson Plans/slides.pptx'), 'pptx source');
    await fs.writeFile(path.join(root, 'package/00_COURSE_MAP.xlsx'), 'xlsx source');
    await makePage(path.join(root, 'renders/docx/page-1.png'));
    await makePage(path.join(root, 'renders/pptx/slide-1.png'));
    await makePage(path.join(root, 'renders/xlsx/page-1.png'));
    const reviewedAt = '2026-08-04T18:00:00.000Z';
    const inspection = (id) => ({
      status: 'complete',
      reviewerId: 'codex-render-review',
      reviewedAt,
      reviewedItemIds: [id],
    });
    const shared = {
      root,
      renderer: { id: 'libreoffice-pdf-poppler', version: 'test-1' },
      replay: { command: 'render package', environment: 'test fixture' },
      capturedAt: reviewedAt,
    };
    const docx = await captureRenderAuditV1({
      ...shared,
      sourcePath: 'package/Lesson Plans/lesson.docx',
      renderDirectory: 'renders/docx',
      kind: 'docx',
      inspection: inspection('page-1'),
    });
    const pptx = await captureRenderAuditV1({
      ...shared,
      sourcePath: 'package/Lesson Plans/slides.pptx',
      renderDirectory: 'renders/pptx',
      kind: 'pptx',
      inspection: inspection('slide-1'),
    });
    const xlsx = await captureRenderAuditV1({
      ...shared,
      sourcePath: 'package/00_COURSE_MAP.xlsx',
      renderDirectory: 'renders/xlsx',
      kind: 'xlsx',
      inspection: inspection('page-1'),
    });
    await fs.writeFile(path.join(root, 'receipts/docx.json'), JSON.stringify(docx));

    const incomplete = await capturePackageRenderAuditV1({
      root,
      packagePath: 'package.zip',
      packageDirectory: 'package',
      receiptDirectory: 'receipts',
      capturedAt: reviewedAt,
    });
    expect(incomplete.status).toBe('failed');
    expect(incomplete.summary.missingArtifacts).toEqual([
      'package/00_COURSE_MAP.xlsx',
      'package/Lesson Plans/slides.pptx',
    ]);

    await fs.writeFile(path.join(root, 'receipts/pptx.json'), JSON.stringify(pptx));
    await fs.writeFile(path.join(root, 'receipts/xlsx.json'), JSON.stringify(xlsx));
    const complete = await capturePackageRenderAuditV1({
      root,
      packagePath: 'package.zip',
      packageDirectory: 'package',
      receiptDirectory: 'receipts',
      capturedAt: reviewedAt,
    });
    expect(complete.status).toBe('passed');
    await expect(verifyPackageRenderAuditV1(complete, { root })).resolves.toMatchObject({
      valid: true,
      passed: true,
      artifactCount: 3,
    });
  });
});
