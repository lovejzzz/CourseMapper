/**
 * @vitest-environment happy-dom
 *
 * v0.15.7 - Finished Package Surface: the package summary is available as a
 * compact handoff component, but it must not replace the Course Map tab.
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
  it('renders a compact finished-package summary without taking over export', () => {
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

  it('keeps the Course Map tab as the centered preview even when the package is ready', () => {
    const appFlow = read('src/AppFlow.jsx');

    expect(appFlow).not.toContain('showFinishedPackageOverview');
    expect(appFlow).not.toContain('courseMapDetailOpen');
    expect(appFlow).not.toContain('FinishedPackageOverview');
    expect(appFlow).toContain('ribbonModel={buildRibbonModel}');
    expect(appFlow).toContain("activeTab === 'courseMap'");
    expect(appFlow).toContain('<CourseMapPreview');
    expect(appFlow).toContain('coursemapper:request-zip-download');

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

  it('keeps compact ready mode conversational instead of replacing the chat with a receipt', () => {
    const chatPanel = read('src/components/chat/ChatPanel.jsx');
    const messageList = read('src/components/chat/MessageList.jsx');

    expect(chatPanel).toContain('compactReadyMode = false');
    expect(chatPanel).toContain('const compactReady = Boolean');
    expect(chatPanel).toContain('return packageReceiptMessage && !alreadyRendered');
    expect(chatPanel).toContain('landingContextDetail && (');
    expect(chatPanel).toContain('quietReadyMode={false}');
    expect(chatPanel).not.toContain('quietReadyMode={compactReady}');
    expect(chatPanel).not.toContain('return messagesWithReceipt.filter');

    expect(messageList).toContain('quietReadyMode = false');
    expect(messageList).toContain('{!quietReadyMode && (');
  });
});
