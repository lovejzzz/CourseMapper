/**
 * @vitest-environment happy-dom
 *
 * v0.14.9 Lane 2 — CALM: the two-number Seal (B2), the calmer crown (B3),
 * the word-break fix (B4), and the collapsed lesson scope (B5).
 *
 * B1 (one review count) lives in v0149-one-count.test.jsx.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import WorkspaceQualityChip from '../src/components/WorkspaceQualityChip.jsx';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

const GRADED_WITH_TEXTURE = {
  status: 'ready',
  quality: {
    status: 'graded',
    score: 100,
    grade: 'A',
    findingCounts: { p0: 0, p1: 0, p2: 0 },
    texture: { score: 74, subScores: { sameness: 70, openers: 78, tails: 74 } },
  },
};

describe('B2 — the two-number Seal', () => {
  it('renders Quality and Texture side by side, texture in slate', () => {
    const html = renderToStaticMarkup(
      <WorkspaceQualityChip packageQualityPass={GRADED_WITH_TEXTURE} onOpenReport={() => {}} />,
    );
    expect(html).toContain('Quality 100');
    expect(html).toContain('· Texture 74');
    expect(html).toContain('data-testid="workspace-texture-meter"');
    // The meter is slate — never the chip's emerald/amber health tone.
    expect(html).toContain('text-slate-500');
    // Score-bearing framing reaches the tooltip and the accessible name.
    expect(html).toContain('counted lightly in the grade');
    expect(html).not.toContain('ADVISORY');
    expect(html).not.toContain('weight 0 in the grade');
  });

  it('texture never hides a P0 blocker — a critical package turns red with its meter', () => {
    const blocked = renderToStaticMarkup(
      <WorkspaceQualityChip
        packageQualityPass={{
          status: 'ready',
          quality: {
            status: 'graded',
            score: 81,
            grade: 'B',
            findingCounts: { p0: 1, p1: 0, p2: 0 },
            texture: { score: 90, subScores: {} },
          },
        }}
        onOpenReport={() => {}}
      />,
    );
    expect(blocked).toContain('border-red-200');
    expect(blocked).toContain('Quality refinement');
    expect(blocked).toContain('including 1 critical');
    expect(blocked).toContain('· Texture 90');
  });

  it('falls back to the one-number chip when the grade carries no texture block', () => {
    const html = renderToStaticMarkup(
      <WorkspaceQualityChip
        packageQualityPass={{
          status: 'ready',
          quality: { status: 'graded', score: 100, grade: 'A', findingCounts: { p0: 0 } },
        }}
        onOpenReport={() => {}}
      />,
    );
    expect(html).toContain('Quality 100 · A');
    expect(html).not.toContain('workspace-texture-meter');
  });

  it('the texture block flows from the grader through the finalize gate and the manifest', () => {
    const gate = read('src/lib/quality/finalizeQualityGate.js');
    expect(gate).toContain('texture: result.qualityResult?.texture');
    const zipExporter = read('src/lib/packageZipExporter.js');
    expect(zipExporter).toContain('qualityResult.texture');
    // The report modal renders the row with sub-scores and worst evidence.
    const panel = read('src/components/ExportSidePanel.jsx');
    expect(panel).toContain('quality-texture-row');
    expect(panel).toContain("['sameness', 'openers', 'tails']");
    expect(panel).toContain('style and repetition, counted lightly');
    expect(panel).not.toContain('headerOwnsZipCta');
  });
});

describe('B3 — the calmer crown', () => {
  it('the standalone utility row between ribbon and tab bar is gone', () => {
    const appFlow = read('src/AppFlow.jsx');
    // The old row's container class combo must not return.
    expect(appFlow).not.toContain('gap-2 mb-1 min-h-9');
    // The dependency-map control exists exactly once — inside the tab bar.
    expect(appFlow.match(/Open dependency map/g)).toHaveLength(1);
    // The drag-trash zone floats fixed during drag instead of reserving a row.
    expect(appFlow).toContain('fixed left-1/2 top-4');
  });

  it('the trust strip carries alerts only — receipts left the crown', () => {
    const strip = read('src/components/PackageTrustStrip.jsx');
    expect(strip).not.toContain('trust-chip-compiled');
    expect(strip).not.toContain('trust-chip-custom');
    expect(strip).not.toContain('trust-chip-repairs');
    expect(strip).not.toContain('trust-chip-cited');
    expect(strip).toContain('trust-chip-stale');
    expect(strip).toContain('trust-chip-failed');
  });
});

describe('B4 — no more mid-word breaks in map cells', () => {
  it('map cells wrap at word boundaries with hyphenation, never anywhere', () => {
    const preview = read('src/components/CourseMapPreview.jssx'.replace('jssx', 'jsx'));
    expect(preview).not.toContain("overflowWrap: 'anywhere'");
    expect(preview.match(/overflowWrap: 'break-word', hyphens: 'auto'/g)?.length || 0).toBeGreaterThanOrEqual(4);
  });

  it('the chunk-load reload-once latch is in place (shipped earlier, pinned here)', () => {
    const boundary = read('src/components/ErrorBoundary.jsx');
    expect(boundary).toContain('coursemapper:chunk-reload:');
    expect(boundary).toContain('hasTriedChunkReload');
    expect(boundary).toContain('window.location.reload()');
  });
});

describe('B5 — lesson scope collapses to one line', () => {
  it('the panel shows "All N lessons · Edit" by default and the wall only while editing or partial', () => {
    const panel = read('src/components/ExportSidePanel.jsx');
    expect(panel).toContain('lesson-scope-collapsed');
    expect(panel).toContain('lesson-scope-edit');
    expect(panel).toContain('lesson-scope-done');
    expect(panel).toContain('allSelected && !editingLessonScope');
    expect(panel).toContain('(!allSelected || editingLessonScope)');
    expect(panel).toContain("allLessons.length === 1 ? '1 lesson' : `All ${allLessons.length} lessons`");
  });
});
