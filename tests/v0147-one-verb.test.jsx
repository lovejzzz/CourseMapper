/**
 * @vitest-environment happy-dom
 *
 * v0.14.7 WS-F — one verb, one decision.
 *
 * F1 — PrimaryCta, the morphing header CTA: pipeline running → "Building…"
 *      (disabled, spinner); ready with reviews outstanding → "Review N"
 *      (indigo, opens the queue); ready and downloadable → nothing, because
 *      Download ZIP belongs only to the export panel. Project/file actions stay in the
 *      workspace disclosure; package actions stay with export/agent surfaces.
 *
 * F2 — quick start on the landing prompt box: "Generate full course",
 *      visible only with a non-empty prompt AND a stored API key; AppFlow's
 *      handleQuickStart mirrors FeatureSelect's select-all and calls the SAME
 *      onGenerate path the Config screen uses.
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import PrimaryCta from '../src/components/PrimaryCta.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

function render(element) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return {
    container,
    rerender: (next) =>
      act(() => {
        root.render(next);
      }),
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

let mounted = [];
afterEach(() => {
  mounted.forEach((m) => m.unmount());
  mounted = [];
});

function mount(element) {
  const m = render(element);
  mounted.push(m);
  return m;
}

const READY_MODEL = { stage: 'ready', running: false };
const RUNNING_MODEL = { stage: 'compile', running: true };

describe('F1 — the morphing CTA state matrix', () => {
  it('pipeline running → "Building…", disabled, with the house spinner', () => {
    const { container } = mount(<PrimaryCta ribbonModel={RUNNING_MODEL} reviewCount={0} canDownload={false} />);
    const cta = container.querySelector('[data-testid="primary-cta"]');
    expect(cta).not.toBeNull();
    expect(cta.textContent).toContain('Building…');
    expect(cta.disabled).toBe(true);
    expect(cta.querySelector('.animate-spin')).not.toBeNull();
  });

  it('ready + reviews outstanding + not downloadable → "Review N" (indigo interactive), click opens the queue', () => {
    const onReview = vi.fn();
    const { container } = mount(
      <PrimaryCta ribbonModel={READY_MODEL} reviewCount={3} canDownload={false} onReview={onReview} />,
    );
    const cta = container.querySelector('[data-testid="primary-cta"]');
    expect(cta.textContent).toContain('Review 3');
    expect(cta.className).toContain('indigo');
    act(() => {
      cta.click();
    });
    expect(onReview).toHaveBeenCalledTimes(1);
  });

  it('ready + downloadable package → no duplicate header ZIP action', () => {
    const { container } = mount(<PrimaryCta ribbonModel={READY_MODEL} reviewCount={3} canDownload />);
    expect(container.querySelector('[data-testid="primary-cta"]')).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('no package yet / blocked → renders nothing (null model, non-ready stage, ready-but-blocked)', () => {
    const idle = mount(<PrimaryCta ribbonModel={null} reviewCount={0} canDownload={false} />);
    expect(idle.container.querySelector('[data-testid="primary-cta"]')).toBeNull();
    expect(idle.container.textContent).toBe('');

    const lull = mount(<PrimaryCta ribbonModel={{ stage: 'compile', running: false }} reviewCount={5} canDownload />);
    expect(lull.container.querySelector('[data-testid="primary-cta"]')).toBeNull();

    const blocked = mount(<PrimaryCta ribbonModel={READY_MODEL} reviewCount={0} canDownload={false} />);
    expect(blocked.container.querySelector('[data-testid="primary-cta"]')).toBeNull();
  });
});

describe('F1 — ONE disclosure: the workspace Project menu stays project-only', () => {
  it('PrimaryCta carries NO menu of its own (two "More" buttons was the live feedback that killed it)', () => {
    const { container } = mount(<PrimaryCta ribbonModel={READY_MODEL} reviewCount={0} canDownload />);
    expect(container.querySelector('[data-testid="primary-cta-more"]')).toBeNull();
    expect(container.querySelector('[data-testid="primary-cta-menu"]')).toBeNull();
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });

  it('the workspace Project menu hosts file/project actions, not package or editing actions', () => {
    const appFlow = read('src/AppFlow.jsx');
    const menuStart = appFlow.indexOf('workspace-more-menu-trigger');
    expect(menuStart).toBeGreaterThan(-1);
    const menu = appFlow.slice(menuStart, menuStart + 4000);
    expect(menu).toContain('Project');
    expect(menu).toContain('data-testid="workspace-menu-save-project"');
    expect(menu).toContain('data-testid="workspace-menu-new-project"');
    expect(menu).toContain('onClick={handleSaveProject}');
    expect(menu).not.toContain('data-testid="workspace-finish-package"');
    expect(menu).not.toContain('data-testid="workspace-menu-add-materials"');
    expect(menu).not.toContain('version.undo');
    expect(menu).not.toContain('version.redo');
    // And it is the ONLY disclosure in the header.
    expect(appFlow).not.toContain('primary-cta-more');
  });
});

describe('F1/F2 — source wiring (the header has ONE verb; the paths exist)', () => {
  it('AppFlow renders PrimaryCta and no longer renders the Finish package button at header top level', () => {
    const appFlow = read('src/AppFlow.jsx');
    expect(appFlow).toContain('<PrimaryCta');
    // The standalone header/menu finish button is gone; package checks live in
    // the export/agent surfaces and the header CTA stays one verb.
    expect(read('src/components/PrimaryCta.jsx')).not.toContain('workspace-finish-package');
    expect(appFlow).not.toContain('data-testid="workspace-finish-package"');
    // Download has one owner: the export panel.
    expect(appFlow).not.toContain("new CustomEvent('coursemapper:request-zip-download')");
    // v0.14.9 B1: the CTA shows the HEADLINE count — outstanding judgment
    // items (sync + observations + structural), never the spot-check tally.
    expect(appFlow).toContain('reviewCount={outstandingReview.counts.headline}');
    expect(appFlow).toContain('onReview={() => handleReviewQueueOpenChange(true)}');
  });

  it('ExportSidePanel is the single ZIP owner and keeps its export guards', () => {
    const panel = read('src/components/ExportSidePanel.jsx');
    expect(panel).not.toContain('coursemapper:request-zip-download');
    expect(panel).toContain('const zipDownloadDisabled =');
    expect(panel).toContain('disabled={zipDownloadDisabled}');
    // The package export must download the same source-proof package the finish
    // grade saw; dropping courseGraph makes SOURCE_REPORT.md disappear.
    expect(read('src/AppFlow.jsx')).toContain('courseGraph={courseGraph}');
    expect(read('src/AppFlow.jsx')).toContain('courseGraph: courseGraphRef.current || null');
    expect(panel).toContain('courseGraph = null');
    expect(panel).toContain('let exportCourseGraph = courseGraph');
    expect(panel).toContain('exportCourseGraph = finishResult.courseGraph || exportCourseGraph');
    expect(panel).toContain('courseGraph: exportCourseGraph');
  });

  it('Landing carries the quick-start affordance, gated on prompt + stored API key', () => {
    const landing = read('src/screens/Landing.jsx');
    expect(landing).toContain('Generate full course');
    expect(landing).toContain('Use current sources & generate');
    expect(landing).toContain('data-testid="landing-setup-button"');
    expect(landing).toContain('data-testid="landing-quick-start"');
    expect(landing).toContain(
      // V2.1 keyless providers: quick start stays gated on prompt +
      // provider readiness, not a typed API key.
      "(providerIsKeyless ? apiStatus === 'connected' : Boolean(apiKey?.trim()))",
    );
    // A zero-download route with forecast source gaps makes the data boundary
    // the primary CTA itself. The click persists that explicit choice before
    // AppFlow starts, so the default full-course path cannot strand the user at
    // 99% with template-only lesson kernels.
    expect(landing).toContain('quickStartNeedsCurrentSources');
    expect(landing).toContain('saveScionResearchEnabled(true)');
    expect(landing).toContain('onClick={handleQuickStartClick}');
    expect(landing).toContain('send only the course title');
    // The deliberate three-screen path stays — relabeled, not removed.
    expect(landing).toContain("canQuickStart ? 'Customize package' : 'Continue to materials'");
    expect(landing).toContain('onClick={onGenerate}');
  });

  it('AppFlow quick start mirrors select-all and calls the SAME generate path as Config', () => {
    const appFlow = read('src/AppFlow.jsx');
    expect(appFlow).toContain('function handleQuickStart()');
    expect(appFlow).toContain('onQuickStart={handleQuickStart}');
    // Select-all mirror: built-ins (minus syllabus with a syllabus file) + customs.
    expect(appFlow).toMatch(/hasSyllabusFile \? FEATURES\.filter\(\(f\) => f\.id !== 'syllabus'\) : FEATURES/);
    expect(appFlow).toContain('listCustomDeliverables().map(toFeatureEntry)');
    // No duplicated generation logic — the pending flag hands off to onGenerate().
    expect(appFlow).toContain('if (!quickStartPending) return;');
    expect(appFlow.match(/^\s*onGenerate\(\);$/gm)?.length).toBe(1);
  });
});
