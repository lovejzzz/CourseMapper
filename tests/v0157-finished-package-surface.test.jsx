/**
 * @vitest-environment happy-dom
 *
 * v0.15.7 - Finished Package Surface: a ready workspace opens as a handoff,
 * not another audit table.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import FinishedPackageOverview from '../src/components/FinishedPackageOverview.jsx';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

const READY_PASS = {
  status: 'ready',
  blockers: 0,
  warnings: 0,
  repairsApplied: 2,
  receipt: {
    exportChecked: 10,
    autoFixedCount: 2,
  },
  quality: {
    status: 'graded',
    score: 100,
    grade: 'A',
    texture: { score: 89 },
  },
};

const COURSE_MAP = {
  courseName: 'Human Anatomy and Physiology I',
  lessons: [
    { id: '1', section: '1', topic: 'Homeostasis' },
    { id: '2', section: '2', topic: 'Tissue types' },
  ],
};

describe('v0.15.7 finished package surface', () => {
  it('renders a finished-package handoff instead of the dense course-map preview', () => {
    const html = renderToStaticMarkup(
      <FinishedPackageOverview
        courseMap={COURSE_MAP}
        selectedFeatures={['courseMap', 'syllabus', 'lessonPlans', 'slideDecks']}
        deliverables={{
          syllabus: { status: 'done', data: { title: 'Syllabus' } },
          lessonPlans: { status: 'done', data: [{ lesson: 1 }, { lesson: 2 }] },
          slideDecks: { status: 'done', data: [{ lesson: 1 }, { lesson: 2 }] },
        }}
        packageQualityPass={READY_PASS}
        onEditCourseMap={() => {}}
        onOpenFeature={() => {}}
        onOpenQualityReport={() => {}}
      />,
    );

    expect(html).toContain('data-testid="finished-package-overview"');
    expect(html).toContain('Finished package');
    expect(html).toContain('2 lessons');
    expect(html).toContain('4/4 materials ready');
    expect(html).toContain('Quality 100');
    expect(html).toContain('Texture 89');
    expect(html).toContain('2 safe repairs');
    expect(html).toContain('10 exports checked');
    expect(html).not.toContain('data-testid="finished-overview-download-zip"');
    expect(html).not.toContain('Download ZIP');
    expect(html).toContain('data-testid="finished-overview-edit-map"');
    expect(html).toContain('data-testid="finished-overview-material"');
    expect(html).not.toContain('Course Map Preview');
  });

  it('keeps the dense course map and artifact tabs one click away', () => {
    const appFlow = read('src/AppFlow.jsx');

    expect(appFlow).toContain('showFinishedPackageOverview');
    expect(appFlow).toContain('courseMapDetailOpen');
    expect(appFlow).toContain('ribbonModel={showFinishedPackageOverview ? null : buildRibbonModel}');
    expect(appFlow).toContain('onEditCourseMap={setCourseMapDetailOpen}');
    expect(appFlow).toContain('coursemapper:request-zip-download');
    expect(appFlow).toContain('onOpenFeature={setActiveTab}');

    const exportPanel = read('src/components/ExportSidePanel.jsx');
    expect(exportPanel).toContain('const headerOwnsZipCta = false');
    expect(exportPanel).toContain('data-testid="export-download-zip"');

    const overview = read('src/components/FinishedPackageOverview.jsx');
    expect(overview).not.toContain('finished-overview-download-zip');
    expect(overview).toContain('onEditCourseMap?.(true)');
    expect(overview).toContain("row.id === 'courseMap' ? onEditCourseMap?.(true) : onOpenFeature?.(row.id)");

    const browserHarness = read('scripts/liveBrowserQualityLoop.mjs');
    expect(browserHarness).toContain("page.getByTestId('export-download-zip')");
    expect(browserHarness).not.toContain("page.getByTestId('finished-overview-download-zip')");
  });

  it('uses compact ready mode so the agent column becomes a receipt, not a second queue', () => {
    const chatPanel = read('src/components/chat/ChatPanel.jsx');
    const messageList = read('src/components/chat/MessageList.jsx');

    expect(chatPanel).toContain('compactReadyMode = false');
    expect(chatPanel).toContain('const compactReady = Boolean');
    expect(chatPanel).toContain('!compactReady && (');
    expect(chatPanel).toContain('quietReadyMode={compactReady}');
    expect(chatPanel).toContain("message?.role === 'packageSummary'");

    expect(messageList).toContain('quietReadyMode = false');
    expect(messageList).toContain('{!quietReadyMode && (');
  });
});
